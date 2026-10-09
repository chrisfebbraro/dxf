import entitiesHandler from './entities'

export default (tuples) => {
  let state
  const blocks = []
  let block
  let entitiesTuples = []

  tuples.forEach((tuple) => {
    const type = tuple[0]
    const value = tuple[1]

    if (value === 'BLOCK') {
      state = 'block'
      block = {}
      entitiesTuples = []
      blocks.push(block)
    } else if (value === 'ENDBLK') {
      // An end with no block open has nothing to end.
      if (!block) return
      if (state === 'entities') {
        block.entities = entitiesHandler(entitiesTuples)
      } else {
        block.entities = []
      }
      entitiesTuples = undefined
      state = undefined
      block = undefined
    } else if (state === 'block' && type !== 0) {
      switch (type) {
        case 1:
          block.xref = value
          break
        case 2:
          block.name = value
          break
        case 10:
          block.x = value
          break
        case 20:
          block.y = value
          break
        case 30:
          block.z = value
          break
        case 67:
          {
            if (value !== 0) block.paperSpace = value
          }
          break
        case 410:
          block.layout = value
          break
        default:
          break
      }
    } else if (state === 'block' && type === 0) {
      state = 'entities'
      entitiesTuples.push(tuple)
    } else if (state === 'entities') {
      entitiesTuples.push(tuple)
    }
  })

  // A block still open when its section ends keeps what it holds (#151).
  if (block && !block.entities) {
    block.entities = state === 'entities' ? entitiesHandler(entitiesTuples) : []
  }

  return blocks
}
