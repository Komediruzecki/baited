# Collectible-card design inspection

27 October 2026. Successful read-only design run, 23m36s. Some deployment observations describe the source at the start of inspection and have since been addressed by the parallel dev-only build work. Recommendations remain proposals pending browser and owner review.

I've specified a set of 4 generated fronts and 3 generated backs. Fronts are **Prism, Engraved, Velvet and Spotlight**; backs are **Mosaic, Prism and Seal**. Code-only baselines are **Stock and Dither** for fronts and **Current and Dither** for backs. A finish only paints materials and never changes a box, so every edition keeps its current panel and phone fit. My suggested first pairing for the owner is **Table Reveal × Engraved × Mosaic back**. It's a proposal only and doesn't set the game's edition.

I read the sources, all six listed screenshots, the two back captures and six illustrations. I didn't run a browser, take measurements or generate images, so every visual outcome below is a hypothesis until the implementation is inspected.

A subsequent [Glass design inspection](card-glass-design.md) adds a seventh code-only front finish. The collection below records this earlier six-finish specification.

## 1. Critique

**What I saw**
- **Lab back is near-flat:** stripes are `#242426`/`#2a2830`, which works out to about 1.07:1 contrast from the hex values. The hairline is lilac at 27% alpha, with a vertical `#bca4d6` glyph (`card-design-lab.css:184-186`). In `card-lab-table-foil.png` and `landing-deck.png` the fanned backs look like plain charcoal.
- **Four different backs exist:**
  - lab stripes;
  - `result-card.css:29-51`, a horizontal `#c9a8ff` glyph;
  - the Cut and Pixel lab backs (`:230`, `:238`);
  - the landing's violet back with a horizontal wordmark (`after-back-390.png`, `delivered-desktop-backs.png`).
- **Fronts are flat:** every front is plain `#242426` except Cut's gradient slab and Foil's conic ring at 0.7 opacity (`:224`, `:243`). When it isn't moving, Foil looks like a pastel gradient outline with no texture.
- **Foil tilt breaks the new rule:** it follows the pointer on every move (`CardDesignLab.tsx:49-58,65`), which your new motion rule forbids.
- **Sprite colors limit the backgrounds:** the sprites have dark outlines. Ghost, gargoyle, glacier, the archipelago rocks and the kaleidoscope barrel are mostly violet or lilac. Banana, kaleidoscope and the gargoyle wings are gold or orange.
- **Files the brief names are missing:** `extension/card.css` and `card-view.js` don't exist at c0f3063. The shared renderer was never built, so finishes stay in the lab layer for now.
- **Wrong wordmark file to avoid:** `landing/site/assets/brand/baited-wordmark.png` is the hooked-T variant. Backs must use only `baited-original-mask.svg`.
- **Production would serve the lab:**
  - `worker.ts:23-29` only hides `/lab` on production, so a `/card-lab` page would go live.
  - The CSP is `img-src 'self'`, `style-src 'self'`, default `none`, so there can be no data-URI textures and no fetch.
  - The lab gate needs a session (`CardDesignLab.tsx:151`), which a static page won't have.
- **Outside this task:** the landing hero still strikes through LAVA/ERUPTION (`landing-hero.png`).

**My judgment**
- The back is the weakest object, and it's the one the streamer looks at all round in the Studio desk and the broadcaster panel. It has no material, edge or light.
- Table's structure is right. What it lacks is the stock itself: a material, a window for the art and a solid plate under the text. That's what makes a card feel collectible, not more UI.
- A violet field behind the art swallows the violet sprites, and a gold frame fights the gold ones. So art backdrops must be dark and low in color, metals must be cool, and there's no gold anywhere.

I read "cutout look" as the Cut edition, so Cut hosts finishes. If you meant the floating cut-out art, this plan keeps that too, because sprites always float on the material and are never boxed into a scene.

## 2. The collection

**System rules**
1. **Rasters supply material and light; code draws every edge.** That covers the art window, plate, rules, rim, gems and wordmark. Rasters contain no frame lines, so nothing misaligns across XS, S, L, panel or phone.
2. **A finish never changes a box.** The frame band comes out of the existing padding. Word, clue, clock and rail boxes stay identical to Stock, which can be tested.
3. **Light stays under art and text.** Stacking order is raster (−2), then sheen (−1), then window (−1, later in the DOM), then art, then plate and text. Text only ever sits on an opaque plate, tab or chip.

