/*
 * Verify every shipped level. This is the gate that keeps an unsolvable or
 * pre-solved board out of a release: it re-solves all 200 boards from scratch
 * with the same solver the hint system uses, including piece placement.
 *
 *   node scripts/check-levels.mjs
 */
import { LEVELS, WORLDS } from '../src/levels/campaign.js'
import { evaluateState } from '../src/optics/engine.js'
import { inspectLevel, moveDistance, validateLevel } from '../src/optics/solver.js'

const problems = []
const seenIds = new Set()
let checked = 0

for (const level of LEVELS) {
  const label = level.id ?? '(no id)'
  if (seenIds.has(label)) problems.push(`${label}: duplicate id`)
  seenIds.add(label)

  const structural = validateLevel(level)
  if (structural.length > 0) {
    problems.push(`${label}: ${structural.join('; ')}`)
    continue
  }

  const start = level.initialState
  if (!start || !start.rotations) {
    problems.push(`${label}: no starting state`)
    continue
  }
  if (evaluateState(level, start).solved) {
    problems.push(`${label}: starts already solved`)
    continue
  }
  if (evaluateState(level, level.solution).solved !== true) {
    problems.push(`${label}: the stored solution does not light every crystal`)
    continue
  }

  const inspected = inspectLevel(level)
  if (!inspected.ok) {
    problems.push(`${label}: ${inspected.problems.join('; ')}`)
    continue
  }
  if (inspected.minMoves !== level.minMoves) {
    problems.push(`${label}: minMoves is ${level.minMoves} but the solver says ${inspected.minMoves}`)
  }
  if (moveDistance(level, start, level.solution) !== level.minMoves) {
    problems.push(`${label}: the stored solution is not the nearest one`)
  }
  if (inspected.solutionCount !== 1) {
    problems.push(`${label}: ${inspected.solutionCount} solutions, expected exactly one`)
  }
  if (inspected.truncated) problems.push(`${label}: solver ran out of budget`)
  checked += 1
}

const perWorld = WORLDS.map((world) => `${world.id}:${LEVELS.filter((level) => level.world === world.id).length}`).join(' ')
console.log(`checked ${checked}/${LEVELS.length} levels (${perWorld})`)

const archetypes = {}
for (const level of LEVELS) archetypes[level.archetype] = (archetypes[level.archetype] ?? 0) + 1
console.log('archetypes:', archetypes)
console.log(`levels requiring a dragged piece: ${LEVELS.filter((level) => (level.tray?.length ?? 0) > 0).length}`)

if (LEVELS.length !== 200) problems.push(`expected 200 levels, found ${LEVELS.length}`)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('all levels valid: solvable, unique, not pre-solved, placement included')
