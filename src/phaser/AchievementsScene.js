import Phaser from 'phaser'
import { H, W, background, enterScene, iconButton, mix, panel, text, fade } from './common.js'
import { MENU_THEME } from '../theme.js'
import { ACHIEVEMENTS, unlockedIds } from '../achievements.js'
import { data } from '../save.js'
import { solvedCount, totalStars } from '../progress.js'

export default class AchievementsScene extends Phaser.Scene {
  constructor() {
    super('achievements')
  }

  create() {
    const theme = MENU_THEME
    background(this, theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 160)

    const unlocked = new Set(unlockedIds())
    text(this, 54, 74, 'Awards', 30, theme.dark ? '#fff6ea' : '#241d38', { title: true })
    text(this, 54, 112, `${unlocked.size} of ${ACHIEVEMENTS.length} · ${solvedCount()} puzzles · ${totalStars()} stars`, 13, theme.subtext)
    iconButton(this, W - 58, 76, '‹', () => fade(this, 'menu'), {
      size: 52,
      theme,
      glyphSize: 26,
      fill: theme.dark ? 0x2b2250 : 0xffffff,
    })

    ACHIEVEMENTS.forEach((item, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = W / 2 + (column === 0 ? -152 : 152)
      const y = 190 + row * 132
      const earned = unlocked.has(item.id)

      panel(this, x, y, 288, 116, theme, { alpha: earned ? 0.98 : 0.55, radius: 20 })
      const disc = this.add.graphics()
      disc.fillStyle(earned ? theme.accent : mix(theme.tile, 0x000000, 0.3), earned ? 0.95 : 0.5)
      disc.fillCircle(x, y - 46, 17)
      disc.setDepth(2)
      text(this, x, y - 46, earned ? '★' : '?', 16, earned ? '#ffffff' : theme.subtext, { origin: 0.5 }).setDepth(3)
      text(this, x, y - 16, item.name, 15, theme.text, {
        origin: 0.5,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 260 },
      }).setDepth(3)
      text(this, x, y + 24, earned ? 'Earned' : item.hint, 11, theme.subtext, {
        origin: 0.5,
        align: 'center',
        wordWrap: { width: 250 },
        alpha: earned ? 0.9 : 0.75,
      }).setDepth(3)
    })

    text(this, W / 2, H - 30, 'littlejoyarcade.site', 12, theme.subtext, { origin: 0.5, alpha: 0.6 })
  }
}
