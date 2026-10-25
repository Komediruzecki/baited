/**
 * Sound textures made in code, at the audio context's sample rate, the first time a sound needs them: looping noise,
 * crackle, glass and ice pings, paper rustle, cube clatter, a glitch stutter, the five switches and a typewriter tick.
 * Each is a pure function of (id, variant, sample rate), so a test or an offline render gets the same samples.
 *
 * The switches and the tick are modal synthesis: a short burst of noise (the strike) plus decaying sine modes (the
 * stem, housing, plate and case ringing), placed where a real keypress puts them. A clicky switch is two strikes 9 ms
 * apart (the click jacket, then the bottom-out) and a click on release; a thock is a deep case mode with a few
 * stabilizer-wire rattles after it.
 */

import { createRng, hashString, type Rng } from './rng'
import type { NoiseColor, TextureId } from './recipe'

export interface TextureSpec {
  readonly seconds: number
  readonly channels: 1 | 2
  readonly variants: number
}

export const TEXTURE_SPECS: Readonly<Record<TextureId, TextureSpec>> = {
  crackle: { seconds: 1.6, channels: 2, variants: 2 },
  tinkle: { seconds: 0.9, channels: 2, variants: 3 },
  ice: { seconds: 1.1, channels: 2, variants: 3 },
  rustle: { seconds: 1.0, channels: 2, variants: 2 },
  clatter: { seconds: 0.85, channels: 2, variants: 3 },
  glitch: { seconds: 0.7, channels: 2, variants: 3 },
  clicky: { seconds: 0.2, channels: 1, variants: 4 },
  tactile: { seconds: 0.2, channels: 1, variants: 4 },
  linear: { seconds: 0.18, channels: 1, variants: 4 },
  silent: { seconds: 0.16, channels: 1, variants: 4 },
  thock: { seconds: 0.26, channels: 1, variants: 4 },
  tick: { seconds: 0.12, channels: 1, variants: 4 },
}

export const NOISE_SECONDS = 2

/** A mode: frequency (Hz), decay time constant (s), amplitude. */
type Mode = readonly [number, number, number]

interface Strike {
  readonly at: number
  /** Noise burst length (s), level, and colour: 'bright' a click, 'mid' a clack, 'soft' a damped tap. */
  readonly burst: readonly [number, number, 'bright' | 'mid' | 'soft']
  readonly modes: readonly Mode[]
}

const TAU = Math.PI * 2

function channels(count: number, length: number): Float32Array[] {
  return Array.from({ length: count }, () => new Float32Array(length))
}

/** Equal-power pan gains for -1..1. */
function panGains(pan: number): readonly [number, number] {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4
  return [Math.cos(a), Math.sin(a)]
}

/** Adds an exponentially decaying sine from `start` (s), with a 0.2 ms fade-in so the onset is the burst's job. */
function addMode(out: Float32Array, sr: number, start: number, mode: Mode, gain: number, phase: number): void {
  const [freq, tau, amp] = mode
  if (freq <= 0 || freq >= sr / 2 || tau <= 0) return
  const first = Math.max(0, Math.round(start * sr))
  const count = Math.min(out.length - first, Math.ceil(tau * 7 * sr))
  if (count <= 0) return
  const w = (TAU * freq) / sr
  const c = Math.cos(w)
  const s = Math.sin(w)
  const r = Math.exp(-1 / (tau * sr))
  const fade = Math.max(1, Math.round(0.0002 * sr))
  let x = Math.cos(phase) * amp * gain
  let y = Math.sin(phase) * amp * gain
  for (let n = 0; n < count; n++) {
    out[first + n] = (out[first + n] as number) + y * (n < fade ? n / fade : 1)
    const nx = (x * c - y * s) * r
    y = (x * s + y * c) * r
    x = nx
  }
}

