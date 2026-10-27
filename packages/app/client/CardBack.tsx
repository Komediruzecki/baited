import React from 'react';

// The same face-down card sits on the desk and turns over on a catch.
export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <span className="baited-glyph" />
    </div>
  );
}
