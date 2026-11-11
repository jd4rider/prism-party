import Phaser from 'phaser'
import { openTipJar } from './support.js'
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
import { evaluateState } from '../optics/engine.js'
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

const BOARD_CENTER_Y = 498
const MAX_BOARD_W = 600
const MAX_BOARD_H = 462
const TRAY_Y = 850
const CHIP = 66

/*
 * A puzzle state is `{ rotations, placements }`. `rotations` holds a turn count
 * for every rotatable device *and* every tray piece; `placements` says which
 * piece sits in which socket. The engine resolves the two into one board, so a
 * piece in a socket behaves exactly like a device that was always there.
 *
 * Actions, which is what the star thresholds count:
 *   tap a device            one turn
 *   tap a placed piece      one turn (a piece can only be turned in a socket)
 *   drag/tap a piece in     one action
 *   drag/tap a piece out    one action
 */
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
    this.held = null
    this.hoverSocket = null
    this.dragging = false
  }

  create() {
    unlockAudio()
    this.theme = themeFor(this.level.world)
    background(this, this.theme, { reducedMotion: data.settings.reducedMotion })
    enterScene(this, 180)

    this.state = this.startState()
    this.history = [this.snapshot()]
    this.pointer = 0

    this.layout = this.computeLayout()
    this.socketSize = Math.min(this.layout.cell * 0.9, 92)
    this.socketById = new Map(
      this.level.devices.filter((device) => device.type === 'socket').map((device) => [device.id, device]),
    )
    this.pieces = this.level.tray ?? []

    this.buildHeader()
    this.buildBoard()
    this.buildDevices()
    this.buildTray()
    this.buildHud()

    // A dark pass under the additive light keeps the beam readable on pale
    // boards, where a white core alone would wash out.
    this.beamShadow = this.add.graphics().setDepth(19)
    this.beamGfx = this.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD)
    this.fxLayer = this.add.container(0, 0).setDepth(30)

    this.bindPointer()
    this.applyState({ animate: false })
    this.updateHud()
  }

  // --- state ---------------------------------------------------------------

  snapshot() {
    return { rotations: { ...this.state.rotations }, placements: { ...this.state.placements } }
  }

  startState() {
    const initial = this.level.initialState ?? { rotations: {}, placements: {} }
    this.initialState = {
      rotations: { ...(initial.rotations ?? {}) },
      placements: { ...(initial.placements ?? {}) },
    }
    let state = { rotations: { ...this.initialState.rotations }, placements: { ...this.initialState.placements } }
    if (this.mode === 'journey') {
      const restored = restorePuzzleState(this.level)
      if (restored) {
        state = {
          rotations: { ...restored.state.rotations },
          placements: { ...restored.state.placements },
        }
        this.hints = restored.hints ?? 0
      }
    }
    return state
  }

  get moves() {
    return this.pointer
  }

  pushHistory() {
    this.history = this.history.slice(0, this.pointer + 1)
    this.history.push(this.snapshot())
    this.pointer = this.history.length - 1
  }

  commit(sound = 'turn') {
    this.pushHistory()
    play(sound)
    this.applyState()
    this.updateHud()
    savePuzzleState(this.level, this.state, this.moves, this.hints)
  }

  /** One turn of a device or a piece. Public so the smoke test can use it. */
  rotateTarget(target) {
    if (!target) return
    const states = deviceStates({ type: target.type, rotatable: true })
    const current = this.state.rotations[target.id] ?? 0
    this.state.rotations[target.id] = (current + 1) % states
    this.commit('turn')
  }

  rotate(device) {
    if (this.finished) return
    this.rotateTarget(device)
    data.stats.rotations += 1
  }

  /** Turn a piece that sits in a socket. A loose piece is not rotatable. */
  rotatePiece(piece) {
    if (this.finished) return
    if (!this.socketOf(piece.id)) {
      this.showHintText('Drop the piece into a socket first')
      play('blocked')
      return
    }
    this.rotateTarget(piece)
    data.stats.rotations += 1
  }

  turnTo(target, want) {
    const states = deviceStates({ type: target.type, rotatable: true })
    let guard = 0
    while ((this.state.rotations[target.id] ?? 0) !== want && guard <= states) {
      this.state.rotations[target.id] = ((this.state.rotations[target.id] ?? 0) + 1) % states
      guard += 1
    }
  }

  socketOf(pieceId) {
    for (const [socketId, held] of Object.entries(this.state.placements)) {
      if (held === pieceId) return this.socketById.get(socketId) ?? null
    }
    return null
  }

  isPlaced(pieceId) {
    return Boolean(this.socketOf(pieceId))
  }

  /** Put a piece in a socket. Its rotation comes along; one tap, one action. */
  placePiece(socketId, pieceId) {
    if (this.finished) return
    if (!this.socketById.has(socketId)) return
    if (!this.pieces.some((piece) => piece.id === pieceId)) return
    if (this.state.placements[socketId] === pieceId) return
    for (const key of Object.keys(this.state.placements)) {
      if (this.state.placements[key] === pieceId) this.state.placements[key] = null
    }
    this.state.placements[socketId] = pieceId
    this.held = null
    this.commit('place')
  }

  lift(socketId) {
    if (this.finished) return
    if (!this.state.placements[socketId]) return
    this.state.placements[socketId] = null
    this.commit('undo')
  }

  undo() {
    if (this.finished || this.pointer <= 0) {
      play('blocked')
      return
    }
    this.pointer -= 1
    this.state = {
      rotations: { ...this.history[this.pointer].rotations },
      placements: { ...this.history[this.pointer].placements },
    }
    play('undo')
    this.applyState()
    this.updateHud()
    savePuzzleState(this.level, this.state, this.moves, this.hints)
  }

  redo() {
    if (this.finished || this.pointer >= this.history.length - 1) {
      play('blocked')
      return
    }
    this.pointer += 1
    this.state = {
      rotations: { ...this.history[this.pointer].rotations },
      placements: { ...this.history[this.pointer].placements },
    }
    play('undo')
    this.applyState()
    this.updateHud()
    savePuzzleState(this.level, this.state, this.moves, this.hints)
  }

  restart() {
    if (this.finished) return
    this.state = {
      rotations: { ...this.initialState.rotations },
      placements: { ...this.initialState.placements },
    }
    this.history = [this.snapshot()]
    this.pointer = 0
    this.hints = 0
    this.held = null
    play('undo')
    this.applyState()
    this.updateHud()
    clearPuzzleState()
  }

  // --- hint ----------------------------------------------------------------

  hint() {
    if (this.finished) return
    const solution = nearestSolution(this.level, this.state, { maxSolutions: 24 })
    if (!solution) {
      this.showHintText('No route from here — try Restart')
      return
    }

    // Placements first: a wrong or missing piece usually has to move before any
    // rotation can matter.
    for (const socket of this.socketById.values()) {
      const want = solution.placements[socket.id] ?? null
      const have = this.state.placements[socket.id] ?? null
      if (want === have) continue
      const piece = this.pieces.find((item) => item.id === want)
      this.hints += 1
      data.stats.hints += 1
      play('hint')
      const center = this.cellCenter(socket.x, socket.y)
      pulseRing(this, center.x, center.y, 0xffd166, { radius: this.layout.cell * 0.42, duration: 900 }).setDepth(34)
      this.tweenMarker(center.x, center.y - this.layout.cell * 0.62, '↓')
      const slot = piece ? this.traySlots.get(piece.id) : null
      if (slot) {
        pulseRing(this, slot.x, slot.y, 0xffd166, { radius: CHIP * 0.55, duration: 900 }).setDepth(34)
      }
      this.showHintText(piece ? `Drag the ${piece.type} into the glowing socket` : 'Clear that socket')
      return
    }

    const differences = []
    for (const device of this.level.devices) {
      if (!device.rotatable || device.type === 'socket') continue
      if ((this.state.rotations[device.id] ?? 0) !== (solution.rotations[device.id] ?? 0)) {
        differences.push({ target: device, center: this.cellCenter(device.x, device.y), label: device.type })
      }
    }
    for (const piece of this.pieces) {
      const socket = this.socketOf(piece.id)
      if (!socket) continue
      if ((this.state.rotations[piece.id] ?? 0) !== (solution.rotations[piece.id] ?? 0)) {
        differences.push({ target: piece, center: this.cellCenter(socket.x, socket.y), label: piece.type })
      }
    }
    const pick = differences[0]
    if (!pick) {
      this.showHintText('That should be it — one more look at the board')
      return
    }
    this.hints += 1
    data.stats.hints += 1
    play('hint')
    pulseRing(this, pick.center.x, pick.center.y, 0xffd166, { radius: this.layout.cell * 0.42, duration: 900 }).setDepth(34)
    this.tweenMarker(pick.center.x, pick.center.y - this.layout.cell * 0.62, '⟳')
    const states = deviceStates({ type: pick.target.type, rotatable: true })
    const current = this.state.rotations[pick.target.id] ?? 0
    const want = solution.rotations[pick.target.id] ?? 0
    const needs = (want - current + states) % states
    this.showHintText(needs === 1 ? `Turn the glowing ${pick.label}` : `The ${pick.label} needs ${needs} turns`)
  }

  tweenMarker(x, y, glyph) {
    const marker = text(this, x, y, glyph, 26, '#ffd166', { origin: 0.5 })
    marker.setDepth(35)
    this.tweens.add({
      targets: marker,
      y: y - 14,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: 'Sine.InOut',
      onComplete: () => marker.destroy(),
    })
  }

  showHintText(message) {
    if (!this.hintText) return
    this.hintText.setText(message)
    this.hintText.setAlpha(1)
    this.tweens.killTweensOf(this.hintText)
    this.tweens.add({ targets: this.hintText, alpha: 0, delay: 2400, duration: 600 })
  }

  leave() {
    if (!this.finished && this.mode === 'journey') savePuzzleState(this.level, this.state, this.moves, this.hints)
    fade(this, this.mode === 'journey' ? 'levels' : 'menu', { world: this.level.world })
  }

  // --- layout --------------------------------------------------------------

  computeLayout() {
    const { width, height } = this.level
    const cell = Math.min(MAX_BOARD_W / width, MAX_BOARD_H / height, 100)
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

  cellAt(x, y) {
    const { cell, left, top } = this.layout
    const gx = Math.floor((x - left) / cell)
    const gy = Math.floor((y - top) / cell)
    if (gx < 0 || gy < 0 || gx >= this.level.width || gy >= this.level.height) return null
    return { x: gx, y: gy }
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
    const receivers = this.level.devices.filter((device) => device.type === 'receiver').length
    const sockets = this.level.devices.filter((device) => device.type === 'socket').length
    const gates = this.level.devices.some((device) => device.type === 'gate')
    if (gates) return 'Open the shutter, then light every crystal'
    if (sockets > 0 && receivers > 1) return `Place ${sockets} piece${sockets === 1 ? '' : 's'} and light ${receivers} crystals`
    if (sockets > 0) return 'Place the piece, then light the crystal'
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
      view.container.setDepth(device.type === 'receiver' ? 26 : device.type === 'socket' ? 21 : 24)
      this.deviceViews.set(device.id, view)

      if (device.type === 'socket') {
        hitArea(this, center.x, center.y, cell, cell, {
          up: () => this.socketTapped(device),
        })
      } else if (device.rotatable) {
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

  socketTapped(socket) {
    if (this.finished) return
    if (this.held) {
      this.placePiece(socket.id, this.held)
      return
    }
    const pieceId = this.state.placements[socket.id]
    if (!pieceId) {
      this.showHintText('Drag a piece into this socket')
      play('blocked')
      return
    }
    const piece = this.pieces.find((item) => item.id === pieceId)
    if (piece) this.rotatePiece(piece)
  }

  // --- tray ----------------------------------------------------------------

  buildTray() {
    this.traySlots = new Map()
    this.pieceViews = new Map()
    if (this.pieces.length === 0) return

    const gap = 14
    const total = this.pieces.length * CHIP + (this.pieces.length - 1) * gap
    const rackW = total + 40
    const rackX = W / 2 - rackW / 2

    const rack = this.add.graphics().setDepth(22)
    rack.fillStyle(0x000000, 0.26)
    rack.fillRoundedRect(rackX + 3, TRAY_Y - 34 + 6, rackW, 72, 22)
    rack.fillStyle(this.theme.traySide, 1)
    rack.fillRoundedRect(rackX, TRAY_Y - 34 + 3, rackW, 72, 22)
    rack.fillStyle(mix(this.theme.tray, 0x000000, 0.12), 1)
    rack.fillRoundedRect(rackX, TRAY_Y - 34, rackW, 70, 22)
    rack.lineStyle(1.5, 0xffffff, this.theme.dark ? 0.18 : 0.4)
    rack.strokeRoundedRect(rackX + 1, TRAY_Y - 33, rackW - 2, 68, 21)

    // Empty bays, so a placed piece leaves a visible "this is where it was".
    let bayX = rackX + 20 + CHIP / 2
    for (let index = 0; index < this.pieces.length; index += 1) {
      rack.lineStyle(1.5, this.theme.tileEdge, 0.8)
      rack.strokeRoundedRect(bayX - CHIP / 2 + 2, TRAY_Y - CHIP / 2 + 2, CHIP - 4, CHIP - 4, 14)
      bayX += CHIP + gap
    }

    let x = rackX + 20 + CHIP / 2
    for (const piece of this.pieces) {
      this.traySlots.set(piece.id, { x, y: TRAY_Y })
      const view = drawDevice(this, { ...piece, rotatable: true }, this.socketSize, this.theme)
      view.container.setDepth(29).setScale(CHIP / this.socketSize)
      this.pieceViews.set(piece.id, view)
      hitArea(this, x, TRAY_Y, CHIP + gap * 0.6, CHIP + 8, {
        down: () => this.grab(piece),
      })
      x += CHIP + gap
    }

    // Above the rack, not below it: the control row starts at 899.
    text(this, W / 2, TRAY_Y - 44, 'drag a piece into a socket · tap it there to turn it', 11, this.theme.subtext, {
      origin: 0.5,
      alpha: 0.8,
    })
  }

  grab(piece) {
    if (this.finished) return
    // A placed piece stays put: tapping the socket is what turns it.
    if (this.isPlaced(piece.id)) return
    this.held = piece.id
    this.grabPoint = { x: this.input.activePointer.x, y: this.input.activePointer.y }
    this.dragging = false
    play('tap')
    this.syncPieces(false)
    this.syncSockets()
  }

  bindPointer() {
    this.input.on('pointermove', (pointer) => {
      if (!this.held) return
      const view = this.pieceViews.get(this.held)
      if (!view) return
      if (!this.dragging && this.grabPoint) {
        const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.grabPoint.x, this.grabPoint.y)
        if (distance > 10) this.dragging = true
      }
      if (this.dragging) {
        view.container.setPosition(pointer.x, pointer.y)
        view.container.setDepth(60)
      }
      const cell = this.cellAt(pointer.x, pointer.y)
      this.hoverSocket = cell ? this.socketAtCell(cell.x, cell.y) : null
      this.syncSockets()
    })

    this.input.on('pointerup', (pointer) => {
      if (!this.held) return
      const cell = this.cellAt(pointer.x, pointer.y)
      const socket = cell ? this.socketAtCell(cell.x, cell.y) : null
      const moved = this.dragging
      if (socket) {
        const piece = this.held
        this.dragging = false
        this.hoverSocket = null
        this.placePiece(socket.id, piece)
        return
      }
      // A drag that ends nowhere cancels; a plain tap leaves the piece in hand so
      // the next tap on a socket places it.
      if (moved) this.held = null
      this.dragging = false
      this.hoverSocket = null
      this.syncPieces(false)
      this.syncSockets()
    })
  }

  socketAtCell(gx, gy) {
    for (const socket of this.socketById.values()) {
      if (socket.x === gx && socket.y === gy) return socket
    }
    return null
  }

  // --- render --------------------------------------------------------------

  applyState({ animate = true } = {}) {
    const result = evaluateState(this.level, this.state)
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
      } else if (device.type === 'socket') {
        view.refresh({})
      } else if (device.rotatable) {
        view.setRotation(this.state.rotations[device.id] ?? 0, animate)
      }
    }

    this.syncPieces(animate)
    this.syncSockets()

    const lit = result.receivers.filter((receiver) => receiver.active).length
    const total = result.receivers.length
    if (this.statusText) {
      this.statusText.setText(result.solved ? 'Every crystal is lit' : `${lit} of ${total} crystals lit`)
      this.statusText.setColor(result.solved ? '#8ef0c0' : this.theme.text)
    }

    if (result.solved && !this.finished) this.complete()
  }

  syncPieces(animate) {
    if (!this.pieceViews) return
    for (const piece of this.pieces) {
      const view = this.pieceViews.get(piece.id)
      if (!view) continue
      const socket = this.socketOf(piece.id)
      if (socket) {
        const center = this.cellCenter(socket.x, socket.y)
        view.container.setPosition(center.x, center.y).setDepth(25).setScale(1).setAlpha(1)
      } else if (this.held === piece.id && this.dragging) {
        view.container.setDepth(60).setScale(1).setAlpha(0.95)
      } else {
        const slot = this.traySlots.get(piece.id)
        if (!slot) continue
        const lifted = this.held === piece.id ? 1.14 : 1
        view.container.setPosition(slot.x, slot.y).setDepth(29).setScale((CHIP / this.socketSize) * lifted).setAlpha(1)
      }
      view.setRotation(this.state.rotations[piece.id] ?? 0, animate)
    }
  }

  syncSockets() {
    if (!this.deviceViews) return
    for (const socket of this.socketById.values()) {
      const view = this.deviceViews.get(socket.id)
      if (!view) continue
      const occupied = Boolean(this.state.placements[socket.id])
      const hot = Boolean(this.held) && this.hoverSocket?.id === socket.id
      view.setHighlight(hot ? 'hot' : occupied ? 'full' : 'empty')
    }
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

    this.statusText = text(this, W / 2, 762, '', 14, theme.text, { origin: 0.5 })
    this.hintText = text(this, W / 2, 1006, '', 12, theme.subtext, { origin: 0.5 })
    text(this, W / 2, H - 24, 'littlejoyarcade.site', 11, theme.subtext, { origin: 0.5, alpha: 0.55 })
  }

  updateHud() {
    if (this.moveText) {
      this.moveText.setText(`${this.moves} ${this.moves === 1 ? 'action' : 'actions'}`)
    }
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
      text(this, 0, -54, `${this.moves} ${this.moves === 1 ? 'action' : 'actions'} · best ${this.level.minMoves}`, 15, theme.subtext, {
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
    // Quiet support link: results screen only, under the actions.
    const tip = button(this, buttonX, 520 + 300, '☕ Buy me a coffee', () => openTipJar(), {
      width: 380,
      height: 40,
      size: 14,
      theme,
      fill: theme.dark ? 0x2b2f52 : 0xffffff,
      textColor: theme.dark ? '#efeaff' : theme.text,
      hitDepth: 96,
    })
    overlay.add([card, primary, replay, menu, tip])
    card.setScale(0.9)
    this.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.Out' })
  }
}