/** A noise burst with an exponential fall over `length` seconds, coloured by a one-pole filter. */
function addBurst(
  out: Float32Array,
  sr: number,
  start: number,
  length: number,
  level: number,
  tone: 'bright' | 'mid' | 'soft',
  rng: Rng
): void {
  const first = Math.max(0, Math.round(start * sr))
  const count = Math.min(out.length - first, Math.max(2, Math.ceil(length * 3 * sr)))
  const tau = Math.max(1, length * sr * 0.45)
  // 'soft' lowpasses at about 1.6 kHz, 'mid' at about 5 kHz, 'bright' is differenced (a highpass).
  const k = tone === 'soft' ? 1 - Math.exp((-TAU * 1600) / sr) : 1 - Math.exp((-TAU * 5000) / sr)
  let lp = 0
  let prev = 0
  for (let n = 0; n < count; n++) {
    const white = rng.next() * 2 - 1
    let v: number
    if (tone === 'bright') {
      v = (white - prev) * 0.7
      prev = white
    } else {
      lp += k * (white - lp)
      v = lp * (tone === 'soft' ? 2.2 : 1.4)
    }
    out[first + n] = (out[first + n] as number) + v * level * Math.exp(-n / tau)
  }
}

function strikeInto(out: Float32Array, sr: number, strike: Strike, gain: number, rng: Rng): void {
  const [length, level, tone] = strike.burst
  if (level > 0) addBurst(out, sr, strike.at, length, level * gain, tone, rng)
  for (const mode of strike.modes) addMode(out, sr, strike.at, mode, gain, rng.range(0, TAU))
}

function normalize(data: readonly Float32Array[], peak: number): void {
  let max = 0
  for (const ch of data) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i] as number))
  if (max <= 0) return
  const k = peak / max
  for (const ch of data) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] as number) * k
}

/** Removes any DC a texture picked up, then fades the last 4 ms so a texture never ends on a click. */
function finish(data: readonly Float32Array[], sr: number, peak: number): Float32Array[] {
  for (const ch of data) {
    let mean = 0
    for (let i = 0; i < ch.length; i++) mean += ch[i] as number
    mean /= Math.max(1, ch.length)
    const fade = Math.min(ch.length, Math.round(0.004 * sr))
    for (let i = 0; i < ch.length; i++) {
      let v = (ch[i] as number) - mean
      const left = ch.length - 1 - i
      if (left < fade) v *= left / fade
      ch[i] = v
    }
  }
  normalize(data, peak)
  return data as Float32Array[]
}

const vary = (rng: Rng, amount: number): number => 1 + (rng.next() * 2 - 1) * amount

function scaleModes(modes: readonly Mode[], rng: Rng, pitch: number): Mode[] {
  return modes.map(([f, tau, a]) => [f * pitch * vary(rng, 0.02), tau * vary(rng, 0.1), a * vary(rng, 0.12)] as const)
}

// Switches and the tick. Times in seconds from the press.

