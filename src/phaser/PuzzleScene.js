import Phaser from 'phaser'
import {
  H,
  W,
  background,
  button,
  enterScene,
  hitArea,
  iconButton,
  lightToHex,
  mix,
  panel,
  pulseRing,
  sparkBurst,
  starRow,
  text,
  fade,
} from './common.js'
import { drawDevice } from './draw.js'
import { themeFor } from '../theme.js'
import { evaluate } from '../optics/engine.js'
import { nearestSolution } from '../optics/solver.js'
import { COLORS, deviceStates } from '../optics/model.js'
import { levelAt } from '../levels/campaign.js'
import { data } from '../save.js'
import {
  clearPuzzleState,
  completeLevel,
  nextLevel,
  restorePuzzleState,
  savePuzzleState,
  starsFor,
} from '../progress.js'
import { achievementContextFor, award } from '../achievements.js'
import { play, unlockAudio } from '../sound.js'

const BOARD_CENTER_Y = 516
const MAX_BOARD_W = 610
const MAX_BOARD_H = 520

export default class PuzzleScene extends Phaser.Scene {
  constructor() {
    super('puzzle')
  }

  init(payload) {
    this.mode = payload?.mode ?? 'journey'
    this.level = payload?.level ?? levelAt(1)
    this.nonce = payload?.nonce ?? 0
    this.finished = false
    this.hints = 0
    this.pointer = 0
  }

  create() {
    unlockAudio()
    this.theme = themeFor(this.level.world)
    background(this, this.theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 180)

    this.rotations = { ...(this.level.initialRotations ?? {}) }
    if (this.mode === 'journey') {
      const restored = restorePuzzleState(this.level)
      if (restored) {
        this.rotations = { ...restored.rotations }
        this.hints = restored.hints ?? 0
      }
    }
    this.history = [{ ...this.rotations }]

    this.layout = this.computeLayout()
    this.buildHeader()
    this.buildBoard()
    this.buildDevices()
    this.buildHud()

    // A dark pass under the additive light keeps the beam readable on pale
    // boards, where a white core alone would wash out.
    this.beamShadow = this.add.graphics().setDepth(19)
    this.beamGfx = this.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD)
    this.fxLayer = this.add.container(0, 0).setDepth(30)

