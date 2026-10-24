# Design and copy

## Local preview changes, 25 October 2026

The preview retains the supplied purple, yellow and charcoal direction. The teaching card now uses the supplied BAIT logo instead of a typed imitation. Original inline SVG drawings of the banana, penguin and microwave replace platform-dependent emoji. The mobile example stacks the card, conversation and result so it can be followed at narrow widths.

Russo One is bundled for short headings, target words and timers. Its angular shape fits the existing identity; it is not claimed to be the exact typeface in the supplied logo. The font comes from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/russoone) under the SIL Open Font License. Its license is bundled in `public/fonts/RussoOne-OFL.txt` and listed in `THIRD_PARTY_NOTICES.md`.

The studio uses a branded card back while the word is hidden and places readiness information near the start controls. Audio requires an explicit choice for each visit. The brief end-of-round speech settlement state has visible feedback in the studio, viewer room and overlay.

Design reference review used the Holo Cases and Cartridge Shelf examples in the local animated-lessons design package for object focus, responsive layout and consistent type and shape. No reference artwork or code was copied. The supplied logo still needs the entrant's rights confirmation before publication. Browser verification of these changes is recorded separately in [validation.md](validation.md).

The sections below describe the supplied design foundation.

## Direction

BAIT uses the visual cues of a Twitch workspace: charcoal surfaces, purple actions, a compact sidebar, clear connection status and readable chat-like content. The supplied redesign and icon references guided the direction. Their artwork and icons are not bundled. The project owner supplied the BAIT logo. Its original PNG is retained. The UI uses an imagegen background-extraction derivative with true alpha transparency; CSS crops the empty margins for a header wordmark and the first letter for a compact sidebar. An original SVG streamer illustration remains in the landing example.

The [Twitch homepage](https://www.twitch.tv/) and [official brand page](https://brand.twitch.com/) were reviewed on October 24, 2026. Inter and Inter Tight are bundled from Google Fonts under the SIL Open Font License; Twitch’s proprietary typeface and logos are not used.

## What the landing page needs to explain

“Make the streamer say banana.” gives visitors a concrete objective. The example then shows the word, a smoothie question, the response and a shared win. A stack of word cards sits beside a separate streamer screen and an illustrated Twitch-style chat. The headline’s banana is yellow. A replay button and three word choices let judges inspect the loop before connecting anything. The example is labeled as an illustration. The separate local demo is labeled as simulated chat and speech.

Humor comes from a familiar Twitch situation: chat is acting suspiciously normal. The studio uses direct labels such as Start round, Pause round and Wrong detection? Reverse win. Instructions describe what players actually do. Setup and privacy copy keep the service and storage details needed to make an informed choice.

## Material patterns

The interface uses official [Google Material icons](https://github.com/google/material-design-icons) under Apache 2.0. These are bundled SVGs, so icons do not depend on a font service. Material guidance informs filled and outlined actions, tonal surfaces, segmented difficulty selection, switches, visible focus, disabled states and touch controls. The UI uses custom React components; it does not claim complete Material 3 conformance.

Primary references: [Material interaction](https://m3.material.io/foundations/interaction), [Material color](https://m3.material.io/styles/color/overview), [Material Web buttons](https://github.com/material-components/material-web/blob/main/docs/components/button.md), and [Google’s icon documentation](https://developers.google.com/fonts/docs/material_symbols).

## Visual rules

- Background: #0e0e10; panels: #18181b and #1f1f23. Filled actions use #772ce8 with white text; purple accents use #bf94ff.
- Green marks a win or a working connection. Amber marks a pause. Errors have text and an icon as well as color.
- Main buttons are at least 48 pixels high. Compact icon buttons grow on coarse pointers. Keyboard focus is visible and native dialogs contain focus.
- Motion explains a short sequence or celebrates a win. The page respects reduced-motion preferences; replay is optional.
- The studio and OBS receive no active word or forbidden-clue list. Only the viewer page shows them before the reveal.

## Card and broadcast frames

The newer Twitch reference supplied by the owner guided square corners, a clipped lower-right edge and a solid purple shadow extending down and right. The OBS clock, mission progress and score now share one frame. Its document remains transparent outside the frame; the active word and forbidden clues never appear in its response. Amber marks a pause and green marks a win. The logo remains BAIT’s supplied artwork.

The same hard shadow and square card face appear on the studio round, viewer target and landing teaching cards. Mission progress uses three small rectangular cards. The [official UNO mobile site](https://www.letsplayuno.com/) informed the bold card hierarchy and short teaching sequence. No UNO cards, logo, sounds or rule text are bundled.

The [Hasbro instruction library](https://instructions.hasbro.com/worldwide) was reviewed as a reference for a short rulebook structure. The main screen teaches three actions, while a native disclosure holds optional rules. The [quick rules](quick-rules.md) put goal, setup, play and outcomes on one page. These are BAIT’s rules and design choices, with no claim of publisher approval.

These are implementation choices, not an accessibility certification. Browser checks and remaining live integration checks are recorded in [validation.md](validation.md).
