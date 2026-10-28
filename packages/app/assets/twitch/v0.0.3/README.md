# Baited 0.0.3 Twitch listing assets

These exports use the current landing page's pixel BAITED wordmark and pixel B
favicon. The logo and discovery image keep the existing card compositions.
The original lettering, earlier variants and `v0.0.1` listing exports remain
unchanged.

| File | Twitch Version Details field | Size |
| --- | --- | --- |
| `logo-100.png` | Logo Image | 100 × 100 PNG |
| `icon-24.png` | Taskbar Icon Image | 24 × 24 PNG |
| `discovery-300x200.png` | Discovery Image | 300 × 200 PNG |

The taskbar icon is for video-component Extensions. Editable SVG exports,
source references and PNG hashes are included alongside the images.

From the repository root, reproduce with:

```sh
node packages/app/scripts/build-twitch-brand-assets.mjs --version 0.0.3
```

Requires librsvg's `rsvg-convert`. Use `--out-dir /absolute/path` to export a
separate copy. The script writes listing assets only; it does not change the
Studio or Extension frontend assets. Writes into the archived `v0.0.1` folder
are rejected.

Upload these PNGs in Twitch's Version Details for 0.0.3. They are separate from
the frontend ZIP. Keep the category **Games in Extensions** and use screenshots
of the running product. These exports do not upload anything, change the
Extension state or submit it for review.
