import React from 'react';
import { cardArtFile, cardArtSource, proofWords } from '../extension/presentation.js';
export { proofWords } from '../extension/presentation.js';

// This is an art catalogue, never a round selector. Only render a target received
// from the viewer response, or a public result after the server has settled it.
export type ProofWord = (typeof proofWords)[number];

export function CardArt({ word, artUrl, artPreview = false, className = '' }: {
  word?: string; artUrl?: string; artPreview?: boolean; className?: string;
}) {
  const uploaded = cardArtSource(artUrl, undefined, artPreview);
  const src = uploaded ?? (word && cardArtFile(word)
    ? `${import.meta.env?.BASE_URL ?? '/'}cards/proofs/${word.toLowerCase()}.png` : null);
  if (!src) return null;
  return (
    <img
      key={src}
      className={`bait-card-art ${className}`}
      src={src}
      referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.hidden = true; }}
      alt=""
      width="1254"
      height="1254"
      decoding="async"
    />
  );
}
