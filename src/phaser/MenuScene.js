import Phaser from 'phaser'
import { H, W, background, button, enterScene, iconButton, letterSpaced, text, fade } from './common.js'
import { MENU_THEME, themeFor } from '../theme.js'
import { LEVELS, levelAt } from '../levels/campaign.js'
import { isLevelUnlocked, solvedCount, totalStars, TOTAL_STARS } from '../progress.js'
import { data } from '../save.js'
import { applySettings, play, unlockAudio } from '../sound.js'

function continueTarget() {
  for (const level of LEVELS) {
    if (isLevelUnlocked(level) && !data.levels[level.id]?.stars) return level
  }
  return levelAt(LEVELS.length)
}

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create() {
    unlockAudio()
    applySettings()
    const theme = MENU_THEME
    background(this, theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this)

    this.drawHero(theme)

    text(this, W / 2, 208, letterSpaced('PRISM PARTY'), 40, theme.dark ? '#fff6ea' : '#2a2140', {
      title: true,
      origin: 0.5,
    })
    text(this, W / 2, 252, 'a little joy arcade puzzle', 14, theme.dark ? '#e6dcff' : '#4a3a6b', { origin: 0.5 })

    const stars = totalStars()
    const badge = this.add.container(W - 84, 76)
    badge.add(this.add.circle(0, 0, 30, 0x000000, 0.22))
    badge.add(text(this, 0, -2, '★', 26, '#ffce55', { origin: 0.5 }))
    badge.add(text(this, 0, 24, `${stars}`, 12, '#ffffff', { origin: 0.5, fontStyle: 'bold' }))
    badge.setSize(60, 60)

    const target = continueTarget()
    const targetWorld = themeFor(target.world)
    const solved = solvedCount()
    const label = solved === 0 ? 'Play' : solved >= LEVELS.length ? 'Replay the finale' : 'Continue'
    button(this, W / 2, 620, label, () => fade(this, 'puzzle', { level: target, mode: 'journey' }), {
      width: 420,
      height: 74,
      size: 24,
      theme,
      subtitle:
        solved === 0
          ? 'World 1 · The Reflection Garden'
          : `Level ${target.number} · ${targetWorld ? 'World ' + target.world : ''}`,
    })

    button(this, W / 2 - 116, 726, 'Journey', () => fade(this, 'worlds'), { width: 210, height: 60, size: 18, theme, fill: 0x6d4fd0 })
    button(this, W / 2 + 116, 726, 'Daily', () => this.startDaily(target), {
      width: 210,
      height: 60,
      size: 18,
      theme,
      fill: 0x2f9d78,
    })
    button(this, W / 2 - 116, 802, 'Zen', () => this.startZen(), { width: 210, height: 60, size: 18, theme, fill: 0x3c7fb8 })
    button(this, W / 2 + 116, 802, 'Awards', () => fade(this, 'achievements'), {
      width: 210,
      height: 60,
      size: 18,
      theme,
      fill: 0x8a5a9e,
    })

    button(this, W / 2, 890, 'Free play', () => fade(this, 'worlds'), {
      width: 420,
      height: 52,
      size: 15,
      theme,
      fill: theme.dark ? 0x3c3160 : 0xffffff,
      textColor: theme.dark ? '#efeaff' : theme.text,
      bold: false,
    })

    iconButton(this, W - 58, H - 74, '⚙', () => fade(this, 'settings'), {
      size: 56,
      theme,
      glyphSize: 24,
      fill: theme.dark ? 0x2b2250 : 0xffffff,
    })

    const progress = `${solved}/${LEVELS.length} solved · ${stars}/${TOTAL_STARS} stars`
    text(this, 58, H - 84, progress, 12, theme.subtext, { origin: 0 })
    text(this, 58, H - 62, 'littlejoyarcade.site', 12, theme.subtext, { origin: 0, alpha: 0.7 })
  }

  drawHero(theme) {
    const beam = this.add.graphics().setDepth(2)
    const origin = { x: W / 2, y: 420 }
    const fan = [
      { x: -150, y: 118, color: 0xff5f7a },
      { x: 0, y: 140, color: 0x7dffb0 },
      { x: 150, y: 118, color: 0x7fb4ff },
    ]
    for (const arm of fan) {
      beam.lineStyle(10, arm.color, 0.1)
      beam.lineBetween(origin.x, origin.y, origin.x + arm.x, origin.y + arm.y)
      beam.lineStyle(3, arm.color, 0.5)
      beam.lineBetween(origin.x, origin.y, origin.x + arm.x, origin.y + arm.y)
      beam.fillStyle(arm.color, 0.85)
      beam.fillCircle(origin.x + arm.x, origin.y + arm.y, 7)
    }

    const prism = this.add.container(origin.x, origin.y).setDepth(3)
    const g = this.add.graphics()
    const r = 74
    g.fillStyle(0x0d1424, 0.85)
    g.fillTriangle(0, -r, r * 0.9, r * 0.72, -r * 0.9, r * 0.72)
    g.fillStyle(0x9ad9ff, 0.95)
    g.fillTriangle(0, -r + 6, r * 0.9 - 8, r * 0.72 - 4, 0, r * 0.72 - 4)
    g.fillStyle(0x4f7fd6, 0.9)
    g.fillTriangle(0, -r + 6, 0, r * 0.72 - 4, -r * 0.9 + 8, r * 0.72 - 4)
    g.fillStyle(0xfff6d0, 0.6)
    g.fillTriangle(0, -r + 10, r * 0.24, r * 0.72 - 14, -r * 0.14, r * 0.72 - 14)
    g.lineStyle(2, 0xffffff, 0.75)
    g.strokeTriangle(0, -r, r * 0.9, r * 0.72, -r * 0.9, r * 0.72)
    prism.add(g)

    if (!data.settings.reducedMotion) {
      this.tweens.add({
        targets: prism,
        y: origin.y - 8,
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
      this.tweens.add({ targets: beam, alpha: { from: 0.75, to: 1 }, duration: 1900, yoyo: true, repeat: -1 })
    }
  }

  startDaily() {
    const level = this.dailyLevel()
    unlockAudio()
    play('tap')
    fade(this, 'puzzle', { level, mode: 'daily' })
  }

  dailyLevel() {
    const day = Math.floor(Date.now() / 86400000)
    return LEVELS[(day * 7919) % LEVELS.length]
  }

  startZen() {
    const pool = LEVELS.filter((level) => level.difficulty >= 2)
    const level = pool[Math.floor(Math.random() * pool.length)]
    fade(this, 'puzzle', { level, mode: 'zen' })
  }
}
