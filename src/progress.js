/* Progression rules: stars, unlocks and per-level records. */

import { LEVELS, WORLDS, levelAt } from './levels/campaign.js'
import { data, save } from './save.js'

export const STARS_PER_LEVEL = 3
export const TOTAL_STARS = LEVELS.length * STARS_PER_LEVEL

/** Three stars for solving in the fewest possible turns, two for a little over. */
export function starsFor(level, moves) {
  const best = level?.minMoves ?? 1
  if (moves <= best) return 3
  if (moves <= best + 2) return 2
  return 1
}

export function record(levelId) {
  return data.levels[levelId] ?? null
}

export function starsOf(levelId) {
  return data.levels[levelId]?.stars ?? 0
}

export function isSolved(levelId) {
  return starsOf(levelId) > 0
}

export function totalStars() {
  let sum = 0
  for (const value of Object.values(data.levels)) sum += value.stars ?? 0
  return sum
}

export function solvedCount() {
  return Object.values(data.levels).filter((entry) => (entry?.stars ?? 0) > 0).length
}

export function worldStars(world) {
  let sum = 0
  for (const level of LEVELS) if (level.world === world) sum += starsOf(level.id)
  return sum
}

/** A world opens once the previous one is at least half finished. */
export const WORLD_GATE = { 1: 0, 2: 20, 3: 55, 4: 95, 5: 140 }

export function starsBeforeWorld(world) {
  let sum = 0
  for (const item of WORLDS) {
    if (item.id >= world) break
    sum += worldStars(item.id)
  }
  return sum
}

export function isWorldUnlocked(world) {
  return starsBeforeWorld(world) >= (WORLD_GATE[world] ?? 0)
}

export function isLevelUnlocked(level) {
  if (!level) return false
  if (!isWorldUnlocked(level.world)) return false
  const first = LEVELS.find((item) => item.world === level.world)
  if (first?.id === level.id) return true
  const previous = levelAt(level.index - 1)
  return previous ? isSolved(previous.id) : true
}

export function nextLevel(level) {
  const next = levelAt((level?.index ?? 0) + 1)
  if (!next) return null
  return next.world === level.world ? next : null
}

/** Record a win, keeping the best star count and fewest turns. */
export function completeLevel(level, { stars, moves, hints = 0 }) {
  const previous = data.levels[level.id] ?? { stars: 0, bestMoves: null, hints: 99 }
  data.levels[level.id] = {
    stars: Math.max(previous.stars ?? 0, stars),
    bestMoves: previous.bestMoves === null || previous.bestMoves === undefined ? moves : Math.min(previous.bestMoves, moves),
    hints: Math.min(previous.hints ?? 99, hints),
    at: Date.now(),
  }
  data.stats.solved = solvedCount()
  data.stats.moves += moves
  data.stats.hints += hints
  data.stats.bestStars = Math.max(data.stats.bestStars ?? 0, stars)
  if (hints === 0) data.stats.perfect += 1
  save()
  return data.levels[level.id]
}

export function savePuzzleState(level, state, moves, hints) {
  data.current = {
    levelId: level.id,
    state: { rotations: { ...state.rotations }, placements: { ...state.placements } },
    moves,
    hints,
    at: Date.now(),
  }
  save()
}

export function clearPuzzleState() {
  data.current = null
  save()
}

export function restorePuzzleState(level) {
  const current = data.current
  if (!current || current.levelId !== level.id) return null
  const state = current.state
  if (!state || typeof state !== 'object' || !state.rotations) return null
  if (typeof state.placements !== 'object' || state.placements === null) return null
  return {
    state: { rotations: { ...state.rotations }, placements: { ...state.placements } },
    hints: current.hints ?? 0,
  }
}
