import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import type { PackageResolver, ModuleEntry } from '../resolver'
import {
  calculateChecksum,
  readChecksumRecord,
  writeChecksumRecord,
  ensureDir,
  toVar,
  toSnake,
  rimrafDir,
  logGenerationResult,
  type GeneratorResult,
  createGeneratorResult,
} from '../utils'

type GroupKey = '@app' | '@open-mercato/core' | string
type EntityFieldMap = Record<string, string[]>

export interface EntityIdsOptions {
  resolver: PackageResolver
  quiet?: boolean
}

/**
 * Extract exported class names from a TypeScript source or compiled JS file.
 *
 * Handles two formats:
 * - TS source: `export class Foo { ... }`
 * - Compiled JS (esbuild): `let Foo = class { ... }; export { Foo, Bar }`
 */
function parseExportedClassNamesFromFile(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf8')
  const isJs = filePath.endsWith('.js')
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.ES2020, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  const classNames: string[] = []

  // Track class-like variable declarations for compiled JS: `let Foo = class { ... }`
  const classVarNames = new Set<string>()
  // Track names in `export { Foo, Bar }` declarations
  const namedExports = new Set<string>()

  sf.forEachChild((node) => {
    // TS source: `export class Foo { ... }`
    if (ts.isClassDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      )
      if (hasExport) {
        classNames.push(node.name.text)
      }
    }

    // Compiled JS: `let Foo = class { ... }`
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isClassExpression(decl.initializer)) {
          classVarNames.add(decl.name.text)
        }
      }
    }

    // Compiled JS: `export { Foo, Bar }`
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        namedExports.add(el.name.text)
      }
    }
  })

  // Merge: always include exported class variable names (handles compiled JS and mixed files)
  for (const name of classVarNames) {
    if (namedExports.has(name) && !classNames.includes(name)) {
      classNames.push(name)
    }
  }

  return classNames
}

function parseEntityFieldsFromFile(filePath: string, exportedClassNames: string[]): EntityFieldMap {
  const src = fs.readFileSync(filePath, 'utf8')
  const isJs = filePath.endsWith('.js')
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.ES2020, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS)

  const exported = new Set(exportedClassNames)
  const result: EntityFieldMap = {}

  function getDecoratorArgNameLiteral(dec: ts.Decorator | undefined): string | undefined {
    if (!dec) return undefined
    const expr = dec.expression
    if (!ts.isCallExpression(expr)) return undefined
    if (!expr.arguments.length) return undefined
    const first = expr.arguments[0]
    if (!ts.isObjectLiteralExpression(first)) return undefined
    for (const prop of first.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'name') {
        if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text
      }
    }
    return undefined
  }

  function normalizeDbName(propertyName: string, nameOverride?: string): string {
    if (nameOverride) return nameOverride
    return toSnake(propertyName)
  }

  // TS source: parse class declarations with decorated properties
  sf.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return
    const clsName = node.name.text
    if (!exported.has(clsName)) return
    const entityKey = toSnake(clsName)
    const fields: string[] = []

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !member.name) continue
      const name = ts.isIdentifier(member.name)
        ? member.name.text
        : ts.isStringLiteral(member.name)
          ? member.name.text
          : undefined
      if (!name) continue
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue
      const decorators = ts.canHaveDecorators(member)
        ? ts.getDecorators(member) ?? []
        : []
      let dbName: string | undefined
      if (decorators && decorators.length) {
        for (const d of decorators) {
          const nameOverride = getDecoratorArgNameLiteral(d)
          dbName = normalizeDbName(name, nameOverride)
          if (dbName) break
        }
      }
      if (!dbName) dbName = normalizeDbName(name)
      fields.push(dbName)
    }
    result[entityKey] = Array.from(new Set(fields))
  })

  // Compiled JS fallback: parse __decorateClass calls
  // Pattern: __decorateClass([Property({ name: 'col_name' })], ClassName.prototype, "propName", 2)
  if (Object.keys(result).length === 0 && exported.size > 0) {
    const fieldsByClass: Record<string, string[]> = {}
    sf.forEachChild((node) => {
      if (!ts.isExpressionStatement(node)) return
      const expr = node.expression
      // Match: __decorateClass([...], ClassName.prototype, "propName", ...)
      // or: ClassName = __decorateClass([...], ClassName) (class-level decorator, skip)
      if (!ts.isCallExpression(expr)) return
      const callee = expr.expression
      if (!ts.isIdentifier(callee) || callee.text !== '__decorateClass') return
      if (expr.arguments.length < 3) return
      const target = expr.arguments[1]
      // Property decorator: __decorateClass([...], Cls.prototype, "prop", 2)
      if (!ts.isPropertyAccessExpression(target)) return
      if (!ts.isIdentifier(target.name) || target.name.text !== 'prototype') return
      if (!ts.isIdentifier(target.expression)) return
      const className = target.expression.text
      if (!exported.has(className)) return
      const propArg = expr.arguments[2]
      if (!ts.isStringLiteral(propArg)) return
      const propName = propArg.text
      // Extract name override from decorator args: Property({ name: 'col_name' })
      const decoratorArray = expr.arguments[0]
      let nameOverride: string | undefined
      if (ts.isArrayLiteralExpression(decoratorArray)) {
        for (const el of decoratorArray.elements) {
          if (nameOverride) break
          if (ts.isCallExpression(el) && el.arguments.length > 0) {
            const arg = el.arguments[0]
            if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'name') {
                  if (ts.isStringLiteral(prop.initializer)) nameOverride = prop.initializer.text
                }
              }
            }
          }
        }
      }
      const dbName = normalizeDbName(propName, nameOverride)
      fieldsByClass[className] = fieldsByClass[className] || []
      fieldsByClass[className].push(dbName)
    })
    for (const [className, fields] of Object.entries(fieldsByClass)) {
      const entityKey = toSnake(className)
      result[entityKey] = Array.from(new Set(fields))
    }
  }

  return result
}

