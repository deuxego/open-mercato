/**
 * Verifies that a value is JSON-serializable.
 * Only runs in development mode — called from run() steps.
 *
 * Inngest memoizes step return values by serializing them. Non-serializable values
 * (MikroORM entities, circular refs, functions) corrupt the memoization state.
 */
export function assertJsonSerializable(value: unknown, stepId: string): void {
  try {
    JSON.stringify(value)
  } catch (error) {
    throw new Error(
      `Step "${stepId}" returned a non-JSON-serializable value. ` +
      `Inngest memoizes step results — return plain objects, not MikroORM entities. ` +
      `Use wrap(entity).toObject() or destructure to a plain object.`
    )
  }
}
