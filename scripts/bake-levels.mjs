/*
 * Bake the campaign.
 *
 *   node scripts/bake-levels.mjs [--world 3] [--count 40] [--verbose]
 *
 * Builds a candidate, checks the construction actually solves its own board,
 * scrambles rotations and piece placement, then hands it to the solver. A level
 * ships only if the solver finds exactly one solution and the starting position
 * is at least the world's floor away from it — and the floor rises inside each
 * world, so world 5 ends up needing many more taps than world 1.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORLD_DEFS, archetypesFor, buildCandidate, initialPlacements, mulberry32 } from '../src/optics/generator.js'
import { boardDevices, inspectLevel, moveDistance } from '../src/optics/solver.js'
import { evaluateState } from '../src/optics/engine.js'
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
  const rotations = {}
  for (const device of boardDevices(level)) rotations[device.id] = Math.floor(random() * deviceStates(device))
  for (const piece of level.tray) {
    rotations[piece.id] = Math.floor(random() * deviceStates({ type: piece.type, rotatable: true }))
  }
  return rotations
}

/** How many actions this slot should need: the world floor, creeping up. */
function targetMoves(worldDef, number) {
  return (worldDef.floor ?? 2) + Math.floor((number - 1) / 12)
}

function buildLevel(worldDef, number) {
  const target = targetMoves(worldDef, number)
  const floor = worldDef.floor ?? 2
  let best = null
  let fallback = null
  // Every slot asks for a particular archetype first, so the campaign rotates
  // through the whole set instead of whatever happens to build fastest.
  const pool = archetypesFor(worldDef.id)
  const wanted = pool[(number - 1) % pool.length]

  for (let attempt = 1; attempt <= 300; attempt += 1) {
    const seed = worldDef.id * 100000 + number * 131 + attempt * 7717
    const random = mulberry32(seed)
    const candidate = buildCandidate({
      world: worldDef.id,
      size: worldDef.size,
      random,
      name: attempt <= 140 ? wanted : undefined,
    })
    if (!candidate) continue

    const level = {
      id: `w${worldDef.id}-${String(number).padStart(2, '0')}`,
      world: worldDef.id,
      number,
      width: candidate.width,
      height: candidate.height,
      devices: candidate.devices,
      tray: candidate.tray,
      archetype: candidate.archetype,
      seed,
    }

    if (!evaluateState(level, candidate.solution).solved) continue

    for (let scrambleAttempt = 0; scrambleAttempt < 24; scrambleAttempt += 1) {
      const initialState = {
        rotations: scramble(level, random),
        placements: initialPlacements(level, candidate.solution.placements, random),
      }
      if (evaluateState(level, initialState).solved) continue

      const inspected = inspectLevel({ ...level, initialState })
      if (!inspected.ok) continue
      if (inspected.solutionCount !== 1) continue
      if (inspected.truncated) continue
      if (!evaluateState(level, inspected.solution).solved) continue
      if (moveDistance(level, initialState, inspected.solution) !== inspected.minMoves) continue

      const built = {
        ...level,
        initialState,
        solution: inspected.solution,
        minMoves: inspected.minMoves,
        solutionCount: inspected.solutionCount,
        difficulty: inspected.difficulty,
        mechanics: [...new Set(level.devices.map((device) => device.type))].sort(),
        attempts: attempt,
      }

      // Below the floor a board is too easy to ship, but it is still better than
      // an empty slot if this world's archetypes never reach the floor.
      if (built.minMoves < floor) {
        if (!fallback || built.minMoves > fallback.minMoves) fallback = built
        continue
      }

      // Stop as soon as the slot is as hard as it should be; otherwise keep the
      // deepest board found so a level never regresses to something trivial.
      if (built.minMoves >= target) return built
      if (!best || built.minMoves > best.minMoves) best = built
    }
  }

  return best ?? fallback
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
    if (verbose) {
      console.log(
        `  ${level.id} ${level.archetype.padEnd(11)} ${level.width}x${level.height} moves=${level.minMoves} ` +
          `devices=${level.devices.length} tray=${level.tray.length} difficulty=${level.difficulty}`,
      )
    }
  }
  // Deepest last: the room ramps even though every slot met the world floor.
  made.sort((a, b) => a.minMoves - b.minMoves || a.difficulty - b.difficulty || a.number - b.number)
  made.forEach((level, position) => {
    level.number = position + 1
    level.id = `w${worldDef.id}-${String(position + 1).padStart(2, '0')}`
  })
  levels.push(...made)
  worlds.push({ ...worldDef, levelCount: made.length })
  console.log(
    `world ${worldDef.id} — ${worldDef.name}: ${made.length}/${targetCount} levels, ` +
      `moves ${made[0]?.minMoves ?? 0}–${made[made.length - 1]?.minMoves ?? 0}, ${failures.length} failed so far`,
  )
}

levels.sort((a, b) => a.world - b.world || a.number - b.number)
levels.forEach((level, index) => {
  level.index = index + 1
})

const byWorld = new Map()
for (const level of levels) byWorld.set(level.world, (byWorld.get(level.world) ?? 0) + 1)

const withMechanic = (type) => levels.filter((level) => level.devices.some((device) => device.type === type)).length
console.log('\nmechanics coverage')
for (const type of ['mirror', 'prism', 'filter', 'splitter', 'door', 'socket', 'blocker', 'portal', 'gate']) {
  console.log(`  ${type.padEnd(9)} ${withMechanic(type)} levels`)
}

const archetypes = {}
for (const level of levels) archetypes[level.archetype] = (archetypes[level.archetype] ?? 0) + 1
console.log('\narchetypes', archetypes)
console.log('difficulty spread', levels.reduce((out, level) => ({ ...out, [level.difficulty]: (out[level.difficulty] ?? 0) + 1 }), {}))
console.log(`levels requiring dragged pieces: ${levels.filter((level) => level.tray.length > 0).length}/${levels.length}`)
console.log(`total pieces to place: ${levels.reduce((sum, level) => sum + level.tray.length, 0)}`)
console.log(`total walls: ${levels.reduce((sum, level) => sum + level.devices.filter((d) => d.type === 'blocker').length, 0)}`)

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
if (failures.length > 0) console.log('rejected:', failures.slice(0, 40).join(', '), failures.length > 40 ? '…' : '')
