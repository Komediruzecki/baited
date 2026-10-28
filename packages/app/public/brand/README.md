# Brand assets

## Logo

The interface draws the landing's pixel BAITED wordmark. `baited-pixel-white.svg` is a byte-identical copy of `packages/landing/site/assets/brand/baited-pixel-white.svg`, tinted through a CSS mask (`.baited-glyph` in `client/product-brand.css`) in the Studio header, the sign-in page, the viewer room, the OBS HUD, the card labs and on every card back. `tests/card-parity.test.ts` checks the bytes, so a new landing logo fails there until this copy follows.

## Earlier artwork

Nothing draws these any more; they stay as the record. `baited-original-mask.svg` is the owner's supplied angular BAITED lettering, used before the pixel wordmark. `bait-bomb.png` and `baited-wordmark-b.png` are earlier artwork too.

The project owner supplied `baitlogo.png` on October 24, 2026. That original file is retained unchanged. Original SHA-256: `ac882ab12279d5b132aab3fae4f3fd480938207efb90e94692ed9eea62370ff2`.

`baitlogo-transparent.png` is a 1254 × 1254 RGBA derivative made with an AI image tool for background extraction. Its outer canvas has alpha 0; the black symbol strip and white characters are retained. The original is preserved separately because generation does not promise pixel-identical reproduction.

Transparent derivative SHA-256: `66029cbf7dbd05034886750d37b5c76029da03be1f6f97618ea1abae86455b88`.

Final edit prompt:

> Precisely extract this existing flat logo onto a transparent background. Preserve its design and layout: angular lowercase bait in solid flat purple #9146ff, with the existing black rectangle and white &$!#% symbols below. Remove the white canvas and white holes inside b and a; keep the white symbols INSIDE the black rectangle. Crisp clean edges with no stray pixels, no colored fringe, no gradient, no lighting, no texture, no glow. Actual alpha transparency. Do not redraw, restyle or add anything. Keep the same square composition and proportions.

The logo is user-supplied artwork, separate from the original code, illustration and sound covered by this project’s MIT license. No claim about the supplied logo’s authorship or license is made here.

## Streak flames

`streak-flame.svg`, `streak-twin.svg`, `streak-blaze.svg` and `streak-flame-violet.svg` are original pixel flames for chat's win-streak badges, identical to the Extension copies. Their provenance is recorded in `extension/assets/PROVENANCE.md`.

## Favicon

`baited-favicon.png` and `baited-favicon.svg` are unmodified copies of the landing's favicon, `packages/landing/site/assets/brand/baited-favicon.{png,svg}`: the pixel logo's B in `#160033` on the violet `#7721e5`. `index.html` (Studio, the viewer room, the OBS overlay and the card labs) links both, like the landing, so a browser tab carries the same B as the website. `card-lab.html` is published on the landing's dev site and links the landing's own copies. PNG SHA-256: `6aae09f82291b0c4af05df2f0fd14de8b76e6111490add422604202c5c9860be`.
