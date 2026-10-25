# baited product design review

The owner approved the landing release and asked us to extend its taste into the game while Opus usage is unavailable. This pass implements the actual product surfaces for local review. It does not deploy the game or release the Twitch Extension.

## Direction

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
