# Local product preview

Use the private checkout at `/home/maff/foss/worktrees/twigame/baited-v0.0.1`, branch `feat/baited-v0.0.1`. The original imported source remains separate. Checkpoints go to [Komediruzecki/bait](https://github.com/Komediruzecki/bait); pushing this branch does not deploy the game.

Build from any directory after source or asset changes:

```sh
rtk proxy pnpm --dir /home/maff/foss/worktrees/twigame/baited-v0.0.1 build
```

## Streamer Studio and standalone room

Start in its own terminal, after the previous instance has stopped:

```sh
rtk proxy timeout --foreground 10810s env PREVIEW_PORT=3330 PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/twigame/baited-v0.0.1 preview:local
```

Open [the local app](http://127.0.0.1:3330/) and choose **Try the local demo** if prompted. Start, pause and resume a round. The viewer-room and OBS links are available in **Stream setup**. Both are scoped to this demo room. **Local speech test** beside the microphone contains the explicit demo word reveal and optional transcript display.

This helper uses local Moonshine and clears Twitch/Deepgram credentials, the encryption key and proxy trust from the child environment. It refuses a checkout containing `.env`. Simulated hints and speech are available in Demo controls. Actual microphone recognition requires the owner's microphone consent; a simulated catch does not prove transcription accuracy.

Additional review surfaces:

- [18 card proofs and opt-in Sound Lab](http://127.0.0.1:3330/card-proofs)
- [Repeatable speech benchmark](http://127.0.0.1:3330/speech-lab)

## Native Twitch viewer and configuration

Start in a second terminal:

```sh
rtk proxy timeout --foreground 10810s env EXTENSION_PREVIEW_PORT=3322 EXTENSION_PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/twigame/baited-v0.0.1 preview:extension
```

Open [the Extension workbench](http://127.0.0.1:3322/). Choose viewer/configuration, panel width and the fixture state. This serves the actual Extension HTML, CSS, JavaScript and artwork, with a local fixture replacing Twitch authorization and game responses. It does not sign into Twitch, capture a microphone or change the real channel. The fixture Helper and workbench are excluded from the installable ZIP.

## Lifecycle and acceptance boundary

Both commands bind only to `127.0.0.1`, use a strict port and stop after three hours. **Ctrl+C** stops the corresponding process sooner. An occupied port is an error: stop this preview through its own terminal before restarting; do not kill unrelated services. These previews are not reachable from Paolo's computer. A command in this document is not proof of a running process; verify the URL responds after launch.

The separate real Twitch rehearsal uses the authenticated local Studio at port 3000 and HTTPS gateway at 3443. The local installable bundle targets those addresses, not this visual preview. Follow [the local Twitch test guide](baited-local-test.md) when ready to resume that session. Creating the ZIP does not upload it or start the gateway.

Real Twitch installation, Paolo joining remotely, physical phone behavior, actual microphone accuracy and the OBS scene remain separate acceptance checks. The landing is maintained in `disjoint-colliders/packages/bait`; these commands preview the game and Extension.
