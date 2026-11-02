/* Achievement definitions and the check that awards them. */

import { LEVELS } from './levels/campaign.js'
import { data, save } from './save.js'
import { solvedCount, totalStars } from './progress.js'

export const ACHIEVEMENTS = [
  { id: 'first-light', name: 'First Light', hint: 'Finish your first puzzle', test: (state) => state.solved >= 1 },
  { id: 'mirror-master', name: 'Mirror Master', hint: 'Solve 10 puzzles in one sitting of turning', test: (state) => state.solved >= 10 },
  { id: 'rainbow-maker', name: 'Rainbow Maker', hint: 'Light a crystal with a prism', test: (state) => state.usedPrism },
  { id: 'split-decision', name: 'Split Decision', hint: 'Light two crystals from one beam', test: (state) => state.splitterWin },
  { id: 'portal-explorer', name: 'Portal Explorer', hint: 'Finish a puzzle that uses a portal', test: (state) => state.portalWin },
  { id: 'starlight-solver', name: 'Starlight Solver', hint: 'Finish a puzzle behind a shutter', test: (state) => state.gateWin },
  { id: 'perfect-reflection', name: 'Perfect Reflection', hint: 'Earn three stars on a puzzle', test: (state) => state.stars === 3 },
  { id: 'flawless', name: 'Flawless', hint: 'Earn three stars without a hint', test: (state) => state.stars === 3 && state.hints === 0 },
  { id: 'crystal-collector', name: 'Crystal Collector', hint: 'Light 100 crystals', test: (state) => state.crystals >= 100 },
  { id: 'hundred-puzzles', name: 'Hundred Puzzles', hint: 'Solve 100 puzzles', test: (state) => state.solved >= 100 },
  { id: 'prism-apprentice', name: 'Prism Apprentice', hint: 'Collect 60 stars', test: () => totalStars() >= 60 },
  { id: 'grand-prism-master', name: 'Grand Prism Master', hint: 'Complete every world', test: () => solvedCount() >= LEVELS.length },
]

export function unlockedIds() {
  return Object.entries(data.achievements)
    .filter(([, when]) => Boolean(when))
    .map(([id]) => id)
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((item) => item.id === id) ?? null
}

/**
 * Award anything newly earned and return the names, so the results screen can
 * celebrate them immediately.
 */
export function award(context) {
  const solved = solvedCount()
  const state = {
    solved,
    stars: context.stars ?? 0,
    hints: context.hints ?? 0,
    crystals: context.crystals ?? 0,
    usedPrism: Boolean(context.mechanics?.includes('prism')),
    splitterWin: Boolean(context.mechanics?.includes('splitter')),
    portalWin: Boolean(context.mechanics?.includes('portal')),
    gateWin: Boolean(context.mechanics?.includes('gate')),
  }
  const earned = []
  for (const item of ACHIEVEMENTS) {
    if (data.achievements[item.id]) continue
    let passed = false
    try {
      passed = Boolean(item.test(state))
    } catch {
      passed = false
    }
    if (passed) {
      data.achievements[item.id] = Date.now()
      earned.push(item)
    }
  }
  if (earned.length > 0) save()
  return earned
}

export function achievementContextFor(level, result, extras) {
  return {
    stars: extras.stars,
    hints: extras.hints,
    crystals: result.receivers.filter((receiver) => receiver.active).length,
    mechanics: level.devices.map((device) => device.type),
  }
}
