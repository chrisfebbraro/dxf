import cloneDeep from 'lodash/cloneDeep'

import logger from './util/logger'
import dict from './util/dict'

// Limits on flattening, since a file decides how deeply its blocks nest and how wide its arrays are.
// Entities written directly in the file are bounded by the file's size and are not counted. What block
// insertion produces is, as it is produced: every value each copied entity carries (coordinates,
// vertices, control points, hatch outlines and the rest) plus the placing steps it carries, one for every
// array place, and one for every INSERT, including those that will be skipped. A top-level insert whose
// whole expansion is estimated past the limit is refused before any of it is produced. A block nested
// deeper than `maxDepth` inserts, or one that inserts itself, is skipped; past `maxEntities` units,
// flattening throws an Error with code DXF_TOO_MANY_ENTITIES.
export const DEFAULT_LIMITS = { maxDepth: 64, maxEntities: 20000000 }

// The error thrown when flattening, or what is drawn from it, would pass `max`.
export const tooMany = (max) =>
  Object.assign(
    new Error(`DXF expands to too many entities (more than ${max})`),
    { code: 'DXF_TOO_MANY_ENTITIES' },
  )

// A limit as given, or the default when it is missing or not a non-negative number.
const limitOr = (value, fallback) =>
  typeof value === 'number' && value >= 0 ? value : fallback

// The limits to apply: each one given, or its default.
export const resolveLimits = (limits) => ({
  maxDepth: limitOr((limits || {}).maxDepth, DEFAULT_LIMITS.maxDepth),
  maxEntities: limitOr((limits || {}).maxEntities, DEFAULT_LIMITS.maxEntities),
})

// An array count as a whole number of at least one; anything else counts as one.
const arrayCount = (n) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)

// How many values an entity carries, nested ones included: what copying it costs.
const size = (value) => {
  if (value === null || typeof value !== 'object') return 1
  let n = 1
  for (const key of Object.keys(value)) n += size(value[key])
  return n
}

