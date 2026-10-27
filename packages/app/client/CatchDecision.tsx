import React, { useEffect, useRef } from 'react';
import type { ResultView } from '../shared/types';
import { Button } from './ui';
import { ChevronDown, RotateCcw } from './icons';
import { PublicAward } from './mechanics';
import { wordSize } from '../extension/presentation.js';

export function CatchDecision({
  result,
  disabled,
  hasAward,
  onDecide,
  onReverse,
}: {
  result: ResultView;
  disabled: boolean;
  hasAward: boolean;
  onDecide: (decision: 'confirm' | 'reject') => void;
  onReverse: () => void;
}) {
  const decision = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pending = result.outcome === 'review';
  useEffect(() => {
    if (!pending) return;
    const focus = document.activeElement;
    // Never steal a microphone/settings dialog or an in-progress text input.
    if (focus === document.body || focus?.closest('.round-console .round-actions')) {
      heading.current?.focus({ preventScroll: true });
      decision.current?.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  }, [result.id, pending]);

  return (
    <div className="studio-result__decision" ref={decision}>
      <div className="studio-result__message" role="status" aria-live="polite" aria-atomic="true">
        <h2 ref={heading} tabIndex={-1}>
          {pending
            ? 'Did you say it?'
            : result.outcome === 'caught'
              ? 'Chat got you.'
              : result.outcome === 'escaped'
                ? 'You got away.'
                : result.outcome === 'overturned'
                  ? 'Catch rejected.'
                  : 'Round over.'}
        </h2>
        <p className="studio-result__word" data-word-size={wordSize(result.word)}>
          {result.word}
        </p>
        <p>
          {pending
            ? 'Yes gives chat the win. No ends this round, and the next round gets a new word.'
            : result.outcome === 'caught'
              ? `You said it after ${result.elapsed} ${result.elapsed === 1 ? 'second' : 'seconds'}.`
              : result.outcome === 'overturned'
                ? 'That catch does not count. The next round gets a new word.'
                : result.reason === 'guess'
                  ? 'Correct guess. You escaped.'
                  : 'A new word is ready when you are.'}
        </p>
      </div>
      {pending && (
        <div className="round-actions catch-actions" aria-label="Confirm speech result">
          <Button className="secondary" disabled={disabled} onClick={() => onDecide('reject')}>
            No, I didn't
          </Button>
          <Button className="primary" disabled={disabled} onClick={() => onDecide('confirm')}>
            Yes, chat wins
          </Button>
        </div>
      )}
      {result.outcome === 'caught' && (
        <button className="undo-button" disabled={disabled} onClick={onReverse}>
          <RotateCcw size={13} /> Wrong detection? Reverse win
        </button>
      )}
      {result.outcome === 'caught' && hasAward && (
        <a href="#award-review" className="text-button">
          {result.award ? 'Change the award' : 'Choose “You baited me” award'}
          <ChevronDown size={16} />
        </a>
      )}
      <PublicAward award={result.award} />
    </div>
  );
}
