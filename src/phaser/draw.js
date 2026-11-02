/*
 * 2.5D device art. Every device is a small container of layered graphics: a
 * contact shadow, a base plate, the body, a top highlight and a glass rim.
 * Nothing here is simulated — the return value's `refresh` only repaints state
 * that the engine already decided.
 */

import Phaser from 'phaser'
import { COLORS, FILTER_CYCLE, receiverActive } from '../optics/model.js'
import { clamp, lightToHex, mix, toCss } from './common.js'

function basePlate(graphics, size, theme) {
  graphics.fillStyle(0x000000, 0.22)
  graphics.fillEllipse(2, size * 0.3, size * 0.76, size * 0.26)
  graphics.fillStyle(theme.traySide, 1)
  graphics.fillRoundedRect(-size * 0.4, -size * 0.34 + 4, size * 0.8, size * 0.68, size * 0.18)
  graphics.fillStyle(mix(theme.tile, 0xffffff, 0.08), 1)
  graphics.fillRoundedRect(-size * 0.4, -size * 0.34, size * 0.8, size * 0.66, size * 0.18)
}

function glassEdge(graphics, size, alpha = 0.5) {
  graphics.lineStyle(1.2, 0xffffff, alpha)
  graphics.strokeRoundedRect(-size * 0.4, -size * 0.34, size * 0.8, size * 0.66, size * 0.18)
}

function drawMirror(graphics, size, theme, tint) {
  basePlate(graphics, size, theme)
  // A thin diagonal blade, so the orientation is obvious at a glance: rotation 0
  // draws "/" and rotation 1 draws "\".
  const blade = size * 0.33
  const surface = tint ?? 0xd6ecff
  graphics.lineStyle(size * 0.2, 0x000000, 0.22)
  graphics.lineBetween(-blade + 2, blade + 3, blade + 2, -blade + 3)
  graphics.lineStyle(size * 0.17, 0x17303f, 1)
  graphics.lineBetween(-blade, blade, blade, -blade)
  graphics.lineStyle(size * 0.11, surface, 1)
  graphics.lineBetween(-blade, blade, blade, -blade)
  graphics.lineStyle(size * 0.04, 0xffffff, 0.95)
  graphics.lineBetween(-blade * 0.92, blade * 0.92, blade * 0.92, -blade * 0.92)
  // Metal caps where the blade meets the mount.
  graphics.fillStyle(mix(theme.accent, 0xffffff, 0.35), 0.95)
  graphics.fillCircle(-blade, blade, size * 0.055)
  graphics.fillCircle(blade, -blade, size * 0.055)
}

function drawPrism(graphics, size, theme) {
  basePlate(graphics, size, theme)
  const r = size * 0.36
  const points = [
    { x: 0, y: -r },
    { x: r * 0.92, y: r * 0.72 },
    { x: -r * 0.92, y: r * 0.72 },
  ]
  graphics.fillStyle(0x000000, 0.22)
  graphics.fillTriangle(points[0].x + 3, points[0].y + 5, points[1].x + 3, points[1].y + 5, points[2].x + 3, points[2].y + 5)
  graphics.fillStyle(0x2a4a6b, 1)
  graphics.fillTriangle(points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y)
  // Facets: a brighter left face and a coloured inner glow.
  graphics.fillStyle(0x9ad9ff, 0.9)
  graphics.fillTriangle(0, -r + 3, r * 0.92 - 3, r * 0.72 - 2, 0, r * 0.72 - 2)
  graphics.fillStyle(0x4f8fd6, 0.85)
  graphics.fillTriangle(0, -r + 3, 0, r * 0.72 - 2, -r * 0.92 + 3, r * 0.72 - 2)
  graphics.fillStyle(0xfff7d6, 0.55)
  graphics.fillTriangle(0, -r + 4, r * 0.3, r * 0.72 - 6, -r * 0.16, r * 0.72 - 6)
  graphics.lineStyle(1.4, 0xffffff, 0.7)
  graphics.strokeTriangle(points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y)
  void theme
}

