# Pilot chat-delivery investigation — 30 October 2026

Status: repair prepared and tested locally; **not deployed**. The active stream was left untouched.

## Observed live evidence

- Public health returned HTTP 200 with `allowlisted-pilot` enabled. The configured streamer allowlist remained `komediruzecki7,lakeeko`, with a two-channel ceiling and synthetic authentication disabled.
- Cloudflare reported deployment `fc3e83a3-f03f-4efd-9f12-33d383a437a4`, created at 19:06:27 UTC, serving version `4658ebdf-534d-4e6b-a97d-5c4106832986`. This matched the expected last deployment. Existing secret bindings were present; their values were not read from Cloudflare.
- The scoped account audit query scanned 212 non-view actions over the preceding six hours. No unexpected later Baited deployment/configuration mutation was found. This is a scoped check, not an account-wide security attestation.
- A 40-second live tail at 22:32 UTC saw ten successful Worker invocations, including six webhook HTTP 403 responses and four HTTP 200 responses. No uncaught exceptions appeared in that sample.
- A second 40-second sample at 22:34 UTC saw 19 webhook notifications returning 403. Their timestamps were fresh, their signature headers had the expected shape, and every delivery ID failed our old format constraint. A separate shape-only check found 44-character IDs with base64url punctuation and `=` padding.

Raw request headers, bodies, cookies, credentials and URLs were not saved. These tail samples show header shape and handler rejection, **not independent cryptographic verification of those live requests**. Historical request logging was disabled, so there is no complete retrospective request trail.

A separate Twitch account appearing in public chat does not establish access to Baited controls. The inspected chat showed `jimmeopen01` speaking under that account's own identity. No evidence of privileged Baited access was found. These checks cannot establish who operates that Twitch account or rule out every form of compromise.

## Root cause and repair

`verifyWebhook` required delivery IDs to match `[A-Za-z0-9_-]{1,128}` before checking the HMAC. Correctly signed IDs ending in `=` were therefore rejected before they could enter Control's inbox or reach the game's command handler. Studio/Moonshine-driven round announcements could still work independently of incoming chat commands.

[Twitch documents delivery IDs as opaque, without a required format](https://dev.twitch.tv/docs/eventsub/handling-webhook-events#list-of-request-headers). The repair accepts 1–200 characters, rejects C0/C1 control characters, and preserves the exact ID for HMAC verification and deduplication. The bound matches the Room ingress schema. Signature, freshness, message type, subscription/channel checks, SQL-bound deduplication and moderator authorization remain in place.

Regression proof: correctly signed padded-ID auth/ingress and full delivery tests failed before the repair and passed afterward. The full path exercises gateway → Control inbox → Room command → bot outbox → Control → mocked Twitch Send Chat Message. It also covers forged signatures, altered payloads, duplicate deliveries, prototype-looking opaque IDs and non-moderator control attempts. No real bot message was sent by these tests.

## Review and deployment boundary

Independent source review found no concrete security defect in the opaque-ID repair. Auth/ingress tests passed 13/13; combined end-to-end tests passed 4/4. These are local tests, not proof of repaired live delivery.

The requested irch Opus 5.5 Max inspection could not start: the account mapping was missing from the review runner (`account_mapping_missing`). No fallback account was used. Earlier completed staff reviews remain documented separately; this new repair has not received an Opus review.

Do not change Twitch settings or deploy during the active stream without coordinating the interruption. After an approved deployment, verify webhook responses become 2xx, send a fresh `!bait who` after the channel cooldown, and check that exactly one response arrives. Old commands may have expired. Reconnect chat if Twitch has revoked a subscription after repeated delivery failures; do not repeatedly send commands to diagnose a cooldown.

Curated, sanitized receipts are in registered output run `baited/2026-10-30/021e46d37a124afa9f70035de155e63b/evidence`: `live-tail-sanitized.json` and `live-webhook-tail-sanitized.json`.
