# Opus Glass design inspection

27 October 2026. Opus 5.5 completed this read-only design consultation in **23 minutes**, with Max effort requested and a 45-minute deadline. The CLI reported Opus 5.5; effective effort remained unknown. An earlier attempt received an external termination signal before returning an answer. The second call used the same default login, model, effort request and deadline in a persistent terminal.

This is a proposed implementation plan, not browser evidence. Codex implements and checks it. The proposed scripted DOM mutations in the acceptance checklist are not used: an actual **Bend glass** control provides matched flat/bent views through the interface instead. No stock selection or live game card is changed. The proposal’s “tuned from screenshots” code comment was replaced with an explicit Opus attribution in the implementation; Opus did not run a browser. The tests exercise rendering behavior rather than mirroring CSS source text. Only Chromium is covered by the local browser inspection so far.

Original answer SHA-256: `680d4b1ab8274d596f4a93b769e3eee0c6d771ab9403231a9b9501748849b004`.

## Glass: a refracting block for the Card Lab

Glass is a smoked glass block set around the item art. It bends a code-drawn copy of the card's own violet light and lines:

- **Outside the block** the lines run straight.
- **Inside the block** they visibly bend.
- **Never filtered:** the sprite, word, forbidden clues and clock aren't inside anything that gets filtered.

It needs no image, no `backdrop-filter` and no motion. This was a read-only consultation and I didn't run a browser, so every visual result below needs Codex's screenshots.

## 1. Reference inspection

Opus checked both contact sheets and eight selected full-resolution frames against the visual research. The source and observed values are recorded in [Glass reference](glass-reference.md). The video does not reveal its complete filter parameters or prove browser compatibility. The settings below are Opus's proposed adaptation.

## 2. The Glass design

**What gets bent, and why it's the tutorial's technique**
- **Same chain:** the turbulence, displacement map, blur, saturate(1.8) and the 1 px lit edge from the tutorial, with one change: the input.
- **The input:** the tutorial filters the page behind its pane; under `backdrop-filter`, that backdrop is what the filter sees. Baited's card is opaque, and what sits "behind" its glass is a scene drawn in code. So the block draws a copy of that scene and runs the chain on the copy.
- **Same functions:** CSS `blur()` and `saturate()` are defined as `feGaussianBlur` and `feColorMatrix type=saturate`, so writing them as SVG filter steps is the same chain.
- **What's bent:** only that decorative copy, the violet field and the straight paper lines. It repeats the tutorial's own comparison: straight outside the pane, bent inside it.

**Why not `backdrop-filter: url()`**
- I can't confirm browsers support it, and the tutorial doesn't establish that either.
- Behind a card there's only a flat stage gradient, a panel color, the Studio desk or the fanned card backs. There's nothing to bend, and the card would look different on every host.
- It would also make the card see-through.

**Layers, bottom to top (full-card editions)**