function drawFilter(graphics, size, theme, mask) {
  basePlate(graphics, size, theme)
  const half = size * 0.3
  const color = lightToHex(mask)
  graphics.fillStyle(0x0d1b26, 0.9)
  graphics.fillRoundedRect(-half - 3, -half - 3, half * 2 + 6, half * 2 + 6, 7)
  graphics.fillStyle(color, 0.85)
  graphics.fillRoundedRect(-half, -half, half * 2, half * 2, 6)
  graphics.fillStyle(0xffffff, 0.35)
  graphics.fillRoundedRect(-half + 3, -half + 3, half * 2 - 6, half * 0.5, 4)
  graphics.lineStyle(1.5, 0xffffff, 0.6)
  graphics.strokeRoundedRect(-half, -half, half * 2, half * 2, 6)
  glassEdge(graphics, size, 0.3)
}

function drawSplitter(graphics, size, theme) {
  basePlate(graphics, size, theme)
  const r = size * 0.26
  const points = [
    { x: 0, y: -r * 1.2 },
    { x: r, y: 0 },
    { x: 0, y: r * 1.2 },
    { x: -r, y: 0 },
  ]
  graphics.fillStyle(0x1a2c3d, 0.9)
  graphics.fillRoundedRect(-r * 1.5, -r * 1.5, r * 3, r * 3, r)
  graphics.fillStyle(mix(theme.accent, 0xffffff, 0.35), 0.95)
  graphics.fillRoundedRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6, r)
  graphics.fillStyle(0xffffff, 0.85)
  for (const point of points) graphics.fillCircle(point.x, point.y, r * 0.22)
  graphics.lineStyle(2, 0xffffff, 0.55)
  graphics.strokeRoundedRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6, r)
}

function drawEmitter(graphics, size, theme, color) {
  basePlate(graphics, size, theme)
  const r = size * 0.24
  graphics.fillStyle(0x161f2c, 1)
  graphics.fillCircle(0, 0, r * 1.15)
  graphics.fillStyle(mix(theme.accent, 0x000000, 0.2), 1)
  graphics.fillCircle(0, 0, r)
  const hex = lightToHex(color)
  graphics.fillStyle(hex, 0.35)
  graphics.fillCircle(0, 0, r * 1.9)
  graphics.fillStyle(hex, 1)
  graphics.fillCircle(0, 0, r * 0.62)
  graphics.fillStyle(0xffffff, 0.9)
  graphics.fillCircle(-r * 0.18, -r * 0.2, r * 0.22)
}

function drawReceiver(graphics, size, theme, color, active, enter) {
  basePlate(graphics, size, theme)
  const r = size * 0.32
  const hex = active ? lightToHex(color) : mix(theme.tile, 0x22303d, 0.55)
  if (active) {
    graphics.fillStyle(hex, 0.22)
    graphics.fillCircle(0, 0, r * 2.1)
    graphics.fillStyle(hex, 0.14)
    graphics.fillCircle(0, 0, r * 1.5)
  }
  graphics.fillStyle(0x0e1622, 0.9)
  graphics.fillTriangle(0, -r * 1.35, r * 0.85, 0, 0, r * 1.35)
  graphics.fillTriangle(0, -r * 1.35, -r * 0.85, 0, 0, r * 1.35)
  const facet = active ? hex : 0x93bdd2
  graphics.fillStyle(facet, active ? 1 : 0.9)
  graphics.fillTriangle(0, -r * 1.22, r * 0.72, 0, 0, r * 1.22)
  graphics.fillStyle(mix(facet, 0xffffff, active ? 0.45 : 0.3), active ? 1 : 0.85)
  graphics.fillTriangle(0, -r * 1.22, -r * 0.72, 0, 0, r * 1.22)
  graphics.fillStyle(0xffffff, active ? 0.85 : 0.25)
  graphics.fillTriangle(0, -r * 1.0, r * 0.24, -r * 0.1, -r * 0.2, r * 0.1)
  graphics.lineStyle(1.4, 0xffffff, active ? 0.8 : 0.3)
  graphics.strokeTriangle(0, -r * 1.35, r * 0.85, 0, 0, r * 1.35)
  graphics.strokeTriangle(0, -r * 1.35, -r * 0.85, 0, 0, r * 1.35)

  // A directional crystal shows which side it drinks from, so the rule is
  // visible before the beam finds it.
  if (enter !== undefined && enter !== null) {
    const angle = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][((enter % 4) + 4) % 4]
    const tip = { x: Math.cos(angle) * r * 1.05, y: Math.sin(angle) * -r * 1.05 }
    const back = { x: Math.cos(angle + 2.4) * r * 0.42, y: Math.sin(angle + 2.4) * -r * 0.42 }
    const back2 = { x: Math.cos(angle - 2.4) * r * 0.42, y: Math.sin(angle - 2.4) * -r * 0.42 }
    graphics.fillStyle(active ? 0xffffff : mix(theme.tile, 0x111111, 0.35), active ? 0.95 : 0.6)
    graphics.fillTriangle(tip.x, tip.y, back.x, back.y, back2.x, back2.y)
  }
}

