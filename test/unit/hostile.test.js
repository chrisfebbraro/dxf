import expect from 'expect'

import {
  parseString,
  denormalise,
  groupEntitiesByLayer,
  toPolylines,
  toSVG,
  Helper,
} from '../../src'

// Untrusted files. Each case is a file someone could upload on purpose or by accident; none may throw a
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

  describe('fields before the thing they belong to', () => {
    it('a polyline vertex coordinate or bulge before its first vertex is skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'LWPOLYLINE',
            8,
            '0',
            20,
            5,
            42,
            0.5,
            10,
            1,
            20,
            2,
            10,
            3,
            20,
            4,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].vertices).toEqual([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ])
    })

    it('a spline control point coordinate before its first point is skipped', () => {
      const parsed = parseString(
        dxf(
          section('ENTITIES', 0, 'SPLINE', 8, '0', 20, 5, 30, 1, 10, 1, 20, 2),
          eof,
        ),
      )
      expect(parsed.entities[0].controlPoints).toEqual([{ x: 1, y: 2 }])
    })

    it('a block end with no block is skipped', () => {
      const parsed = parseString(
        dxf(section('BLOCKS', 0, 'ENDBLK', ...block('A', ...line())), eof),
      )
      expect(parsed.blocks.map((b) => b.name)).toEqual(['A'])
    })

    it('a block left open at the end of its section keeps its entities (#151)', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', 0, 'BLOCK', 2, 'A', 10, 0, 20, 0, ...line()),
          section('ENTITIES', ...insert('A')),
          eof,
        ),
      )
      expect(denormalise(parsed).map((e) => e.type)).toEqual(['LINE'])
    })

    it('a block with no entity list is inserted as nothing rather than thrown on (#151)', () => {
      const parsed = parseString(dxf(section('ENTITIES', ...insert('A')), eof))
      parsed.blocks.push({ name: 'A', x: 0, y: 0 })
      expect(denormalise(parsed)).toEqual([])
    })

    it('hatch edge fields before their edge type are skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            91,
            1,
            92,
            1,
            93,
            1,
            11,
            1,
            21,
            1,
            40,
            2,
            73,
            1,
            97,
            0,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].boundary.loops.length).toEqual(1)
    })

    it('a hatch polyline bulge or coordinate before its first point is skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            91,
            1,
            92,
            2,
            72,
            1,
            73,
            1,
            93,
            1,
            42,
            0.5,
            20,
            3,
            10,
            1,
            20,
            2,
            97,
            0,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].boundary.loops[0].entities[0].points).toEqual([
        { x: 1, y: 2, bulge: 0 },
      ])
    })

    it('a hatch polyline keeps a bulge per point and its closed flag on the polyline (#112)', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            91,
            1,
            92,
            2,
            72,
            1,
            73,
            1,
            93,
            2,
            10,
            0,
            20,
            0,
            42,
            0.5,
            10,
            1,
            20,
            0,
            42,
            -0.25,
            97,
            0,
          ),
          eof,
        ),
      )
      const polyline = parsed.entities[0].boundary.loops[0].entities[0]
      expect([polyline.closed, polyline.points.map((p) => p.bulge)]).toEqual([
        1,
        [0.5, -0.25],
      ])
    })

    it('a hatch seed coordinate before its seed is skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            98,
            1,
            20,
            7,
            10,
            1,
            20,
            2,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].seeds.seeds).toEqual([{ x: 1, y: 2 }])
    })

    it('one hatch leaves nothing behind for the next, in this file or another', () => {
      // A hatch cut short while reading its seeds, then one whose first point is its elevation.
      const unfinished = [0, 'HATCH', 8, '0', 100, 'AcDbHatch', 98, 1, 10, 9]
      const next = [0, 'HATCH', 8, '0', 10, 5, 20, 6, 30, 0]
      // The expected elevation is written out, not parsed, so a leak left by any earlier case cannot hide.
      const elevation = { x: 5, y: 6, z: 0 }
      const after = parseString(
        dxf(section('ENTITIES', ...unfinished, ...next), eof),
      ).entities[1]
      parseString(dxf(section('ENTITIES', ...unfinished), eof))
      const nextFile = parseString(dxf(section('ENTITIES', ...next), eof))
        .entities[0]
      expect([after.elevation, nextFile.elevation]).toEqual([
        elevation,
        elevation,
      ])
    })
  })

  describe('shapes that cannot be drawn as given', () => {
    // A spline from control points and a degree, with the knots it is given.
    const spline = (degree, points, knots) => [
      0,
      'SPLINE',
      8,
      '0',
      71,
      degree,
      ...knots.flatMap((k) => [40, k]),
      ...points.flatMap(([x, y]) => [10, x, 20, y]),
    ]
    const square = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]

    it('a spline of degree 0 is drawn through its control points', () => {
      const parsed = parseString(
        dxf(section('ENTITIES', ...spline(0, square, [0, 1, 2, 3, 4])), eof),
      )
      expect(toPolylines(parsed).polylines[0].vertices).toEqual(square)
    })

    it('a spline with a knot vector of the wrong length is drawn through its control points', () => {
      const parsed = parseString(
        dxf(section('ENTITIES', ...spline(2, square, [0, 0, 1])), eof),
      )
      expect(toPolylines(parsed).polylines[0].vertices).toEqual(square)
    })

    it('a spline of higher degree than its points allow is drawn through them', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            ...spline(5, square, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]),
          ),
          eof,
        ),
      )
      expect(toPolylines(parsed).polylines[0].vertices).toEqual(square)
    })

    it('a spline with no control points draws nothing, and SVG still renders', () => {
      const parsed = parseString(
        dxf(section('ENTITIES', 0, 'SPLINE', 8, '0', 71, 3, ...line()), eof),
      )
      expect(toPolylines(parsed).polylines.length).toEqual(2)
      expect(typeof toSVG(parsed)).toEqual('string')
    })

    it('a polyface mesh face naming a vertex that is not there is left out', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'POLYLINE',
            8,
            '0',
            70,
            64,
            0,
            'VERTEX',
            8,
            '0',
            10,
            0,
            20,
            0,
            70,
            192,
            0,
            'VERTEX',
            8,
            '0',
            10,
            1,
            20,
            0,
            70,
            192,
            0,
            'VERTEX',
            8,
            '0',
            10,
            1,
            20,
            1,
            70,
            192,
            0,
            'VERTEX',
            8,
            '0',
            70,
            128,
            71,
            1,
            72,
            2,
            73,
            3,
            0,
            'VERTEX',
            8,
            '0',
            70,
            128,
            71,
            1,
            72,
            2,
            73,
            9,
            0,
            'SEQEND',
          ),
          eof,
        ),
      )
      expect(() => toPolylines(parsed)).not.toThrow()
    })
  })

  describe('limits that stay out of the way of real drawings', () => {
    // A block holding one polyline of `n` vertices.
    const longPolyline = (n) => [
      0,
      'LWPOLYLINE',
      8,
      '0',
      ...Array.from({ length: n }, (_, i) => [10, i, 20, 0]).flat(),
    ]

    it('shapes written directly in the file are not counted against the limit', () => {
      const lines = Array.from({ length: 2000 }, () => line()).flat()
      const parsed = parseString(dxf(section('ENTITIES', ...lines), eof))
      expect(denormalise(parsed, { maxEntities: 1000 }).length).toEqual(2000)
    })

    it('a large array of a small block flattens in reasonable time', function () {
      this.timeout(4000)
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line())),
          section('ENTITIES', ...insert('A', 70, 300, 71, 300)),
          eof,
        ),
      )
      expect(denormalise(parsed).length).toEqual(90000)
    })

    it('inserts that are skipped still count against the limit', () => {
      const selves = Array.from({ length: 50 }, () => insert('A')).flat()
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...selves)),
          section('ENTITIES', ...insert('A', 70, 100, 71, 100)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 10000 })).toThrow(
        /too many/i,
      )
    })

    it('a limit given as undefined or NaN falls back to the default rather than switching it off', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line())),
          section('ENTITIES', ...insert('A', 70, 10000, 71, 10000)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: undefined })).toThrow(
        /too many/i,
      )
      expect(() =>
        denormalise(parsed, { maxEntities: NaN, maxDepth: NaN }),
      ).toThrow(/too many/i)
    })

    it('a long polyline counts by its vertices', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...longPolyline(1000))),
          section('ENTITIES', ...insert('A', 70, 10, 71, 10)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 50000 })).toThrow(
        /too many/i,
      )
    })

    it('toPolylines, toSVG and Helper take the same limits', () => {
      const text = dxf(
        section('BLOCKS', ...block('A', ...line())),
        section('ENTITIES', ...insert('A', 70, 10, 71, 10)),
        eof,
      )
      const parsed = parseString(text)
      expect(() => toPolylines(parsed, { maxEntities: 10 })).toThrow(
        /too many/i,
      )
      expect(() => toSVG(parsed, { maxEntities: 10 })).toThrow(/too many/i)
      expect(() => new Helper(text, { maxEntities: 10 }).denormalised).toThrow(
        /too many/i,
      )
      expect(toPolylines(parsed).polylines.length).toEqual(100)
    })
  })

  describe('what callers are handed back', () => {
    it('table and layer lookups are plain objects, whatever their keys', () => {
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
            'WALLS',
            0,
            'LAYER',
            2,
            '__proto__',
            0,
            'ENDTAB',
          ),
          section('ENTITIES', ...line('WALLS')),
          eof,
        ),
      )
      const layers = parsed.tables.layers
      const groups = groupEntitiesByLayer(denormalise(parsed))
      // Called on the objects directly, as existing callers do; that is what this case protects.
      /* eslint-disable no-prototype-builtins */
      expect([
        layers.hasOwnProperty('WALLS'),
        String(layers),
        layers instanceof Object,
      ]).toEqual([true, '[object Object]', true])
      expect([
        groups.hasOwnProperty('WALLS'),
        groups instanceof Object,
      ]).toEqual([true, true])
      /* eslint-enable no-prototype-builtins */
    })

    it('a polyface mesh whose faces all name missing vertices draws nothing', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'POLYLINE',
            8,
            '0',
            70,
            64,
            0,
            'VERTEX',
            8,
            '0',
            10,
            0,
            20,
            0,
            70,
            192,
            0,
            'VERTEX',
            8,
            '0',
            70,
            128,
            71,
            1,
            72,
            2,
            73,
            9,
            0,
            'SEQEND',
          ),
          eof,
        ),
      )
      expect(() => toPolylines(parsed)).not.toThrow()
    })

    it('an edge field after a polyline boundary names an edge type is skipped', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            91,
            1,
            92,
            2,
            72,
            1,
            11,
            1,
            21,
            1,
            97,
            0,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].boundary.loops.length).toEqual(1)
    })
  })

  describe('found by the fuzzer', () => {
    it('an edge boundary that follows a polyline boundary is read as an edge boundary', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'HATCH',
            8,
            '0',
            100,
            'AcDbHatch',
            91,
            2,
            92,
            2,
            72,
            0,
            93,
            0,
            92,
            1,
            10,
            1,
            20,
            2,
            97,
            0,
          ),
          eof,
        ),
      )
      expect(parsed.entities[0].boundary.loops.length).toEqual(2)
    })

    it('a spline whose knots run backwards is drawn through its control points', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            0,
            'SPLINE',
            8,
            '0',
            71,
            1,
            40,
            3,
            40,
            2,
            40,
            1,
            40,
            0,
            10,
            0,
            20,
            0,
            10,
            1,
            20,
            1,
          ),
          eof,
        ),
      )
      expect(toPolylines(parsed).polylines[0].vertices).toEqual([
        [0, 0],
        [1, 1],
      ])
    })
  })

  describe('the limit holds memory, not just entity counts', () => {
    it('a long hatch outline counts by its points', () => {
      const points = Array.from({ length: 1000 }, (_, i) => [
        10,
        i,
        20,
        0,
      ]).flat()
      const hatch = [
        0,
        'HATCH',
        8,
        '0',
        100,
        'AcDbHatch',
        91,
        1,
        92,
        2,
        72,
        0,
        73,
        1,
        93,
        1000,
        ...points,
        97,
        0,
      ]
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...hatch)),
          section('ENTITIES', ...insert('A', 70, 10, 71, 10)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 50000 })).toThrow(
        /too many/i,
      )
    })

    it('nested arrays are paid for before any of them is produced', function () {
      this.timeout(2000)
      const parsed = parseString(
        dxf(
          section(
            'BLOCKS',
            ...block('B', ...line()),
            ...block('A', ...insert('B', 70, 100, 71, 100)),
          ),
          section('ENTITIES', ...insert('A', 70, 100, 71, 100)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 5000000 })).toThrow(
        /too many/i,
      )
    })

    it('limits given as null mean the defaults', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...line())),
          section('ENTITIES', ...insert('A')),
          eof,
        ),
      )
      expect(denormalise(parsed, null).length).toEqual(1)
      expect(toPolylines(parsed, null).polylines.length).toEqual(1)
    })

    it('a missing block is reported once, however often it is inserted', () => {
      const parsed = parseString(
        dxf(
          section(
            'ENTITIES',
            ...Array.from({ length: 1000 }, () => insert('X')).flat(),
          ),
          eof,
        ),
      )
      const original = console.error
      let calls = 0
      console.error = () => {
        calls += 1
      }
      try {
        denormalise(parsed)
      } finally {
        console.error = original
      }
      expect(calls).toEqual(1)
    })

    it('a polyface mesh with a very long outline converts', function () {
      this.timeout(60000)
      // One chain of faces, each showing only its first edge, so the outline is one run of n + 1 points.
      const n = 300000
      // Built up pair by pair, since a list this long cannot be spread into a call.
      const pairs = [0, 'SECTION', 2, 'ENTITIES', 0, 'POLYLINE', 8, '0', 70, 64]
      for (let i = 0; i < n + 2; i++) {
        pairs.push(0, 'VERTEX', 8, '0', 10, i, 20, i % 2, 70, 192)
      }
      for (let i = 0; i < n; i++) {
        pairs.push(
          0,
          'VERTEX',
          8,
          '0',
          70,
          128,
          71,
          i + 1,
          72,
          -(i + 2),
          73,
          -(i + 3),
        )
      }
      pairs.push(0, 'SEQEND', 0, 'ENDSEC', 0, 'EOF')
      const { polylines } = toPolylines(parseString(dxf(pairs)))
      expect(polylines[0].vertices.length).toEqual(n + 1)
    })
  })

  describe('what is produced is counted, not only what was estimated', () => {
    it('a block whose cost depends on where it is reached from cannot slip past the limit', () => {
      // B costed inside A sees its insert of A as a self-insert; reached through C, it expands A in full.
      const parsed = parseString(
        dxf(
          section(
            'BLOCKS',
            ...block('L', ...line()),
            ...block('A', ...insert('B'), ...insert('L', 70, 100, 71, 100)),
            ...block('B', ...line(), ...insert('A')),
            ...block('C', ...insert('B')),
          ),
          section('ENTITIES', ...insert('A'), ...insert('C', 70, 10, 71, 10)),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 200000 })).toThrow(
        /too many/i,
      )
    })

    it('the steps that place each copy are counted with it', () => {
      // A chain of 50 blocks ending in 20 lines: under 300 units for the copies, inserts and places, over
      // 1,000 once each line's 50 placing steps are counted. So 800 is refused and 2,000 is not.
      const lines = Array.from({ length: 20 }, () => line()).flat()
      const chain = Array.from({ length: 50 }, (_, i) =>
        i === 49
          ? block(`B${i}`, ...lines)
          : block(`B${i}`, ...insert(`B${i + 1}`)),
      )
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...chain.flat()),
          section('ENTITIES', ...insert('B0')),
          eof,
        ),
      )
      expect(() => denormalise(parsed, { maxEntities: 800 })).toThrow(
        /too many/i,
      )
      expect(denormalise(parsed, { maxEntities: 2000 }).length).toEqual(20)
    })

    it('toPolylines counts the points it draws against the same limit', () => {
      const circle = [0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 40, 1]
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...circle)),
          section('ENTITIES', ...insert('A', 70, 100, 71, 100)),
          eof,
        ),
      )
      expect(denormalise(parsed, { maxEntities: 200000 }).length).toEqual(10000)
      expect(() => toPolylines(parsed, { maxEntities: 200000 })).toThrow(
        /too many/i,
      )
    })
  })

  describe('what drawing produces', () => {
    const circle = [0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 40, 1]

    it('toPolylines does not count the points of shapes written directly in the file', () => {
      const circles = Array.from({ length: 2000 }, () => circle).flat()
      const parsed = parseString(dxf(section('ENTITIES', ...circles), eof))
      expect(
        toPolylines(parsed, { maxEntities: 1000 }).polylines.length,
      ).toEqual(2000)
    })

    it('toSVG refuses output longer than maxSvgLength rather than building it', () => {
      const parsed = parseString(
        dxf(
          section('BLOCKS', ...block('A', ...circle)),
          section('ENTITIES', ...insert('A', 70, 100, 71, 100)),
          eof,
        ),
      )
      expect(() => toSVG(parsed, { maxSvgLength: 100000 })).toThrow(
        /characters/i,
      )
      expect(typeof toSVG(parsed)).toEqual('string')
    })

    it('a polyline with many bulged vertices converts in linear time', function () {
      this.timeout(3000)
      const pairs = [0, 'SECTION', 2, 'ENTITIES', 0, 'LWPOLYLINE', 8, '0']
      for (let i = 0; i < 20000; i++) pairs.push(10, i, 20, 0, 42, 0.5)
      pairs.push(0, 'ENDSEC', 0, 'EOF')
      const { polylines } = toPolylines(parseString(dxf(pairs)))
      expect(polylines[0].vertices.length).toBeGreaterThan(20000)
    })
  })
})
