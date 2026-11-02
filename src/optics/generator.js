/*
 * Level generation.
 *
 * Levels are built by walking a beam through the board and placing the devices
 * that steer it, so a working solution exists before the level does. Then the
 * scramble breaks it and the solver re-derives the answer independently.
 *
 * There are ten archetypes so the campaign is not one puzzle 200 times: a plain
 * mirror chain, a dense maze, a colour-filtered route through a locked door, a
 * prism fan feeding two crystals, a splitter sharing one beam, a board where the
 * mirror has to be dragged out of the tray, boards with two sockets, a two-emitter
 * board, a portal jump, and a wide labyrinth of walls. Later worlds draw from the
 * harder archetypes and build longer routes.
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
  {
    id: 1,
    name: 'The Reflection Garden',
    subtitle: 'Bend the light',
    mechanics: ['mirror', 'socket', 'blocker'],
    size: [5, 5],
    floor: 2,
  },
  {
    id: 2,
    name: 'Rainbow Workshop',
    subtitle: 'Split the spectrum',
    mechanics: ['mirror', 'filter', 'door', 'prism', 'socket'],
    size: [6, 6],
    floor: 3,
  },
  {
    id: 3,
    name: 'Crystal Caverns',
    subtitle: 'Share the beam',
    mechanics: ['mirror', 'filter', 'door', 'prism', 'splitter', 'socket'],
    size: [7, 7],
    floor: 4,
  },
  {
    id: 4,
    name: 'Starlight Observatory',
    subtitle: 'Two beams, one sky',
    mechanics: ['mirror', 'filter', 'door', 'prism', 'splitter', 'socket', 'portal'],
    size: [8, 8],
    floor: 5,
  },
  {
    id: 5,
    name: 'The Grand Prism Palace',
    subtitle: 'Every trick at once',
    mechanics: ['mirror', 'filter', 'door', 'prism', 'splitter', 'socket', 'portal'],
    size: [9, 9],
    floor: 6,
  },
]

const CHANNEL_NAMES = { r: 'red', g: 'green', b: 'blue' }

/** The colour a crystal should ask for, given what is arriving. */
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

function makeContext(width, height, random, world) {
  const ctx = {
    width,
    height,
    world,
    random,
    devices: [],
    tray: [],
    taken: new Set(),
    solution: { rotations: {}, placements: {} },
    colour: { ...COLORS.white },
    serial: 0,
    portals: 0,
    key: (x, y) => `${x},${y}`,
    inside: (x, y) => x >= 0 && y >= 0 && x < width && y < height,
    free(x, y) {
      return ctx.inside(x, y) && !ctx.taken.has(ctx.key(x, y))
    },
    add(device) {
      if (!ctx.free(device.x, device.y)) return null
      ctx.serial += 1
      const placed = { ...device, id: device.id ?? `d${ctx.serial}` }
      ctx.taken.add(ctx.key(placed.x, placed.y))
      ctx.devices.push(placed)
      return placed
    },
    piece(type) {
      const piece = { id: `p${ctx.tray.length + 1}`, type, rotation: 0 }
      ctx.tray.push(piece)
      return piece
    },
  }
  return ctx
}

function pickEmitter(ctx, colourName = 'white') {
  const edge = randInt(ctx.random, 0, 3)
  let x
  let y
  let dir
  if (edge === 0) {
    x = 0
    y = randInt(ctx.random, 1, ctx.height - 2)
    dir = 1
  } else if (edge === 1) {
    x = ctx.width - 1
    y = randInt(ctx.random, 1, ctx.height - 2)
    dir = 3
  } else if (edge === 2) {
    x = randInt(ctx.random, 1, ctx.width - 2)
    y = 0
    dir = 2
  } else {
    x = randInt(ctx.random, 1, ctx.width - 2)
    y = ctx.height - 1
    dir = 0
  }
  const emitter = ctx.add({ type: 'emitter', x, y, rotation: dir, color: colourName })
  if (!emitter) return null
  ctx.colour = { ...COLORS[colourName] }
  return { x, y, dir }
}