function switchStrikes(id: 'clicky' | 'tactile' | 'linear' | 'silent' | 'thock' | 'tick', rng: Rng): Strike[] {
  const p = vary(rng, 0.04)
  const m = (modes: readonly Mode[]) => scaleModes(modes, rng, p)
  switch (id) {
    case 'clicky': {
      const bottom = 0.009 + rng.range(-0.0015, 0.0015)
      const release = 0.105 + rng.range(-0.015, 0.015)
      return [
        // The click jacket snaps: very short and bright.
        {
          at: 0,
          burst: [0.0005, 0.7, 'bright'],
          modes: m([
            [4300, 0.0024, 0.5],
            [6200, 0.0016, 0.35],
            [2950, 0.003, 0.3],
          ]),
        },
        // Then the stem bottoms out on the housing.
        {
          at: bottom,
          burst: [0.0008, 0.35, 'mid'],
          modes: m([
            [1950, 0.007, 0.35],
            [3350, 0.0045, 0.22],
            [870, 0.01, 0.2],
            [390, 0.014, 0.12],
          ]),
        },
        // On release the jacket clicks again and the stem tops out.
        {
          at: release,
          burst: [0.0004, 0.32, 'bright'],
          modes: m([
            [4700, 0.002, 0.3],
            [2500, 0.004, 0.14],
          ]),
        },
        { at: release + 0.004, burst: [0, 0, 'mid'], modes: m([[2200, 0.004, 0.12]]) },
      ]
    }
    case 'tactile': {
      const bottom = 0.013 + rng.range(-0.002, 0.002)
      return [
        // The bump: a soft rounded push, no click.
        {
          at: 0,
          burst: [0.0025, 0.22, 'soft'],
          modes: m([
            [1150, 0.006, 0.28],
            [1750, 0.004, 0.14],
            [520, 0.008, 0.1],
          ]),
        },
        {
          at: bottom,
          burst: [0.001, 0.22, 'mid'],
          modes: m([
            [1550, 0.008, 0.3],
            [720, 0.012, 0.24],
            [340, 0.017, 0.15],
            [2600, 0.004, 0.12],
          ]),
        },
        {
          at: 0.1 + rng.range(-0.015, 0.015),
          burst: [0.0008, 0.1, 'mid'],
          modes: m([
            [1850, 0.005, 0.14],
            [900, 0.008, 0.08],
          ]),
        },
      ]
    }
    case 'linear':
      return [
        // Straight down, one clean clack, and a lighter one back up.
        {
          at: 0,
          burst: [0.0009, 0.32, 'mid'],
          modes: m([
            [2350, 0.006, 0.34],
            [1320, 0.009, 0.24],
            [580, 0.012, 0.15],
            [3600, 0.0035, 0.12],
          ]),
        },
        {
          at: 0.085 + rng.range(-0.012, 0.012),
          burst: [0.0006, 0.16, 'mid'],
          modes: m([
            [2750, 0.004, 0.18],
            [1500, 0.006, 0.1],
          ]),
        },
      ]
    case 'silent':
      return [
        // Rubber dampers on both ends: a short low tap with the highs taken out.
        {
          at: 0,
          burst: [0.003, 0.12, 'soft'],
          modes: m([
            [620, 0.005, 0.24],
            [1020, 0.0032, 0.1],
            [260, 0.008, 0.12],
          ]),
        },
        { at: 0.09 + rng.range(-0.012, 0.012), burst: [0.002, 0.04, 'soft'], modes: m([[700, 0.004, 0.06]]) },
      ]
    case 'thock': {
      const strikes: Strike[] = [
        // A stabilised big key: the case's deep mode rings longest.
        {
          at: 0,
          burst: [0.0016, 0.3, 'soft'],
          modes: m([
            [205, 0.032, 0.45],
            [470, 0.021, 0.36],
            [910, 0.012, 0.26],
            [1620, 0.007, 0.15],
            [2600, 0.004, 0.07],
          ]),
        },
      ]
      // The stabilizer wire rattles in its housings for a few milliseconds.
      for (let i = 0; i < 4; i++) {
        strikes.push({
          at: rng.range(0.003, 0.02),
          burst: [0.0003, rng.range(0.05, 0.09), 'bright'],
          modes: [[rng.range(3100, 4600), 0.0016, 0.06]],
        })
      }
      const release = 0.12 + rng.range(-0.015, 0.015)
      strikes.push({
        at: release,
        burst: [0.001, 0.12, 'soft'],
        modes: m([
          [690, 0.01, 0.15],
          [1280, 0.006, 0.1],
        ]),
      })
      for (let i = 0; i < 2; i++) {
        strikes.push({
          at: release + rng.range(0.002, 0.012),
          burst: [0.0003, 0.04, 'bright'],
          modes: [[rng.range(3100, 4600), 0.0014, 0.04]],
        })
      }
      return strikes
    }
    case 'tick':
      return [
        // A typebar on the platen: a hard metal tick, the platen's thud under it and a faint ring.
        {
          at: 0,
          burst: [0.0004, 0.6, 'bright'],
          modes: m([
            [3250, 0.003, 0.5],
            [4750, 0.002, 0.3],
            [1520, 0.006, 0.35],
            [610, 0.01, 0.2],
            [2380, 0.024, 0.08],
          ]),
        },
      ]
  }
}

// Effect textures.

