/**
 * A sound as data. A voice is a list of layers (an oscillator, filtered noise or a generated texture, each with its
 * own envelope and filters); the engine turns a voice into Web Audio nodes and does nothing else. Every number a
 * listener hears is decided here and in the recipe modules, so tests can check timing, gain and pitch without audio.
 */

/** How a value travels from the previous point: exponential (the default, for gain and pitch) or linear. */
export type Ramp = 'exp' | 'lin'
/** [seconds from the layer's start, value, ramp from the previous point]. */
export type Point = readonly [number, number, Ramp?]
/** A held value, or a path of points. */
export type Curve = number | readonly Point[]

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth'
export type NoiseColor = 'white' | 'pink' | 'brown'

/** Buffers made in code at first use (see textures.ts): no sample files. */
export type TextureId =
  | 'crackle'
  | 'tinkle'
  | 'ice'
  | 'rustle'
  | 'clatter'
  | 'glitch'
  | 'clicky'
  | 'tactile'
  | 'linear'
  | 'silent'
  | 'thock'
  | 'tick'

/** Wave shapers: 'drive' a soft saturation that adds harmonics a phone speaker can play, 'crush' a 3-bit quantizer. */
export type Shape = 'drive' | 'crush'

/**
 * What a layer is for. 'build' layers lead up to the big moment and end by it; 'peak' layers start on it. The rest
 * are free: 'body' around the onset, 'tail' after the peak, 'switch' and 'accent' for the cap's switch, 'sparkle' for
 * rarity.
 */
export type Role = 'build' | 'peak' | 'body' | 'tail' | 'switch' | 'accent' | 'sparkle'

export interface FilterSpec {
  readonly type: BiquadFilterType
  readonly freq: Curve
  readonly q?: number
  /** dB, for shelves and peaking filters. */
  readonly gain?: number
}

interface LayerBase {
  /** Seconds from the voice's start. */
  readonly at: number
  /** Amplitude envelope, times from `at`. The layer stops at its last point. */
  readonly env: readonly Point[]
  /** Linear gain on top of the envelope. */
  readonly gain: number
  readonly filters?: readonly FilterSpec[]
  /** Added to the voice's pan: -1 left to 1 right, or a path. */
  readonly pan?: Curve
  /** A pan that circles: an oscillator of this rate (Hz, or a path) and depth moves the layer side to side. */
  readonly autopan?: { readonly rate: Curve; readonly depth: number }
  /** Amplitude wobble: depth 0..1 at `rate` Hz. */
  readonly tremolo?: { readonly rate: number; readonly depth: number; readonly wave?: 'sine' | 'square' | 'triangle' }
  readonly shape?: Shape
  readonly role: Role
}

export interface ToneLayer extends LayerBase {
  readonly kind: 'tone'
  readonly wave: Wave
  /** Hz. */
  readonly freq: Curve
  /** Pitch wobble in cents. */
  readonly vibrato?: { readonly rate: number; readonly cents: Curve }
  /** Frequency modulation: a modulator at `freq` Hz moving the pitch by up to `depth` Hz. */
  readonly fm?: { readonly freq: Curve; readonly depth: Curve; readonly wave?: Wave }
}

export interface NoiseLayer extends LayerBase {
  readonly kind: 'noise'
  readonly color: NoiseColor
  /** Where in the looping noise buffer to start, 0..1, so two noise layers never line up. */
  readonly offset: number
}

export interface TextureLayer extends LayerBase {
  readonly kind: 'texture'
  readonly texture: TextureId
  readonly variant: number
  /** Playback rate: pitch and speed together. */
  readonly rate: number
  /** Seconds into the texture to start. */
  readonly offset: number
}

export type Layer = ToneLayer | NoiseLayer | TextureLayer

/** Effect voices and short ticks are capped separately, so a burst of switches never steals a black hole. */
export type VoiceGroup = 'fx' | 'tick'

/** A tone colour over a whole voice: how a modern cap's switch voices its effect. */
export interface Voicing {
  readonly lowshelf?: { readonly freq: number; readonly gain: number }
  readonly highshelf?: { readonly freq: number; readonly gain: number }
  readonly lowpass?: { readonly freq: number; readonly q: number }
}

export interface VoiceRecipe {
  /** The effect id, 'switch:clicky', 'letter', 'miss', 'phrase', 'wrong' or 'hour'. */
  readonly name: string
  readonly group: VoiceGroup
  /** Higher survives a full voice cap: tier 1 effects 1, tier 2 and the miss 2, tier 3 3, the black hole 4. */
  readonly priority: number
  /** Seconds from the cue to this voice's start. */
  readonly offset: number
  /** Seconds from the voice's start to its big moment. */
  readonly peakAt: number
  /** Linear gain for the whole voice. */
  readonly gain: number
  /** -1 left to 1 right. */
  readonly pan: number
  /** Reverb send, linear. */
  readonly send: number
  readonly voicing?: Voicing
  readonly layers: readonly Layer[]
}