/**
 * Write entity field files, skipping unchanged files to avoid triggering Turbopack recompilation.
 * Returns the set of desired entity names for later cleanup.
 */
function writeEntityFieldFiles(outRoot: string, fieldsByEntity: EntityFieldMap): Set<string> {
  fs.mkdirSync(outRoot, { recursive: true })
  const desiredEntities = new Set(Object.keys(fieldsByEntity))
  for (const [entity, fields] of Object.entries(fieldsByEntity)) {
    const entDir = path.join(outRoot, entity)
    fs.mkdirSync(entDir, { recursive: true })
    const content = fields.map((f) => `export const ${toVar(f)} = '${f}'`).join('\n') + '\n'
    const filePath = path.join(entDir, 'index.ts')
    let existing: string | null = null
    try { existing = fs.readFileSync(filePath, 'utf8') } catch {}
    if (existing !== content) {
      fs.writeFileSync(filePath, content)
    }
  }
  return desiredEntities
}

/**
 * Remove entity directories that are no longer needed.
 * MUST be called AFTER writeEntityFieldsRegistry to avoid Turbopack resolving
 * a stale registry against deleted directories.
 */
function cleanupStaleEntityDirs(outRoot: string, desiredEntities: Set<string>): void {
  const existingEntries = fs.existsSync(outRoot) ? fs.readdirSync(outRoot, { withFileTypes: true }) : []
  for (const entry of existingEntries) {
    if (!entry.isDirectory()) continue
    if (desiredEntities.has(entry.name)) continue
    rimrafDir(path.join(outRoot, entry.name))
  }
}

/**
 * Write the entity-fields-registry.ts file, skipping if content hasn't changed.
 */