function drawPortal(graphics, size, theme) {
  basePlate(graphics, size, theme)
  const r = size * 0.24
  graphics.fillStyle(0x120a24, 1)
  graphics.fillCircle(0, 0, r * 1.25)
  for (let ring = 0; ring < 3; ring += 1) {
    graphics.lineStyle(3 - ring * 0.6, mix(theme.accent, 0xffffff, 0.2 + ring * 0.2), 0.9 - ring * 0.2)
    graphics.strokeCircle(0, 0, r * (1.05 - ring * 0.3))
  }
  graphics.fillStyle(0xffffff, 0.9)
  graphics.fillCircle(0, 0, r * 0.18)
}

function drawGate(graphics, size, theme, open) {
  basePlate(graphics, size, theme)
  const half = size * 0.34
  const thickness = size * 0.14
  graphics.fillStyle(mix(theme.accent, 0x1a1a1a, 0.55), 1)
  if (open) {
    graphics.fillRoundedRect(-half, -half * 0.9, thickness, half * 0.7, 3)
    graphics.fillRoundedRect(half - thickness, -half * 0.9, thickness, half * 0.7, 3)
  } else {
    graphics.fillRoundedRect(-half, -thickness / 2, half * 2, thickness, 3)
    graphics.lineStyle(1.5, 0xffffff, 0.35)
    graphics.strokeRoundedRect(-half, -thickness / 2, half * 2, thickness, 3)
  }
  graphics.fillStyle(0xffffff, 0.25)
  graphics.fillCircle(0, 0, size * 0.05)
}

function drawSwitch(graphics, size, theme, on) {
  basePlate(graphics, size, theme)
  const r = size * 0.2
  graphics.fillStyle(0x101c26, 1)
  graphics.fillCircle(0, 0, r * 1.3)
  graphics.fillStyle(on ? 0x9dffd9 : 0x2f4757, 1)
  graphics.fillCircle(0, 0, r)
  if (on) {
    graphics.fillStyle(0x9dffd9, 0.28)
    graphics.fillCircle(0, 0, r * 1.9)
  }
  graphics.fillStyle(0xffffff, 0.8)
  graphics.fillCircle(-r * 0.25, -r * 0.25, r * 0.24)
}

/**
 * A socket is a hole in the tray with four corner ticks: the player's cue that
 * something has to be dropped in. `setHighlight` is the only stateful part.
 */
