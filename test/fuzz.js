// Damaged files: cuts, drops, changes and inserts pairs in every sample file under test/resources, then
// reports each distinct way parsing, flattening, polylines or SVG throws. Each file is damaged from its
// own seed, so a run is repeatable on any machine.
//
//   npm run test:fuzz
//
// Exits 1 if anything throws other than the deliberate DXF_TOO_MANY_ENTITIES limit.
import fs from 'fs'
import path from 'path'

import { parseString, denormalise, toPolylines, toSVG, config } from '../src'

config.verbose = false
// The library's own error log would bury the report; failures are collected below instead.
console.error = () => {}

const dir = path.join(__dirname, 'resources')
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.dxf'))
  .sort()

// mulberry32: a small generator whose every bit is used, seeded per file.
let state = 0
const reseed = (text) => {
  state = 2166136261
  for (let i = 0; i < text.length; i++)
    state = Math.imul(state ^ text.charCodeAt(i), 16777619)
}
const rand = (n) => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) % n
}

// Ways a file can be damaged: cut short, a pair dropped, a value changed, two pairs swapped.
const mutations = [
  (lines) => lines.slice(0, rand(lines.length)),
  (lines) => {
    const i = rand(lines.length >> 1) * 2
    return [...lines.slice(0, i), ...lines.slice(i + 2)]
  },
  (lines) => {
    const i = rand(lines.length >> 1) * 2 + 1
    const values = [
      '',
      '-1',
      '1e309',
      'NaN',
      'SECTION',
      'ENDSEC',
      'BLOCK',
      'ENDBLK',
      'SEQEND',
      'VERTEX',
      '0',
      '999999',
    ]
    const out = lines.slice()
    out[i] = values[rand(values.length)]
    return out
  },
  // A structural pair dropped in at random: what a cut-and-paste or a broken exporter leaves.
  (lines) => {
    const pool = [
      ['0', 'SECTION'],
      ['0', 'ENDSEC'],
      ['0', 'BLOCK'],
      ['0', 'ENDBLK'],
      ['0', 'TABLE'],
      ['0', 'ENDTAB'],
      ['0', 'INSERT'],
      ['2', 'NOPE'],
      ['0', 'POLYLINE'],
      ['0', 'VERTEX'],
      ['0', 'SEQEND'],
      ['0', 'HATCH'],
      ['0', 'LWPOLYLINE'],
      ['0', 'SPLINE'],
      ['0', 'MTEXT'],
      ['0', 'DIMENSION'],
      ['0', 'LAYER'],
      ['0', 'LTYPE'],
      ['74', '1'],
      ['45', '1'],
      ['42', '1'],
      ['93', '5'],
      ['92', '2'],
      ['72', '1'],
      ['73', '1'],
      ['70', '9'],
    ]
    let out = lines.slice()
    for (let n = 1 + rand(3); n > 0; n--) {
      const i = rand(out.length >> 1) * 2
      out = [...out.slice(0, i), ...pool[rand(pool.length)], ...out.slice(i)]
    }
    return out
  },
  (lines) => {
    const i = rand(lines.length >> 1) * 2
    const j = rand(lines.length >> 1) * 2
    const out = lines.slice()
    ;[out[i], out[i + 1], out[j], out[j + 1]] = [
      out[j],
      out[j + 1],
      out[i],
      out[i + 1],
    ]
    return out
  },
]

const seen = new Map()
const limits = { maxEntities: 200000 }
const stages = {
  parse: parseString,
  flatten: (p) => denormalise(p, limits),
  polylines: (p) => toPolylines(p, limits),
  svg: (p) => toSVG(p, limits),
}
for (const file of files) {
  reseed(file)
  const lines = fs
    .readFileSync(path.join(dir, file), 'utf-8')
    .split(/\r\n|\r|\n/g)
  for (let k = 0; k < 300; k++) {
    const text = mutations[rand(mutations.length)](lines).join('\n')
    let parsed
    for (const [stage, fn] of Object.entries(stages)) {
      try {
        const out = stage === 'parse' ? fn(text) : fn(parsed)
        if (stage === 'parse') parsed = out
      } catch (err) {
        if (err && err.code === 'DXF_TOO_MANY_ENTITIES') break
        const frame =
          (err.stack || '')
            .split('\n')
            .find((l) => l.includes(path.sep + 'src' + path.sep)) || ''
        const key = `${stage}: ${err.name}: ${err.message.replace(/'[^']*'/g, "'…'")} @ ${frame.trim().replace(/.*src[\\/]/, 'src/')}`
        if (!seen.has(key)) seen.set(key, file)
        break
      }
    }
  }
}
for (const [key, file] of seen) console.log(`${key}    [${file}]`)
console.log(`\n${seen.size} distinct failure(s) over ${files.length} files`)
process.exit(seen.size ? 1 : 0)
