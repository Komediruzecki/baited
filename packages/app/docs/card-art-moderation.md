# Card artwork

Implementation note, 28 October 2026. This work adds owner-created artwork to Cards in Studio. It does not enable public pack discovery or viewer uploads. Source and local tests are complete; a new hosted build and Twitch asset-policy check are separate release steps.

## Make an image

Open a card in **Cards** and choose **Upload image** or **Draw pixel art**. Start with an image or draw pixels. The editor converts images into pixels or ASCII, with a fixed palette and a transparent background option. It stays in the browser and uses a 2D canvas, without a GPU model or external generation service.

Imported images must be still PNG, JPEG or WebP files up to 5 MiB, 8192 pixels on either side and 32 megapixels in total. File size and pixel dimensions are separate limits: a small JPEG can contain a large photo. Accepted photos are automatically fitted without cropping or stretching. Saving an import sends the entire original image for a server check first, then checks the rendered version separately. A drawing is checked when saved. If either check cannot clear the image, it cannot become card artwork. Keep the editor open to retry or use a text card.

The server stores normalized PNG images up to 512 pixels per side. It removes metadata and preserves transparency. Raw uploads and rejected images are not written to disk. The artwork raster is saved; the editable brush history is not a server document.

A channel can retain 400 images, including source images and previous versions, up to 100 MiB. Remove unused images from the artwork library when needed. An image used by a card, a retained round or another image's source cannot be removed until those references are gone. Account deletion removes the channel's images too.

## What the check does

