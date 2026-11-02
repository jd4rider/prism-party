/*
 * Puzzle solver.
 *
 * The search covers both kinds of player action: turning a device already on the
 * board, and placing a tray piece into a socket. With a handful of devices and at
 * most two sockets the whole space is enumerable, so the campaign gets exact
 * solution counts, exact minimum action counts and hints that are true rather
 * than plausible.
 */

import { evaluate, evaluateState, resolveLevel } from './engine.js'
import { deviceStates } from './model.js'

export function boardDevices(level) {
  return level.devices.filter((device) => device.rotatable && device.type !== 'socket')
}

export function socketsOf(level) {
  return level.devices.filter((device) => device.type === 'socket')
}

export function trayOf(level) {
  return level.tray ?? []
}

export function rotatableDevices(level) {
  return boardDevices(level)
}

function statesForPiece(piece) {
  return piece.type === 'filter' ? 6 : piece.type === 'mirror' ? 2 : 4
}

/** Every legal way to fill the sockets, including leaving them empty. */
export function placementOptions(level) {
  const sockets = socketsOf(level)
  const tray = trayOf(level)
  if (sockets.length === 0) return [{}]

  const options = []
  const used = new Set()
  const current = {}
  const recurse = (index) => {
    if (index === sockets.length) {
      options.push({ ...current })
      return
    }
    recurse(index + 1) // leave this socket empty
    for (const piece of tray) {
      if (used.has(piece.id)) continue
      used.add(piece.id)
      current[sockets[index].id] = piece.id
      recurse(index + 1)
      delete current[sockets[index].id]
      used.delete(piece.id)
    }
  }
  recurse(0)
  return options
}

export function stateSpaceSize(level) {
  const placements = placementOptions(level).length
  let rotations = 1
  for (const device of boardDevices(level)) rotations *= deviceStates(device)
  const tray = trayOf(level)
  for (const piece of tray) rotations *= statesForPiece(piece)
  return placements * rotations
}

export function normalizeState(state) {
  if (!state || typeof state !== 'object') return { rotations: {}, placements: {} }
  if (state.rotations || state.placements) {
    return { rotations: state.rotations ?? {}, placements: state.placements ?? {} }
  }
  return { rotations: state, placements: {} }
}

/**
 * Actions needed to get from one state to another: one turn per device whose
 * rotation differs, one action per socket that ends up holding a different piece,
 * and one more for any placed piece that also has to be turned. A piece can only
 * be turned while it is in a socket, so turning a piece you just placed is two
 * separate taps.
 */
export function moveDistance(level, a, b) {
  const left = normalizeState(a)
  const right = normalizeState(b)
  let distance = 0

  for (const device of boardDevices(level)) {
    const from = left.rotations[device.id] ?? device.rotation ?? 0
    const to = right.rotations[device.id] ?? device.rotation ?? 0
    if (from !== to) distance += 1
  }

  for (const socket of socketsOf(level)) {
    const from = left.placements[socket.id] ?? null
    const to = right.placements[socket.id] ?? null
    if (from !== to) distance += 1
  }

  const placedAtEnd = new Set(Object.values(right.placements).filter(Boolean))
  for (const pieceId of placedAtEnd) {
    if ((left.rotations[pieceId] ?? 0) !== (right.rotations[pieceId] ?? 0)) distance += 1
  }

  return distance
}

/**
 * Walk every placement × rotation combination. `visit` returning true stops the
 * walk, which is how "find any solution" avoids enumerating the rest.
 */
export function forEachConfiguration(level, visit, { budget = 400000 } = {}) {
  const devices = boardDevices(level)
  const placements = placementOptions(level)
  const tray = trayOf(level)
  const rotations = {}
  let evaluated = 0
  let stopped = false

  const rotate = (index, onDone) => {
    if (stopped) return
    if (index === devices.length) {
      onDone()
      return
    }
    const device = devices[index]
    const states = deviceStates(device)
    for (let state = 0; state < states; state += 1) {
      rotations[device.id] = state
      rotate(index + 1, onDone)
      if (stopped) return
    }
  }

  const rotatePieces = (placement, list, index, onDone) => {
    if (stopped) return
    if (index === list.length) {
      onDone()
      return
    }
    const piece = list[index]
    const states = statesForPiece(piece)
    for (let state = 0; state < states; state += 1) {
      rotations[piece.id] = state
      rotatePieces(placement, list, index + 1, onDone)
      if (stopped) return
    }
  }

  for (const placement of placements) {
    if (stopped) break
    const placed = Object.values(placement)
      .map((id) => tray.find((piece) => piece.id === id))
      .filter(Boolean)
    rotate(0, () => {
      rotatePieces(placement, placed, 0, () => {
        evaluated += 1
        if (evaluated > budget) {
          stopped = true
          return
        }
        if (visit({ rotations: { ...rotations }, placements: { ...placement } }, evaluated - 1)) stopped = true
      })
    })
  }

  return { evaluated, truncated: stopped && evaluated >= budget }
}

