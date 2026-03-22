import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Re-implement the parsers locally to test them in isolation.
// These mirror the private functions in entity-ids.ts.

function toSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

function parseExportedClassNamesFromFile(source: string, isJs: boolean): string[] {
  const sf = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2020, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  const classNames: string[] = []
  const classVarNames = new Set<string>()
  const namedExports = new Set<string>()

  sf.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (hasExport) classNames.push(node.name.text)
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isClassExpression(decl.initializer)) {
          classVarNames.add(decl.name.text)
        }
      }
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        namedExports.add(el.name.text)
      }
    }
  })

  for (const name of classVarNames) {
    if (namedExports.has(name) && !classNames.includes(name)) {
      classNames.push(name)
    }
  }
  return classNames
}

function parseEntityFieldsFromFile(source: string, exportedClassNames: string[], isJs: boolean): Record<string, string[]> {
  const sf = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2020, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  const exported = new Set(exportedClassNames)
  const result: Record<string, string[]> = {}

  function normalizeDbName(propertyName: string, nameOverride?: string): string {
    if (nameOverride) return nameOverride
    return toSnake(propertyName)
  }

  // TS source path
  sf.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return
    const clsName = node.name.text
    if (!exported.has(clsName)) return
    const entityKey = toSnake(clsName)
    const fields: string[] = []
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member) || !member.name) continue
      const name = ts.isIdentifier(member.name) ? member.name.text : undefined
      if (!name) continue
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue
      const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) ?? [] : []
      let dbName: string | undefined
      if (decorators.length) {
        for (const d of decorators) {
          const expr = d.expression
          if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
            const first = expr.arguments[0]
            if (ts.isObjectLiteralExpression(first)) {
              for (const prop of first.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'name') {
                  if (ts.isStringLiteral(prop.initializer)) dbName = normalizeDbName(name, prop.initializer.text)
                }
              }
            }
          }
          if (!dbName) dbName = normalizeDbName(name)
          if (dbName) break
        }
      }
      if (!dbName) dbName = normalizeDbName(name)
      fields.push(dbName)
    }
    result[entityKey] = Array.from(new Set(fields))
  })

  // Compiled JS fallback
  if (Object.keys(result).length === 0 && exported.size > 0) {
    const fieldsByClass: Record<string, string[]> = {}
    sf.forEachChild((node) => {
      if (!ts.isExpressionStatement(node)) return
      const expr = node.expression
      if (!ts.isCallExpression(expr)) return
      const callee = expr.expression
      if (!ts.isIdentifier(callee) || callee.text !== '__decorateClass') return
      if (expr.arguments.length < 3) return
      const target = expr.arguments[1]
      if (!ts.isPropertyAccessExpression(target)) return
      if (!ts.isIdentifier(target.name) || target.name.text !== 'prototype') return
      if (!ts.isIdentifier(target.expression)) return
      const className = target.expression.text
      if (!exported.has(className)) return
      const propArg = expr.arguments[2]
      if (!ts.isStringLiteral(propArg)) return
      const propName = propArg.text
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
      result[toSnake(className)] = Array.from(new Set(fields))
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseExportedClassNamesFromFile', () => {
  it('parses TS source with export class', () => {
    const src = `
      @Entity({ tableName: 'users' })
      export class User { id!: string }
      @Entity({ tableName: 'roles' })
      export class Role { id!: string }
    `
    expect(parseExportedClassNamesFromFile(src, false)).toEqual(['User', 'Role'])
  })

  it('parses compiled JS with let X = class + export {}', () => {
    const src = `
      let User = class { constructor() { this.id = void 0; } };
      let Role = class { constructor() { this.id = void 0; } };
      export { User, Role };
    `
    expect(parseExportedClassNamesFromFile(src, true)).toEqual(['User', 'Role'])
  })

  it('excludes non-exported class variables', () => {
    const src = `
      let Helper = class {};
      let User = class {};
      export { User };
    `
    expect(parseExportedClassNamesFromFile(src, true)).toEqual(['User'])
  })

  it('excludes non-class variable exports', () => {
    const src = `
      let config = { key: 'value' };
      let User = class {};
      export { config, User };
    `
    expect(parseExportedClassNamesFromFile(src, true)).toEqual(['User'])
  })

  it('handles empty file', () => {
    expect(parseExportedClassNamesFromFile('', false)).toEqual([])
  })
})

describe('parseEntityFieldsFromFile — compiled JS', () => {
  it('extracts fields from __decorateClass calls', () => {
    const src = `
      let User = class { constructor() { this.createdAt = new Date(); } };
      __decorateClass([PrimaryKey({ type: "uuid" })], User.prototype, "id", 2);
      __decorateClass([Property({ name: "user_name", type: "text" })], User.prototype, "userName", 2);
      __decorateClass([Property({ name: "created_at", type: Date })], User.prototype, "createdAt", 2);
      User = __decorateClass([Entity({ tableName: "users" })], User);
      export { User };
    `
    const result = parseEntityFieldsFromFile(src, ['User'], true)
    expect(result).toEqual({
      user: ['id', 'user_name', 'created_at'],
    })
  })

  it('uses toSnake fallback when no name override', () => {
    const src = `
      let Item = class {};
      __decorateClass([PrimaryKey({ type: "uuid" })], Item.prototype, "id", 2);
      __decorateClass([Property({ type: "text" })], Item.prototype, "itemName", 2);
      Item = __decorateClass([Entity({ tableName: "items" })], Item);
      export { Item };
    `
    const result = parseEntityFieldsFromFile(src, ['Item'], true)
    expect(result).toEqual({
      item: ['id', 'item_name'],
    })
  })

  it('takes first decorator name (Property) over second (Index)', () => {
    const src = `
      let User = class {};
      __decorateClass([
        Property({ name: "email_hash", type: "text", nullable: true }),
        Index({ name: "users_email_hash_idx" })
      ], User.prototype, "emailHash", 2);
      User = __decorateClass([Entity({ tableName: "users" })], User);
      export { User };
    `
    const result = parseEntityFieldsFromFile(src, ['User'], true)
    expect(result).toEqual({
      user: ['email_hash'],
    })
  })

  it('skips class-level decorators (no .prototype)', () => {
    const src = `
      let User = class {};
      __decorateClass([Property({ name: "user_name" })], User.prototype, "userName", 2);
      User = __decorateClass([Entity({ tableName: "users" }), Unique({ properties: ["userName"] })], User);
      export { User };
    `
    const result = parseEntityFieldsFromFile(src, ['User'], true)
    expect(result).toEqual({
      user: ['user_name'],
    })
  })

  it('skips non-exported classes', () => {
    const src = `
      let Helper = class {};
      __decorateClass([Property({ type: "text" })], Helper.prototype, "name", 2);
      let User = class {};
      __decorateClass([Property({ name: "user_name" })], User.prototype, "userName", 2);
      export { User };
    `
    const result = parseEntityFieldsFromFile(src, ['User'], true)
    expect(result).toEqual({
      user: ['user_name'],
    })
  })

  it('handles multiple entities in one file', () => {
    const src = `
      let Layout = class {};
      __decorateClass([PrimaryKey({ type: "uuid" })], Layout.prototype, "id", 2);
      Layout = __decorateClass([Entity({ tableName: "layouts" })], Layout);
      let Widget = class {};
      __decorateClass([PrimaryKey({ type: "uuid" })], Widget.prototype, "id", 2);
      __decorateClass([Property({ name: "widget_type" })], Widget.prototype, "widgetType", 2);
      Widget = __decorateClass([Entity({ tableName: "widgets" })], Widget);
      export { Layout, Widget };
    `
    const result = parseEntityFieldsFromFile(src, ['Layout', 'Widget'], true)
    expect(result).toEqual({
      layout: ['id'],
      widget: ['id', 'widget_type'],
    })
  })
})

describe('parseEntityFieldsFromFile — real compiled files', () => {
  const coreDistModules = path.resolve(__dirname, '../../../../../../core/dist/modules')

  it('parses dashboards/data/entities.js', () => {
    const filePath = path.join(coreDistModules, 'dashboards/data/entities.js')
    if (!fs.existsSync(filePath)) return // skip if not built

    const src = fs.readFileSync(filePath, 'utf8')
    const classNames = parseExportedClassNamesFromFile(src, true)
    expect(classNames).toContain('DashboardLayout')
    expect(classNames).toContain('DashboardRoleWidgets')
    expect(classNames).toContain('DashboardUserWidgets')

    const fields = parseEntityFieldsFromFile(src, classNames, true)
    expect(fields.dashboard_layout).toContain('id')
    expect(fields.dashboard_layout).toContain('user_id')
    expect(fields.dashboard_user_widgets).toContain('widget_ids_json')
  })

  it('parses auth/data/entities.js — Property+Index name override', () => {
    const filePath = path.join(coreDistModules, 'auth/data/entities.js')
    if (!fs.existsSync(filePath)) return // skip if not built

    const src = fs.readFileSync(filePath, 'utf8')
    const classNames = parseExportedClassNamesFromFile(src, true)
    expect(classNames).toContain('User')

    const fields = parseEntityFieldsFromFile(src, classNames, true)
    // email_hash has both Property({ name: 'email_hash' }) and Index({ name: 'users_email_hash_idx' })
    // Must use the Property name, not the Index name
    expect(fields.user).toContain('email_hash')
    expect(fields.user).not.toContain('users_email_hash_idx')
  })
})
