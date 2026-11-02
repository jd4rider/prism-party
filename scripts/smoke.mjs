/*
 * Browser smoke test for the built game.
 *
 *   npm run build && npx vite preview --port 4183 --strictPort &
 *   node scripts/smoke.mjs
 *
 * Drives the real canvas with real pointer events, then finishes the board
 * through the same rotate() path the touch handler uses. Screenshots land in
 * /tmp/prism-*.png for a visual pass.
 */
import { chromium } from 'playwright-core'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.PRISM_URL ?? 'http://localhost:4183/'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const results = []
const errors = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 })
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

const shot = (name) => page.screenshot({ path: `/tmp/prism-${name}.png` })
const sleep = (ms) => page.waitForTimeout(ms)

async function sceneActive(key) {
  return page.evaluate((name) => Boolean(window.prismParty?.scene?.getScene(name)?.scene?.isActive()), key)
}

/** Wait for a scene to take over instead of guessing at a delay. */
async function waitScene(key, timeout = 8000) {
  try {
    await page.waitForFunction(
      (name) => Boolean(window.prismParty?.scene?.getScene(name)?.scene?.isActive()),
      key,
      { timeout, polling: 60 },
    )
    return true
  } catch {
    return false
  }
}

async function canvasPoint(sceneX, sceneY) {
  const box = await page.locator('#game canvas').boundingBox()
  const size = await page.evaluate(() => ({
    width: window.prismParty.scale.width,
    height: window.prismParty.scale.height,
  }))
  return {
    x: box.x + (sceneX / size.width) * box.width,
    y: box.y + (sceneY / size.height) * box.height,
  }
}

async function tap(sceneX, sceneY) {
  const point = await canvasPoint(sceneX, sceneY)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await sleep(50)
  await page.mouse.up()
  await sleep(120)
}

try {
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.prismParty?.scene?.getScene('menu')?.scene?.isActive()), null, {
    timeout: 15000,
  })
  await sleep(600)
  check('boots to the menu', true)
  await shot('menu')

  // Play directly into level 1.
  await tap(360, 620)
  const onPuzzle = await waitScene('puzzle')
  check('Play opens the puzzle board', onPuzzle)
  if (!onPuzzle) throw new Error('could not open a puzzle')
  await sleep(400)

  const info = await page.evaluate(() => {
    const scene = window.prismParty.scene.getScene('puzzle')
    return {
      id: scene.level.id,
      world: scene.level.world,
      devices: scene.level.devices.length,
      rotatable: scene.level.devices.filter((device) => device.rotatable).length,
      receivers: scene.level.devices.filter((device) => device.type === 'receiver').length,
      rotation: scene.rotations,
      solution: scene.level.solution,
      minMoves: scene.level.minMoves,
      beams: scene.result.beams.length,
    }
  })
  check('board renders with light', info.beams > 0, `${info.beams} beam segments, ${info.devices} devices`)
  check('level 1 is the first garden puzzle', info.id === 'w1-01', info.id)
  await shot('puzzle')

  // Real pointer tap on a rotatable device.
  const target = await page.evaluate(() => {
    const scene = window.prismParty.scene.getScene('puzzle')
    const device = scene.level.devices.find((item) => item.rotatable)
    if (!device) return null
    const center = scene.cellCenter(device.x, device.y)
    return { id: device.id, x: center.x, y: center.y, before: scene.rotations[device.id] ?? 0 }
  })
  if (target) {
    await tap(target.x, target.y)
    const after = await page.evaluate((id) => {
      const scene = window.prismParty.scene.getScene('puzzle')
      return { rotation: scene.rotations[id] ?? 0, moves: scene.moves, redo: scene.history.length }
    }, target.id)
    check('tapping a device turns it', after.rotation !== target.before, `${target.before} → ${after.rotation}`)
    check('the turn is counted', after.moves === 1, `${after.moves} turns`)

    // Undo through the real button (first in the control row), then solve.
    await tap(124, 930)
    const undone = await page.evaluate(() => window.prismParty.scene.getScene('puzzle').moves)
    check('undo steps back', undone === 0, `${undone} turns`)
    const restored = await page.evaluate((id) => {
      const scene = window.prismParty.scene.getScene('puzzle')
      return scene.rotations[id] ?? 0
    }, target.id)
    check('undo restores the old rotation', restored === target.before, `${restored}`)
  }

  // Finish through rotate(), the same entry point the pointer handler calls.
  const solved = await page.evaluate(async () => {
    const scene = window.prismParty.scene.getScene('puzzle')
    const states = { mirror: 2, prism: 4, filter: 6, splitter: 4 }
    for (const device of scene.level.devices) {
      if (!device.rotatable) continue
      const want = scene.level.solution[device.id]
      let guard = 0
      while ((scene.rotations[device.id] ?? 0) !== want && guard < 8) {
        scene.rotate(device)
        guard += 1
      }
      void states
    }
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return {
      solved: scene.result.solved,
      finished: scene.finished,
      moves: scene.moves,
      stars: JSON.parse(localStorage.getItem('prism-party-save-v1') || '{}')?.levels?.[scene.level.id]?.stars ?? 0,
      id: scene.level.id,
    }
  })
  check('the stored solution lights every crystal', solved.solved === true)
  check('the results flow completes', solved.finished === true, `${solved.moves} turns`)
  check('stars are recorded', solved.stars > 0, `${solved.stars} stars on ${solved.id}`)
  await sleep(400)
  await shot('result')

  // Reload and confirm the save survived.
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.prismParty?.scene?.getScene('menu')?.scene?.isActive()), null, {
    timeout: 15000,
  })
  const persisted = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('prism-party-save-v1') || '{}')
    return Object.values(save.levels ?? {}).filter((entry) => entry.stars > 0).length
  })
  check('progress survives a reload', persisted > 0, `${persisted} solved`)

  // Journey navigation: menu → worlds → levels → puzzle.
  await tap(360 - 116, 726)
  const onWorlds = await waitScene('worlds')
  check('Journey opens the world map', onWorlds)
  if (onWorlds) {
    await sleep(300)
    await shot('worlds')
    await tap(360, 210)
    const onLevels = await waitScene('levels')
    check('a world opens its level grid', onLevels)
    if (onLevels) {
      await sleep(300)
      await shot('levels')
      await tap(128, 240)
      const back = await waitScene('puzzle')
      check('a level opens from the grid', back)
    }
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('smoke run completed', false, error.message)
} finally {
  await browser.close()
  await mkdtemp(join(tmpdir(), 'prism-')).catch(() => {})
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exit(1)
