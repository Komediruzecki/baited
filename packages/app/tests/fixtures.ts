import { Game, defaults } from '../server/game.js';
import type { Transcript } from '../shared/types.js';
export function fixture() {
  let time = 100000;
  const game = new Game(
    {
      id: 'room-test',
      owner: 'owner',
      channel: 'bait_channel',
      mode: 'demo',
      overlayKey: 'overlay-secret',
      settings: { ...defaults },
      history: [],
      priorWins: 0,
      priorPlayed: 0,
      priorBest: 0,
      leaders: {},
    },
    () => time,
    () => 0,
  );
  return {
    game,
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
    transcript: (text = game.round!.word, patch: Partial<Transcript> = {}) => ({
      roundId: game.round!.id,
      epoch: game.round!.epoch,
      text,
      final: true,
      confidence: 0.99,
      capturedAt: time,
      id: Math.random().toString(),
      ...patch,
    }),
  };
}
