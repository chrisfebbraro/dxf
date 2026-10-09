import expect from 'expect'

import { parseString, denormalise, groupEntitiesByLayer } from '../../src'

// UNTRUSTED FILES. Each case is a file someone could upload on purpose or by accident; none may throw a
// TypeError, recurse until the stack runs out, or expand without bound.

// A DXF document from group code / value pairs.
const dxf = (...pairs) => pairs.flat().join('\n') + '\n'
const section = (name, ...body) => [0, 'SECTION', 2, name, ...body, 0, 'ENDSEC']
const line = (layer = '0') => [0, 'LINE', 8, layer, 10, 0, 20, 0, 11, 1, 21, 1]
const block = (name, ...body) => [
  0,
  'BLOCK',
  2,
  name,
  10,
  0,
  20,
  0,
  ...body,
  0,
  'ENDBLK',
]
const insert = (name, ...extra) => [
  0,
  'INSERT',
  8,
  '0',
  2,
  name,
  10,
  0,
  20,
  0,
  ...extra,
]
const eof = [0, 'EOF']
// The name read as a key, since `.__proto__` would read the prototype itself.
const PROTO = '__proto__'

describe('Hostile input', () => {
  describe('names that are also Object members', () => {
    it('an entity type named after one is ignored, not thrown on', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'constructor',
            0,
            '__proto__',
            0,
            'toString',
            ...line(),
          ),
          eof,
        ),
      )
      expect(parsed.entities.map((e) => e.type)).toEqual(['LINE'])
    })

    it('a block named __proto__ is kept and inserted like any other', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('__proto__', ...line())),
          section('ENTITIES', ...insert('__proto__')),
          eof,
        ),
      )
      expect(denormalise(parsed).map((e) => e.type)).toEqual(['LINE'])
    })

    it('an insert of an undefined block named constructor is skipped', () => {
      const parsed = parseString(
        dxf(section('ENTITIES', ...insert('constructor')), eof),
      )
      expect(denormalise(parsed)).toEqual([])
    })

    it('layers named __proto__ and constructor are table rows of their own', () => {
      const parsed = parseString(
        dxf(
          section(
            'TABLES',
            0,
            'TABLE',
            2,
            'LAYER',
            0,
            'LAYER',
            2,
            '__proto__',
            62,
            1,
            0,
            'LAYER',
            2,
            'constructor',
            62,
            2,
            0,
            'ENDTAB',
          ),
          eof,
        ),
      )
      const layers = parsed.tables.layers
      expect(Object.prototype.hasOwnProperty.call(layers, '__proto__')).toBe(
        true,
      )
      expect(Object.prototype.hasOwnProperty.call(layers, 'constructor')).toBe(
        true,
      )
      expect([
        layers[PROTO].colorNumber,
        layers.constructor.colorNumber,
      ]).toEqual([1, 2])
    })

    it('entities on a layer named constructor are grouped, not thrown on', () => {
      const parsed = parseString(
        dxf(
          section('ENTITIES', ...line('constructor'), ...line('__proto__')),
          eof,
        ),
      )
      const groups = groupEntitiesByLayer(denormalise(parsed))
      expect([groups.constructor.length, groups[PROTO].length]).toEqual([1, 1])
    })
  })

  describe('malformed structure', () => {
    it('an empty section is skipped', () => {
      const parsed = parseString(
        dxf([0, 'SECTION', 0, 'ENDSEC'], section('ENTITIES', ...line()), eof),
      )
      expect(parsed.entities.length).toEqual(1)
    })

    it('values before the first entity in a section are skipped', () => {
      const parsed = parseString(
        dxf(section('ENTITIES', 8, '0', ...line()), eof),
      )
      expect(parsed.entities.length).toEqual(1)
    })

    it('values before the first table, or before its first row, are skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'TABLES',
            5,
            'A',
            0,
            'TABLE',
            2,
            'LAYER',
            5,
            'B',
            0,
            'LAYER',
            2,
            'WALLS',
            0,
            'ENDTAB',
          ),
          eof,
        ),
      )
      expect(Object.keys(parsed.tables.layers)).toEqual(['WALLS'])
    })

    it('line-type element fields before their element are skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'TABLES',
            0,
            'TABLE',
            2,
            'LTYPE',
            0,
            'LTYPE',
            2,
            'DASHED',
            74,
            0,
            75,
            0,
            340,
            'H',
            46,
            1,
            50,
            0,
            44,
            1,
            45,
            1,
            9,
            'T',
            49,
            0.5,
            0,
            'ENDTAB',
          ),
          eof,
        ),
      )
      expect(parsed.tables.ltypes.DASHED.pattern.length).toEqual(1)
    })
  })

  describe('flattening blocks', () => {
    it('a block that inserts itself stops rather than recursing forever', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line(), ...insert('A'))),
          section('ENTITIES', ...insert('A')),
          eof,
        ),
      )
      expect(denormalise(parsed).length).toEqual(1)
    })

    it('two blocks that insert each other stop too', () => {
      const parsed = parseString(
        dxf(
          section(
            'BLOCKS',
            ...block('A', ...line(), ...insert('B')),
            ...block('B', ...line(), ...insert('A')),
          ),
          section('ENTITIES', ...insert('A')),
          eof,
        ),
      )
      expect(denormalise(parsed).length).toEqual(2)
    })

    it('a block used twice side by side is not mistaken for a cycle', () => {
      const parsed = parseString(
        dxf(
          section(
            'BLOCKS',
            ...block('LEG', ...line()),
            ...block('CHAIR', ...insert('LEG'), ...insert('LEG')),
          ),
          section('ENTITIES', ...insert('CHAIR')),
          eof,
        ),
      )
      expect(denormalise(parsed).length).toEqual(2)
    })

    it('nesting deeper than maxDepth is cut off there', () => {
      const chain = Array.from({ length: 40 }, (_, i) =>
        block(`B${i}`, ...line(), ...insert(`B${i + 1}`)),
      )
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...chain.flat()),
          section('ENTITIES', ...insert('B0')),
          eof,
        ),
      )
      expect(denormalise(parsed, { maxDepth: 5 }).length).toEqual(5)
    })

    it('an array insert past the entity budget throws an error that says so', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line())),
          section('ENTITIES', ...insert('A', 70, 10000, 71, 10000)),
          eof,
        ),
      )
      let caught
      try {
        denormalise(parsed, { maxEntities: 1000 })
      } catch (err) {
        caught = err
      }
      expect(caught && caught.code).toEqual('DXF_TOO_MANY_ENTITIES')
    })

    it('arrays of an empty block past the budget throw rather than loop', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('E')),
          section('ENTITIES', ...insert('E', 70, 30000, 71, 30000)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 1000 })).toThrow(
        /too many/i,
      )
    })

    it('nested arrays that multiply past the budget throw', () => {
      const parsed = parseString(
        dxf(
          section(
            'BLOCKS',
            ...block('C', ...line()),
            ...block('B', ...insert('C', 70, 10, 71, 10)),
            ...block('A', ...insert('B', 70, 10, 71, 10)),
          ),
          section('ENTITIES', ...insert('A', 70, 10, 71, 10)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 5000 })).toThrow(
        /too many/i,
      )
    })

    it('array counts that are not positive whole numbers count as one', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line())),
          section('ENTITIES', ...insert('A', 70, -5, 71, 'x')),
          eof,
        ),
      )
      expect(denormalise(parsed).length).toEqual(1)
    })
  })
})