export function drawSocket(scene, size, theme) {
  const container = scene.add.container(0, 0)
  const hole = scene.add.graphics()
  const half = size * 0.31
  hole.fillStyle(0x000000, 0.28)
  hole.fillRoundedRect(-half, -half, half * 2, half * 2, size * 0.14)
  hole.fillStyle(mix(theme.traySide, 0x000000, 0.4), 1)
  hole.fillRoundedRect(-half + 2, -half + 2, half * 2 - 4, half * 2 - 4, size * 0.12)
  hole.fillStyle(0xffffff, 0.08)
  hole.fillRoundedRect(-half + 4, -half + 4, half * 2 - 8, size * 0.14, size * 0.07)
  hole.lineStyle(2, 0xffffff, 0.2)
  hole.strokeRoundedRect(-half + 2, -half + 2, half * 2 - 4, half * 2 - 4, size * 0.12)

  const ticks = scene.add.graphics()
  ticks.lineStyle(2.4, theme.accent, 0.75)
  const t = size * 0.1
  const corners = [
    [-half, -half, 1, 1],
    [half, -half, -1, 1],
    [-half, half, 1, -1],
    [half, half, -1, -1],
  ]
  for (const [x, y, dx, dy] of corners) {
    ticks.lineBetween(x, y, x + t * dx, y)
    ticks.lineBetween(x, y, x, y + t * dy)
  }

  const plus = scene.add.graphics()
  plus.lineStyle(2, 0xffffff, 0.28)
  plus.lineBetween(-size * 0.07, 0, size * 0.07, 0)
  plus.lineBetween(0, -size * 0.07, 0, size * 0.07)

  const ring = scene.add.graphics()
  ring.lineStyle(3, theme.accent, 1)
  ring.strokeRoundedRect(-half - 3, -half - 3, half * 2 + 6, half * 2 + 6, size * 0.16)
  ring.setAlpha(0)

  container.add([hole, ticks, plus, ring])
  return {
    container,
    setHighlight(mode) {
      ring.setAlpha(mode === 'hot' ? 1 : 0)
      plus.setVisible(mode !== 'full')
      ticks.setAlpha(mode === 'full' ? 0.35 : 1)
    },
    setRotation() {},
    setActive() {},
    setOpen() {},
    refresh() {},
    destroy() {
      container.destroy()
    },
  }
}

/** A colour-locked door: two posts and a tinted pane only that colour opens. */
function drawDoor(graphics, size, theme, colorName) {
  basePlate(graphics, size, theme)
  const half = size * 0.33
  const post = size * 0.12
  const hex = lightToHex(COLORS[colorName] ?? COLORS.white)
  graphics.fillStyle(hex, 0.16)
  graphics.fillRoundedRect(-half, -half, half * 2, half * 2, size * 0.1)
  graphics.fillStyle(0x121b26, 0.95)
  graphics.fillRoundedRect(-half, -half, post, half * 2, 3)
  graphics.fillRoundedRect(half - post, -half, post, half * 2, 3)
  graphics.fillStyle(hex, 0.42)
  graphics.fillRoundedRect(-half + post, -half + 3, half * 2 - post * 2, half * 2 - 6, 2)
  graphics.lineStyle(1.6, hex, 0.95)
  graphics.strokeRoundedRect(-half, -half, post, half * 2, 3)
  graphics.strokeRoundedRect(half - post, -half, post, half * 2, 3)
  // Bars read as "locked" without relying on hue alone.
  graphics.lineStyle(1.4, 0xffffff, 0.4)
  for (let bar = 1; bar < 4; bar += 1) {
    const x = -half + post + ((half * 2 - post * 2) * bar) / 4
    graphics.lineBetween(x, -half + 5, x, half - 5)
  }
  graphics.fillStyle(mix(hex, 0xffffff, 0.6), 0.9)
  graphics.fillCircle(-half + 4, -half + 4, size * 0.045)
  graphics.fillCircle(half - 4, half - 4, size * 0.045)
}

function drawBlocker(graphics, size, theme) {
  graphics.fillStyle(0x000000, 0.25)
  graphics.fillEllipse(2, size * 0.3, size * 0.7, size * 0.24)
  graphics.fillStyle(mix(theme.traySide, 0x000000, 0.3), 1)
  graphics.fillRoundedRect(-size * 0.34, -size * 0.3, size * 0.68, size * 0.6, size * 0.16)
  graphics.fillStyle(mix(theme.traySide, 0xffffff, 0.12), 1)
  graphics.fillRoundedRect(-size * 0.3, -size * 0.28, size * 0.6, size * 0.5, size * 0.14)
  graphics.fillStyle(0xffffff, 0.12)
  graphics.fillRoundedRect(-size * 0.24, -size * 0.24, size * 0.3, size * 0.16, 4)
}

export function maskForDevice(device, rotation) {
  if (device.pass) return COLORS[device.pass] ?? COLORS.white
  return COLORS[FILTER_CYCLE[((rotation % 6) + 6) % 6]] ?? COLORS.white
}

/**
 * Build a device sprite. `refresh(state)` repaints the parts that depend on the
 * simulation: receiver activation, switch state, gate shutters, filter colour.
 */
