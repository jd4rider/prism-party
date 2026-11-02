import Phaser from 'phaser'
import { H, W, background, enterScene, hitArea, iconButton, mix, text, fade, starRow } from './common.js'
import { MENU_THEME, themeFor } from '../theme.js'
import { WORLDS, levelsOfWorld } from '../levels/campaign.js'
import { isLevelUnlocked, isWorldUnlocked, starsOf, worldStars } from '../progress.js'
import { data } from '../save.js'

export default class LevelsScene extends Phaser.Scene {
  constructor() {
    super('levels')
  }

  init(payload) {
    this.worldId = payload?.world ?? 1
  }

  create() {
    const theme = MENU_THEME
    const card = themeFor(this.worldId)
    const world = WORLDS.find((item) => item.id === this.worldId) ?? WORLDS[0]
    background(this, card, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 160)

    // The top band is the dark sky in every theme, so the header stays light.
    text(this, 54, 72, world.name, 26, '#ffffff', { title: true })
    text(this, 54, 108, `${world.subtitle} · ★ ${worldStars(this.worldId)} of ${world.levelCount * 3}`, 13, '#c3d3e8')
    iconButton(this, W - 58, 74, '‹', () => fade(this, 'worlds'), {
      size: 52,
      theme,
      glyphSize: 26,
      fill: card.dark ? 0x2b2250 : 0xffffff,
    })

    const levels = levelsOfWorld(this.worldId)
    const columns = 5
    const cellW = 116
    const cellH = 104
    const startX = W / 2 - ((columns - 1) * cellW) / 2
    const startY = 214

    levels.forEach((level, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = startX + column * cellW
      const y = startY + row * cellH
      const unlocked = isLevelUnlocked(level)
      const stars = starsOf(level.id)

      const container = this.add.container(x, y)
      const g = this.add.graphics()
      const fill = stars > 0 ? mix(card.tile, card.accent, 0.22) : card.tile
      g.fillStyle(0x000000, 0.22)
      g.fillRoundedRect(-46 + 2, -46 + 5, 92, 92, 20)
      g.fillStyle(mix(fill, 0x000000, 0.25), 1)
      g.fillRoundedRect(-46, -46 + 3, 92, 92, 20)
      g.fillStyle(fill, unlocked ? 1 : 0.5)
      g.fillRoundedRect(-46, -46, 92, 92, 20)
      g.fillStyle(0xffffff, unlocked ? 0.16 : 0.08)
      g.fillRoundedRect(-40, -40, 80, 34, 14)
      if (stars > 0) {
        g.lineStyle(2.5, card.accent, 0.9)
        g.strokeRoundedRect(-46, -46, 92, 92, 20)
      }
      container.add(g)

      if (unlocked) {
        container.add(text(this, 0, -6, `${level.number}`, 26, card.text, { origin: 0.5, fontStyle: 'bold' }))
        if (stars > 0) {
          container.add(starRow(this, 0, 34, stars, { size: 13, total: 3, static: true }))
        } else {
          container.add(text(this, 0, 34, `${level.difficulty}◆`, 11, card.subtext, { origin: 0.5, alpha: 0.8 }))
        }
      } else {
        container.add(text(this, 0, 0, '🔒', 22, card.subtext, { origin: 0.5, alpha: 0.6 }))
      }

      hitArea(this, x, y, 92, 92, {
        down: () => {
          if (unlocked) this.tweens.add({ targets: container, scale: 0.94, duration: 70 })
        },
        up: () => {
          if (!unlocked) {
            this.tweens.add({ targets: container, x: x - 4, duration: 80, yoyo: true, repeat: 1 })
            return
          }
          this.tweens.add({ targets: container, scale: 1, duration: 110 })
          fade(this, 'puzzle', { level, mode: 'journey' })
        },
      }, { cursor: unlocked })
    })

    if (!isWorldUnlocked(this.worldId)) {
      text(this, W / 2, H - 80, 'Finish more of the previous room to open this one.', 12, card.subtext, {
        origin: 0.5,
        align: 'center',
      })
    }
    text(this, W / 2, H - 34, '◆ = difficulty', 11, card.subtext, { origin: 0.5, alpha: 0.6 })
  }
}
