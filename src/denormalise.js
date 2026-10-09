import cloneDeep from 'lodash/cloneDeep'

import logger from './util/logger'
import dict from './util/dict'

// Limits on flattening, since a file decides how deeply its blocks nest and how wide its arrays are.
// Entities written directly in the file are bounded by the file's size and are not counted. What block
// insertion produces is: each entity counts one plus its vertices and control points, and every INSERT
// counts one even when it is skipped. A block nested deeper than `maxDepth` inserts, or one that inserts
// itself, is skipped; past `maxEntities` units, flattening throws an Error with code
// DXF_TOO_MANY_ENTITIES before doing the work.
export const DEFAULT_LIMITS = { maxDepth: 64, maxEntities: 10000000 }

// The error thrown when flattening would pass `max`.
const tooMany = (max) =>
  Object.assign(
    new Error(`DXF expands to too many entities (more than ${max})`),
    { code: 'DXF_TOO_MANY_ENTITIES' },
  )

// A limit as given, or the default when it is missing or not a non-negative number.
const limitOr = (value, fallback) =>
  typeof value === 'number' && value >= 0 ? value : fallback

// An array count as a whole number of at least one; anything else counts as one.
const arrayCount = (n) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)

// What one entity costs to produce: itself, its vertices and its control points.
const weight = (e) =>
  1 +
  (Array.isArray(e.vertices) ? e.vertices.length : 0) +
  (Array.isArray(e.controlPoints) ? e.controlPoints.length : 0)

export default (parseResult, limits = {}) => {
  const maxDepth = limitOr(limits.maxDepth, DEFAULT_LIMITS.maxDepth)
  const maxEntities = limitOr(limits.maxEntities, DEFAULT_LIMITS.maxEntities)
  const blocksByName = parseResult.blocks.reduce((acc, b) => {
    acc[b.name] = b
    return acc
  }, dict())
  // What one placement of each block costs, worked out once per block.
  const blockWeights = new Map()
  const blockWeight = (block) => {
    if (!blockWeights.has(block)) {
      const entities = block.entities || []
      blockWeights.set(
        block,
        Math.max(
          1,
          entities.reduce((sum, e) => sum + weight(e), 0),
        ),
      )
    }
    return blockWeights.get(block)
  }
  // The blocks being inserted along the current path, so one that inserts itself is caught.
  const inserting = new Set()
  let work = 0
  const spend = (units) => {
    work += units
    if (work > maxEntities) throw tooMany(maxEntities)
  }
  const out = []

  const gatherEntities = (entities, transforms) => {
    entities.forEach((e) => {
      if (e.type === 'INSERT') {
        const insert = e
        // Every insert costs, skipped or not, so a file of skipped inserts cannot run on unbounded.
        spend(1)
        const block = blocksByName[insert.block]
        if (!block) {
          logger.error('no block found for insert. block:', insert.block)
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
        // The whole array is paid for before any of it is produced.
        spend(rowCount * columnCount * blockWeight(block))
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
