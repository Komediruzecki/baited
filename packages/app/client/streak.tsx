import React from 'react';
import type { GameView } from '../shared/types';
import { CardBack } from './CardBack';
import { GlassCard } from './GlassCard';
import { Check, Flame } from './pixel-icons';
import {
  finishArt,
  nextStreakTier,
  streakMilestone,
  streakRow,
  streakTiers,
  type StreakTier,
} from '../extension/presentation.js';

// Chat's win streak in the landing's card language: wins are dealt as small Glass
// cards, the rounds ahead lie face down as Mosaic backs, and each milestone prints
// chat a card in one of the Card Lab finishes.
const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');
const base = import.meta.env?.BASE_URL ?? '/';

export function StreakCount({ count, label = 'in a row' }: { count: number; label?: string }) {
  return (
    <span className="streak-count">
      <strong>{count}</strong>
      <span>
        <Flame size={14} />
        {label}
      </span>
    </span>
  );
}

/** Five positions around the current streak: dealt wins, this win, and cards still face down. */
export function StreakSlots({ count, className = '' }: { count: number; className?: string }) {
  return (
    <ol className={cx('streak-slots', className)} aria-label={`${count} wins in a row`}>
      {streakRow(count).map((slot) => {
        const texture = slot.tier ? finishArt(slot.tier.finish, 'client', true) : null;
        return (
          <li
            key={slot.n}
            className={cx(`is-${slot.state}`, !!slot.tier && 'has-tier')}
            data-finish={slot.tier?.finish}
            title={slot.tier ? `${slot.tier.name} card at ${slot.tier.count}` : undefined}
          >
            <span className="streak-slots__card" aria-hidden="true">
              {slot.state !== 'ahead' && texture && <img src={`${base}${texture.slice(1)}`} alt="" />}
              {slot.state === 'won' && !slot.tier && <Check size={12} />}
            </span>
            <span className="streak-slots__n">{slot.n}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One streak card: printed in its finish once unlocked, face down until then. */
export function StreakCard({
  tier,
  word,
  unlocked,
  width = 112,
}: {
  tier: StreakTier;
  word?: string | null;
  unlocked: boolean;
  width?: number;
}) {
  const style = { '--glass-card-width': `${width}px`, '--card-r': `${width * 0.0467}px ${width * 0.08}px ${width * 0.0467}px ${width * 0.0467}px` } as React.CSSProperties;
  if (!unlocked)
    return (
      <span className="streak-card is-locked" style={style} aria-hidden="true">
        <CardBack />
      </span>
    );
  return (
    <span className="streak-card" style={style}>
      <GlassCard
        word={word ?? tier.name}
        ink={word ? undefined : 'var(--b-paper)'}
        finish={tier.finish}
        swatch={width < 160}
        label={`${tier.name} card${word ? `, printed with ${word}` : ''}`}
      />
    </span>
  );
}

function unlockDate(at: number | null) {
  return at === null
    ? 'Unlocked'
    : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The studio's collection: every streak card, printed or still face down. */
export function StreakCards({ game: g }: { game: GameView }) {
  const unlocked = new Map(g.badges.map((badge) => [badge.count, badge]));
  const next = nextStreakTier(g.score.streak);
  const toGo = next ? next.count - g.score.streak : 0;
  return (
    <section className="panel streak-panel">
      <div className="section-heading">
        <div>
          <span className="small-label">CHAT WIN STREAK</span>
          <h3>Streak cards</h3>
        </div>
        <span className="small-label">
          {unlocked.size} OF {streakTiers.length} PRINTED
        </span>
      </div>
      <div className="streak-panel__now">
        <StreakCount count={g.score.streak} />
        <StreakSlots count={g.score.streak} />
        <p className="muted">
          Best {g.score.best}.{' '}
          {next
            ? `${toGo} more ${toGo === 1 ? 'win' : 'wins'} in a row print the ${next.name} card.`
            : 'Every streak card is printed.'}{' '}
          A round chat doesn’t win ends the streak; a rejected catch doesn’t.
        </p>
      </div>
      <ul className="streak-collection">
        {streakTiers.map((tier) => {
          const badge = unlocked.get(tier.count);
          return (
            <li key={tier.count} className={cx(!badge && 'is-locked')}>
              <StreakCard tier={tier} word={badge?.word} unlocked={!!badge} />
              <strong>{tier.name}</strong>
              <span>{tier.count} in a row</span>
              <small>
                {badge ? unlockDate(badge.at) : `Best ${Math.min(g.score.best, tier.count)}/${tier.count}`}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** OBS: a win that lands on a tier gets a printed-card note beside the reprinted result card. */
export function StreakCelebration({
  result,
  streak,
  age,
}: {
  result: NonNullable<GameView['result']>;
  streak: number;
  age: number;
}) {
  const tier = result.outcome === 'caught' && result.milestone ? streakMilestone(result.milestone) : null;
  if (!tier) return null;
  const next = nextStreakTier(tier.count);
  return (
    <div
      className="streak-celebration"
      style={{ '--result-age': `${-Math.max(0, age)}ms` } as React.CSSProperties}
    >
      <span className="streak-celebration__kicker">
        {result.newBadge ? 'New streak card' : 'Streak card'}
      </span>
      <strong className="streak-celebration__name">{tier.name} edition</strong>
      <StreakCount count={streak} />
      <StreakSlots count={streak} />
      {next && (
        <span className="streak-celebration__next">
          Next card · {next.name} at {next.count}
        </span>
      )}
    </div>
  );
}
