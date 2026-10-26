# baited product design review

The owner approved the landing release and asked us to extend its taste into the game while Opus usage is unavailable. This pass implements the actual product surfaces for local review. It does not deploy the game or release the Twitch Extension.

## Current status: 2026-10-26

Opus completed the requested inspect-only review on 2026-10-25. Its product critique is Part 2 of `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/60103fe0ce074c16ab35de66e1dc26b2/deliverables/opus-motion-and-product-review.md`. It inspected the actual product code and screenshots, not only the landing. The initial product redesign was implemented by Codex; Opus supplied the subsequent critique and concrete polish direction.

Commit `882359a` addressed the live solo-reveal gate and pending-catch overlay redaction first. The separately opted-in local transcript diagnostic remains available for microphone testing, as requested by the owner.

The next polish was implemented by Codex while Opus usage was unavailable, following that completed critique and the owner-approved BAITED logo B:

- Studio timer and primary round controls precede the card; the 320 × 640 layout keeps start/pause within the first viewport. Local speech tools sit beside the microphone.
- Catch review uses a charcoal card and two explicit decisions. Settings return focus to their opener after closing.
- Native viewers use the word's approved artwork, struck capital off-limits clues, length-based word sizing and a short deal animation. Hidden/broadcaster states remove the artwork URL.
- OBS retains the compact transparent HUD and reveals a result card only for confirmed wins or escapes. Singular/plural wins are corrected.
- Generic standalone cards collapse the absent illustration area. Setup privacy text and actions remain readable on narrow screens; the native connection refresh sits beside its status and activation is step 4.
- BAITED B replaces the provisional product wordmark. Existing artwork is copied without alteration.

Local evidence and the installable, unuploaded ZIP are in `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-26/18e81898621d49429a0b37f38d44ba6b`. Read `evidence/product-polish-verification.md` for the exact checks and limitations. The bundle contains 32 frontend files, 12,177,521 bytes, and no fixture Helper, backend, secrets or Moonshine models. It targets the existing local HTTPS rehearsal. No game deployment or production tag is part of this pass.

The local suite passes 188 tests, including OBS result privacy, native artwork cleanup and pluralization. The build passes. Local browser checks cover demo start/pause/resume, simulated catch confirmation, 320 px layouts, generic and long words, keyboard settings and reduced motion. They do not establish real Twitch installation, microphone accuracy, actual OBS capture or remote participation. A new Opus acceptance critique remains optional when quota returns; do not describe this implementation as newly reviewed by Opus.

## Original direction and review brief

The visual authority is the approved landing in `/home/maff/foss/worktrees/disjoint-colliders/bait-dev-landing/packages/bait/site`, released as `bait-v1.1.0`. Carry forward charcoal playing cards, violet `#9146FF`, restrained pale yellow `#FFFC79`, Russo One for the brand and card words, and Inter for controls. Use the existing approved bomb. The textual `baited` lockup is provisional; this work does not replace the approved mascot or commission a new identity.

Each screen has a different job:

- Studio: start and manage the round, understand microphone status, confirm or reject catches, and recover from mistakes. The live target stays hidden.
- Setup: connect Twitch, prepare the microphone, add the OBS browser source, and open the viewer experience. Status and recovery actions must remain truthful.
- Native Twitch panel: read the secret word, avoid forbidden clues, and follow the clock in a narrow panel.
- Standalone viewer room: the same secret-card loop with community context and existing game controls.
- OBS: a transparent, compact broadcast graphic with time and round status. No active secret, transcript or automatic audio.

## Opus handoff

Use the ask-claude inspect profile, verified `irch` subscription account, explicit `claude-opus-5-5` and Max effort, with a 45-minute deadline. Read source and screenshots; a text-only critique is insufficient. Claude remains read-only. Do not change account or model silently if quota remains unavailable.

Include the shared product-voice skill, Impeccable Operate/craft guidance, and `/home/maff/.claude/skills/deciding-by-evidence-and-taste/SKILL.md` with its applicable taste profile. The current user brief and this project's approved landing outrank cross-project taste examples. Keep any verdict in this project or the output run, not in global memory files.

Evidence directory: `/run/media/maff/Game_Shared/agent-out-live/twigame/2026-10-25/921bde0ea7304d94b47d938f73a4cb66/evidence`. Read the verification receipt first, then the before/after Studio images, setup, native viewer/config, standalone viewer and OBS images. Inspect actual screenshots at desktop and phone sizes, including long-word and failure states.

Return:

1. Observed defects with exact surface, state and screenshot/source evidence.
2. Design judgments separately, ranked by impact on playing and hosting.
3. A concrete polish plan: layout, type, spacing, copy, motion and responsive behavior. Specify what stays.
4. The strongest next iteration within the approved identity. Do not present generic dashboard alternatives or invent shipped capabilities.

## Verification boundary

Exercise local demo start, pause, resume and round resolution; target reveal remains demo-only. Check transcript open/hide/clear controls without inventing recognition output. Check setup navigation, settings, reconnect/error, reduced motion, keyboard focus, 320/390 px phone widths, tablet and desktop. Native fixture states must be labelled and excluded from the Extension ZIP. Confirm target and transcript privacy with the existing tests.

Local browser evidence is separate from actual Twitch installation, remote Paolo participation, physical phone behavior and OBS capture. Those remain explicit acceptance checks. The existing authenticated local server should not be restarted merely for design work.