function crackle(rng: Rng, sr: number, seconds: number): Float32Array[] {
  const out = channels(2, Math.round(seconds * sr))
  const [left, right] = out as [Float32Array, Float32Array]
  const mono = new Float32Array(64)
  let t = rng.range(0, 0.004)
  while (t < seconds - 0.01) {
    const level = 0.15 + 0.85 * rng.next() ** 3
    const [gl, gr] = panGains(rng.range(-0.9, 0.9))
    const pops = rng.next() < 0.15 ? 2 : 1
    for (let p = 0; p < pops; p++) {
      const at = t + p * rng.range(0.001, 0.004)
      const a = level * (p === 0 ? 1 : 0.5)
      mono.fill(0)
      if (rng.next() < 0.7) {
        // A micro burst of 0.2 to 1.2 ms.
        const len = Math.min(mono.length, Math.max(4, Math.round(rng.range(0.0002, 0.0012) * sr)))
        let prev = 0
        for (let n = 0; n < len; n++) {
          const w = rng.next() * 2 - 1
          mono[n] = (w - prev) * Math.exp((-4 * n) / len)
          prev = w
        }
      } else {
        const sign = rng.sign()
        mono[0] = sign
        mono[1] = -0.6 * sign
        mono[2] = 0.3 * sign
      }
      const first = Math.round(at * sr)
      for (let n = 0; n < mono.length && first + n < left.length; n++) {
        const v = (mono[n] as number) * a
        left[first + n] = (left[first + n] as number) + v * gl
        right[first + n] = (right[first + n] as number) + v * gr
      }
    }
    t += -Math.log(1 - rng.next()) / 110
  }
  return finish(out, sr, 0.9)
}

/** Shards: a few pings at once, then fewer and quieter as they land. Ratios and range set glass against ice. */
function pings(
  rng: Rng,
  sr: number,
  seconds: number,
  o: {
    count: number
    early: number
    mean: number
    fLo: number
    fHi: number
    ratios: readonly number[]
    amps: readonly number[]
    tauLo: number
    tauHi: number
    fall: number
  }
): Float32Array[] {
  const out = channels(2, Math.round(seconds * sr))
  const [left, right] = out as [Float32Array, Float32Array]
  const scratch = new Float32Array(left.length)
  for (let i = 0; i < o.count; i++) {
    let t = i < o.early ? rng.range(0, 0.03) : 0.03 + -Math.log(1 - rng.next()) * o.mean
    if (t > seconds - 0.12) t = rng.range(0.03, seconds * 0.5)
    const level = rng.range(0.45, 1) * Math.exp(-t / o.fall)
    const f0 = o.fLo * (o.fHi / o.fLo) ** rng.next()
    const tau0 = rng.range(o.tauLo, o.tauHi)
    scratch.fill(0)
    o.ratios.forEach((ratio, k) => {
      const f = f0 * ratio * (k === 0 ? 1 : vary(rng, 0.03))
      addMode(scratch, sr, t, [f, tau0 * 0.6 ** k, (o.amps[k] ?? 0.1) * level], 1, rng.range(0, TAU))
    })
    addBurst(scratch, sr, t, 0.00025, level * 0.4, 'bright', rng)
    const [gl, gr] = panGains(rng.range(-0.85, 0.85))
    const first = Math.max(0, Math.round(t * sr))
    const last = Math.min(left.length, first + Math.ceil(tau0 * 8 * sr))
    for (let n = first; n < last; n++) {
      const v = scratch[n] as number
      left[n] = (left[n] as number) + v * gl
      right[n] = (right[n] as number) + v * gr
    }
  }
  return finish(out, sr, 0.9)
}

function rustle(rng: Rng, sr: number, seconds: number): Float32Array[] {
  const out = channels(2, Math.round(seconds * sr))
  const [left, right] = out as [Float32Array, Float32Array]
  const f1 = rng.range(9, 13)
  const f2 = rng.range(6, 8.5)
  const p1 = rng.range(0, TAU)
  const p2 = rng.range(0, TAU)
  let t = 0
  while (t < seconds - 0.01) {
    // Paper flutters: grains come in waves at the confetti's spin rates, densest just after the pop.
    const flutter = 0.55 + 0.45 * Math.sin(TAU * f1 * t + p1) * Math.sin(TAU * f2 * t + p2)
    const rate = (1100 * Math.exp(-t / 0.22) + 160) * flutter + 1
    t += -Math.log(1 - rng.next()) / rate
    const shape = Math.min(1, t / 0.02) * Math.exp(-t / 0.45)
    const level = (0.2 + 0.8 * rng.next() ** 1.6) * shape
    const len = Math.max(8, Math.round(rng.range(0.0004, 0.0025) * sr))
    const first = Math.round(t * sr)
    const [gl, gr] = panGains(rng.range(-0.9, 0.9))
    let prev = 0
    for (let n = 0; n < len && first + n < left.length; n++) {
      const w = rng.next() * 2 - 1
      const hann = 0.5 - 0.5 * Math.cos((TAU * n) / len)
      const v = (w - prev) * hann * level
      prev = w
      left[first + n] = (left[first + n] as number) + v * gl
      right[first + n] = (right[first + n] as number) + v * gr
    }
  }
  return finish(out, sr, 0.9)
}