export function drawDevice(scene, device, size, theme, options = {}) {
  // Sockets build their own container: they are a hole, not a figurine.
  if (device.type === 'socket') return drawSocket(scene, size, theme)

  const container = scene.add.container(0, 0)
  const body = scene.add.graphics()
  container.add(body)

  const state = { rotation: device.rotation ?? 0, active: false, color: { r: 1, g: 1, b: 1 }, open: false }
  const rotator = scene.add.container(0, 0)
  container.add(rotator)

  const render = () => {
    body.clear()
    rotator.removeAll(true)
    const graphic = scene.add.graphics()
    switch (device.type) {
      case 'mirror':
        drawMirror(graphic, size, theme)
        break
      case 'prism':
        drawPrism(graphic, size, theme)
        break
      case 'filter':
        drawFilter(graphic, size, theme, maskForDevice(device, state.rotation))
        break
      case 'splitter':
        drawSplitter(graphic, size, theme)
        break
      case 'emitter':
        drawEmitter(graphic, size, theme, COLORS[device.color ?? 'white'] ?? COLORS.white)
        break
      case 'receiver':
        drawReceiver(graphic, size, theme, state.color, state.active, device.enter)
        break
      case 'door':
        drawDoor(graphic, size, theme, device.color)
        break
      case 'portal':
        drawPortal(graphic, size, theme)
        break
      case 'gate':
        drawGate(graphic, size, theme, state.open)
        break
      case 'switch':
        drawSwitch(graphic, size, theme, state.active)
        break
      default:
        drawBlocker(graphic, size, theme)
        break
    }
    rotator.add(graphic)
    return graphic
  }

  const rotationAngle = () => {
    switch (device.type) {
      case 'mirror':
        return state.rotation * 90
      case 'prism':
        return state.rotation * 90
      case 'splitter':
        return state.rotation * 90
      default:
        return 0
    }
  }

  render()
  if (device.type === 'mirror' || device.type === 'prism' || device.type === 'splitter') {
    rotator.setAngle(rotationAngle())
  }

  const containerReturn = {
    container,
    get graphic() {
      return body
    },
    get active() {
      return state.active
    },
    get rotation() {
      return state.rotation
    },
    setRotation(rotation, animate = true) {
      const previous = state.rotation
      state.rotation = rotation
      if (device.type === 'mirror' || device.type === 'prism' || device.type === 'splitter') {
        const target = rotationAngle()
        if (animate && options.animate !== false) {
          // Match the shortest way round so a two-state mirror never spins.
          let delta = target - rotator.angle
          while (delta > 180) delta -= 360
          while (delta < -180) delta += 360
          scene.tweens.add({ targets: rotator, angle: rotator.angle + delta, duration: 190, ease: 'Cubic.Out' })
        } else {
          rotator.setAngle(target)
        }
      } else {
        render()
      }
      if (previous !== rotation && device.type === 'filter') render()
    },
    setActive(active, color) {
      const changed = state.active !== active || (color && lightToHex(color) !== lightToHex(state.color))
      state.active = active
      if (color) state.color = { ...color }
      if (changed) render()
    },
    setOpen(open) {
      if (state.open === open) return
      state.open = open
      render()
    },
    refresh(state2) {
      if (!state2) return
      if (typeof state2.active === 'boolean') state.active = state2.active
      if (state2.color) state.color = { ...state2.color }
      if (typeof state2.open === 'boolean') state.open = state2.open
      if (typeof state2.rotation === 'number') state.rotation = state2.rotation
      render()
    },
    destroy() {
      container.destroy()
    },
  }

  // Emitters and receivers read better with a soft idle glow.
  if (device.type === 'receiver' && !options.static) {
    scene.tweens.add({
      targets: container,
      scaleX: { from: 1, to: 1.04 },
      scaleY: { from: 1, to: 1.04 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
  }

  return containerReturn
}

/** Cheap glow disc used behind an active receiver. */
export function glowDisc(scene, x, y, radius, color, alpha = 0.22) {
  const disc = scene.add.circle(x, y, radius, color, alpha)
  disc.setBlendMode(Phaser.BlendModes.ADD)
  return disc
}

export function receiveState(receiver, device) {
  return receiverActive(device, receiver.color)
}

export function tintFor(color) {
  return lightToHex(color)
}

export function readable(color) {
  return toCss(tintFor(color))
}

export { clamp }
