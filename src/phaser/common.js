/* Shared layout, type and controls. Every scene draws through these helpers so
 * the board, the menus and the results screen feel like one object. */

import Phaser from 'phaser'
import { MENU_THEME } from '../theme.js'

export const W = 720
export const H = 1080

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif'
export const FONT_TITLE = 'Georgia, "Iowan Old Style", "Times New Roman", serif'

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function text(scene, x, y, content, size = 18, color = '#ffffff', options = {}) {
  const { title = false, origin = 0, ...rest } = options
  const item = scene.add.text(x, y, content, {
    fontFamily: title ? FONT_TITLE : FONT,
    fontSize: `${size}px`,
    color,
    ...rest,
  })
  if (origin !== 0) item.setOrigin(origin)
  return item
}

export function toCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function mix(a, b, t) {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const br = (b >> 16) & 255
  const bg = (b >> 8) & 255
  const bb = b & 255
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  )
}

/** Logical light colour (0..1 per channel) to a display colour. */
export function lightToHex(color, boost = 1) {
  const channel = (value) => Math.round(clamp(Math.pow(clamp(value, 0, 1), 0.72) * 255 * boost, 0, 255))
  const r = channel(color.r)
  const g = channel(color.g)
  const b = channel(color.b)
  return (r << 16) | (g << 8) | b
}

export function background(scene, theme, options = {}) {
  const graphics = scene.add.graphics().setDepth(0)
  graphics.fillGradientStyle(theme.sky[0], theme.sky[0], theme.sky[1], theme.sky[1], 1)
  graphics.fillRect(0, 0, W, H)

  // A soft horizon glow so the board reads as a table in a room, not a void.
  graphics.fillStyle(theme.ground, 0.25)
  graphics.fillEllipse(W / 2, H * 0.52, W * 1.5, H * 0.9)
  graphics.fillStyle(theme.ground, 0.35)
  graphics.fillRect(0, H * 0.78, W, H * 0.22)

  if (!options.quiet && !options.reducedMotion) {
    for (let index = 0; index < 16; index += 1) {
      const mote = scene.add.circle(
        Phaser.Math.Between(20, W - 20),
        Phaser.Math.Between(40, H - 60),
        Phaser.Math.Between(1, 3),
        theme.warm,
        0.45,
      )
      mote.setDepth(1)
      scene.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(50, 130),
        alpha: { from: 0.05, to: 0.55 },
        duration: Phaser.Math.Between(3200, 6400),
        delay: index * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
    }
  }
  return graphics
}

/** A raised card: shadow, side face, top face and a hairline highlight. */
export function panel(scene, x, y, width, height, theme = MENU_THEME, options = {}) {
  const graphics = scene.add.graphics()
  const radius = options.radius ?? 26
  const drop = options.drop ?? 8
  graphics.fillStyle(0x000000, 0.28)
  graphics.fillRoundedRect(x - width / 2 + 4, y - height / 2 + drop + 4, width, height, radius)
  graphics.fillStyle(theme.traySide, 1)
  graphics.fillRoundedRect(x - width / 2, y - height / 2 + drop, width, height, radius)
  graphics.fillStyle(options.fill ?? theme.panel, options.alpha ?? 1)
  graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius)
  graphics.lineStyle(1.5, 0xffffff, theme.dark ? 0.18 : 0.55)
  graphics.strokeRoundedRect(x - width / 2 + 0.75, y - height / 2 + 0.75, width - 1.5, height - 1.5, radius)
  return graphics
}

/*
 * Pointer targets.
 *
 * Phaser 4 in this build does not hit-test Containers with explicit hit areas,
 * and Shape hit testing was unreliable for controls created during create().
 * Rather than depend on that, every tappable region registers here and one
 * scene-level listener resolves the tap. Ordering is explicit (last added wins),
 * which is exactly what an overlay needs, and device taps go through the same
 * path so behaviour cannot diverge.
 */
const registries = new WeakMap()

function resolve(list, pointer) {
  const x = pointer.x ?? pointer.worldX
  const y = pointer.y ?? pointer.worldY
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index]
    if (entry.enabled === false) continue
    if (Math.abs(x - entry.x) <= entry.width / 2 && Math.abs(y - entry.y) <= entry.height / 2) return entry
  }
  return null
}

