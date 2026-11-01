# Get Baited running

Start with the local demo. It runs the game without a Twitch account, speech-provider key or vault access. **Moonshine is the default live recognizer** and runs on the streamer's device. Whisper is available only as an optional comparison in Speech Lab.

All commands below run from the repository root. The app, landing and required source assets are included in this repository; no second repository or submodule is needed.

## Install and build

Use **Node 24** and **pnpm 10.34.3**. If the repository is private when you clone it, your GitHub account must first have access.

```sh
git clone https://github.com/Komediruzecki/baited.git
cd baited
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
```

For judging, use the submitted revision specified by the project team. The preview serves the compiled application, so rebuild after changing source files.

## Play a local round

```sh
pnpm preview:local
```

Open [http://127.0.0.1:3318](http://127.0.0.1:3318) and choose **Try the local demo**. The launcher clears live credentials from its child process, binds to loopback by default, uses a fixed port and stops after three hours or **Ctrl+C**. Close an earlier preview before starting another. It refuses a `packages/app/.env` file; do not create one for this demo.

1. Start a round in Studio. Open the viewer-room link from **Stream setup** in a separate tab. The word belongs to the viewer's view.
2. Use **Demo controls** to send simulated chat and a final transcript containing that word. Review the catch and check the resulting score.
3. To try a physical microphone, enable it, grant permission and wait for Moonshine to finish loading. Start a fresh round after cooldown, open **Solo test → Reveal secret word**, and say the target in a sentence.
4. Confirm a correct catch or reject a mistaken one. A pending catch confirms automatically after 15 seconds. A confirmed catch can also be reversed.
5. Open the OBS preview from **Stream setup**. It shows the timer and results, not the active target.

The microphone is optional for the fixture demo. Physical microphone recognition requires browser permission, the first model download and a supported browser. Use headphones to keep playback from entering the microphone. Localhost supports this test; a plain HTTP LAN address is suitable for visual review but does not provide trusted HTTPS for a phone's microphone.

## Check the native Twitch views locally

In a separate terminal at the repository root:

```sh
pnpm preview:extension
```

Open [http://127.0.0.1:3322](http://127.0.0.1:3322). Select viewer or configuration, then try panel sizes and fixture states. This uses the real Extension frontend with local test responses. It does not sign into Twitch, install the Extension or open a microphone. The fixed-port workbench also stops after three hours or **Ctrl+C**.

## Compare local speech models

With the app preview running, open [Speech Lab](http://127.0.0.1:3318/speech-lab). Pause the game and turn off Studio's microphone first.

Record a 5, 10 or 15-second clip, listen back, then choose one model or both. You can also select an uncompressed WAV up to 25 MB. Both-model comparisons allow up to one minute of audio; Moonshine alone allows up to five minutes. Only one model runs at a time, using the same retained audio. Download the WAV or comparison JSON if you want to keep it.

English is supported by both models; Croatian is a Whisper-only comparison. Whisper's optional model files must be present on the host. The page shows when they are unavailable, and Moonshine can still run alone. A comparison does not change Studio's live recognizer, contact a browser speech service or affect a game. The [hosted Speech Lab](https://pilot-baited.maff.app/speech-lab) is also available for diagnostics.

## Connect a real Twitch channel

This is separate from the credential-free demo. A local real-channel rehearsal requires your own Twitch application, broadcaster authorization and secret configuration.

| Purpose | Configuration |
| --- | --- |
| Read the broadcaster's chat | `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` for a confidential Twitch application |
| Local OAuth callback | `http://localhost:3000/auth/twitch/callback` |
| Protect stored authorization | A stable `TOKEN_ENCRYPTION_KEY`: 32 random bytes represented as 64 hexadecimal characters |
| Recognize English speech locally | `SPEECH_PROVIDER=moonshine`, microphone permission and the model download |
| Run the native Twitch views | Separate Extension configuration, tester access and installation/activation |

Store secret values in Proton Pass. The [generic live rehearsal template](bait.live-local.env.tmpl) contains placeholder references. Replace its reference paths with your own `pass://` references; never paste resolved values into the file. Keep the encryption key stable when reusing a data directory.

With those references configured and Proton Pass authenticated:

```sh
pass-cli run --env-file packages/app/docs/bait.live-local.env.tmpl -- pnpm rehearsal:local
```

Open [http://localhost:3000](http://localhost:3000), choose **Connect Twitch**, and authorize the broadcaster. The rehearsal disables simulated input and stops after three hours or **Ctrl+C**. Keep the browser address and configured origin identical, including `localhost` versus `127.0.0.1`.

Wait for the Twitch connection and microphone to be ready. Use a separate viewer account to send hints and check participation. For OBS, add the overlay URL from **Stream setup** as a **1920 × 1080** Browser Source. Do not put the secret viewer card in the captured scene.

A second device cannot use the streamer's localhost URL. Remote play requires a reachable HTTPS backend, its exact OAuth callback, and matching Extension view/backend configuration. The companion viewer in the Node application and the native Twitch Extension are separate ways of viewing a card; the Cloudflare pilot uses the native Extension.

## Use the hosted pilot

[Cloudflare pilot Studio](https://pilot-baited.maff.app/studio) serves two invited streamer channels. The project owner has tested live play on desktop and iOS. Each channel permits 100 distinct participants per round and 100 concurrent viewer connections.

The pilot is not open registration. A new streamer or judge needs the project team's access arrangements. The Extension is still in **Hosted Test**, with Twitch tester permissions and installation/activation required; it is not a public Extension-directory release. The local demo and Extension workbench above remain available without those permissions. See [the judge walkthrough](judge-walkthrough.md).

## Development

```sh
pnpm dev                         # Node app source development on port 3000
pnpm dev:landing                 # Separate landing preview on port 4370
pnpm --filter @baited/app check
pnpm --filter @baited/app test
pnpm --filter @baited/app build
```

The optional legacy Deepgram adapter requires deliberately selecting `SPEECH_PROVIDER=deepgram` and injecting `DEEPGRAM_API_KEY`. It sends audio through the server to Deepgram. Leave Moonshine selected for local recognition; neither the demo nor the Cloudflare pilot needs Deepgram.

Never commit credentials, local game data or generated Extension ZIPs. Hosting, repository visibility and Twitch publication are separate release actions. The [hackathon checklist](hackathon-requirements.md) covers the submitted revision and post-deadline freeze.
