# Baited product surfaces

## Scope and mode

The standalone streamer studio and setup flow are Operate surfaces. Streamers use them beside Twitch and OBS, often on a dim second monitor. The current landing reference is packages/landing in the private Komediruzecki/baited repository. Its production and development domains are baited.maff.app and dev.baited.maff.app. The latest branding direction uses the owner's plain original BAITED wordmark; earlier hook variants and bomb artwork remain preserved but are not the current design authority.

On 27 October 2026 the owner asked for one project: the landing's selected card on every surface, and the landing's shell around the studio. The landing now ships Cut Open with the Glass finish and the Prism back, and the owner asked every plain card to follow it. `extension/card.css` draws that card for the app and the Extension, `cut-card.css` sizes it in the app's hosts, `landing-shell.css` carries the landing's violet ground, floating paper nav and violet buttons. The same day the owner asked for Material 3 containers and controls in the studio, fun like Duolingo wherever the landing has no equivalent; `studio-m3.css` loads last and holds them. The rules below otherwise record the existing functional and layout baseline.

## Direction contract

- **Thesis:** a round desk, with the current round and its controls on the left and microphone feedback on the right. Remove the oversized dashboard sidebar and decorative microphone orbit.
- **World:** the landing's violet ground, deepened toward `#150a30` for a dim monitor; charcoal panels; the landing's paper nav with the BAITED chip; `#7721e5` actions; Cut Open card faces and Prism backs; `#fffc79` for final seconds; off-white text. Studio containers and controls take Material 3 shapes (28 px cards, 16 px buttons, real switches and segmented buttons) and stand on a 4 px Duolingo lip that presses down; OBS boxes are square with Twitch's extrusion. No glowing panels.
- **Story:** connect the channel, check the mic, start the round, judge catches. The word stays hidden except for the explicit demo-only test reveal. A live Twitch room stays hidden even on localhost.
- **First viewport:** compact brand/navigation/account masthead; fixed card position beside round controls; separate microphone column with optional transcript below it. Scores sit in the round footer. Share links and recent rounds follow the round column.
- **Form:** extend the user-approved landing identity into functional product controls. Opus's 26 October review makes the card the common object: back to the streamer, face to chat, confirmed reveal on OBS. Codex implemented the review; that does not constitute final approval by Opus or the owner.

## Type and controls

Inter carries labels, inputs, navigation and explanatory text. The plain original BAITED artwork is the wordmark source; Russo One is reserved for round headings, revealed words and the timer. Buttons use consistent 44px minimum targets, visible focus, clear disabled states and a modest 160ms state transition. Settings use a native dialog and return keyboard focus to the opener when closed. No idle decorative animation or sound autoplay.

## State and privacy rules

- Preserve disconnected, model-loading, microphone-off, armed, listening, paused, settling, review, win and escape states.
- Start/resume readiness and microphone lease rules are unchanged.
- Moonshine transcript stays opt-in, right-hand-side on desktop, bounded in tab memory and available only under the existing local/demo gate.
- The demo target reveal is explicit. The separately opted-in local Moonshine transcript diagnostic remains available when testing Twitch connections.
- Setup exposes viewer and overlay links with their different information boundaries. The OBS source never receives the active target.
- Errors and confirmations must name the action and its consequence. Preserve all existing recovery controls.

## Responsive behavior

The masthead becomes two rows on phones; a live connection status gets its own line below the header controls. Navigation remains labeled. The studio stacks at 1000 px so the card cannot squeeze the decision copy. At 320 × 640, review uses a compact word heading instead of the full card, and both verdict actions stay in the first viewport. The settings control becomes a labelled icon. Setup rows collapse, privacy actions sit below their text and long URLs remain inside inputs. Word length classes prevent accidental mid-word splits in the current deck. Reduced-motion suppresses card dealing and turning.

## Card behavior

Studio review uses a 190 × 266 px Cut Open result card beside the confirm/reject decision on desktop; a win that lands on a streak badge names the badge beside it. Streaks are fire throughout: flame counter, fire coins and badge medallions (`streak.css`). One result ID retains one card through confirmation; the verdict stamps in without a second flip. Reject ends the round, with a new word on the next round. Reverse win stays available through idle until the next round starts. Review takes focus only from the page or a disappearing round control, never from an input or dialog. The active secret stays hidden. The built-in deck now has 100 playable targets; the earlier 78 illustrations remain approved, while the latest 22 cards and artwork await owner review. Illustrated cards resolve from pixels the first time they are shown. A word without art keeps the field at its 80 px minimum and centres its lines below it. Off-limits clues use readable text without a strike-through. A native card deals once per new round over 280 ms, with no urgency pulse.

OBS uses a 540 px HUD on a transparent canvas, about 140 px tall without a mission. Only confirmed catches and escapes receive a large result card below it, the landing's card at its own 300 × 420 px. It deals in, turns, holds and leaves within 5.5 seconds. A new streamer's pick plays a six-second BAITED BY @name sting in the same place, name only. Reconnecting does not restart the whole reveal. Pending, rejected, skipped and ended results expose neither the word nor its illustration URL; the server also strips every historical word from the overlay response. Reduced-motion shows a stationary card for the same bounded interval.

## Cards workbench

Cards is an authoring surface inside the existing Studio shell. An explicit **Open card library** gate warns that words will be visible. My packs and Built-in deck stay separate; the next-round summary shows the chosen difficulty, mode and eligible count. Draft and Playable describe channel use, without suggesting public publication.

The editor starts with one card. Target, difficulty and the matching number of off-limits inputs sit beside a real Cut Open preview, up to 320 px wide. Accepted spellings live in a disclosure below the main fields. The preview can show Live, Urgent, Paused, Waiting and Result states, using the shared Glass finish, Prism back, readable clue row and pixel reveal. It reuses existing artwork for known targets and uses the type-led fallback for new words. It does not invent a second card layout.

The form uses the Studio's Material 3 containers, Inter labels, 48 px inputs and existing pressable buttons. A sticky save row keeps Saved and Unsaved changes close to the action; it must never claim a successful save before persistence. Inline field errors and their summary name the problem. Conflict recovery preserves local edits and offers a new copy or the saved version. Archive has a confirmation; Restore draft reopens the same pack. Leaving unsaved work requires an explicit choice.

On wide screens, the form and preview/rehearsal column sit side by side. They stack below 800 px; below 600 px the preview and pronunciation test form a single column. Off-limits inputs become one column on phones. Card tabs scroll within their row; the page itself must not overflow horizontally. These are implemented responsive rules, with physical-device acceptance still separate.

**Try saying it** is a separate, opt-in Moonshine capture with no scoring or OBS path. It is unavailable during a live or pending round and while Studio's game microphone is enabled. Changing the target, hiding the tab or leaving the editor stops capture and clears its text. It must not be confused with the microphone that listens during a real round. The [card maker guide](../docs/card-maker.md) records the limits and privacy boundary.

## Validation boundary

Browser screenshots and simulated game states prove layout and controls only. Version 0.0.1 is in Twitch Hosted Test with the test backend at play-baited.maff.app. The owner reported successful rounds with Paolo, live chat and Moonshine, and confirmed the OBS score display after a source refresh. These reports describe that session; availability, actual capture and device acceptance still need their corresponding checks. Earlier Opus critiques inspected their then-current implementation and evidence. The new specification, source review, local checks and the owner's visual acceptance remain separate steps.
