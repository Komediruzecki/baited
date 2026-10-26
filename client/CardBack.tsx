import React from 'react';

// The same face-down card sits on the desk and turns over on a catch.
export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <img src="/brand/bait-bomb.png" alt="" width="88" height="102" />
      <span className="baited-glyph" />
    </div>
  );
}
