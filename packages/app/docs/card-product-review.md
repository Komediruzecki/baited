# Baited card and product review

Updated 27 October 2026. Card Lab is a development-only design review. The native Extension v0.0.2 has separately been uploaded to Twitch Hosted Test; see the release receipt below.

## What is ready to review

The earlier **78-card collection is already on main and development at `d93edb9`**. This pass adds ten Card Lab directions and updates the local standalone viewer, native Twitch viewer/configuration, streamer Studio and OBS presentation. The product keeps the current card edition until the owner chooses a replacement. Selecting a preference in the lab does not change the game.

The Card Lab changes are authorized for main and the development domain only. Production excludes the lab and its assets; there is no production release tag in this pass. Twitch accepted the redesigned native viewer/configuration ZIP as v0.0.2 in Hosted Test on 27 October. The hosted Studio was rebuilt and restarted separately; signing in and checking the microphone again remain user steps. Activation of v0.0.2 on the channel has not been verified. The repository remains private.

Opus 5.5 completed its design inspection in **26m59s** through the owner-authorized personal login. **Max effort and a 45-minute limit were requested; the CLI did not attest the effective effort level.** Its specification is a design plan, not proof of browser measurements or visual acceptance.

A second Opus 5.5 lead-design pass completed in **23m36s**, again with Max effort requested and a 45-minute bound. It defined the materials, composition rules and all seven image prompts. Read the [material design](card-surfaces-opus-design.md), [exact prompts](card-surface-prompts.json) and [asset provenance](card-surface-assets/README.md). Table Reveal × Engraved × Mosaic is its suggested first pairing, not an applied product choice.

A third Opus 5.5 inspection completed in **23 minutes** and specified the code-only Glass finish from the supplied video reference. Max effort was requested within a 45-minute bound; effective effort was not reported. The first attempt ended from an external termination signal without an answer. Read the [Glass design](card-glass-opus-design.md) and [source observations](glass-reference.md). The adaptation displaces decorative lines under a smoked block, keeping sprites and text separate. **Bend glass** provides a flat/bent comparison without changing saved edition choices.

## Glass inspection

Local Chromium checks used the built standalone development bundle. The real **Bend glass** control visibly changed the ruled background while preserving the card, art and word boxes exactly. The 294×324px GHOST card in the 318×500 mock panel had identical rail, art, word and footer boxes to Stock. The transparent sprite loaded, and no foreground ancestor had a filter or backdrop filter.

BANANA/Table Reveal and ARCHIPELAGO/Glance Plus fit the mock panel, GHOST/Cut fit the 190px Studio card, and VOLCANO/Table Reveal fit the 360px desktop card. At a 320×740 viewport, the gallery had a 305px document width and 255px cards with no horizontal overflow. All live SVG IDs were unique and their local filter references resolved. Forced-color emulation hid the Glass lens and its backing layer while keeping words visible. The inspected final panel reported no console warnings or errors.

Six focused SVG tests passed, including 64 sibling lenses, resource-reference isolation, deterministic rendering and the flat fallback. Nine material-model tests passed. These are local Chromium and synthetic-host checks; Firefox, WebKit, physical phones and Twitch-hosted acceptance of Glass remain unverified. No idle performance trace was recorded.

