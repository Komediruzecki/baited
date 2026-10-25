# BAIT Sound Lab

The procedural audio engine and selected recipes come from the owner's private
`Komediruzecki/disjoint-colliders` repository, commit
`490d9fe050966cce7a680a411df77341df941fdd`, under
`packages/minigames/src/games/keys/audio/`. The source was inspected on
2026-10-25. The published reference is <https://keys.maff.app/sounds/>.

The repository's MIT license identifies copyright (c) 2025 Dnzzk2. Its complete
notice is preserved in `keys/LICENSE` and the legal comment in `index.ts`, which
the bundler retains in the distributed JavaScript. Keep both with any extracted
copy. No third-party audio recordings or sampled sound pack were copied.

## Adaptation

- `keys/engine.ts`, `recipe.ts`, `kit.ts`, `rng.ts`, `textures.ts` and `voices.ts`
  retain the reusable Keys synthesis code. `engine.ts` adds a warm-texture list
  so BAIT prepares only rustle, tick and tinkle variants.
- `keys/effects.ts` contains only Confetti, Supernova and Blackhole from the
  source `effects.ts`. It does not import the Keys game contracts or Deluxe set.
- `recipes.ts` maps a committed catch to Supernova, an escape to Confetti, and
  the lab's Black hole proof to Blackhole. The black hole is a sound proof only;
  no new rarity or score rule was added. Output levels are reduced for BAIT.
- The correction cue adapts `wrongVoice` from the source `chimes.ts`. Deal and
  countdown use its paper-rustle and tick textures with shorter, quieter recipes.
- `events.ts`, `controller.ts` and the browser adapter in `index.ts` are new BAIT
  code. No Three.js rendering code or visual explosions were copied.

## Playback rules

The studio is the sole automatic sound source. The OBS overlay stays silent;
capture the studio/app audio in OBS once. Browser Web Locks stop two BAIT tabs
in the same profile from taking the same room's output. This cannot coordinate
separate browser profiles or OBS's browser engine, so it is not an OBS output
selection mechanism.

Sound starts off on every new mount. Enable sound is an explicit gesture; volume,
mute, stop and disposal affect the complete output bus. Restored results do not
celebrate. A provisional Moonshine catch (`review`) stays silent; confirmation
changes its outcome to `caught` and plays one celebration for that same result
id. Rejecting it plays only the correction cue. Result cues wait 150 ms after committed game state so microphone
cleanup can run first. Starting another round cancels pending result sounds.
Only short, nonverbal deal/countdown cues can run during an active round. Large
effect auditions are blocked during active rounds and transcript settlement.
Headphones are recommended; acoustic feedback with speakers still needs the
human microphone/OBS acceptance check.

The engine's soft clip ceiling is -1.5 dBFS before the user volume control. This
is a software ceiling, not a claim about the listener's hardware loudness or a
measured final OBS recording. No automatic audio playback is permitted by an
URL parameter or a restored preference.

## Integration

Create one `createBaitSound({ roomId, onState })` controller for the studio room.
Feed every received `GameView` to `receive`, including while muted. Call
`tick(seconds)` from the displayed countdown. Call `enable` directly from the
Enable sound button; it resolves to a boolean and exposes a readable `error`.
Call `disable` on a lost connection or hidden page, and `dispose` on unmount.
The standalone lab may use its own controller and the `SOUND_CUES`/`SOUND_LABELS`
exports to audition all six sounds. It should disable sound when leaving.

`tests/sound-lab.test.ts` checks event replay, countdown deduplication, output
reservation cancellation, volume bounds, effect cancellation at round start,
procedural texture samples and the software clip curve. Browser rendering and
OBS capture are separate checks.
