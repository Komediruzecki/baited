# BAITED identity preview — 26 October 2026

> Historical design and verification record from private upstream revision `87bfc5d96bd63c39b30d39c8d7d245bd7252b578`. The maintained landing now lives in `Komediruzecki/baited/packages/landing`; see [the package README](../README.md) for current commands and deployment status. Prior verification and release statements below refer to the recorded source revision, not this migration.


## Direction and source

The owner supplied a tall, black, angular BAITED wordmark and requested a few AI-generated variants with a hook incorporated into a letter, paired with three small playing cards. The lettering brief, prompts, composition and motion specification were written first; the implementation was then checked against them.

The six-letter silhouette, uneven tops, cut counters and tight spacing carry the identity. B, with a short hook in the T, was approved for development, then superseded by the owner's 26 October decision: use the supplied original image, without an added hook, and retain the three-card fan. The original JPEG is now tracked unchanged; its SVG display mask supplies the page's existing ink color. A/B/C remain saved explorations, not the default or final vector masters.

## Composition

The wordmark occupies the upper left above the headline. Three small charcoal backs tuck behind the D, with restrained lavender BAITED lettering and a thin inset frame. The front card reveals the existing VOLCANO illustration on interaction. Purple stays the page's main color and pale yellow identifies the wordmark. The hero film, bomb artwork and 18 approved card illustrations stay as supplied.

The lockup has a fixed hit area and no idle loop. Header height ranges from 32–40px on phones to 112px on wide screens. Its three cards are decorative and do not create extra keyboard stops. The home anchor remains a normal link. The former card peeking from behind the hero film is removed, and the main CTA deals straight into hint practice.

## Motion

- Rest angles: −15°, −2° and 11°, pivoting around the bottom center.
- Open angles: −6°, 8° and 20°, with small horizontal offsets.
- The fan opens over 440ms, staggered by 40/70/100ms, using `cubic-bezier(.16,1,.3,1)`.
- The third card turns over 420ms after a 120ms delay; closing takes 280ms.
- Hover and visible keyboard focus open the hand. Touch/pen release opens it for 1.4 seconds, renewed by another release; cancellation, page hiding or Escape clears that timed state.
- Reduced motion removes transitions and keeps the fan at rest. The face changes instantly. Forced colors hides the hand and renders the mark in the system text color.

There is no audio, pointer-following tilt, new animation dependency or continuous animation on the logo.

## Review and release boundary

`/lab/brand/` contains all three proofs at header and small sizes. The variant query is limited to localhost and the exact development hostname. Production serves the default wordmark and rejects lab paths. B reached development in revision `4eb90bfa`; this original-logo restoration and footer polish are a subsequent feature-branch change for local review. No new deployment or production release is part of this change.

Browser verification covers responsive geometry from 320 to 3440 pixels, real mouse/keyboard interaction, synthetic touch timing, reduced motion, forced colors, image failure and disabled JavaScript. Synthetic touch is not a physical iPhone/Safari acceptance test. Approval of the lettering and card feel remains the owner's decision.
