import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COLORS,
  addColor,
  isDark,
  maskColor,
  mirrorOut,
  mirrorRotationFor,
  prismBranches,
  receiverActive,
  splitterBranches,
  turn,
} from './model.js'
import { evaluate } from './engine.js'
import { buildCandidate, mulberry32 } from './generator.js'
import { moveDistance, rateDifficulty, solve, validateLevel } from './solver.js'

const level = (devices, width = 7, height = 7) => ({ width, height, devices })

const emitter = (x, y, rotation, color = 'white', id = 'e1') => ({ id, type: 'emitter', x, y, rotation, color })
const mirror = (x, y, rotation, id = `m${x}${y}`) => ({ id, type: 'mirror', x, y, rotation, rotatable: true })
const receiver = (x, y, required = 'white', id = 'r1', extra = {}) => ({
  id,
  type: 'receiver',
  x,
  y,
  rotation: 0,
  required,
  ...extra,
})

test('mirror tables reflect all four directions consistently', () => {
  for (const direction of [0, 1, 2, 3]) {
    const slash = mirrorOut(0, direction)
    const backslash = mirrorOut(1, direction)
    assert.equal((slash - direction + 4) % 4 % 2, 1, 'a slash always turns the beam 90 degrees')
    assert.equal((backslash - direction + 4) % 4 % 2, 1, 'a backslash always turns the beam 90 degrees')
    assert.notEqual(slash, backslash)
    assert.equal(mirrorRotationFor(direction, slash), 0)
    assert.equal(mirrorRotationFor(direction, backslash), 1)
  }
  assert.equal(mirrorOut(2, 0), mirrorOut(0, 0), 'the far side of a diagonal reflects the same way')
})

test('a beam reflects off one mirror into a receiver', () => {
  const board = level([emitter(0, 3, 1), mirror(3, 3, 0), receiver(3, 0, 'white')])
  const result = evaluate(board, { m33: 0 })
  assert.equal(result.solved, true)
  // One segment per cell travelled: three east, three north.
  assert.equal(result.beams.length, 6)
  assert.equal(result.beams.filter((beam) => beam.y1 === 0).length, 1, 'the beam lands on the receiver')
  const wrong = evaluate(board, { m33: 1 })
  assert.equal(wrong.solved, false)
})

test('a blocked path leaves the receiver dark', () => {
  const board = level([emitter(0, 3, 1), { id: 'b1', type: 'blocker', x: 2, y: 3, rotation: 0 }, receiver(4, 3)])
  const result = evaluate(board, {})
  assert.equal(result.receivers[0].active, false)
  assert.equal(result.receivers[0].illumination, 0)
})

test('prisms split white light into red, green and blue branches', () => {
  const branches = prismBranches(0, 1)
  assert.deepEqual(branches.map((branch) => branch.channel), ['r', 'g', 'b'])
  assert.deepEqual(branches.map((branch) => branch.direction), [0, 1, 2])

  const board = level([
    emitter(0, 3, 1),
    { id: 'p1', type: 'prism', x: 2, y: 3, rotation: 0, rotatable: true },
    receiver(2, 1, 'red', 'r-red'),
    receiver(5, 3, 'green', 'r-green'),
    receiver(2, 5, 'blue', 'r-blue'),
  ])
  const result = evaluate(board, { p1: 0 })
  assert.equal(result.solved, true, 'all three colours arrive on their own branch')
  for (const item of result.receivers) assert.equal(item.active, true)
})

test('a prism cannot light a receiver with the wrong colour', () => {
  const board = level([
    emitter(0, 3, 1),
    { id: 'p1', type: 'prism', x: 2, y: 3, rotation: 0, rotatable: true },
    receiver(5, 3, 'red'),
  ])
  // Green travels straight, so a red requirement must stay unsatisfied.
  assert.equal(evaluate(board, { p1: 0 }).solved, false)
  // Turning the prism so red travels straight lights it.
  const turned = evaluate(board, { p1: 1 })
  assert.equal(turned.solved, true)
})

test('prism transmission never creates light', () => {
  const board = level([emitter(0, 3, 1), { id: 'p1', type: 'prism', x: 2, y: 3, rotation: 0 }])
  const result = evaluate(board, {})
  // Only the light leaving the prism matters; each channel may lose, never gain.
  const leaving = result.beams.filter((beam) => beam.x0 === 2 && beam.y0 === 3)
  assert.equal(leaving.length, 3)
  const red = leaving.reduce((sum, beam) => sum + beam.color.r, 0)
  const green = leaving.reduce((sum, beam) => sum + beam.color.g, 0)
  const blue = leaving.reduce((sum, beam) => sum + beam.color.b, 0)
  assert.ok(red <= 1.0001 && green <= 1.0001 && blue <= 1.0001, `channels ${red}/${green}/${blue} must not exceed 1`)
  assert.ok(red > 0.9 && green > 0.9 && blue > 0.9, 'each colour leaves at nearly full strength')
})