**Fronts** (names and notes are visible copy)

| ID | Name · note | Why this material | Art window (code) | Plate (opaque) | Motion |
|---|---|---|---|---|---|
| `stock` | Stock · "The current charcoal face." | Baseline | none | none (`display:contents`) | existing |
| `dither` (code) | Dither · "Purple and black pixels around the art." | Digital pixels; pairs with the pixel-to-sharp reveal | black window, 1-cell `#3b1a7a` border | `#16121c`, 1-cell `#3b1a7a` top edge | none |
| `prism` | Prism · "Shattered holofoil. Catches the light once." | The approved special edition needs foil that reads when still | dark window `#120b1fe6`, 1 px bevel, radius 4/12/4/4 | `#1d1824`, top edge `#c9a8ff80` | one 900 ms sweep per deal |
| `engraved` | Engraved · "Security print for a secret word." | The card keeps a secret; matte line engraving never competes with item colors | chamfered double rule; the cut top-right corner echoes the card corner and the wordmark's cuts | `#1a1422`, double rule | none |
| `velvet` | Velvet · "The item on display, in a velvet niche." | Velvet absorbs light so sprites read strongly; the tactile opposite of foil | arch-topped niche with an inset (recess) shadow, 15% lilac hairline | `#211d26` with a pewter lip | none |
| `spotlight` | Spotlight · "Two-ink poster burst for the big moment." | The loud matte option: ink, not shine | solid `#100c17` disc with violet and lilac rings, black rim | `#16121c`, lilac top rule | none |

- **Velvet gems:** Velvet also gets four pixel gems in the frame corners, drawn in code at 2/3/1 px cells for S, L and XS. That gives the jewel frame in the sprites' own pixel language.
- **Plate contrast:** every plate is darker than `#242426` (relative luminance 0.008–0.013 against 0.018), so all 78 word colors keep or gain contrast.

**Backs**

| ID | Name · note | Wordmark | Code layers |
|---|---|---|---|
| `current` | Current · "Each edition's existing back." | as it is today | unchanged |
| `dither` (code) | Dither · "Purple and black pixels." | on: lilac with a 1-cell `#4b1e98` offset | dither field, 1-cell lilac frame at 7% |
| `mosaic` | Mosaic · "Glazed tiles. Pixels you could touch." | on: `#c9a8ff`, 70% of width, horizontal | 7% hairline `#c9a8ff40` |
| `prism` | Prism · "Foil lattice, wordmark printed in ink." | on: ink `#130d1d`, 72% of width | 2 px ink frame at 7%; one sweep per deal |
| `seal` | Seal · "Engraved and unmarked." | off by design; turning it on adds a `#1a1422` plaque and a 46%-width glyph | double hairline at 7% |

- **Wordmark direction:** new backs set the wordmark horizontally, which reads at fan size and at 190 px. Current keeps its vertical glyph.
- **Dither offset:** put the 1-cell offset on a wrapper span. Filters run before masks, so a shadow on the masked `.baited-glyph` itself gets masked away.

**Which editions take a finish**
- **Full card:** Table, Glance, Foil, Picture, Table Reveal and Glance Plus get the finish across the card plus the plate. On Foil, the finish replaces the CSS ring; the ring comes back with Stock.
- **Slab only:** Cut gets the finish inside its clipped slab, and the card stays charcoal below it.
  - Set the slab's lower edge from the art box so it stays at least 6 px above the word.
  - Add a 2 px lilac cut line.
- **Keeps its own stock:** Current, Pixel and Wide don't take finishes; their caption reads "Current, Pixel and Wide keep their own stock." Backs apply to every edition.

**Assets**

Every generated asset is made at **1024×1536**, center-cropped to 1024×1434 (5:7), then exported as a **720×1008 WebP of 160 KB or less**, plus an **80×112 swatch**.