    this.applyState({ animate: false })
    this.pointer = 0
    this.updateHud()
  }

  computeLayout() {
    const { width, height } = this.level
    const cell = Math.min(MAX_BOARD_W / width, MAX_BOARD_H / height, 104)
    const boardWidth = cell * width
    const boardHeight = cell * height
    return {
      cell,
      boardWidth,
      boardHeight,
      left: W / 2 - boardWidth / 2,
      top: BOARD_CENTER_Y - boardHeight / 2,
    }
  }

  cellCenter(x, y) {
    const { cell, left, top } = this.layout
    return { x: left + cell * (x + 0.5), y: top + cell * (y + 0.5) }
  }

  buildHeader() {
    const theme = this.theme
    const modeLabel =
      this.mode === 'daily'
        ? 'Daily puzzle'
        : this.mode === 'zen'
          ? 'Zen'
          : this.mode === 'expert'
            ? 'Expert'
            : `World ${this.level.world}`
    // The sky band behind the header is dark in every theme, so the header is
    // always light rather than following the board palette.
    text(this, 60, 58, modeLabel, 12, '#c9d8f2', { alpha: 0.9 })
    text(this, 60, 78, `Level ${this.level.number}`, 28, '#ffffff', { title: true })
    text(this, 60, 118, this.objective(), 13, '#b8c8e0')

    iconButton(this, W - 58, 76, '‹', () => this.leave(), {
      size: 52,
      theme,
      glyphSize: 26,
      fill: theme.dark ? 0x2b2250 : 0xffffff,
    })
    this.moveText = text(this, W - 104, 74, '', 15, '#c9d8f2', { origin: 1 })
  }

  objective() {
    const gates = this.level.devices.some((device) => device.type === 'gate')
    const receivers = this.level.devices.filter((device) => device.type === 'receiver').length
    if (gates) return 'Open the shutter, then light every crystal'
    return receivers > 1 ? `Light all ${receivers} crystals` : 'Light the crystal'
  }

  buildBoard() {
    const theme = this.theme
    const { cell, boardWidth, boardHeight, left, top } = this.layout
    const pad = Math.max(16, cell * 0.22)
    const trayX = left - pad
    const trayY = top - pad
    const trayW = boardWidth + pad * 2
    const trayH = boardHeight + pad * 2

    const g = this.add.graphics().setDepth(6)
    // Ground shadow, extruded side, then the raised surface.
    g.fillStyle(0x000000, 0.32)
    g.fillRoundedRect(trayX + 6, trayY + 18, trayW, trayH, 30)
    g.fillStyle(theme.traySide, 1)
    g.fillRoundedRect(trayX, trayY + 10, trayW, trayH, 30)
    g.fillStyle(theme.trayEdge, 1)
    g.fillRoundedRect(trayX, trayY + 4, trayW, trayH, 30)
    g.fillStyle(theme.tray, 1)
    g.fillRoundedRect(trayX, trayY, trayW, trayH, 30)
    g.lineStyle(2, 0xffffff, theme.dark ? 0.14 : 0.45)
    g.strokeRoundedRect(trayX + 1, trayY + 1, trayW - 2, trayH - 2, 30)

    // Tiles: shadow, face, top highlight and a darker inner edge.
    for (let y = 0; y < this.level.height; y += 1) {
      for (let x = 0; x < this.level.width; x += 1) {
        const cx = left + x * cell
        const cy = top + y * cell
        const inset = cell * 0.06
        g.fillStyle(theme.tileShadow, 0.28)
        g.fillRoundedRect(cx + inset, cy + inset + 4, cell - inset * 2, cell - inset * 2, cell * 0.2)
        g.fillStyle(theme.tile, 1)
        g.fillRoundedRect(cx + inset, cy + inset, cell - inset * 2, cell - inset * 2, cell * 0.2)
        g.fillStyle(mix(theme.tile, 0xffffff, 0.25), 0.55)
        g.fillRoundedRect(cx + inset + 3, cy + inset + 2, cell - inset * 2 - 6, cell * 0.24, cell * 0.12)
        g.lineStyle(1, theme.tileEdge, 0.9)
        g.strokeRoundedRect(cx + inset, cy + inset, cell - inset * 2, cell - inset * 2, cell * 0.2)
      }
    }

    const plate = this.add.graphics().setDepth(7)
    plate.fillStyle(0x000000, 0.18)
    plate.fillRoundedRect(trayX + 4, trayY + trayH - 6, trayW - 8, 12, 6)

    this.add
      .text(trayX + trayW - 10, trayY + trayH + 12, `${this.level.width}×${this.level.height}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: theme.subtext,
      })
      .setOrigin(1, 0)
      .setAlpha(0.5)
      .setDepth(32)
  }

  buildDevices() {
    const { cell } = this.layout
    const size = Math.min(cell * 0.94, 96)
    this.deviceViews = new Map()
    for (const device of this.level.devices) {
      const center = this.cellCenter(device.x, device.y)
      const view = drawDevice(this, device, size, this.theme)
      view.container.setPosition(center.x, center.y)
      view.container.setDepth(device.type === 'receiver' ? 26 : 24)
      this.deviceViews.set(device.id, view)

      if (device.rotatable) {
        hitArea(this, center.x, center.y, cell, cell, {
          down: () => this.tweens.add({ targets: view.container, scale: 0.92, duration: 70 }),
          up: () => {
            this.tweens.add({ targets: view.container, scale: 1, duration: 140, ease: 'Back.Out' })
            this.rotate(device)
          },
        })
      }
    }
  }

  buildHud() {
    const theme = this.theme
    const y = 930
    const gap = 118
    const start = W / 2 - gap * 2
    this.undoButton = iconButton(this, start, y, '↶', () => this.undo(), {
      size: 62,
      theme,
      caption: 'Undo',
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
    })
    this.redoButton = iconButton(this, start + gap, y, '↷', () => this.redo(), {
      size: 62,
      theme,
      caption: 'Redo',
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
    })
    iconButton(this, start + gap * 2, y, '?', () => this.hint(), {
      size: 62,
      theme,
      caption: 'Hint',
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
    })
    iconButton(this, start + gap * 3, y, '⟳', () => this.restart(), {
      size: 62,
      theme,
      caption: 'Restart',
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
    })
    iconButton(this, start + gap * 4, y, '≡', () => this.leave(), {
      size: 62,
      theme,
      caption: 'Menu',
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
    })

    this.statusText = text(this, W / 2, 862, '', 14, theme.text, { origin: 0.5 })
    this.hintText = text(this, W / 2, 1006, '', 12, theme.subtext, { origin: 0.5 })
    text(this, W / 2, H - 24, 'littlejoyarcade.site', 11, theme.subtext, { origin: 0.5, alpha: 0.55 })
  }

  // --- state ---------------------------------------------------------------

  get moves() {
    return this.pointer
  }

  pushHistory() {
    this.history = this.history.slice(0, this.pointer + 1)
    this.history.push({ ...this.rotations })
    this.pointer = this.history.length - 1
  }

  rotate(device) {
    if (this.finished) return
    const states = deviceStates(device)
    const current = this.rotations[device.id] ?? 0
    this.rotations[device.id] = (current + 1) % states
    this.pushHistory()
    data.stats.rotations += 1
    play('turn')
    this.applyState()
    this.updateHud()
    savePuzzleState(this.level, this.rotations, this.moves, this.hints)
  }

  undo() {
    if (this.finished || this.pointer <= 0) {
      play('blocked')
      return
    }
    this.pointer -= 1
    this.rotations = { ...this.history[this.pointer] }
    play('undo')
    this.applyState()
    this.updateHud()
  }

  redo() {
    if (this.finished || this.pointer >= this.history.length - 1) {
      play('blocked')
      return
    }
    this.pointer += 1
    this.rotations = { ...this.history[this.pointer] }
    play('undo')
    this.applyState()
    this.updateHud()
  }

  restart() {
    if (this.finished) return
    this.rotations = { ...(this.level.initialRotations ?? {}) }
    this.history = [{ ...this.rotations }]
    this.pointer = 0
    this.hints = 0
    play('undo')
    this.applyState()
    this.updateHud()
    clearPuzzleState()
  }

  hint() {
    if (this.finished) return
    const solution = nearestSolution(this.level, this.rotations, { maxSolutions: 24 })
    if (!solution) {
      this.showHintText('No route from here — try Restart')
      return
    }
    let target = null
    for (const device of this.level.devices) {
      if (!device.rotatable) continue
      if ((this.rotations[device.id] ?? 0) !== solution.rotations[device.id]) {
        target = device
        break
      }
    }
    if (!target) return
    this.hints += 1
    data.stats.hints += 1
    play('hint')
    const center = this.cellCenter(target.x, target.y)
    const ring = pulseRing(this, center.x, center.y, 0xffd166, { radius: this.layout.cell * 0.42, duration: 900 })
    ring.setDepth(34)
    const arrow = text(this, center.x, center.y - this.layout.cell * 0.62, '⟳', 26, '#ffd166', { origin: 0.5 })
    arrow.setDepth(35)
    this.tweens.add({
      targets: arrow,
      angle: 120,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: 'Sine.InOut',
      onComplete: () => arrow.destroy(),
    })
    const needs = (solution.rotations[target.id] - (this.rotations[target.id] ?? 0) + 4) % 4
    this.showHintText(
      needs === 1 || needs === 3 ? `Turn the glowing ${target.type}` : `The ${target.type} needs ${needs} turns`,
    )
  }

  showHintText(message) {
    if (!this.hintText) return
    this.hintText.setText(message)
    this.hintText.setAlpha(1)
    this.tweens.killTweensOf(this.hintText)
    this.tweens.add({ targets: this.hintText, alpha: 0, delay: 2100, duration: 600 })
  }

  leave() {
    if (!this.finished && this.mode === 'journey') savePuzzleState(this.level, this.rotations, this.moves, this.hints)
    fade(this, this.mode === 'journey' ? 'levels' : 'menu', { world: this.level.world })
  }

  // --- render --------------------------------------------------------------

  applyState({ animate = true } = {}) {
    const result = evaluate(this.level, this.rotations)
    this.result = result
    this.drawBeams(result.beams)

    for (const device of this.level.devices) {
      const view = this.deviceViews.get(device.id)
      if (!view) continue
      if (device.type === 'receiver') {
        const receiver = result.receivers.find((item) => item.id === device.id)
        const wasActive = view.active
        view.setActive(Boolean(receiver?.active), receiver?.color)
        if (receiver?.active && !wasActive && animate) {
          const center = this.cellCenter(device.x, device.y)
          sparkBurst(this, center.x, center.y, lightToHex(receiver.color), 12, { depth: 33 })
          pulseRing(this, center.x, center.y, lightToHex(receiver.color), { radius: this.layout.cell * 0.34 })
          play('receiver')
        }
      } else if (device.type === 'switch') {
        view.setActive(Boolean(result.switches[device.id]), COLORS.green)
      } else if (device.type === 'gate') {
        view.setOpen(Boolean(result.switches[device.switchId]))
      } else if (device.rotatable) {
        view.setRotation(this.rotations[device.id] ?? 0, animate)
      }
    }

    const lit = result.receivers.filter((receiver) => receiver.active).length
    const total = result.receivers.length
    if (this.statusText) {
      this.statusText.setText(result.solved ? 'Every crystal is lit' : `${lit} of ${total} crystals lit`)
      this.statusText.setColor(result.solved ? '#8ef0c0' : this.theme.text)
    }

    if (result.solved && !this.finished) this.complete()
  }

  drawBeams(beams) {
    const g = this.beamGfx
    if (!g) return
    g.clear()
    this.beamShadow?.clear()
    for (const beam of beams) {
      const a = this.cellCenter(beam.x0, beam.y0)
      const b = this.cellCenter(beam.x1, beam.y1)
      const color = lightToHex(beam.color)
      const bright = mix(color, 0xffffff, 0.55)
      if (this.beamShadow) {
        this.beamShadow.lineStyle(9, 0x16263a, 0.22)
        this.beamShadow.lineBetween(a.x, a.y, b.x, b.y)
      }
      g.lineStyle(16, color, 0.12)
      g.lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(8, color, 0.2)
      g.lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(3.8, bright, 0.8)
      g.lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(1.6, 0xffffff, 0.9)
      g.lineBetween(a.x, a.y, b.x, b.y)
      g.fillStyle(0xffffff, 0.5)
      g.fillCircle(a.x, a.y, 1.6)
    }
  }

  updateHud() {
    if (this.moveText) this.moveText.setText(`${this.moves} ${this.moves === 1 ? 'turn' : 'turns'}`)
    if (this.undoButton) this.undoButton.setAlpha(this.pointer > 0 ? 1 : 0.4)
    if (this.redoButton) this.redoButton.setAlpha(this.pointer < this.history.length - 1 ? 1 : 0.4)
  }

  // --- completion ----------------------------------------------------------

  complete() {
    this.finished = true
    const stars = starsFor(this.level, this.moves)
    completeLevel(this.level, { stars, moves: this.moves, hints: this.hints })
    clearPuzzleState()
    const earned = award(achievementContextFor(this.level, this.result, { stars, hints: this.hints }))
    play('win')

    for (const receiver of this.result.receivers) {
      const center = this.cellCenter(receiver.x, receiver.y)
      this.time.delayedCall(120, () => {
        sparkBurst(this, center.x, center.y, lightToHex(receiver.color), 16, { spread: 70, depth: 33 })
      })
    }
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.55).setDepth(88)
    this.tweens.add({ targets: flash, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => flash.destroy() })
    this.time.delayedCall(640, () => this.showResult(stars, earned))
  }

  showResult(stars, earned) {
    const theme = this.theme
    const overlay = this.add.container(0, 0).setDepth(90)
    // Swallow taps on the board underneath, before the result buttons register.
    hitArea(this, W / 2, H / 2, W, H, {})
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x05070f, 0.62)
    overlay.add(backdrop)

    const card = this.add.container(W / 2, 520)
    card.add(panel(this, 0, 0, 500, 470, theme, { alpha: 0.98 }))
    card.add(
      text(this, 0, -186, this.result.solved ? 'Every crystal lit' : 'Solved', 30, theme.text, {
        title: true,
        origin: 0.5,
      }),
    )
    card.add(starRow(this, 0, -120, stars, { size: 42, gap: 58 }))
    card.add(
      text(this, 0, -54, `${this.moves} ${this.moves === 1 ? 'turn' : 'turns'} · best ${this.level.minMoves}`, 15, theme.subtext, {
        origin: 0.5,
      }),
    )
    card.add(
      text(this, 0, -26, this.hints === 0 ? 'No hints used' : `${this.hints} hint${this.hints === 1 ? '' : 's'} used`, 13, theme.subtext, {
        origin: 0.5,
        alpha: 0.85,
      }),
    )

    if (earned.length > 0) {
      card.add(
        text(this, 0, 22, `🏅 ${earned.map((item) => item.name).join(' · ')}`, 13, theme.accentText, {
          origin: 0.5,
          align: 'center',
          wordWrap: { width: 430 },
        }),
      )
    }

    const next = this.mode === 'journey' ? nextLevel(this.level) : null
    const primaryLabel = next ? `Next · ${next.number}` : this.mode === 'journey' ? 'Journey map' : 'Play again'
    const primaryAction = () => {
      if (next) fade(this, 'puzzle', { level: next, mode: 'journey' })
      else if (this.mode === 'journey') fade(this, 'worlds')
      else fade(this, 'puzzle', { level: this.level, mode: this.mode, nonce: this.nonce + 1 })
    }
    // Buttons live at absolute scene coordinates so their hit rectangles line up
    // with the artwork (which is reparented into the card for the entrance tween).
    const buttonX = W / 2
    const primary = button(this, buttonX, 520 + 92, primaryLabel, primaryAction, {
      width: 380,
      height: 58,
      size: 18,
      theme,
      hitDepth: 96,
    })
    const replay = button(
      this,
      buttonX,
      520 + 162,
      'Replay',
      () => fade(this, 'puzzle', { level: this.level, mode: this.mode, nonce: this.nonce + 1 }),
      {
        width: 380,
        height: 48,
        size: 15,
        theme,
        fill: theme.dark ? 0x2b2f52 : 0xffffff,
        textColor: theme.dark ? '#efeaff' : theme.text,
        hitDepth: 96,
      },
    )
    const menu = button(this, buttonX, 520 + 220, 'Menu', () => fade(this, 'menu'), {
      width: 380,
      height: 48,
      size: 15,
      theme,
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
      textColor: theme.dark ? '#efeaff' : theme.text,
      hitDepth: 96,
    })
    overlay.add([card, primary, replay, menu])
    card.setScale(0.9)
    this.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.Out' })
  }
}
