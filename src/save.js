/*
 * Versioned local save. Everything the game remembers lives in one object, so
 * a corrupt or older file can be repaired by merging it onto a fresh default
 * instead of throwing the player's progress away.
 */

export const SAVE_KEY = 'prism-party-save-v1'
export const SAVE_VERSION = 4

function emptySave() {
  return {
    version: SAVE_VERSION,
    levels: {},
    achievements: {},
    settings: {
      sound: true,
      music: false,
      reducedMotion: false,
      effects: true,
      highContrast: false,
      assist: true,
    },
    daily: { date: '', stars: 0, moves: 0, streak: 0, lastDate: '' },
    stats: {
      solved: 0,
      moves: 0,
      hints: 0,
      perfect: 0,
      rotations: 0,
      prismsSolved: 0,
      dailySolved: 0,
      bestStars: 0,
    },
    current: null,
  }
}

function merge(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base
  const out = { ...base }
  for (const [key, value] of Object.entries(incoming)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = merge(base[key], value)
    } else if (value !== undefined && value !== null) {
      out[key] = value
    }
  }
  return out
}

function read() {
  const fresh = emptySave()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fresh
    const merged = merge(fresh, parsed)
    merged.version = SAVE_VERSION
    return merged
  } catch {
    // A broken file should cost the player a session at worst, never the game.
    return fresh
  }
}

export const data = read()

let timer = null

export function save() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, 120)
}

export function flush() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    /* private mode: the session still works in memory */
  }
}

export function resetProgress() {
  const fresh = emptySave()
  for (const key of Object.keys(data)) delete data[key]
  Object.assign(data, fresh)
  flush()
}