| ID | Density | Clear and safe zones (on the delivered 5:7 sheet) | Layers on top |
|---|---|---|---|
| `front-prism` | bright at the edges and upper area, almost nothing in the circle | clear circle centered at (50%, 31%), diameter 64% of width; corners (8%) plain; lower 42% low detail (under the plate); top and bottom 4% can be cropped | sheen, window, art, tabs, plate |
| `front-engraved` | medium all over; faint center | rosette's inner circle (60% of width) very faint; lines at least 12 px apart at full size | chamfered rule SVG, art, tabs, plate |
| `front-velvet` | low to medium | light pool at (50%, 31%), 70% of width, smooth | niche, art, tabs, plate, gems |
| `front-spotlight` | high | solid disc 72% of width | rim, disc, art, tabs, plate |
| `back-mosaic` | bright edges, plain center | center band 28% of height; same when rotated 180° | frame, wordmark |
| `back-prism` | even | center band 30% of height, mid-tone; same when rotated 180° | sheen, ink frame, wordmark |
| `back-seal` | medium | centered medallion, 62% of width; mirror and 180° symmetric | double frame |
| `dither-field.svg` | code (seeded script, committed) | 72×101 cells, `crispEdges`, dense violet edges fading to a black center | scaled to whole-pixel cells of 3/4/5 px |
| `pixel-gem.svg` | hand-written | `<svg viewBox="0 0 5 5" shape-rendering="crispEdges"><path fill="#4b1e98" d="M1 0h3v1h1v2h-1v1h-1v1h-1v-1h-1v-1h-1v-2h1z"/><path fill="#9146ff" d="M1 1h3v2h-1v1h-1v-1h-1z"/><path fill="#c9a8ff" d="M1 0h3v1h-3z"/><path fill="#fffdf7" d="M1 1h1v1h-1z"/></svg>` | Velvet corners |

**Dither field rule.** For each cell, take its distance in cells (d) to the nearest edge:

| Distance d | Cell color |
|---|---|
| 1 or less | `#9146ff` |
| 2–3 | 4×4 Bayer mix of `#9146ff` and `#3b1a7a` |
| 4–7 | mix of `#3b1a7a` and `#1f0e42` |
| 8–13 | mix of `#1f0e42` and `#0d0a12` |
| beyond 13 | `#0d0a12` |

Scatter about one `#c9a8ff` cell per 180 where d is 6 or less. Build one half and rotate it 180° for the other.

**Where the art sits.** The focal point at 32% down the 2:3 canvas lands at about 31% of the 5:7 crop. That matches the source layouts, where the art center is at 27–34% of card height and the art bottom at 50–58%.

## 3. Image-generation prompts

**`front-prism`**
```
Flat 2D full-bleed print texture, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, filled edge to edge with one material. No margin, white border or paper edge. No perspective, no shadow, no mockup, no photograph of an object. Do not draw a card, frame, border line, panel, label or rounded corner. Opaque everywhere.

Material: holographic foil laminate in a shattered-ice pattern of irregular angular shards, 30 to 120 px across, separated by thin dark seams. Each shard reflects a slightly different cool color: electric violet #9146FF, lilac #C9A8FF, cool cyan #8FD3FF, soft rose #F0B8FF and silver #E9E6F2. A broad, soft diagonal band of brighter light runs from the upper left to the lower right.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A small pixel-art object will later sit in the clear zone, and a solid panel will cover the lower part.
- Clear zone: a circle centered horizontally, its center 32% down from the top, its diameter 64% of the image width. Inside it the foil fades smoothly into deep violet-black #0E0A16 with only a few faint shard edges. Nothing bright or sharp inside this circle.
- Around the circle, from the top edge down to 58% of the height: the brightest, densest shards.
- Lower 42%: the same foil, mostly dark and low in detail, with brighter shards only along the left, right and bottom edges.
- The 8% nearest each corner: plain shard texture, no highlights. The top and bottom 4% may be cropped away.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, emblems, icons, stars, sparkles, hearts, characters, creatures, objects, hooks, fish or bombs. No yellow, no gold, no warm colors. Crisp and print-like, not a glossy 3D render.
```

