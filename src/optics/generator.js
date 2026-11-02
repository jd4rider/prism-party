/*
 * Level generation.
 *
 * Every level is built by walking a beam through the board and placing the
 * devices that steer it, so the solved configuration is known before the level
 * exists. The scramble then breaks it, and the solver re-derives the solution
 * independently — a level ships only when the solver agrees it is solvable and
 * that the starting position is not already solved.
 */

import { COLORS, DELTA, FILTER_CYCLE, isDark, maskColor, mirrorRotationFor, turn } from './model.js'

export function mulberry32(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (random, list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
const randInt = (random, min, max) => min + Math.floor(random() * (max - min + 1))

export const WORLD_DEFS = [
  { id: 1, name: 'The Reflection Garden', subtitle: 'Bend the light', mechanics: ['mirror'], size: [5, 5] },
  { id: 2, name: 'Rainbow Workshop', subtitle: 'Split the spectrum', mechanics: ['mirror', 'filter', 'prism'], size: [6, 6] },
  { id: 3, name: 'Crystal Caverns', subtitle: 'Share the beam', mechanics: ['mirror', 'filter', 'prism', 'splitter'], size: [7, 7] },
  {
    id: 4,
    name: 'Starlight Observatory',
    subtitle: 'Open the shutters',
    mechanics: ['mirror', 'filter', 'prism', 'splitter', 'portal', 'gate'],
    size: [8, 8],
  },
  {
    id: 5,
    name: 'The Grand Prism Palace',
    subtitle: 'Every trick at once',
    mechanics: ['mirror', 'filter', 'prism', 'splitter', 'portal', 'gate'],
    size: [9, 9],
  },
]

const CHANNEL_NAMES = { r: 'red', g: 'green', b: 'blue' }

/** The colour a receiving crystal should ask for, given what is arriving. */
export function dominantColor(color) {
  const on = ['r', 'g', 'b'].filter((channel) => color[channel] > 0.15)
  if (on.length === 3) return 'white'
  if (on.length === 2) {
    if (!on.includes('b')) return 'yellow'
    if (!on.includes('r')) return 'cyan'
    return 'magenta'
  }
  if (on.length === 1) return CHANNEL_NAMES[on[0]]
  return 'white'
}

/**
 * Build one candidate board. Returns null when the walk paints itself into a
 * corner — common enough that callers retry with a new seed.
 */
export function buildCandidate({ world, size, random }) {
  const def = WORLD_DEFS.find((definition) => definition.id === world)
  const allowed = new Set(def.mechanics)
  const [width, height] = size

  const devices = []
  const taken = new Set()
  const key = (x, y) => `${x},${y}`
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
  const free = (x, y) => inside(x, y) && !taken.has(key(x, y))
  let serial = 0
  const place = (device) => {
    if (!free(device.x, device.y)) return null
    taken.add(key(device.x, device.y))
    const placed = { ...device, id: device.id ?? `d${(serial += 1)}` }
    devices.push(placed)
    return placed
  }

  // --- emitter on a random edge, aimed inwards -------------------------------
  const edge = randInt(random, 0, 3)
  let start
  if (edge === 0) start = { x: 0, y: randInt(random, 0, height - 1), rotation: 1 }
  else if (edge === 1) start = { x: width - 1, y: randInt(random, 0, height - 1), rotation: 3 }
  else if (edge === 2) start = { x: randInt(random, 0, width - 1), y: 0, rotation: 2 }
  else start = { x: randInt(random, 0, width - 1), y: height - 1, rotation: 0 }

  const emitterColor = world >= 2 && random() < 0.4 ? pick(random, ['yellow', 'cyan', 'magenta']) : 'white'
  place({ id: 'e1', type: 'emitter', x: start.x, y: start.y, rotation: start.rotation, color: emitterColor })

  let position = { x: start.x, y: start.y }
  let direction = start.rotation
  let color = { ...COLORS[emitterColor] }
  const path = [] // cells the beam occupies, in order
  const turnCells = []

  // --- walk the beam, turning with mirrors or prisms -------------------------
  const turns = randInt(random, width <= 5 ? 2 : 2, 3)
  let prismUsed = false
  for (let leg = 0; leg <= turns; leg += 1) {
    const distance = randInt(random, 1, width <= 5 ? 2 : 3)
    for (let step = 0; step < distance; step += 1) {
      const next = { x: position.x + DELTA[direction].x, y: position.y + DELTA[direction].y }
      if (!free(next.x, next.y)) return null
      position = next
      path.push({ ...position, direction })
    }
    if (leg === turns) break

    const side = random() < 0.5 ? -1 : 1
    const newDirection = turn(direction, side)
    const usePrism = allowed.has('prism') && !prismUsed && random() < 0.3
    if (usePrism) {
      // Green leaves a prism at turn(dir, rotation), so the rotation is the turn.
      const rotation = (side + 4) % 4
      place({ type: 'prism', x: position.x, y: position.y, rotation, rotatable: true })
      prismUsed = true
      color = { r: 0, g: 0.92, b: 0 }
    } else {
      const rotation = mirrorRotationFor(direction, newDirection)
      if (rotation === null) return null
      place({ type: 'mirror', x: position.x, y: position.y, rotation, rotatable: true })
    }
    turnCells.push({ x: position.x, y: position.y })
    direction = newDirection
  }

  // --- optional fixed colour filter on a straight part of the path -----------
  if (allowed.has('filter') && random() < 0.55) {
    const spot = path.find((cell) => !taken.has(key(cell.x, cell.y)))
    if (spot) {
      const pass = pick(random, FILTER_CYCLE)
      const filtered = maskColor(color, COLORS[pass])
      if (!isDark(filtered) && dominantColor(filtered) !== dominantColor(color)) {
        place({ type: 'filter', x: spot.x, y: spot.y, rotation: 0, pass })
        color = filtered
      }
    }
  }

  const ahead = (from, dir, steps = 1) => ({
    x: from.x + DELTA[dir].x * steps,
    y: from.y + DELTA[dir].y * steps,
  })
  const required = dominantColor(color)

  // --- splitter ending: two crystals share the beam --------------------------
  if (allowed.has('splitter') && random() < 0.35) {
    const splitCell = ahead(position, direction)
    if (!free(splitCell.x, splitCell.y)) return null
    const first = ahead(splitCell, direction)
    const sideDirection = turn(direction, 1)
    const second = ahead(splitCell, sideDirection)
    if (!free(first.x, first.y) || !free(second.x, second.y)) return null
    place({ type: 'splitter', x: splitCell.x, y: splitCell.y, rotation: 0, rotatable: true })
    place({ id: 'r1', type: 'receiver', x: first.x, y: first.y, rotation: 0, required, minIntensity: 0.4 })
    place({ id: 'r2', type: 'receiver', x: second.x, y: second.y, rotation: 0, required, minIntensity: 0.4 })
    return assemble()
  }

  // --- portal ending: the beam leaves and re-enters somewhere else -----------
  if (allowed.has('portal') && random() < 0.4) {
    const entry = ahead(position, direction)
    if (!free(entry.x, entry.y)) return null
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const exit = { x: randInt(random, 0, width - 1), y: randInt(random, 0, height - 1) }
      if (!free(exit.x, exit.y)) continue
      const landing = ahead(exit, direction)
      if (!free(landing.x, landing.y)) continue
      place({ id: 'pa', type: 'portal', x: entry.x, y: entry.y, rotation: 0, pair: 'a' })
      place({ id: 'pb', type: 'portal', x: exit.x, y: exit.y, rotation: 0, pair: 'a' })
      place({ id: 'r1', type: 'receiver', x: landing.x, y: landing.y, rotation: 0, required })
      return assemble()
    }
    return null
  }

  // --- ordinary ending: one crystal at the end of the beam -------------------
  const landing = ahead(position, direction)
  if (!free(landing.x, landing.y)) return null
  place({ id: 'r1', type: 'receiver', x: landing.x, y: landing.y, rotation: 0, required })

  // --- optional shutter: the beam only finishes if a side beam hits a switch --
  if (allowed.has('gate') && random() < 0.75) {
    const gateCell = path.find((cell) => !taken.has(key(cell.x, cell.y)))
    if (gateCell) {
      const network = buildGateNetwork({ width, height, random, free, taken, key, path })
      if (network) {
        place({ id: 'g1', type: 'gate', x: gateCell.x, y: gateCell.y, rotation: 0, switchId: 'sw1' })
        place({ id: 'e2', type: 'emitter', ...network.emitter, color: 'white' })
        place({ type: 'mirror', ...network.mirror, rotatable: true })
        place({ id: 'sw1', type: 'switch', ...network.switch })
      }
    }
  }

  return assemble()

  function assemble() {
    return { width, height, devices, emitterColor }
  }
}

/**
 * Find a side network that a beam can complete: emitter -> mirror -> switch.
 * The controller reference is a `free` closure over the level's occupancy.
 */
function buildGateNetwork({ width, height, random, free, taken, key, path }) {
  // The side beam may cross empty cells of the main beam; what it may not do is
  // land on a device, or park the switch where the main beam would hit it.
  const mainPath = new Set(path.map((cell) => key(cell.x, cell.y)))
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mirrorCell = { x: randInt(random, 1, width - 2), y: randInt(random, 1, height - 2) }
    if (!free(mirrorCell.x, mirrorCell.y)) continue
    const outDirection = randInt(random, 0, 3)
    const inDirection = randInt(random, 0, 3)
    if (inDirection === outDirection || turn(outDirection, 2) === inDirection) continue
    const armLength = randInt(random, 2, 4)
    const shotLength = randInt(random, 1, 2)
    const emitterCell = { x: mirrorCell.x + DELTA[inDirection].x * armLength, y: mirrorCell.y + DELTA[inDirection].y * armLength }
    const switchCell = { x: mirrorCell.x + DELTA[outDirection].x * shotLength, y: mirrorCell.y + DELTA[outDirection].y * shotLength }

    let clear = true
    for (const cell of [emitterCell, switchCell]) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) clear = false
      else if (taken.has(key(cell.x, cell.y))) clear = false
    }
    if (mainPath.has(key(switchCell.x, switchCell.y))) clear = false
    for (let step = 1; step < armLength; step += 1) {
      const cell = { x: mirrorCell.x + DELTA[inDirection].x * step, y: mirrorCell.y + DELTA[inDirection].y * step }
      if (taken.has(key(cell.x, cell.y))) clear = false
    }
    if (!clear) continue

    // The emitter sits at mirror + L*in, so it has to fire the opposite way to
    // travel towards the mirror.
    const travel = turn(inDirection, 2)
    const rotation = mirrorRotationFor(travel, outDirection)
    if (rotation === null) continue
    for (let step = 1; step < shotLength; step += 1) {
      const cell = { x: mirrorCell.x + DELTA[outDirection].x * step, y: mirrorCell.y + DELTA[outDirection].y * step }
      if (taken.has(key(cell.x, cell.y))) clear = false
    }
    if (!clear) continue
    return {
      emitter: { x: emitterCell.x, y: emitterCell.y, rotation: travel },
      mirror: { x: mirrorCell.x, y: mirrorCell.y, rotation },
      switch: { x: switchCell.x, y: switchCell.y, rotation: 0 },
    }
  }
  return null
}
