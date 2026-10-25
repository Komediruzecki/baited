> Design proposal by Claude Opus 5.5, completed 25 October 2026 using the irch account. Max effort was requested; the CLI did not report an effective effort level. This is a local review study. Gameplay additions, live integration and release remain pending owner review. The original full response is preserved separately; see README.md for evidence and implementation corrections.

# PLAN A: the landing, interaction and hero film

## A0. Direction: "Dealt In"

**The idea.** The visitor is dealt into chat. They see the secret the streamer can't, and the whole page runs on that dramatic irony. Charcoal card-stock objects sit on a lit violet broadcast field. **Yellow means the secret.** It appears only where something is hidden from the streamer, so when the word is finally said, the yellow breaks out onto the stream. That is the payoff.

**Reasons:**

1. The secret card and the two kinds of screen (chat's and the streamer's) are BAIT's own mechanic. The game already sends different information to the studio, viewer and OBS views. Building the page from that mechanic beats a generic object (VIS-02).
2. The owner asked for less yellow without losing the identity. Making yellow mean the secret gives it a job instead of just a smaller share (VIS-11: one warm point on a cool ground).
3. The violet stays a rich, lit field, not a dark page. The owner's overrides consistently go to the warmer, more alive option (VIS-03). Twitch's dark interface lives inside the film, where it belongs.
4. The film is the stage, and the cards are objects you handle. This takes the principle of both references (product objects organize the page; tactile selection with a synced caption) without importing their pixel room or pastel chrome (VIS-10).

**Alternatives kept in the record, not offered as a menu:**

