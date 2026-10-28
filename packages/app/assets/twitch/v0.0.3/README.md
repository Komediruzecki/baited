# Baited 0.0.3 Twitch listing assets

All three images use the taskbar icon's design: the landing's pixel B favicon,
the wordmark's B in deep ink `#160033` centred on the violet `#7721e5`. Each is
drawn from the landing's grid (`packages/landing/site/pixel-logo.js`) with every
square on whole pixels. The original lettering, earlier variants and `v0.0.1`
listing exports remain unchanged.

| File | Twitch Version Details field | Size | Pixels per square |
| --- | --- | --- | --- |
| `logo-100.png` | Logo Image | 100 × 100 PNG | 7 |
| `icon-24.png` | Taskbar Icon Image | 24 × 24 PNG | 2 |
| `discovery-300x200.png` | Discovery Image | 300 × 200 PNG | 14 |

The taskbar icon is for video-component Extensions. Editable SVG exports,
source references and PNG hashes are included alongside the images.

From the repository root, reproduce with:

```sh
node packages/app/scripts/build-twitch-brand-assets.mjs --version 0.0.3
```

It needs only Node; the PNGs are painted square by square, with no SVG renderer
to blur an edge. Use `--out-dir /absolute/path` to export a
separate copy. The script writes listing assets only; it does not change the
Studio or Extension frontend assets. Writes into the archived `v0.0.1` folder
are rejected.

Upload these PNGs in Twitch's Version Details for 0.0.3. They are separate from
the frontend ZIP. Keep the category **Games in Extensions** and use screenshots
of the running product. These exports do not upload anything, change the
Extension state or submit it for review.
