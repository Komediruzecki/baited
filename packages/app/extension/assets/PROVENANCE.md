# Extension display assets

`bait-bomb.png` is a deterministic 160 × 157 display derivative of the approved `concepts/bait-bomb/assets/bait-bomb-logo.png`. It was resized with the installed ImageMagick tool using point filtering, preserved aspect ratio and stripped metadata. The original master remains unchanged. This is the game's existing bomb artwork, separate from the BAITED wordmark.

`inter-latin.woff2` and `russo-one.ttf` are copied from the existing project's `public/fonts`. Their corresponding license files are included here. These are served locally with the Extension package; no external font service is used.

## Current BAITED identity, 2026-10-28

`baited-pixel-white.svg` is a byte-identical copy of the landing's pixel wordmark, `packages/landing/site/assets/brand/baited-pixel-white.svg`; `tests/card-parity.test.ts` checks the bytes. The panel's header, every card's signature and the Prism back's mark tint this one mask, as the Studio does with its copy in `public/brand/`. It is the only logo in the Extension ZIP.

`baited-original-mask.svg`, the owner's supplied angular BAITED lettering, is kept as earlier artwork, like the B exploration below. Nothing draws it, the ZIP no longer includes it, and the `assets/twitch/v0.0.1/` listing exports were made from it.

## Archived B exploration and current card art

`baited-wordmark-b.png` is retained as the earlier approved B exploration, superseded by the owner's original-logo decision. SHA-256: `582e724d1a5d9b9b69e2b7105c3905ebf9cf6e71262afa4015be8ffbff79efd7`. The app copy at `public/brand/baited-wordmark-b.png` is identical. Neither is the current displayed logo. The landing's A/B/C proofs remain preserved in `packages/landing/site/lab/brand/`.

The eighteen `card-*.png` files are byte-identical copies of the corresponding approved illustrations in `public/cards/proofs/`: banana, penguin, microwave, dragon, volcano, monocle, pizza, robot, rocket, pirate, cactus, jellyfish, telescope, saxophone, octopus, boomerang, narwhal and parachute. They were originally generated through ChatGPT image generation for this project and approved by the owner. The source images remain unchanged.

## Prism back, 2026-10-28

Every card is the landing's approved Cut Open card: a code-drawn face with the Glass finish and the Prism back. `back-prism.webp` is a byte-identical copy of the Card Lab texture `public/card-lab/backs/back-prism.webp` (SHA-256 `dc274f20475e99c4ad21720c0e5743cc870f4fedeb7cc23430a24dc7cf070ebc`), the same file the landing build copies to `/assets/card-deck/`. Its generation prompt, hashes, crop and encoder settings are recorded in `docs/card-surface-assets/`. It replaced the earlier Mosaic back (`back-mosaic.webp`), which the bundle no longer ships.

## Streak flames, 2026-10-27

`streak-flame.svg`, `streak-twin.svg`, `streak-blaze.svg` and `streak-flame-violet.svg` are original pixel flames for chat's win-streak badges. Each was generated from a hand-drawn silhouette (a 16 × 18 or 18 × 18 grid) with a one-pixel outline and heat layers in the volcano card's palette, written as crisp `<rect>` runs. The twin flame replaced the bomb artwork on the third badge. The copies in `public/brand/` are identical. Higher badge tiers reuse the volcano, dragon and rocket cards above; no new raster art was made.

`extension/presentation.js` lists the exact supported artwork names. Unknown words receive no art. The viewer removes the image source when authorization or role changes because the filename itself can reveal the word. The packaged illustrations are a public artwork set; the active word is selected and authorized by the server.