/** Move the beam forward, recording the cells it crosses. */
function advance(ctx, beam, path, steps) {
  for (let index = 0; index < steps; index += 1) {
    const delta = DELTA[beam.dir]
    const nx = beam.x + delta.x
    const ny = beam.y + delta.y
    if (!ctx.free(nx, ny)) return false
    if (path.some((cell) => cell.x === nx && cell.y === ny)) return false
    beam.x = nx
    beam.y = ny
    path.push({ x: nx, y: ny, dir: beam.dir })
  }
  return true
}

function addMirrorTurn(ctx, beam) {
  const side = ctx.random() < 0.5 ? -1 : 1
  const newDir = turn(beam.dir, side)
  const rotation = mirrorRotationFor(beam.dir, newDir)
  if (rotation === null) return false
  const mirror = ctx.add({ type: 'mirror', x: beam.x, y: beam.y, rotation, rotatable: true })
  if (!mirror) return false
  ctx.solution.rotations[mirror.id] = rotation
  beam.dir = newDir
  return true
}

/**
 * A socket: the player has to drag a piece here. The tray gets the mirror that
 * belongs in it plus a prism decoy, which fits but splits the colour.
 */
function addSocketTurn(ctx, beam, decoy = true) {
  const side = ctx.random() < 0.5 ? -1 : 1
  const newDir = turn(beam.dir, side)
  const rotation = mirrorRotationFor(beam.dir, newDir)
  if (rotation === null) return false
  const socket = ctx.add({ type: 'socket', x: beam.x, y: beam.y, rotation: 0 })
  if (!socket) return false
  const mirror = ctx.piece('mirror')
  if (decoy && ctx.random() < 0.75) ctx.piece(ctx.random() < 0.5 ? 'prism' : 'splitter')
  ctx.solution.placements[socket.id] = mirror.id
  ctx.solution.rotations[mirror.id] = rotation
  beam.dir = newDir
  return true
}

function addCrystal(ctx, beam, options = {}) {
  const delta = DELTA[beam.dir]
  const x = beam.x + delta.x
  const y = beam.y + delta.y
  const device = ctx.add({
    type: 'receiver',
    x,
    y,
    rotation: 0,
    required: options.required ?? dominantColor(ctx.colour),
    ...(options.directional ? { enter: beam.dir } : {}),
    ...(options.minIntensity ? { minIntensity: options.minIntensity } : {}),
  })
  return Boolean(device)
}

/**
 * Walls. They never sit on the route the beam takes, so they cannot make a level
 * impossible; what they do is close off the wrong turns, which is what turns a
 * board from "drag anything" into a place you have to read.
 */
function scatterBlockers(ctx, count, path) {
  const avoid = new Set(path.map((cell) => ctx.key(cell.x, cell.y)))
  for (const device of ctx.devices) avoid.add(ctx.key(device.x, device.y))
  let placed = 0
  for (let attempt = 0; attempt < count * 24 && placed < count; attempt += 1) {
    const x = randInt(ctx.random, 0, ctx.width - 1)
    const y = randInt(ctx.random, 0, ctx.height - 1)
    if (avoid.has(ctx.key(x, y))) continue
    if (!ctx.free(x, y)) continue
    if (ctx.add({ type: 'blocker', x, y, rotation: 0 })) placed += 1
  }
  return placed
}

/** Teleport the beam: portal where it stands, a partner somewhere it can leave. */
function addPortalJump(ctx, beam, path, taken) {
  ctx.portals += 1
  const pair = `t${ctx.portals}`
  const entry = ctx.add({ type: 'portal', x: beam.x, y: beam.y, rotation: 0, pair })
  if (!entry) return false

  const delta = DELTA[beam.dir]
  const options = []
  for (let y = 1; y < ctx.height - 1; y += 1) {
    for (let x = 1; x < ctx.width - 1; x += 1) {
      if (!ctx.free(x, y)) continue
      if (path.some((cell) => cell.x === x && cell.y === y)) continue
      if (taken?.has(ctx.key(x, y))) continue
      if (!ctx.free(x + delta.x, y + delta.y)) continue
      options.push({ x, y })
    }
  }
  if (options.length === 0) return false
  const exit = pick(ctx.random, options)
  if (!ctx.add({ type: 'portal', x: exit.x, y: exit.y, rotation: 0, pair })) return false

  beam.x = exit.x
  beam.y = exit.y
  return true
}

