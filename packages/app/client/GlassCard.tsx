import React, { useId } from 'react';
import { glassOptics, glassRules } from './CardGlass';
import { CardArt } from './CardArt';
import { cardArtFile, wordSize } from '../extension/presentation.js';
import catalogue from '../shared/card-review-catalogue.json';

// The landing's selected card (packages/landing/selected-cards): a Glass face whose
// ruled light bends behind the art, the word in its item's ink on a dark plate.
// Both view boxes are the full-size 300 × 420 card, so the glass scales with the
// card exactly as the landing's deck scales it. The Extension overlay draws the same
// card in extension/overlay.css.
const optics = glassOptics.s;
const rules = glassRules(optics.pitch);
const inks = new Map(catalogue.map((card) => [card.word, card.ink]));
const cx =(...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(' ');

/** The printed ink of a word the caller may already show. Unknown words print in paper. */
export const inkFor = (word?: string | null) => (word ? inks.get(word.toLowerCase()) : undefined);

function GlassField() {
  return (
    <svg className="glass-card__field" viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <path d={rules} fill="none" stroke="#fffdf7" strokeOpacity={0.22} strokeWidth={optics.line} />
    </svg>
  );
}

function GlassLens() {
  const id = `glass-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <span className="glass-card__lens" aria-hidden="true">
      <svg viewBox="0 0 267.2 249.6" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8c43f9" />
            <stop offset="1" stopColor="#241050" />
          </linearGradient>
          <filter id={`${id}-bend`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={optics.frequency} numOctaves={1} seed={5} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={optics.scale} xChannelSelector="A" yChannelSelector="A" result="bent" />
            <feGaussianBlur in="bent" stdDeviation={optics.blur} result="frost" />
            <feColorMatrix in="frost" type="saturate" values="1.8" />
          </filter>
        </defs>
        <g filter={`url(#${id}-bend)`}>
          <rect width="100%" height="100%" fill={`url(#${id}-light)`} />
          <path d={rules} fill="none" stroke="#fffdf7" strokeOpacity={0.3} strokeWidth={optics.line} />
        </g>
      </svg>
    </span>
  );
}

/** The exact playable clues on the landing's rail, or its easy rule when there are none. */
export function ClueRail({ clues }: { clues: readonly string[] }) {
  const label = useId();
  if (!clues.length) return <p className="glass-card__note">Only this word is off limits.</p>;
  return (
    <div className="glass-card__rules">
      <p className="glass-card__rules-label" id={label}>Keep out of chat</p>
      <ul className="glass-card__clues" aria-labelledby={label}>
        {clues.map((clue) => <li key={clue}>{clue}</li>)}
      </ul>
    </div>
  );
}

export function GlassCard({
  word,
  ink = inkFor(word),
  chip,
  level,
  clues,
  note,
  question,
  footer,
  progress,
  className,
  label,
  wordAs: Word = 'strong',
}: {
  word: string;
  /** A page that names the card's word as its heading. */
  wordAs?: 'strong' | 'h2';
  ink?: string;
  chip?: React.ReactNode;
  /** The card's difficulty pips, 1 to 3. */
  level?: number | null;
  clues?: readonly string[] | null;
  note?: React.ReactNode;
  question?: React.ReactNode;
  /** Right of the BAITED footer, usually the clock. */
  footer?: React.ReactNode;
  /** Time left, 0 to 1, drawn along the footer rule. */
  progress?: number | null;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cx('glass-card', className)}
      data-art={cardArtFile(word) ? 'art' : 'word'}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <div className="glass-card__face">
        <GlassField />
        <div className="glass-card__top">
          {chip && <span className="glass-card__chip">{chip}</span>}
          {level ? (
            <span className="glass-card__pips" data-level={level} aria-hidden="true"><i /><i /><i /></span>
          ) : null}
        </div>
        <div className="glass-card__art">
          <span className="glass-card__square">
            <GlassLens />
            <CardArt word={word} />
          </span>
        </div>
        <div className="glass-card__plate">
          <Word className="glass-card__word" data-word-size={wordSize(word)} style={ink ? { color: ink } : undefined}>
            {word}
          </Word>
          {clues && <ClueRail clues={clues} />}
          {note && <p className="glass-card__note">{note}</p>}
          {question && <p className="glass-card__question">{question}</p>}
          <div className="glass-card__footer">
            <span className="glass-card__logo"><span className="baited-glyph" aria-hidden="true" /></span>
            {footer}
            {progress != null && (
              <i className="glass-card__timer" aria-hidden="true" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