function clatter(rng: Rng, sr: number, seconds: number): Float32Array[] {
  const out = channels(2, Math.round(seconds * sr))
  const [left, right] = out as [Float32Array, Float32Array]
  const scratch = new Float32Array(left.length)
  for (let c = 0; c < 10; c++) {
    // Three cubes knock together as the cap collapses; the rest land on the deck and bounce, faster and softer.
    let t = c < 3 ? rng.range(0, 0.04) : rng.range(0.11, 0.36)
    let level = c < 3 ? rng.range(0.5, 0.8) : rng.range(0.6, 1)
    let gap = rng.range(0.075, 0.12)
    const f = rng.range(1500, 3800)
    const tau = rng.range(0.006, 0.014)
    const [gl, gr] = panGains(rng.range(-0.85, 0.85))
    scratch.fill(0)
    for (let k = 0; k < 4 && t < seconds - 0.05; k++) {
      const fk = f * vary(rng, 0.01)
      addMode(scratch, sr, t, [fk, tau, level], 1, rng.range(0, TAU))
      addMode(scratch, sr, t, [fk * 1.62, tau * 0.7, level * 0.5], 1, rng.range(0, TAU))
      addMode(scratch, sr, t, [fk * 2.71, tau * 0.5, level * 0.28], 1, rng.range(0, TAU))
      addBurst(scratch, sr, t, 0.0003, level * 0.5, 'bright', rng)
      t += gap
      gap *= 0.55
      level *= 0.42
    }
    for (let n = 0; n < left.length; n++) {
      const v = scratch[n] as number
      if (v === 0) continue
      left[n] = (left[n] as number) + v * gl
      right[n] = (right[n] as number) + v * gr
    }
  }
  return finish(out, sr, 0.9)
}

/** Digital stutter: square-wave blips, crushed noise and repeats of the last slice, at 4 bits and a quarter rate. */
function glitch(rng: Rng, sr: number, seconds: number): Float32Array[] {
  const out = channels(2, Math.round(seconds * sr))
  const [left, right] = out as [Float32Array, Float32Array]
  const freqs = [220, 330, 440, 587, 660, 880, 1175, 1320, 1760, 2349, 2640]
  let prev: { data: Float32Array; pan: number } | null = null
  let t = 0
  const end = seconds * 0.86
  const write = (data: Float32Array, at: number, pan: number, gain: number) => {
    const [gl, gr] = panGains(pan)
    const first = Math.round(at * sr)
    for (let n = 0; n < data.length && first + n < left.length; n++) {
      const v = (data[n] as number) * gain
      left[first + n] = (left[first + n] as number) + v * gl
      right[first + n] = (right[first + n] as number) + v * gr
    }
  }
  while (t < end) {
    const len = rng.pick([0.012, 0.016, 0.022, 0.03, 0.045])
    const roll = rng.next()
    if (prev && roll < 0.32) {
      const repeats = 2 + rng.int(3)
      for (let r = 0; r < repeats && t < end; r++) {
        write(prev.data, t, prev.pan, 0.92 ** r)
        t += prev.data.length / sr
      }
      continue
    }
    if (roll < 0.42) {
      t += len * 0.6
      continue
    }
    const n = Math.round(len * sr)
    const data = new Float32Array(n)
    if (roll < 0.62) {
      for (let i = 0; i < n; i++) data[i] = (rng.next() * 2 - 1) * 0.5
    } else {
      const f0 = rng.pick(freqs) * (rng.next() < 0.25 ? 2 : 1)
      const slide = rng.next() < 0.3 ? rng.pick([0.5, 1.5, 2]) : 1
      let phase = 0
      for (let i = 0; i < n; i++) {
        const f = f0 * slide ** (i / n)
        phase += f / sr
        data[i] = (phase % 1 < 0.5 ? 0.55 : -0.55) as number
      }
    }
    const pan = rng.range(-0.6, 0.6)
    write(data, t, pan, 1)
    prev = { data, pan }
    t += len
  }
  // Crush: hold every 4th sample (aliasing like a cheap DAC) and quantize to 16 levels.
  for (const ch of out) {
    let held = 0
    for (let i = 0; i < ch.length; i++) {
      if (i % 4 === 0) held = Math.round((ch[i] as number) * 8) / 8
      const fade = i / sr > seconds * 0.62 ? Math.max(0, 1 - (i / sr - seconds * 0.62) / (seconds * 0.3)) : 1
      ch[i] = held * fade
    }
  }
  return finish(out, sr, 0.85)
}