// --- archetypes -------------------------------------------------------------

/** Route length scales with the world, so world 5 walks twice as far as world 1. */
function routeTurns(ctx, min, max) {
  const bonus = ctx.world >= 4 ? 1 : 0
  return randInt(ctx.random, min + bonus, Math.min(max + bonus, 6))
}

function chain(ctx, options = {}) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  const turns = options.turns ?? routeTurns(ctx, 2, 3)
  const socketAt = options.socketAt ?? (ctx.world >= 2 && ctx.random() < 0.8 ? randInt(ctx.random, 0, turns - 1) : -1)
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 3))) return false
    const ok = index === socketAt ? addSocketTurn(ctx, beam) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 3))) return false
  if (!addCrystal(ctx, beam, { directional: options.directional })) return false
  if (options.blockers) scatterBlockers(ctx, options.blockers, path)
  return true
}

function maze(ctx) {
  return chain(ctx, {
    turns: routeTurns(ctx, 3, 4),
    blockers: randInt(ctx.random, 6, 10),
    directional: ctx.random() < 0.4,
  })
}

function labyrinth(ctx) {
  return chain(ctx, {
    turns: routeTurns(ctx, 4, 5),
    blockers: randInt(ctx.random, 9, 14),
    directional: ctx.random() < 0.5,
  })
}

function filterDoor(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []

  if (ctx.random() < 0.55) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    if (!addMirrorTurn(ctx, beam)) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false

  const maskName = pick(ctx.random, ['red', 'green', 'blue'])
  const maskIndex = FILTER_CYCLE.indexOf(maskName)
  const filter = ctx.add({ type: 'filter', x: beam.x, y: beam.y, rotation: maskIndex, rotatable: true })
  if (!filter) return false
  ctx.solution.rotations[filter.id] = maskIndex
  ctx.colour = maskColor(ctx.colour, COLORS[maskName])
  if (isDark(ctx.colour)) return false

  const turns = routeTurns(ctx, 1, 2)
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    // A socket on the way to the door, so colour and placement are both needed.
    const socketHere = ctx.world >= 3 && index === 0 && ctx.random() < 0.6
    const ok = socketHere ? addSocketTurn(ctx, beam, false) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, 1)) return false
  const door = ctx.add({ type: 'door', x: beam.x, y: beam.y, rotation: 0, color: maskName })
  if (!door) return false
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
  if (!addCrystal(ctx, beam, { directional: ctx.random() < 0.6 })) return false
  const walls = ctx.world >= 3 ? randInt(ctx.random, 4, 7) : randInt(ctx.random, 2, 4)
  scatterBlockers(ctx, walls, path)
  return true
}

function prismFan(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  // A route before the prism, so the board is not solved by one tap on the glass.
  const turns = routeTurns(ctx, 1, 3)
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    const socketHere = ctx.world >= 3 && index === turns - 1 && ctx.random() < 0.5
    const ok = socketHere ? addSocketTurn(ctx, beam, false) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false

  const rotation = 0
  const prism = ctx.add({ type: 'prism', x: beam.x, y: beam.y, rotation, rotatable: true })
  if (!prism) return false
  ctx.solution.rotations[prism.id] = rotation

  // Green leaves straight ahead; red and blue head to either side.
  const straight = { x: beam.x, y: beam.y, dir: beam.dir }
  const straightPath = []
  if (!advance(ctx, straight, straightPath, randInt(ctx.random, 1, 2))) return false
  if (!addCrystal(ctx, straight, { required: 'green' })) return false

  const side = ctx.random() < 0.5 ? -1 : 1
  const sideDir = turn(beam.dir, side)
  const cell = { x: beam.x + DELTA[sideDir].x, y: beam.y + DELTA[sideDir].y }
  if (!ctx.free(cell.x, cell.y)) return false
  const required = side === -1 ? 'red' : 'blue'
  const crystal = ctx.add({ type: 'receiver', x: cell.x, y: cell.y, rotation: 0, required })
  if (!crystal) return false
  scatterBlockers(ctx, randInt(ctx.random, 3, 6), [...path, ...straightPath])
  return true
}

