# Set up BAIT with Twitch, speech recognition and OBS

> Historical Deepgram workflow. Start with [the current master plan and Twitch Extension guide](master-plan.md). Moonshine is now the default and needs no speech-provider key. The `rehearsal:local` helper and its vault template still require a Deepgram key and must be corrected before a Moonshine live rehearsal. The provider recommendation, logo status and deployment status below describe an earlier checkpoint; the static landing has since shipped, while the live game remains undeployed. OAuth and OBS instructions remain useful, but this document is not the current end-to-end setup.

Checked on 25 October 2026. This guide prepares a real provider rehearsal on this Linux computer. The GitHub repository stays private. These rehearsal steps do not publish the live game, release a Twitch Extension or start a public broadcast. The separately authorized development landing at `dev.bait.maff.app` contains only a scripted design preview.

**Use Deepgram for the first rehearsal if the existing account still has usable starter credit.** BAIT already integrates it, so this avoids a provider rewrite before testing the game. Check the account's balance, expiry and billing settings before sending audio. No credit balance or real transcription has been verified yet. The existing ElevenLabs key opened a Scribe v2 Realtime session without sending audio; it remains an alternative, with allowance and game integration still unverified.

## What each part does

| Part | Its job in BAIT |
| --- | --- |
| Twitch | Supplies the channel identity and real chat messages after the streamer authorizes BAIT. |
| BAIT studio | Starts rounds, captures the streamer's chosen microphone with permission, checks the target and controls awards. |
| Speech recognition | The current Deepgram integration returns microphone words, confidence scores and timing. BAIT decides whether those words win the round. ElevenLabs would need a separate adapter. |
| Viewer room | Shows chat the secret word and forbidden clues. Keep this page out of the broadcast. |
| OBS | Combines the game/camera, microphone and BAIT overlay into a recording or stream. |

The current audio path is **microphone → BAIT browser → BAIT server → Deepgram → BAIT result**. BAIT does not listen to the delayed Twitch video. OBS also captures the microphone for the recording; these are separate consumers of the same input device. This build uses English recognition and English target words. An ElevenLabs adapter has not been implemented or tested.

**The static landing needs no speech service, microphone permission or provider key.** Its round is a scripted example. In the current live game, speech recognition detects the spoken target and scores the catch automatically; starting or resuming live play requires the configured provider and an armed microphone. A future mode could let a trusted moderator confirm a catch manually, but that mode is not implemented. Simulated transcripts are available only in the local demo. Neither speech recognition nor a particular provider is required by the hackathon rules.

