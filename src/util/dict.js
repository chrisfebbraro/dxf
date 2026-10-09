// A lookup keyed by names that come from the file — blocks, layers, styles, entity types. It has no
// prototype, so a name like "__proto__" or "constructor" is a key like any other: it neither reaches an
// inherited member when read nor re-parents the object when written.
export default () => Object.create(null)
