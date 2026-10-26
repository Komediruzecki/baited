/** Small builders that keep the recipes readable: one line per layer. */

import type { Rng } from './rng'
import type { Curve, FilterSpec, NoiseColor, NoiseLayer, Point, Role, TextureId, TextureLayer, ToneLayer, Wave } from './recipe'
import { TEXTURE_SPECS } from './textures'

export interface Extra {
  readonly filters?: readonly FilterSpec[]
  readonly pan?: Curve
  readonly autopan?: { readonly rate: Curve; readonly depth: number }
  readonly tremolo?: { readonly rate: number; readonly depth: number; readonly wave?: 'sine' | 'square' | 'triangle' }
  readonly shape?: 'drive' | 'crush'
}

export interface ToneExtra extends Extra {
  readonly vibrato?: { readonly rate: number; readonly cents: Curve }
  readonly fm?: { readonly freq: Curve; readonly depth: Curve; readonly wave?: Wave }
}

export interface Kit {
  readonly rng: Rng
  tone(at: number, wave: Wave, freq: Curve, env: readonly Point[], gain: number, role: Role, extra?: ToneExtra): ToneLayer
  noise(
    at: number,
    color: NoiseColor,
    filters: readonly FilterSpec[],
    env: readonly Point[],
    gain: number,
    role: Role,
    extra?: Extra
  ): NoiseLayer
  tex(
    at: number,
    texture: TextureId,
    rate: number,
    filters: readonly FilterSpec[],
    env: readonly Point[],
    gain: number,
    role: Role,
    extra?: Extra
  ): TextureLayer
  /** A random offset of up to plus or minus `ms` milliseconds, in seconds. */
  jit(ms: number): number
  /** 1 plus or minus `amount`. */
  vary(amount: number): number
}

export const hp = (freq: Curve, q = 0.707): FilterSpec => ({ type: 'highpass', freq, q })
export const lp = (freq: Curve, q = 0.707): FilterSpec => ({ type: 'lowpass', freq, q })
export const bp = (freq: Curve, q = 1): FilterSpec => ({ type: 'bandpass', freq, q })
export const peaking = (freq: number, q: number, gain: number): FilterSpec => ({ type: 'peaking', freq, q, gain })

export function createKit(rng: Rng): Kit {
  return {
    rng,
    tone: (at, wave, freq, env, gain, role, extra = {}) => ({ kind: 'tone', at: Math.max(0, at), wave, freq, env, gain, role, ...extra }),
    noise: (at, color, filters, env, gain, role, extra = {}) => ({
      kind: 'noise',
      at: Math.max(0, at),
      color,
      offset: rng.next(),
      filters,
      env,
      gain,
      role,
      ...extra,
    }),
    tex: (at, texture, rate, filters, env, gain, role, extra = {}) => ({
      kind: 'texture',
      at: Math.max(0, at),
      texture,
      variant: rng.int(TEXTURE_SPECS[texture].variants),
      rate,
      offset: 0,
      filters,
      env,
      gain,
      role,
      ...extra,
    }),
    jit: (ms) => rng.range(-ms, ms) / 1000,
    vary: (amount) => 1 + rng.range(-amount, amount),
  }
}