OBS is one broadcasting option. Software with an equivalent browser-source feature can also display the overlay, but this rehearsal uses OBS. Its Browser Source renders a webpage into a scene. It does not give viewers a clickable game inside the video. [OBS Browser Source](https://obsproject.com/kb/browser-source).

## What we need from you

- The Twitch channel that will host the game, with access to its login and 2FA. You already have a Twitch account; the checked developer dashboard has no registered application yet.
- The existing Deepgram account's available credit, expiry and billing status. Check its first project before creating another; starting credit belongs to that project. If usable credit is available, prepare a transcription key for the first rehearsal. If it is not, compare the existing ElevenLabs allowance before choosing paid usage or changing providers.
- The Twitch Client ID, Twitch Client Secret, Deepgram transcription key and BAIT token-encryption key saved in Proton Pass. The ElevenLabs key is already there if that alternative is chosen later. Share only `pass://...` references here, never their values.
- The microphone to use, plus your browser's microphone permission when prompted.
- A second Twitch account for the viewer's real chat messages. Paolo can play that role. For this fully local test, the secret viewer page must run on this computer too.
- In OBS, check whether **Sources → + → Browser** is available. The local inspection found OBS 32.2.2, but did not find `obs-browser` in the inspected system/user plugin locations; the menu check settles whether the running installation offers it.

You complete account terms, CAPTCHA, login/2FA and consent prompts yourself. No Twitch password or stream key is needed by BAIT.

## 1. Register the Twitch application

This is an API application for the existing BAIT build. Native Twitch Extension publishing is a separate route described below.

1. Open the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and sign in. Verify the account email and enable Twitch 2FA if needed, then refresh the console.
2. Choose **Applications → Register Your Application**.
3. Enter a unique name, for example `BAIT Local Test` or an available variation. Choose the closest appropriate game or application category.
4. Add this **OAuth Redirect URL**, exactly:

   ```text
   http://localhost:3000/auth/twitch/callback
   ```

5. If **Client Type** is offered, choose **Confidential**: BAIT's server stores the secret and performs the authorization-code exchange.
6. Complete the displayed verification and create the application. Open **Manage**, copy the Client ID into Proton Pass, then use **New Secret** and save the secret directly there too. Creating another secret invalidates the previous one.

Follow the [official registration steps](https://dev.twitch.tv/docs/authentication/register-app) and [server-side authentication guidance](https://dev.twitch.tv/docs/authentication/). BAIT requests `user:read:chat`; it does not need permission to moderate messages. Sending is limited to the optional [chat bot](chat-bot.md), which asks the streamer for `channel:bot` only when they allow it. Its outbound EventSub WebSocket works without a public webhook. [Twitch chat authentication](https://dev.twitch.tv/docs/chat/authenticating/).

Use `http://localhost:3000` throughout this live local session. Substituting `127.0.0.1`, changing the port or altering the callback path can break redirect matching or session cookies.

## 2. Check Deepgram credit and configure recognition

Deepgram turns speech into text. BAIT uses it to detect the hidden word; no generated voice or chatbot is involved. It is the recommended first-rehearsal option because the adapter already exists, not because we have measured better recognition than ElevenLabs.

Deepgram advertises **$200 starting credit with no credit card required**, followed by paid usage. On the checked date, its promotional Nova-3 monolingual streaming rate is **$0.0048 per audio minute**, about **$0.29 per hour**; the listed regular rate is $0.0077 per minute. Account terms and rates can change. [Current pricing](https://deepgram.com/pricing).

The public pages disagree about expiry: pricing says “No expiration,” while project documentation says promotional credits expire one year after signup. Check the existing account's displayed balance and expiry, and ask Deepgram support if they are unclear. Do not assume a new account allowance is still available on an existing account. [Project credit guidance](https://developers.deepgram.com/guides/deep-dives/managing-projects).

1. Open the existing [Deepgram Console](https://console.deepgram.com) account.
2. Select its **first project** and check the remaining credit, expiry and billing settings. Starting credit is assigned there. Use that credited project, or confirm a transfer with Deepgram before choosing another project.
3. If usable credit is available, open **Settings → API Keys → Create a New API Key**.
4. Name it `BAIT local rehearsal`. Choose permissions sufficient for transcription without project/billing administration, and an expiry that covers the testing period.
5. Save the one-time-visible key directly in Proton Pass and put only its `pass://` reference in the local template. [Deepgram key instructions](https://developers.deepgram.com/docs/create-additional-api-keys).

If no usable credit remains, stop before sending audio and compare the existing ElevenLabs allowance below. This guide does not authorize a purchase or billing change.

BAIT already requests `nova-3`, `language=en` and `mip_opt_out=true`. Deepgram says this opt-out excludes the request from model improvement and does not retain its audio/transcript after processing; usage metadata and logs remain. Audio still leaves this computer for processing. [Deepgram data handling](https://developers.deepgram.com/trust-security/your-data). Its March 2026 pricing update says opt-out has no effect on the listed Pay As You Go and Growth rates. [Pricing update](https://developers.deepgram.com/changelog/2026/3/5).

### ElevenLabs remains an alternative

ElevenLabs offers **Scribe v2 Realtime**, a WebSocket speech-to-text API that can accept 16kHz PCM audio. It returns partial and committed transcripts; word timestamps arrive in an additional committed message when enabled. This is the relevant ElevenLabs product for BAIT, rather than its text-to-speech voices. [Realtime API reference](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime).

The public Scribe v2 Realtime list price is **$0.39 per audio hour**, excluding taxes. That dollar display does not determine what the existing account includes. [ElevenAPI pricing](https://elevenlabs.io/pricing/api). ElevenLabs' workspace documentation says ElevenAPI usage can draw from the shared workspace credit pool, so the existing credits may apply. [Workspace seats and shared credits](https://elevenlabs.io/docs/overview/administration/workspaces/members).

The existing key authenticated and opened a session with `scribe_v2_realtime`; the connection then closed without sending audio. The account-balance request was denied because this key lacks account-read permission. Leave its permissions unchanged and check the workspace allowance and billing in the ElevenLabs dashboard. No new provider account or purchase is needed for that check.

Switching BAIT requires a provider adapter, not a different value in `DEEPGRAM_API_KEY`. We need to map committed results and word timing, verify how confidence is supplied or replace that guard explicitly, and test deadline settlement, duplicate results, disconnects and false matches. Deepgram's privacy settings cannot be assumed to apply to ElevenLabs. API access is confirmed; available allowance and integration validation remain open. No provider switch has been implemented.

## 3. Start the live local server

The visual game demo uses **`http://127.0.0.1:3318`** when its preview server is running. It clears provider credentials deliberately. The separate landing mockup uses **`http://127.0.0.1:3319`** and has no speech connection. Use the separate live rehearsal on **`http://localhost:3000`** for actual Twitch chat and speech.

The current helper and template expect Deepgram. Run this provider-backed command after confirming usable credit and configuring its key. If ElevenLabs is selected instead, first implement and validate its adapter and update the provider configuration; do not put an ElevenLabs key in the Deepgram field.

In [bait.live-local.env.tmpl](bait.live-local.env.tmpl), replace only the placeholder vault/item references with the real Proton references:

| Variable | Proton value |
| --- | --- |
| `TWITCH_CLIENT_ID` | The registered app's Client ID |
| `TWITCH_CLIENT_SECRET` | The registered app's Client Secret |
| `DEEPGRAM_API_KEY` | A transcription key from the Deepgram project with verified usable credit |
| `TOKEN_ENCRYPTION_KEY` | A generated 32-byte random key represented by 64 hexadecimal characters |

Generate the encryption key directly into the vault without displaying it. Keep it stable: BAIT uses it to encrypt saved Twitch tokens. No `.env` containing secret values is needed.

After the references are filled and Proton Pass CLI is signed in, run from any directory:

```sh
timeout 10810 pass-cli run --env-file /home/maff/foss/worktrees/twigame/bait-preview/docs/bait.live-local.env.tmpl -- pnpm --dir /home/maff/foss/worktrees/twigame/bait-preview rehearsal:local
```

The helper uses strict port 3000 on loopback, disables simulated inputs and keeps live local data under `~/.local/share/bait/live-local`. It runs for three hours by default. Keep the terminal open; **Ctrl+C** stops it earlier. An occupied port is an error, so stop only the earlier BAIT process before restarting.

Open **`http://localhost:3000`**, choose **Connect Twitch**, and authorize the intended channel. Confirm the studio shows that channel and a connected chat status. The available commands and ordinary non-spoiler messages should now come from real Twitch chat.

## 4. Add BAIT to OBS

The installed Arch build needs its Browser Source checked before the overlay can be tested. If **Browser** is missing, stop here and choose how to add browser support. OBS's official Linux distribution is available through [Flathub from the OBS download page](https://obsproject.com/download). Flatpak was not installed during this setup, and no OBS package or existing scene was replaced.

When Browser Source is available:

1. Create a separate scene named `BAIT rehearsal`. Add the game/window or camera you want recorded.
2. In BAIT, open **Stream setup** and copy **OBS overlay URL**.
3. In OBS, choose **Sources → + → Browser**, name it `BAIT overlay`, leave **Local file** off and paste that URL.
4. Set **Width: 1920** and **Height: 1080**. Keep the transparent background and place the source above the scene's game/camera source.
5. In **Settings → Audio**, select the intended microphone. Check its mixer meter moves when you speak. Record a short clip to check the sound. [OBS setup guide](https://obsproject.com/kb/quick-start-guide).

Keep the studio and secret viewer page out of the captured scene. The overlay URL has read-only access to the overlay; use the studio separately to control the round. Do not give the OBS page microphone permission: BAIT captures speech from the studio browser.

## 5. Play one real round, recorded locally

After the chosen speech provider is implemented and configured, use **Start Recording** in OBS to verify its actual capture with live Twitch chat and speech. Do not click **Start Streaming** for this rehearsal.

1. Keep the authenticated studio open. The viewer opens the studio's **Viewer room URL** in a second browser/window on this same computer and uses the second Twitch account for chat. Keep their target out of the streamer's view.
2. Choose **Enable microphone** in the studio, accept BAIT's disclosure and grant the browser permission for the intended device. Wait for **Microphone ready** or **Microphone armed** before starting the round. **Listening** appears after the active round opens its speech connection.
3. In OBS, start recording. Start a BAIT round and verify the timer appears in the recording while the target stays hidden.
4. Have the viewer post a genuine hint in Twitch chat. Confirm participation updates in BAIT. The streamer responds naturally in English and eventually says the target.
5. Confirm one win appears in studio, viewer and OBS. Pick the eligible hint for the award. Reverse the result and verify the overlay's score changes too.
6. Start another round, pause/resume it, then disable the mic and confirm play pauses. Re-enable it to check recovery. End the round and stop recording.
7. Play the recorded file back. Check text size, transparent composition, audible mic, one reveal, correct score and absence of the secret viewer page.

A `localhost` link sent to Paolo on another computer points to Paolo's computer, not this server. Remote play needs a separately chosen private-access arrangement or later approved hosting. Do not solve that by exposing the app publicly during this rehearsal.

If the mic cannot be opened while OBS is using it, inspect the selected device and Linux audio routing. If speech misses a word, note the target, timing and observed status without changing the result threshold just to make the demo pass. Real recognition, physical OBS recording and the two-person round remain unverified until these steps succeed.

## Applying for a native Twitch Extension later

The current BAIT viewer is a separate webpage and the OBS overlay becomes part of the video. A native Extension runs inside Twitch's viewer interface. It needs a new frontend integration using Twitch's Extension Helper and backend authorization. A panel for chat's secret card is a sensible first candidate. [Twitch Extensions introduction](https://dev.twitch.tv/docs/extensions/).

The publishing route is **Create Extension → Local Test → upload frontend asset ZIP → Hosted Test → Review → release after approval**. Test accounts can be allowlisted. Do not upload the complete BAIT server/source ZIP as frontend assets.

Review needs descriptions, author/contact details, privacy/terms URLs, a review channel and walkthrough, configuration and images. Twitch currently estimates **8–14 days**, so the hackathon plan should not depend on approval arriving first. Key image sizes are a **100×100 PNG logo**, **300×200 PNG discovery image**, and screenshots of at least **1024×768 at 4:3**. A video-component Extension also uses a **24×24 PNG** icon. [Twitch lifecycle and submission fields](https://dev.twitch.tv/docs/extensions/life-cycle).

## Logo and follow-ups

The bomb-plus-BAIT reference screenshot has now been supplied, and a generated candidate exists for review. Compare that candidate at card, header and small-icon sizes before choosing the final artwork. The earlier wordmark and original source remain preserved; a candidate's existence does not mean its final selection or integration has been approved.

Next actions are the Twitch app, Deepgram credit/expiry check, Proton reference setup and OBS Browser Source check. If usable Deepgram credit is unavailable, check the ElevenLabs allowance before choosing the next provider step. Review the bomb candidate alongside those steps. After the real provider round and OBS recording pass, review the capture together, update [validation.md](validation.md), and use [the submission checklist](team-and-release-checklist.md) for the video and final entry. Hosting the live game, native Extension submission and a public broadcast remain separate decisions.
