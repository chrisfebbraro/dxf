import { Box2 } from 'vecks'

import colors from './util/colors'
import denormalise, { resolveLimits, tooMany } from './denormalise'
import entityToPolyline from './entityToPolyline'
import applyTransforms from './applyTransforms'
import logger from './util/logger'
import { own } from './util/dict'

export default (parsed, limits) => {
  const entities = denormalise(parsed, limits)
  // The points drawn are counted against the same limit: a circle becomes dozens of them.
  const { maxEntities } = resolveLimits(limits)
  let points = 0
  const polylines = entities.map((entity) => {
    const layerTable = own(parsed.tables.layers, entity.layer)
    let colorNumber = 0
    if ('colorNumber' in entity) {
      colorNumber = entity.colorNumber
    } else if (layerTable) {
      colorNumber = layerTable.colorNumber
    }

    if (colors[colorNumber] === undefined) {
      logger.warn('Color index', colorNumber, 'invalid, defaulting to black')
      colorNumber = 0
    }

    const outline = entityToPolyline(entity)
    points += outline.length
    if (points > maxEntities) throw tooMany(maxEntities)
    return {
      rgb: colors[colorNumber],
      layer: layerTable,
      vertices: applyTransforms(outline, entity.transforms),
    }
  })

  const bbox = new Box2()
  polylines.forEach((polyline) => {
    polyline.vertices.forEach((vertex) => {
      bbox.expandByPoint({ x: vertex[0], y: vertex[1] })
    })
  })

  return { bbox, polylines }
}
