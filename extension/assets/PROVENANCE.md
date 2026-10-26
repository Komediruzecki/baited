# Extension display assets

`bait-bomb.png` is a deterministic 160 × 157 display derivative of the approved `concepts/bait-bomb/assets/bait-bomb-logo.png`. It was resized with the installed ImageMagick tool using point filtering, preserved aspect ratio and stripped metadata. The original master remains unchanged. This is not the planned replacement baited logo.

`inter-latin.woff2` and `russo-one.ttf` are copied from the existing project's `public/fonts`. Their corresponding license files are included here. These are served locally with the Extension package; no external font service is used.

## Approved BAITED identity and card art, 2026-10-26

`baited-wordmark-b.png` is a byte-identical copy of the owner-approved B master at `/home/maff/foss/worktrees/disjoint-colliders/bait-dev-landing/packages/bait/site/assets/brand/baited-wordmark.png`. SHA-256: `582e724d1a5d9b9b69e2b7105c3905ebf9cf6e71262afa4015be8ffbff79efd7`. The app copy at `public/brand/baited-wordmark-b.png` is identical. CSS uses the existing alpha channel and the landing's mask framing; no pixels were regenerated or resized in this pass.

The eighteen `card-*.png` files are byte-identical copies of the corresponding approved illustrations in `public/cards/proofs/`: banana, penguin, microwave, dragon, volcano, monocle, pizza, robot, rocket, pirate, cactus, jellyfish, telescope, saxophone, octopus, boomerang, narwhal and parachute. They were originally generated through ChatGPT image generation for this project and approved by the owner. The source images remain unchanged.

`extension/presentation.js` lists the exact supported artwork names. Unknown words receive no art. The viewer removes the image source when authorization or role changes because the filename itself can reveal the word. The packaged illustrations are a public artwork set; the active word is selected and authorized by the server.
