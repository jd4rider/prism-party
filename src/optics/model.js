/*
 * Optical model: directions, colours, device vocabularies and the pure
 * transformations every device applies. No Phaser, no DOM, no randomness.
 *
 * Direction convention: 0 = north, 1 = east, 2 = south, 3 = west, clockwise.
 *
 * Colour convention: a colour IS its intensity. Each channel is an absolute
 * value in 0..1 and there is no separate scalar, so nothing can be multiplied
 * in twice. Mixing is additive and clamped; transmission losses are applied to
 * the channels the beam is carrying, so no device invents energy.
 */

export const DELTA = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

export const DIR_NAMES = ['north', 'east', 'south', 'west']

export const turn = (direction, steps) => (((direction + steps) % 4) + 4) % 4

export const ZERO = { r: 0, g: 0, b: 0 }

export const COLORS = {
  red: { r: 1, g: 0, b: 0 },
  green: { r: 0, g: 1, b: 0 },
  blue: { r: 0, g: 0, b: 1 },
  yellow: { r: 1, g: 1, b: 0 },
  cyan: { r: 0, g: 1, b: 1 },
  magenta: { r: 1, g: 0, b: 1 },
  white: { r: 1, g: 1, b: 1 },
}

export const COLOR_NAMES = Object.keys(COLORS)
export const SPECTRUM = ['red', 'green', 'blue']

/** The six filter masks a rotatable filter cycles through. */
export const FILTER_CYCLE = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta']

export const addColor = (a, b) => ({ r: a.r + b.r, g: a.g + b.g, b: a.b + b.b })

export const scaleColor = (color, factor) => ({ r: color.r * factor, g: color.g * factor, b: color.b * factor })

export const clampColor = (color) => ({
  r: Math.min(1, Math.max(0, color.r)),
  g: Math.min(1, Math.max(0, color.g)),
  b: Math.min(1, Math.max(0, color.b)),
})

export const maskColor = (color, mask) => ({ r: color.r * mask.r, g: color.g * mask.g, b: color.b * mask.b })

export const isDark = (color, threshold = 0.02) => color.r + color.g + color.b < threshold

export const channelSum = (color) => color.r + color.g + color.b

/** Coarse key so a beam that revisits a cell with the same light is cut off. */
export const colorKey = (color) =>
  `${Math.round(clampColor(color).r * 12)}:${Math.round(clampColor(color).g * 12)}:${Math.round(clampColor(color).b * 12)}`

/** Nearest named colour, for labels and accessibility symbols. */
export function namedColor(color) {
  let best = 'white'
  let bestDistance = Infinity
  for (const [name, value] of Object.entries(COLORS)) {
    const distance = (color.r - value.r) ** 2 + (color.g - value.g) ** 2 + (color.b - value.b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return bestDistance < 0.35 ? best : 'white'
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** Mirrors have the two states a double-sided diagonal actually has. */
const SLASH = [1, 0, 3, 2]
const BACKSLASH = [3, 2, 1, 0]

export function mirrorOut(rotation, direction) {
  const table = rotation % 2 === 0 ? SLASH : BACKSLASH
  return table[direction]
}

/** Which mirror rotation sends a beam arriving along `direction` out `out`. */
export function mirrorRotationFor(direction, out) {
  for (const rotation of [0, 1]) {
    if (mirrorOut(rotation, direction) === out) return rotation
  }
  return null
}

/**
 * A prism sends each channel of the incoming beam into its own branch: red one
 * step anticlockwise, green straight, blue one step clockwise, all rotated by
 * the device. Transmission is per channel, so splitting cannot create light.
 */
export function prismBranches(rotation, direction) {
  return [
    { direction: turn(direction, rotation - 1), channel: 'r' },
    { direction: turn(direction, rotation), channel: 'g' },
    { direction: turn(direction, rotation + 1), channel: 'b' },
  ]
}

/** A splitter forks into two neighbouring directions, half the light in each. */
export function splitterBranches(rotation, direction) {
  return [turn(direction, rotation), turn(direction, rotation + 1)]
}

export function filterMask(device, rotation) {
  if (device.pass) return COLORS[device.pass] ?? COLORS.white
  const name = FILTER_CYCLE[((rotation % 6) + 6) % 6]
  return COLORS[name]
}

export const PRISM_LOSS = 0.92
export const SPLIT_FACTOR = 0.5
export const PORTAL_LOSS = 1

/** How many states a rotatable device of each type cycles through. */
export const STATE_COUNT = {
  mirror: 2,
  prism: 4,
  filter: 6,
  splitter: 4,
}

export const DEFAULT_MIN_INTENSITY = 0.45
export const DEFAULT_MAX_LEAK = 0.16

/**
 * A receiver lights only when every required channel is bright enough *and*
 * every unwanted channel stays under the leak tolerance. Without the leak test
 * a bright white beam would satisfy every receiver in the game.
 */
export function receiverActive(receiver, color) {
  const need = COLORS[receiver.required ?? 'white'] ?? COLORS.white
  const min = receiver.minIntensity ?? DEFAULT_MIN_INTENSITY
  const leak = receiver.maxLeak ?? DEFAULT_MAX_LEAK
  for (const channel of ['r', 'g', 'b']) {
    if (need[channel] > 0) {
      if (color[channel] < need[channel] * min) return false
    } else if (color[channel] > leak) {
      return false
    }
  }
  return true
}

export function deviceStates(device) {
  if (!device.rotatable) return 1
  return STATE_COUNT[device.type] ?? 1
}

export function cellKey(x, y) {
  return `${x},${y}`
}