function writeEntityFieldsRegistry(generatedRoot: string, fieldsByEntity: EntityFieldMap): void {
  const entities = Object.keys(fieldsByEntity).sort((a, b) => a.localeCompare(b))

  const imports = entities.length > 0
    ? entities.map((e) => `import * as ${toVar(e)} from './entities/${e}/index'`).join('\n')
    : ''
  const registryEntries = entities.length > 0
    ? entities.map((e) => `  ${toVar(e)}`).join(',\n')
    : ''

  const src = `// AUTO-GENERATED by mercato generate entity-ids
// Static registry for entity fields - eliminates dynamic imports for Turbopack compatibility
${imports}

export const entityFieldsRegistry: Record<string, Record<string, string>> = {
${registryEntries}
}

export function getEntityFields(slug: string): Record<string, string> | undefined {
  return entityFieldsRegistry[slug]
}
`
  const outPath = path.join(generatedRoot, 'entity-fields-registry.ts')
  ensureDir(outPath)
  let existing: string | null = null
  try { existing = fs.readFileSync(outPath, 'utf8') } catch {}
  if (existing !== src) {
    fs.writeFileSync(outPath, src)
  }
}

export async function generateEntityIds(options: EntityIdsOptions): Promise<GeneratorResult> {
  const { resolver, quiet = false } = options
  const result = createGeneratorResult()

  const outputDir = resolver.getOutputDir()
  const outFile = path.join(outputDir, 'entities.ids.generated.ts')
  const checksumFile = path.join(outputDir, 'entities.ids.generated.checksum')

  const entries = resolver.loadEnabledModules()

  const consolidated: Record<string, Record<string, string>> = {}
  const grouped: Record<GroupKey, Record<string, Record<string, string>>> = {}
  const modulesDict: Record<string, string> = {}
  const groupedModulesDict: Record<GroupKey, Record<string, string>> = {}

  const fieldsByGroup: Record<GroupKey, Record<string, EntityFieldMap>> = {}

  for (const entry of entries) {
    const modId = entry.id
    const roots = resolver.getModulePaths(entry)
    const imps = resolver.getModuleImportBase(entry)
    const group: GroupKey = (entry.from as GroupKey) || '@open-mercato/core'

    // Locate entities definition file (prefer app override)
    const appData = path.join(roots.appBase, 'data')
    const pkgData = path.join(roots.pkgBase, 'data')
    const appDb = path.join(roots.appBase, 'db')
    const pkgDb = path.join(roots.pkgBase, 'db')
    const bases = [appData, pkgData, appDb, pkgDb]
    const candidates = ['entities.override.ts', 'entities.ts', 'schema.ts', 'entities.override.js', 'entities.js', 'schema.js']
    let importPath: string | null = null
    let filePath: string | null = null

    for (const base of bases) {
      for (const f of candidates) {
        const p = path.join(base, f)
        if (fs.existsSync(p)) {
          const fromApp = base.startsWith(roots.appBase)
          const sub = path.basename(base) // 'data' | 'db'
          importPath = `${fromApp ? imps.appBase : imps.pkgBase}/${sub}/${f.replace(/\.(ts|js)$/, '')}`
          filePath = p
          break
        }
      }
      if (importPath) break
    }

    // No entities file found -> still register module id
    if (!filePath) {
      modulesDict[modId] = modId
      groupedModulesDict[group] = groupedModulesDict[group] || {}
      groupedModulesDict[group][modId] = modId
      continue
    }

    // Get exported class names by parsing TypeScript source directly
    // Since we always read from src/, we can parse TypeScript files
    const exportNames = parseExportedClassNamesFromFile(filePath)

    const entityNames = exportNames
      .map((k) => toSnake(k))
      .filter((k, idx, arr) => arr.indexOf(k) === idx)

    // Build dictionaries
    modulesDict[modId] = modId
    groupedModulesDict[group] = groupedModulesDict[group] || {}
    groupedModulesDict[group][modId] = modId

    consolidated[modId] = consolidated[modId] || {}
    grouped[group] = grouped[group] || {}
    grouped[group][modId] = grouped[group][modId] || {}

    for (const en of entityNames) {
      consolidated[modId][en] = `${modId}:${en}`
      grouped[group][modId][en] = `${modId}:${en}`
    }

    // Parse entity fields from TypeScript source
    const entityFieldMap = parseEntityFieldsFromFile(filePath, exportNames)
    fieldsByGroup[group] = fieldsByGroup[group] || {}
    fieldsByGroup[group][modId] = entityFieldMap
  }

  // Write consolidated output
  const consolidatedSrc = `// AUTO-GENERATED by mercato generate entity-ids
export const M = ${JSON.stringify(modulesDict, null, 2)} as const
export const E = ${JSON.stringify(consolidated, null, 2)} as const
export type KnownModuleId = keyof typeof M
export type KnownEntities = typeof E
`

  // Check if content has changed
  const newChecksum = calculateChecksum(consolidatedSrc)
  let shouldWrite = true

  const existingRecord = readChecksumRecord(checksumFile)
  if (existingRecord && existingRecord.content === newChecksum) {
    shouldWrite = false
  }

  if (shouldWrite) {
    ensureDir(outFile)
    fs.writeFileSync(outFile, consolidatedSrc)
    writeChecksumRecord(checksumFile, { content: newChecksum, structure: '' })
    result.filesWritten.push(outFile)
    if (!quiet) {
      logGenerationResult(path.relative(process.cwd(), outFile), true)
    }
  } else {
    result.filesUnchanged.push(outFile)
  }

  // Write per-group outputs
  const groups = Object.keys(grouped) as GroupKey[]
  for (const g of groups) {
    const pkgOutputDir = resolver.getPackageOutputDir(g)
    // Skip @app group since it writes to the same location as the consolidated output
    if (g === '@app' && pkgOutputDir === outputDir) {
      continue
    }
    const out = path.join(pkgOutputDir, 'entities.ids.generated.ts')

    const src = `// AUTO-GENERATED by mercato generate entity-ids
export const M = ${JSON.stringify(groupedModulesDict[g] || {}, null, 2)} as const
export const E = ${JSON.stringify(grouped[g] || {}, null, 2)} as const
export type KnownModuleId = keyof typeof M
export type KnownEntities = typeof E
`
    ensureDir(out)
    let existingGroupSrc: string | null = null
    try { existingGroupSrc = fs.readFileSync(out, 'utf8') } catch {}
    if (existingGroupSrc !== src) {
      fs.writeFileSync(out, src)
      result.filesWritten.push(out)
    } else {
      result.filesUnchanged.push(out)
    }

    const fieldsRoot = path.join(pkgOutputDir, 'entities')
    const fieldsByModule = fieldsByGroup[g] || {}
    const combined: EntityFieldMap = {}
    for (const mId of Object.keys(fieldsByModule)) {
      const mMap = fieldsByModule[mId]
      for (const [entity, fields] of Object.entries(mMap)) {
        combined[entity] = Array.from(new Set([...(combined[entity] || []), ...fields]))
      }
    }
    // Write order matters: dirs first, then registry, then cleanup stale dirs.
    // This prevents Turbopack from resolving a stale registry against deleted directories.
    const desiredGroupEntities = writeEntityFieldFiles(fieldsRoot, combined)
    writeEntityFieldsRegistry(pkgOutputDir, combined)
    cleanupStaleEntityDirs(fieldsRoot, desiredGroupEntities)
  }

  // Write combined entity fields to root generated/ folder
  const combinedAll: EntityFieldMap = {}
  for (const groupFields of Object.values(fieldsByGroup)) {
    for (const mMap of Object.values(groupFields)) {
      for (const [entity, fields] of Object.entries(mMap)) {
        combinedAll[entity] = Array.from(new Set([...(combinedAll[entity] || []), ...fields]))
      }
    }
  }
  // Write order matters: dirs first, then registry, then cleanup stale dirs.
  const entitiesRoot = path.join(outputDir, 'entities')
  const desiredAllEntities = writeEntityFieldFiles(entitiesRoot, combinedAll)
  writeEntityFieldsRegistry(outputDir, combinedAll)
  cleanupStaleEntityDirs(entitiesRoot, desiredAllEntities)

  return result
}
