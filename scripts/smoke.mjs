/*
 * Browser smoke test for the built game.
 *
 *   npm run build
 *   npx vite preview --port 4183 --strictPort &
 *   node scripts/smoke.mjs
 *
 * Drives the real canvas with real pointer events — including an actual drag of a
 * tray piece into a socket — then finishes the board through the same methods the
 * input handlers call. Screenshots land in /tmp/prism-*.png for a visual pass.
 */
import { chromium } from 'playwright-core'

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

async function drag(from, to) {
  const a = await canvasPoint(from.x, from.y)
  const b = await canvasPoint(to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await sleep(60)
  await page.mouse.move(b.x, b.y, { steps: 14 })
  await sleep(80)
  await page.mouse.up()
  await sleep(200)
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
      receivers: scene.level.devices.filter((device) => device.type === 'receiver').length,
      tray: (scene.level.tray ?? []).length,
      beams: scene.result.beams.length,
    }
  })
  check('board renders with light', info.beams > 0, `${info.beams} beam segments, ${info.devices} devices`)
  check('level 1 is the first garden puzzle', info.id === 'w1-01', info.id)
  await shot('puzzle')

  // Real pointer tap on a rotatable device.
  const target = await page.evaluate(() => {
    const scene = window.prismParty.scene.getScene('puzzle')
    const device = scene.level.devices.find((item) => item.rotatable && item.type !== 'socket')
    if (!device) return null
    const center = scene.cellCenter(device.x, device.y)
    return { id: device.id, x: center.x, y: center.y, before: scene.state.rotations[device.id] ?? 0 }
  })
  if (target) {
    await tap(target.x, target.y)
    const after = await page.evaluate((id) => {
      const scene = window.prismParty.scene.getScene('puzzle')
      return { rotation: scene.state.rotations[id] ?? 0, moves: scene.moves }
    }, target.id)
    check('tapping a device turns it', after.rotation !== target.before, `${target.before} → ${after.rotation}`)
    check('the turn is counted', after.moves === 1, `${after.moves} actions`)

    await tap(124, 930)
    const undone = await page.evaluate(() => window.prismParty.scene.getScene('puzzle').moves)
    check('undo steps back', undone === 0, `${undone} actions`)
    const restored = await page.evaluate((id) => {
      const scene = window.prismParty.scene.getScene('puzzle')
      return scene.state.rotations[id] ?? 0
    }, target.id)
    check('undo restores the old rotation', restored === target.before, `${restored}`)
  }

  // Jump to a board that actually has pieces to place.
  const pieceLevel = await page.evaluate(() => {
    const levels = window.prismPartyLevels ?? []
    const index = levels.findIndex(
      (level) => (level.tray ?? []).length >= 2 && level.devices.some((device) => device.type === 'socket'),
    )
    if (index < 0) return null
    const scene = window.prismParty.scene.getScene('puzzle')
    scene.scene.start('puzzle', { level: levels[index], mode: 'zen' })
    return { index, id: levels[index].id, tray: levels[index].tray.length }
  })
  check('a placement board exists in the campaign', Boolean(pieceLevel), pieceLevel?.id ?? 'none')
  if (pieceLevel) {
    await sleep(700)
    await waitScene('puzzle')
    await sleep(500)
    await shot('placement')

    const setup = await page.evaluate(() => {
      const scene = window.prismParty.scene.getScene('puzzle')
      const piece = (scene.level.tray ?? [])[0]
      const socket = scene.level.devices.find((device) => device.type === 'socket')
      if (!piece || !socket) return null
      const slot = scene.traySlots.get(piece.id)
      return {
        piece: piece.id,
        socket: socket.id,
        // Boards start with pieces already in the wrong sockets, so "undone"
        // means back to this, not necessarily empty.
        before: scene.state.placements[socket.id] ?? null,
        from: { x: slot.x, y: slot.y },
        to: scene.cellCenter(socket.x, socket.y),
      }
    })
    if (setup) {
      await drag(setup.from, setup.to)
      const placed = await page.evaluate((socketId) => {
        const scene = window.prismParty.scene.getScene('puzzle')
        return { piece: scene.state.placements[socketId] ?? null, moves: scene.moves }
      }, setup.socket)
      check('dragging a piece into a socket seats it', placed.piece === setup.piece, `${placed.piece}`)
      check('the placement is one action', placed.moves === 1, `${placed.moves} actions`)

      await tap(setup.to.x, setup.to.y)
      const turned = await page.evaluate((id) => {
        const scene = window.prismParty.scene.getScene('puzzle')
        return { rotation: scene.state.rotations[id] ?? 0, moves: scene.moves }
      }, setup.piece)
      check('tapping the seated piece turns it', turned.rotation !== 0 || turned.moves === 2, `${turned.moves} actions`)

      await tap(124, 930)
      await tap(124, 930)
      const cleared = await page.evaluate((socketId) => {
        const scene = window.prismParty.scene.getScene('puzzle')
        return { piece: scene.state.placements[socketId] ?? null, moves: scene.moves }
      }, setup.socket)
      check(
        'two undos restore the original tray arrangement',
        cleared.piece === setup.before && cleared.moves === 0,
        `${cleared.moves} actions, socket holds ${cleared.piece}`,
      )
    }
  }

  // Finish the board through the same methods the input handlers use.
  const solved = await page.evaluate(async () => {
    const scene = window.prismParty.scene.getScene('puzzle')
    const solution = scene.level.solution
    for (const [socketId, pieceId] of Object.entries(solution.placements ?? {})) {
      if (pieceId) scene.placePiece(socketId, pieceId)
    }
    const placedIds = new Set(Object.values(solution.placements ?? {}).filter(Boolean))
    for (const piece of scene.level.tray ?? []) {
      if (placedIds.has(piece.id)) scene.turnTo(piece, solution.rotations[piece.id] ?? 0)
    }
    for (const device of scene.level.devices) {
      if (!device.rotatable || device.type === 'socket') continue
      scene.turnTo(device, solution.rotations[device.id] ?? 0)
    }
    scene.applyState({ animate: false })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return {
      solved: scene.result.solved,
      finished: scene.finished,
      moves: scene.moves,
      minMoves: scene.level.minMoves,
      stars: JSON.parse(localStorage.getItem('prism-party-save-v1') || '{}')?.levels?.[scene.level.id]?.stars ?? 0,
      id: scene.level.id,
    }
  })
  check('the stored solution lights every crystal', solved.solved === true)
  check('the results flow completes', solved.finished === true, `${solved.moves} actions`)
  check('stars are recorded', solved.stars > 0, `${solved.stars} stars on ${solved.id}`)
  await sleep(500)
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
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exit(1)