/**
 * Two states that resolve to the same devices are the same answer. Without this,
 * swapping two identical mirror pieces counts as a second solution, which is not
 * something a player could ever distinguish.
 */
export function canonicalKey(level, state) {
  const resolved = resolveLevel(level, state)
  const rotations = state?.rotations ?? state ?? {}
  const parts = resolved.devices.map((device) => {
    const rotation = device.rotatable || device.type === 'emitter' ? (rotations[device.id] ?? device.rotation ?? 0) : ''
    return `${device.type}@${device.x},${device.y}:${rotation}:${device.required ?? device.color ?? ''}:${device.enter ?? ''}`
  })
  parts.sort()
  return parts.join('|')
}

export function solve(level, { from = null, maxSolutions = 12, budget = 400000 } = {}) {
  const solutions = []
  const seenBoards = new Set()
  let evaluated = 0

  const walk = forEachConfiguration(
    level,
    (state) => {
      evaluated += 1
      if (!evaluateState(level, state).solved) return false
      const key = canonicalKey(level, state)
      if (seenBoards.has(key)) return false
      seenBoards.add(key)
      solutions.push({
        rotations: state.rotations,
        placements: state.placements,
        moves: from ? moveDistance(level, from, state) : 0,
      })
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

export function nearestSolution(level, state, options = {}) {
  const { solutions } = solve(level, { from: state, ...options })
  return solutions[0] ?? null
}

/**
 * Difficulty from things a player feels: how many separate actions have to be
 * right, how much colour logic and how many mechanics are in play.
 */
export function rateDifficulty(level, solutionCount = 1) {
  const actions = boardDevices(level).length + socketsOf(level).length
  const mechanics = new Set(level.devices.map((device) => device.type))
  let score = actions * 0.62
  for (const type of ['prism', 'filter', 'splitter', 'portal', 'combiner', 'socket']) {
    if (mechanics.has(type)) score += 0.45
  }
  if (mechanics.has('door')) score += 1.1
  if (mechanics.has('blocker')) score += 0.35
  if (level.devices.filter((device) => device.type === 'emitter').length > 1) score += 0.7
  if (level.devices.filter((device) => device.type === 'receiver').length > 1) score += 0.55
  if (level.devices.some((device) => device.type === 'receiver' && device.enter !== undefined)) score += 0.5
  if (solutionCount > 4) score -= 0.4
  return Math.max(1, Math.min(5, Math.round(score)))
}

export function validateLevel(level) {
  const problems = []
  if (!level || !level.devices) return ['missing devices']
  if (level.width < 4 || level.height < 4) problems.push('board too small')
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

  const sockets = socketsOf(level).length
  const tray = trayOf(level)
  if (sockets > 0 && tray.length === 0) problems.push('sockets with an empty tray')
  if (tray.length > 0 && sockets === 0) problems.push('tray pieces with nowhere to go')
  if (tray.length > sockets) problems.push('more pieces than sockets')
  const pieceIds = new Set()
  for (const piece of tray) {
    if (pieceIds.has(piece.id)) problems.push(`duplicate piece ${piece.id}`)
    pieceIds.add(piece.id)
    if (!['mirror', 'prism', 'splitter'].includes(piece.type)) problems.push(`piece ${piece.id} has no type`)
  }

  for (const device of level.devices) {
    if (device.type === 'gate' && !level.devices.some((other) => other.id === device.switchId && other.type === 'switch')) {
      problems.push(`${device.id} points at a missing switch`)
    }
    if (
      device.type === 'portal' &&
      !level.devices.some((other) => other.type === 'portal' && other.pair === device.pair && other.id !== device.id)
    ) {
      problems.push(`${device.id} has no portal partner`)
    }
    if (device.type === 'door' && !device.color) problems.push(`${device.id} is an uncoloured door`)
  }

  return problems
}

export function inspectLevel(level) {
  const problems = validateLevel(level)
  if (problems.length > 0) return { ok: false, problems }

  const start = normalizeState(level.initialState ?? level.initialRotations ?? {})
  if (evaluateState(level, start).solved) return { ok: false, problems: ['starts already solved'] }

  const { solutions, truncated, evaluated } = solve(level, { from: start, maxSolutions: 24 })
  if (solutions.length === 0) return { ok: false, problems: ['no solution'], evaluated, truncated }

  const best = solutions[0]
  return {
    ok: true,
    problems: [],
    solutions,
    solution: { rotations: best.rotations, placements: best.placements },
    minMoves: best.moves,
    solutionCount: solutions.length,
    difficulty: rateDifficulty(level, solutions.length),
    evaluated,
    truncated,
  }
}

export { evaluate, evaluateState }
