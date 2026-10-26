# Assets and source

[`Komediruzecki/baited/packages/landing`](https://github.com/Komediruzecki/baited/tree/feat/baited-workspace/packages/landing) is the canonical runtime landing, including every asset it serves. It was imported from `disjoint-colliders/packages/bait` at [`87bfc5d96bd63c39b30d39c8d7d245bd7252b578`](https://github.com/Komediruzecki/disjoint-colliders/tree/87bfc5d96bd63c39b30d39c8d7d245bd7252b578/packages/bait). [IMPORT-MANIFEST.json](IMPORT-MANIFEST.json) records the original file hashes and Git blobs; approved artwork, fonts and videos are preserved byte-for-byte by this migration. The hero film was later rendered again without yellow; see “Staged hero film”. Hostname allowlists, redirects and HTML canonical metadata were subsequently updated for `baited.maff.app` and `dev.baited.maff.app`; their integration hashes are recorded separately.

The original landing grew from [`packages/app/concepts/bait-v2`](../app/concepts/bait-v2), introduced in the game repository at `d8732aa` (“Add Opus-led BAIT v2 local mockup and hero film”). That concept directory now preserves design and renderer history; do not synchronize it over this package. Raw HyperFrames sources remain in the private game package. The finished hero films, posters, chapter frames, captions and the island image are tracked here.

The upstream repository's MIT license is preserved verbatim in [LICENSE.disjoint-colliders](LICENSE.disjoint-colliders), including its copyright notice. Specific font licenses and the artwork provenance below remain separate; the imported repository license is not a new license grant for every referenced or generated asset.

## Cards and identity

The logo is the owner's BAITED wordmark. The owner supplied it on 26 October 2026 as a charcoal 1186 × 348 transparent PNG (SHA-256 `17826368…cefe8`), and later that day asked for the white version instead, supplied as a 354 × 104 PNG in flat `#e2dbec` (SHA-256 `a89a9406…9f632`). The two outlines match (97% overlap at 354 × 104), so the white files below keep the charcoal file's full-size alpha, trimmed of its transparent edge (1182 × 348), and take the white version's color. Letter interiors, which were 252–254 alpha, are fully opaque. When the navigation became a white bar, the owner asked for the logo there in black.

- `site/assets/brand/baited-logo-black.webp` (764 × 225, lossless WebP, SHA-256 `7361d5f0…b42d5`): the logo in the navigation. It has the white file's alpha in the page's ink `#17131e`.
- `site/assets/brand/baited-logo-white.webp` (764 × 225, lossless WebP): the logo on the Terms and Privacy pages.
- `site/assets/brand/baited-logo-violet-large.webp` (1182 × 348, lossless WebP, SHA-256 `bf710431…15a34`): the giant logo at the bottom of the white footer. It has the same alpha in the footer's violet `#7721e5`.
- `site/assets/brand/baited-logo.webp` (764 × 225, lossy WebP, quality 88): the charcoal logo, kept for light backgrounds. The page does not use it.

The header's logo with its fan of card backs was removed when the logo moved into the navigation. Its styles and the masks below stay for the development-only brand lab (`site/lab/brand/`).

The default wordmark is the owner's original `1000063284.jpg`, preserved byte-for-byte as `site/assets/brand/baited-original.jpg`. The SVG display mask embeds those same JPEG bytes and converts their luminance to alpha for the existing yellow/lavender ink. It does not redraw or replace the letters. Regenerate the mask with `node packages/landing/scripts/build-original-wordmark.mjs` from the baited workspace root.

The earlier A/B/C proofs were generated with built-in ChatGPT image generation following Opus's direction. B (hook in the T) was previously approved for development; the owner chose the supplied original on 26 October 2026. A is a plain redraw and C puts the hook inside the D. All three PNGs remain unchanged at `site/lab/brand/`, which the Worker excludes from production serving. The old B asset at `site/assets/brand/baited-wordmark.png` is also preserved for compatibility and later use.

`site/brand-masks.css` supplies the display framing; CSS provides the ink color. Hashes, dimensions and provenance are in [design/brand-assets.json](design/brand-assets.json), with the generated variants' prompts in [design/brand-prompts.md](design/brand-prompts.md). No new font was added.

`site/cards/proofs/` contains the 18 owner-approved illustrations generated with built-in ChatGPT image generation: banana, penguin, microwave, dragon, volcano, monocle, pizza, robot, rocket, pirate, cactus, jellyfish, telescope, saxophone, octopus, boomerang, narwhal and parachute. The 1254 × 1254 PNGs are unchanged copies of the game package's [`public/cards/proofs/`](../app/public/cards/proofs) files. Prompts, generation references and hashes remain in those manifests.

`site/assets/bait-bomb-logo.png` is the transparent candidate regenerated with built-in ChatGPT image generation from the owner's supplied bomb screenshot. The original reference and generation record remain with the game package. This is the owner-authorized development candidate, not a claim about final artwork clearance. The page now uses it only as the favicon; the footer shows the BAITED logo instead.

Every interface icon is original pixel art drawn for this landing on a small grid (arrows, chat bubble, play, pause, sound and microphone), one SVG path per icon with square pixels. monochrome-studio.com was a reference for the pixel buttons, the pixel curtain and the floating navigation, and fortnite.com for the centred phone hero and the viewfinder corners around the film; no code, image or icon was copied from either. The footer credit now uses the same Inter type as its navigation. The original Irchiinnuss assets remain preserved for future use:

- `site/assets/irchiinnuss-wordmark.svg`: originally `disjoint-colliders/packages/brand/wordmarks/irchiinnuss-wordmark.svg`; the copied SVG is self-contained.
- `site/assets/irchiinnuss-mark.svg`: preserved from the previous landing package, currently unused by v2.

## Staged hero film

`site/media/hero-desktop.*` is the 32-second rendered v2 film at 30 fps, delivered as H.264/AAC MP4 and AV1/Opus WebM at 1280 × 720. Its poster and seven chapter frames are AVIF. English captions are in `site/media/captions.vtt`. At the owner's request phones play this same 16:9 film, with the chat on the right as on desktop. The phone arrangement (720 × 800) is no longer served by the landing and remains in the concept package's `media/`.

On 26 October 2026 the film was rendered again without yellow, at the owner's request. Only colors changed in `film.css` and `timeline.js`: the secret word VOLCANO now uses its card's orange `#ff743c` (the chat card, the split screen, the catch tag and box, the celebration and the pick), the face-down card labels are lilac `#c9a8ff`, the confetti is white and the bookend wordmark is `#e2dbec`. The render used HyperFrames 0.8.198 with Playwright's headless Chromium 1243 and FFmpeg 6.1.1 (the README's command, 30 fps, quality `looks`). The audio streams were copied unchanged from the previous delivery, and the timing is identical. The MP4 is H.264 High (libx264, veryfast, CRF 23) and the WebM is AV1 Main (SVT-AV1, preset 8, CRF 46). The poster (quality 40) and chapter frames (quality 62) are AVIF stills from the 1920 × 1080 master at the README's times.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `hero-desktop.mp4` | 2,127,382 | `7b80f8cb…eba2d` |
| `hero-desktop.webm` | 1,810,808 | `309ec15d…3eb99` |
| `poster-desktop.avif` | 40,588 | `84604fe8…32435` |
| `chapter-01.avif` | 80,049 | `a63be19a…b16bd` |
| `chapter-02.avif` | 26,016 | `c93222af…65a4e` |
| `chapter-03.avif` | 90,341 | `9dc149ac…274ff` |
| `chapter-04.avif` | 95,661 | `5553777a…8560c` |
| `chapter-05.avif` | 96,830 | `5b743fe7…3b1b4` |
| `chapter-06.avif` | 28,832 | `a1e7df12…f3592` |
| `chapter-07.avif` | 89,100 | `0564acb9…3446b` |

