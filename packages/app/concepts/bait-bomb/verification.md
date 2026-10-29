# Local study verification

Checked on 25 October 2026. This is a scripted design study, not evidence of a live Twitch or speech integration.

Desktop and 390-pixel mobile views were inspected in the in-app browser. Verified: play reaches the final shared win, pause/resume, replay, manual beats, keyboard stepping, card selection, the long MICROWAVE example, and the expandable transcript. Document width matched the viewport on mobile; the card hand scrolls within its own rail.

With reduced motion emulated, keyboard stepping updated the still scene and its caption. With JavaScript disabled, the static example and no-script explanation remained readable and controls were disabled or hidden. Browser automation could not expand the transcript while scripting was disabled; its native details behavior is not claimed as tested in that condition. All emulation settings were restored.

One preview tab crashed during testing; a fresh tab completed playback and interaction checks. No application console errors were captured during the successful pass. The cause of that isolated tab crash was not established.

A separate reviewer inspected source, desktop/mobile renders, PRODUCT.md, DESIGN.md and the composition references. No remaining material blocker was found for this local mockup. Core text contrast was measured from 5.2:1 to 13.9:1.

The design-lint detector ran once. Its border warning combined the speech bubble's triangular tail with a separate card's two-pixel corner radius; it did not identify a thick accent border on a rounded card. Its Inter warning is accepted for body text: Russo One carries the display type and card identity.

JavaScript syntax and whitespace checks passed. The timeline also passed a focused mocked-DOM check covering pause position, replay, card changes, background pause and reduced motion. The local server's malformed URL handling was repaired and verified: it returns 400 and keeps serving subsequent requests. Unexpected hosts, methods and unlisted paths are rejected; an occupied port fails without choosing another one.

The working game, original source and production configuration were not replaced. No deployment, real microphone session or OBS recording was performed by this study.