export function pointerRegistry(scene) {
  const existing = registries.get(scene)
  if (existing) return existing

  const list = []
  const api = {
    list,
    add(entry) {
      list.push(entry)
      return entry
    },
    remove(entry) {
      const index = list.indexOf(entry)
      if (index >= 0) list.splice(index, 1)
    },
    clear() {
      list.length = 0
    },
  }
  registries.set(scene, api)

  scene.input.on('pointerdown', (pointer) => {
    const hit = resolve(list, pointer)
    scene.__pressedTarget = hit
    if (hit?.handlers?.down) hit.handlers.down()
  })
  scene.input.on('pointerup', (pointer) => {
    const hit = resolve(list, pointer)
    const pressed = scene.__pressedTarget
    scene.__pressedTarget = null
    if (hit && hit === pressed && hit.handlers?.up) hit.handlers.up()
  })

  // A restarted scene gets fresh listeners on the next create().
  scene.events.once('shutdown', () => {
    list.length = 0
    registries.delete(scene)
  })

  return api
}

/** Register a tappable rectangle. Returns the entry so it can be disabled. */
export function hitArea(scene, x, y, width, height, handlers = {}, options = {}) {
  const entry = {
    x,
    y,
    width,
    height,
    handlers,
    enabled: options.enabled ?? true,
    cursor: options.cursor,
  }
  pointerRegistry(scene).add(entry)
  return entry
}

export function button(scene, x, y, label, onClick, options = {}) {
  const width = options.width ?? 340
  const height = options.height ?? 62
  const theme = options.theme ?? MENU_THEME
  const fill = options.fill ?? theme.accent
  const textColor = options.textColor ?? '#ffffff'
  const container = scene.add.container(x, y)

  const graphics = scene.add.graphics()
  graphics.fillStyle(0x000000, 0.28)
  graphics.fillRoundedRect(-width / 2 + 2, -height / 2 + 6, width, height, height / 2.6)
  graphics.fillStyle(mix(fill, 0x000000, 0.28), 1)
  graphics.fillRoundedRect(-width / 2, -height / 2 + 4, width, height, height / 2.6)
  graphics.fillStyle(fill, 1)
  graphics.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2.6)
  graphics.fillStyle(0xffffff, 0.16)
  graphics.fillRoundedRect(-width / 2 + 6, -height / 2 + 5, width - 12, height * 0.42, height / 3)
  if (options.outline) {
    graphics.lineStyle(2, options.outline, 0.8)
    graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2.6)
  }

  const labelText = text(scene, 0, 0, label, options.size ?? 20, textColor, {
    fontStyle: options.bold === false ? 'normal' : 'bold',
    origin: 0.5,
  })
  container.add([graphics, labelText])
  if (options.subtitle) {
    const sub = text(scene, 0, height * 0.62, options.subtitle, 12, textColor, { origin: 0.5, alpha: 0.8 })
    container.add(sub)
  }

  const hit = hitArea(
    scene,
    x,
    y,
    width,
    height,
    {
      down: () => scene.tweens.add({ targets: container, scale: 0.97, duration: 70, ease: 'Sine.Out' }),
      out: () => scene.tweens.add({ targets: container, scale: 1, duration: 90, ease: 'Sine.Out' }),
      up: () => {
        scene.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Back.Out' })
        onClick()
      },
    },
    { depth: options.hitDepth ?? 0 },
  )
  container.labelText = labelText
  container.hit = hit
  return container
}

