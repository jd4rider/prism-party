/*
 * Puzzle solver.
 *
 * Every rotatable device has a small state space (mirrors 2, prisms and
 * splitters 4, filters 6), and a level never uses more than a handful, so the
 * campaign can be enumerated exhaustively rather than searched heuristically.
 * That gives exact solution counts, exact minimum move counts and hints that
 * are true rather than plausible.
 */

import { evaluate } from './engine.js'
import { deviceStates } from './model.js'

export function rotatableDevices(level) {
  return level.devices.filter((device) => device.rotatable)
}

export function stateSpaceSize(level) {
  return rotatableDevices(level).reduce((total, device) => total * deviceStates(device), 1)
}

/** Hamming distance between two rotation maps, in device changes. */
export function moveDistance(level, a, b) {
  let distance = 0
  for (const device of rotatableDevices(level)) {
    const left = a?.[device.id] ?? device.rotation ?? 0
    const right = b?.[device.id] ?? device.rotation ?? 0
    if (left !== right) distance += 1
  }
  return distance
}

/**
 * Walk every rotation combination. `visit` returning true stops the walk,
 * which is how "find any solution" avoids enumerating the rest.
 */
export function forEachConfiguration(level, visit, { budget = 200000 } = {}) {
  const devices = rotatableDevices(level)
  const rotations = {}
  let evaluated = 0
  let stopped = false

  function recurse(index) {
    if (stopped) return
    if (index === devices.length) {
      evaluated += 1
      if (evaluated > budget) {
        stopped = true
        return
      }
      if (visit({ ...rotations }, evaluated - 1)) stopped = true
      return
    }
    const device = devices[index]
    const states = deviceStates(device)
    for (let state = 0; state < states; state += 1) {
      rotations[device.id] = state
      recurse(index + 1)
      if (stopped) return
    }
  }

  recurse(0)
  return { evaluated, truncated: stopped && evaluated >= budget }
}

/**
 * Find every solution, up to `maxSolutions`. Each solution carries the move
 * distance from `from`, which is what the hint system and star thresholds use.
 */
export function solve(level, { from = null, maxSolutions = 12, budget = 200000 } = {}) {
  const solutions = []
  let evaluated = 0
  let truncated = false

  const walk = forEachConfiguration(
    level,
    (rotations) => {
      evaluated += 1
      const result = evaluate(level, rotations)
      if (!result.solved) return false
      solutions.push({ rotations, moves: from ? moveDistance(level, from, rotations) : 0 })
      return solutions.length >= maxSolutions
    },
    { budget },
  )

  return {
    solutions: solutions.sort((a, b) => a.moves - b.moves),
    evaluated: walk.evaluated,
    truncated: walk.truncated,
    count: solutions.length,
  }
}

/** The nearest solution to a player's current board, for hints. */
export function nearestSolution(level, rotations, options = {}) {
  const { solutions } = solve(level, { from: rotations, ...options })
  return solutions[0] ?? null
}

/**
 * Difficulty from things a player feels: how many separate devices have to be
 * right, how much colour logic is involved, and how many solutions exist.
 */
export function rateDifficulty(level, solutionCount = 1) {
  const rotatable = rotatableDevices(level)
  const mechanics = new Set(level.devices.map((device) => device.type))
  // One point per device that must be turned, plus a little for each piece of
  // optical logic the player has to reason about.
  let score = rotatable.length * 0.7
  for (const type of ['prism', 'filter', 'splitter', 'portal', 'combiner']) if (mechanics.has(type)) score += 0.4
  if (mechanics.has('gate')) score += 1.1
  if (solutionCount > 4) score -= 0.5
  if (level.devices.filter((device) => device.type === 'receiver').length > 1) score += 0.5
  return Math.max(1, Math.min(5, Math.round(score)))
}

/** Validate the structural rules a level must satisfy before it can ship. */
export function validateLevel(level) {
  const problems = []
  if (!level || !level.devices) return ['missing devices']
  if (level.width < 3 || level.height < 3) problems.push('board too small')
  if (level.width > 12 || level.height > 12) problems.push('board too large')

  const occupied = new Set()
  for (const device of level.devices) {
    const key = `${device.x},${device.y}`
    if (device.x < 0 || device.y < 0 || device.x >= level.width || device.y >= level.height) {
      problems.push(`${device.id} is outside the board`)
    }
    if (occupied.has(key)) problems.push(`two devices share ${key}`)
    occupied.add(key)
  }

  if (!level.devices.some((device) => device.type === 'emitter')) problems.push('no emitter')
  if (!level.devices.some((device) => device.type === 'receiver')) problems.push('no receiver')

  for (const device of level.devices) {
    if (device.type === 'gate' && !level.devices.some((other) => other.id === device.switchId && other.type === 'switch')) {
      problems.push(`${device.id} points at a missing switch`)
    }
    if (device.type === 'portal' && !level.devices.some((other) => other.type === 'portal' && other.pair === device.pair && other.id !== device.id)) {
      problems.push(`${device.id} has no portal partner`)
    }
  }

  return problems
}

/** Everything the campaign bake needs to know about one level. */
export function inspectLevel(level) {
  const problems = validateLevel(level)
  if (problems.length > 0) return { ok: false, problems }
  if (evaluate(level, level.initialRotations ?? {}).solved) {
    return { ok: false, problems: ['starts already solved'] }
  }
  const { solutions, truncated, evaluated } = solve(level, { from: level.initialRotations ?? {}, maxSolutions: 24 })
  if (solutions.length === 0) return { ok: false, problems: ['no solution'], evaluated, truncated }
  const best = solutions[0]
  return {
    ok: true,
    problems: [],
    solutions,
    solution: best.rotations,
    minMoves: best.moves,
    solutionCount: solutions.length,
    difficulty: rateDifficulty(level, solutions.length),
    evaluated,
    truncated,
  }
}
