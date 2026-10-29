# Baited — Twitch Extension 0.0.3 upload

Prepared 28 October 2026. **Ready for an owner upload to Hosted Test. Not uploaded, submitted for review, or released.**

## What changes

Studio, the native panel, configuration screen and card backs now use the approved pixel BAITED lettering from the latest landing. Studio also uses the current pixel B favicon. The approved Cut Open / Glass / Prism cards and pixel reveal were already integrated and stay unchanged.

This package contains the current 100 illustrated cards, custom card image support, native video overlay, and streamer picks / Bait MVP displays. The last recorded Twitch upload is 0.0.2 on 27 October; that receipt did not establish which version is currently activated on the channel.

Use **0.0.3**, not 0.3. The Extension release number is separate from the app package version and the unchanged API schema version, 0.0.1.

## Files

- Upload ZIP: `baited-v0.0.3.zip` — **66,240,447 bytes**, 125 files, 100 card illustrations.
- SHA-256: `a13dcb378f3dd6d83f22103b615fffdef2aa259663cf10f7d87181d8ab036f0d`
- Listing images: `packages/app/assets/twitch/v0.0.3/`: `logo-100.png`, `icon-24.png`, `discovery-300x200.png`.
- The ZIP contains only the allowlisted browser assets and public configuration. It contains no server, credentials or local preview helper.

## Upload and activate

1. Open the [Baited Extension console](https://dev.twitch.tv/console/extensions/54ysfu9jbragbdbvown2n8zrrli0g0). Clone 0.0.2 into **0.0.3** if 0.0.3 does not already exist.
2. In **Asset Hosting**, confirm the paths below. Enable **Video – Fullscreen** if you want the card drawn over the Twitch player.
3. In **Files**, upload `baited-v0.0.3.zip` as-is. Do not wrap it in another folder or ZIP. Wait for Twitch to finish processing it.
4. Check the API/navigation/image allowlists below. Keep the existing signing secret and client ID; this update does not require rotating either.
5. In **Access**, preserve the streamer and test-account allowlists: `komediruzecki7`, `yahwehwastaken`, and `lakeeko`. Testers need to sign into the allowlisted accounts.
6. In **Version Details**, replace the listing logo/discovery image with the new PNGs if desired. Use **Games in Extensions** as the general category. The 24 px icon is supplied for video-component use; a fullscreen overlay or panel does not require it. Keep the existing terms/privacy/contact fields.
7. On **Status**, move to **Hosted Test**. Stop there: do not choose **Submit for Review** or release.
8. Open your channel's **Creator Dashboard → Extensions → My Extensions**. Install/update the 0.0.3 test version and use **Activate → Set as Overlay** for the card on the video. If Twitch still shows the earlier test version, deactivate that version and install the new one through its test install link. Uploading a ZIP alone does not activate it.
9. Open the configuration screen, then Studio. Start one test round and ask Paolo to refresh your Twitch channel while signed in. Confirm his card front and your broadcaster card back.

| Setting | Value |
| --- | --- |
| Panel viewer path | `viewer.html` |
| Panel height | `500` |
| Mobile viewer path | `viewer.html` |
| Configuration path | `config.html` |
| Video – Fullscreen path | `overlay.html` |
| Backend / API origin | `https://play-baited.maff.app` |
| Allowed external Studio navigation | `https://play-baited.maff.app` |
| Image Domains | `https://play-baited.maff.app` for custom card artwork |

The native overlay is intended for the desktop Twitch video player. The mobile path serves the panel view; verify it separately in Twitch's mobile app. Local browser previews cannot prove Twitch CDN permissions or activation.

## The two overlays

**OBS Browser Source:** your existing round-info HUD. It is part of the encoded broadcast, so everybody sees the same pixels. Keep this source.

**Twitch Extension video overlay:** the card layered over the Twitch player. Twitch identifies the viewing account. Viewers get the word and clues; the broadcaster gets the Prism back until the round is decided. It is not a second OBS source and does not automatically appear inside OBS or its recording.

Do not add the secret viewer room as an OBS source: that would broadcast the secret to everybody. The landing demonstration shows the two account views side by side to explain the mechanic.

## Studio is a separate update

Uploading this ZIP updates Twitch-hosted panel/config/overlay files. It does not deploy Studio or restart the backend at `play-baited.maff.app`.

The branding patch is prepared on `feat/extension-003-brand`, based on main `f51c08c`. The currently running PC-hosted test was left untouched so an active round is not interrupted. Its existing backend supports this package's API. Applying the small Studio branding change requires rebuilding/restarting the hosted app separately.

## Checks completed

- App typecheck and production build passed.
- 57 focused Extension/package/privacy/parity tests passed.
- ZIP integrity passed; every bundled source file matches the checkout; exactly 100 illustrations; all three entrypoints are at the ZIP root.
- Desktop/mobile Studio, standalone viewer, 320 px panel, MVP results, mobile configuration and both video-overlay roles checked in headless Chromium.
- No horizontal overflow, JavaScript errors or failed asset requests in those checks. Broadcaster views did not reveal the active word.
- Pixel logo and favicon match the landing byte for byte. An independent source review found no branding regression.
- Logo 100×100, icon 24×24 and discovery 300×200 PNGs verified; previous exports preserved.
- The design detector's only warning was the existing Inter font. It is intentionally retained because it is part of the approved landing/product typography.
- Physical iPhone/OBS/Twitch CDN acceptance remains a live test after upload. Local screenshots are fixture evidence, not a new live Twitch recording.

Twitch separates uploading, Hosted Test and channel activation. See the [official lifecycle and asset requirements](https://dev.twitch.tv/docs/extensions/life-cycle/).