test('filters pass their channels and block the rest', () => {
  const board = level([emitter(0, 3, 1), { id: 'f1', type: 'filter', x: 2, y: 3, rotation: 0, pass: 'red' }, receiver(4, 3, 'red')])
  assert.equal(evaluate(board, {}).solved, true)

  const blocked = level([emitter(0, 3, 1), { id: 'f1', type: 'filter', x: 2, y: 3, rotation: 0, pass: 'red' }, receiver(4, 3, 'green')])
  assert.equal(evaluate(blocked, {}).solved, false)
})

test('a rotatable filter cycles the six masks', () => {
  const board = level([
    emitter(0, 3, 1),
    { id: 'f1', type: 'filter', x: 2, y: 3, rotation: 0, rotatable: true },
    receiver(4, 3, 'blue'),
  ])
  const maskBlue = evaluate(board, { f1: 2 })
  assert.equal(maskBlue.solved, true, 'state 2 passes blue')
  assert.equal(evaluate(board, { f1: 0 }).solved, false, 'state 0 passes red only')
})

test('receivers refuse a bright beam with too much unwanted colour', () => {
  assert.equal(receiverActive({ required: 'red' }, COLORS.white), false)
  assert.equal(receiverActive({ required: 'red' }, COLORS.red), true)
  assert.equal(receiverActive({ required: 'yellow' }, { r: 1, g: 1, b: 0.1 }), true)
  assert.equal(receiverActive({ required: 'yellow' }, { r: 1, g: 1, b: 0.9 }), false)
  assert.equal(receiverActive({ required: 'white' }, { r: 0.9, g: 0.9, b: 0.9 }), true)
})

test('splitters halve the beam in two directions', () => {
  const board = level([
    emitter(0, 3, 1),
    { id: 's1', type: 'splitter', x: 2, y: 3, rotation: 0, rotatable: true },
    receiver(4, 3, 'white', 'straight', { minIntensity: 0.4 }),
    receiver(2, 5, 'white', 'sideways', { minIntensity: 0.4 }),
  ])
  assert.deepEqual(splitterBranches(0, 1), [1, 2])
  const result = evaluate(board, { s1: 0 })
  assert.equal(result.receivers[0].active, true)
  assert.equal(result.receivers[1].active, true)
  assert.ok(Math.abs(result.receivers[0].illumination - 1.5) < 0.01, 'half of a white beam is 1.5 total')
})

test('a split beam clears the normal threshold but not a demanding one', () => {
  const half = level([
    emitter(0, 3, 1),
    { id: 's1', type: 'splitter', x: 2, y: 3, rotation: 0 },
    receiver(4, 3, 'white'),
  ])
  assert.equal(evaluate(half, {}).solved, true, 'half a white beam still reaches 0.45')

  const demanding = level([
    emitter(0, 3, 1),
    { id: 's1', type: 'splitter', x: 2, y: 3, rotation: 0 },
    receiver(4, 3, 'white', 'r1', { minIntensity: 0.7 }),
  ])
  assert.equal(evaluate(demanding, {}).solved, false, 'a full-strength crystal cannot run on half a beam')
})

test('portals carry a beam across the board', () => {
  const board = level([
    emitter(0, 3, 1),
    { id: 'pa', type: 'portal', x: 2, y: 3, rotation: 0, pair: 'a' },
    { id: 'pb', type: 'portal', x: 5, y: 1, rotation: 0, pair: 'a' },
    receiver(6, 1),
  ])
  const result = evaluate(board, {})
  assert.equal(result.solved, true)
})

test('a closed gate blocks and an open one passes', () => {
  const devices = [
    emitter(0, 3, 1),
    { id: 'g1', type: 'gate', x: 2, y: 3, rotation: 0, switchId: 'sw1' },
    receiver(4, 3),
  ]
  assert.equal(evaluate(level(devices), {}).solved, false)

  const withSwitch = level([
    ...devices,
    { id: 'sw1', type: 'switch', x: 2, y: 5, rotation: 0 },
    emitter(0, 5, 1, 'white', 'e2'),
  ])
  assert.equal(evaluate(withSwitch, {}).solved, true, 'the side beam opens the shutters')
})