/** The samples of one texture variant, one array per channel. */
export function generateTexture(id: TextureId, variant: number, sampleRate: number): Float32Array[] {
  const spec = TEXTURE_SPECS[id]
  const rng = createRng(hashString(`${id}:${variant % Math.max(1, spec.variants)}`))
  const sr = sampleRate
  switch (id) {
    case 'crackle':
      return crackle(rng, sr, spec.seconds)
    case 'tinkle':
      return pings(rng, sr, spec.seconds, {
        count: 16,
        early: 4,
        mean: 0.13,
        fLo: 2400,
        fHi: 6800,
        ratios: [1, 2.32, 4.25],
        amps: [1, 0.45, 0.22],
        tauLo: 0.022,
        tauHi: 0.065,
        fall: 0.3,
      })
    case 'ice':
      return pings(rng, sr, spec.seconds, {
        count: 13,
        early: 3,
        mean: 0.16,
        fLo: 3000,
        fHi: 8500,
        ratios: [1, 2.01, 3.03, 4.6],
        amps: [1, 0.35, 0.18, 0.08],
        tauLo: 0.06,
        tauHi: 0.18,
        fall: 0.4,
      })
    case 'rustle':
      return rustle(rng, sr, spec.seconds)
    case 'clatter':
      return clatter(rng, sr, spec.seconds)
    case 'glitch':
      return glitch(rng, sr, spec.seconds)
    case 'clicky':
    case 'tactile':
    case 'linear':
    case 'silent':
    case 'thock':
    case 'tick': {
      const out = channels(1, Math.round(spec.seconds * sr))
      for (const strike of switchStrikes(id, rng)) strikeInto(out[0] as Float32Array, sr, strike, 1, rng)
      return finish(out, sr, 0.9)
    }
  }
}

/** Two seconds of stereo noise to loop: white, pink (Paul Kellet's filter) or brown, all at an RMS of 0.3. */
export function generateNoise(color: NoiseColor, sampleRate: number): Float32Array[] {
  const rng = createRng(hashString(`noise:${color}`))
  const length = Math.round(NOISE_SECONDS * sampleRate)
  const fade = Math.round(0.02 * sampleRate)
  const out = channels(2, length)
  for (const ch of out) {
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    let brown = 0
    // A little more than the loop: the overflow is crossfaded into the head, so the end runs on into the start.
    const raw = new Float32Array(length + fade)
    for (let i = 0; i < raw.length; i++) {
      const white = rng.next() + rng.next() + rng.next() - 1.5
      if (color === 'white') raw[i] = white
      else if (color === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.969 * b2 + white * 0.153852
        b3 = 0.8665 * b3 + white * 0.3104856
        b4 = 0.55 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.016898
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
        b6 = white * 0.115926
      } else {
        brown = brown * 0.996 + white * 0.06
        raw[i] = brown
      }
    }
    let mean = 0
    for (let i = 0; i < raw.length; i++) mean += raw[i] as number
    mean /= raw.length
    for (let i = 0; i < length; i++) {
      const v = (raw[i] as number) - mean
      if (i < fade) {
        const k = i / fade
        ch[i] = v * k + ((raw[length + i] as number) - mean) * (1 - k)
      } else ch[i] = v
    }
    let sum = 0
    for (let i = 0; i < length; i++) sum += (ch[i] as number) ** 2
    const rms = Math.sqrt(sum / length)
    const k = rms > 0 ? 0.3 / rms : 0
    for (let i = 0; i < length; i++) ch[i] = Math.max(-1, Math.min(1, (ch[i] as number) * k))
  }
  return out
}