The film depicts fictional streamer mossbyte and an original island-builder scene, not a real Twitch recording. It uses the approved bomb and volcano artwork plus original ChatGPT-generated character/effect sheets and island art. The referenced page image is `site/film/art/little-isle.png`. The other film sheets stay in the concept package; only the small crops below are public.

The soundtrack uses the project's existing Sound Lab deal and catch recipes. It has no generated speech or recorded room audio. Sound is off until the visitor chooses it. Renderer source, detailed art provenance, license notices, render settings and hash/decode receipts remain in [`packages/app/concepts/bait-v2/film/`](../app/concepts/bait-v2/film) and [`packages/app/concepts/bait-v2/media/render-status.json`](../app/concepts/bait-v2/media/render-status.json).

## Step-card art

The pictures inside the “How it plays” cards reuse the film's original art, cropped and resized to WebP in `site/assets/why/`. The source files are unchanged.

- `little-isle.webp` (880 × 495): the whole `site/film/art/little-isle.png` (SHA-256 `3b2aed2d…e695c`), scaled down.
- `moss-talk.webp`, `moss-smug.webp`, `moss-shout.webp` (208 × 208): the talk, smug and shout cells of [`mossbyte-poses.png`](../app/concepts/bait-v2/film/art/mossbyte-poses.png) (SHA-256 `97b4b5c8…3f938`), registered with the film's per-pose offsets so the heads line up.
- `emote-grin.webp`, `emote-smirk.webp`, `emote-laugh.webp` (64 × 64) and `smoke.webp` (128 × 128): the three hook-bomb emotes and the smoke puff from [`effects-sheet.png`](../app/concepts/bait-v2/film/art/effects-sheet.png) (SHA-256 `83f1a929…45946`), trimmed to their alpha.

All three sheets are original ChatGPT image generations; their provenance is in [`art-provenance.json`](../app/concepts/bait-v2/film/art-provenance.json). The VOLCANO card in the first step reuses `site/cards/proofs/volcano.png` as the deck does, and the footer's round picture reuses `moss-shout.webp`.

## Fonts

The display face is Russo One, chosen to echo the BAIT mark's angular shapes. Inter supplies body text. Both bundled files are preserved unchanged:

- `site/assets/russo-one.ttf`: [SIL Open Font License](site/licenses/RussoOne-OFL.txt).
- `site/assets/inter-latin.woff2`: [SIL Open Font License](site/licenses/Inter-OFL.txt).

There are no remote scripts, remote fonts or provider keys. GSAP 3.15.0 (`gsap.min.js` and `ScrollTrigger.min.js`, unchanged from the npm package) is self-hosted in `site/vendor/gsap/` under GreenSock's [Standard “no charge” license](https://gsap.com/standard-license). GSAP was also used in the private film-rendering source.
