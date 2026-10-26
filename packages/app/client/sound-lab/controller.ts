import type { SoundSnapshot } from './events';
import { SoundEventGate } from './events';
import type { SoundCue } from './recipes';

/** The small boundary between game policy and Web Audio. Useful for offline rendering, too. */
export interface SoundPlayback {
  resume(): Promise<void>;
  suspend(): void;
  setVolume(volume: number): void;
  play(cue: SoundCue, seconds?: number): boolean;
  stop(): void;
  dispose(): void;
}

export interface SoundState {
  enabled: boolean;
  volume: number;
  error: string | null;
}

export interface SoundControllerOptions {
  roomId: string;
  createPlayback(): SoundPlayback;
  reserveOutput(roomId: string): Promise<(() => void) | null>;
  onState?(state: SoundState): void;
}

export interface BaitSound {
  readonly enabled: boolean;
  readonly volume: number;
  readonly error: string | null;
  /** Must be called directly by the user's Enable sound gesture. */
  enable(): Promise<boolean>;
  disable(): void;
  setVolume(volume: number): void;
  receive(snapshot: SoundSnapshot): void;
  /** Current display timer, in seconds. At most one quiet tick for each of the last five seconds. */
  tick(remainingSeconds: number): void;
  /** Audition only outside active rounds and final transcript settlement. */
  preview(cue: SoundCue): boolean;
  stop(): void;
  dispose(): void;
}

export function createSoundController(options: SoundControllerOptions): BaitSound {
  let enabled = false;
  let volume = 0.35;
  let error: string | null = null;
  let disposed = false;
  let generation = 0;
  let playback: SoundPlayback | null = null;
  let release: (() => void) | null = null;
  let pendingEnable: Promise<boolean> | null = null;
  let pendingResult: ReturnType<typeof setTimeout> | null = null;
  let phase: SoundSnapshot['phase'] = 'idle';
  let gate = new SoundEventGate();
  const notify = () => options.onState?.({ enabled, volume, error });
  const stop = () => {
    if (pendingResult) clearTimeout(pendingResult);
    pendingResult = null;
    playback?.stop();
  };
  const disable = () => {
    generation++;
    enabled = false;
    stop();
    playback?.setVolume(0);
    playback?.suspend();
    release?.();
    release = null;
    // Reconnect/return takes a new baseline. A result arriving while muted cannot replay.
    gate = new SoundEventGate();
    notify();
  };
  const canPlay = () => enabled && !disposed && volume > 0;

  return {
    get enabled() { return enabled; },
    get volume() { return volume; },
    get error() { return error; },

    enable() {
      if (disposed) return Promise.resolve(false);
      if (enabled) return Promise.resolve(true);
      if (pendingEnable) return pendingEnable;
      const request = ++generation;
      error = null;
      let resume: Promise<void>;
      try {
        playback ??= options.createPlayback();
        playback.setVolume(0);
        // Start/resume before the first await, while still inside the user's gesture.
        resume = playback.resume();
      } catch {
        error = 'Sound could not start. Check the browser audio permission and try again.';
        notify();
        return Promise.resolve(false);
      }
      pendingEnable = (async () => {
        const [resumed, reserved] = await Promise.allSettled([resume, options.reserveOutput(options.roomId)]);
        const held = reserved.status === 'fulfilled' ? reserved.value : null;
        if (request !== generation || disposed) { held?.(); return false; }
        if (resumed.status === 'rejected' || !held) {
          held?.();
          playback?.suspend();
          error = resumed.status === 'rejected'
            ? 'Sound could not start. Check the browser audio permission and try again.'
            : 'Sound is enabled in another BAIT tab, or this browser cannot reserve audio. Turn it off there and try again.';
          notify();
          return false;
        }
        release = held;
        enabled = true;
        playback?.setVolume(volume);
        notify();
        return true;
      })().finally(() => { pendingEnable = null; });
      return pendingEnable;
    },

    disable,

    setVolume(next) {
      if (!Number.isFinite(next) || disposed) return;
      volume = Math.max(0, Math.min(1, next));
      playback?.setVolume(enabled ? volume : 0);
      notify();
    },

    receive(snapshot) {
      if (disposed) return;
      const cues = gate.receive(snapshot);
      if (snapshot.phase !== phase && (snapshot.phase === 'active' || snapshot.phase === 'settling' || snapshot.phase === 'paused')) stop();
      phase = snapshot.phase;
      if (!canPlay()) return;
      for (const cue of cues) {
        if (cue === 'deal') playback?.play(cue);
        else {
          stop();
          // React's capture effect gets a turn to close the microphone before a committed-result boom.
          pendingResult = setTimeout(() => {
            pendingResult = null;
            if (canPlay() && phase !== 'active' && phase !== 'settling') playback?.play(cue);
          }, 150);
        }
      }
    },

    tick(seconds) {
      const fresh = gate.tick(seconds);
      if (fresh && canPlay() && phase === 'active') playback?.play('countdown', seconds);
    },

    preview(cue) {
      if (!canPlay() || phase === 'active' || phase === 'settling') return false;
      stop();
      return playback?.play(cue) ?? false;
    },

    stop,

    dispose() {
      if (disposed) return;
      disable();
      disposed = true;
      playback?.dispose();
      playback = null;
    },
  };
}