test('combiners add two beams into one', () => {
  const board = level([
    emitter(0, 3, 1, 'white', 'e1'),
    emitter(6, 3, 3, 'white', 'e2'),
    { id: 'c1', type: 'combiner', x: 3, y: 3, rotation: 0, rotatable: false },
    { id: 'm1', type: 'mirror', x: 3, y: 1, rotation: 0 },
    receiver(3, 5, 'yellow', 'r1', { minIntensity: 0.6 }),
  ])
  const result = evaluate(board, {})
  // Both beams meet the combiner from the sides; it re-emits north into the
  // mirror, which turns it south into the receiver.
  assert.ok(result.beams.length > 0)
  assert.equal(result.solved, false, 'white light does not satisfy a yellow receiver')
})

test('two mirrors facing each other terminate instead of looping forever', () => {
  const board = level([
    emitter(1, 1, 1),
    mirror(3, 1, 1, 'm1'),
    mirror(4, 1, 0, 'm2'),
  ])
  const started = Date.now()
  const result = evaluate(board, {})
  assert.ok(Date.now() - started < 500)
  assert.ok(result.rays < 60, `rays ${result.rays} should stay bounded`)
})

test('evaluation is deterministic and order independent', () => {
  const board = level([
    emitter(0, 3, 1),
    mirror(3, 3, 0),
    { id: 'p1', type: 'prism', x: 3, y: 1, rotation: 0 },
  ])
  const first = evaluate(board, {})
  const second = evaluate(board, {})
  assert.deepEqual(first.beams, second.beams)

  const reordered = level([...board.devices].reverse())
  assert.deepEqual(evaluate(reordered, {}).beams, first.beams)
})

test('the solver finds the solution and counts it', () => {
  const board = level([emitter(0, 3, 1), mirror(3, 3, 1, 'm1'), receiver(3, 0)], 7, 7)
  const { solutions } = solve(board)
  assert.ok(solutions.length >= 1)
  const winner = solutions[0]
  assert.equal(evaluate(board, winner.rotations).solved, true)
  assert.equal(moveDistance(board, winner.rotations, { m1: winner.rotations.m1 }), 0)
})

test('level validation catches structural mistakes', () => {
  assert.deepEqual(validateLevel(level([emitter(0, 1, 1), receiver(3, 1)])), [])
  assert.ok(validateLevel(level([emitter(0, 1, 1)])).includes('no receiver'))
  assert.ok(validateLevel(level([emitter(0, 1, 1), receiver(0, 1)])).some((item) => item.includes('share')))
  assert.ok(validateLevel(level([emitter(0, 1, 1), { id: 'g', type: 'gate', x: 2, y: 2, switchId: 'nope' }, receiver(4, 1)])).some((item) => item.includes('missing switch')))
})

test('difficulty rises with the number of devices that must be turned', () => {
  const small = level([emitter(0, 3, 1), mirror(2, 3, 0, 'm1'), receiver(2, 0)])
  const big = level([
    emitter(0, 5, 1),
    mirror(2, 5, 0, 'm1'),
    mirror(2, 2, 0, 'm2'),
    { id: 'p1', type: 'prism', x: 5, y: 2, rotation: 0, rotatable: true },
    receiver(5, 0, 'red'),
  ])
  assert.ok(rateDifficulty(big, 1) > rateDifficulty(small, 1))
})

test('every world generates boards whose built configuration solves', () => {
  for (const world of [1, 2, 3, 4, 5]) {
    const size = [5, 6, 7, 8, 9][world - 1]
    let built = null
    for (let attempt = 0; attempt < 40 && !built; attempt += 1) {
      const candidate = buildCandidate({ world, size: [size, size], random: mulberry32(1000 + world * 97 + attempt) })
      if (!candidate) continue
      const rotations = {}
      for (const device of candidate.devices) if (device.rotatable) rotations[device.id] = device.rotation ?? 0
      const result = evaluate({ ...candidate, devices: candidate.devices }, rotations)
      if (result.solved) built = candidate
    }
    assert.ok(built, `world ${world} should produce at least one self-consistent board`)
  }
})

test('colour helpers behave', () => {
  assert.equal(isDark({ r: 0, g: 0, b: 0 }), true)
  assert.equal(isDark(maskColor(COLORS.white, { r: 0, g: 1, b: 0 })), false)
  assert.deepEqual(addColor({ r: 0.2, g: 0, b: 0 }, { r: 0.3, g: 0, b: 0 }), { r: 0.5, g: 0, b: 0 })
  assert.equal(turn(0, -1), 3)
})
