import React, { useState } from 'react';
import type { GameView } from '../shared/types';
import { CardBack } from './CardBack';
import { GlassCard } from './GlassCard';

// Only a server-authorized result belongs here. OBS must never render a review.
export function ResultCard({
  result,
  broadcast = false,
  age = 0,
}: {
  result: NonNullable<GameView['result']>;
  broadcast?: boolean;
  age?: number;
}) {
  const [initialAge] = useState(age);
  if (!result.word) return null;
  if (broadcast && !['caught', 'escaped'].includes(result.outcome)) return null;
  const caught = result.outcome === 'caught';
  const review = result.outcome === 'review';
  const verdict = review
    ? 'Heard'
    : caught
      ? 'They said it'
      : result.outcome === 'escaped'
        ? 'The streamer escaped'
        : result.outcome === 'overturned'
          ? 'Catch rejected'
          : 'Round ended';
  const outcome = review
    ? 'Not scored yet'
    : caught
      ? 'Chat wins'
      : result.reason === 'guess'
        ? 'Bait called'
        : result.outcome === 'escaped'
          ? 'Time’s up'
          : 'New word next';
  return (
    <div
      className={`result-deal${broadcast ? ' result-deal--broadcast' : ''}`}
      style={{ '--result-age': `${-Math.max(0, initialAge)}ms` } as React.CSSProperties}
    >
      <div className="result-card" data-outcome={result.outcome}>
        <div className="result-card__back" aria-hidden="true">
          <CardBack />
        </div>
        <GlassCard className="result-card__face" word={result.word} chip={verdict} note={outcome} />
      </div>
    </div>
  );
}
