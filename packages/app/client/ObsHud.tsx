import React from 'react';
import type { GameView } from '../shared/types';
import { Card, Pause } from './pixel-icons';
import { BaityChaosRule } from './BaityChaos';
import { MissionStatus } from './mechanics';
import { StreakFlame, StreakRow } from './streak';
import { baityChaosCopy, nextStreakTier, winLabel } from '../extension/presentation.js';

export function ObsHud({
  game: g,
  timeLeft,
  now,
  offset,
  offline,
  showCard = false,
}: {
  game: GameView;
  timeLeft: string;
  now: number;
  offset: number;
  offline: boolean;
  showCard?: boolean;
}) {
  const playing = ['active', 'paused', 'settling'].includes(g.phase);
  const result = !offline && !playing ? g.result : null;
  const chaos = baityChaosCopy(result);
  const pending = result?.outcome === 'review';
  const won = result?.outcome === 'caught';
  const reveal = result && ['caught', 'escaped'].includes(result.outcome);
  const label = offline
    ? 'Reconnecting'
    : g.phase === 'settling'
      ? 'Checking final words'
      : pending
        ? 'Catch pending'
        : chaos
          ? won ? 'Correct guess · Baity’s call' : chaos[0]
        : won
          ? 'Chat wins'
          : g.phase === 'active'
            ? 'Chat has a word'
            : g.phase === 'paused'
              ? 'Round paused'
              : result?.reason === 'guess'
                ? 'Bait called'
                : result?.outcome === 'escaped'
                  ? 'Time’s up'
                  : result?.outcome === 'overturned'
                    ? 'Catch rejected'
                    : result?.outcome === 'skipped'
                      ? 'Skipped'
                      : result
                        ? 'Round ended'
                        : 'Next round';
  const headline = offline
    ? 'Waiting for updates'
    : pending
      ? 'Did they say it?'
      : playing
        ? g.mission
          ? `Word ${Math.min(3, g.mission.completed + 1)} of 3`
          : `Round ${g.round?.number}`
        : reveal
          ? showCard ? won ? '+1 for chat' : 'Time ran out' : result.word
          : result
            ? 'New word next'
            : 'Waiting for the streamer';
  const clock = offline
    ? '—:—'
    : playing
      ? timeLeft
      : won
        ? '+1'
        : result?.reason === 'timer'
          ? '00:00'
          : null;
  const fraction = offline
    ? 0
    : g.round && g.phase === 'active' && g.round.endsAt
      ? Math.max(0, g.round.endsAt - (now + offset)) / g.round.duration
      : g.phase === 'paused' && g.round
        ? g.round.remaining / g.round.duration
        : 0;
  const urgent = !offline && g.phase === 'active' && !!g.round?.endsAt && g.round.endsAt - (now + offset) <= 15000;
  const streak = g.score.streak;
  const next = nextStreakTier(streak);
  return (
    <div
      className={`obs-hud${won ? ' obs-hud-win' : ''}${!offline && g.phase === 'paused' ? ' obs-hud-paused' : ''}${offline ? ' obs-hud-stale' : ''}${urgent ? ' obs-hud-urgent' : ''}`}
    >
      <div className={`obs-widget${won ? ' obs-win' : ''}`}>
        <div className="obs-message">
          <span>{!offline && g.phase === 'active' && <Card size={16} />}{label}</span>
          <strong>{headline}</strong>
        </div>
        {clock !== null && (
          <div
            className="obs-time"
            aria-label={offline ? 'Timer unavailable while reconnecting' : undefined}
          >
            {!offline && g.phase === 'paused' && <Pause size={16} />}{clock}
          </div>
        )}
        <div className="obs-progress">
          <i style={{ width: `${Math.min(1, fraction) * 100}%` }} />
        </div>
      </div>
      {!offline && <BaityChaosRule compact game={g} />}
      {!offline && <MissionStatus compact game={g} now={now} offset={offset} />}
      {!offline && streak >= 2 && (
        <div className="obs-streak">
          <span className="obs-streak__count">
            <strong>{streak}</strong>
            <StreakFlame size={30} />
          </span>
          <span className="obs-streak__label">
            IN A ROW
            {next && (
              <small>
                NEXT · {next.name.toUpperCase()} AT {next.count}
              </small>
            )}
          </span>
          <StreakRow count={streak} />
        </div>
      )}
      <div className="obs-score">
        {offline && <span className="obs-score-status">Last known:</span>}
        {winLabel(g.score.wins).toLowerCase()}
        <span>·</span>
        {streak >= 2 && !offline ? `best ${g.score.best}` : `streak ${streak}`}
        {g.mode === 'demo' && <span className="obs-mode">Local demo</span>}
      </div>
    </div>
  );
}
