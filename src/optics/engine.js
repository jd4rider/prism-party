/*
 * The light engine.
 *
 * Pure functions of (level, rotations). Beams advance cell by cell through an
 * explicit work queue; there is no recursion, no randomness and no dependency
 * on rendering. Devices that need to see other devices (gates, combiners) are
 * resolved by a bounded fixed-point loop instead of by queue order, so the same
 * board always produces the same answer.
 */

import {
  COLORS,
  DEFAULT_MAX_LEAK,
  DEFAULT_MIN_INTENSITY,
  FILTER_CYCLE,
  PRISM_LOSS,
  SPLIT_FACTOR,
  ZERO,
  addColor,
  cellKey,
  clampColor,
  colorKey,
  filterMask,
  isDark,
  maskColor,
  mirrorOut,
  prismBranches,
  receiverActive,
  scaleColor,
  splitterBranches,
} from './model.js'

export const MAX_RAYS = 900
export const MAX_PASSES = 4

export function gridOf(level) {
  const grid = new Map()
  for (const device of level.devices) grid.set(cellKey(device.x, device.y), device)
  return grid
}

export function devicesOf(level, type) {
  return level.devices.filter((device) => device.type === type)
}

export function rotationOf(level, rotations, device) {
  // A device that cannot be turned is fixed: its `rotation` is part of the
  // level, including an emitter's firing direction.
  if (!device.rotatable) {
    const fixed = Math.round(device.rotation ?? 0)
    return ((fixed % 4) + 4) % 4
  }
  const raw = rotations?.[device.id]
  const value = Number.isFinite(raw) ? raw : device.rotation ?? 0
  const states = device.type === 'filter' ? 6 : device.type === 'mirror' ? 2 : 4
  return ((Math.round(value) % states) + states) % states
}

export function defaultRotations(level) {
  const out = {}
  for (const device of level.devices) {
    if (device.rotatable) out[device.id] = device.rotation ?? 0
  }
  return out
}

function portalPartner(level, device) {
  return level.devices.find(
    (candidate) => candidate.type === 'portal' && candidate.pair === device.pair && candidate.id !== device.id,
  )
}