**`front-engraved`**
```
Flat 2D full-bleed print texture, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, filled edge to edge. No margin, white border or paper edge. No perspective, no shadow, no mockup. Do not draw a card, frame, border line, panel, label or rounded corner. Opaque everywhere.

Material: deep aubergine uncoated paper #1C1328 with a faint fibrous tooth, printed with guilloche engraving: interlaced spirograph line patterns cut on an engraving lathe. Lines in muted lilac #8E7BB0 and silver-violet #B9A9D6, slightly raised ink with subtle relief. Matte, no shine.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A small pixel-art object will later sit on the center of the rosette, and a solid panel will cover the lower part.
- One large mirror-symmetric guilloche rosette, centered horizontally with its center 32% down from the top, about 80% of the image width across. Its outer ring is the most detailed and visible part of the sheet.
- Clear zone: the inner circle of the rosette, 60% of the image width across, is extremely faint, its lines barely different from the paper.
- Everywhere else: parallel guilloche wave fields at low contrast, slightly brighter toward the left and right edges.
- Lower 42%: wave lines only, low contrast, no rosette detail. Corners: plain wave lines. The top and bottom 4% may be cropped away.
- Lines at least 12 px apart and 3 to 4 px thick everywhere, so the pattern stays clean at 300 px wide. No moiré, no hairlines.

Strictly no text, letters, numbers, microprinting, signatures, watermarks, portraits, faces, crests, seals, coats of arms, currency symbols, keys, locks, eyes, logos, emblems, icons, hooks, fish or bombs. No gold, no yellow, no bright colors.
```

**`front-velvet`**
```
Flat 2D full-bleed fabric texture, seen straight-on like a flatbed scan, the velvet filling the canvas edge to edge. Portrait 2:3 canvas, 1024 x 1536. No margin or border, no perspective, no visible object, no mockup. Do not draw a card, box, case, frame, panel, label or rounded corner. Opaque everywhere.

Material: crushed velvet in very deep violet-black #140C1F with plum #2A1640 highlights. The pile is pressed in soft irregular swirls that catch a low sheen of muted lilac #6E5A8C. Fine fibers visible up close.

Light and layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A small pixel-art object will later sit in the pool of light, and a solid panel will cover the lower part.
- Clear zone: a soft, wide pool of light, centered horizontally with its center 32% down from the top, about 70% of the image width across. Inside it the velvet is smooth, slightly lighter, desaturated gray-violet #2C2435, with low-contrast texture and no sharp creases.
- Outside the pool the velvet darkens gradually toward all four edges, where the pile is pressed flat and almost black #0B0710.
- Lower 42%: dark velvet with little variation. Corners: dark and plain. The top and bottom 4% may be cropped away.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, emblems, gems, jewels, studs, buttons, stitching, seams, ribbons, cushions, hands, objects, hooks, fish or bombs. No gold, no yellow, no saturated bright purple.
```

**`front-spotlight`**
```
Flat 2D full-bleed screen print, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, printed edge to edge. No margin, white border or board edge. No perspective, no shadow, no mockup. Do not draw a card, frame, border line, panel, label or rounded corner. Opaque everywhere.

Technique: two-ink screen print on matte uncoated board. Ink one is electric violet #9146FF; ink two is near-black #120D1A. A thin third pass of pale lilac #C9A8FF appears only as fine highlight lines along some ray edges. Visible halftone dots, slight misregistration between the inks (2 to 4 px), fine board texture, no gloss.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A small pixel-art object will later sit in the center of the disc, and a solid panel will cover the lower part.
- A radial burst of 18 straight rays, alternating violet and near-black, radiating from one point centered horizontally and 32% down from the top. The rays reach every edge.
- Clear zone: around that point, a solid near-black disc 72% of the image width across, with no rays and no dots: flat ink only.
- Toward the outer edges the violet rays break into a coarse halftone dot gradient, dots 10 to 22 px.
- Lower 42%: the rays continue, darker, with sparser dots. Corners: plain ray texture. The top and bottom 4% may be cropped away.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, stars, sparkles, lightning, emblems, icons, characters, hooks, fish or bombs. No yellow, no gold, no warm light and no smooth digital gradients: it must read as ink on board.
```

**`back-mosaic`**
```
Flat 2D full-bleed glazed tile mosaic, seen straight-on like a flatbed scan with even light. Portrait 2:3 canvas, 1024 x 1536, tiles edge to edge. No margin or border, no perspective, no shadow, no mockup. Do not draw a card, frame line, panel, label or rounded corner. Opaque everywhere.

Material: hand-set glazed ceramic tesserae, square, about 28 px wide, with slightly irregular edges and thin dark grout #07050A. Each tile has a glossy glaze with one tiny soft highlight. Tile colors only: black #0D0A12, aubergine #241338, deep violet #3B1A7A, electric violet #9146FF and a few lilac #C9A8FF accents.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A wordmark will later be placed across the center band.
- The design looks identical when rotated 180 degrees.
- Concentric rectangular bands step inward from the edges like a stepped pixel border. The outermost bands are brightest: electric violet with scattered lilac tiles. Each band inward is darker, blended into the next with a checkerboard of the two colors.
- Clear zone: a horizontal band across the exact center, 28% of the image height tall and spanning the width inside the outer bands, made only of uniform matte black tiles: no pattern, no highlights.
- Corners: plain tiles. The top and bottom 4% may be cropped away.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, emblems, icons, pictures, faces, characters, hooks, fish or bombs. No gold, no yellow, no other colors.
```

