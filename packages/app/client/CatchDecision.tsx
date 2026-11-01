import React, { useEffect, useRef } from 'react';
import type { ResultView } from '../shared/types';
import { Button } from './ui';
import { ChevronDown, RotateCcw } from './icons';
import { PublicAward } from './mechanics';
import { StreakFlame } from './streak';
import { baityChaosCopy, streakMilestone, wordSize } from '../extension/presentation.js';

export function CatchDecision({
  result,
  now = Date.now(),
  disabled,
  hasAward,
  onDecide,
  onReverse,
}: {
  result: ResultView;
  now?: number;
  disabled: boolean;
  hasAward: boolean;
  onDecide: (decision: 'confirm' | 'reject') => void;
  onReverse: () => void;
}) {
  const decision = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const chaos = baityChaosCopy(result);
  const pending = result.outcome === 'review';
  const autoConfirm = pending && Number.isFinite(result.confirmAt);
  const seconds = autoConfirm ? Math.max(0, Math.ceil((result.confirmAt! - now) / 1000)) : null;
  const tier = result.outcome === 'caught' && result.milestone ? streakMilestone(result.milestone) : null;
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
          {chaos ? chaos[0] : pending
            ? autoConfirm ? 'Catch heard.' : 'Did you say it?'
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
          {chaos ? chaos[1] : pending
            ? autoConfirm
              ? 'Chat gets the win automatically. Reject it if Moonshine misheard; the next round gets a new word.'
              : 'Yes gives chat the win. No ends this round, and the next round gets a new word.'
            : result.outcome === 'caught'
              ? `You said it after ${result.elapsed} ${result.elapsed === 1 ? 'second' : 'seconds'}.`
              : result.outcome === 'overturned'
                ? 'That catch does not count. The next round gets a new word.'
                : result.reason === 'guess'
                  ? 'Correct guess. You escaped.'
                  : 'A new word is ready when you are.'}
        </p>
        {tier && (
          <p className="studio-result__streak">
            <StreakFlame size={14} /> {result.newBadge ? 'New streak badge' : 'Streak badge'}: <strong>{tier.name}</strong>,{' '}
            {tier.count} in a row.
          </p>
        )}
      </div>
      {autoConfirm && (
        <div className="catch-countdown" role="timer" aria-live="off">
          <span>{seconds! > 0 ? 'Automatic confirmation in' : 'Waiting for the confirmed result'}</span>
          {seconds! > 0 && <strong>{seconds}s</strong>}
        </div>
      )}
      {pending && (
        <div className="round-actions catch-actions" aria-label="Confirm speech result">
          <Button className="secondary" disabled={disabled} onClick={() => onDecide('reject')}>
            No, I didn't
          </Button>
          <Button className="primary" disabled={disabled} onClick={() => onDecide('confirm')}>
            {autoConfirm ? 'Confirm now' : 'Yes, chat wins'}
          </Button>
        </div>
      )}
      {result.outcome === 'caught' && (
        <button className="undo-button" disabled={disabled} onClick={onReverse}>
          <RotateCcw size={13} /> {chaos ? 'Reverse Baity’s win' : 'Wrong detection? Reverse win'}
        </button>
      )}
      {result.outcome === 'caught' && !chaos && hasAward && (
        <a href="#award-review" className="text-button">
          {result.award ? 'Change the award' : 'Choose “You baited me” award'}
          <ChevronDown size={16} />
        </a>
      )}
      {!chaos && <PublicAward award={result.award} />}
    </div>
  );
}