function splitPair(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  // Two to four devices lead into the splitter, so the fork is the last idea in
  // a route rather than the only one.
  const turns = routeTurns(ctx, 2, 3)
  const socketAt = ctx.world >= 4 && ctx.random() < 0.6 ? randInt(ctx.random, 0, turns - 1) : -1
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    const ok = index === socketAt ? addSocketTurn(ctx, beam, false) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false

  const rotation = randInt(ctx.random, 0, 3)
  const splitter = ctx.add({ type: 'splitter', x: beam.x, y: beam.y, rotation, rotatable: true })
  if (!splitter) return false
  ctx.solution.rotations[splitter.id] = rotation

  const first = turn(beam.dir, rotation)
  const second = turn(beam.dir, rotation + 1)
  const cells = [first, second].map((direction) => ({
    x: beam.x + DELTA[direction].x,
    y: beam.y + DELTA[direction].y,
  }))
  if (!cells.every((cell) => ctx.free(cell.x, cell.y))) return false
  const required = dominantColor(ctx.colour)
  for (const cell of cells) {
    const crystal = ctx.add({ type: 'receiver', x: cell.x, y: cell.y, rotation: 0, required, minIntensity: 0.4 })
    if (!crystal) return false
  }
  return true
}

function placePiece(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  const turns = routeTurns(ctx, 2, 4)
  const socketAt = randInt(ctx.random, 0, turns - 1)
  const secondSocket = ctx.world >= 3 && turns >= 3 && ctx.random() < 0.45
  let secondAt = -1
  if (secondSocket) {
    secondAt = socketAt === 0 ? turns - 1 : 0
  }
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    const ok = index === socketAt || index === secondAt ? addSocketTurn(ctx, beam) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
  if (!addCrystal(ctx, beam, { directional: ctx.random() < 0.35 })) return false
  scatterBlockers(ctx, randInt(ctx.random, 2, 6), path)
  return true
}

function twoSockets(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  // Every turn is a socket, so the route has to be built, not just turned. One
  // piece per socket exactly: a decoy here would have nowhere to go.
  const turns = Math.min(3, routeTurns(ctx, 2, 3))
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 3))) return false
    if (!addSocketTurn(ctx, beam, false)) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
  if (!addCrystal(ctx, beam, { directional: ctx.random() < 0.4 })) return false
  scatterBlockers(ctx, randInt(ctx.random, 4, 8), path)
  return true
}

function dualBeam(ctx) {
  const first = pickEmitter(ctx)
  if (!first) return false

  const build = (start, requiredColour, usePortal) => {
    const beam = { ...start }
    const path = []
    const turns = randInt(ctx.random, 1, 2)
    for (let index = 0; index < turns; index += 1) {
      if (!advance(ctx, beam, path, randInt(ctx.random, 1, 3))) return null
      if (!addMirrorTurn(ctx, beam)) return null
    }
    if (usePortal) {
      if (!advance(ctx, beam, path, 1)) return null
      if (!addPortalJump(ctx, beam, path, new Set())) return null
    }
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return null
    if (!addCrystal(ctx, beam, { required: requiredColour, directional: ctx.random() < 0.4 })) return null
    return path
  }

  const firstPath = build(first, dominantColor(ctx.colour), false)
  if (!firstPath) return false

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const saved = { devices: ctx.devices.length, tray: ctx.tray.length, colour: ctx.colour, portals: ctx.portals }
    const second = pickEmitter(ctx, pick(ctx.random, ['white', 'yellow', 'cyan', 'magenta']))
    if (second) {
      const secondPath = build(second, dominantColor(ctx.colour), ctx.random() < 0.4)
      if (secondPath) {
        scatterBlockers(ctx, randInt(ctx.random, 3, 7), [...firstPath, ...secondPath])
        return true
      }
    }
    // Roll back the failed second attempt and try another edge.
    const placed = ctx.devices.splice(saved.devices)
    for (const device of placed) ctx.taken.delete(ctx.key(device.x, device.y))
    ctx.tray.length = saved.tray
    ctx.colour = saved.colour
    ctx.portals = saved.portals
  }
  return false
}

