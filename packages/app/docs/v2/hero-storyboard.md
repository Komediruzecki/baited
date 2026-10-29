> Design proposal, completed 25 October 2026. This is a local review study. Gameplay additions, live integration and release remain pending owner review. The original full response is preserved separately; see README.md for evidence and implementation corrections.

# HERO STORYBOARD: "The Spicy Mountain"

**Format and renderer.**

- Length 32.0 s at 30 fps (960 frames), looping.
- Masters: 16:9 at 1920×1080 and 9:10 at 1080×1200. Both are rendered from one GSAP 3.15 timeline in HyperFrames 0.8.198, seeked frame by frame.

**Target: VOLCANO (Medium, the game's default difficulty).** Off limits: LAVA, ERUPTION. Round 07 at the default 120 s. The volcano is **visible in the streamed game**, so the joke reads without words. The approved art also exists.

**Cast (all fictional).**

- Streamer: `mossbyte`, called "moss" in chat. A pixel-art facecam avatar in a green beanie and headset, in the same style as the cards.
- Game: _Little Isle_, an original pixel island builder. The player hammers a hut while a mountain smokes behind.
- Chatters, each with a name colour that is 4.5:1 or better on #18161d:
  - `crumbqueen` #ff8ad8
  - `fernbrake` #9dffa1
  - `deadlinedog` #ffb46b
  - `kettle_kid` #7fd6ff
  - `owlbear_ok` #c7a3ff
  - `nightbus` #ff8c8c
  - `sir_snacks` #b8f36a
- Emotes: three original pixel sprites (bomb grin, side-eye bomb, laughing bomb). No Twitch emotes.

**Frame grammar, 16:9.**

- **Player:** 1296×729 at the top left.
  - The real-style OBS widget at its top left.
  - The facecam (300×300) at its bottom right.
  - Captions at its bottom left: Inter 800 50 px, warm white on an ink plate at 82%, max width 820.
- **Chat:** a 624 px column on the right, full height. Inter 38 px, names at 700, 18 px between lines.
- **Panel:** below the player (1296×351), the Extension concept. It is laid out as a Twitch panel, per the master plan's "viewer panel" recommendation, and tagged **CONCEPT**.
- The player chrome is neutral charcoal: no Twitch logo, no follow buttons.

**Real interface strings.** The OBS widget and studio use the game's actual strings, while the Extension panel remains a concept (VIS-20):

- Overlay: `CHAT HAS A WORD`, `CHECK THIS CATCH`, `THEY SAID IT.` / `CHAT WINS`, `Streamer's pick: @…`
- Studio: `ROUND LIVE`, `The target stays hidden in your studio.`, `AWAITING CONFIRMATION`, `Moonshine heard this word. Did you say it?…`, `Confirm catch` / `Not said`, `Detected after 19 seconds.`

| #   | Time        | Picture and camera                                                                                                                                                                                                                                                                                                                                                        | Visible text                                                                                                                                                                                                                                                                      | Chat (time: line)                                                                                                                                                                                                                                                      | Easing, transition, audio                                                                                          |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| B0  | 0.00–0.80   | A violet card-back pattern slides off to the left, revealing the live layout. Wide.                                                                                                                                                                                                                                                                                       | Overlay: `CHAT HAS A WORD · ROUND 07 · 02:00 · 3 WINS · 1 STREAK`                                                                                                                                                                                                                 | Three idle lines are already present: `owlbear_ok: that hut is crooked`, `sir_snacks: gm moss`, `nightbus: hammer time`                                                                                                                                                | `power3.out`. Silence.                                                                                             |
| B1  | 0.80–4.20   | Camera eases to 1.18× on the panel (0.8–1.6). A card back slides into the panel and flips to its face (1.90–2.32). The clock starts at 0.80.                                                                                                                                                                                                                              | Panel: `You have one job.` / art / **VOLCANO** (yellow, 84 px) / `OFF LIMITS: LAVA · ERUPTION` / `Make the streamer say this word. Keep it subtle.` / tag `ONLY CHAT SEES THIS CARD` / `!skip 0/3`                                                                                | 3.2 `crumbqueen: oh this is too easy`                                                                                                                                                                                                                                  | `power2.inOut` camera; the flip avoids 90°; **deal** cue at 1.90.                                                  |
| B2  | 4.20–7.40   | A vertical seam wipes from the right (0.35 s): left half is chat's panel, right half is the **STREAMER'S SCREEN** studio with the card _face down_. Hold, then collapse back (7.00–7.40).                                                                                                                                                                                 | Labels `CHAT SEES` / `STREAMER SEES`. Studio: `ROUND LIVE`, `Keep streaming. Viewers will try to steer the conversation.`, `The target stays hidden in your studio.`, `ROUND 07 · 01:54 REMAINING`                                                                                | (chat paused)                                                                                                                                                                                                                                                          | `power2.inOut`. A soft tick under the wipe.                                                                        |
| B3  | 7.40–13.40  | Wide, then a slow drift to 1.12× anchored on chat. The player hammers; smoke puffs (steps). Facecam neutral, then squints at 10.9 (2-frame blink).                                                                                                                                                                                                                        | Captions: 8.4–10.6 **Why does everyone care about my view? It's a nice mountain.** 11.0–13.2 **Wait. You're all being weird about the mountain.**                                                                                                                                 | 7.6 `crumbqueen: moss what's that big thing behind your house` · 8.8 `owlbear_ok: is it supposed to smoke like that` · 10.0 `fernbrake: build your hut RIGHT next to it, best view` · 11.4 `sir_snacks: [side-eye emote]` · 12.4 `kettle_kid: totally normal mountain` | Lines enter with a 6-frame rise.                                                                                   |
| B4  | 13.40–17.60 | Push to 1.08× on the player. Facecam smug.                                                                                                                                                                                                                                                                                                                                | 14.8–17.4 **Nope. I'm not naming the spicy mountain.**                                                                                                                                                                                                                            | 13.6 `crumbqueen: just say what it is` · 14.4 `nightbus: name the mountain, coward` · 15.6 `owlbear_ok: SPICY MOUNTAIN` · 15.9 three laughing emotes · 16.2 `deadlinedog: the LAVA view tho` · 17.0 `kettle_kid: dog that word is off limits`                          | Emote burst staggered by 0.1 s.                                                                                    |
| B5  | 17.60–20.40 | The mountain rumbles (3 px steps at 15 fps), smoke grows, and it erupts in game at 19.2. Facecam goes wide-eyed and shouts. At 19.6 a bracket locks onto the spoken word and it turns yellow.                                                                                                                                                                             | 18.0–19.0 **Okay what is that noise** · 19.3–20.4 **THE VOLCANO IS GOING OFF!**                                                                                                                                                                                                   | 17.8 `sir_snacks: uh oh` · 18.3 `fernbrake: moss look behind you`                                                                                                                                                                                                      | Rising rumble, 0.25 s of silence, then the recognition bracket lands at 19.6; pending review stays silent (UX-19). |
| B6  | 20.40–24.40 | Overlay switches to `CHECK THIS CATCH · VOLCANO · —`; panel reads `Check this catch.` / `The round has stopped. The streamer is checking this catch.` At 20.8, a 6-frame whip pan cuts to the full-frame **STREAMER'S SCREEN**, with a small facepalm facecam. The cursor moves (22.4–23.2) and presses `Confirm catch` (23.3).                                           | Studio: `AWAITING CONFIRMATION`, `CHECK THIS CATCH`, **VOLCANO?**, the real paragraph, `Confirm catch` / `Not said`, `—:— CONFIRM CATCH ABOVE`. After the press: `CHAT WINS`, **VOLCANO.**, `Detected after 19 seconds.` Caption 21.2–23.4 **I have to confirm it myself? Fine.** | (offscreen)                                                                                                                                                                                                                                                            | Silence from 22.9 to 23.3, then a soft click.                                                                      |
| B7  | 24.40–28.40 | Cut back to wide. The OBS celebration plays over a 30% scrim: **THEY SAID IT. / VOLCANO! / CHAT WINS**, with pixel confetti in violet, yellow and orange. The yellow word floods the stream for 1.2 s. Widget: `CHAT WINS · VOLCANO · +1`, then `4 WINS · 2 STREAK`. The panel flips to `The streamer said it.` / `One word. One win for the whole chat.` Facecam laughs. | as listed                                                                                                                                                                                                                                                                         | 24.6 `crumbqueen: LETS GOOO` · 25.0 bomb emotes ×4 · 25.6 `nightbus: SPICY MOUNTAIN` · 26.4 `owlbear_ok: fern called it` · 27.2 `kettle_kid: moss never stood a chance`                                                                                                | The single **catch** cue begins after confirmation at 23.3 s; no second celebration cue. Confetti steps at 15 fps. |
| B8  | 28.40–30.80 | A studio card tagged `STREAMER'S SCREEN` slides up over the panel area only, never over the player or chat. Its list: `fernbrake: build your hut RIGHT next to it, best view` (eligible) and `deadlinedog: the LAVA view tho` (`Forbidden clue: lava`). Click at 29.4. Overlay: `Streamer's pick: @fernbrake` (29.6).                                                     | `STREAMER'S PICK · VOLCANO`                                                                                                                                                                                                                                                       | 30.0 `fernbrake: i'll take it`                                                                                                                                                                                                                                         | `back.out(1.4)`. A small chime.                                                                                    |
| B9  | 30.80–32.00 | The card-back pattern wipes in from the right and covers the frame by 31.6, then holds. Frame 960 matches frame 0, so the loop seam hides under a designed full-frame wipe, not a dissolve (VIS-06).                                                                                                                                                                      | none                                                                                                                                                                                                                                                                              | none                                                                                                                                                                                                                                                                   | `power3.in`. Silence.                                                                                              |

The staged clock follows the film timeline: 02:00 at 0.8 s, a stop at 19.6 s with the last active display at 01:42, then a dash during review. This yields `Detected after 19 seconds.` The win and catch cue start at confirmation (23.3 s), not at detection. The real game starts its 5.5-second celebration then; the staged film shows a shortened celebration from 24.4 to 28.4 s after cutting back from review. The scene is a recreation, not a recording of a real round.

**Phone master, 9:10.**

- Player: 1080×608 at the top. Captions 46 px, facecam 200×200.
- Panel strip: 192 px, with the art at 150, VOLCANO at 64 px and the chips.
- Chat: 400 px at 44 px text, showing the last four or five lines.
- B2 stacks the two screens top and bottom. B6 and B8 take over the full frame.
- Camera pushes target the player or chat directly. Timings are identical, so switching between masters keeps your place.

**Audio (opt-in track only).**

- The existing Sound Lab deal cue and one catch cue after confirmation, plus a quiet keyboard and room bed at -30 LUFS.
- No synthetic voice: a fake voice saying the target would read as speech-recognition evidence. The real recording will carry a real voice.
- Mastered to -16 LUFS. Cues end before the next downbeat (UX-23).

**HyperFrames build.**

- `film/timeline.js` exports `buildTimeline(gsap, root, layout)`.
- `film-16x9.html` and `film-9x10.html` share it, along with a `film.css` that imports the game's overlay class names where it can, for fidelity.
- Rules:
  - No unseeded randomness. Shake offsets and confetti paths are precomputed arrays.
  - No CSS transitions or requestAnimationFrame. Sprites use `steps()`.
  - Fonts load locally as woff2, and the timeline waits on `document.fonts.ready`.
- Exports:
  - MP4 (H.264, yuv420p) and WebM (AV1, VP9 fallback) for each aspect.
  - Posters at frame 84 (2.8 s).
  - Seven chapter stills at 2.5, 5.8, 10.4, 15.6, 19.7, 23.6, 29.5 s.
  - Captions and transcript JSON.

**New art (a proof sheet comes before the build; the 18 approved cards are untouched):**

- `mossbyte` in five poses: talk, squint, smug, shout, facepalm/laugh.
- Little Isle layers: sea, island, hut in three build steps, and the mountain idle, smoking and erupting.
- The player sprite with two hammer frames.
- Three emotes.

All are generated with an image model from one prompt family, on transparent PNG, matching the card palette, outlines and pixel scale (VIS-05, VIS-19).

---
