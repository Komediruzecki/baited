# baited product design review

This work applies a design critique to the streamer studio, native Twitch viewer/configuration, standalone viewer and OBS source. The approved landing and B logo remain the visual authority. The game stays private; this pass does not deploy, upload the Extension, open a PR or tag production.

## Current status: 2026-10-26

A fresh inspect-only design review completed on 26 October, within a 45-minute deadline. The review ran for 21 minutes 37 seconds. It inspected the pre-fix implementation, landing references and curated browser evidence. Its recommendations were then implemented and the resulting screens checked. This is not final approval by the owner.

Review and evidence: `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-26/60dfe3fa2d544eb794006883802da269`. The complete critique is in that run's `deliverables/` folder and its receipt under `scratch/`. Post-fix source assessment and the one final design-detector pass are in `evidence/browser-after/`.

Implemented:

- Studio uses one 190 × 266 px card position beside top-aligned round copy, with microphone controls to the right. Share links and recent rounds follow the round column. It stacks at 1000 px. Underlined navigation, a compact masthead and footer statistics replace the redundant breadcrumb and metrics strip.
- Catch review has an accurate consequence: “No” ends this round; the next round gets a new word. On phones, a compact word heading replaces the full card and both decisions fit within 320 × 640. Review focus does not override an input or dialog. Reverse win remains available through idle until the next round starts.
- A shared striped card back carries the approved bomb and B wordmark. Result identity survives confirmation, so the verdict stamps in without a second flip. Words without illustrations have a typographic face.
- OBS exposes words only for caught or escaped results, with separate server and UI guards. Historical words are stripped from its API view. Pending, rejected, skipped and ended results stay private. The HUD has readable type and a visible terminal mission label; its checked mission state measures 540 × 140.
- Native panels place the essential rule inside the active card, retain a short footer, and fit the word, four clues, clock and skip action in the actual 318 × 500 content area. All 72 current word labels fit on one line. The preview harness has a hard-mode fixture. Configuration acknowledges the connected channel truthfully.
- Product copy uses “Microphone”, “Solo test”, “Speech test” and “What your mic heard”. Moonshine consent, privacy and transcript gating remain intact. Sound stays opt-in; its secondary controls use charcoal and violet.

The final local suite passes 191 tests. Type checking and production build pass. Browser checks include actual local demo start/pause/resume and a simulated speech-final catch, same-card confirmation, idle recovery, 320/390 px decisions, native width/word fitting, broadcaster redaction, configuration and reduced motion. OBS fixtures cover pending privacy, artwork and generic results, and mission expiry. Frozen visual fixtures prove appearance only, not timing. The complete validation ledger distinguishes these from real microphone and broadcast acceptance.

An unuploaded v0.0.1 polish ZIP with 32 frontend files is in the evidence run's `deliverables/` folder. It targets the existing local HTTPS rehearsal (`https://localhost:3443`, studio `http://localhost:3000`), using only its existing public client configuration. SHA-256: `7a00f8d6dae19300aad954255d4539e218d4288a725aac74604613adcce10d53`. It excludes fixture helpers, backend code, secrets and Moonshine models.

Real Twitch installation, physical microphone recognition, OBS compositing, remote Paolo participation and physical phone acceptance remain separate checks. The safe visual previews are `http://127.0.0.1:3330` and `http://127.0.0.1:3322`; they do not replace the authenticated rehearsal.

## Design authority and review brief

The visual authority is the approved landing in `/home/maff/foss/worktrees/disjoint-colliders/bait-dev-landing/packages/bait/site`, released as `bait-v1.1.0`. Carry forward charcoal playing cards, violet `#9146FF`, restrained pale yellow `#FFFC79`, Russo One for the brand and card words, and Inter for controls. Use the existing approved bomb. The approved BAITED B asset supplies the wordmark; this work does not replace it or commission a new identity.

Each screen has a different job:

- Studio: start and manage the round, understand microphone status, confirm or reject catches, and recover from mistakes. The live target stays hidden.
- Setup: connect Twitch, prepare the microphone, add the OBS browser source, and open the viewer experience. Status and recovery actions must remain truthful.
- Native Twitch panel: read the secret word, avoid forbidden clues, and follow the clock in a narrow panel.
- Standalone viewer room: the same secret-card loop with community context and existing game controls.
- OBS: a transparent, compact broadcast graphic with time and round status. No active secret, transcript or automatic audio.

## Design-review handoff

Run the review as a read-only inspection with a 45-minute deadline. Read source and screenshots; a text-only critique is insufficient. The reviewer remains read-only. Do not change the reviewer silently if it is unavailable.

Include the shared product-voice guidance, the Operate/craft design guidance, and the owner's evidence-and-taste decision guide with its applicable taste profile. The current user brief and this project's approved landing outrank cross-project taste examples. Keep any verdict in this project or the output run, not in global memory files.

Evidence directory: `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/921bde0ea7304d94b47d938f73a4cb66/evidence`. Read the verification receipt first, then the before/after Studio images, setup, native viewer/config, standalone viewer and OBS images. Inspect actual screenshots at desktop and phone sizes, including long-word and failure states.

Return:

1. Observed defects with exact surface, state and screenshot/source evidence.
2. Design judgments separately, ranked by impact on playing and hosting.
3. A concrete polish plan: layout, type, spacing, copy, motion and responsive behavior. Specify what stays.
4. The strongest next iteration within the approved identity. Do not present generic dashboard alternatives or invent shipped capabilities.

## Verification boundary

Exercise local demo start, pause, resume and round resolution; target reveal remains demo-only. Check transcript open/hide/clear controls without inventing recognition output. Check setup navigation, settings, reconnect/error, reduced motion, keyboard focus, 320/390 px phone widths, tablet and desktop. Native fixture states must be labelled and excluded from the Extension ZIP. Confirm target and transcript privacy with the existing tests.

Local browser evidence is separate from actual Twitch installation, remote Paolo participation, physical phone behavior and OBS capture. Those remain explicit acceptance checks. The existing authenticated local server should not be restarted merely for design work.
