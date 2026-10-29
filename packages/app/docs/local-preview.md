# Local product preview

Use the application package at `/home/maff/foss/worktrees/baited/unified-workspace/packages/app`, branch `feat/baited-workspace`. The original imported source remains separate. Checkpoints go to [Komediruzecki/baited](https://github.com/Komediruzecki/baited); pushing this branch does not deploy the game. Install dependencies once from the workspace root before building. For another clone, replace the absolute path below with that clone's `packages/app` directory.

Build from any directory after source or asset changes:

```sh
pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/app build
```

## Streamer Studio and standalone room

Start in its own terminal, after the previous instance has stopped:

```sh
timeout --foreground 10810s env PREVIEW_PORT=3330 PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/app preview:local
```

Open [the local app](http://127.0.0.1:3330/) and choose **Try the local demo** if prompted. Start, pause and resume a round. The viewer-room and OBS links are available in **Stream setup**. Both are scoped to this demo room. **Local speech test** beside the microphone contains the explicit demo word reveal and optional transcript display.

This helper uses local Moonshine and clears Twitch/Deepgram credentials, the encryption key and proxy trust from the child environment. It refuses a checkout containing `.env`. Simulated hints and speech are available in Demo controls. Actual microphone recognition requires the owner's microphone consent; a simulated catch does not prove transcription accuracy.

Additional review surfaces:

- [18 card proofs and opt-in Sound Lab](http://127.0.0.1:3330/card-proofs)
- [Repeatable speech benchmark](http://127.0.0.1:3330/speech-lab)

## Native Twitch viewer and configuration

Start in a second terminal:

```sh
timeout --foreground 10810s env EXTENSION_PREVIEW_PORT=3322 EXTENSION_PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/app preview:extension
```

Open [the Extension workbench](http://127.0.0.1:3322/). Choose viewer/configuration, panel width and the fixture state. This serves the actual Extension HTML, CSS, JavaScript and artwork, with a local fixture replacing Twitch authorization and game responses. It does not sign into Twitch, capture a microphone or change the real channel. The fixture Helper and workbench are excluded from the installable ZIP.

## Lifecycle and acceptance boundary

Both commands bind to `127.0.0.1` by default, use a strict port and stop after three hours. **Ctrl+C** stops the corresponding process sooner. An occupied port is an error: stop this preview through its own terminal before restarting; do not kill unrelated services. A command in this document is not proof of a running process; verify the URL responds after launch.

## Tablet preview on the local network

For design review from another device on the same network, explicitly bind the computer's private IPv4 address. Its current Ethernet address is `192.168.178.33`; update it if the network assigns a different address. Stop the corresponding localhost previews first, then run each command in its own terminal:

```sh
timeout --foreground 10810s env PREVIEW_PORT=3330 PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/app preview:local --host 192.168.178.33
```

```sh
timeout --foreground 10810s env EXTENSION_PREVIEW_PORT=3322 EXTENSION_PREVIEW_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/app preview:extension --host 192.168.178.33
```

Open [Studio](http://192.168.178.33:3330/) or [the Extension workbench](http://192.168.178.33:3322/) on the tablet. Studio uses a separate demo store at `data/lan-preview`; choose **Try the local demo** to enter. The LAN option requires a credential-free development configuration and pins requests to the selected host and origin. The Extension workbench adapts its fixture runtime only; the installable Twitch bundle is unchanged.

These HTTP previews support visual review and simulated rounds. Tablet microphone access needs a trusted HTTPS connection. If a page does not load, check that both devices share the same network and that its firewall permits these ports. This does not provide internet access for Paolo's remote test.

The separate real Twitch rehearsal uses the authenticated local Studio at port 3000 and HTTPS gateway at 3443. The local installable bundle targets those addresses, not this visual preview. Follow [the local Twitch test guide](baited-local-test.md) when ready to resume that session. Creating the ZIP does not upload it or start the gateway.

Real Twitch installation, Paolo joining remotely, physical phone behavior, actual microphone accuracy and the OBS scene remain separate acceptance checks. The landing source lives in the sibling `packages/landing` workspace package; these commands preview only the game and Extension.
