import React, { useId } from 'react';
import type { ClueTreatmentId } from './card-clue-catalogue';

/** Printed rules, never controls. The caller supplies the exact playable clues. */
export function ClueRow({ clues, treatment, labels }: { clues: readonly string[]; treatment: ClueTreatmentId; labels?: { keepOutOfChat: string; onlyThisWord: string } }) {
  const labelId = useId();
  if (!clues.length) return <p className="cl-card__easy">{labels?.onlyThisWord ?? 'Only this word is off limits.'}</p>;
  if (treatment === 'quiet' && !labels) return <p className="cl-card__rule">Keep {clues.map((clue, index) => <React.Fragment key={clue}>
    {index > 0 && (index === clues.length - 1 ? ' and ' : ', ')}<span className="cl-card__term" data-clue-word>{clue.toLowerCase()}</span>
  </React.Fragment>)} out of chat.</p>;
  return <div className="cl-card__restrictions">
    <p className="cl-card__clue-label" id={labelId}>{labels?.keepOutOfChat ?? 'Keep out of chat'}</p>
    <ul className="cl-card__clues" data-count={clues.length} aria-labelledby={labelId}>{clues.map(clue => <li key={clue}><span data-clue-word>{clue.toLowerCase()}</span></li>)}</ul>
  </div>;
}