export default (parseResult, limits) => {
  const { maxDepth, maxEntities } = resolveLimits(limits)
  // Each block entity's size, worked out once however many times it is copied or costed.
  const sizes = new WeakMap()
  const sizeOf = (e) => {
    if (!sizes.has(e)) sizes.set(e, size(e))
    return sizes.get(e)
  }
  const blocksByName = parseResult.blocks.reduce((acc, b) => {
    acc[b.name] = b
    return acc
  }, dict())

  // AN ESTIMATE of what one placement of a block costs when its contents land `depth` inserts deep: its
  // nested inserts expanded in full, as far as maxDepth lets them go, an insert that will be skipped
  // counting one. Worked out once per block and depth, so the recursion is never deeper than maxDepth.
  // Being remembered, it can be wrong for a block that inserts its own ancestors; it only refuses early,
  // and what is actually produced is counted as well.
  const expansions = new Map()
  const expanding = new Set()
  const expansion = (block, depth) => {
    const key = `${depth}`
    if (!expansions.has(block)) expansions.set(block, new Map())
    const known = expansions.get(block)
    if (known.has(key)) return known.get(key)
    expanding.add(block)
    let total = 0
    for (const e of block.entities || []) {
      if (e.type !== 'INSERT') {
        total += sizeOf(e)
        continue
      }
      const target = blocksByName[e.block]
      total += 1
      if (target && !expanding.has(target) && depth < maxDepth) {
        total +=
          arrayCount(e.rowCount) *
          arrayCount(e.columnCount) *
          expansion(target, depth + 1)
      }
    }
    expanding.delete(block)
    const cost = Math.max(1, total)
    known.set(key, cost)
    return cost
  }

  // The blocks being inserted along the current path, so one that inserts itself is caught.
  const inserting = new Set()
  let work = 0
  const spend = (units) => {
    work += units
    if (work > maxEntities) throw tooMany(maxEntities)
  }
  // Refuses work that would pass the limit, without counting it: it is counted as it is done.
  const affordable = (units) => {
    if (work + units > maxEntities) throw tooMany(maxEntities)
  }
  // Missing blocks already reported, so a file inserting one many times logs it once.
  const missing = new Set()
  const out = []

  const gatherEntities = (entities, transforms) => {
    const topLevel = transforms.length === 0
    entities.forEach((e) => {
      if (e.type === 'INSERT') {
        const insert = e
        // Every insert costs, skipped or not, so a file of skipped inserts cannot run on unbounded. One
        // inside a block was counted when the block was copied.
        if (topLevel) spend(1)
        const block = blocksByName[insert.block]
        if (!block) {
          if (!missing.has(insert.block)) {
            missing.add(insert.block)
            logger.error('no block found for insert. block:', insert.block)
          }
          return
        }
        if (inserting.has(insert.block)) {
          logger.warn('block inserts itself, skipped:', insert.block)
          return
        }
        if (transforms.length >= maxDepth) {
          logger.warn(
            'blocks nested deeper than',
            maxDepth,
            'skipped at:',
            insert.block,
          )
          return
        }

        const rowCount = arrayCount(insert.rowCount)
        const columnCount = arrayCount(insert.columnCount)
        // Every place in the array costs one, even for a block with nothing in it.
        spend(rowCount * columnCount)
        // A top-level insert estimated past the limit is refused before any of it is produced.
        if (topLevel) affordable(rowCount * columnCount * expansion(block, 1))
        const rowSpacing = insert.rowSpacing ?? 0
        const columnSpacing = insert.columnSpacing ?? 0
        const rotation = insert.rotation ?? 0

        // It appears that the rectangular array is affected by rotation, but NOT by scale.
        let rowVec, colVec
        if (rowCount > 1 || columnCount > 1) {
          const cos = Math.cos((rotation * Math.PI) / 180)
          const sin = Math.sin((rotation * Math.PI) / 180)
          rowVec = { x: -sin * rowSpacing, y: cos * rowSpacing }
          colVec = { x: cos * columnSpacing, y: sin * columnSpacing }
        } else {
          rowVec = { x: 0, y: 0 }
          colVec = { x: 0, y: 0 }
        }

        // For rectangular arrays, add the block entities for each location in the array
        for (let r = 0; r < rowCount; r++) {
          for (let c = 0; c < columnCount; c++) {
            // Adjust insert transform by row and column for rectangular arrays
            const t = {
              x: insert.x + rowVec.x * r + colVec.x * c,
              y: insert.y + rowVec.y * r + colVec.y * c,
              scaleX: insert.scaleX,
              scaleY: insert.scaleY,
              scaleZ: insert.scaleZ,
              extrusionX: insert.extrusionX,
              extrusionY: insert.extrusionY,
              extrusionZ: insert.extrusionZ,
              rotation: insert.rotation,
            }
            // Add the insert transform and recursively add entities
            const transforms2 = transforms.slice(0)
            transforms2.push(t)

            // Use the insert layer
            const blockEntities = (block.entities || []).map((be) => {
              // Each copy costs what it carries, and the placing steps it carries with it.
              spend(be.type === 'INSERT' ? 1 : sizeOf(be) + transforms2.length)
              const be2 = cloneDeep(be)
              be2.layer = insert.layer
              // https://github.com/bjnortier/dxf/issues/52
              // See Issue 52. If we don't modify the
              // entity coordinates here it creates an issue with the
              // transformation matrices (which are only applied AFTER
              // block insertion modifications has been applied).
              switch (be2.type) {
                case 'LINE': {
                  be2.start.x -= block.x
                  be2.start.y -= block.y
                  be2.end.x -= block.x
                  be2.end.y -= block.y
                  break
                }
                case 'LWPOLYLINE':
                case 'POLYLINE': {
                  be2.vertices.forEach((v) => {
                    v.x -= block.x
                    v.y -= block.y
                  })
                  break
                }
                case 'CIRCLE':
                case 'ELLIPSE':
                case 'ARC': {
                  be2.x -= block.x
                  be2.y -= block.y
                  break
                }
                case 'SPLINE': {
                  be2.controlPoints.forEach((cp) => {
                    cp.x -= block.x
                    cp.y -= block.y
                  })
                  break
                }
              }
              return be2
            })
            inserting.add(insert.block)
            try {
              gatherEntities(blockEntities, transforms2)
            } finally {
              inserting.delete(insert.block)
            }
          }
        }
      } else {
        // Top-level entity. Clone and add the transforms
        // The transforms are reversed so they occur in
        // order of application - i.e. the transform of the
        // top-level insert is applied last
        const e2 = cloneDeep(e)
        e2.transforms = transforms.slice().reverse()
        out.push(e2)
      }
    })
  }

  gatherEntities(parseResult.entities, [])
  return out
}
