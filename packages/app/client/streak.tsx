import React from 'react';
import type { GameView } from '../shared/types';
import {
  nextStreakTier,
  streakArtFile,
  streakMilestone,
  streakRow,
  streakTiers,
  type StreakTier,
} from '../extension/presentation.js';

// Chat's win streak, drawn like a streak calendar: a flame counter, the last few
// positions as coins, and one medallion per badge tier.
const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');

export function StreakFlame({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      className={cx('streak-flame', className)}
      src="/brand/streak-flame.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round(size * 1.125)}
    />
  );
}

export function StreakBadge({
  tier,
  size = 96,
  locked = false,
}: {
  tier: StreakTier;
  size?: number;
  locked?: boolean;
}) {
  return (
    <span
      className={cx('streak-badge', `streak-badge--${tier.tone}`, locked && 'is-locked')}
      style={{ '--badge-size': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <img className="streak-badge__art" src={streakArtFile(tier.art, 'client')} alt="" />
    </span>
  );
}

export function StreakRow({ count, className = '' }: { count: number; className?: string }) {
  return (
    <ol className={cx('streak-row', className)} aria-label={`${count} wins in a row`}>
      {streakRow(count).map((slot) => (
        <li key={slot.n} className={cx(`is-${slot.state}`, !!slot.tier && 'has-tier')}>
          <span className="streak-row__coin">
            <img src="/brand/streak-flame.svg" alt="" />
          </span>
          <span className="streak-row__n">{slot.n}</span>
        </li>
      ))}
    </ol>
  );
}

export function StreakCount({ count, label = 'in a row' }: { count: number; label?: string }) {
  return (
    <span className="streak-count">
      <strong>{count}</strong>
      <StreakFlame size={34} />
      <span>{label}</span>
    </span>
  );
}

function badgeDate(at: number | null) {
  return at === null
    ? 'Unlocked'
    : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The studio's achievements view: every tier, unlocked or with progress toward it. */
export function StreakBadges({ game: g }: { game: GameView }) {
  const unlocked = new Map(g.badges.map((badge) => [badge.count, badge.at]));
  const next = nextStreakTier(g.score.streak);
  return (
    <section className="panel streak-panel">
      <div className="section-heading">
        <div>
          <span className="small-label">CHAT WIN STREAK</span>
          <h3>Streak badges</h3>
        </div>
        <span className="small-label">
          {unlocked.size} OF {streakTiers.length} UNLOCKED
        </span>
      </div>
      <div className="streak-panel__now">
        <StreakCount count={g.score.streak} />
        <StreakRow count={g.score.streak} />
        <p className="muted">
          Best {g.score.best}.{' '}
          {next
            ? `${next.count - g.score.streak} more ${next.count - g.score.streak === 1 ? 'win' : 'wins'} in a row unlock ${next.name}.`
            : 'Every badge is unlocked.'}{' '}
          A round chat doesn’t win ends the streak; a rejected catch doesn’t.
        </p>
      </div>
      <ul className="streak-grid">
        {streakTiers.map((tier) => {
          const at = unlocked.get(tier.count);
          const locked = at === undefined;
          return (
            <li key={tier.count} className={cx(locked && 'is-locked')}>
              <StreakBadge tier={tier} size={92} locked={locked} />
              <strong>{tier.name}</strong>
              <span>{tier.count} in a row</span>
              <small>
                {locked ? `Best ${Math.min(g.score.best, tier.count)}/${tier.count}` : badgeDate(at)}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** OBS: a win that lands on a tier gets a medallion beside the result card. */
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
  // Keep the correct-guess explanation visible instead of covering it with a badge takeover.
  if (!tier || result.reason === 'baity-chaos') return null;
  const next = nextStreakTier(tier.count);
  return (
    <div
      className="streak-celebration"
      style={{ '--result-age': `${-Math.max(0, age)}ms` } as React.CSSProperties}
    >
      <span className="streak-celebration__kicker">
        {result.newBadge ? 'NEW STREAK BADGE' : 'STREAK BADGE'}
      </span>
      <StreakBadge tier={tier} size={176} />
      <strong className="streak-celebration__name">{tier.name}</strong>
      <span className="streak-celebration__count">{tier.count} IN A ROW</span>
      <StreakRow count={streak} />
      {next && (
        <span className="streak-celebration__next">
          NEXT · {next.name.toUpperCase()} AT {next.count}
        </span>
      )}
    </div>
  );
}
