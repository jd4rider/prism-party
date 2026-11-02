/*
 * Small WebAudio synth. No audio files, no autoplay problems: the context is
 * created on the first real gesture and every sound is generated on demand.
 */

import { data } from './save.js'

let context = null
let master = null
let musicGain = null
let musicTimer = null
let musicNodes = []

function ensure() {
  if (context) {
    if (context.state === 'suspended') context.resume()
    return context
  }
  const Audio = window.AudioContext || window.webkitAudioContext
  if (!Audio) return null
  context = new Audio()
  master = context.createGain()
  master.gain.value = data.settings.sound ? 0.5 : 0
  master.connect(context.destination)
  musicGain = context.createGain()
  musicGain.gain.value = 0
  musicGain.connect(context.destination)
  return context
}

export function unlockAudio() {
  const ctx = ensure()
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

export function applySettings() {
  if (!context) return
  master.gain.value = data.settings.sound ? 0.5 : 0
  musicGain.gain.value = data.settings.music ? 0.12 : 0
  if (data.settings.music) startMusic()
  else stopMusic()
}

function tone({ frequency, duration = 0.16, type = 'sine', gain = 0.3, slide = 0, delay = 0 }) {
  const ctx = ensure()
  if (!ctx || !data.settings.sound) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), start + duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(master)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function noise({ duration = 0.2, gain = 0.18, delay = 0 }) {
  const ctx = ensure()
  if (!ctx || !data.settings.sound) return
  const start = ctx.currentTime + delay
  const frames = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frames; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / frames) ** 3
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1600
  const envelope = ctx.createGain()
  envelope.gain.value = gain
  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(master)
  source.start(start)
}

const NOTE = (semitonesFromA4) => 440 * 2 ** (semitonesFromA4 / 12)

export function play(name) {
  switch (name) {
    case 'turn':
      tone({ frequency: NOTE(4), duration: 0.09, type: 'triangle', gain: 0.16 })
      tone({ frequency: NOTE(11), duration: 0.06, type: 'sine', gain: 0.08, delay: 0.02 })
      break
    case 'connect':
      tone({ frequency: NOTE(7), duration: 0.22, type: 'sine', gain: 0.14 })
      break
    case 'receiver':
      tone({ frequency: NOTE(12), duration: 0.3, type: 'sine', gain: 0.18 })
      tone({ frequency: NOTE(19), duration: 0.34, type: 'sine', gain: 0.12, delay: 0.05 })
      break
    case 'blocked':
      tone({ frequency: NOTE(-5), duration: 0.14, type: 'sine', gain: 0.12, slide: -60 })
      break
    case 'undo':
      tone({ frequency: NOTE(2), duration: 0.1, type: 'triangle', gain: 0.12 })
      break
    case 'hint':
      tone({ frequency: NOTE(9), duration: 0.18, type: 'sine', gain: 0.14 })
      tone({ frequency: NOTE(16), duration: 0.18, type: 'sine', gain: 0.1, delay: 0.08 })
      break
    case 'win':
      [0, 4, 7, 12, 16].forEach((step, index) => {
        tone({ frequency: NOTE(step), duration: 0.4, type: 'sine', gain: 0.16, delay: index * 0.09 })
      })
      noise({ duration: 0.5, gain: 0.06, delay: 0.1 })
      break
    case 'unlock':
      [0, 7, 12].forEach((step, index) => {
        tone({ frequency: NOTE(step + 12), duration: 0.35, type: 'triangle', gain: 0.12, delay: index * 0.1 })
      })
      break
    case 'tap':
      tone({ frequency: NOTE(0), duration: 0.05, type: 'triangle', gain: 0.1 })
      break
    default:
      break
  }
}

function startMusic() {
  const ctx = ensure()
  if (!ctx || musicTimer) return
  const chord = [NOTE(-17), NOTE(-12), NOTE(-5), NOTE(0)]
  const playChord = () => {
    const start = ctx.currentTime
    for (const [index, frequency] of chord.entries()) {
      const oscillator = ctx.createOscillator()
      const envelope = ctx.createGain()
      oscillator.type = index % 2 === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency * (index === 3 ? 1.5 : 1)
      oscillator.detune.value = index * 4
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(0.16, start + 2)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 7.5)
      oscillator.connect(envelope)
      envelope.connect(musicGain)
      oscillator.start(start)
      oscillator.stop(start + 8)
      musicNodes.push(oscillator)
    }
    musicNodes = musicNodes.slice(-12)
  }
  playChord()
  musicTimer = setInterval(playChord, 7000)
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer)
  musicTimer = null
  for (const node of musicNodes) {
    try {
      node.stop()
    } catch {
      /* already stopped */
    }
  }
  musicNodes = []
}