export const dbToGain = (db: number): number => 10 ** (db / 20)
export const gainToDb = (gain: number): number => 20 * Math.log10(Math.max(1e-12, gain))

export const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value))

/** A finite number in range, or the fallback for NaN and Infinity. */
export const safe = (value: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(value) ? clamp(value, lo, hi) : fallback

export function layerLength(layer: Layer): number {
  const last = layer.env[layer.env.length - 1]
  return last ? last[0] : 0
}

export const layerEnd = (layer: Layer): number => layer.at + layerLength(layer)

/** Seconds from the voice's start to the end of its last layer. */
export function voiceLength(voice: VoiceRecipe): number {
  let end = 0
  for (const layer of voice.layers) end = Math.max(end, layerEnd(layer))
  return end
}

/** The value of a curve `t` seconds into its layer, following the same ramps the engine schedules. */
export function curveAt(curve: Curve, t: number): number {
  if (typeof curve === 'number') return curve
  const first = curve[0]
  if (!first) return 0
  if (t <= first[0]) return first[1]
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1] as Point
    const b = curve[i] as Point
    if (t <= b[0]) {
      const span = b[0] - a[0]
      const k = span <= 0 ? 1 : (t - a[0]) / span
      const exp = b[2] !== 'lin' && a[1] > 0 && b[1] > 0
      return exp ? a[1] * (b[1] / a[1]) ** k : a[1] + (b[1] - a[1]) * k
    }
  }
  return (curve[curve.length - 1] as Point)[1]
}

/** Envelopes. Times are seconds from the layer's start; the last point is where the layer stops. */
export const env = {
  /** A hit: up in `attack`, then an exponential fall that reaches silence at `attack + decay`. */
  perc: (attack: number, decay: number, peak = 1): readonly Point[] => [
    [0, 0],
    [attack, peak, 'lin'],
    [attack + decay, 0],
  ],
  /** A swell into a cut: rises exponentially from a whisper to full at `rise`, then cuts off in `cut`. */
  swell: (rise: number, cut = 0.008, from = 0.02): readonly Point[] => [
    [0, from],
    [rise, 1],
    [rise + cut, 0, 'lin'],
  ],
  /** Up in `attack`, held to `hold`, then down to silence by `end`. */
  hold: (attack: number, hold: number, end: number, peak = 1): readonly Point[] => [
    [0, 0],
    [attack, peak, 'lin'],
    [Math.max(attack, hold), peak, 'lin'],
    [Math.max(hold + 0.005, end), 0],
  ],
  /** Up in `attack`, an exponential fall to `level` at `knee`, then on down to silence at `end`. */
  knee: (attack: number, knee: number, level: number, end: number): readonly Point[] => [
    [0, 0],
    [attack, 1, 'lin'],
    [Math.max(attack + 0.001, knee), level],
    [Math.max(knee + 0.005, end), 0],
  ],
  /** A build-up: up to `level` by `open`, on up to full at `top`, then cut to silence in `cut`. */
  grow: (open: number, level: number, top: number, cut = 0.004): readonly Point[] => [
    [0, 0],
    [open, level, 'lin'],
    [Math.max(open + 0.001, top), 1],
    [Math.max(open + 0.001, top) + cut, 0, 'lin'],
  ],
  /** Rises linearly to full at `top`, then cuts to silence in `cut`. */
  ramp: (top: number, cut = 0.004, from = 0): readonly Point[] => [
    [0, from],
    [top, 1, 'lin'],
    [top + cut, 0, 'lin'],
  ],
}

/** A pitch or filter path from `from` to `to` over `time` seconds (exponential). */
export const glide = (from: number, to: number, time: number): readonly Point[] => [
  [0, from],
  [Math.max(0.001, time), to],
]

/** Three points: `a`, then `b` at `t1`, then `c` at `t2`. */
export const glide3 = (a: number, t1: number, b: number, t2: number, c: number): readonly Point[] => [
  [0, a],
  [Math.max(0.001, t1), b],
  [Math.max(t1 + 0.001, t2), c],
]

/** A linear path, for pans. */
export const slide = (from: number, to: number, time: number): readonly Point[] => [
  [0, from],
  [Math.max(0.001, time), to, 'lin'],
]
