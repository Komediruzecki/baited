import React from 'react';

// This is an art catalogue, never a round selector. Only render a target received
// from the viewer response, or a public result after the server has settled it.
export const proofWords = ['banana', 'penguin', 'microwave', 'dragon', 'volcano', 'monocle',
  'pizza', 'robot', 'rocket', 'pirate', 'cactus', 'jellyfish',
  'telescope', 'saxophone', 'octopus', 'boomerang', 'narwhal', 'parachute'] as const;
export type ProofWord = typeof proofWords[number];
const available = new Set<string>(proofWords);

export function CardArt({ word, className = '' }: { word?: string; className?: string }) {
  if (!word || !available.has(word.toLowerCase())) return null;
  return <img className={`bait-card-art ${className}`} src={`/cards/proofs/${word.toLowerCase()}.png`}
    alt="" width="1254" height="1254" decoding="async" />;
}
