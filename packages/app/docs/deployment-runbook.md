# Deployment runbook

Preparation for the live game only. Its host, game domain and operating cost remain to be selected. The separate static landing has already shipped at bait.maff.app and dev.bait.maff.app; it does not run this Node backend. Start with [the current master plan](master-plan.md).

## Required runtime

BAIT needs one persistent Node.js process, a writable persistent data directory, outgoing HTTPS/WebSockets, incoming WebSockets for `/api/speech`, and unbuffered long-lived SSE responses. Use Node 22.12+ and pnpm 10.7.1. Do not use static-only hosting, short-lived functions, multiple replicas, or a shared JSON file across instances.

The production image passed the isolated build and non-root container smoke check recorded in [validation.md](validation.md). That test does not establish a working hosted container or proxy. Before choosing a host, confirm persistent disk, websocket duration, SSE buffering, restart policy, operating cost and a retention window covering judging. No budget or provider choice is implied here.

## Secrets stay in Proton Pass

Keep Twitch credentials, the 64-hex-character encryption key and any optional Deepgram key in Proton Pass. Moonshine needs no speech-provider key. The existing production reference template still includes Deepgram and needs a provider-specific pass before use. The example files contain only placeholders or `pass://` references. Never open, print, attach or commit a file containing resolved values. Do not place secret values in terminal arguments, Docker build arguments, chat, screenshots or setup notes.

Use [the production reference template](bait.production.env.tmpl), replacing only the vault/item references and non-secret deployment values. `pass-cli run --env-file` resolves the references into the child process environment and masks its normal output by default. Do not use `--no-masking`, `env`, `printenv`, shell tracing or vault-value output to debug the setup. The installed CLI's help and [official run documentation](https://protonpass.github.io/pass-cli/commands/contents/run/) were checked for this syntax. No vault was opened during preparation.

If a host requires a generated configuration file, use `pass-cli inject` with a separate template using its `{{ pass://vault/item/field }}` syntax and an explicit private output file (`--out-file`, `--file-mode 0600`); never emit the result to stdout. The `.env.tmpl` files here use the direct `pass://` syntax for `pass-cli run --env-file`, not the bracketed inject syntax. Approve the exact destination and lifecycle before creating a resolved file. Prefer runtime injection when the host supports it.

For a persistent data directory, preserve its existing encryption key across deployments. A replacement key cannot decrypt old Twitch credentials. Never print a generated encryption key to the terminal; create/store it through an owner-controlled vault workflow. The original `.env.example` is a variable inventory, not the recommended secret-storage procedure.

## Configuration

| Setting | Required value or decision |
| --- | --- |
| `NODE_ENV` | `production` |
| `ENABLE_DEMO` | `false`; production disables demo regardless |
| `PUBLIC_URL` | The exact owned HTTPS origin, without a path/query |
| `HOST` / `PORT` | The interface and fixed port required by the selected host; avoid a public backend bypass around the proxy |
| `DATA_DIR` | Absolute persistent directory writable by only the app account |
| `TRUSTED_PROXIES` | Empty for direct connections; otherwise only actual immediate proxy IPs/CIDRs approved for this host |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Vault references for the Confidential Twitch application |
| `TOKEN_ENCRYPTION_KEY` | Vault reference to the persistent 32-byte key, encoded as 64 hex characters |
| `SPEECH_PROVIDER` | `moonshine` for local browser recognition, or `deepgram` for the optional cloud adapter |
| `DEEPGRAM_API_KEY` | Required only for Deepgram; omit its reference for Moonshine |
| `TWITCH_BOT_USER_ID` | Optional. Numeric user ID of the chat bot account; not a secret. See [Chat bot](chat-bot.md) |

The current proxy configuration accepts an explicit IP/CIDR allowlist. Do not use `true`, a hop count, `/0`, or an unbounded network range. Trust a loopback address only when the actual proxy connects from that address. The proxy must overwrite incoming forwarding headers and prevent clients reaching the app directly while spoofing a trusted path. Verify the resulting client identity through the real deployment before a large audience joins.

Register `${PUBLIC_URL}/auth/twitch/callback` exactly in the Twitch Developer Console. The app requests `user:read:chat` for the broadcaster's own channel. It does not require a published Twitch Extension. A separate bot account is needed only for the optional [chat bot](chat-bot.md); its sign-in reuses the same callback.

## Build and release sequence, after approval

1. Confirm the exact source revision and publication contents. Ensure no plaintext `.env`, runtime state, resolved configuration or recorded credentials are included. Do not open secret files to perform this check.
2. Install the frozen lockfile and build on the selected host or approved build environment. These commands do not deploy anything by themselves:

   ```sh
   rtk pnpm install --frozen-lockfile
   rtk pnpm build
   ```

3. Configure the persistent disk and a private reference-only production template. The process-launch form is below; replace the explicit placeholder paths first. This is a runbook command, not a process started during preparation:

   ```sh
   rtk proxy pass-cli run --env-file /ABSOLUTE/PRIVATE/bait.production.env.tmpl -- pnpm --dir /ABSOLUTE/BAIT/CHECKOUT start
   ```

4. Configure the selected host's process manager to preserve those environment values and stop cleanly. Do not enable restart services, timers or public exposure until that deployment is approved.
5. Terminate HTTPS at the proxy, preserve the original `Host`, forward WebSocket upgrades for `/api/speech`, and disable buffering for `/api/*/events*`. Avoid logging OAuth callback queries, speech query strings, cookies and full overlay capability URLs.
6. Verify health, a new broadcaster OAuth callback, real chat, physical microphone, viewer reconnection, token revocation, actual OBS transparency and a remote judge walkthrough. Record the exact date/build and observed outcomes in `validation.md`.

## Acceptance and rollback

Do not call the deployment ready because the process starts or health responds. One streamer and a separate viewer must complete an actual round. Test a normal sentence with the target near its end, a near-deadline target, pause/resume, skip, a wrong private guess, correction and provider failure. Confirm the studio cannot start a real round before Twitch and the microphone are ready. Never speak or display a real secret while recording.

The new implementation uses a short final-result settling interval for an armed live microphone. Judge the observed behavior against the documented speech policy, not a zero-latency assumption. Measure provider latency before promising accuracy or timing guarantees.

Retain the prior verified build and a protected backup of the state directory using the same encryption key. If a new build fails, stop its one process and restore the prior approved build. Never run two versions concurrently against the same JSON data file. Restart ends active rounds and browser sessions by design; reconnect and verify before resuming a stream.

## Judge access and deadline

The private [source repository](https://github.com/Komediruzecki/bait) exists. Verify the final pushed revision and arrange the official private-repository judge access. The final packet still needs a tested HTTPS URL, Twitch channel, available operator and playable YouTube video. Provide hosting and speech usage free to judges. A simulated local demo is useful for evaluating the rules but is not proof of Twitch integration.

Plan to freeze the reviewable packet on 1 November and complete the owner's final entry before **2 November 2026, 23:00 Zagreb**. Formal rules and the displayed schedule conflict on judging dates; retain the submitted version and free access through **16 November, 02:00 Zagreb**, the later formal endpoint. See the [official rules](https://twitchcon-codex.devpost.com/rules) and [schedule](https://twitchcon-codex.devpost.com/details/dates). No registration or terms agreement is established by this runbook.
