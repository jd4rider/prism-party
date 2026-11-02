/*
 * Generate the app icons without any image dependency: rasterise a prism and
 * its three beams into raw RGBA and wrap it in a PNG. Run after changing the
 * palette.
 *
 *   node scripts/make-icon.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function crc32(buffer) {
  let table = globalThis.__crcTable
  if (!table) {
    table = new Int32Array(256)
    for (let index = 0; index < 256; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      table[index] = value
    }
    globalThis.__crcTable = table
  }
  let crc = -1
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, body) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, body])))
  return Buffer.concat([length, typeBuffer, body, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const index = (y * size + x) * 4
    const alpha = a / 255
    rgba[index] = Math.round(rgba[index] * (1 - alpha) + r * alpha)
    rgba[index + 1] = Math.round(rgba[index + 1] * (1 - alpha) + g * alpha)
    rgba[index + 2] = Math.round(rgba[index + 2] * (1 - alpha) + b * alpha)
    rgba[index + 3] = 255
  }

  // Background: a deep indigo rounded square with a soft top glow.
  const radius = size * 0.22
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(radius - x, 0, x - (size - radius))
      const dy = Math.max(radius - y, 0, y - (size - radius))
      if (Math.hypot(dx, dy) > radius) continue
      const t = y / size
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.5, y - size * 0.34) / (size * 0.62))
      put(
        x,
        y,
        Math.round(30 + glow * 60 + (1 - t) * 14),
        Math.round(24 + glow * 52 + (1 - t) * 16),
        Math.round(58 + glow * 90 + (1 - t) * 22),
      )
    }
  }

  const cx = size * 0.5
  const apex = { x: cx, y: size * 0.16 }
  const left = { x: size * 0.22, y: size * 0.78 }
  const right = { x: size * 0.78, y: size * 0.78 }

  const edge = (px, py, ax, ay, bx, by) => {
    const v = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
    return v
  }
  const inTriangle = (px, py, a, b, c) => {
    const e0 = edge(px, py, a.x, a.y, b.x, b.y)
    const e1 = edge(px, py, b.x, b.y, c.x, c.y)
    const e2 = edge(px, py, c.x, c.y, a.x, a.y)
    return (e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)
  }

  // Beams first, so the prism sits on top of them.
  const beams = [
    { to: { x: size * 0.08, y: size * 0.44 }, color: [255, 107, 138] },
    { to: { x: size * 0.5, y: size * 0.06 }, color: [125, 255, 176] },
    { to: { x: size * 0.92, y: size * 0.44 }, color: [127, 180, 255] },
  ]
  const origin = { x: cx, y: size * 0.52 }
  for (const beam of beams) {
    const steps = Math.ceil(size * 1.4)
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = Math.round(origin.x + (beam.to.x - origin.x) * t)
      const y = Math.round(origin.y + (beam.to.y - origin.y) * t)
      const thickness = size * 0.012
      for (let ox = -thickness; ox <= thickness; ox += 0.6) {
        for (let oy = -thickness; oy <= thickness; oy += 0.6) {
          if (Math.hypot(ox, oy) > thickness) continue
          put(Math.round(x + ox), Math.round(y + oy), beam.color[0], beam.color[1], beam.color[2], 150)
        }
      }
    }
    for (let dy = -size * 0.035; dy <= size * 0.035; dy += 0.7) {
      for (let dx = -size * 0.035; dx <= size * 0.035; dx += 0.7) {
        if (Math.hypot(dx, dy) > size * 0.035) continue
        put(Math.round(beam.to.x + dx), Math.round(beam.to.y + dy), beam.color[0], beam.color[1], beam.color[2], 235)
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!inTriangle(x, y, apex, left, right)) continue
      const t = (x - left.x) / (right.x - left.x)
      const shade = 0.55 + 0.45 * Math.max(0, 1 - Math.abs(t - 0.32) * 1.8)
      put(x, y, Math.round(150 * shade + 60), Math.round(214 * shade + 20), Math.round(255 * shade), 248)
    }
  }

  // A white rim on the two prism edges.
  const rim = (a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = Math.round(a.x + (b.x - a.x) * t)
      const y = Math.round(a.y + (b.y - a.y) * t)
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) put(x + ox, y + oy, 255, 255, 255, 190)
      }
    }
  }
  rim(apex, left)
  rim(left, right)
  rim(right, apex)

  return rgba
}

const outputs = [
  { path: 'build/icon.png', size: 1024 },
  { path: 'public/icon-180.png', size: 180 },
  { path: 'public/icon-512.png', size: 512 },
]

for (const output of outputs) {
  const target = resolve(root, output.path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, encodePng(output.size, output.size, render(output.size)))
  console.log(`wrote ${output.path} (${output.size}px)`)
}
