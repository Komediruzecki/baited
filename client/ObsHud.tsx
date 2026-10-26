import React from 'react';
import type { GameView } from '../shared/types';
import { productBrand } from './ui';
import { Flame, Trophy } from './icons';
import { MissionStatus } from './mechanics';
import { winLabel } from '../extension/presentation.js';

export function ObsHud({
  game: g,
  timeLeft,
  now,
  offset,
  offline,
}: {
  game: GameView;
  timeLeft: string;
  now: number;
  offset: number;
  offline: boolean;
}) {
  const playing = ['active', 'paused', 'settling'].includes(g.phase);
  const result = !playing ? g.result : null;
  const pending = result?.outcome === 'review';
  const won = result?.outcome === 'caught';
  const reveal = result && ['caught', 'escaped'].includes(result.outcome);
  const label = offline
    ? 'RECONNECTING'
    : g.phase === 'settling'
      ? 'CHECKING FINAL WORDS'
      : pending
        ? 'CATCH PENDING'
        : won
          ? 'CHAT WINS'
          : g.phase === 'active'
            ? 'CHAT HAS A WORD'
            : g.phase === 'paused'
              ? 'ROUND PAUSED'
              : result?.reason === 'guess'
                ? 'BAIT CALLED'
                : result?.outcome === 'escaped'
                  ? 'TIME UP'
                  : result?.outcome === 'overturned'
                    ? 'CATCH REJECTED'
                    : result?.outcome === 'skipped'
                      ? 'SKIPPED'
                      : result
                        ? 'ROUND ENDED'
                        : 'WAITING FOR A ROUND';
  const headline = pending
    ? 'Did they say it?'
    : playing
      ? g.mission
        ? `WORD ${Math.min(3, g.mission.completed + 1)} OF 3`
        : `ROUND ${g.round?.number}`
      : reveal
        ? result.word
        : result
          ? 'NEW WORD NEXT'
          : 'BAIT THEM.';
  const clock = playing ? timeLeft : won ? '+1' : result?.reason === 'timer' ? '00:00' : null;
  const fraction =
    g.round && g.phase === 'active' && g.round.endsAt
      ? Math.max(0, g.round.endsAt - (now + offset)) / g.round.duration
      : g.phase === 'paused' && g.round
        ? g.round.remaining / g.round.duration
        : 0;
  return (
    <div
      className={`obs-hud${won ? ' obs-hud-win' : ''}${g.phase === 'paused' ? ' obs-hud-paused' : ''}${offline ? ' obs-hud-stale' : ''}`}
    >
      <div className={`obs-widget${won ? ' obs-win' : ''}`}>
        <div className="obs-logo">{productBrand}</div>
        <div className="obs-message">
          <span>{label}</span>
          <strong>{headline}</strong>
        </div>
        {clock !== null && <div className="obs-time">{clock}</div>}
        <div className="obs-progress">
          <i style={{ width: `${Math.min(1, fraction) * 100}%` }} />
        </div>
      </div>
      <MissionStatus compact game={g} now={now} offset={offset} />
      <div className="obs-score">
        <Trophy size={15} />
        {winLabel(g.score.wins)}
        <span>·</span>
        <Flame size={15} />
        STREAK {g.score.streak}
        {g.mode === 'demo' && <span className="obs-mode">LOCAL DEMO</span>}
      </div>
    </div>
  );
}
