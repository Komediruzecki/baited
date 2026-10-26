import React, { useState } from 'react';
import type { GameView } from '../shared/types';
import { CardArt } from './CardArt';
import { wordSize } from '../extension/presentation.js';

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
  return (
    <div
      className={`result-deal${broadcast ? ' result-deal--broadcast' : ''}`}
      style={{ '--result-age': `${-Math.max(0, initialAge)}ms` } as React.CSSProperties}
    >
      <div className="result-card" data-outcome={result.outcome}>
        <div className="result-card__back" aria-hidden="true">
          <span className="baited-glyph" />
        </div>
        <div className="result-card__face">
          <span className="result-card__verdict">
            {review
              ? 'CHECK THIS CATCH'
              : caught
                ? 'THEY SAID IT.'
                : result.outcome === 'escaped'
                  ? 'THE STREAMER ESCAPED.'
                  : 'ROUND ENDED'}
          </span>
          <CardArt word={result.word} />
          <strong className="result-card__word" data-word-size={wordSize(result.word)}>
            {result.word}
          </strong>
          <span className="result-card__outcome">
            {review
              ? 'Awaiting your call'
              : caught
                ? 'CHAT WINS'
                : result.reason === 'guess'
                  ? 'BAIT CALLED'
                  : result.outcome === 'escaped'
                    ? 'TIME’S UP'
                    : 'NEW WORD NEXT'}
          </span>
          <span className="result-card__signature" aria-hidden="true">
            <span className="baited-glyph" />
          </span>
        </div>
      </div>
    </div>
  );
}
