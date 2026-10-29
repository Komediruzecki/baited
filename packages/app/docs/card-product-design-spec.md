# Card and product design specification, 26 October 2026

Status: design proposals for local implementation and owner review. Not a release or final visual acceptance.

The design inspection completed successfully in 26m59s, within a 45-minute deadline. Source baseline d93edb9. The full original response follows. Measurements and asset-margin claims are hypotheses until verified in the rendered implementation. The implementation retains the current card edition until owner choice, the safer hide-stale-reveal reconnect behavior, and real-only loading progress. Archived branding remains preserved.

# Baited design spec: card editions, Card Lab and product screens

I've specified seven new card editions, plus the current card as a reference, for a local Card Lab. I've also set one product shell for Studio, viewers, native panel, config and OBS, so the implementation can proceed while you choose.

The shell rule: **violet is the table, charcoal is the card and the controls, and yellow appears only in the final 15 seconds.** Product surfaces keep the current readable card until you pick an edition; switching is one constant.

**What this is based on:** I read the source and looked at the screenshots. I didn't run a browser, so every pixel figure below comes from source values plus a font-width estimate (about 0.74 em per Russo One capital). The implementation needs to measure them.

**What I didn't read in full:** `style.css` (4,207 lines), `mechanics.css`, `angular.css`, `refinement.css`, `landing-game.css`, the landing footer and why-stack scripts, and most of the 25 Oct screenshots. I used `landing-v1.1.0.png` only to confirm it is outdated, not as a reference.

---

## 1. Critique

### 1a. Observed defects