/** A beam that leaves the room through a portal and finishes somewhere else. */
function portalRoute(ctx) {
  const start = pickEmitter(ctx)
  if (!start) return false
  const beam = { ...start }
  const path = []
  const turns = randInt(ctx.random, 1, 2)
  for (let index = 0; index < turns; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 3))) return false
    const ok = ctx.random() < 0.5 ? addSocketTurn(ctx, beam) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, 1)) return false
  if (!addPortalJump(ctx, beam, path)) return false

  const after = randInt(ctx.random, 1, 2)
  for (let index = 0; index < after; index += 1) {
    if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
    const ok = index === 0 && ctx.random() < 0.4 ? addSocketTurn(ctx, beam) : addMirrorTurn(ctx, beam)
    if (!ok) return false
  }
  if (!advance(ctx, beam, path, randInt(ctx.random, 1, 2))) return false
  if (!addCrystal(ctx, beam, { directional: ctx.random() < 0.5 })) return false
  scatterBlockers(ctx, randInt(ctx.random, 4, 8), path)
  return true
}

/** Which archetypes to draw from, by world. Later worlds get the deep ones. */
const RECIPES = {
  1: ['chain', 'chain', 'maze', 'chain', 'placePiece'],
  2: ['chain', 'filterDoor', 'placePiece', 'prismFan', 'maze', 'filterDoor'],
  3: ['placePiece', 'filterDoor', 'prismFan', 'splitPair', 'twoSockets', 'maze', 'labyrinth'],
  4: ['twoSockets', 'portalRoute', 'dualBeam', 'labyrinth', 'filterDoor', 'placePiece', 'prismFan'],
  5: ['labyrinth', 'portalRoute', 'twoSockets', 'dualBeam', 'splitPair', 'filterDoor', 'prismFan'],
}

/** The archetypes a world draws from, in the order slots are assigned. */
export function archetypesFor(world) {
  return RECIPES[world] ?? RECIPES[1]
}

export function buildCandidate({ world, size, random, name: forced }) {
  const [width, height] = size
  const ctx = makeContext(width, height, random, world)
  const recipe = RECIPES[world] ?? RECIPES[1]
  const name = forced ?? pick(random, recipe)

  let built = false
  switch (name) {
    case 'chain':
      built = chain(ctx, { turns: randInt(random, 2, 3) })
      break
    case 'maze':
      built = maze(ctx)
      break
    case 'labyrinth':
      built = labyrinth(ctx)
      break
    case 'filterDoor':
      built = filterDoor(ctx)
      break
    case 'prismFan':
      built = prismFan(ctx)
      break
    case 'splitPair':
      built = splitPair(ctx)
      break
    case 'placePiece':
      built = placePiece(ctx)
      break
    case 'twoSockets':
      built = twoSockets(ctx)
      break
    case 'dualBeam':
      built = dualBeam(ctx)
      break
    case 'portalRoute':
      built = portalRoute(ctx)
      break
    default:
      built = false
  }
  if (!built) return null

  // A socket with no piece leaves the route open, which usually makes the level
  // unsolvable by accident: require every socket to be filled by the solution.
  const sockets = ctx.devices.filter((device) => device.type === 'socket')
  if (sockets.length > 0 && ctx.tray.length === 0) return null
  if (ctx.tray.length > sockets.length) return null

  return {
    width,
    height,
    devices: ctx.devices,
    tray: ctx.tray,
    solution: ctx.solution,
    archetype: name,
  }
}

/** Where the pieces start: a plausible but wrong arrangement. */
export function initialPlacements(level, reference, random) {
  const sockets = level.devices.filter((device) => device.type === 'socket')
  const tray = level.tray ?? []
  if (sockets.length === 0) return {}

  const pieces = tray.map((piece) => piece.id)
  for (let attempt = 0; attempt < 12; attempt += 1) {
    // Either leave a socket empty, or fill it with the wrong piece.
    const shuffle = [...pieces].sort(() => random() - 0.5)
    const placement = {}
    sockets.forEach((socket, index) => {
      if (index < shuffle.length && random() < 0.75) placement[socket.id] = shuffle[index]
    })
    const sameAsSolution = sockets.every((socket) => (placement[socket.id] ?? null) === (reference[socket.id] ?? null))
    if (!sameAsSolution) return placement
  }
  return {}
}
