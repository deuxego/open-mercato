import { assertJsonSerializable } from '../guards'

describe('assertJsonSerializable', () => {
  it('accepts plain objects', () => {
    expect(() => assertJsonSerializable({ foo: 'bar', num: 1 }, 'test-step')).not.toThrow()
  })

  it('accepts arrays', () => {
    expect(() => assertJsonSerializable([1, 2, 3], 'test-step')).not.toThrow()
  })

  it('accepts null', () => {
    expect(() => assertJsonSerializable(null, 'test-step')).not.toThrow()
  })

  it('accepts nested objects', () => {
    expect(() => assertJsonSerializable({ a: { b: { c: true } } }, 'test-step')).not.toThrow()
  })

  it('rejects circular references', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(() => assertJsonSerializable(obj, 'my-step')).toThrow('Step "my-step" returned a non-JSON-serializable value')
  })

  it('accepts objects with functions (JSON.stringify silently drops them)', () => {
    // JSON.stringify skips functions — doesn't throw. The guard only catches circular refs / BigInt / etc.
    expect(() => assertJsonSerializable({ fn: () => {} }, 'fn-step')).not.toThrow()
  })

  it('rejects BigInt values', () => {
    expect(() => assertJsonSerializable({ big: BigInt(9007199254740991) }, 'big-step')).toThrow('non-JSON-serializable')
  })
})
