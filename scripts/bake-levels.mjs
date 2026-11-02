/*
 * Bake the campaign.
 *
 *   node scripts/bake-levels.mjs [--world 3] [--count 40] [--verbose]
 *
 * Builds candidate boards, solves each one exhaustively, scrambles the ones
 * that have a solution, and writes src/levels/campaign.js. Any level that fails
 * validation is dropped rather than shipped, so the level count in the output
 * is a fact rather than a target.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORLD_DEFS, buildCandidate, mulberry32 } from '../src/optics/generator.js'
import { inspectLevel, moveDistance } from '../src/optics/solver.js'
import { evaluate } from '../src/optics/engine.js'
import { deviceStates } from '../src/optics/model.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? Number(args[index + 1]) : fallback
}
const onlyWorld = argValue('world', 0)
const targetCount = argValue('count', 40)
const verbose = args.includes('--verbose')

function scramble(level, random) {
  const rotatable = level.devices.filter((device) => device.rotatable)
  const rotations = {}
  for (const device of rotatable) rotations[device.id] = Math.floor(random() * deviceStates(device))
  return rotations
}

function buildLevel(worldDef, number) {
  let attempts = 0
  while (attempts < 160) {
    attempts += 1
    const seed = worldDef.id * 100000 + number * 131 + attempts * 7717
    const random = mulberry32(seed)
    const candidate = buildCandidate({ world: worldDef.id, size: worldDef.size, random })
    if (!candidate) continue

    const level = {
      id: `w${worldDef.id}-${String(number).padStart(2, '0')}`,
      world: worldDef.id,
      number,
      width: candidate.width,
      height: candidate.height,
      devices: candidate.devices,
      seed,
    }

    // The construction's own configuration must actually finish the board. If
    // it does not, the generator wired something wrong and the candidate is
    // thrown away rather than patched up.
    const builtRotations = {}
    for (const device of level.devices) if (device.rotatable) builtRotations[device.id] = device.rotation ?? 0
    if (!evaluate(level, builtRotations).solved) continue

    // Scramble the solution and make sure the player has real work to do.
    let initial = null
    let best = null
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rotations = scramble(level, random)
      if (evaluate(level, rotations).solved) continue
      const inspected = inspectLevel({ ...level, initialRotations: rotations })
      if (!inspected.ok) continue
      if (inspected.minMoves < 2) continue
      initial = rotations
      best = inspected
      break
    }
    if (!initial || !best) continue

    const solution = best.solution
    // The scrambler can land on a solution other than the one we built; the
    // stored solution must satisfy the level as shipped.
    if (!evaluate(level, solution).solved) continue
    if (moveDistance(level, initial, solution) !== best.minMoves) continue

    return {
      ...level,
      initialRotations: initial,
      solution,
      minMoves: best.minMoves,
      solutionCount: best.solutionCount,
      difficulty: best.difficulty,
      mechanics: [...new Set(level.devices.map((device) => device.type))].sort(),
      attempts,
    }
  }
  return null
}

const worlds = []
const levels = []
const failures = []

for (const worldDef of WORLD_DEFS) {
  if (onlyWorld && worldDef.id !== onlyWorld) continue
  const made = []
  for (let number = 1; number <= targetCount; number += 1) {
    const level = buildLevel(worldDef, number)
    if (!level) {
      failures.push(`${worldDef.id}/${number}`)
      continue
    }
    made.push(level)
    levels.push(level)
    if (verbose) {
      console.log(
        `  ${level.id} ${level.width}x${level.height} devices=${level.devices.length} rotatable=${
          level.devices.filter((device) => device.rotatable).length
        } moves=${level.minMoves} solutions=${level.solutionCount} attempts=${level.attempts}`,
      )
    }
  }
  // Order each world by how hard it actually is, so the campaign ramps up
  // instead of bouncing around because of the seed order.
  made.sort((a, b) => a.difficulty - b.difficulty || a.minMoves - b.minMoves || a.number - b.number)
  made.forEach((level, position) => {
    level.number = position + 1
    level.id = `w${worldDef.id}-${String(position + 1).padStart(2, '0')}`
  })
  worlds.push({ ...worldDef, levelCount: made.length })
  console.log(`world ${worldDef.id} — ${worldDef.name}: ${made.length}/${targetCount} levels, ${failures.length} failed so far`)
}

levels.sort((a, b) => a.world - b.world || a.number - b.number)
levels.forEach((level, index) => {
  level.index = index + 1
})

const byWorld = new Map()
for (const level of levels) byWorld.set(level.world, (byWorld.get(level.world) ?? 0) + 1)
const withMechanic = (type) => levels.filter((level) => level.devices.some((device) => device.type === type)).length

console.log('\nmechanics coverage')
for (const type of ['mirror', 'prism', 'filter', 'splitter', 'portal', 'gate', 'switch', 'combiner']) {
  console.log(`  ${type.padEnd(9)} ${withMechanic(type)} levels`)
}
console.log('\nsolutions per level')
const buckets = {}
for (const level of levels) buckets[level.solutionCount] = (buckets[level.solutionCount] ?? 0) + 1
console.log(buckets)
console.log('difficulty spread', levels.reduce((out, level) => ({ ...out, [level.difficulty]: (out[level.difficulty] ?? 0) + 1 }), {}))

const header = `// Generated by scripts/bake-levels.mjs — do not edit by hand.
// Every level below was built from a solved configuration and then re-solved
// independently; a level that failed validation was dropped, not shipped.
`
const body = `export const WORLDS = ${JSON.stringify(
  WORLD_DEFS.map((definition) => ({
    ...definition,
    levelCount: byWorld.get(definition.id) ?? 0,
    firstIndex: levels.find((level) => level.world === definition.id)?.index ?? 0,
  })),
  null,
  2,
)}

export const LEVELS = ${JSON.stringify(levels)}

export const LEVEL_COUNT = LEVELS.length

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index - 1))]
}

export function levelsOfWorld(world) {
  return LEVELS.filter((level) => level.world === world)
}
`

await mkdir(resolve(root, 'src/levels'), { recursive: true })
await writeFile(resolve(root, 'src/levels/campaign.js'), `${header}\n${body}`)
console.log(`\nwrote ${levels.length} levels (${failures.length} rejected) to src/levels/campaign.js`)
if (failures.length > 0) console.log('rejected:', failures.join(', '))