The earlier local Wrangler process also stopped unexpectedly during navigation. CI's structural stack located the fatal path in Wrangler 4.119.0's ProxyWorker error handling. Cloudflare fixed that path in [Wrangler 4.129.1](https://github.com/cloudflare/workers-sdk/pull/15252), which is now pinned exactly. Installed-source inspection confirmed the upstream GET/HEAD retry and nonfatal individual-request handling. The original nested exception was lost from the older diagnostics, so its precise transport trigger remains unconfirmed.

The safe supervisor preserves exit status and forwards structural diagnostics without messages or authentication headers; its seven focused tests passed. The unchanged nine-case Chromium suite passed locally with 4.129.1, and a frozen install accepted the scoped lockfile. Fresh PR CI remains the complete gate before merge. There are no suite retries or automatic server restarts.

## Materials and backs

The lab preserves all ten editions and adds seven front finishes (Stock, Dither, Prism, Engraved, Velvet, Spotlight and Glass) and five back choices (Current, Dither, Mosaic, Prism and Seal). Seven generated textures are separate from the word, clues and original BAITED wordmark, which remain in code. Dither is generated deterministically in code. No generated lettering, hooks or bombs were introduced.

Use **Gallery** to compare the finishes, backs and six gameplay states. **Stage** keeps the exact panel, phone, desktop and Studio studies. Current, Pixel and Wide retain their own front stock; selecting a material from their gallery uses Table so the result matches its preview. Back choices work across editions. **As designed / On / Off** controls the wordmark on backs.

Finish/back preferences and up to twelve saved pairings use a separate browser-storage key. Existing edition picks and their export are preserved. **Download full review** includes both sets. None changes the live game.

The development route is [dev.baited.maff.app/card-lab/](https://dev.baited.maff.app/card-lab/?view=gallery). It is unlinked and marked noindex; an unlinked URL is not access control. Production must return 404 for this route and every material asset.

## Open the previews

Connect to the same local network as the Linux computer.

| Preview | Link | Purpose |
| --- | --- | --- |
| Card Lab | [192.168.178.33:3335/card-lab](http://192.168.178.33:3335/card-lab) | Compare the ten editions using the same word and state. Synthetic examples only. |
| Standalone materials | [192.168.178.33:4374/card-lab/](http://192.168.178.33:4374/card-lab/?view=gallery) | Latest editions, front finishes and backs, using the same static build as development. |
| Product review | [192.168.178.33:3335/product-review](http://192.168.178.33:3335/product-review) | Switch between local Studio, viewer, OBS and card views at different sizes. |
| Studio | [192.168.178.33:3335/studio](http://192.168.178.33:3335/studio) | Use the local demo controls and inspect the operating layout directly. |
| Native Extension | [192.168.178.33:3334](http://192.168.178.33:3334/) | Viewer/configuration fixture harness, including waiting, hard-word, review and reconnect states. No Twitch connection. |
| Landing | [192.168.178.33:4373](http://192.168.178.33:4373/) | Local landing and branding comparison. |

These are visual/demo previews. LAN HTTP does not provide the trusted secure context needed for microphone access. The product-review frames explicitly disable the microphone too. Use the separately configured trusted HTTPS Studio for a real speech test; these links do not replace Hosted Test.

## The ten directions

| Edition | What to judge |
| --- | --- |
| **Current** | Reference study of the present landing layout. Compare the alternatives against it. |
| **Table** | Opus's proposed everyday card: charcoal face, larger centered art, exact word and readable clue chips. |
| **Glance** | Fewer labels and more space for the art/word. Test whether the icons are understandable with and without their labels. |
| **Cut** | A violet field with an angled edge and stronger type. Check long-word contrast and balance. |
| **Pixel** | A game-item screen with stepped edges and a pixel-grid composition. Check that decoration leaves enough room for the clues. |
| **Foil** | A reflective frame that follows the pointer. The owner approved keeping it for a special edition; inspect touch and reduced-motion behavior too. |
| **Wide** | A horizontal desktop card. It falls back to Table in smaller contexts; compare it in Desktop viewer. |
| **Picture** | Experimental picture-led face with the exact word available on demand. Use “Always show Picture's word” to compare. Clues remain readable and the game still matches the exact target word. |
| **Table Reveal** | Table with a 630 ms coarse-to-sharp artwork reveal. Text and clues stay sharp throughout. |
| **Glance Plus** | Larger chat/clock/help symbols, larger artwork, clearer clue grouping and the same artwork reveal. Toggle the icon labels to compare. |

Start with **Compare**, choose up to four editions, then inspect a short word and the stress examples **kaleidoscope, marshmallow, alchemy and archipelago**. Check the 318 × 500 Twitch-panel and 320 × 640 phone contexts, a hard card with four clues, waiting/reconnecting, pending catch and final result.

Use **Show back**, **Replay deal**, **Preview reduced motion** and the OBS reveal scrubber to judge motion without making it responsible for readable information. The lab also includes an explicitly synthetic word without artwork to show the fallback.

Choose **Prefer …**, add a note under **Your picks**, then use **Download choices** or **Copy choices**. Preferences are stored only in that browser. Export them so Paolo's choices can be compared with yours. None of these actions applies an edition to the live game.

## Product review priorities

- Can a viewer read the target, forbidden clues, clock and skip status without scrolling or guessing?
- Does Studio make connection/microphone state and the next action clear? The pending catch must show the word immediately beside the confirmation decision.
- Does OBS show one readable result while protecting the active target?
- Do the plain Baited logo, violet/charcoal palette and restrained yellow match the landing?
- Check keyboard focus, reduced motion and your actual phone/tablet as well as the desktop-sized previews. Fixture screenshots do not prove Twitch or OBS acceptance.

Record the preferred everyday edition, any special editions to keep, and the specific screen/state that needs polish. Six labelled gallery candidates are now prepared from local captures and existing artwork. A seventh staged-hero image is held for review only and needs a final re-render after the edition is selected. Owner review, real Twitch/OBS/Codex evidence and the Devpost video remain outstanding.

## Restart the previews

Run each service in its own terminal. The app serves the built output; after app source changes, rebuild first:

```sh
rtk proxy pnpm --dir /home/maff/foss/worktrees/baited/card-expansion-60 --filter @baited/app build
```

App, Studio, Card Lab and product review:

```sh
rtk proxy env PREVIEW_PORT=3335 PREVIEW_SECONDS=10800 PREVIEW_DATA_DIR=/run/media/maff/Game_Shared/agent-out-live/baited/2026-10-26/cc1a9ad218b14548b32b7abc473534cc/scratch/preview-data node /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/scripts/preview-local.mjs --host 192.168.178.33
```

Native Extension fixture preview:

```sh
rtk proxy env EXTENSION_PREVIEW_PORT=3334 EXTENSION_PREVIEW_SECONDS=10800 node /home/maff/foss/worktrees/baited/card-expansion-60/packages/app/scripts/preview-extension.mjs --host 192.168.178.33
```

Landing:

```sh
rtk proxy timeout --signal=TERM --kill-after=10s 10800s pnpm --dir /home/maff/foss/worktrees/baited/card-expansion-60/packages/landing exec wrangler dev --env dev --local --ip 192.168.178.33 --port 4373 --inspector-port 9373 --compatibility-date 2026-08-08
```

Latest standalone Card Lab and landing:

```sh
rtk proxy timeout -s TERM -k 5s 10810s pnpm --dir /home/maff/foss/worktrees/baited/card-expansion-60/packages/landing exec node scripts/browser-server.mjs --host 0.0.0.0 --port 4374 --inspector-port 9374 --lifetime-ms 10800000
```

Each session is bounded to **three hours**. **Ctrl+C** stops that terminal's preview sooner. The app and native scripts use strict ports; keep the landing and inspector on their explicit ports too. If a requested port is occupied, inspect the terminal/process owner and reuse the intended preview or stop that exact session. Do not kill unrelated processes or silently accept another port.

These commands assume the current checkout, installed dependencies and registered output directory still exist. If the computer's LAN address changes, update the `--host`/`--ip` value and the review links together. The app preview intentionally refuses a checkout containing a `.env` file; use the credential-free preview setup instead of copying live secrets into it.

## Related material

- [Prepared gallery candidates and their evidence labels](../submission/media-review/README.md)

- [Opus card and product specification](card-product-design-spec.md)
- [Current Devpost submission packet](../devpost-submission.md)
- [Technology and evidence boundaries](devpost-stack.md)
- [Gallery and 2:50 demo plan](/home/maff/.dotfiles/personal/games/baited/submission-media-plan.md)

After the owner chooses, apply the selected card edition, polish the affected states, verify the final build and capture the actual product. The everyday edition is still undecided. Carry the selected edition into the landing only after that choice. No production tag or Twitch review submission was created. See [v0.0.2 Hosted Test receipt](releases/extension-v0.0.2.md) for the separate upload status.
