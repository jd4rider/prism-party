import Phaser from 'phaser'
import { H, W } from './common.js'
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
  return game
}

export { W, H }