| Layer | Spec |
|---|---|
| Card background | `--finish-base:#120D1A`, which also fills the bottom band |
| `.cl-card__finish` (z −2) | **Ruled light**:<br>• `linear-gradient(#9146FF, #5B25C2 30%, #2A1160 56%, #120D1A 82%)`<br>• lilac corner light `radial-gradient(70% 36% at 100% 0, #C9A8FF59, transparent)`<br>• straight `#FFFDF7` lines at 22%, rising at 60° toward the card's large top-right corner<br>• no filter |
| `.cl-glass`, first child of `.cl-card__art` (z −1 in the art's isolated context) | **Glass block**:<br>• the art box plus 10% left, right and bottom, flush at the top<br>• in the Glance Plus panel the art touches the rail (`card-design-lab.css:218`), so the block can't rise<br>• corner radius 12/20/12/12 (S), 14/24/14/14 (L) and 8/14/8/8 (XS)<br>• holds the filtered copy: gradient `#8C43F9→#241050` (the field's colors at the block's edges) and lines at 30% |
| `.cl-glass::after` | • **Smoke for the sprite:** `#0D0A12` at 65% behind the art center, fading to 30%, then 10% at the rim. Bends stay vivid at the edges and quiet behind the item.<br>• **Lit edge:** `inset 0 1px 0 #FFFDF75C`, the tutorial's geometry and alpha in brand paper.<br>• **Left edge:** `inset 1px 0 0 #FFFDF71F`.<br>• **Edge thickness:** `inset 0 0 0 var(--surface-pixel) #C9A8FF12` (3, 4 or 5 px).<br>• **No broad sheen:** that's what reads as a UI panel. |
| `.cl-glass` outline | `0 0 0 1px #0D0A12B3` (glass edges read dark) plus `0 10px 18px -10px #05030A` |
| Sprite, pixel canvas, "Aa", stamp | Unchanged siblings sitting above the block |
| Rail chips and plate (z 1) | • **Plate:** `#1A1522`, luminance about 0.0087 against Stock's 0.018, so all 78 word colors keep their contrast.<br>• **Plate edge:** `#FFFDF747`.<br>• **Overlap:** the plate covers the block's lower 10%, so the glass tucks behind a solid ledge. |

On **Cut**, the field fills the slab as usual and the block gets `bottom:12px`, so it ends above the slab's 12 px diagonal.

**Optical settings.** These are my own values; none come from the tutorial.

| Size | Line spacing / width | `scale` | `baseFrequency` | Blur σ |
|---|---|---|---|---|
| XS (Studio, 190 px) | 9 / 1.25 px | 24 | `0.022 0.03` | 0.6 |
| S (deck, panel, phone, gallery) | 12 / 1.5 px | 40 | `0.012 0.017` | 0.9 |
| L (desktop, 360 px) | 14 / 1.75 px | 50 | `0.0095 0.0135` | 1.1 |

Every size also uses `fractalNoise`, `numOctaves="1"`, `seed="5"`, alpha (`A`) for both channel selectors, saturate 1.8 and `color-interpolation-filters="sRGB"`. Here's why:
- **Scale:** it follows the tutorial's 80-on-320 px ratio, adjusted for a smaller block. That gives 2–3 broad bends across the block, while keeping the warp's slope below about 0.8 so lines don't fold over themselves.
- **Blur:** it's smaller than 3 px because our lines are finer. It still hides the stair-steps that displacement leaves.
- **Alpha channel:** it pushes pixels along the diagonal, nearly perpendicular to the 60° lines, which is where bending shows most. Alpha also isn't color-converted, so browsers should agree more closely.

**How Glass differs from Prism**

| | Prism | Glass |
|---|---|---|
| Light | Reflects (foil) | Transmits and bends |
| Made from | Generated image | Code only |
| Art window | Flat near-black box | The bent lines are visible around the item |
| Colors | Spectral cyan and rose | Violet, lilac and paper only |
| Motion | One sweep per deal | None |

## 3. Implementation, file by file

**`card-finish-catalogue.ts`**: append Glass at the end, which keeps the gallery order and `[ ]` cycling:
```ts
{ id: 'glass', name: 'Glass', note: 'Smoked glass block. The lines behind it bend.', source: 'code', asset: null, swatch: null },
```

**`CardGlass.tsx`** (new file: pure render, no effects or browser globals, safe for server rendering):
```tsx
import React, { useId } from 'react';
export type GlassSize = 'xs' | 's' | 'l';
// Baited's values, tuned from screenshots. The tutorial's frequency and scale are cropped out.
export const glassOptics = {
  xs: { pitch: 9, line: 1.25, scale: 24, frequency: '0.022 0.03', blur: 0.6 },
  s: { pitch: 12, line: 1.5, scale: 40, frequency: '0.012 0.017', blur: 0.9 },
  l: { pitch: 14, line: 1.75, scale: 50, frequency: '0.0095 0.0135', blur: 1.1 },
} as const;
const rules = new Map<number, string>();
// Straight lines rising 60° toward the large corner, covering up to 400 × 760 px.
export function glassRules(pitch: number) {
  const cached = rules.get(pitch); if (cached) return cached;
  const [nx, ny, reach] = [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 1200];
  let path = '';
  for (let step = 0; step * pitch <= nx * 400 + ny * 760; step++) {
    const [x, y] = [nx * step * pitch, ny * step * pitch];
    path += `M${(x - ny * reach).toFixed(2)} ${(y + nx * reach).toFixed(2)}L${(x + ny * reach).toFixed(2)} ${(y - nx * reach).toFixed(2)}`;
  }
  rules.set(pitch, path); return path;
}
export function GlassField({ size }: { size: GlassSize }) {
  const optics = glassOptics[size];
  return <svg className="cl-glass-field" aria-hidden="true" focusable="false"><path d={glassRules(optics.pitch)} fill="none" stroke="#fffdf7" strokeOpacity={0.22} strokeWidth={optics.line} /></svg>;
}
export function GlassLens({ size }: { size: GlassSize }) {
  // Each card owns its filter. React IDs can contain colons or guillemets, so keep url(#…) to [\w-].
  const id = `cl-glass-${useId().replace(/[^\w-]/g, '')}`;
  const optics = glassOptics[size];
  return <span className="cl-glass" aria-hidden="true"><svg className="cl-glass__bend" focusable="false">
    <defs>
      <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8c43f9" /><stop offset="1" stopColor="#241050" /></linearGradient>
      <filter id={`${id}-bend`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={optics.frequency} numOctaves={1} seed={5} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={optics.scale} xChannelSelector="A" yChannelSelector="A" result="bent" />
        <feGaussianBlur in="bent" stdDeviation={optics.blur} result="frost" />
        <feColorMatrix in="frost" type="saturate" values="1.8" />
      </filter>
    </defs>
    <g filter={`url(#${id}-bend)`}><rect width="100%" height="100%" fill={`url(#${id}-light)`} /><path d={glassRules(optics.pitch)} fill="none" stroke="#fffdf7" strokeOpacity={0.3} strokeWidth={optics.line} /></g>
  </svg></span>;
}
```

**`CardDesignLab.tsx`**:
- **Size:** at `:78`, add `const size: GlassSize = compact ? 'xs' : large ? 'l' : 's'` and use it for `data-size`.
- **`FinishLayer` (`:28-31`):** add a `size` prop and, first, `if (finish === 'glass') return <span className="cl-card__finish" aria-hidden="true"><GlassField size={size} /></span>;`. Today it returns `null` for finishes without an image.
- **Call sites:** pass `size` at both `:82` (inside the Cut slab) and `:83`.
- **Art box:** at `:87`, make the first child `{activeFinish === 'glass' && <GlassLens size={size} />}`, before the aperture SVG and the sprite.
- **Result:** the sprite, clues, word and clock stay siblings or cousins of the block, never inside it. The only element with a filter is the `<g>`, and it contains just one `rect` and one `path`.

**`card-finishes.css`**:
```css
/* Glass bends a decorative copy of its own ruled light. Sprites, words, clues and the clock are never filtered. */
.cl-card[data-finish=glass] { --finish-base:#120d1a; --plate:#1a1522; --plate-edge:#fffdf747; --glass-radius:12px 20px 12px 12px; }
.cl-card[data-finish=glass][data-size=l] { --glass-radius:14px 24px 14px 14px; }
.cl-card[data-finish=glass][data-size=xs] { --glass-radius:8px 14px 8px 8px; }
.cl-card[data-finish=glass] .cl-card__finish { background:radial-gradient(70% 36% at 100% 0,#c9a8ff59,#c9a8ff00),linear-gradient(#9146ff,#5b25c2 30%,#2a1160 56%,#120d1a 82%); }
.cl-glass-field,.cl-glass__bend { position:absolute; display:block; pointer-events:none; }
.cl-glass-field { inset:0; width:100%; height:100%; }
.cl-glass { position:absolute; inset:0 -10% -10%; z-index:-1; display:block; overflow:clip; pointer-events:none; border-radius:var(--glass-radius); box-shadow:0 0 0 1px #0d0a12b3,0 10px 18px -10px #05030a; }
/* An SVG is replaced content, so inset alone won't stretch it. The bleed covers the largest displacement. */
.cl-glass__bend { top:-28px; left:-28px; width:calc(100% + 56px); height:calc(100% + 56px); }
.cl-glass::after { content:''; position:absolute; inset:0; border-radius:inherit;
  background:radial-gradient(closest-side at 50% 46%,#0d0a12a6,#0d0a124d 72%,#0d0a121a);
  box-shadow:inset 0 1px 0 #fffdf75c,inset 1px 0 0 #fffdf71f,inset 0 0 0 var(--surface-pixel) #c9a8ff12; }
.cl-card[data-host=slab] .cl-glass { bottom:12px; }
```
- **Forced colors:** add `.cl-glass` to the `display:none!important` list at `:184-186`. The field is already covered by `.cl-card__finish`.
- **Reduced motion:** Glass has no animation, so no rule is needed.

**`card-surface-gallery.css`** (swatch; the bend isn't visible at 28 px, so this is CSS only):
```css
.cl-swatch__image[data-material=glass] { background:repeating-linear-gradient(120deg,#fffdf738 0 1px,transparent 1px 5px),linear-gradient(#9146ff,#2a1160 70%,#120d1a); }
.cl-swatch__image[data-material=glass]::after { content:''; position:absolute; inset:9px 4px 13px; border-radius:3px 5px 3px 3px; background:#0d0a1259; box-shadow:inset 0 1px 0 #fffdf75c,0 0 0 1px #0d0a12b3; }
```

**Units, IDs, fallback and cost**
- **Units:** there's no `viewBox`, so 1 user unit is 1 CSS px. Line spacing, `scale` and σ are literal pixels for each size.
- **Filter region:** it's limited to the block's own SVG, the block plus 28 px on each side (about 267×252 px on S). The 28 px bleed is ≥ `scale/2` at every size, so visible pixels never sample outside the copy.
- **IDs:** `useId` gives each card a stable, unique ID in both `renderToStaticMarkup` and client renders.
  - Why one filter per card instead of the tutorial's single shared `width=0` SVG: sizes need different values, and a shared node makes every card depend on one element staying mounted.
  - Never put the filter inside a `display:none` subtree.
  - If a second React root ever renders cards on the same page, give it an `identifierPrefix`.
- **Content Security Policy:** the card-lab policy (`worker.ts:84-87`) allows inline SVG markup. Don't add an SVG `<style>`, `feImage` or data URIs; the policy blocks them.
- **Fallback:** if a browser drops the filter, the copy draws straight. The block still reads as smoked glass with a lit edge, and nothing loses legibility. Forced colors removes every Glass layer and uses the existing Canvas rules. Nothing feature-detects or depends on `backdrop-filter`.
- **Cost:** no JavaScript, observers or animation frames. The line path is one cached string shared by every card. The gallery paints at most 7 blocks (1 in Front finishes, 6 in the states section) and the stage at most 4. No lazy-mount machinery is needed, because it would cause a visible pop.

**Tests**
- **`tests/card-surface-model.test.ts`:**
  - Add `'glass'` to the finish list at `:8`; the generated-art count stays 4.
  - Add `parseSurfaceUrl('?finish=glass').finish === 'glass'`.
- **New `tests/card-glass.test.ts`** (uses `renderToStaticMarkup` with `React.createElement`, like `result-card.test.ts`):
  1. Four blocks (xs, s, l, s): IDs are unique and match `^cl-glass-[\w-]+-(bend|light)$`, and every `url(#…)` resolves inside its own `<svg>`.
  2. The markup is the recipe: `fractalNoise`, `in="SourceGraphic" in2="n"`, saturate `1.8`, and `scale` matching `glassOptics`. It contains no `feImage`, `image`, `style`, `script`, `text`, `foreignObject`, `animate`, `set`, `data:`, `http` or `style=`.
  3. The only `filter` attribute is on a `<g>` holding exactly one `<rect>` and one `<path>`; `GlassField` has no filter.
  4. `glassRules` returns the same cached string every time, with finite coordinates.
  5. In `card-finishes.css`: no `backdrop-filter` anywhere; Glass blocks contain no `filter`, `animation`, `transition` or `will-change`; the forced-colors block lists `.cl-glass`.
  6. Only `CardDesignLab.tsx` imports `./CardGlass`.

## 4. Acceptance, failure cases and the optional prompt

**Acceptance checks for Codex**
1. **The bend renders (in Chromium, Firefox and WebKit):**
   - Hide sprites by setting their style from script; don't inject a `<style>` tag, which the Content Security Policy blocks.
   - Screenshot `.cl-glass` with and without the `<g filter>` attribute. The two images must differ.
   - The card outside the block must be identical in both.
   - Save the pairs for review.
2. **Owner visual check:** at XS, S and L, at least 2 clear bends inside the block and straight lines around it.
3. **Nothing important is filtered:** `filter` and `backdrop-filter` compute to `none` on the card and on every ancestor of the word, clue chips, clock, sprite image and pixel canvas. Each card has exactly one `[filter]` element.
4. **Boxes don't move:** word, clue, clock, rail and art boxes match Stock within 0.5 px for every hosting edition × XS/S/L × deck, panel, phone, Studio and desktop.
   - The 318×500 panel shows "Fits" wherever Stock does.
   - At 320 px, `scrollWidth ≤ innerWidth`.
5. **Block edges:** the block is never visible below the plate's top edge. On Cut it stays above the diagonal at every size.
6. **IDs on the gallery page with Glass chosen:** all `[id^="cl-glass-"]` are unique and every reference resolves.
7. **Motion:** no animations target Glass elements, and screenshots match with reduced motion on and off.
8. **Forced colors:** no Glass layers render, and the card stays readable.
9. **Nothing else changes:**
   - The other six finishes screenshot the same as before the change.
   - There are no new requests, assets or Content Security Policy errors.
10. **Sprite stress test:**
    - **Words:** ghost, gargoyle, glacier, banana, archipelago, kaleidoscope and "No illustration".
    - **Contexts:** Studio 190 px and the 318×500 panel.
    - **Pass:** outlines intact and nothing busy directly behind the item.
11. **Performance trace:** idle after the deal produces no frames.
    - If the 630 ms pixel reveal repaints the block every frame, add `will-change:transform` to `.cl-glass` only.

**Likely failure cases**
- **Stray SVG:** an SVG without an explicit width and height renders at 300×150, so the block is misplaced.
- **Rim fringe:** if the bleed is smaller than `scale/2`, a dark fringe appears at the rim. Removing the blur brings back stair-stepped lines.
- **Rail or Cut overlap:** any upward extension hits the rail in the Glance Plus panel, and the Cut block can cross the diagonal at XS.
- **ID problems:** unsanitized or duplicate IDs give no bend, or another size's filter.
- **Smoke balance:** too much smoke reads as Prism's dark box; too little gets busy behind violet sprites. Tune in this order: center smoke, then `scale`, then seed (try 5, 11 and 23). If the bends read weaker than the 0:08 frame, raise `scale` first.
- **Shimmer:** lines may shimmer at device pixel ratios of 1.25 or 1.5. If so, switch to 2 px lines at 14 px spacing.
- **Engines differ:** browsers may draw different bends. That's acceptable as long as the bend renders.

**Deal effect:** I recommend none. Glass's stillness is what separates it from Prism.
- If the owner wants one later, a one-time SMIL `<animate>` on `scale` could run on the stage only, and only when reduced motion isn't requested.
- I haven't verified when that animation starts in React-inserted SVG or what it costs per frame.

**Optional image prompt.** I don't recommend generating it, because generators rarely keep lines straight and evenly spaced, and the code version is exact. Use it only if the owner finds the code lines too clean. It's a source texture for the bent copy, not a card or a picture of glass.
```
Flat 2D full-bleed print texture, seen straight-on like a flatbed scan. Portrait 2:3 canvas, 1024 x 1536, filled edge to edge. No margin, border or paper edge. No perspective, shadow, mockup, glass, lens, bubble, reflection or photographed object. Do not draw a card, frame, panel, label or rounded corner. Opaque everywhere.

Material: a backlit violet transparency film printed with evenly spaced straight parallel lines rising from lower left to upper right at 60 degrees above horizontal, 26 px apart and 3 px thick, in pale paper white #FFFDF7 with very slight ink spread. Behind the lines, a smooth light field: electric violet #9146FF along the top edge, fading through #4B1E98 to deep violet-black #120D1A at the bottom, with a soft lilac #C9A8FF glow in the top-right corner. Every line stays perfectly straight, unbroken and evenly spaced across the whole sheet: no waves, warping or distortion.

Strictly no text, letters, numbers, signatures, watermarks, logos, symbols, icons, stars, sparkles, characters, hooks, fish or bombs. No yellow, no gold, no warm colors, no banding.
```

## 5. Recommendation

**My proposal:** build Glass exactly as above, code only, as the seventh finish ("Glass · Code · Smoked glass block. The lines behind it bend."). Judge it first on Table Reveal in the 318×500 panel with GHOST and BANANA. Tune only the smoke, `scale` and seed from screenshots; don't add `backdrop-filter` or an image.

**What I found in the code and the video:**
- `FinishLayer` renders nothing for finishes without an image, so Glass needs its own branch.
- The forced-colors hide list doesn't know about a new element.
- In the Glance Plus panel the art touches the rail.
- The Cut slab drops 12 px across its width.
- The card-lab Content Security Policy blocks inline `<style>` and data URIs but allows inline SVG.
- The tutorial never shows its frequency, scale or channel selectors.
- Nothing in the current materials blocks Glass.

**Not checked:**
- No browser was run.
- Impeccable's `context.mjs` wasn't run because this was read-only.
- 19 of the 26 selected frames were seen only on the contact sheets plus `visual-review.md`.