export function iconButton(scene, x, y, glyph, onClick, options = {}) {
  const size = options.size ?? 64
  const theme = options.theme ?? MENU_THEME
  const container = scene.add.container(x, y)
  const graphics = scene.add.graphics()
  const fill = options.fill ?? mix(theme.tile, 0x000000, theme.dark ? 0.1 : 0.04)
  graphics.fillStyle(0x000000, 0.3)
  graphics.fillRoundedRect(-size / 2 + 2, -size / 2 + 5, size, size, size / 3.2)
  graphics.fillStyle(mix(fill, 0x000000, 0.22), 1)
  graphics.fillRoundedRect(-size / 2, -size / 2 + 3, size, size, size / 3.2)
  graphics.fillStyle(fill, 1)
  graphics.fillRoundedRect(-size / 2, -size / 2, size, size, size / 3.2)
  graphics.fillStyle(0xffffff, 0.14)
  graphics.fillRoundedRect(-size / 2 + 5, -size / 2 + 4, size - 10, size * 0.4, size / 4)

  const glyphText = text(scene, 0, 0, glyph, options.glyphSize ?? 26, options.color ?? theme.text, { origin: 0.5 })
  const caption = options.caption ? text(scene, 0, size / 2 + 14, options.caption, 11, theme.subtext, { origin: 0.5 }) : null
  container.add([graphics, glyphText])
  if (caption) container.add(caption)

  const hit = hitArea(
    scene,
    x,
    y,
    size,
    size,
    {
      down: () => scene.tweens.add({ targets: container, scale: 0.94, duration: 70 }),
      up: () => {
        scene.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Back.Out' })
        onClick()
      },
      out: () => scene.tweens.add({ targets: container, scale: 1, duration: 90 }),
    },
    { depth: options.hitDepth ?? 0 },
  )
  container.hit = hit
  container.glyphText = glyphText
  container.captionText = caption
  container.plate = graphics
  return container
}

export function starRow(scene, x, y, count, options = {}) {
  const size = options.size ?? 22
  const gap = options.gap ?? size * 1.15
  const container = scene.add.container(x, y)
  const total = options.total ?? 3
  for (let index = 0; index < total; index += 1) {
    const earned = index < count
    const glyph = text(scene, (index - (total - 1) / 2) * gap, 0, earned ? '★' : '☆', size, earned ? '#ffce55' : '#ffffff', {
      origin: 0.5,
      alpha: earned ? 1 : 0.35,
    })
    container.add(glyph)
    if (earned && !options.static) {
      scene.tweens.add({
        targets: glyph,
        scale: { from: 0.85, to: 1 },
        duration: 320,
        delay: index * 110,
        ease: 'Back.Out',
      })
    }
  }
  return container
}

/*
 * Transitions use a cover rectangle and a tween rather than the camera fade
 * effect: this Phaser build leaves the camera fade stuck in a running state, so
 * its completion event never arrives and navigation silently never happens.
 */
export function enterScene(scene, duration = 220) {
  const cover = scene.add.rectangle(W / 2, H / 2, W, H, 0x05070f, 1).setDepth(300)
  scene.tweens.add({
    targets: cover,
    alpha: 0,
    duration,
    ease: 'Sine.Out',
    onComplete: () => cover.destroy(),
  })
}

export function fade(scene, key, payload) {
  if (scene.__leaving) return
  scene.__leaving = true
  const start = () => {
    if (!scene.__leaving) return
    scene.__leaving = false
    scene.scene.start(key, payload)
  }
  const cover = scene.add.rectangle(W / 2, H / 2, W, H, 0x05070f, 0).setDepth(300)
  scene.tweens.add({ targets: cover, alpha: 1, duration: 160, ease: 'Sine.In', onComplete: start })
  // Belt and braces: if the tween is interrupted, still leave the screen.
  scene.time.delayedCall(700, () => {
    if (scene.scene.isActive()) start()
  })
}

export function letterSpaced(word) {
  return word.split('').join(' ')
}

/** A one-shot ring of light, used for hints and receiver activations. */
export function pulseRing(scene, x, y, color, options = {}) {
  const ring = scene.add.circle(x, y, options.radius ?? 18, color, 0)
  ring.setStrokeStyle(options.width ?? 3, color, 0.9)
  ring.setDepth(options.depth ?? 40)
  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: options.duration ?? 620,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy(),
  })
  return ring
}

export function sparkBurst(scene, x, y, color, count = 10, options = {}) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5
    const distance = Phaser.Math.Between(18, options.spread ?? 46)
    const dot = scene.add.circle(x, y, Phaser.Math.FloatBetween(1.6, 3.4), color, 0.95)
    dot.setDepth(options.depth ?? 41)
    scene.tweens.add({
      targets: dot,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(380, 720),
      ease: 'Cubic.Out',
      onComplete: () => dot.destroy(),
    })
  }
}
