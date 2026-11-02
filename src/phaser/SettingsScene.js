import Phaser from 'phaser'
import { H, W, background, button, enterScene, hitArea, iconButton, mix, panel, text, fade } from './common.js'
import { MENU_THEME } from '../theme.js'
import { data, flush, resetProgress, save } from '../save.js'
import { applySettings, play } from '../sound.js'

const ROWS = [
  { key: 'sound', label: 'Sound effects', hint: 'Turns, connects and crystal chimes' },
  { key: 'music', label: 'Music', hint: 'A quiet ambient pad' },
  { key: 'reducedMotion', label: 'Reduced motion', hint: 'Calmer tweens, no drifting motes' },
  { key: 'effects', label: 'Sparkles', hint: 'Crystal bursts and light rings' },
  { key: 'highContrast', label: 'High contrast', hint: 'Stronger outlines and brighter beams' },
]

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('settings')
  }

  create() {
    const theme = MENU_THEME
    background(this, theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 160)

    text(this, 54, 74, 'Settings', 30, theme.dark ? '#fff6ea' : '#241d38', { title: true })
    text(this, 54, 112, 'Everything here is local to this device', 13, theme.subtext)
    iconButton(this, W - 58, 76, '‹', () => fade(this, 'menu'), {
      size: 52,
      theme,
      glyphSize: 26,
      fill: theme.dark ? 0x2b2250 : 0xffffff,
    })

    ROWS.forEach((row, index) => {
      const y = 205 + index * 108
      panel(this, W / 2, y, 610, 88, theme, { alpha: 0.94 })
      text(this, 96, y - 18, row.label, 18, theme.text, { fontStyle: 'bold' })
      text(this, 96, y + 10, row.hint, 12, theme.subtext, { alpha: 0.9 })

      const isOn = Boolean(data.settings[row.key])
      const container = this.add.container(W - 118, y)
      const g = this.add.graphics()
      g.fillStyle(0x000000, 0.25)
      g.fillRoundedRect(-38, -18 + 3, 76, 36, 18)
      g.fillStyle(isOn ? theme.accent : mix(theme.tile, 0x000000, 0.25), 1)
      g.fillRoundedRect(-38, -18, 76, 36, 18)
      g.fillStyle(0xffffff, 0.92)
      g.fillCircle(isOn ? 20 : -20, 0, 14)
      container.add(g)
      hitArea(this, W - 118, y, 90, 48, {
        up: () => {
          data.settings[row.key] = !data.settings[row.key]
          save()
          applySettings()
          play('turn')
          this.scene.restart()
        },
      })
    })

    let armed = false
    const reset = button(this, W / 2, 790, 'Reset progress', () => {
      if (!armed) {
        armed = true
        reset.labelText.setText('Tap again to erase everything')
        this.time.delayedCall(4000, () => {
          armed = false
          reset.labelText.setText('Reset progress')
        })
        return
      }
      resetProgress()
      flush()
      armed = false
      reset.labelText.setText('Progress reset')
      this.time.delayedCall(900, () => this.scene.restart())
    }, {
      width: 420,
      height: 56,
      size: 16,
      theme,
      fill: theme.dark ? 0x3a2a4e : 0xffffff,
      textColor: theme.dark ? '#ffd0d0' : '#a33b3b',
    })
    reset.setDepth(5)

    text(this, W / 2, 872, 'Prism Party · v0.1.0', 12, theme.subtext, { origin: 0.5, alpha: 0.8 })
    text(this, W / 2, 896, 'A Little Joy Arcade game', 12, theme.subtext, { origin: 0.5, alpha: 0.6 })

    button(this, W / 2, 968, 'Back', () => fade(this, 'menu'), {
      width: 420,
      height: 56,
      size: 17,
      theme,
      fill: theme.accent,
    })
  }
}
