# baited: brand plan and first Twitch Extension test

Prepared 25 October 2026. This is a production and test plan, not a completed rebrand or an installable Extension. No deployment, Twitch configuration change, review submission or new artwork was performed for this plan. The private `Komediruzecki/bait` repository remains private.

**Implementation update:** the later [v0.0.1 local-test guide](baited-local-test.md) supersedes the implementation/setup status below. The native panel and verified backend are now built on a private branch; the shared secret resolves, and persistent encryption/TLS keys are safely stored in Proton. No real Twitch installation or complete round has passed yet. This document retains the original brand brief and planning snapshot; the new logo and review artwork remain pending.

## Confirmed today

| Item | Evidence / status |
| --- | --- |
| New product name | Owner chose **baited**. Keep the card tagline **Bait them.** |
| Broadcaster | `komediruzecki7`, Twitch user ID **501062940** |
| Paolo / test viewer | `yahwehwastaken`, Twitch user ID **566058624** |
| OAuth application | `dev / tw-bait-ids / oauth-client-id` and `oauth-client-secret` resolved through Proton injection. Twitch accepted the pair for an app token; public account lookup succeeded. |
| Extension client ID | `dev / tw-bait-ids / ext-client-id` resolves. Its ownership, enabled type and version state have not been checked in the console. |
| Extension shared secret | Not supplied among the three field names. Still unverified. It is different from the OAuth client secret. |
| Broadcaster authorization | Still needs the real browser consent flow and chat test. App-token validation does not prove this step. |
| Current code | Reviewed game lineage is `feat/bait-v2-mockup`, source baseline `e8cd329`. It contains studio, viewer room, EventSub chat, Moonshine and OBS overlay, but no native Extension build or Extension JWT endpoints. |
| Design lead | The existing v2 design direction is available. A fresh design request with a 2,700-second allowance returned a session-limit error immediately. It reported reset at 22:30 Europe/Zagreb. No new brand proposal was produced. |

