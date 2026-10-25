import { EFFECT_SOUNDS } from './keys/effects';
import { createKit, hp, lp } from './keys/kit';
import { dbToGain, env, type VoiceRecipe } from './keys/recipe';
import { createRng, type Rng } from './keys/rng';

export const SOUND_CUES = ['deal', 'countdown', 'catch', 'escape', 'correction', 'rare-catch'] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/** Public labels describe audible cues, not additional game rules. */
export const SOUND_LABELS: Record<SoundCue, string> = {
  deal: 'Card dealt',
  countdown: 'Last seconds',
  catch: 'Caught. Supernova',
  escape: 'Escaped. Confetti',
  correction: 'Score corrected',
  'rare-catch': 'Black hole',
};

/** Reuses Keys' procedural layers. No samples, speech or target words enter a cue. */
export function recipeForCue(cue: SoundCue, rng: Rng = createRng(), seconds = 3): VoiceRecipe {
  const k = createKit(rng);
  if (cue === 'deal') {
    return {
      name: 'bait:deal', group: 'tick', priority: 1, offset: 0, peakAt: 0,
      gain: dbToGain(-14), pan: 0, send: 0.03,
      layers: [
        k.tex(0, 'rustle', 1.7, [hp(1500), lp(6500)], env.perc(0.005, 0.13), 0.8, 'peak'),
        k.tone(0.04, 'sine', [[0, 720], [0.025, 260]], env.perc(0.002, 0.055), 0.15, 'peak'),
      ],
    };
  }
  if (cue === 'countdown') {
    const remaining = Math.max(1, Math.min(5, Math.round(seconds)));
    return {
      name: 'bait:countdown', group: 'tick', priority: 1, offset: 0, peakAt: 0,
      gain: dbToGain(-19), pan: 0, send: 0,
      layers: [k.tex(0, 'tick', 0.8 + (5 - remaining) * 0.08, [hp(700), lp(3800)], env.perc(0.001, 0.055), 0.65, 'peak')],
    };
  }
  if (cue === 'correction') {
    // Keys' wrongVoice, adapted to a settled score correction rather than a keypress.
    const f = 180 * 2 ** rng.range(-0.03, 0.03);
    return {
      name: 'bait:correction', group: 'tick', priority: 2, offset: 0, peakAt: 0,
      gain: dbToGain(-13), pan: 0, send: 0,
      layers: [
        k.tone(0, 'triangle', [[0, f], [0.09, f * 0.77]], env.perc(0.002, 0.11), 0.5, 'peak', { filters: [lp(1200)] }),
        k.noise(0, 'white', [lp(1800), hp(300)], env.perc(0.001, 0.025), 0.5, 'peak'),
      ],
    };
  }
  const name = cue === 'catch' ? 'supernova' : cue === 'rare-catch' ? 'blackhole' : 'confetti';
  const effect = EFFECT_SOUNDS[name];
  return {
    name: `bait:${name}`, group: 'fx', priority: effect.priority, offset: 0,
    peakAt: effect.peakIn, gain: dbToGain(effect.gainDb - (name === 'blackhole' ? 5 : 2)),
    pan: 0, send: effect.send,
    layers: effect.layers({ peak: effect.peakIn, P: 2 ** rng.range(-0.025, 0.025), i: 0.6, D: 1, L: 1, rng }, k),
  };
}
