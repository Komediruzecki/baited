# Artwork for your card

This guide describes the image-authoring source build. Deployment, Twitch asset upload and the first live custom-image round are separate acceptance steps.

## Add an image

In **Studio → Cards**, open a pack and a card. **Upload image** accepts a still PNG, JPEG or WebP up to 5 MB and 2048 pixels per side. Use artwork you own or have permission to share. The server checks it, removes metadata and saves a PNG up to 512 pixels per side. Your image appears in the existing Cut Open card; the word, clues and timer remain separate, readable text.

An upload changes the current edit. **Save draft** or **Save changes** attaches it to the saved pack. A round already in progress keeps the image it started with.

**Saved images** lets you reuse your channel's artwork. **Remove from card** only changes the card; it does not delete the stored image. In Saved images, Delete removes an image only when no pack, current round, retained result or dependent artwork uses it. Archived packs still count as references. There is room for 400 approved images, including import sources, within 100 MB per channel.

## Draw, pixelate or make ASCII art

Choose **Draw pixel art**, or **Edit as pixel art** for an existing image.

- Draw on a 32, 48 or 64 pixel grid. Use Pencil, Eraser, Fill, brush sizes and mirror drawing. Undo and Redo preserve edits.
- Choose Baited, Arcade or Ink colours, or pick your own colour.
- Start with an original portrait, wizard or heart preset. Add hand-drawn head, face, hat, cap, moustache, glasses, spark and heart stamps.
- Import an image and keep its colours or reduce it to a palette, with optional dithering. It fits inside the grid without stretching.
- Switch between Pixels and ASCII. The ASCII version uses coloured characters and can also be copied as text. These are deterministic Canvas 2D conversions; no image-generation provider is called.
- Use the arrow keys to move the drawing cursor, Space or Enter to draw, and Delete to erase. The canvas also supports pointer and touch drawing.

**Use this artwork** checks and saves the rendered PNG. For an import, the original source is checked separately before the converted result. A failed check leaves the editor open so you can change or export the drawing. Save the pack after applying. Unsaved drawings remain in the tab, not in a durable cloud document. Reopening a saved image imports its PNG back into the pixel grid.

## What the content check does

The backend runs NSFWJS MobileNetV2Mid locally, on CPU, in a worker. It screens for sexual imagery. Unknown output, a failed model, a timeout or an uncertain result prevents the upload from being approved. Transparent art is checked against light and dark backgrounds. Original uploads and rejected bytes are not retained; approved, normalized PNGs are stored with their model and policy version.

This is a mitigation, not a guarantee. The model can miss sexual imagery or reject a harmless picture, especially stylized pixel or ASCII art. It is not a general violence, hate or abuse detector. Pixelation does not make an image safe. The broadcaster remains responsible for what they put on stream. There is no public community gallery or automated promise that every uploaded image is suitable for Twitch.

One worker processes images with a queue of at most two jobs and a 45-second deadline per job. Its V8 heap limit does not cap all native/WASM memory. The game loop does not run inference. Upload frequency, decoded size and stored bytes are bounded separately.

## Privacy and Twitch delivery

Only the signed-in owner can upload, list, attach or remove artwork. Writes require the existing session, origin and CSRF checks. Cards store immutable IDs, never arbitrary remote image URLs. Approved bytes are hash-checked when read.

The live Studio and OBS feed do not receive the active card image. An authorized viewer receives a signed URL tied to the room, round and immutable image. Confirmed catches and escapes may reveal their image; pending or rejected catches do not reveal it to OBS. URLs are stable during polling, and old artwork remains while a saved result refers to it. Deleting Baited account data removes the owner's artwork and card packs.

For the native Twitch panel, upload the rebuilt Extension assets and add **https://play-baited.maff.app** to the Extension's **Allowlist for Image Domains** in the Developer Console. URL fetching and image domains are separate settings. The standalone viewer needs no Twitch asset upload. Browser tests do not establish that this Console change or a new Hosted Test upload has happened.

## Review before a live round

Check a harmless photograph, a transparent illustration, a pixel drawing and an ASCII conversion. Try a broken or oversized file, save and reload a pack, then play a custom-image round with a second viewer. Confirm that Studio and OBS keep the image hidden until an allowed result. Review the artwork yourself before starting a stream.
