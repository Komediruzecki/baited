/*!
Keys Sound Lab audio engine and recipes:
MIT License

Copyright (c) 2025 Dnzzk2

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { createSoundController, type BaitSound, type SoundState } from './controller';
import { createEngine } from './keys/engine';
import { createRng } from './keys/rng';
import { recipeForCue } from './recipes';

export { SOUND_CUES, SOUND_LABELS, recipeForCue, type SoundCue } from './recipes';
export { createSoundController, type BaitSound, type SoundPlayback, type SoundState } from './controller';
export { SoundEventGate } from './events';

/** Web Locks apply within one browser profile. OBS stays silent; studio is the automatic sound source. */
export function reserveBrowserOutput(roomId: string): Promise<(() => void) | null> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(null);
  return new Promise((resolve) => {
    void navigator.locks.request(`bait:sound:${roomId}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      await new Promise<void>((release) => resolve(release));
    }).catch(() => resolve(null));
  });
}

export interface BaitSoundOptions {
  roomId: string;
  onState?(state: SoundState): void;
}

export function createBaitSound(options: BaitSoundOptions): BaitSound {
  return createSoundController({
    ...options,
    reserveOutput: reserveBrowserOutput,
    createPlayback: () => {
      const Audio = globalThis.AudioContext;
      if (!Audio) throw new Error('Web Audio is not available.');
      const ctx = new Audio({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const engine = createEngine(ctx, {
        destination: master,
        warmTextures: ['rustle', 'tick', 'tinkle'],
        limits: { fx: 3, tick: 3, big: 1, stack: 1, stackWindow: 0.08 },
      });
      const rng = createRng(Math.floor(Math.random() * 2 ** 32));
      let warming: ReturnType<typeof setTimeout> | null = null;
      let disposed = false;
      const warm = () => {
        if (disposed) return;
        if (!engine.warm(1)) warming = setTimeout(warm, 30);
        else warming = null;
      };
      warming = setTimeout(warm, 60);
      return {
        resume: () => ctx.resume(),
        suspend: () => { void ctx.suspend().catch(() => {}); },
        setVolume: (volume) => {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setTargetAtTime(volume, ctx.currentTime, 0.015);
        },
        play: (cue, seconds) => {
          if (disposed || ctx.state !== 'running') return false;
          return engine.play(recipeForCue(cue, rng, seconds), ctx.currentTime);
        },
        stop: () => engine.stopAll(ctx.currentTime),
        dispose: () => {
          disposed = true;
          if (warming) clearTimeout(warming);
          engine.dispose();
          master.disconnect();
          void ctx.close().catch(() => {});
        },
      };
    },
  });
}
