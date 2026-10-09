import cloneDeep from 'lodash/cloneDeep'

import logger from './util/logger'
import dict from './util/dict'

// LIMITS ON FLATTENING, since a file decides how far its blocks nest and how wide its arrays are. A block
// nested deeper than `maxDepth` inserts is left out, as is one that inserts itself; more than
// `maxEntities` units of work — entities produced plus array places visited — throws, with code
// DXF_TOO_MANY_ENTITIES, rather than run on.
export const DEFAULT_LIMITS = { maxDepth: 64, maxEntities: 1000000 }

// The error thrown when flattening would pass `max`.
const tooMany = (max) =>
  Object.assign(
    new Error(`DXF expands to too many entities (more than ${max})`),
    {
      code: 'DXF_TOO_MANY_ENTITIES',
    },
  )

// An array count as a whole number of at least one; anything else counts as one.
const arrayCount = (n) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)

export default (parseResult, limits = {}) => {
  const { maxDepth, maxEntities } = { ...DEFAULT_LIMITS, ...limits }
  const blocksByName = parseResult.blocks.reduce((acc, b) => {
    acc[b.name] = b
    return acc
  }, dict())
  // The blocks being inserted along the current path, so one that inserts itself is caught.
  const inserting = new Set()
  let work = 0
  const spend = (units) => {
    work += units
    if (work > maxEntities) throw tooMany(maxEntities)
  }

  const gatherEntities = (entities, transforms) => {
    let current = []
    entities.forEach((e) => {
      if (e.type === 'INSERT') {
        const insert = e
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
        // Every place in the array is work, even for a block with nothing in it.
        spend(rowCount * columnCount)
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
              current = current.concat(
                gatherEntities(blockEntities, transforms2),
              )
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
        spend(1)
        const e2 = cloneDeep(e)
        e2.transforms = transforms.slice().reverse()
        current.push(e2)
      }
    })
    return current
  }

  return gatherEntities(parseResult.entities, [])
}
