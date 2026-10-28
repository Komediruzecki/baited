import React, { useEffect, useId, useRef } from 'react';
import { CardArt } from './CardArt';
import { cardArtFile, cardArtPath, cardWordSize, glassRules } from '../extension/presentation.js';
import { revealPixels } from '../extension/pixel-reveal.js';
import catalogue from '../shared/card-review-catalogue.json';

// The landing's approved card, Cut Open / Glass / Prism (packages/landing/selected-cards),
// on the app's surfaces: the viewer room, studio results and the OBS reveal. The same
// stylesheet, extension/card.css, draws the Extension panel and video overlay. The host is
// the card's container, so everything scales from its width; at 300 px wide it is the
// landing's own 300 × 420 card.
const rules = glassRules();
const inks = new Map(catalogue.map((card) => [card.word, card.ink]));
const cx = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(' ');

/** The printed ink of a word the caller may already show. Unknown words print in paper. */
export const inkFor = (word?: string | null) => (word ? inks.get(word.toLowerCase()) : undefined);

/** The Glass finish: ruled light on a violet field that ends at an angle under the art. */
function GlassField() {
  return (
    <svg className="cut-card__field" viewBox="0 0 300 420" preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false">
      <path d={rules} fill="none" stroke="#fffdf7" strokeOpacity={0.22} strokeWidth={1.5} />
    </svg>
  );
}

/**
 * The illustration resolves from pixels the first time this card shows it, as on the
 * landing. `hold` keeps the coarsest step while a face is still turning over. Offscreen
 * cards, hidden pages and reduced motion show the finished image.
 */
function RevealArt({ word, artUrl, artPreview, hold, still }: {
  word: string; artUrl?: string; artPreview: boolean; hold: number; still: boolean;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = holder.current;
    const image = node?.querySelector('img');
    const canvas = node?.querySelector('canvas');
    if (!node || !image || !canvas || still) return;
    let stop = () => {};
    let played = false;
    let visible = typeof IntersectionObserver !== 'function';
    const begin = () => {
      if (played || !visible || !image.complete || !image.naturalWidth) return;
      played = true;
      stop = revealPixels({ holder: node, image, canvas, hold });
    };
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            visible = entries.at(-1)?.isIntersecting ?? false;
            if (visible) begin();
            else stop();
          })
        : null;
    observer?.observe(node);
    image.addEventListener('load', begin);
    begin();
    return () => {
      observer?.disconnect();
      image.removeEventListener('load', begin);
      stop();
    };
  }, [word, artUrl, artPreview, hold, still]);
  return (
    <span className="cut-card__reveal" ref={holder}>
      <CardArt word={word} artUrl={artUrl} artPreview={artPreview} className="cut-card__image" />
      <canvas className="cut-card__pixels" width={1} height={1} aria-hidden="true" />
    </span>
  );
}

/** The exact playable clues on the landing's ruled rail, or its easy rule when there are none. */
export function ClueRail({ clues }: { clues: readonly string[] }) {
  const label = useId();
  if (!clues.length) return <p className="cut-card__note">Only this word is off limits.</p>;
  return (
    <div className="cut-card__rules">
      <p className="cut-card__rules-label" id={label}>Keep out of chat</p>
      <ul className="cut-card__clues" aria-labelledby={label}>
        {clues.map((clue) => <li key={clue}>{clue}</li>)}
      </ul>
    </div>
  );
}

export function CutCard({
  word,
  artUrl,
  artPreview = false,
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
  revealHold = 0,
  revealStill = false,
}: {
  word: string;
  /** Server-issued artwork capability. Owner previews require the explicit editor flag. */
  artUrl?: string;
  artPreview?: boolean;
  /** A page that names the card's word as its heading. */
  wordAs?: 'strong' | 'h2';
  ink?: string;
  chip?: React.ReactNode;
  /** The card's difficulty pips, 1 to 3. */
  level?: number | null;
  clues?: readonly string[] | null;
  note?: React.ReactNode;
  question?: React.ReactNode;
  /** Right of the BAITED signature, usually the clock. */
  footer?: React.ReactNode;
  /** Time left, 0 to 1, drawn along the footer rule. */
  progress?: number | null;
  className?: string;
  label?: string;
  /** Milliseconds to hold the first pixel step while the face turns into view. */
  revealHold?: number;
  /** Show the finished art at once, for a card that arrives late. */
  revealStill?: boolean;
}) {
  const art = cardArtPath(artUrl, artPreview) ?? cardArtFile(word);
  return (
    <div
      className={cx('cut-host', className)}
      data-art={art ? 'art' : 'word'}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <div className="cut-card" data-edition="cut-open" data-finish="glass" data-art-frame="open">
        <div className="cut-card__top">
          {chip && <span className="cut-card__chip">{chip}</span>}
          {level ? (
            <span className="cut-card__pips" data-level={level} aria-hidden="true"><i /><i /><i /></span>
          ) : null}
        </div>
        <div className="cut-card__art">
          <GlassField />
          {art && (
            <span className="cut-card__square">
              <RevealArt key={art} word={word} artUrl={artUrl} artPreview={artPreview} hold={revealHold} still={revealStill} />
            </span>
          )}
        </div>
        <div className="cut-card__plate">
          <Word className="cut-card__word" data-word-size={cardWordSize(word)} style={ink ? { color: ink } : undefined}>
            {word}
          </Word>
          {clues && <ClueRail clues={clues} />}
          {note && <p className="cut-card__note">{note}</p>}
          {question && <p className="cut-card__question">{question}</p>}
          <div className="cut-card__footer">
            <span className="cut-card__signature baited-glyph" aria-hidden="true" />
            {footer}
            {progress != null && (
              <i className="cut-card__timer" aria-hidden="true" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
