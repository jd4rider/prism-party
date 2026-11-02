import Phaser from 'phaser'
import { H, W } from './common.js'
import { LEVELS } from '../levels/campaign.js'
import MenuScene from './MenuScene.js'
import WorldsScene from './WorldsScene.js'
import LevelsScene from './LevelsScene.js'
import PuzzleScene from './PuzzleScene.js'
import SettingsScene from './SettingsScene.js'
import AchievementsScene from './AchievementsScene.js'

export function startGame(parent = 'game') {
  const config = {
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: '#0b1020',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    scene: [MenuScene, WorldsScene, LevelsScene, PuzzleScene, SettingsScene, AchievementsScene],
  }

  const game = new Phaser.Game(config)
  window.prismParty = game
  // The campaign is exposed for the smoke test, which jumps straight into a board
  // with pieces instead of clicking through the map to find one.
  window.prismPartyLevels = LEVELS
  return game
}

export { W, H }
