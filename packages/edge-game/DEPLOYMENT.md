# Deployment boundary

The current real-game preparation is documented in [PILOT.md](./PILOT.md). Its configuration is [`wrangler.pilot.jsonc`](./wrangler.pilot.jsonc): disabled, no public routes, no workers.dev address, and no R2/D1/Container binding. Nothing has been activated.

The retained [`wrangler.jsonc`](./wrangler.jsonc) and [POC.md](./POC.md) describe the earlier synthetic P0–P2 proof. Its fixture issuer is loopback-only, and its optional protected-art reader is not an upload or scanning service. Do not deploy the synthetic config as the real pilot, and do not promote the public fixture key into a production secret.

The new pilot integrates existing Studio, OBS and Twitch Extension clients, OAuth, signed chat ingestion, local speech timing and a shared Baity queue. It still requires the requested review, passing CI and a separately opened real Twitch acceptance test. The owner controls Twitch console changes.

A build, test or PR merge does not create Cloudflare resources. There is no automatic deployment path in this branch. Neither local emulator checks nor published pricing establish hosted capacity or an invoice. Provider load/cost probes remain outside the current development authorization.