**`back-prism`**
```
Flat 2D full-bleed embossed holographic foil, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, foil edge to edge. No margin or border, no perspective, no shadow, no mockup. Do not draw a card, frame line, panel, label or rounded corner. Opaque everywhere.

Material: silver-violet holographic foil embossed with a fine diamond lattice, a woven crosshatch of diagonal ridges with cells about 24 px across. Base tones from silver-lilac #B9A6E0 to mid violet #6E4FB0, with spectral glints of cyan #8FD3FF and rose #F0B8FF along the ridges. One broad, soft diagonal band of brighter light crosses the center from the upper left to the lower right.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. A dark wordmark will later be printed across the center band.
- The lattice looks identical when rotated 180 degrees and covers the sheet evenly.
- Clear zone: a horizontal band across the exact center, 30% of the image height tall and the full width, is smoother and evenly mid-toned, around #9C88C8, with a low-contrast lattice and no bright glints.
- Corners: plain lattice. The top and bottom 4% may be cropped away.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, emblems, icons, stars, striped rainbows, characters, hooks, fish or bombs. No gold, no yellow, no black areas.
```

**`back-seal`**
```
Flat 2D full-bleed print texture, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, printed edge to edge. No margin, white border or paper edge. No perspective, no shadow, no mockup. Do not draw a card, frame line, panel, label or rounded corner. Opaque everywhere.

Technique: guilloche engraving, interlaced spirograph line patterns cut on an engraving lathe, on deep aubergine paper #1A1226. Lines in muted lilac #8E7BB0 and silver-violet #B9A9D6, with one sparse pass of electric violet #9146FF. Slight ink relief, faint paper tooth, matte.

Layout. The sheet will be cropped to 5:7 and shown at about 300 x 420 px. Only a thin border will be added on top.
- Mirror-symmetric left to right and identical when rotated 180 degrees.
- A large central guilloche medallion, 62% of the image width across, centered exactly in the middle: interlaced looping lines building a dense outer ring around an open, faint center.
- The rest of the sheet: guilloche wave fields and a lattice of interlaced loops at low contrast, slightly brighter toward the edges.
- Corners: plain wave lines. The top and bottom 4% may be cropped away.
- Lines at least 12 px apart and 3 to 4 px thick everywhere. No moiré, no hairlines.

Strictly no text, letters, numbers, microprinting, signatures, watermarks, portraits, faces, crests, seals with symbols, keys, keyholes, locks, eyes, currency symbols, logos, emblems, icons, hooks, fish or bombs. No gold, no yellow.
```

**Generating and checking the images**
1. **One pass each.** Make one generation per prompt and regenerate only failures, at most twice each.
2. **Reject an image if it shows any of these** (zoom to 200%):
   - anything letter-like, number-like or mark-like;
   - a frame line, card shape, rounded corner or white border;
   - bright detail in the clear zone;
   - yellow or gold;
   - perspective.
3. **Fix back symmetry if needed.** If Mosaic or Prism isn't symmetric, rebuild the bottom half from the top half rotated 180°; the seam falls in the plain center band.
4. **Export and record.** Crop, export the WebP and swatch, and keep the PNG masters plus a `PROVENANCE.md` in an unserved folder. Record the prompt, tool, date, crop and verdict.
5. **Composite check before any code.**
   - Place ghost, gargoyle, glacier, banana, archipelago and kaleidoscope at 61% of width, centered at (50%, 31%), on each front.
   - Lay a `#242426` block over the lower 42%.
   - View at 288 px on 1× and 2× screens.
   - Reject on lost outlines or line shimmer.

## 4. Card Lab: selectors, gallery and back preview

**Controls.** These go in the left column after Edition, styled like `.cl-edition-option`.
- **Finish:** a radio group of 6 swatches, 3 per row. Each has a 40×56 chip showing the swatch WebP, a name, and a "Code" or "Generated art" tag.
- **Back:** 5 swatches, plus one radio group labelled "BAITED on backs" with the options As designed · On · Off.
- **Top bar:** add a **Stage | Gallery** pair (`aria-pressed`). Compare stays for editions, uses the chosen finish and back, and is hidden in Gallery.
- **On phones:** each group becomes a scroll-snap row, like the edition chips today.

