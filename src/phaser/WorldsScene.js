import Phaser from 'phaser'
import { H, W, background, enterScene, hitArea, iconButton, panel, starRow, text, fade } from './common.js'
import { MENU_THEME, themeFor } from '../theme.js'
import { WORLDS } from '../levels/campaign.js'
import { isWorldUnlocked, starsBeforeWorld, worldStars, WORLD_GATE } from '../progress.js'
import { data } from '../save.js'

export default class WorldsScene extends Phaser.Scene {
  constructor() {
    super('worlds')
  }

  create() {
    const theme = MENU_THEME
    background(this, theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 180)

    text(this, 54, 74, 'Journey', 30, '#ffffff', { title: true })
    text(this, 54, 112, 'Five rooms of light', 13, '#c3d3e8')
    iconButton(this, W - 58, 76, '‹', () => fade(this, 'menu'), { size: 52, theme, glyphSize: 26, fill: theme.dark ? 0x2b2250 : 0xffffff })

    WORLDS.forEach((world, index) => {
      const unlocked = isWorldUnlocked(world.id)
      const card = themeFor(world.id)
      const y = 210 + index * 158
      const container = this.add.container(W / 2, y)
      const g = panel(this, 0, 0, 610, 136, card, { alpha: unlocked ? 1 : 0.55 })
      container.add(g)

      // A little light motif per world, so the cards are not just text.
      const motif = this.add.graphics()
      motif.fillStyle(card.accent, unlocked ? 0.9 : 0.4)
      motif.fillCircle(-262, 0, 26)
      motif.fillStyle(card.warm, 0.5)
      motif.fillCircle(-262, 0, 38)
      container.add(motif)
      container.add(text(this, -262, 0, `${world.id}`, 22, '#ffffff', { origin: 0.5, fontStyle: 'bold' }))

      container.add(text(this, -212, -34, world.name, 21, card.text, { fontStyle: 'bold' }))
      container.add(text(this, -212, -6, world.subtitle, 13, card.subtext))
      container.add(
        text(this, -212, 22, `${world.levelCount} puzzles · ${world.mechanics.join(' · ')}`, 11, card.subtext, {
          alpha: 0.85,
        }),
      )

      const stars = worldStars(world.id)
      const need = Math.max(0, (WORLD_GATE[world.id] ?? 0) - starsBeforeWorld(world.id))
      container.add(text(this, 200, 26, `★ ${stars}`, 18, '#ffce55', { origin: 0.5, fontStyle: 'bold' }))
      container.add(
        text(this, 200, 52, unlocked ? `of ${world.levelCount * 3}` : `needs ${need}`, 11, unlocked ? card.subtext : '#c2603f', {
          origin: 0.5,
          fontStyle: unlocked ? 'normal' : 'bold',
        }),
      )
      void starRow

      hitArea(this, W / 2, y, 610, 136, {
        down: () => {
          if (unlocked) this.tweens.add({ targets: container, scale: 0.98, duration: 80 })
        },
        up: () => {
          if (!unlocked) {
            this.flashLocked(container)
            return
          }
          this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Back.Out' })
          fade(this, 'levels', { world: world.id })
        },
        out: () => this.tweens.add({ targets: container, scale: 1, duration: 100 }),
      }, { cursor: unlocked })
    })

    text(this, W / 2, H - 46, 'littlejoyarcade.site', 12, theme.subtext, { origin: 0.5, alpha: 0.6 })
  }

  flashLocked(container) {
    this.tweens.add({ targets: container, x: { from: W / 2 - 6, to: W / 2 }, duration: 180, ease: 'Sine.InOut' })
  }
}