| # | Where | Evidence | Effect | Status |
|---|---|---|---|---|
| 1 | Artwork is undersized everywhere | Every PNG has about 16% transparent margin (`expansion-60-a.json` prompt). `packages/landing/site/styles.css:942-952` caps the image at 170 px, so the visible subject is about 120 px on a 300×420 card (`dev-gramophone.png`, `landing-after-desktop.png`). The native art box is 132×84 (`extension/styles.css:385-388`), which makes the volcano about 60 px tall (`native-panel-hard.png`). The viewer uses 216×184 inside a ~656 px card (`public-refresh.css:116-121`, `standalone-viewer-final.png`). | The 78 illustrations read as thumbnails. | confirmed |
| 2 | Two alignment axes on one card | `standalone-viewer-final.png`, `native-panel-hard.png`. `.card-center{align-items:flex-start}` (`extension/styles.css:181-189`) conflicts with `.word-art{margin-inline:auto}` (`:224-230`). Also `public-refresh.css:127-138` sets `text-align:left`. | The art sits centred while word, clues and timer hang left. | confirmed |
| 3 | Yellow is the default emphasis | Target word uses `#fffc79` (`public-refresh.css:130`, `extension/styles.css:401-403,417-419`, `studio-refresh.css:1735`). OBS win uses it for border, word, outcome and logo (`result-card.css:97,136-143`, `public-refresh.css:582-584`, `obs-1920-caught-volcano.png`). Also mission pips (`public-refresh.css:608-612`), signature (`extension/styles.css:351-358`) and focus rings (`studio-refresh.css:240-243`, `extension/styles.css:51-55`). | Contradicts "very little yellow". The landing's `styles.css` uses none in its UI. | confirmed |
| 4 | Studio review can ask "Did you say it?" without showing the word | On desktop, `.studio-result__word{display:none}` (`studio-refresh.css:1564-1566`). The word appears only after a 520 ms card turn (`result-card.css:17`). `studio-1440-review-final.png` shows the card back. | The decision depends on an animation finishing. | needs_validation; fix regardless |
| 5 | Focusing the review heading draws an input-like box | `CatchDecision.tsx:42` (`tabIndex={-1}`); see `studio-1440-review-final.png`. | The heading looks editable and pulls focus away from the two buttons. | confirmed |
| 6 | Old brand marks still present | `ui.tsx:10-19` uses the old "BAIT" PNG for loading, viewer header and privacy (`main.tsx:377,1643,1683,1909,2016`). Bomb in `CardBack.tsx:7`, `main.tsx:1800`, `viewer.html:37`, `config.html:30`. "bait them." in `viewer.html:61` and `app.js:87`. Hook SVG in `Landing.tsx:91`. "bait!" in `CardProofs.tsx:18,43`. | The separate branding cleanup covers these. Listed only so the new designs don't build on them. | confirmed |
| 7 | Two icon languages | The product uses Material Icons Outlined (`icons.tsx:1`). The landing uses square-pixel icons (`index.html` SVG library, `pixels.css`). | The product looks like a generic dashboard next to the landing. | confirmed |
| 8 | Masthead type sizes differ | "Sound" renders larger than the tabs (`studio-1440-active.png`), although `studio-refresh.css:140-148` sets 12 px. | Likely a cascade conflict across 11 stylesheets. | needs_validation |
| 9 | Operating screens use page-hero and instruction patterns | Studio h1 "Your round." plus subtitle (`main.tsx:456-472`). A ~70 px demo banner. Numbered "How to play" (`main.tsx:1845-1861`). Setup steps 01–04. Community stat tiles (`main.tsx:1382-1407`). | The round gets pushed down, and the viewer repeats its rules three or four times. | confirmed |
| 10 | Native hard round probably overflows 500 px | A scrollbar is visible inside the 318×500 frame in `native-panel-hard.png`. `verification.json` only has 318×500 scroll metrics for the long-word fixture. | The clock or footer may need scrolling. | needs_validation |
| 11 | The standalone viewer "card" is a wide panel | `standalone-viewer-final.png`: about 656 px wide, art top-centre, text left, rule text twice. | It doesn't read as the playing card the landing shows. | confirmed |
| 12 | OBS caught state shows the word and verdict twice | `obs-1920-caught-volcano.png`; `ObsHud.tsx:49-60` and `ResultCard.tsx:32-57`. | Extra noise at the payoff moment. | confirmed |
| 13 | Four clues wrap as 3+1 | `landing-hard-after-320.png` leaves SINGLE alone; `dev-gramophone.png` leaves PHONOGRAPH alone. | Ragged clue block. | confirmed |
| 14 | The native state has no difficulty | `extension/client.js:37` copies only id, number, duration, remaining, endsAt, target and forbiddenClues. | The panel can only infer difficulty from the clue count. | confirmed |
| 15 | No single source for styles | `main.tsx:47-68` imports 11 global sheets. The same role uses different colours (#c9a8ff, #bf96ff, #c3bdce, #c6bdd2). | Changing the identity means fighting override chains. | confirmed |
| 16 | `/card-proofs` uses the superseded identity | `CardProofs.tsx:43-53` ("bait!", "● ● ●", "↗"); `card-proofs.css:2` yellow card stock. | It can't be used to judge the landing direction. | confirmed |
| 17 | Pixel-art rendering is inconsistent | `pixelated` in `styles.css:950` and `result-card.css:88`, `auto` in `card-proofs.css:25`, all at a non-integer 1254→~170 downscale. | Either uneven pixel blocks or soft edges, depending on the screen. | needs_validation; add a toggle in the lab |

### 1b. Design judgments, ranked by impact on playing and hosting

1. **Make the card one object everywhere**, with the art 30–145% larger and a single central axis. Viewers look at it every round.
2. **Colour roles:** violet is where cards lie (the table); charcoal is cards and controls; the lilac `#c9a8ff` is readable violet text; yellow only marks the final 15 seconds.
3. **Never let motion carry information.** If a decision needs the word, the word is in plain text.
4. **Operating screens lead with state:** what is happening, how much time is left, the one thing to do next. No hero blocks, no repeated rules.
5. **Brand lives in precise details:** pixel icons, the landing's pixel button for the one primary action, card stock, the plain BAITED glyph.
6. **One card renderer and one token file** shared by React and the native panel.

---

## 2. Card system

### 2.1 Shared anatomy and rules

- **Sizes** (`data-size`):
  - XS 190×266: Studio
  - S 288×403: 320 px viewport; the native card is 294 wide at the same type scale
  - M 300×420: landing deck and OBS; S type with the word +1 px
  - L 360×504: desktop viewer
- **Ratio:** 5:7, except `data-layout="panel"`, where height is automatic and the card must fit within 416 px.
- **Artwork:** a square "art window" with the image overscanned to 120% (`inset:-10%`). With the art's 16% margin, the subject fills about 82–97% of the window. It never reaches the word, because text always starts at least 8 px below the window.
- **Word:** one line, exact, uppercase Russo One. Its size is fitted to the card width by letter count, with no JavaScript measuring. KALEIDOSCOPE comes out at ≥28 px at S and ≥35 px at L.
- **Clues:** two clues sit on one row; four clues always form a 2×2 block (fixes #13). Text is never struck through.
- **Overflow:** use `overflow: clip`, not `hidden`. With `aspect-ratio`, a non-scroll container grows to fit its content at 200% zoom instead of clipping it.

```css
/* extension/card.css — base (S defaults, L overrides) */
.bc{--pad-x:18px;--pad-t:16px;--pad-b:14px;--art:176px;--word-max:30px;--chip:12px;--chip-lh:16px;
  --chip-pad:4px 7px;--chip-gap:5px;--label:11px;--label-lh:14px;--clock:17px;--glyph:52px;--ink:var(--b-paper);
  container-type:inline-size;position:relative;isolation:isolate;overflow:clip;display:flex;flex-direction:column;
  align-items:center;inline-size:100%;aspect-ratio:5/7;padding:var(--pad-t) var(--pad-x) var(--pad-b);
  border:1px solid var(--b-edge);border-top-color:var(--b-edge-lit);border-radius:var(--b-r-card-s);
  background:var(--b-face);color:var(--b-copy);box-shadow:0 8px 0 -3px #120d1a,0 24px 48px #1d0b4573;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.bc[data-size=l]{--pad-x:22px;--pad-t:20px;--pad-b:18px;--art:224px;--word-max:38px;--chip:13px;--chip-lh:18px;
  --chip-pad:5px 9px;--chip-gap:6px;--label:12px;--label-lh:16px;--clock:20px;--glyph:64px;border-radius:var(--b-r-card)}
.bc[data-layout=panel]{aspect-ratio:auto}
.bc__art{position:relative;inline-size:min(var(--art),100%);aspect-ratio:1;flex:none;margin-block:4px 8px}
.bc__art img{position:absolute;inset:-10%;inline-size:120%;block-size:120%;object-fit:contain;pointer-events:none}
.bc__word{--fit:calc(100cqi / (var(--chars,8) * var(--b-adv)));   /* --chars set via CSSOM */
  font:400 min(var(--word-max),var(--fit))/1 var(--b-display);letter-spacing:.01em;text-transform:uppercase;
  white-space:nowrap;color:var(--ink)}
.bc__word[data-fit=wrap]{white-space:normal;overflow-wrap:anywhere;font-size:min(var(--word-max),22px)} /* non-deck words >18 */
.bc__clues{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--chip-gap);list-style:none;margin:0;padding:0}
.bc__clues[data-count="4"]{display:grid;grid-template-columns:repeat(2,minmax(0,max-content));justify-content:center}
.bc__chip{display:inline-flex;align-items:center;gap:6px;padding:var(--chip-pad);border:1px solid var(--b-clue-edge);
  border-radius:3px;background:var(--b-clue-bg);color:var(--b-clue-text);font:600 var(--chip)/var(--chip-lh) var(--b-ui);
  letter-spacing:.03em;text-transform:uppercase;max-inline-size:100%;overflow-wrap:anywhere}
.bc__chip::before{content:"";flex:0 0 6px;block-size:2px;background:var(--b-clue-mark)}
/* The footer rule doubles as the clock bar; --left (0..1) is set via CSSOM each tick */
.bc__foot{position:relative;inline-size:100%;margin-top:auto;padding-top:8px;display:flex;align-items:center;justify-content:space-between}
.bc__foot::before{content:"";position:absolute;inset:0 0 auto;block-size:1px;background:#5b515f}
.bc[data-state=live] .bc__foot::before{block-size:2px;background:linear-gradient(90deg,var(--b-violet) calc(var(--left,1)*100%),#48414f 0)}
.bc[data-urgent] .bc__foot::before{background:linear-gradient(90deg,var(--b-urgent) calc(var(--left)*100%),#48414f 0)}
.bc[data-state=paused] .bc__foot::before{background:repeating-linear-gradient(90deg,#8f84a0 0 6px,transparent 6px 10px)}
@supports not (width:1cqi){.bc{--fit:calc(252px / (var(--chars,8) * var(--b-adv)))}.bc[data-size=l]{--fit:calc(316px / (var(--chars,8) * var(--b-adv)))}}
:root{--b-adv:.74} /* Replace with the measured max width/(chars×size) over all 78 words, plus 3% */
```

The implementation should also confirm in the browser that `100cqi` resolves to the card's content box.

**Type, in px size/line-height, S · L.** Inter is weight 600 unless noted; clocks use tabular figures.

| Element | Table | Glance | Cut | Pixel | Foil | Wide (L only) | Picture |
|---|---|---|---|---|---|---|---|
| Word, Russo max | 30/1 · 38/1, item ink | 32/1 · 40/1, paper | 34/.95 · 44/.95, paper | 30/1 · 38/1, item ink on plate | 28/1 · 36/1, paper | 44/1, item ink | tiles; letters 16 · 20 |
| Clues | chips 12/16 · 13/18 | caps text 13/18 · 14/20 | outline chips 12/16 · 13/18 | stepped chips 12/16 · 13/18 | chips 12/16 · 13/18 | chips 13/18 | caps text 12/16 · 13/18 |
| Rail / labels | 11/14 · 12/16 | icons; legend 11/14 · 12/16 | lilac on violet 11/14 · 12/16 | inside screen 11/14 · 12/16 | 11/14 · 12/16 | 12/16 | "Experiment" tag 10/12 · 11/14 |
| Clock, Inter 650 | 17 · 20 | 16 · 18 | 17 · 20 | 16 · 19 | 16 · 19 | 20 | 14 · 16 |
| BAITED glyph width | 52 · 64 | back only | 56 · 68 | 48 · 60 | knocked out of frame, 56 · 68 | 72 | none |

**Art window and height budget** (hard round, S · L, against 403 · 504):

| | Table | Glance | Cut | Pixel | Foil | Wide | Picture |
|---|---|---|---|---|---|---|---|
| Art window (share of card width) | 61% | 66% | 61% | 61% | 72% | 44% | 71–74% |
| Art window, px | 176 · 224 | 190 · 238 | 176 · 224 | 176 · 224, in a 252×196 · 312×250 screen | 206 · 258 | 246 | 204 · 268 |
| Stack height, px | 385 · 480 | 350 · 424 | 388 · 480 | 388 · 482 | 371 · 455 | 330 of 400 | 398 · 498 |

Visible subject size against today:

| Where | Now | Table | Change |
|---|---|---|---|
| Landing deck | ~116 px | ~150 px | +29% |
| Native panel | ~60 px | ~144 px | ×2.4 |
| Desktop viewer | ~125 px | ~184 px | +47% |

### 2.2 Editions

Each block lists the composition (top to bottom), materials, motion, accessibility and which defects it fixes.

#### 00 Current — reference only

The landing's `.bait-card` as it stands after the branding cleanup, at its existing sizes. Product surfaces render this edition until you pick.

#### 01 Table — recommended everyday

*The house card: the art carries the personality, the words stay exact and plain.*

```
┌──────────────────────────┐ pad 16/20
│ Round 07           ●●○   │ rail 20/24: index · pips
│      ┌──────────┐        │
│      │   ART    │        │ window 176/224, centred, dithered floor shadow
│      └──────────┘        │
│        VOLCANO           │ item ink, one line
│    Keep out of chat      │
│   [-LAVA] [-ERUPTION]    │ 2 per row; 4 → 2×2
│ ━━━━━━━━━━━━━━━━──────── │ rule = time left (live)
│ BAITED            1:27   │ glyph left · clock or state right
└──────────────────────────┘
```

- **Material:** charcoal `#242426`, lilac top hairline, asymmetric corner (12/20/12/12 at S, 14/24/14/14 at L), the landing's hard drop shadow. Violet appears only in the pips, the rule and the glyph.
- **Motion:** deal over 280 ms (y 14→0, rotate −1.5°→0, fade in), then one 900 ms glint using the landing's `card-glint`. Back-to-face turn of 420 ms on a round's first deal. Nothing moves while idle.
- **Accessibility:** group label "VOLCANO. Medium. Keep out of chat: LAVA, ERUPTION."; image `alt=""`; clues as a labelled `<ul>`; forced-colours borders.
- **Fixes:** #1, #2, #3, #10 (385 px fits the 416 px panel budget), #13.

#### 02 Glance — minimal, icons as labels

*Readable in one look beside a busy stream.*

```
┌──────────────────────────┐
│                     ●●○  │ pips float top-right; no rail
│      ┌────────────┐      │
│      │    ART     │      │ window 190/238
│      └────────────┘      │
│      VOLCANO             │ info block centred as a block,
│   ⊘  LAVA  ERUPTION      │ icons hang in the left margin
│   ◷  1:27 ▬▬▬▬▬──        │
│                     [?]  │ legend toggle, 44×44
└──────────────────────────┘
```

- **Clues:** plain caps text with the 6×2 minus mark, no boxes. No footer; the glyph is on the back.
- **Motion:** rows rise 6 px over 200 ms with a 60 ms stagger on deal; legend labels open in 160 ms.
- **Accessibility:** icons are `role="img"` named "Keep out of chat" and "Time left". The legend is `aria-pressed` and shows the text labels inline. Reading order: word, clues, clock.
- **Fixes:** #9 and #11 (label clutter). It tests whether an icon can replace "Keep out of chat".

#### 03 Cut — graphic, from the wordmark's geometry

*Cut from the same slab as the BAITED letters: angled, cheeky, poster-loud.*

```
┌──────────────────────────┐
│▓ R07              ●●○   ▓│ violet panel: 58% of height at left, 52% at right (~4.8° cut)
│▓      ┌────────┐        ▓│
│▓      │  ART   │        ▓│ art may break the cut by ≤8px
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\│ 2px lilac cut line
│ VOLCANO                  │ left-aligned on the charcoal slab
│ [-LAVA] [-ERUPTION]      │ outline chips
│ 1:27 ━━━━━━━━━   BAITED  │
└──────────────────────────┘
```

```css
.bc[data-edition=cut]{--cut-l:58%;--cut-r:52%}
.bc[data-edition=cut] .bc__panel{position:absolute;inset:0;z-index:-1;clip-path:polygon(0 0,100% 0,100% var(--cut-r),0 var(--cut-l));
  background:radial-gradient(circle at 50% 42%,#5b2bb066,transparent 60%),linear-gradient(172deg,#3a1680,#1d0b45 80%)}
.bc[data-edition=cut] .bc__panel::after{content:"";position:absolute;inset:0;background:var(--b-lilac);
  clip-path:polygon(0 calc(var(--cut-l) - 2px),100% calc(var(--cut-r) - 2px),100% var(--cut-r),0 var(--cut-l))}
.bc[data-edition=cut][data-state=caught] .bc__panel{background:#9146ff}
```

- **Motion:** the panel wipes down over 320 ms (clip-path); the art drops 8 px 60 ms later; the word slides in 12 px over 200 ms.
- **Fixes:** the generic look. The deep violet gives strong figure/ground for the violet-and-gold expansion art.

#### 04 Pixel — the landing's pixel language as material

*An item card from the same pixel world as the art; the curtain lifts like the landing's page transition.*

- **Composition:** stepped outer corners (`--s` 3 px at S, 4 px at L) with a one-pixel lilac frame. A "screen" (`#170b33`, stepped corners) holds the art with the index and square pips overlaid. The word sits on a stepped plate (`#2d2833`), then stepped chips, then the glyph centred.
- **Motion:** on deal, a 6×6 grid of `#7721e5` squares clears from the screen in random order (each fades in 80 ms, delays 0–220 ms). When caught, the frame fills violet in four steps over 240 ms.
- **Shadow:** apply `filter: drop-shadow()` on a wrapper; `box-shadow` would be clipped.

```css
.bc[data-edition=pixel]{--s:3px;clip-path:polygon(calc(2*var(--s)) 0,calc(100% - 2*var(--s)) 0,calc(100% - 2*var(--s)) var(--s),
 calc(100% - var(--s)) var(--s),calc(100% - var(--s)) calc(2*var(--s)),100% calc(2*var(--s)),100% calc(100% - 2*var(--s)),
 calc(100% - var(--s)) calc(100% - 2*var(--s)),calc(100% - var(--s)) calc(100% - var(--s)),calc(100% - 2*var(--s)) calc(100% - var(--s)),
 calc(100% - 2*var(--s)) 100%,calc(2*var(--s)) 100%,calc(2*var(--s)) calc(100% - var(--s)),var(--s) calc(100% - var(--s)),
 var(--s) calc(100% - 2*var(--s)),0 calc(100% - 2*var(--s)),0 calc(2*var(--s)),var(--s) calc(2*var(--s)),var(--s) var(--s),calc(2*var(--s)) var(--s))}
```

- **Accessibility:** purely presentational. In forced colours, drop the clip-path and use a solid border.
- **Fixes:** brings the landing's motion signature onto the card. The lab's crisp/smooth toggle resolves #17.

#### 05 Foil — deluxe, the trophy

*Rarity: the card chat wins. Proposed use: the caught reveal on OBS and in the viewer, and showcase hard cards.*

```
┌╔════════════════════════╗┐ 8/10px foil frame (frame and art backdrop only)
│║    ┌──────────────┐    ║│ art window 206/258 on violet night
│║    │     ART      │    ║│
│╟────┴──VOLCANO─────┴────╢│ charcoal nameplate 44/54 high; art overlaps it by 6%
│║ ⊘ [-LAVA] [-ERUPTION]  ║│
│║ R07              [◈●●] ║│ difficulty seal
│╚═══════[BAITED]═════════╝│ glyph knocked out of the foil
```

```css
.bc[data-edition=foil]{transform:perspective(900px) rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg))}
.bc__foil{position:absolute;inset:0;border-radius:inherit;padding:8px;pointer-events:none;opacity:.38;mix-blend-mode:color-dodge;
  background:radial-gradient(circle at var(--mx,50%) var(--my,30%),#fff4,transparent 42%),
             conic-gradient(from 210deg at var(--mx,50%) var(--my,30%),#c9a8ff,#8fd3ff,#f0b8ff,#9146ff,#c9a8ff);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
```

- **Glyph pattern:** a second layer behind the art only, masked with `baited-original-mask.svg` repeated at 46 px.
- **Motion:** with a pointer, the card tilts up to ±5°, and the foil and light follow `--mx`/`--my` (updated in `requestAnimationFrame`); on leave it springs back over 450 ms. On touch, it tilts while the card is pressed. On OBS, one scripted −4°→+4° sweep over 1.6 s during the hold. With reduced motion, the foil sits still at 210°.
- **Accessibility:** text only ever sits on solid charcoal. In forced colours the foil is removed.

Difficulty seal:

```svg
<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 0H20V2H24V4H26V8H28V20H26V24H24V26H20V28H8V26H4V24H2V20H0V8H2V4H4V2H8Z" fill="#1b1820" stroke="#c9a8ff"/>
<rect x="6" y="12" width="4" height="4" fill="#c9a8ff"/><rect x="12" y="12" width="4" height="4" fill="#c9a8ff"/><rect x="18" y="12" width="4" height="4" fill="none" stroke="#8f84a0"/></svg>
```

#### 06 Wide — landscape, containers 480 px and wider

*The card on its side for wide screens.* Below 480 px it falls back to Table, and the lab says so.

```
┌ Round 07 · Medium ●●○ ──────────────── BAITED ┐ 7:5, e.g. 560×400
│ ┌────────────┐  VOLCANO                        │ word fitted to the right column
│ │  ART 44%   │  Keep out of chat               │
│ │ violet well│  [-LAVA]   [-ERUPTION]          │
│ └────────────┘  ━━━━━━━━━━━━━━━━━━━━──  1:27   │
└─────────────────────────────────────────────────┘
```

- **Motion:** slides in 16 px from the left over 280 ms, then the glint.
- **Fixes:** #11 on the desktop viewer; also a shorter option for the OBS result.

#### 07 Picture — experiment, never used in rounds

*Picture first, word on demand.*

- **Composition:** the rail has an "Experiment" tag plus pips; art at 204/268; one blank tile per letter, which is the "Hold to read the word" button (≥44 px tall); clues as plain text with the no-chat icon; a small clock line.
- **How the exact target is found:**
  1. The tile count always shows the exact length.
  2. Press and hold on pointer or touch: the tiles fill with letters while held, plus 600 ms.
  3. Keyboard: Space or Enter toggles (`aria-pressed`); Esc hides.
  4. Screen readers: the button is named "Show the secret word, 7 letters". When pressed, the letters are in the DOM and a polite live region reads the word.
  5. The lab has an "Always show word" switch.
- **Deliberately hidden:** the target's letters at rest, the "Keep out of chat" text (icon instead) and the round index.
- **Never hidden:** forbidden clue words (always text), difficulty, clock, state and letter count.
- **Why it stays an experiment:** in `server/cards.ts`, the natural name for many hard pictures is an off-limits clue:

  | Picture | Natural name (off-limits) |
  |---|---|
  | ARCHIPELAGO | ISLANDS |
  | LABYRINTH | MAZE |
  | ZEPPELIN | AIRSHIP, BLIMP |
  | NARWHAL | WHALE |
  | QUICKSAND | SAND |
  | OBELISK | MONUMENT, PILLAR |
  | GARGOYLE | STATUE |
  | CHANDELIER | LIGHTS |
  | PLATYPUS | DUCK |

  Picture-only would steer chat into off-limits words. Word matching is unchanged.
- The lab shows a banner, and its export marks this edition `experimental: true`. It has no "use in panel" option.

```css
.bc__tiles{display:grid;grid-auto-flow:column;grid-auto-columns:18px;gap:3px;min-block-size:44px;align-items:center;touch-action:none;background:none;border:0}
.bc[data-size=l] .bc__tiles{grid-auto-columns:22px;gap:4px}
.bc__tile{block-size:24px;border:1px solid #6c5a86;border-radius:3px;background:#1b1622;display:grid;place-items:center;font:400 16px/1 var(--b-display);color:var(--b-paper)}
.bc__tiles[aria-pressed=true] .bc__tile{background:#2a2140;animation:bc-tile .12s var(--b-ease) calc(var(--i)*20ms) both}
@keyframes bc-tile{from{transform:rotateX(90deg)}}
```

KALEIDOSCOPE is 249 px of tiles at S against 252 px available. Tight, but it fits.

### 2.3 Card backs and states

**Back, for all editions:** the landing's own `.brand-back`. 45° stripes (`#242426`/`#2a2830`, 8 px at S, 12 px at L), an inset hairline frame at 7% (`#c9a8ff2e`), and the BAITED glyph rotated −90°, running 70% of the card height in `#bca4d6`. No bomb.

- Cut back: the violet panel at full height with the cut at 55% and the glyph on the slab.
- Pixel back: a 2×2 checker with the stepped frame.
- Foil back: the standard back with the foil frame.

| State | Face | Card info and clock | Verdict |
|---|---|---|---|
| Waiting | back | caption outside the card: "The word is coming." | — |
| Live | front | running clock; rule shows time left | — |
| Final 15 s | front | digits and rule turn `#fffc79`; no pulse | — |
| Paused | front | clock frozen; rule dashed | — |
| Checking (settling) | front | "Checking" and "Only words before the buzzer count." | — |
| Catch pending | front | no clock | band: "Heard. Not scored yet." |
| Caught | front | — | **stamp:** violet box with the paper BAITED glyph at −8°, over the art's lower-right; scales 1.18→1 over 220 ms. Band: "Chat wins" |
| Escaped / skipped / ended / rejected | front | — | band: "Time ran out" / "Skipped" / "Round ended" / "Not counted" |
| Reconnecting | as last shown, opacity .72 | "--:--" | — |
| Broadcaster (native) | back | "Your viewers have the word." | — |

---

## 3. Card Lab

**Route:** `/card-lab`, with `/card-proofs` as an alias that replaces `CardProofs.tsx`. It is a lazy-loaded chunk and renders only on local hosts or in dev (`import.meta.env.DEV || isLoopbackHost()`).

**Data:** it reads only the public catalogue and never fetches a room.

**Visible copy:**
- Title: "Card lab"
- Line: "Same word, different cards. Pick the one chat should hold."
- Note: "Local only. Synthetic rounds. Nothing here reads or changes a live game."

**Desktop layout (≥1100 px):**
- **Top bar:** a white pill like the landing nav, holding the black BAITED logo, Compare, Front/Back, Replay, "Preview reduced motion" and Save.
- **Left (300 px):** controls.
- **Centre:** the stage on the landing's bright deck table (`radial-gradient(ellipse 70% 56% at 50% 60%,#7931d6,#56259b 52%,#3a1680)`) inside the landing's lilac viewfinder brackets.
- **Bottom tray:** "Your picks".

**Phone layout:** stage first, then a horizontal scroll-snap row of edition chips, then the word and state controls inside `<details>`. A sticky 56 px bar (‹ word, Flip, word ›) respects the safe area, and the stage reserves bottom padding so the bar never covers it.

**Controls (all real inputs):**
- **Edition:** a radio group of 8 with a one-line description each.
- **Word:** a combobox of all 78 words plus ‹ › and Random.
- **Difficulty:** filters the word list to that pool, true to `server/words.ts`. A word's level is fixed, so there is no fake "banana at hard".
- **State:** a select over every state in §2.3, tagged "Synthetic state".
- **Time left:** a 0–120 s slider (shows the 15 s threshold); round number; a mission "Word n of 3" toggle (lab only).
- **Context:** one of six frames.
  - **Landing deck** (300×420): a static fan using `deck.js` FAN poses.
  - **Twitch panel**: 318×500 at 1:1 with `#0e0e10` around it, a fold line at 500, and a lab-only overflow badge ("Fits" / "Overflows 23 px" via ResizeObserver). Its caption says it is a mock, and the implementation is verified in the real extension preview.
  - **Phone viewer** (320×640).
  - **Desktop viewer** (scaled, captioned "shown at 60%").
  - **Studio review** (XS card plus decision column).
  - **OBS**: 1920×1080 on a checkerboard, scaled, with a 0–5.5 s scrubber that sets a negative `animation-delay` while paused.
- **Stress fixtures:** "Longest word" (KALEIDOSCOPE), "Widest glyphs" (MARSHMALLOW), "Longest clue" (ALCHEMY: TRANSMUTATION), ARCHIPELAGO, and "Generic word" (no art, labelled synthetic).
- **Toggles:** show icon labels (Glance, Picture); pixel rendering crisp/smooth; always show word (Picture).

**Compare:** up to four editions side by side, with the same word, state and context. Each cell has an edition label, an overflow badge and a "Prefer" button. On phones it becomes a vertical list at full size.

**Pointer and touch:**
- A horizontal swipe on the stage background browses words (6 px to start, flick at 0.6 cards/s). `touch-action: pan-y` keeps vertical scrolling.
- The spring uses CSS `linear()` easing generated from `deck.js` `springEase` sampled at 40 points, so no GSAP is needed in the app.
- On Foil, dragging the card tilts it (it doesn't browse).
- On Picture, holding the tiles reveals; `contextmenu` is suppressed on the tiles only.

**Keyboard:**
- Tab order: top bar, edition radios (arrow keys move), word, difficulty, state, context, stage, picks.
- Single-key shortcuts work only while the stage region has focus (WCAG 2.1.4): ←/→ word, 1–8 edition, F flip, R replay, C compare.
- Focus ring: 3 px `#fffdf7`, offset 3 px.

**Reduced motion:** honours the OS setting. "Preview reduced motion" sets `data-motion="reduced"` on the stage, and the CSS gates every duration with `calc(var(--t) * var(--b-motion,1))`, setting `--b-motion: 0` under both the media query and the attribute.

**Saving and export (local only):**
- localStorage key `baited.card-lab.v1`:
  `{version:1,preferred:"table",picks:{foil:{verdict:"yes",note:"OBS win",reviewed:["panel","obs"]}},updatedAt}`
- Buttons: "Copy choices" (clipboard JSON) and "Download choices" (Blob, `baited-card-choices-YYYY-MM-DD.json`).
- "Clear picks" asks for inline confirmation.
- Status line: "Saved in this browser."
- URL state for bookmarks: `?edition=&word=&state=&ctx=&compare=&t=&motion=`.

**Sound Lab:** kept as a collapsed section at the bottom. Sound plays only when explicitly enabled.

**Loading:** art loads for the current word and its neighbours only. The originals are 0.6–0.9 MB each.

---

## 4. Product screens

### 4.1 Shared shell

**Tokens** (`extension/tokens.css`, imported by both hosts):

```css
:root{--b-night:#121016;--b-bar:#18151d;--b-panel:#1d1a22;--b-face:#242426;--b-face-2:#2a2830;--b-line:#36323e;
--b-edge:#515057;--b-edge-lit:#c9a8ff80;--b-table-1:#3a1680;--b-table-2:#1d0b45;--b-violet:#9146ff;--b-violet-hover:#7c30ec;
--b-violet-press:#6a25d1;--b-violet-ink:#7721e5;--b-lilac:#c9a8ff;--b-ink:#17131e;--b-paper:#fffdf7;--b-copy:#dedce3;
--b-muted:#b5afbf;--b-clue-bg:#302731;--b-clue-edge:#806478;--b-clue-text:#f2e3ee;--b-clue-mark:#e4a2bd;
--b-urgent:#fffc79;--b-error-bg:#372028;--b-error-edge:#8c4b58;--b-error-text:#ffd9df;--b-focus:#fffdf7;
--b-display:'Russo One',Russo,Impact,sans-serif;--b-ui:Inter,Arial,sans-serif;
--b-r-card:14px 24px 14px 14px;--b-r-card-s:12px 20px 12px 12px;--b-r-control:6px;--b-r-panel:10px;
--b-ease:cubic-bezier(.16,1,.3,1);--b-ease-turn:cubic-bezier(.65,0,.35,1);--b-t-state:160ms;--b-t-deal:280ms;--b-t-turn:420ms;
--b-table-night:radial-gradient(ellipse 80% 60% at 50% 40%,#3a1680 0,#1d0b45 70%,#150a30 100%)}
```

White on `#9146ff` computes to about 4.65:1, which passes.

**Type:**
- Inter for everything functional: 12/13/14/16/18/24.
- Russo One only for state headings (28), the review word (40), timers (48/64) and card words.
- Timers use fixed digit cells to stop width jitter: `.d{display:inline-block;width:.66em;text-align:center}` (the implementation measures the actual digit advance).
- State pills use sentence case ("Live", "Paused", "Your call", "Ready", "Setup needed", "Checking"), not tracked uppercase.

**Icons:** new `client/pixel-icons.tsx` with the same export names as `icons.tsx`, so it is a drop-in swap. Icons use the landing's 10×10 grid at 2 px per unit (20 px). New icons:

```
no-chat (9×9)  M1 0h7v1H1zM0 1h1v5H0zM8 1h1v5H8zM1 6h7v1H1zM1 7h2v1H1zM1 8h1v1H1zM2 3h5v1H2z   (landing chat bubble, dots → bar)
stopwatch (9×9) M3 0h3v1H3zM4 1h1v1H4zM2 2h5v1H2zM1 3h1v1H1zM4 3h1v2H4zM7 3h1v1H7zM0 4h1v3H0zM8 4h1v3H8zM5 5h1v1H5zM1 7h1v1H1zM7 7h1v1H7zM2 8h5v1H2z
card-back (8×11) M0 0h8v1H0zM0 1h1v9H0zM7 1h1v9H7zM0 10h8v1H0zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM2 5h1v1H2zM5 5h1v1H5zM4 6h1v1H4zM3 7h1v1H3zM2 8h1v1H2z
skip (10×10)   M1 1h2v1H1zM1 2h3v1H1zM1 3h4v1H1zM1 4h5v2H1zM1 6h4v1H1zM1 7h3v1H1zM1 8h2v1H1zM7 1h2v8H7z
stop (10×10)   M2 2h6v6H2z
```

Reuse the landing's play, pause, mic, sound/muted, lock, card and doc icons. Draw mic-off, gear, help, sign-out, link, copy, check, eye, warning and wifi-off on the same grid. Drop the trophy and flame icons; the words "wins" and "streak" are enough.

**Primary button:** the landing's `.px-btn` in violet, 48 px tall, Inter 650 15 px, with an ink box holding the white pixel icon. On hover the box widens by 8 px and the icon hops once with `steps()`. The label never hides. **Only one violet button per screen.** The existing start-vs-enable-mic rule already guarantees this; keep it.

**Motion:** 160 ms state changes. One authored moment per surface:
- Studio: verdict stamp
- Viewer: deal and turn
- OBS: deal, turn, stamp
- Native: deal only

**Focus:** non-interactive headings that receive programmatic focus get `outline: none` (fixes #5). Every control keeps the white ring. The yellow focus rings go.

### 4.2 Studio

**Desktop (≥1200 px):**

```
┌ masthead 64: [BAITED 104w lilac]   Studio | Community | Stream setup   ● @chan · Sound · (?) · (sign out) ┐  all 13–14px
├ status strip 40 (only when needed): "Local demo. Simulated chat."  Connect Twitch ›   | offline/error uses error tokens
│ ┌ Round desk ─────────────────────────────────────────┐ ┌ Microphone (340) ───────┐
│ │ Round 07 · ●●○ Medium   [Live]       ⚙ Game settings │ │ ▮▮▮▯▯ level (real)      │
│ │ ┌ violet well 260×340 ┐  Chat has the word.          │ │ Listening               │
│ │ │  card 190×266 −2°   │  Keep talking. Any answer   │ │ one line                │
│ │ │                     │  could be the slip.         │ │ [Disable microphone]    │
│ │ └─────────────────────┘  01:43   (Russo 64, cells)  │ │ 🔒 Checked on this computer │
│ │                          [▶ Pause round] Skip word  End round │ Solo test (demo) │ Speech test │
│ │                          ✓ Chat connected  ✓ Mic on  │ └─────────────────────────┘
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ 4px; yellow ≤15 s
│ │ 3 chatting · Skip 0/3 · Streak 1 · 4 wins             │
│ └──────────────────────────────────────────────────────┘
│ [Viewer link: input + Copy + Open]   [Recent rounds: mini cards 28×39 · word · outcome · time]
│ Award review (after a win) · Round sounds · footer
```

**Layout changes:**
- Remove the "Your round." hero; the h1 becomes visually hidden "Studio".
- The violet well is `background: var(--b-table-night); box-shadow: inset 0 0 0 1px #4a2a8a, inset 0 14px 30px #0d052466`.
- Skip and End are labelled secondary buttons on desktop and icon buttons with `aria-label` on phones.

| State | The one primary action | Right-hand stack | Mic column |
|---|---|---|---|
| Signed out (`Landing.tsx`) | Connect Twitch | Replace the marketing page with a sign-in sheet: glyph, "Run baited on your channel.", Connect Twitch, "Try the local demo" (if demo is available), privacy line, link to the landing | — |
| Chat not connected (Twitch mode) | Reconnect chat | "Chat isn't connected." plus `connection.detail`. Checklist: Chat ✕ [Reconnect chat]; Microphone ✕ [Enable microphone]; Viewer link [Copy]. Start is disabled with "Connect chat and turn on your microphone to start." Account sign-in and the chat connection are shown separately. | Off |
| Demo idle | Start round | Status strip shown. "Ready when chat is." / "Open the viewer room in another tab, then start." Timer shows round length. | Off; Enable is secondary |
| Model loading | none (Start disabled; reason "Waiting for the speech model.") | readiness row shows the percentage | "Loading the speech model" with a determinate bar parsed from `Loading Moonshine N%` (`moonshine.ts:36`), "About 84 MB, downloaded once and kept in this browser.", [Cancel model loading] |
| Ready | Start round | "Ready when chat is." / "Viewers get the word when you start." | "Microphone ready" |
| Live | Pause round | back in the well; running timer; Skip word and End round (End opens the existing confirmation dialog) | "Listening", 5 stepped bars driven by the real `level` |
| Paused | Resume round | "Round paused." / "The clock and listening are stopped." | "Paused" |
| Checking | none ("Checking final words", disabled) | "Only words spoken before the buzzer count." | "Finishing the speech check" |
| Catch review | **Yes, chat wins** (No, I didn't is secondary) | Card face (review state) in the well. "Did you say it?" plus **the word, always in text** (Russo 40, paper). "Yes gives chat the win. No ends this round, and the next round gets a new word." | unchanged |
| Caught | Start round once cooldown ends ("Next round in 0:12" disabled until then) | face plus stamp; "Chat got you." / "You said it after 42 seconds."; "Wrong detection? Reverse win"; award link | — |
| Escaped / rejected / ended / skipped | Start round | face plus band; outcome heading | — |
| Offline | none | error strip "Connection lost. Controls come back when the studio reconnects." | mic paused (existing behaviour) |

**Phones (≤560 px), a secondary control surface:**
- Masthead in two rows: glyph 88w with icon buttons, then the three tabs.
- Round desk: a 56×78 face-down thumbnail next to the heading, the timer at 48 px, the primary button full width at 48 px, then Skip and End side by side (44 px, 8 px gap).
- During review, the card is hidden and the word heading (28 px) and both buttons stay inside 320×640.

**Community tab:** one inline score row (Russo 24 numbers with 12 px labels), then the participation list and the history table. No stat tiles.

**Setup tab:** the four real steps (sequence numbers stay small and lilac), each step's status pill and field, and the privacy panel last.

### 4.3 Standalone viewer

**Desktop (≥960 px):** a grid of `minmax(0,1fr) 360px` with a 48 px gap, max width 1120.
- **Left:** the violet night table, at least 620 px tall, with the card centred at L (360×504).
- **Right:** state heading (Russo 32), one line (Inter 15/1.6), three rule lines with pixel icons and no numbers:
  - chat icon: "Steer the conversation."
  - no-chat icon: "Keep the word and clues out of chat."
  - mic icon: "Only the streamer's voice counts."

  Then the score line "4 chat wins · streak 2", "Skip 1/3 · type !skip in Twitch chat" (text only, never a button), and "Back to Twitch chat" (Twitch mode).

**Phone:** a 56 px header, the card at S on a full-bleed violet band, then the right-hand column stacked below. While a round is live, the heading is hidden (existing behaviour).

| State | Card | Right column |
|---|---|---|
| Idle | back, captioned "The word is coming." | "It appears here when the streamer starts a round." |
| Live | face with clock | "Make them say it." / "Don't type it." |
| Pending | face plus "Heard" band | "Catch pending." / "The streamer is checking what they heard." |
| Caught | face plus stamp | "The streamer said it." / "+1 for chat" / "Next round in 0:12" or "Waiting for the streamer" / the award |
| Reconnecting | dimmed, "--:--" | error strip above the card |

### 4.4 Native panel (318×500, plus 240, 375 and 480 wide)

```
masthead 40: glyph 96w lilac · "Round 7" (11/14 muted)
status strip 36 (only when not connected; retry button 44px)
card: Table at S in panel layout, 294 wide (live hard ≈385 tall). Inside the panel, the card footer drops the glyph.
footer: "Nudge the conversation." / "!skip votes for a new word."   (≈36)
```

- **Ground:** `var(--b-table-night)`, so the panel itself is the table.
- **Waiting:** a 220×308 back plus caption. **Broadcaster:** the back plus "Your viewers have the word." / "Run the round and confirm catches in your studio." **Unconfigured:** the back plus "Not dealt in yet."
- **375/480 wide:** the card caps at 320 px and centres. **240 wide:** 12 px padding, word fitted, vertical scroll allowed.
- Add `difficulty` to `readState` (`client.js:37`), validated against the enum, to drive the pips.
- The image `src` is removed on authorisation loss (existing behaviour, keep it).

### 4.5 Broadcaster config

- Masthead: glyph plus "Stream setup"; status strip.
- "Set the trap." (Russo 32) plus one line. On the right, a 96×134 card back in a small violet well, captioned "On your channel, the panel shows you the back of the card. Viewers see the word."
- "Your channel" with "@name" (18/650), the detail line and [Check again].
- **Primary: "Open your studio"** (violet, external) plus a note.
- Four steps numbered 1–4; this is a real sequence.
- No bomb. Max width 560.

### 4.6 OBS overlay

The HUD is 540 wide on `#242426` with a 1 px `#68616f` border, radius 12 and a lilac top hairline.

```
[BAITED 88w]  ▮ Chat has a word            01:32
              Round 7                       (Russo 44, digit cells)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────── 4px violet (yellow ≤15 s)
4 wins · streak 2                              Local demo
```

| State | Label · headline | Right side | Card |
|---|---|---|---|
| Idle | Next round · Waiting for the streamer | — | — |
| Live | face-down card icon + Chat has a word · Round 7 / Word 2 of 3 | clock | — |
| Paused | Round paused | frozen clock with pause icon | — |
| Checking | Checking final words | 0:00 | — |
| Pending | Catch pending · Did they say it? | — | none (privacy) |
| Caught | Chat wins · "+1 for chat" while the card shows, the word after it leaves | "+1" in white | chosen edition (Foil candidate), 300×420 at (40, 196) |
| Escaped | Time's up · the word after the card | 0:00 | card with "Time ran out" band |
| Skipped / ended / rejected | Skipped / Round ended / Catch rejected · New word next | — | — |
| Reconnecting | Reconnecting · last headline | frozen, opacity .75 | a reveal already running continues and never restarts |

- **Caught HUD:** one background flash from `#9146ff` to `#242426` over 1200 ms. Reduced motion: a static `#2b1950` for 5.5 s.
- **Card timeline:** deal 0–360 ms, turn 360–880, stamp at 900, hold until 5220, exit 5220–5500. Reduced motion shows the card static for the same 5.5 s.
- Pass a `showCard` boolean to `ObsHud` (`PublicRoom` already computes `now - result.at < 5500`).

---

## 5. What must not change

- **Connections:** chat status comes only from `connection.status` and `detail`. The demo never implies a live Twitch session, and account sign-in is never conflated with the chat connection.
- **Microphone:** consent dialog first; no automatic microphone; cancel stays available during model loading; lease and renewal errors still pause the round with a banner.
- **Catches:** confirmation is required. Yes and No each state their consequence. Reverse stays available until the next round starts.
- **Audio:** never automatic, including in the lab.
- **Secrets:**
  - Studio and OBS DOM never contain the active target, except the demo-only solo reveal and server-provided review or result data.
  - `renderCard` creates no `<img>` and no art URL unless `model.word` is set, because the filename itself reveals the word.
  - OBS builds a card model only for caught and escaped outcomes.
- **Controls:** keyboard focus order is unchanged; the countdown keeps `role="timer"` and is not announced every tick; disabled buttons always show a reason nearby.
- **Skipping:** the Studio keeps its own skip (it has real transport). Viewers vote with `!skip` in Twitch chat; never add a skip button for them.
- **Twitch CSP:** no inline handlers. Custom properties are set via `style.setProperty()`, never `setAttribute('style')`. Text uses `textContent`, never `innerHTML`.

---

## 6. Files and build order

1. **Catalogue.** Add `shared/card-catalogue.ts` with `{word, difficulty, clues[4], prompt, ink}`. `server/cards.ts` and `server/words.ts` re-export `clueCards`, `words` and `forbiddenClues` unchanged. Tests:
   - server output is identical for every word × difficulty
   - landing `data.js` and `card-expansion.js` match the catalogue
   - the three art copies have identical SHA-256
2. **Card layer.** Add `extension/tokens.css`, `extension/card.css` (base, Current and Table) and `extension/card-view.js` with a `.d.ts`:

   ```ts
   type CardModel={edition:'baseline'|'table'|'glance'|'cut'|'pixel'|'foil'|'wide'|'picture';size:'xs'|'s'|'m'|'l';
     layout:'card'|'panel';face:'front'|'back';word?:string;clues:string[];difficulty?:'easy'|'medium'|'hard';
     state:'waiting'|'live'|'paused'|'checking'|'review'|'caught'|'escaped'|'skipped'|'ended'|'overturned'|'reconnecting';
     index?:string;prompt?:string;artSrc?:string|null;ink?:string;synthetic?:boolean};
   renderCard(root,model,{onReveal}) → {updateClock({label,fraction,urgent}),destroy()}
   ```

   - Add all three files to `EXTENSION_FILES` (`scripts/build-extension.mjs:9-16`). They must sit at the extension root, because the build only allows an `assets/` subfolder (`:77-79`).
   - Add `client/BaitCard.tsx`, a thin wrapper that calls `renderCard` in `useLayoutEffect`.
   - In `card.css`, `url('./assets/baited-original-mask.svg')` resolves correctly in both the extension and Vite.
   - Tests: no image without a word, exact clue order, the accessible label, and that `innerHTML` is never used.
3. **Card Lab.** `client/card-lab/` with `CardLab.tsx`, `LabControls.tsx`, `LabStage.tsx`, `frames/*.tsx`, `lab-store.ts`, `fixtures.ts`, `editions.css` (the other editions stay lab-only until chosen) and `card-lab.css`. Then delete `CardProofs.tsx` and `card-proofs.css`.
4. **Shell.** Add `client/shell.css`, `client/pixel-icons.tsx` and a violet `.px-btn` variant. Then:
   - Restructure the `main.tsx` Dashboard as in §4.2.
   - `CatchDecision.tsx`: always render the word; heading focus style.
   - `ResultCard.tsx` → `BaitCard` at XS.
   - `CardBack.tsx` → the back spec.
   - `ui.tsx`: `brand` becomes the glyph everywhere.
   - `Landing.tsx` → sign-in sheet.
   - Retire `studio-refresh.css` rules as each area moves over.
5. **Viewer.** Rework the `PublicRoom` viewer branch and add `viewer.css`; retire the viewer rules in `public-refresh.css`.
6. **Native.** Update `viewer.html`, `config.html`, `styles.css` (page chrome only), `viewer.js`, `config.js` and `client.js` (`difficulty`). Then:
   - Remove the bomb from `EXTENSION_FILES` after the branding cleanup.
   - The preview harness reads `?edition=` only when its helper is present; that helper is excluded from the ZIP.
   - Add fixtures: kaleidoscope, marshmallow, alchemy, and a 240 px width.
   - No ZIP upload.
7. **OBS.** Restyle `ObsHud`, add the `showCard` prop, and render the broadcast result card through `BaitCard` at M.
8. **After you pick.** Set `DEFAULT_EDITION`, move that edition's CSS into `card.css`, and update both DESIGN.md files and PRODUCT.md (the bomb and yellow guidance is out of date).

---

## 7. Acceptance checks

**Viewports:**
- 1920×1080 (OBS, plus a 1280×720 canvas)
- 1440×900, 1280×720 (Studio on a second monitor)
- 1024×768, 768×1024
- 390×844, 320×640
- Native panel at 318×500, 240×500, 375×500, 480×500
- Config at 400 and 1000 wide
- 200% zoom on desktop. On the native panel this means 159 CSS px wide: no horizontal scroll, the word on one line at ≥14 px, and everything reachable by vertical scrolling.

**Measurements:**

| Check | Pass condition |
|---|---|
| Page width | `scrollWidth ≤ innerWidth` on every surface |
| Words | all 78 words × S/M/L × 7 editions: one line (`getClientRects().length === 1`) and no box overflow |
| Clue rows at S | ≤2 rows for every hard word; ≤3 rows at 240 px |
| Native height | `scrollHeight ≤ 500` for every fixture at 318 px, except long error text |
| Art clearance | the word box top is ≥8 px below the art window |
| Contrast | paper, copy, muted and lilac on `#121016`, `#242426` and `#1d0b45`; chip text on chip; white on `#9146ff` (≥4.5:1) |
| Reduced motion | computed `animation-duration: 0s` on all `.bc` animations; no tilt, curtain, glint or flash |
| Touch | all targets ≥44×44; holding Picture tiles shows no system callout; swiping the stage keeps vertical scroll |
| Focus | white ring on every control; programmatic heading focus shows no ring; review focus never steals from an input or dialog |
| Privacy | Studio DOM never contains the active target; OBS DOM has no word and no art filename for review, rejected, skipped or ended; native removes the image `src` when authorisation is lost |
| Controls | start, pause, resume, skip, end, confirm, reject, reverse, award pick, settings save, mic enable/disable/cancel, transcript show/hide/clear, solo reveal, copy links, connect/disconnect, delete data and sign out all still work |

**Visual fixtures (all labelled synthetic):**

| Surface | Fixtures |
|---|---|
| Studio | demo ready; Twitch disconnected; connected with mic off; model loading at 42%; ready; live 01:43; live 0:12; paused 0:26; checking; review with IGLOO and with KALEIDOSCOPE; caught with 3 award hints; escaped; rejected; offline; error; mission word 2 of 3; guess used |
| Viewer | idle; live KALEIDOSCOPE hard 1:27; live 0:09; paused; checking; pending; caught ARCHIPELAGO; escaped; skipped; reconnecting; mission complete |
| Native | the existing harness set, plus kaleidoscope, marshmallow, alchemy, broadcaster and unconfigured, at 240/318/375/480 and 200% zoom |
| Config | connected; not connected; authorisation needed; reconnecting |
| OBS | idle; live; final 15 s; paused; checking; pending; caught with art; caught with a generic word; escaped; skipped; ended; rejected; reconnecting; mission active and complete; scrubber at 0 / 400 / 900 / 2500 / 5300 ms |
| Card Lab | every edition × S/M/L × {BANANA, MARSHMALLOW, KALEIDOSCOPE, ALCHEMY, ARCHIPELAGO} × {live, review, caught, back} |

**For you to decide in the lab:** which edition goes into everyday use; whether Table words use the art-derived colour (as the approved landing does) or plain paper white; and whether Foil becomes the win reveal on OBS.
