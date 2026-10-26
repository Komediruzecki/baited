# Get Baited running

This guide is the current starting point for the game and Twitch Extension. The app, landing and required assets are in this repository. You do not need another private repo, a submodule, or the owner's personal planning folder.

**Moonshine is the default speech recognizer. No Deepgram account or API key is required.** Moonshine runs on the streamer's computer in a browser worker. The first microphone session downloads its model; later sessions can reuse the browser cache. The server receives final transcript text to check the target word. A proposed catch waits for the streamer's confirmation.

## Clone and install

Clone with a GitHub account that has access to this private repository. Use Node 24 and pnpm 10.34.3, as pinned in the root `package.json`.

```sh
git clone https://github.com/Komediruzecki/baited.git
```

Open a terminal in the clone and use `main` for the current integrated project.

```sh
git switch main
pnpm install --frozen-lockfile
pnpm --filter @baited/app build
```

The commands below run from the repository root. Root app scripts switch to `packages/app` for you. Detailed older guides may use app-relative paths or record a previous worktree location; substitute this clone's `packages/app` directory.

## Play a local round

```sh
pnpm preview:local
```

Open [the local app](http://127.0.0.1:3318/) and choose **Try the local demo**. The preview needs no Twitch account or vault access. It uses Moonshine, removes provider credentials from its child process and stops after three hours or **Ctrl+C**. Its port is fixed; close your previous preview before starting another.

1. Start a round in Studio. Open the viewer-room link from **Stream setup** in a second tab to see the target.
2. For a solo test, use **Local speech test** beside the microphone to reveal the test word and show the transcript. These are explicit demo controls.
3. Enable the microphone, grant browser permission, and wait for the model to finish loading. Say the target in a sentence.
4. Review the proposed catch. Confirm it only if you said the word. You can also use Demo controls to test chat and game states without a microphone.

The microphone belongs to Studio. The viewer panel shows the target, and the OBS overlay shows the round state and results. Neither viewers nor OBS need a speech-provider key.

For tablet review, use the [local-network preview commands](local-preview.md#tablet-preview-on-the-local-network). HTTP on a LAN address supports visual review and simulated rounds; microphone access on that device needs trusted HTTPS.

## Check the native Twitch panels

Keep the app preview open and start another terminal at the repository root:

```sh
pnpm preview:extension
```

Open [the Extension workbench](http://127.0.0.1:3322/). Select viewer or configuration, then try different panel sizes and fixture states. This uses the real panel files with local test responses. It does not install the Extension on Twitch or authorize a channel. It also stops after three hours or **Ctrl+C**.

## Connect a real Twitch channel

The live rehearsal needs Twitch credentials, not Deepgram credentials:

| Purpose | Required configuration |
| --- | --- |
| Read the broadcaster's chat | OAuth client ID and client secret; callback `http://localhost:3000/auth/twitch/callback` |
| Preserve the broadcaster's authorization securely | A stable token-encryption key stored in Proton Pass |
| Run the native Twitch viewer/config panels | Extension client ID, Extension shared secret and correctly configured view/backend origins |
| Recognize speech locally | `SPEECH_PROVIDER=moonshine`; microphone permission and model download |

Keep secrets in Proton Pass. The generic [live rehearsal template](bait.live-local.env.tmpl) contains placeholder `pass://` references. Replace only those reference paths with references available to your own account. The owner-specific `baited.local.env.tmpl` is for the existing owner test setup; Paolo should not assume access to that vault or reuse its machine-specific data path.

With your reference-only template prepared, run from the repository root:

```sh
pass-cli run --env-file packages/app/docs/bait.live-local.env.tmpl -- pnpm rehearsal:local
```

Open [the live local Studio](http://localhost:3000/) and connect the broadcaster's Twitch account. This rehearsal disables simulated input and is bounded to three hours. The [local Extension installation guide](baited-local-test.md) covers the separate viewer/config views and HTTPS gateway. Building an Extension ZIP does not install it or start its backend.

For OBS, copy the overlay URL from Studio's **Stream setup** into a Browser Source. Keep the viewer target out of the captured scene. A second computer cannot use your localhost URLs; remote play needs a reachable backend and correctly configured Twitch views.

## Optional legacy speech adapter

The Deepgram adapter still exists for deliberate testing with `SPEECH_PROVIDER=deepgram`. Only that selection requires `DEEPGRAM_API_KEY` and sends microphone audio through the server to Deepgram. Its [older provider guide](twitch-deepgram-obs-setup.md) is not a prerequisite for Moonshine. Leave `SPEECH_PROVIDER=moonshine` for the default setup.

## Contribute and release

Create a feature branch for your changes. Run `pnpm check`, `pnpm test` and `pnpm build` from the repository root before handing work over for review. Do not commit credentials, local data or generated Extension ZIPs.

The landing lives in `packages/landing`. The requested `baited.maff.app` and `dev.baited.maff.app` domains are landing-only; they do not provide game hosting. See the root [deployment guide](../../../docs/landing-deployment.md) for current deployment ownership and release controls. The game, Twitch upload and public repository visibility each have separate release steps.