**Gallery view** (`view=gallery`). It sits on the existing violet deck table with the lilac viewfinder brackets. Cards are dealt with a 30 ms stagger, capped at 600 ms, only when you enter the gallery.
- **Intro line:** "One word, every finish. Words and clues always sit on solid stock."
- **Fronts:** all 6 finishes at size S, using the current edition, word and state.
  - If the edition keeps its own stock, render on Table with the caption "Shown on Table. Pixel keeps its own stock."
- **Backs:** all 5 backs, following the wordmark setting.
  - Note under the section: "The wordmark is drawn in code from the original artwork. Generated art never contains it."
- **"{Finish} in each state":** Live, Final seconds, Catch pending, Chat wins, Time ran out, Reconnecting, plus the chosen back.
- **Each tile:**
  - The card sits inside an `inert` wrapper so there's no repeated reading or focus traps.
  - A `figcaption` carries the name, tag and note.
  - Two buttons: **Show on stage** (selects it and returns to Stage) and **Prefer {name}**, which reads "Your finish" or "Your back" when pressed.
  - The current choice gets a 2 px lilac outline, offset 8 px.

**Stage behavior**
- **Contexts:** the finish and back apply in every context. The deck-fan cards and the panel's waiting and broadcaster cards show the chosen back.
- **Flip:** a 420 ms turn, instant under reduced motion.
- **Summary line:** "Table Reveal · Engraved" with "Back: Mosaic" beside it.
- **Help line:** "Drag sideways to browse. Replay deal to watch the art resolve and the foil catch the light. Picture reveals its word when held."

**Keyboard and touch**
- **Radios:** arrow keys move within each group.
- **New stage keys:** these work only while the stage has focus. **G** opens the gallery, **[ ]** change the finish and **B** changes the back. Add them to the stage's `aria-label`.
- **Touch:**
  - Swatch targets are at least 64 px tall.
  - The gallery has vertical scroll only, with no swipe handlers.
  - Swiping the stage still browses words; the Foil exemption goes away along with the tilt.

**Storage and URL**
- **Old picks stay untouched:** keep `baited.card-lab.v1` and `parsePicks` exactly as they are.
- **New key:** `baited.card-lab.finishes.v1`:
  ```json
  {"version":1,"front":"engraved","back":"mosaic","logo":"designed",
   "notes":{"front:engraved":""},
   "pairings":[{"edition":"table-reveal","front":"engraved","back":"mosaic","logo":"designed","note":"","context":"panel"}],
   "updatedAt":""}
  ```
- **Saving pairings:** add "Save this pairing" under Your picks, up to 12.
- **Export:** the existing object plus a `finishes` key.
- **No effect on the game:** no product code reads the new key, and Prefer never touches `preferred`.
- **URL:** add the `finish`, `back`, `logo` and `view` parameters.

**Markup.** Rendered in this order inside the card:
- `.cl-card__finish` (a span holding the `<img alt="" loading="lazy" decoding="async">`).
- `.cl-card__sheen`.
- Velvet's `.cl-card__gem` corners.
- The rail; for Foil it goes inside the plate instead.
- `.cl-card__art`, containing Engraved's `<svg class="cl-card__aperture" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M.5 .5H88L99.5 12V99.5H.5Z"/><path d="M4 4H86L96 14V96H4Z"/></svg>`.
- `.cl-card__plate`, wrapping the information, verdict, Foil rail, footer and mission.

For Cut, the finish span goes inside `.cl-card__cut`.

