---
target: baited app and Twitch Extension redesign at 77fd847
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 6
timestamp: 2026-10-26T03-53-45Z
slug: client-main-tsx
---
Method: dual-agent (A: isolated Opus CLI on irch, parent-owned retry · B: /root/product_browser_evidence)

# baited product critique and implemented response

The reviewed baseline is 77fd847. Opus completed an independent inspect-only pass with requested Max effort and a 45-minute budget. Assessment B inspected local browser states independently, before receiving Opus findings. After fixes, B checked the source and ran the single final detector pass. This report does not imply a second Opus approval of the final implementation.

## Design specificity and overall impression

The native card and restrained OBS placement already carried the landing identity. The Studio's decorative corner card, excess labels and stretched empty stage weakened that identity. The strongest improvement was to make one fixed card position the center of play: back to the streamer, face to chat, reveal after the decision. The approved B wordmark, bomb and existing artwork remain the visual authority.

## Pre-fix design health: 27/40

| Heuristic | Opus score / 4 |
| --- | --- |
| Visibility of system status | 3 |
| Match with the real world | 3 |
| User control | 3 |
| Consistency | 2 |
| Error prevention | 3 |
| Recognition over recall | 3 |
| Flexibility and efficiency | 2 |
| Aesthetic and minimal design | 2 |
| Error recovery | 3 |
| Help | 3 |

These are baseline scores, not a rescore of the fixed version. All ten heuristics apply to these Operate surfaces.

## Priority issues and response

1. **P1, privacy:** skipped, ended and rejected words could enter the OBS HUD. The API now strips these current words and every historical word; the HUD independently refuses unauthorized outcomes. Regression tests cover all six outcomes.
2. **P1, truthful decision:** rejecting a catch ends the round. Copy now explains both verdicts and a fresh word on the next round. Game rules were preserved.
3. **P1, composition:** the round stretched to the microphone column. It now has a fixed 190 × 266 card slot, top-aligned copy and its own height. Columns stack at 1000 px.
4. **P1, generic card:** non-illustrated words looked unfinished. They now have an intentionally centered type face and restrained violet glow, with no unrelated placeholder art.
5. **P1, phone action:** the full result card pushed verdicts below the fold. A compact word heading replaces it on phones; both decisions end above y577 at 320 × 640.
6. **P1, broadcast legibility:** small state text and placeholder dashes made OBS unclear. Type is larger, pending copy is meaningful, and the checked mission HUD is 540 × 140.

P2 work unifies card stock, navigation, footer scores, state names and microphone/sound copy; keeps the same card mounted through confirmation; manages review focus; moves the native rule inside the card; fits four clues within the native panel; and removes misleading connection instructions. The follow-up source review caught two implementation regressions, both repaired: Reverse win disappearing in idle, and the compressed mission strip hiding its terminal state label.

## Cognitive load and emotional journey

The essential task is one binary decision. Repeated state names, duplicate statistics and an unreachable phone action made it feel heavier. The revised round desk puts the word and verdict together, keeps the microphone status nearby and makes the reveal the one celebratory moment. The native viewer has one word, at most four clues and one clock. The OBS source supplies a short, readable payoff without showing an active secret.

## Strengths preserved

- Distinctive charcoal card stock, approved B mark and pixel artwork.
- Start/pause ahead of the card; explicit catch decisions and win reversal.
- A compact transparent OBS source with bounded reveal and reduced-motion behavior.

## Deterministic scan and browser evidence

The final detector reported 14 warnings: 13 approved Inter uses and one initially hidden, runtime-populated image. These are accepted cases, not unresolved design defects. Browser visualization overlays were not injected; no detector overlay is claimed. Independent browser observations supported the phone-action and native-instruction findings. Post-fix source assessment found no remaining confirmed defect within its bounded scope.

Local evidence proves layout and simulated transitions only. Browser capture sometimes returned stale compositor frames after emulation; the ledger identifies accepted screenshots and relies on measured geometry where capture was unreliable. Physical microphone accuracy, Twitch installation, OBS capture, touch behavior and assistive-technology acceptance remain separate.

## Persona red flags and remaining follow-ups

- A streamer on a phone must be able to judge a catch without scrolling; checked locally, still needs physical-phone acceptance.
- Viewers watching a scaled stream need readable status; real OBS/player capture remains the decisive check.
- Reject ends the round by design. Resuming after rejection would require a game-rule decision.
- The optional Space pause/resume shortcut remains deferred. It is not a defect in the existing controls.

## Minor observations

All 72 current native word labels fit the loaded font at 318 px. The artificial extreme-long-word fixture remains allowed to wrap. Text-selection suppression is an interaction preference, not a privacy boundary. Sound remains opt-in and the transcript remains explicitly gated.
