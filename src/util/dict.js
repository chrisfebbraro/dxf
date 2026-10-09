// Lookups keyed by names that come from the file: blocks, layers, styles, entity types. A name such as
// "__proto__" or "constructor" must behave as an ordinary key.

// An internal lookup, never handed to callers: no prototype, so no name reaches an inherited member.
export default () => Object.create(null)

// Stores `value` under `key` as an own property, so "__proto__" is a key rather than a prototype change.
export const define = (obj, key, value) =>
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })

// The value stored under `key` itself, never one inherited from Object.prototype.
export const own = (obj, key) =>
  obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined
