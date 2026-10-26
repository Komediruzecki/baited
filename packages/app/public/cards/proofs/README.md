# BAIT card illustration proofs

Six approved original illustration proofs generated on October 25, 2026 with the built-in ChatGPT `image_gen` tool: banana, penguin, microwave, dragon, volcano and monocle.

The approved bomb emblem in `concepts/bait-bomb/assets/bait-bomb-logo.png` supplied the visual reference. The prompts used its stepped pixel contours, dark aubergine outlines, cream highlights and orange accents. Each subject was generated separately. These files contain no card frame, title, clue text or logo; the app supplies those elements.

## Files and provenance

- Each PNG is 1254 × 1254 with an RGBA channel and transparent background.
- `manifest.json` records the exact prompt, generation identifier, dimensions, byte count and SHA-256 hash for each file.
- The six originals total 4,875,988 bytes. No crop, retouch, resize or format conversion was applied.
- Original tool output, generation records and matching copies are retained in the task's registered `deliverables/card-proofs` folder. Public metadata omits local filesystem paths.
- These are review proofs, not a claim that the full 72-word collection is illustrated.

Keep the active target's illustration in the viewer room. Do not preload it in the broadcaster studio or OBS overlay before the reveal. Use `object-fit: contain` so the dragon's fire, volcano plume and monocle chain stay visible.

The images were generated for this BAIT project. The existing source repository's license is not a separate third-party stock-image license or a statement about exclusive rights in generated output.

## Approved expansion

The owner approved the original six and requested more cards. Twelve additional illustrations use the same bomb-derived pixel style: pizza, robot, rocket, pirate, cactus, jellyfish, telescope, saxophone, octopus, boomerang, narwhal and parachute. The separate expansion manifests record their exact prompts, hashes and generation IDs. Original six files remain unchanged. That expansion brought the illustrated deck to 18.

## 60-card expansion

The next batch adds illustrations for the 54 remaining original targets and six new targets: mushroom, ghost, donut, hedgehog, gramophone and hourglass. The catalogue now has 78 illustrated, playable targets. The new files use approved existing illustrations as style references. Each was generated separately with the built-in ChatGPT image tool; titles, clue restrictions, questions and card furniture remain live interface elements rather than pixels in the artwork.

`expansion-60-a.json` and `expansion-60-b.json` retain the exact prompts, style references, generation identifiers, measured dimensions, bytes and original SHA-256 hashes. Visual review is recorded separately from the owner's selection. All 18 earlier originals are preserved. No production release is implied by these source assets.

The landing and native Extension keep unchanged copies so each package can deploy independently. From the workspace root, run `node packages/app/scripts/sync-card-art.mjs` to add missing recorded copies, or append `--check` to verify them without writing. The script refuses incomplete manifests, changed originals and conflicting existing copies.

A new Twitch Hosted Test ZIP must be built and uploaded before the native installed panel receives these images or the revised clue styling. A landing deployment alone does not update an installed Twitch Extension.