function traceOnce(level, rotations, world) {
  const grid = gridOf(level)
  const beams = []
  const receiverHits = new Map()
  const switchHits = new Map()
  const combinerInput = new Map()
  const combinerEmitted = new Set()
  const queue = []
  const seen = new Set()

  for (const emitter of devicesOf(level, 'emitter')) {
    queue.push({
      x: emitter.x,
      y: emitter.y,
      direction: rotationOf(level, rotations, emitter),
      color: { ...(COLORS[emitter.color ?? 'white'] ?? COLORS.white) },
      // The emitter's own channel strength is the beam intensity.
      intensity: emitter.intensity ?? 1,
    })
  }

  const accumulate = (map, id, color) => map.set(id, addColor(map.get(id) ?? ZERO, color))

  let guard = 0
  while (queue.length > 0 && guard < MAX_RAYS) {
    const ray = queue.pop()
    guard += 1
    const step = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ][ray.direction]
    const nx = ray.x + step.x
    const ny = ray.y + step.y
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue

    beams.push({
      x0: ray.x,
      y0: ray.y,
      x1: nx,
      y1: ny,
      color: ray.color,
      sourceId: ray.sourceId ?? null,
    })

    const key = `${nx},${ny},${ray.direction},${colorKey(ray.color)}`
    if (seen.has(key)) continue
    seen.add(key)

    const device = grid.get(cellKey(nx, ny))
    if (!device) {
      queue.push({ ...ray, x: nx, y: ny })
      continue
    }

    const rotation = rotationOf(level, rotations, device)
    switch (device.type) {
      case 'mirror':
        queue.push({ ...ray, x: nx, y: ny, direction: mirrorOut(rotation, ray.direction) })
        break

      case 'filter': {
        const filtered = maskColor(ray.color, filterMask(device, rotation))
        if (!isDark(filtered)) queue.push({ ...ray, x: nx, y: ny, color: filtered })
        break
      }

      case 'prism': {
        for (const branch of prismBranches(rotation, ray.direction)) {
          const value = ray.color[branch.channel] * PRISM_LOSS
          if (value < 0.02) continue
          queue.push({
            ...ray,
            x: nx,
            y: ny,
            direction: branch.direction,
            color: { r: branch.channel === 'r' ? value : 0, g: branch.channel === 'g' ? value : 0, b: branch.channel === 'b' ? value : 0 },
          })
        }
        break
      }

      case 'splitter': {
        for (const direction of splitterBranches(rotation, ray.direction)) {
          const split = scaleColor(ray.color, SPLIT_FACTOR)
          if (!isDark(split)) queue.push({ ...ray, x: nx, y: ny, direction, color: split })
        }
        break
      }

      case 'portal': {
        const partner = portalPartner(level, device)
        if (partner) {
          queue.push({
            ...ray,
            x: partner.x,
            y: partner.y,
            direction: (ray.direction + (partner.rotation ?? 0)) % 4,
          })
        }
        break
      }

      case 'combiner': {
        accumulate(combinerInput, device.id, ray.color)
        // Emit the light gathered on the previous pass, once per pass, so a
        // combiner can merge beams without the queue order mattering.
        const stored = world.combiners?.[device.id]
        if (stored && !isDark(stored) && !combinerEmitted.has(device.id)) {
          combinerEmitted.add(device.id)
          queue.push({
            ...ray,
            x: nx,
            y: ny,
            direction: rotation,
            color: clampColor(stored),
          })
        }
        break
      }

      case 'switch':
        accumulate(switchHits, device.id, ray.color)
        break

      case 'gate':
        if (world.switches?.[device.switchId]) queue.push({ ...ray, x: nx, y: ny })
        break

      case 'receiver':
        accumulate(receiverHits, device.id, ray.color)
        break

      case 'emitter':
      case 'blocker':
      default:
        break
    }
  }

  const receivers = devicesOf(level, 'receiver').map((device) => {
    const color = clampColor(receiverHits.get(device.id) ?? ZERO)
    return {
      id: device.id,
      x: device.x,
      y: device.y,
      required: device.required ?? 'white',
      color,
      illumination: color.r + color.g + color.b,
      active: receiverActive(device, color),
    }
  })

  const switches = {}
  for (const device of devicesOf(level, 'switch')) {
    const color = switchHits.get(device.id) ?? ZERO
    switches[device.id] = color.r + color.g + color.b > 0.08
  }

  const combiners = {}
  for (const [id, color] of combinerInput) combiners[id] = clampColor(color)

  return {
    beams,
    receivers,
    switches,
    combiners,
    solved: receivers.length > 0 && receivers.every((receiver) => receiver.active),
    rays: guard,
  }
}

function sameSwitches(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const key of keys) if (Boolean(a?.[key]) !== Boolean(b?.[key])) return false
  return true
}

function sameCombiners(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const key of keys) {
    const left = a?.[key] ?? ZERO
    const right = b?.[key] ?? ZERO
    if (colorKey(left) !== colorKey(right)) return false
  }
  return true
}

/**
 * Evaluate a board. Runs the fixed-point loop so gates and combiners settle,
 * then returns the final light picture.
 */
export function evaluate(level, rotations = {}, { maxPasses = MAX_PASSES } = {}) {
  let world = { switches: {}, combiners: {} }
  let result = traceOnce(level, rotations, world)
  for (let pass = 1; pass < maxPasses; pass += 1) {
    const next = { switches: result.switches, combiners: result.combiners }
    if (sameSwitches(world.switches, next.switches) && sameCombiners(world.combiners, next.combiners)) break
    world = next
    result = traceOnce(level, rotations, world)
  }
  return { ...result, passes: maxPasses }
}

/** Unlit receivers are the ones a player still has to solve for. */
export function missingReceivers(result) {
  return result.receivers.filter((receiver) => !receiver.active)
}

export function receiverSummary(level, result) {
  return result.receivers.map((receiver) => ({
    id: receiver.id,
    active: receiver.active,
    required: receiver.required,
    have: colorNameOf(receiver.color),
  }))
}

function colorNameOf(color) {
  if (isDark(color)) return 'dark'
  const parts = []
  if (color.r > 0.3) parts.push('red')
  if (color.g > 0.3) parts.push('green')
  if (color.b > 0.3) parts.push('blue')
  return parts.length === 0 ? 'dark' : parts.join('+')
}

export const receiverDefaults = { DEFAULT_MIN_INTENSITY, DEFAULT_MAX_LEAK, FILTER_CYCLE }