- **Twitch channel-page parody.** Out: it pretends to be Twitch's product.
- **Dark broadcast page.** Ranked low on VIS-03, and it drops the violet field.
- **Hook Line refresh (v1's censor strip).** Out: the owner asked for a different v2 treatment.
- **Chat wall.** Ranked low: noisy, and it looks like a generic chat interface.

## A1. Emotional sequence

| Moment       | Visitor feeling                 | What carries it                                                                                     |
| ------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0–3 s        | **Complicity**: "I'm in on it." | The film deals VOLCANO into chat's panel, then shows the streamer's screen with the card face down. |
| 3–20 s       | **Suspense with a grin.**       | Chat steers, the streamer dodges ("the spicy mountain"), and the visitor knows what is coming.      |
| 20–28 s      | **Payoff, then laughter.**      | The word slips out, the streamer has to confirm their own catch, chat erupts.                       |
| Scroll       | **Understanding.**              | "One word. Three screens." shows the trap with the real interface states.                           |
| Deck         | **Wanting.**                    | The cards are objects worth handling.                                                               |
| Your turn    | **Agency.**                     | The visitor writes bait, and the real off-limits rule answers what they type.                       |
| Today, Close | **Trust, then a next step.**    | An honest status board and one way to get involved.                                                 |

## A2. Visual system

**Palette.** Existing tokens are kept. New tokens are marked +.

| Token                                         | Hex                         | Use                                        |
| --------------------------------------------- | --------------------------- | ------------------------------------------ |
| `--violet`                                    | #9146ff                     | Brand field key light, focus rings, links. |
| `--violet-lit` +                              | #a56bff                     | Centre of the key light behind the stage.  |
| `--violet-deep` +                             | #3a1680                     | Edges of the field.                        |
| `--violet-night` +                            | #1d0b45                     | Footer and the closing field.              |
| `--rim` +                                     | #c9a8ff                     | 1 px top rim on the stage and cards only.  |
| `--stage` +                                   | #121016                     | Stream frame and film letterbox.           |
| `--card-face` / `--card-edge` / `--card-copy` | #242426 / #515057 / #dedce3 | Unchanged.                                 |
| `--white`                                     | #fffdf7                     | All headings and copy.                     |
| `--ink`                                       | #17131e                     | Text on light surfaces, hard shadows.      |
| `--yellow`                                    | #fffc79                     | **The secret only** (rules below).         |

**Where yellow appears, exhaustively:**

1. The target word on chat-side cards (gallery, toy, the film's Extension panel).
2. The `bait!` wordmark: in the nav and at the right of every card footer. It is identity, so it stays.
3. The catch in the film: the spoken word locks yellow and floods the stream.
4. The 2 px underline on a clean hint in the toy.

Nothing else is yellow: no buttons, no section fields, no decorative bars. The bomb keeps its own orange inside its artwork.

**Field.** The violet is never flat. It uses a radial key light (`--violet-lit` → `--violet` → `--violet-deep`) centred behind the stage. Where the light falls off, a pixel dither band takes over, made from a 2×2 checker of neighbouring violets in an 8 px tile with `image-rendering: pixelated`. The dither takes its motif from the bomb's shading, and it also stops the banding that smooth violet gradients get on 8-bit screens (VIS-06).

**Type.**

- Russo One (bundled) carries the identity:
  - H1: `clamp(52px, 6.4vw, 128px)`, line height 0.92, sentence case.
  - H2: `clamp(40px, 4.6vw, 88px)`.
  - Card words: 32–36 px uppercase, tracking 0.03em.
- Inter carries everything else:
  - Sub: 20/1.45 on desktop, 17/1.45 on phone.
  - Body: 17/1.5.
  - Labels: 600, 14 px, uppercase, tracking 0.06em.
  - Chat fragments: 15/1.4, with names at 600.
- No promo text under 14 px (VIS-16).

**Surfaces.**

- **Card stock:** `--card-face`, 1 px `--card-edge`, 14 px radius, an 18 px chamfer on the top-right corner, and a 1 px `--rim` at 35% on the top edge. Two shadows: a hard 0 8px 0 -3px #120d1a and a soft 0 24px 48px rgba(29,11,69,.45).
- **Stage:** `--stage`, 10 px radius, a 2 px #2b2633 inner border and the rim light. It casts a long soft shadow on the field.

**Marks.**

- The approved bomb PNG: the closing sign-off and the film's emotes.
- The existing hook SVG: card top right; it also marks clean hints.
- New SVGs, all 24 px on a 2 px pixel grid: lamp states (filled, half, ring), a card icon, and play, pause, replay and sound icons.

**Motion language.**

- Entrances use the existing `--ease` (0.16, 1, 0.3, 1).
- Deals use GSAP `back.out(1.6)`. Pixel sprites animate with `steps()`.
- Card flips last 420 ms, and the keyframes straddle 90° so no frame lands edge-on (from the book-intro lesson).
- Shakes are steps of 3 px or less, never full-frame jumps.
- No white flash bands (VIS-06).

## A3. Page map

Section order and anchors:

1. Hero `#top`
2. One word, three screens `#how`
3. Pick a card `#cards`
4. Your turn `#your-turn`
5. Where BAIT is today `#today`
6. Close
7. Footer

**Nav, all sizes.** The bar is 72 px tall (52 px on phone) and transparent over the field.

- Left: the `bait!` wordmark in yellow Russo One, 30 px (24 px on phone), linking to `#top`.
- Right: `How it plays` · `Cards` · `Your turn` in Inter 600 15 px, with a 24 px gap.
- On phones only `Your turn` stays visible. The other links move to the footer, so the page is the only scroller (UI-18).

### 1. Hero: "Stage left, card in hand"

**Purpose:** the whole joke, before anyone reads the rest of the page.

**Copy:**

- H1: **Make the streamer say it.** (It is kept from v1 because it is literally the mechanic; COPY-01, PROC-03.)
- Sub: **Chat gets a secret word. The streamer doesn't know it and has to keep talking anyway.**
- Primary action: **Deal me a card**, with a card icon.
- Under the button: **Then write a hint without the off-limits words.**
- Tab attached to the stage's top-left edge, outside the picture: **Example round · Twitch Extension concept**
- Line under the stage: **A staged round with made-up names. The card panel is a concept for a Twitch Extension.**
- Control rail, right side, icon buttons with 40 px targets and 8 px gaps (UI-01, UI-02):
  - Pause (`aria-label` "Pause the example"), switching to Play ("Play the example")
  - Replay ("Watch from the start")
  - Sound ("Turn sound on" / "Turn sound off")
  - The text link **Read the round**
- Chapter ticks on the progress bar, titled on focus or hover: **The deal · Two screens · Chat steers · The dodge · The slip · The catch · The pick**

**Desktop layout, 1440×900:**

- Left column: x 64–496.
  - H1 on three lines ("Make the / streamer / say it."), 88 px, top at y 132.
  - Sub at y 420, max width 420.
  - Button at y 540, 360×56.
  - Microline at y 608.
- Stage: x 528–1376 (848×477), top at y 120. The control rail sits 12 px below it, 44 px tall.
- The visitor's card back (220×308, rotated −9°) sits _behind_ the stage's lower-left corner, showing about 40% of itself. It is the button's physical object and never overlaps the film (UI-04).

**Primary action design.** The button is card stock: `--card-face` with the chamfer, a warm-white Russo One 20 px label, and a violet rim.

- **Hover or focus:** the peeking card slides out 24 px and straightens to −4° over 220 ms. This is anticipation.
- **Press:** the card lifts, flips to a random Medium or Hard card face (the yellow word shows for 300 ms), and the page scrolls to `#your-turn`, where the same card lands in the toy.
- **Reduced motion:** no flight. Focus moves straight to the toy's input, with the card already dealt.
- Keyboard: Enter and Space.

**Wide screens (UI-17).**

- 1920×1080: left column 560, H1 112 px, stage 1180×664.
- 2560×1440: everything scales by viewport width, with no centred narrow column.

**Before the video loads.** The poster is the frame at 2.8 s: VOLCANO face up in chat's panel, three chat lines, the overlay reading `CHAT HAS A WORD · 01:58`. Together with the H1, the page already reads correctly before any video arrives.

**Feeling:** "Oh, this is a Twitch thing, and I can see what the streamer can't."

### 2. One word. Three screens. (`#how`)

**Purpose:** understand the trap using the real role views.

**Copy:**

- H2: **One word. Three screens.**
- Intro: **Everyone watches the same stream. Only chat sees the card.**

| Step | Label             | Title                     | Line                                                                                                                                |
| ---- | ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | CHAT'S CARD       | **Chat gets the word.**   | Viewers see the secret word and the clues they can't type. The target stays hidden from the streamer until the round stops.         |
| 2    | THE STREAM        | **Chat sets the trap.**   | Hints are ordinary questions in Twitch chat. While the round is active, the overlay shows the clock and score, not the secret word. |
| 3    | STREAMER'S SCREEN | **The streamer says it.** | BAIT listens on the streamer's computer. When it hears the word, the round stops and the streamer confirms the catch.               |

- Outcome line: **Chat wins the round. Outlast the clock and the streamer escapes.**
- Disclosure button **More ways to play** opens five rows:
  - **Medium cards ban two clues, Hard cards ban four.**
  - **Three-word mission: land three words on one clock.**
  - **Call the bait: the streamer gets one private guess. A wrong guess gives chat 15 more seconds.**
  - **Skip vote: chat types !skip to swap a word nobody can crack.**
  - **Streamer's pick: after a win, the streamer gives one clean hint the credit.**

**Layout (desktop).** The section is pinned for 180vh of scroll, and one card travels through the three screens. This is not a three-tile grid.

- The three interface fragments sit in a row (each about 380×300), joined by a 2 px violet hook line that draws itself as you scroll. The fragments are built from the same HTML as the film:
  - the Extension panel, tagged **Concept**
  - the OBS widget, `CHAT HAS A WORD · ROUND 07 · 01:52 · 3 WINS · 1 STREAK`
  - the studio, with `ROUND LIVE` and its real line **The target stays hidden in your studio.**
- The step title and line sit under the active fragment and swap in sync with it (the Holo Cases principle).

**Phone:** no pin. The three fragments stack vertically, the hook line runs down the left edge, and each fragment fades up once it is 70% in view for 300 ms (UI-08).

**Reduced motion:** all three are visible at once with the line fully drawn.

**Feeling:** "Got it, and it's fair."

### 3. Pick a card. (`#cards`)

**Purpose:** show off the approved art; make people want to handle it.

**Copy:**

- H2: **Pick a card.**
- Line: **Eighteen cards with their own art, each with a question chat could open with.**
- Hint row on desktop, like both references: `← → browse · Enter inspect · Esc put back`. On touch: **Swipe to browse · Tap a card to inspect.**

**The hand.** The focused card is upright at 300×420. Its neighbours fan out:

- ±1: ±8°, 24 px down, 0.86 scale
- ±2: ±15°, 64 px down, 0.74 scale
- further cards tuck behind

Dragging or flicking coasts with constant deceleration and snaps to the nearest card (UI-09, the same feel as the stats record's coast). Clicking a side card centres it.

**Inspect** (tap or Enter on the centre card): the card scales to 1.15, tilts with the pointer up to 8°, and a pixel-grain sheen follows the pointer. There is no rainbow foil (per DESIGN.md). Tap again or press Esc to put it back.

**Caption plate** under the hand (aria-live polite), changing with the focused card:

- **VOLCANO** in yellow Russo One 36 px
- `MEDIUM · OFF LIMITS: LAVA, ERUPTION`
- **Try: "Where would you definitely not build a house?"**
- Action: **Bait with this card**, which loads the card into the toy.

**Card face, top to bottom:**

1. `01 / 18`, difficulty pips (●●○ for Medium), and the hook mark.
2. The art window: the pixel illustration on a soft violet radial (#3b2470 → card face), grounded by a dithered floor shadow (VIS-08).
3. The WORD in yellow.
4. Off-limits chips (struck through in `--card-copy`, strike in violet). Medium and Hard only.
5. The question in Inter 15 px.
6. Footer: **Bait them.** on the left (Inter 600 14 px) and the **bait!** wordmark on the right (yellow Russo One 18 px), above a hairline. This is preserved exactly.

**Order:** VOLCANO first, for continuity with the film, then the difficulties alternate.

**Phone:** one card at 260×364 with neighbours peeking 40 px at each edge. A long press does nothing; the section uses `touch-action: pan-y` and `user-select: none` (UX-22).

**Feeling:** collector's pleasure.

### 4. Your turn. (`#your-turn`)

**Purpose:** try the core skill in ten seconds. Everything happens locally on the page.

**Copy:**

- H2: **Your turn.**
- Line: **Get the streamer to say it. Keep the off-limits words out of your hint.**
- Input label: **Your hint**; placeholder: **Ask the streamer something…**
- Send button: **Send hint**. Secondary text button: **Deal another card**.
- Helper link: **Stuck? Borrow the card's question.**
- Note under the log: **This chat is just you.** (Indirect reassurance, COPY-02.)
- Empty log: **Waiting for your first hint…**, with three animated SVG dots (UI-11).

**Live feedback** (aria-live polite). It uses the game's own literal checker (whole word, common plural, possessive), ported from `server/game.ts` `tokens()` rather than reinvented:

| State                       | Text                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contains the target         | **That's the word itself. A hint that says it can't win the streamer's pick.**                                                                                        |
| Contains an off-limits clue | **"Lava" is off limits on this card. Chat can still win, but this hint can't get the streamer's pick.** The matching chip on the card lights and strikes as you type. |
| Clean, after sending        | **Clean bait. If they say it, this one could win the streamer's pick.** The sent line gets the hook mark and a yellow underline.                                      |
| Over 200 characters         | **Keep this practice hint under 200 characters.**                                                                                                                     |

**Layout.**

- Desktop: the card on the left (360×504). On the right, a chat log about 260 px tall, and below it the input and Send in one row with an 8 px gap.
- Phone: a horizontal mini card (full width × 140: art 96 px, word, chips), then the log, then the input with a 44 px icon Send button, then Deal another.

**Dealing.** Cards are random among the 12 Medium and Hard cards. Easy cards arrive only through "Bait with this card" and show **Easy: only the word itself is off limits.**

**Feeling:** "Ooh, this is harder than it looks."

### 5. Where BAIT is today. (`#today`)

**Purpose:** trust, by separating what is built, what is being tested and what comes next.

**Copy:**

- H2: **Where BAIT is today.**
- **Built** (filled lamp):
  - **A studio for the streamer, a secret page for chat and an overlay for OBS.**
  - **Moonshine listens on the streamer's computer. The streamer confirms each catch.**
  - **Easy has no off-limits clues. Medium has two; Hard has four.**
  - **Three-word missions, skip votes, Call the bait and the streamer's pick.**
- **Next test** (half lamp):
  - **A full round with a real microphone, real Twitch chat and a viewer somewhere else.**
- **Next** (ring lamp):
  - **A Twitch Extension, so chat gets the card without leaving the stream.**
- Note: **The film at the top is a staged example. A recorded round will sit beside it once a real one passes.**

**Layout:** one charcoal "setup board" (max width 1100) with three lanes on desktop and grouped lists on phone. The lamps are SVG. There is no motion beyond a fade-in.

### 6. Close

**Copy:**

- **Bait them.** in Russo One at `clamp(72px, 10vw, 180px)`, in warm white, with the bomb (approved PNG at 2×) hooked over the final period.
- Line: **BAIT isn't open for streams yet. Want to run it on yours? Tell us.**
- Action: **Get in touch**, a card-stock button linking to the existing `irchiinnuss.com/contact/`.

**Field:** `--violet-night` with the dither edge. On first view the bomb drops 12 px with a single 3 px settle. Reduced motion: static.

### 7. Footer

- **bait! is made by irchiinnuss.**, linking to `irchiinnuss.com` and `Contact` (existing links).
- The anchor links repeated.
- **Twitch is a trademark of Twitch Interactive, Inc. BAIT isn't made or endorsed by Twitch.** This is flagged for the owner.

## A4. Breakpoints and stress checks

| Viewport              | Hero arrangement                                                                                                  | Film source | Smallest chat text on screen |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------- |
| 2560×1440             | Scaled desktop                                                                                                    | 16:9 1080p  | 26 px                        |
| 1920×1080             | Left 560, stage 1180                                                                                              | 16:9 1080p  | 23 px                        |
| 1440×900              | As specified above                                                                                                | 16:9 720p   | 16.8 px                      |
| 1366×768              | Left 380 with H1 at 64 px, stage about 890×500                                                                    | 16:9 720p   | 17.6 px                      |
| 1024×768              | Stacked: 2-line H1, sub, full-width stage, then the button                                                        | 16:9 720p   | 18.6 px                      |
| 768×1024              | Stacked                                                                                                           | 16:9 720p   | 13.7 px (passes)             |
| 390×844               | Nav 52; 3-line H1 at 52 px; 9:10 film at 390×433; full-width button 52 px; sub below the button                   | 9:10        | 15.9 px                      |
| 390×664 (Safari bars) | Film height `min(433px, 100svh − 252px)`, centred, never cropped; the button stays above the fold                 | 9:10        | 15.1 px                      |
| 320×568               | H1 at 40 px; the film keeps full width (it may run below the fold, because legibility wins); no horizontal scroll | 9:10        | 13 px                        |

Chat sizes are set in the masters (38 px at 1920 wide, 44 px at 1080 wide) so they stay at 13 px or above everywhere. The source switches at a stage width of 600 px.

## A5. Copy decisions and the gallery fixes

Copy follows product voice: plain wording, no em dashes, no "demo" (COPY-03), and understated status labels (COPY-10). The initial eight gallery rewrites below were extended during implementation to BANANA, ROCKET and PIRATE, giving eleven changes. The additional Easy-card edits meet the proposed all-four-clues editorial standard; Easy gameplay itself only forbids the target word.

| Card (difficulty) | Current question, problem                                                        | v2 question                                               |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| PENGUIN (M)       | "Which **bird** would win a belly-slide race?"                                   | **Who would win a belly-slide race?**                     |
| CACTUS (M)        | "Which **plant** absolutely refuses a hug?"                                      | **What's the worst thing to hug?**                        |
| SAXOPHONE (M)     | "What **instrument** belongs in a smoky **jazz** club?"                          | **What would you play in a smoky club at 2 a.m.?**        |
| OCTOPUS (M)       | "Who could hold **eight** controllers at once?"                                  | **Who could hold every controller at once?**              |
| MONOCLE (H)       | "…smallest possible pair of **glasses**?"                                        | **What does a fancy villain squint through?**             |
| BOOMERANG (H)     | "What is the worst thing to **throw** away?"                                     | **What's the worst thing to toss away?**                  |
| NARWHAL (H)       | "…borrowed a **unicorn's** horn?" (the checker catches possessives)              | **Which sea creature has a horn on its face?**            |
| PARACHUTE (H)     | "…before **jumping**?" (an -ing form the checker misses, but editorially a clue) | **What would you double-check before leaving the plane?** |
| BANANA (E)        | Extended editorial review                                                        | **What do cartoon characters slip on?**                   |
| ROCKET (E)        | Extended editorial review                                                        | **What carries a crew beyond the atmosphere?**            |
| PIRATE (E)        | Extended editorial review                                                        | **Who says arr and wears a tricorn?**                     |

## A6. Playback, budgets and failure states

**Playback.**

- `<video muted playsinline loop preload="metadata" poster>`. Playback starts once the stage is at least 60% visible for 300 ms, and on first load as soon as `canplay` fires.
- It pauses when less than 25% is visible. It resumes only if the visitor had not paused it.
- Space and K toggle playback when the stage has focus (UX-10). Left and Right arrows jump between chapters.
- The video is self-hosted. The future Twitch recording is not embedded as an iframe; we link out to it (UX-18).

**Sound.** Off by default. The toggle swaps to the version of the film with its soundtrack (A7).

**Reduced motion.** No autoplay. The poster shows with a **Play the film** button, and a strip of seven stills sits beside it (one per chapter, exported from the same composition), each with its caption as text.

**Error states.**

- Autoplay blocked (for example iOS Low Power Mode): the poster with a centred 56 px play button, labelled **Play the example**.
- Load failure: **The film didn't load. Here's the round in seven frames.** followed by the still strip.

**Transcript.** **Read the round** opens a drawer with the beat-by-beat dialogue and chat as text.

**Budgets** (implementation measures; these are ceilings):

| Asset                                           | Budget                                           |
| ----------------------------------------------- | ------------------------------------------------ |
| Poster AVIF                                     | 90 KB desktop, 70 KB phone                       |
| 720p 16:9 film                                  | AV1/VP9 WebM ≤ 1.8 MB; H.264 MP4 fallback ≤ 3 MB |
| 1080p film (only when stage width × DPR > 1400) | ≤ 3.5 MB                                         |
| Phone 720×800 film                              | WebM ≤ 1.5 MB; MP4 ≤ 2.5 MB                      |
| Hero on phone, total                            | ≤ 1.8 MB                                         |

The LCP element is the poster or the H1, never the video.

**Pixel-art codec check.** With 4:2:0 chroma, coloured pixel edges can fringe. Render at an integer multiple of the sprites, keep their dark outlines, and inspect at 400% before accepting. A fringe is a VIS-06 reject.

## A7. Real recorded round, later

The stage component takes a list of sources:

```js
{ id: 'example', label: 'Example round', kind: 'staged', ... }
{ id: 'recorded', label: 'Real round', kind: 'recorded', date, provenance, ... }
```

Each source supplies `src16x9`, `src9x10`, a poster, a WebVTT caption file and a transcript JSON.

**When a recording exists:**

- A two-option segmented control appears above the stage: **Example round | Real round** (UI-13).
- The recording carries the caption **Recorded on Twitch, {date}. Chat names shown with permission.**, plus a link out to the original Twitch video.
- The real round becomes the default only after it passes the acceptance round in the master plan.

**How to produce it.** Capture two things at the same time: the OBS program output, and a viewer's browser with chat and the Extension panel. Composite them in HyperFrames into the same 16:9 and 9:10 layouts, so the landing needs no rebuild.

**Constraints:**

- Use the streamer's pixel avatar or no facecam, because of VIS-15 (no faces on public surfaces).
- Chatters must consent, or their names are replaced.

## A8. Acceptance for Plan A

1. The film plays muted on load at 1440×900 and 390×844.
2. Every chat line and caption is 13 px or larger on screen at every row of the A4 table.
3. Nothing ever covers the bomb, the card word or the film.
4. A first-time viewer can retell the joke after one loop, without scrolling. Test with three people.
5. Contrast is 4.5:1 or better for all text on its real ground.
6. Keyboard covers the stage, deck and toy.
7. Reduced motion and blocked autoplay both have a designed state.
8. The copy greps clean for em dashes and banned words.

---