The server runs **NSFWJS 4.4.0 / MobileNetV2Mid** on the CPU, using TensorFlow.js WASM in a bounded worker thread. The model returns five image classes, including sexual-content classes. It does not check for every kind of harmful content, prove that an image is suitable for Twitch, or verify that the creator owns it. Pixel art and ASCII can be misclassified. A successful check is a mitigation, not a safety guarantee. [NSFWJS documentation](https://github.com/infinitered/nsfwjs)

The application checks a white and a dark composite so transparency cannot hide the visible image against one background. Each composite is resized to the model's 224-pixel input; fine detail can be lost. The original import and final edited raster go through independent checks. The final record binds its own hash to an approved source ID and source hash owned by the same channel. That records which approved source was used; it cannot prove how an arbitrary raster was created before upload.

The starting policy is fixed in `shared/card-art-policy.ts`:

| Outcome | Condition on either composite |
| --- | --- |
| Blocked | Porn + Hentai ≥ 0.25, or Sexy ≥ 0.50, or Porn + Hentai + Sexy ≥ 0.50 |
| Uncertain | Porn + Hentai ≥ 0.08, or Porn + Hentai + Sexy ≥ 0.20, below a blocked condition |
| Accepted | Both composites are below those thresholds and have all five valid scores |
| Unavailable | Missing, duplicate or invalid scores; probability sum outside 0.98–1.02; wrong model hash; model, decoder or worker failure |

Blocked, uncertain and unavailable results all prevent attachment. There is no bypass button. These are conservative product thresholds, not measured accuracy figures. Changing them requires a new policy version and validation; a timeout never becomes approval.

An external moderation service could broaden category coverage later, but images would leave this server and require a separate privacy and provider decision. One hosted moderation endpoint reviewed for this supports images and is currently free; some of its categories are text-only, and its documentation says it is not a CSAM detection system. This implementation does not call any external moderation service or use an external moderation key.

## Runtime and provenance

The selected model is bundled in the pinned `nsfwjs@4.4.0` dependency, loaded through `nsfwjs/core` and `nsfwjs/models/mobilenet_v2_mid`. It is not fetched at upload time and is not shipped to the browser or Twitch ZIP. The upstream code and model project provide MIT notices, with the model project's stated third-party-material qualification preserved in `licenses/nsfw-model/LICENSE`. Dependency notices are retained by `scripts/licenses.mjs`. [NSFWJS license](https://github.com/infinitered/nsfwjs/blob/master/LICENSE), [upstream model license](https://github.com/GantMan/nsfw_model/blob/master/LICENSE.md)

Verified bundled model material:

- Weight bytes: **4,300,775**.
- JSON topology after `JSON.stringify`: **135,274** bytes.
- SHA-256 of serialized topology followed by decoded weight bytes: `70d00d1ec460f74698ffa29ad6b9b754b95430efc4b9827f630ae44a856538e3`.

The worker checks this fingerprint before loading. `scripts/copy-card-art-runtime.mjs` copies its entrypoint beside the bundled backend. It receives an empty environment and no inherited Node arguments. It has no inherited credentials and rejects network fetches. This is not an OS sandbox: the worker shares the process user’s filesystem privileges. Sharp and WASM each use one CPU thread. The queue holds at most two jobs, each with a 45-second deadline; a queued request can therefore take up to 90 seconds. The V8 heap is limited to 192 MiB, but that is **not** a limit on native, WASM or total process memory. [TensorFlow.js Node guidance](https://www.tensorflow.org/js/guide/nodejs)

On this Linux machine, Node **25.8.2**, the three-image worker check measured hedgehog at **472 ms** cold, then squirrel and bagpipes at **164 ms** each warm. Both alpha composites passed. The process peak RSS was **318 MiB** and the measured main event-loop maximum delay was **10 ms**. This is a local fixture benchmark, not a load test. A separate read-only Docker check on Node 24.22.1, with networking disabled and a 768 MiB container memory limit, loaded the packaged worker and accepted hedgehog, squirrel and bagpipes in 641 ms cold and 199/188 ms warm. The process peak RSS was 230,468 KiB.

The smaller MobileNetV2 model had marked squirrel uncertain because its dark composite assigned 8.31% to Hentai. MobileNetV2Mid cleared those same three benign fixtures with the policy unchanged. This motivated the model choice; no unsafe-image recall or general false-positive rate is established by those examples.

A subsequent bounded pass screened all **100 current built-in PNGs** through both composites: **100 accepted, 0 uncertain, 0 blocked, 0 unavailable** in **15,822 ms**, with **349 MiB** process peak RSS. This is benign-art regression coverage. It does not establish detection performance on harmful uploads, and it does not replace the owner's visual review of the newest artwork.

Sharp validates the declared type against PNG/JPEG/WebP signatures and decoded format, rejects animation and oversized dimensions, decodes with strict warning handling, auto-orients, converts to sRGB and re-encodes to PNG. Header metadata is read before pixel decoding; both the 8192-pixel edge and 32-megapixel area limits are checked there. Every raster decode retains the explicit 32-megapixel/four-channel limits, and the stored image fits inside 512 × 512 without cropping or enlargement. The worker keeps its decoding timeout, single-job processing, queue and memory settings. No SVG, HTML, arbitrary URL fetch or original filename is accepted. [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [Sharp output and metadata defaults](https://sharp.pixelplumbing.com/api-output/)

## API and privacy boundary

All authoring routes require the existing owner session. Writes additionally require origin and CSRF checks. The channel comes from that session. The native Twitch JWT grants no authoring access.

| Route | Behavior |
| --- | --- |
| `POST /api/studio/card-art` | Raw raster bytes. `X-Art-Purpose: source` approves an import; `card` approves a final version. `X-Art-Source` identifies upload/pixel/ascii/draw. `X-Art-Source-Id` binds an approved original. Returns 201 with `art` and `limits` only after persistence. |
| `GET /api/studio/card-art` | Owner's approved source/card records and quota usage. |
| `GET /api/studio/card-art/:id.png` | Session-protected owner preview. |
| `DELETE /api/studio/card-art/:id` | Remove an unreferenced owner image; return the updated library. |
| `GET /api/card-art/round/:room/:round/:art/:capability.png` | Serve the immutable image only for that live viewer round or a retained confirmed caught/escaped result. |

Pack saves accept an approved owner `artId` and copy it into the immutable round snapshot. Only a viewer's active/paused/settling projection receives its signed image URL. Studio and OBS receive no active artwork ID or URL. Confirmed caught/escaped results may expose their image; pending, rejected, skipped and ended results do not. History projections omit both IDs and URLs. A holder of a viewer URL can share it, so these are access boundaries, not a promise of secrecy from viewers.

The capability is stable across polling and binds room, round and artwork ID with HMAC-SHA256. The handler also checks the current snapshot/outcome. A prior viewer URL stops working when its round ends without a confirmed reveal. Artwork filenames and URLs contain no target word or owner ID. Responses use `no-store`, `nosniff` and exact permitted-origin CORS, with cross-origin resource policy for the native card canvas.

The native Extension needs the backend hostname in Twitch's image-domain allowlist for direct image rendering. The existing API fetching allowlist remains necessary. The first client update needs a rebuilt ZIP; later artwork uploads do not. The local Studio allows `blob:` images for editor previews. These changes do not relax script policy. [Twitch Extension policy configuration](https://dev.twitch.tv/docs/extensions/), [submission domain guidance](https://dev.twitch.tv/docs/extensions/submission-best-practices/)

Approved source records and image hashes persist privately in `DATA_DIR/card-art/index.json`; normalized PNGs sit beside it with opaque UUID names. Raw image bytes, model scores and provider error text do not enter logs. Writes are serialized; individual PNG and index replacements are atomic, but the multi-file operation is not a crash-atomic transaction. Reference changes share the artwork lock with deletion. A failed deletion keeps the record available for retry; missing or deletion-pending bytes cannot be attached. Account deletion invalidates in-flight scans and delayed pack saves even if the owner signs in again.

## Verification and remaining acceptance

Focused tests cover ownership, source approval, CSRF/origin checks, malformed/animated/oversized rasters, real model loading, score validation, persistence failure, deletion retry and race conditions, plus viewer/Studio/OBS projections and capability revocation. Mocked classifier results test rejection logic; they do not measure model accuracy. The real-worker fixture test verifies the pinned model and CPU path.

Before enabling hosted artwork, verify the packaged backend in Docker, the rebuilt native ZIP, the exact Twitch image-domain setting, and one real channel round on desktop and iPhone. Keep text fallback usable if an image fails to load. Do not add public submissions or discovery until reporting, moderation review and revocable author roles are designed.
