/** Selected Keys Sound Lab recipes. See LICENSE and ../PROVENANCE.md. */
import { bp, hp, lp, type Kit } from './kit';
import { env, glide, type Layer } from './recipe';
import type { Rng } from './rng';

export interface EffectParams {
  readonly peak: number; readonly P: number; readonly i: number;
  readonly D: number; readonly L: number; readonly rng: Rng;
}
export interface EffectSound {
  readonly tier: 1 | 2 | 3; readonly gainDb: number; readonly send: number;
  readonly priority: number; readonly peakIn: number; readonly maxLiftDb?: number;
  layers(p: EffectParams, k: Kit): Layer[];
}
const { perc, swell, hold, knee, grow } = env;
const HIGH_PENTATONIC = [2093, 2349.3, 2637, 3136, 3520];
export const EFFECT_SOUNDS = {
  confetti: {
    tier: 1,
    gainDb: -3,
    send: 0.1,
    priority: 1,
    peakIn: 0,
    layers: ({ peak: t, P, D, L }, k) => [
      k.noise(t, 'white', [bp(1400 * P, 0.9)], perc(0.001, 0.05), 2.2, 'peak'),
      k.noise(t, 'white', [hp(3000)], perc(0.0008, 0.02), 0.6, 'peak'),
      k.tone(t, 'sine', glide(760 * P, 190 * P, 0.04), perc(0.001, 0.05), 0.45, 'peak'),
      k.noise(t, 'pink', [lp(900)], perc(0.003, 0.12), 0.5, 'peak'),
      k.tex(t + 0.02, 'rustle', P * k.vary(0.06), [hp(1800), lp(9500)], knee(0.05, 0.22, 0.65, 0.62 * L), 0.9 * D, 'tail'),
      k.tone(t + 0.06 + k.jit(20), 'sine', k.rng.pick(HIGH_PENTATONIC) * P, perc(0.002, 0.07), 0.06, 'tail'),
      k.tone(t + 0.16 + k.jit(30), 'sine', k.rng.pick(HIGH_PENTATONIC) * P * 1.5, perc(0.002, 0.07), 0.045, 'tail'),
    ],
  },

  supernova: {
    tier: 3,
    gainDb: -5.5,
    send: 0.45,
    priority: 3,
    peakIn: 0.42,
    maxLiftDb: 0,
    layers: ({ peak: t, P, D, L, rng }, k) => {
      const layers: Layer[] = []
      if (t > 0.06) {
        // The swell stops 15 ms short of the boom: the silence makes the boom land harder.
        const top = t - 0.019
        layers.push(k.noise(0, 'pink', [bp(glide(300, 4800, top), 0.8)], swell(top, 0.004), 0.5, 'build'))
        for (const ratio of [1, 1.5, 2.01]) {
          const rise = glide(110 * ratio * P, 440 * ratio * P, top)
          layers.push(k.tone(0, 'sawtooth', rise, swell(top, 0.004), 0.05, 'build', { filters: [lp(glide(500, 3800, top))] }))
        }
      }
      layers.push(
        k.tone(t, 'sine', glide(72 * P, 28 * P, 1.2), perc(0.004, 1.35 * L), 0.95, 'peak'),
        k.tone(t, 'triangle', glide(144 * P, 56 * P, 0.9), perc(0.004, 0.9 * L), 0.3, 'peak', { shape: 'drive', filters: [lp(900)] }),
        k.noise(t, 'white', [lp(glide(7000, 280, 0.6))], perc(0.002, 0.95 * L), 0.85, 'peak'),
        k.noise(t, 'white', [hp(2000)], perc(0.001, 0.06), 0.9, 'peak'),
        k.noise(t + 0.01, 'pink', [bp(glide(3200, 380, 0.9), 1)], perc(0.01, 0.9 * L), 0.35, 'tail', { pan: -0.7 }),
        k.noise(t + 0.03, 'pink', [bp(glide(3000, 360, 0.9), 1)], perc(0.01, 0.9 * L), 0.35, 'tail', { pan: 0.7 })
      )
      const chord = [1318.5, 1975.5, 2637, 3322.4, 3951]
      chord.forEach((f, j) => {
        const shimmer = { tremolo: { rate: rng.range(6, 11), depth: 0.6 }, pan: j % 2 ? 0.5 : -0.5 }
        layers.push(k.tone(t + 0.05 + j * 0.012, 'sine', f * P, perc(0.04, (1.2 + 0.1 * j) * L), 0.045, 'tail', shimmer))
      })
      layers.push(k.tex(t + 0.02, 'tinkle', 1.35 * P, [hp(3000)], hold(0.004, 0.3, 0.85 * L), 0.16 * D, 'tail'))
      return layers
    },
  },
  blackhole: {
    tier: 3,
    gainDb: 0,
    send: 0.55,
    priority: 4,
    peakIn: 1.12,
    maxLiftDb: -0.5,
    layers: ({ peak: t, P, D, L }, k) => {
      const layers: Layer[] = []
      if (t > 0.06) {
        // Everything pulled in stops 20 ms before the pop.
        const top = t - 0.024
        const open = Math.min(0.3, t * 0.4)
        const pull = grow(open, 0.6, top)
        for (const detune of [1, 1.007]) {
          const drone = glide(55 * detune * P, 49 * detune * P, t)
          layers.push(k.tone(0, 'sawtooth', drone, pull, 0.06, 'build', { filters: [lp(glide(180, 950, top), 4)] }))
        }
        layers.push(
          k.tone(0, 'sine', glide(120 * P, 38 * P, top), pull, 0.18, 'build'),
          k.tone(0, 'triangle', glide(240 * P, 60 * P, top), pull, 0.07, 'build', { shape: 'drive', filters: [lp(800)] }),
          k.noise(0, 'pink', [bp(glide(2600 * P, 320 * P, top), 1.5)], swell(top, 0.004), 0.3, 'build', {
            autopan: { rate: glide(1.5, 9, t), depth: 0.75 },
          }),
          // The inhale: a hiss that rises as everything else sinks, loudest just before the pop.
          k.noise(0, 'white', [hp(glide(600 * P, 4000 * P, top)), lp(11000)], swell(top, 0.004, 0.003), 0.3, 'build', {
            autopan: { rate: glide(1, 6, t), depth: 0.4 },
          })
        )
      }
      layers.push(
        k.noise(t, 'white', [hp(1200)], perc(0.0008, 0.03), 1.3, 'peak'),
        k.tone(t, 'sine', glide(430 * P, 55 * P, 0.07), perc(0.001, 0.26), 1.1, 'peak'),
        k.tone(t, 'sine', glide(62 * P, 24 * P, 0.6), perc(0.003, 0.95 * L), 1.1, 'peak'),
        k.tone(t, 'triangle', glide(124 * P, 48 * P, 0.5), perc(0.003, 0.6 * L), 0.35, 'peak', { shape: 'drive', filters: [lp(900)] }),
        k.noise(t, 'white', [lp(glide(2400, 300, 0.35))], perc(0.002, 0.7 * L), 1, 'peak'),
        k.noise(t + 0.004, 'pink', [lp(500)], perc(0.01, 0.9 * L), 0.9, 'tail'),
        k.noise(t + 0.01, 'pink', [bp(glide(4200, 450, 0.55), 1)], perc(0.008, 0.6 * L), 0.4, 'tail', { pan: -0.6 }),
        k.noise(t + 0.025, 'pink', [bp(glide(4000, 430, 0.55), 1)], perc(0.008, 0.6 * L), 0.4, 'tail', { pan: 0.6 }),
        k.tex(t + 0.03, 'tinkle', 1.25 * P, [hp(2600)], hold(0.004, 0.25, 0.8 * L), 0.2 * D, 'tail')
      )
      return layers
    },
  },
} satisfies Record<string, EffectSound>;
