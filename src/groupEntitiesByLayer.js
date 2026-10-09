import { define, own } from './util/dict'

export default (entities) => {
  return entities.reduce((acc, entity) => {
    const layer = entity.layer
    if (!own(acc, layer)) {
      define(acc, layer, [])
    }
    acc[layer].push(entity)
    return acc
  }, {})
}