Credential values were not displayed or written to this document. The account check held its app token only in process memory. The numerical IDs above came from [Twitch Get Users](https://dev.twitch.tv/docs/api/reference/#get-users).

## Brand production plan

The owner has settled the name and palette. A dedicated design pass should lead the remaining shape and typography decisions, using the taste guide, the approved [v2 direction](v2/landing-plan.md), and the existing bomb reference. The following is the execution brief, not an approved replacement logo.

- Spell the product **baited**, in lowercase. Use **Bait them.** on the cards. Keep **irchiinnuss** as the developer credit rather than a competing product name.
- Build a separate wordmark and bomb mark. The existing mascot's fishhook, rounded body and censor-strip mouth are recognizable. Its eye shapes also contain the old “ba / it” lettering: redesign those as expressive eyes rather than forcing six letters into the face.
- Keep `#9146FF` as the main brand accent, `#FFFC79` as a small highlight, and charcoal as the primary card/UI surface. Preserve the approved orange mascot as the comparison baseline. Have the design pass compare an evolved orange mascot with one restrained purple treatment before selecting a replacement.
- Produce a deliberate small icon. At 24 px retain the body, hook and one readable facial gesture; remove fine shading, tiny symbols and wordmark text. Inspect at actual size, not only enlarged.
- Keep the existing 18 approved card illustrations intact. Apply the new wordmark to card backs/brand positions after approval; this is not permission to regenerate the whole deck.
- Keep the current repo name, domain, route names, client IDs and stored-data identifiers during this first pass. Change visible branding, page titles, alt text, metadata and listing copy deliberately. A new name does not require a new OAuth application or Extension ID.

### Required upload assets and our working files

| Deliverable | Twitch upload specification | Proposed composition |
| --- | --- | --- |
| Extension logo | **100 × 100 PNG** | Bomb mark centered with enough breathing room for the hook. No miniature tagline. |
| Taskbar icon | **24 × 24 PNG**, required for **video-component** type | Separately drawn micro mark. Prepare it for the kit, even if the initial Panel does not require this field. |
| Discovery image | **300 × 200 PNG** | Opaque charcoal/violet ground, readable `baited` wordmark and bomb. Minimal text and detail. |
| Screenshots | One or more; **4:3**, at least **1024 × 768**, PNG/JPG/GIF, **under 10 MB each** | Capture the real installed panel, a live round and its confirmed result. Use 1024 × 768 for the first exports. |
| Working masters | Our choice, not Twitch requirements | Transparent high-resolution wordmark/mascot PNGs; editable vector lettering and micro-icon source where practical; light/dark lockups and a color sheet. SVG is a working format, not the specified Twitch upload. |

The upload dimensions and conditional taskbar requirement come from [Version Details](https://dev.twitch.tv/docs/extensions/life-cycle/#version-details). Keep Twitch/Glitch marks out of the branded artwork. Use a small palette and clear silhouettes per [Twitch's design guidance](https://dev.twitch.tv/docs/extensions/designing/).

Production sequence:

1. **Design pass.** Read the prepared brief and inspect the existing bomb, wordmark, cards and v2 page. Specify lettering, proportions, negative space, color coverage and the two candidate proof compositions. Do not substitute an unrelated stock bomb.
2. **Image-generation proofs.** Use the existing approved bomb as an editing reference. Show the owner the wordmark + mascot, a monochrome silhouette, and 100 px / 24 px previews together. Check all six letters, remove stray text, inspect transparency and compare on light/dark backgrounds. Treat generated typography as a proof; finalize exact lettering in editable form if necessary.
3. **Export and integrate the chosen proof.** Validate dimensions, file types, alpha, clipping and file sizes. Update visible branding in an isolated branch. Show a local preview before any deployment. Produce truthful listing screenshots only once the native panel actually works.

The current landing movie uses a staged Extension concept. It is not a review screenshot or proof that the Extension has run. Final screenshots must come from the real test, without tokens, secret-bearing URLs or unrelated account details.

Suggested motion brief for the design pass: a short hook twitch on an intentional card reveal, then a single result reaction after host confirmation. Keep the mascot still during ordinary reading. Provide a static reduced-motion state. Sound remains separately opt-in; icon or logo animation must not enable audio.

Listing copy draft, for use after the described panel is built:

> **baited**
>
> Chat gets a secret word. Bait the streamer into saying it before time runs out.
>
> See the target and forbidden clues in the panel, then write your hints in chat. The streamer runs the round from a separate studio and confirms suggested catches. Local speech recognition needs a microphone on the streamer's computer.

Recommended General Category: **Games in Extensions**. Do not select a specific external game category unless the Extension actually integrates with that game. Author credit can be `irchiinnuss`; author/contact identity and policy URLs still need the owner's confirmation.

## What we still need

| Need | Who / next action |
| --- | --- |
| Extension signing key | Owner: open the existing Extension's **Extension Settings → Extension Client Configuration → Key**. Store it as a hidden Proton field, proposed name `ext-shared-secret`, in `tw-bait-ids`. Send only the field name/reference. Do not rotate an existing key just to copy it. |
| Persistent token-encryption key | Implementation: create 32 random bytes as 64 hexadecimal characters and store securely in Proton, proposed field `token-encryption-key`. Reuse a valid existing game key if one already protects stored tokens. Do not replace it on every launch. |
| Existing Extension settings | Check owner, `0.0.1`, state and display type in the console. Recommend Panel for this test. Use the existing object; do not create duplicates. |
| Broadcaster OAuth callback/consent | Confirm `http://localhost:3000/auth/twitch/callback` is registered for local rehearsal. Use the same hostname when opening the studio. The host then connects Twitch and authorizes `user:read:chat`. |
| Microphone and OBS | Owner selects/permits the microphone and uses headphones. Confirm **OBS → Sources → + → Browser** exists. System OBS is installed, but the standard `obs-browser` package/plugin was absent in the read-only check. Actual UI readiness remains unverified. |
| Remote-test route | Choose a reachable HTTPS backend or explicitly limit the first install to this computer. Paolo cannot use your `localhost` from his computer. Hosting/tunnelling is a separate action after local review. |
| Native Extension code | Build the viewer/config frontend, verified backend connection and upload bundle described below. IDs and artwork alone are not an installable Extension. |

The shared key authenticates Extension requests; the ordinary OAuth secret supports the broadcaster's account connection. Twitch describes the shared key's location and encoding in [Building Extensions](https://dev.twitch.tv/docs/extensions/building/#signing-the-jwt). Backend code must decode the base64 key correctly. Neither secret belongs in the frontend ZIP.

No Deepgram or ElevenLabs key is needed for the Moonshine route. No Twitch password or stream key is needed by baited. OBS may need its own Twitch sign-in to broadcast; the owner completes that in OBS.

## Smallest useful v0.0.1 build

Start from the current reviewed feature lineage, not Paolo's preserved original checkout. Keep Extension version `0.0.1` separate from game package `0.1.0` and landing release tags.

| Work | Acceptance condition |
| --- | --- |
| Repair rehearsal launcher | Moonshine does not require `DEEPGRAM_API_KEY`. Deepgram mode still checks its own key. Reference-only templates match the selected mode; missing Twitch/encryption fields fail clearly. |
| Viewer panel | Compact secret card, forbidden clues, clock, waiting state and round result. No landing movie, microphone, speech-model download or large card gallery in the Extension. |
| Configuration page | Identifies the authorized channel and shows whether its studio is connected. Opens the external broadcaster studio with a clear off-site indication. No tokens or bearer room secrets in public configuration. |
| Extension authorization | Twitch Helper is the first script in each HTML entry. Use the latest `onAuthorized` JWT. Verify HS256 signature, expiry, channel and permitted role server-side; never accept client-declared ownership. |
| Channel binding | Derive the room from the verified channel. Test that another channel's token cannot read or alter this room. Preserve separate viewer, broadcaster and secret-free OBS projections. |
| State transport | Start with bounded authenticated `fetch` polling for this two-account test, using authorization headers, visibility pause/backoff and a server deadline for the clock. No token in a URL. Add PubSub later if measurements justify it. |
| Existing gameplay | Continue real hints and `!skip` through Twitch chat. Keep mandatory host confirm/reject. Defer new panel voting, purchases and card mechanics. |
| Build/hosting | Separate `viewer.html` and `config.html` entry points, relative asset paths and a frontend-only ZIP. Preserve studio cookie/CSRF protections; add narrowly scoped Extension API origins instead of loosening the whole app. |
| Failure behavior | Expired/wrong-channel JWTs fail, disconnects show reconnect state, refresh does not duplicate results, and the OBS response never leaks an active target. |

The existing application has `frame-ancestors: self` and same-origin studio controls. Do not embed the whole studio or remove those protections as an Extension shortcut. Helper loading, renewed JWTs and verification are described in [Twitch's building guide](https://dev.twitch.tv/docs/extensions/building/). Keep the upload's code readable for review, and list only the required external domains. [Technical policies](https://dev.twitch.tv/docs/extensions/guidelines-and-policies/).

The proposed panel is read-only, but the game remains interactive through chat. The broadcaster can always choose to view their own viewer experience; do not claim cryptographic secrecy from the person operating the stream.

## Install and test on Twitch

### Local Test on this Linux computer

These steps follow implementation; the landing preview cannot be used as the Extension frontend.

1. Open [Developer Console → Extensions](https://dev.twitch.tv/console/extensions), select the existing Extension, then **Manage** version `0.0.1`. Keep the version in **Local Test**. Confirm Panel is enabled. The owner account needs 2FA. [Creation guide](https://dev.twitch.tv/docs/tutorials/extension-101-tutorial-series/create-extension/).
2. Serve the new frontend over trusted local HTTPS. Set **Asset Hosting → Testing Base URI** to its exact address with a trailing `/`. Proposed relative paths are `viewer.html` and `config.html`; use the actual build output. Choose the panel height after layout testing. Start the matching game backend and allow only the intended test origin.
3. In **Access → Testing Account Allowlist**, enter the verified numeric IDs: `501062940,566058624`. Do not enter the usernames in this field or confuse it with the separate Streamer Allowlist. This grants prerelease access; it does not make the repository public. [Access settings](https://dev.twitch.tv/docs/extensions/life-cycle/#access).
4. In **Status**, choose **View on Twitch and Install**, then **Install → Configure**. Link the authenticated channel to its studio. In Creator Dashboard → Extensions, choose **Activate → Set as Panel 1**, or another free panel slot.
5. Visit [komediruzecki7's channel](https://www.twitch.tv/komediruzecki7), scroll below the video, and accept the prerelease disclosure. Test Paolo in a separate signed-in browser profile if both are using this machine. Do not share account sessions or credentials. [Official local-test flow](https://dev.twitch.tv/docs/tutorials/extension-101-tutorial-series/local-test/).

Use HTTPS for the embedded frontend/API test arrangement. The existing HTTP localhost OAuth rehearsal callback is a separate setup; if the studio moves to HTTPS or a hosted origin, register that exact callback and update runtime configuration together.

### Hosted Test for Paolo on another computer

After local acceptance and a separately approved backend deployment/test origin, upload the **contents** of the frontend output directory through **Files → Upload Version in Assets**. The viewer/config files must sit at the relative paths entered in the console, without an accidental outer folder. Choose **Move To Hosted Test**. Bits and subscription support can remain No. Twitch hosts the static frontend; our HTTPS backend must still be running. [Packaging guide](https://dev.twitch.tv/docs/extensions/#package-your-extension).

Both users then open the activated channel while signed into their allowlisted accounts. Check from another network, not only the host machine. `dev.bait.maff.app` currently supplies a static landing and does not supply this stateful game service.

### One real round: record the evidence

| Check | Pass condition |
| --- | --- |
| Setup | Host connects Twitch, loads Moonshine and grants microphone access. Paolo sees the correct channel's target. |
| Hints | A real message from `yahwehwastaken` reaches the game through EventSub. Hint/forbidden-word behavior follows the existing rules. |
| Catch | Host says the target naturally. Moonshine proposes a candidate; the result stays pending until the host confirms. |
| OBS | Actual Browser Source shows the round and exactly one confirmed result. Active secret is absent from its payload and capture. Sound is heard once only after opt-in. |
| Corrections | Reject a false candidate, let a round time out, exercise `!skip`, and reconnect once. No duplicate award or stale result. |
| Timing | Record rough speech-to-candidate, confirmation-to-panel and confirmation-to-OBS delays. Small fixture scores are not human-microphone accuracy. |
| Evidence | Save the recording and actual Extension screenshots. Record browser/OBS versions, speech provider and any failure. The staged v2 film remains separate. |

OBS records/composes the stream; it does not install the Extension or supply microphone audio to the browser automatically. The studio captures the selected mic with permission. The panel runs inside each viewer's Twitch page. Headphones reduce accidental recognition of game/stream audio.

## Review packet, after the first test

The console warning about logo, icon, discovery art, screenshots and category concerns review readiness. Local/Hosted testing can precede approval. Complete the remaining Version Details, verified author email, real privacy/terms URLs, capability settings and review channel before submission. Do not claim the listing or legal pages are finished today.

Use `https://www.twitch.tv/komediruzecki7` as the proposed review channel. Explain the external studio, local microphone permission, required backend, installation and one full confirm/reject round. Include when the host can be available to operate the game; continuous streaming throughout the queue is unnecessary for a panel. [Review walkthrough guidance](https://dev.twitch.tv/docs/extensions/submission-best-practices/).

Publish truthful data handling: the selected Moonshine path performs recognition locally and sends text to the game for matching; verify the final logging, storage, Twitch identifiers and disconnect behavior before writing the privacy policy. Avoid blanket claims that no data ever leaves the computer. Do not enable mobile support as a checkbox without a real Twitch iOS/Android test.

**An organization is not needed to unblock this owner-managed test.** For shared Developer Console administration, use Console → account dropdown → **Create Organization** and supply real Irchiinnuss details. Both members need verified email and 2FA. Keep organization registration separate from the first install; do not recreate the existing Extension or assume an ownership transfer is automatic. [Organization guide](https://dev.twitch.tv/docs/companies/).

## Handoff

Next implementation milestone: repair Moonshine setup, build the panel/config/auth bundle, verify the real mic and OBS locally, then show the owner the working local installation and branding proofs. Choose the remote test route after that. Review submission, public release and deployment remain separate actions.

The new-brand design brief is saved with the task evidence. Retry that exact design task after the account limit resets; keep the owner-requested 45-minute allowance. The first-test engineering plan can proceed independently of selecting final artwork.
