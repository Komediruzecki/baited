import React from 'react';

// The same face-down card sits on the desk and turns over on a catch: the landing's
// Prism back (extension/card.css). Its holder sets the size.
export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <div className="prism-back">
        <span className="prism-back__mark baited-glyph" />
      </div>
    </div>
  );
}