**CSS** (new `card-finishes.css`, lab only). Wherever an edition or context overrides padding, set `--card-pad` and `--pad-b` to match: Foil 18/18, Foil in the panel 18/14, Glance Plus in the panel 16/10.
```css
.cl-card{--pad-b:14px;--frame:8px;--px:4px}
.cl-card[data-size=l]{--pad-b:18px;--frame:10px;--px:5px}
.cl-card[data-size=xs]{--pad-b:10px;--frame:6px;--px:3px}
.cl-card__finish{position:absolute;inset:0;z-index:-2;overflow:clip;border-radius:inherit;border:var(--rim,0px) solid var(--rim-ink,transparent);pointer-events:none}
.cl-card__finish>img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0}
.cl-card__sheen{position:absolute;inset:0;z-index:-1;pointer-events:none;transform:translateX(-120%);background:linear-gradient(105deg,transparent 34%,#ffffff29 46%,#d5baff33 50%,transparent 60%)}
.cl-card:is([data-finish=prism],[data-edition=foil],[data-face=back][data-back=prism]) .cl-card__sheen{animation:cl-glint calc(900ms*var(--b-motion,1)) cubic-bezier(.3,.6,.2,1) calc(200ms*var(--b-motion,1)) both}
@keyframes cl-glint{to{transform:translateX(120%)}}
.cl-card__art::before{position:absolute;z-index:-1;pointer-events:none}
.cl-card__plate{display:contents}
.cl-card[data-host=full]:not([data-finish=stock]){background:var(--finish-base)}
.cl-card[data-host=full]:not([data-finish=stock]) .cl-card__art>:is(.bait-card-art,.cl-pixel-art){clip-path:inset(8.333% 0)} /* sprite never enters rail or plate */
.cl-card[data-host=full]:not([data-finish=stock]) .cl-card__plate{display:flex;flex-direction:column;flex:1 0 auto;align-self:stretch;
  margin:-2px calc(var(--frame) - var(--card-pad)) calc(var(--frame) - var(--pad-b));
  padding:2px calc(var(--card-pad) - var(--frame)) calc(var(--pad-b) - var(--frame));
  background:var(--plate);box-shadow:inset 0 1px 0 var(--plate-edge);border-radius:3px 3px 6px 6px}
.cl-card[data-host=full]:not([data-finish=stock]) .cl-card__rail>*{margin-inline:-7px;padding:2px 7px;border-radius:3px;background:var(--plate)}
.cl-card[data-finish=prism]{--finish-base:#0e0a16;--plate:#1d1824;--plate-edge:#c9a8ff80}
.cl-card[data-finish=engraved]{--finish-base:#1c1328;--plate:#1a1422;--plate-edge:#c9a8ff4d}
.cl-card[data-finish=velvet]{--finish-base:#140c1f;--plate:#211d26;--plate-edge:#d9cfe826}
.cl-card[data-finish=spotlight]{--finish-base:#120d1a;--plate:#16121c;--plate-edge:#c9a8ff99;--rim:var(--frame);--rim-ink:#100c17}
.cl-card[data-finish=dither]{--finish-base:#0d0a12;--plate:#16121c;--plate-edge:#3b1a7a}
.cl-card[data-finish=prism] .cl-card__art::before{content:'';inset:-4% -4% 0;border-radius:4px 12px 4px 4px;background:#120b1fe6;box-shadow:inset 1px 1px 0 #e9dcff59,inset -1px -1px 0 #000}
.cl-card[data-finish=velvet] .cl-card__art::before{content:'';inset:-3% -3% 0;border-radius:50% 50% 8px 8px/26% 26% 8px 8px;background:#08040e61;box-shadow:inset 0 10px 14px -6px #000c,inset 0 0 0 1px #c9a8ff26}
.cl-card[data-finish=spotlight] .cl-card__art::before{content:'';inset:-7%;border-radius:50%;background:#100c17;box-shadow:0 0 0 2px #9146ff,0 0 0 5px #100c17,0 0 0 6px #c9a8ff66}
.cl-card__aperture{display:none;position:absolute;inset:0;z-index:-1;width:100%;height:100%;fill:none;stroke:#c9a8ff59}
.cl-card__aperture path{vector-effect:non-scaling-stroke}
.cl-card[data-finish=engraved] .cl-card__aperture{display:block}
.cl-card[data-host=full]:not([data-finish=stock]) .cl-card__foil{display:none}
.cl-gallery__grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:40px 28px;justify-items:center}
@media(max-width:760px){.cl-gallery__grid{grid-template-columns:1fr;justify-items:start}}
@media(forced-colors:active){.cl-card__finish,.cl-card__sheen,.cl-card__aperture,.cl-card__gem,.cl-card__art::before{display:none}}
```

**Public dev gallery** (requirements only, no authentication):
- **Static page:** a static entry renders the lab without the session gate.
  - Copy: "Development preview. Synthetic rounds. Nothing here reads or changes a live game."
  - Drop the Sound Lab and the `/product-review` link from this build.
  - Add `<meta name="robots" content="noindex,nofollow">`.
