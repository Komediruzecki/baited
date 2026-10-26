# Assets and source

[`Komediruzecki/baited/packages/landing`](https://github.com/Komediruzecki/baited/tree/feat/baited-workspace/packages/landing) is the canonical runtime landing, including every asset it serves. It was imported from `disjoint-colliders/packages/bait` at [`87bfc5d96bd63c39b30d39c8d7d245bd7252b578`](https://github.com/Komediruzecki/disjoint-colliders/tree/87bfc5d96bd63c39b30d39c8d7d245bd7252b578/packages/bait). [IMPORT-MANIFEST.json](IMPORT-MANIFEST.json) records the original file hashes and Git blobs; approved artwork, fonts and videos are preserved byte-for-byte by this migration. Hostname allowlists, redirects and HTML canonical metadata were subsequently updated for `baited.maff.app` and `dev.baited.maff.app`; their integration hashes are recorded separately.

The original landing grew from [`packages/app/concepts/bait-v2`](../app/concepts/bait-v2), introduced in the game repository at `d8732aa` (“Add Opus-led BAIT v2 local mockup and hero film”). That concept directory now preserves design and renderer history; do not synchronize it over this package. Raw HyperFrames sources remain in the private game package. The finished hero films, posters, chapter frames, captions and the island image are tracked here.

The upstream repository's MIT license is preserved verbatim in [LICENSE.disjoint-colliders](LICENSE.disjoint-colliders), including its copyright notice. Specific font licenses and the artwork provenance below remain separate; the imported repository license is not a new license grant for every referenced or generated asset.

## Cards and identity

The default wordmark is the owner's original `1000063284.jpg`, preserved byte-for-byte as `site/assets/brand/baited-original.jpg`. The SVG display mask embeds those same JPEG bytes and converts their luminance to alpha for the existing yellow/lavender ink. It does not redraw or replace the letters. Regenerate the mask with `node packages/landing/scripts/build-original-wordmark.mjs` from the baited workspace root.

The earlier A/B/C proofs were generated with built-in ChatGPT image generation following Opus's direction. B (hook in the T) was previously approved for development; the owner chose the supplied original on 26 October 2026. A is a plain redraw and C puts the hook inside the D. All three PNGs remain unchanged at `site/lab/brand/`, which the Worker excludes from production serving. The old B asset at `site/assets/brand/baited-wordmark.png` is also preserved for compatibility and later use.

`site/brand-masks.css` supplies the display framing; CSS provides yellow or lavender ink. Hashes, dimensions and provenance are in [design/brand-assets.json](design/brand-assets.json), with the generated variants' prompts in [design/brand-prompts.md](design/brand-prompts.md). The three header card backs are CSS surfaces, and the face reuses the approved volcano illustration. No new font or animation library was added.

`site/cards/proofs/` contains the 18 owner-approved illustrations generated with built-in ChatGPT image generation: banana, penguin, microwave, dragon, volcano, monocle, pizza, robot, rocket, pirate, cactus, jellyfish, telescope, saxophone, octopus, boomerang, narwhal and parachute. The 1254 × 1254 PNGs are unchanged copies of the game package's [`public/cards/proofs/`](../app/public/cards/proofs) files. Prompts, generation references and hashes remain in those manifests.

`site/assets/bait-bomb-logo.png` is the transparent candidate regenerated with built-in ChatGPT image generation from the owner's supplied bomb screenshot. The original reference and generation record remain with the game package. This is the owner-authorized development candidate, not a claim about final artwork clearance.

Navigation symbols are custom inline SVGs from the approved mockup. The footer credit now uses the same Inter type as its navigation. The original Irchiinnuss assets remain preserved for future use:

- `site/assets/irchiinnuss-wordmark.svg`: originally `disjoint-colliders/packages/brand/wordmarks/irchiinnuss-wordmark.svg`; the copied SVG is self-contained.
- `site/assets/irchiinnuss-mark.svg`: preserved from the previous landing package, currently unused by v2.

## Staged hero film

`site/media/hero-desktop.*` and `hero-phone.*` are the 32-second rendered v2 film at 30 fps, delivered as H.264/AAC MP4 and AV1/Opus WebM. The desktop delivery is 1280 × 720; phone is independently arranged at 720 × 800. Posters and seven chapter frames per layout are AVIF. English captions are in `site/media/captions.vtt`.

The film depicts fictional streamer mossbyte and an original island-builder scene, not a real Twitch recording. It uses the approved bomb and volcano artwork plus original ChatGPT-generated character/effect sheets and island art. The referenced page image is `site/film/art/little-isle.png`. Other film working assets are not copied into the public package.

The soundtrack uses the project's existing Sound Lab deal and catch recipes. It has no generated speech or recorded room audio. Sound is off until the visitor chooses it. Renderer source, detailed art provenance, license notices, render settings and hash/decode receipts remain in [`packages/app/concepts/bait-v2/film/`](../app/concepts/bait-v2/film) and [`packages/app/concepts/bait-v2/media/render-status.json`](../app/concepts/bait-v2/media/render-status.json).

## Fonts

The display face is Russo One, chosen to echo the BAIT mark's angular shapes. Inter supplies body text. Both bundled files are preserved unchanged:

- `site/assets/russo-one.ttf`: [SIL Open Font License](site/licenses/RussoOne-OFL.txt).
- `site/assets/inter-latin.woff2`: [SIL Open Font License](site/licenses/Inter-OFL.txt).

There are no runtime third-party scripts, remote fonts or provider keys. GSAP was used in the private film-rendering source; the public site plays the resulting video without bundling GSAP.