- **Hidden on production:** extend `isUnpublishedPath` to `/^\/(?:lab|card-lab)(?:\/|$)/i`. Add worker tests for `/card-lab`, the trailing slash, uppercase, encoded paths and assets. Serve the finish assets under `/card-lab/`, with no landing link, sitemap entry or production tag.
- **CSP-safe:**
  - same-origin files only, with no data URIs, no `style` attributes in served HTML (React's CSSOM styles are fine) and no fetch;
  - the wordmark mask path must resolve under the landing's `/assets/brand/`.

## 5. Motion, accessibility, mobile, acceptance and pairing

**Motion**
- **Allowed motion:** the existing 280 ms deal, the 630 ms Table Reveal resolve, the 420 ms flip and the Prism sweep. The sweep runs once per mount: on deal, replay or the OBS reveal.
- **Foil edition:** remove the pointer-following tilt and use the same one-shot sweep. This is the only change to a preserved edition, and your motion rule requires it.
- **At rest:** nothing idles, loops or follows the pointer.
- **Reduced motion** (OS setting or the lab toggle): no sweep, stagger, curtain, resolve or turn. Prism still reads as foil because its light is baked into the image.

**Accessibility**
- Finish layers are decorative, and card labels don't change.
- Gallery meaning lives in the captions and buttons.
- Forced colors drops the materials and keeps the existing Canvas rules.
- The white focus ring stays on every swatch and button.

**Mobile**
- At 320 px the stage and gallery are one column with no horizontal scroll.
- Stage requests only the chosen front and back images; gallery images lazy-load.

**Acceptance checklist**
1. **Assets:** each image passes the generation checks with provenance recorded; WebP is 160 KB or less and the swatch 8 KB or less.
2. **Composite:** the six stress sprites stay readable on every front at 288 px on 1× and 2× screens.
3. **Boxes don't move:** for every hosting edition × every finish × KALEIDOSCOPE live, ALCHEMY caught, MARSHMALLOW pending, BANANA live and the synthetic word, at XS, S and L and in the panel and phone contexts:
   - word, clue and clock boxes match Stock within 0.5 px;
   - the word stays on one line.
4. **Panel fit:** the 318×500 badge matches Stock for every finish.
5. **Phone:** at 320 px, `scrollWidth ≤ innerWidth` in Stage and Gallery.
6. **No text on art:** rail tabs and plates compute to opaque, and no sprite pixel appears below its window.
7. **Contrast:**
   - all 78 inks on each plate are at least their ratio on `#242426`;
   - rail text is at least 4.5:1;
   - the Prism back's ink wordmark is at least 4.5:1.
8. **Motion:**
   - no `infinite` and no card `pointermove` handlers;
   - the sweep runs once;
   - every animation computes to none under reduced motion.
9. **Keyboard:** tab order is top bar → Edition → Finish → Back → Wordmark → Word and state → Stage → Gallery → Picks. The new keys work only on the focused stage.
10. **Forced colors:** no images, sheen, window or gems; cards stay readable.
11. **Picks:**
    - a saved v1 fixture is unchanged after using finishes;
    - the export includes `finishes`;
    - a grep test confirms no product source references the new key or `/card-lab/`.
12. **Wordmark:** only `baited-original-mask.svg` appears; no hook or bomb assets.
13. **Dev only:**
    - production returns 404 for every `/card-lab` variant;
    - dev returns 200 with noindex;
    - no landing links to it;
    - no CSP violations in the console.

**Suggested first pairing (for the owner to decide)**
- **Everyday:** **Table Reveal × Engraved × Mosaic back, wordmark on.**
  - Table and the pixel-to-sharp reveal are already your favorites.
  - Engraved is the quietest premium stock and makes the card read as a secret.
  - Mosaic's tiles flow into the pixel-to-sharp front.
  - Nothing moves while it sits beside a stream.
- **Win reveal:** **Foil × Prism × Prism back**.
- **How to judge them:** look at KALEIDOSCOPE, GHOST (a violet sprite) and BANANA (a gold sprite) in the 318×500 panel before choosing. Neither choice sets the game's edition.

**What I didn't check**
- I didn't open `baited-wordmark-b.png` or the `serveReviewHost` package.
- The Twitch console capture isn't card evidence.
