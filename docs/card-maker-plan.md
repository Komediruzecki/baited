# Baited card maker

28 October 2026 update: the first channel-owned text card maker is implemented in Studio. See [Make a card pack](../packages/app/docs/card-maker.md) for its actual controls, privacy boundaries, limits and recovery behavior. This is source implementation status, not a claim of hosted deployment or a completed real-channel acceptance test.

The original 27 October plan follows as a design record. The first version includes text packs, draft/playable states, private pronunciation rehearsal, next-round custom/mixed selection, archive/restore and revision-safe saving. Optional example questions, artwork uploads, extra finishes, teammate authoring, viewer proposals and public discovery remain parked. References below to 78 built-in cards describe the earlier baseline; the new built-in deck has 100 targets. The public landing still includes ten examples.

## Recommendation

Build a channel-owned card library inside Streamer Studio. Start with custom words and clues using the approved Cut Open / Glass / Prism card. A streamer should be able to make a six-card pack, try recognition privately, and use it in the next round. Artwork uploads come next. Viewer submissions and AI artwork generation can follow after the basic editor works well.

The native Twitch panel stays focused on playing. A full editor would compete with the card for its small panel area. Open the editor from Studio, where there is room for fields and a real-size panel preview.

## Public examples and what stays secret

- Show ten fixed examples on the landing, covering easy, medium and hard cards. Keep the logo, backs, reveal and ribbon interactions intact. Label this as an example deck.
- Build only those examples into the landing data module and card artwork directories. Filtering 78 rendered cards down to ten while still sending every word to the browser would defeat the purpose.
- Keep all 78 cards playable. Keep the complete design catalogue in the development-only Card Lab for review.
- The development Card Lab is a public, unlisted URL, not an access-controlled vault. Its complete catalogue, older public versions, the installed Extension's artwork and a future public source repository can reveal possible words. Ten marketing examples reduce casual spoilers; they do not make the built-in word bank confidential.
- The fairness boundary is the **active target**. Only viewers receive it during a live round. Studio and OBS retain their safe projections. Knowing the catalogue does not reveal which card was drawn, though a short familiar deck makes guessing easier.
- A broadcaster who writes a pack knows its possible words. For surprises, add packs authored by a trusted teammate or moderator in a later phase. Do not promise that a broadcaster can never inspect a pack they own or a viewer surface they open.

## First version: make a pack in Studio

1. Open **Cards** from Studio. Show **Built-in deck** and **My packs**, with a card count, usable difficulties and draft/published status.
2. Choose **New pack** and give it a name. Start with one blank card, not a wall of empty slots.
3. Enter the target word. Pick difficulty: easy has no extra blocked clues, medium has two, hard has four. The target itself always stays out of chat.
4. Enter the blocked clues and an optional example question. Show clear inline errors for duplicates, missing clues, or a question that gives away the target or a blocked clue.
5. Preview the actual 320 px viewer card. Switch between live, urgent, paused, waiting and result states. Keep the selected readable clue row and pixel reveal; reduced motion shows the final artwork immediately.
6. Choose **Test pronunciation**. The streamer says the word while Moonshine shows its transcript and whether the matcher would flag it. This is an isolated test with no live chat, score change or OBS reveal. Clear test text when leaving the test. A successful pronunciation check is useful evidence, not a recognition guarantee.
7. Save the draft, then **Add to pack**. A text card with the Baited back and a type-led face is valid without custom artwork.
8. **Use this pack** becomes available when at least six distinct valid targets exist for the selected difficulty. Built-in, custom-only and mixed modes are explicit choices. Switching a pack applies to the next round.

Keep the save action visible beside the preview. Confirm saved state only after the server persists it. Failed saves keep the editor contents and offer Retry. Switching away from unsaved edits needs a choice to save or discard.

The implemented first version requires six targets per active difficulty, including mixed mode. A pack can contain several difficulties; Studio shows which ones have enough cards before it can be selected.

## Content and presentation

| Field | Initial rule |
| --- | --- |
| Pack name | 1–60 characters; channel-owned; draft by default |
| Target | One English word, 2–24 letters, normalized for matching; reject markup and control characters |
| Accepted spellings | Optional, up to three manually entered alternatives, checked for collisions with other targets and clues |
| Extra blocked clues | Exactly 0 / 2 / 4 for easy / medium / hard; distinct normalized words; no target or accepted spelling |
| Example question | Optional, up to 140 characters; no target, accepted spelling or blocked clue |
| Artwork | Optional in the first version; use a type-led card until upload support is implemented |
| Edition and colors | Approved card tokens and a small set of readable palettes; no freeform CSS or uploaded card layouts |
| Size limit | Start with 100 cards per channel and 10 packs; enforce on the server and revisit from real use |

The first version applies the text and quota limits above; the optional example question and artwork fields remain planned. Support multiword phrases, additional languages and more unusual spellings only after the text matcher and speech tests support them. Do not bias Moonshine with the hidden active word. Keep catch confirmation in the streamer's hands.

The editor changes text data; it does not bake words into an image. That preserves legibility, scaling and screen-reader output. Artwork remains a separate layer inside the existing safe art window. Rare foil or holographic treatments can be selected later without changing a card's gameplay rules.

## Implementation against the current code

The current game selects from static difficulty pools in `packages/app/server/words.ts`, gets its restrictions from `server/cards.ts`, and starts a round in `server/game.ts`. It already copies the active word, difficulty and clues into that round. `Game.view()` has separate viewer, Studio and overlay projections. Preserve those boundaries.

`server/app.ts` already protects Studio mutations with a session, an origin check and a CSRF token. Extend that path for the editor. Native Extension JWTs and viewer identities must not grant authoring access. Resolve the channel from the authenticated server session, never from a trusted-looking client field.

The current `server/store.ts` stores room snapshots in a private local file and encrypts OAuth credentials separately. It has no card library. Add a versioned, channel-scoped card store with an explicit migration, serialized writes and deletion handling. Card text is not an OAuth secret; keep it out of the credential vault. Do not claim the whole current state file is encrypted.

Proposed records:

```ts
type CustomCard = {
  id: string;                 // Opaque ID, independent of its word.
  ownerChannelId: string;
  revision: number;
  target: string;
  acceptedSpellings: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  blockedClues: string[];
  exampleQuestion?: string;
  artId?: string;
  status: 'draft' | 'published' | 'archived';
};
type CardPack = {
  id: string;
  ownerChannelId: string;
  name: string;
  cardIds: string[];
  revision: number;
};
```

Add authenticated list/create/update/archive routes for cards and packs. Include the expected revision in updates so two Studio tabs cannot silently overwrite each other. The normal Studio state stream should report the selected pack's name and eligible count, not its entire word list. The editor fetches that list only when opened. Make this explicit for streamers who screen-share Studio: **Your card library shows the words. Open it off stream.**

Introduce a deck resolver between `Game.start()` and the static pools. It returns validated built-in or channel-owned cards. Copy the selected card's revision, target, accepted spellings, blocked clues, difficulty and artwork reference into an immutable round snapshot. Editing or archiving a card must not change an active round, pending catch or saved result. Keep a historical artwork revision until referenced results can expire.

The current selector excludes the last twelve words. That can empty a six-card custom pool. Bound the repeat window to the eligible pool size minus one, retain a deterministic fallback, and test small and mixed decks. If no valid card exists, block Start with a useful explanation rather than creating an undefined target or silently changing difficulty.

Update transcript matching and chat-spoiler checks together for accepted spellings. Do not make ambiguous synonyms count as a catch. Enforce the same 0/2/4 clue model in the editor, game, viewer and native panel.

## Artwork uploads: second phase

Accept PNG, JPEG or WebP, capped initially at 5 MB and 2048 × 2048 pixels. Decode and re-encode server-side, strip metadata, reject malformed files and enforce decoded-pixel limits. Preserve transparency. Produce a display-size derivative and retain the original only within the owner's quota. Reject SVG, animated files, HTML and arbitrary remote image URLs in this phase.

Use opaque immutable artwork IDs. Do not put the target in a custom artwork filename, public URL or OBS payload. Reuse the current bounded image window and pixel-reveal component. Avoid introducing one WebGL scene or large filtered surface per card.

Custom artwork must reach the native Twitch viewer at runtime; it cannot require rebuilding the Extension ZIP for each upload. Confirm the new asset origin against the Extension's configured CSP before enabling this phase. Show a readable text fallback for missing art. Do not send artwork URLs to the live Studio or OBS projection when the illustration would disclose the target. A viewer can still share the image, so this is role separation rather than a promise of secrecy from viewers.

Before upload, ask the creator to confirm they may use the image. Provide archive/delete actions and a way to report inappropriate shared content before opening public pack discovery. Check Twitch's current Extension requirements again before expanding to user-generated public packs.

## Later: cards from the community

| Phase | Feature | Dependency |
| --- | --- | --- |
| 1 | Broadcaster-owned text cards, packs, recognition rehearsal, safe round selection | Channel authorization, persistence, deck resolver and projection tests |
| 2 | Owned artwork uploads and optional foil finishes | Image storage, validation, native asset policy and quotas |
| 3 | Trusted teammate pack authoring | Explicit author roles, revocable access, audit history and broadcaster approval |
| 4 | Viewer proposals in the panel; streamer approves between rounds | Moderation queue, spam limits, content controls and report/delete flow |
| Later experiment | Optional AI artwork assistant | Separate provider/key and cost decision; never a requirement for making a card |

Viewer proposals should not instantly enter a live round. A viewer could submit the current word, inappropriate text or a deliberately impossible clue set. Keep proposals private to the review queue, require approval, and apply changes at a round boundary. An author can always know their own submitted word.

## Acceptance before enabling it on the hosted game

- One channel cannot list, edit, archive or draw another channel's private cards, including by changing IDs in requests. Viewer and Extension tokens cannot call authoring routes.
- Six-card and mixed-difficulty packs never produce an empty selection. Archived or invalid cards are excluded. A repeat is avoided whenever another eligible card exists.
- Reload and backend restart retain saved drafts and packs. Failed writes do not falsely show Saved. Conflicting revisions produce an explicit recovery choice.
- The active target and target-revealing art stay out of live Studio/OBS payloads, labels, logs and URLs. Waiting/reconnecting native states do not reveal a previous target.
- Edits during a round leave that round unchanged. Resume, pending-catch decisions and history use the selected revision. Target and blocked-clue matching treat accepted spellings consistently.
- Text-only cards, long allowed words and all clue counts fit a 320 px panel and phone. Keyboard, screen reader, reduced motion and reconnect states remain usable.
- Test pronunciation with real microphones and several creators' accents. Save the observed outcomes separately from inferred recognition quality.
- Upload failures, broken artwork, quota errors and deletion have tested fallbacks before phase 2 is enabled.
- The normal landing still serves only ten examples. The complete Card Lab remains dev-only; a future private pack is never added to that synthetic public catalogue automatically.

Next implementation milestone: one broadcaster creates six text cards, saves a pack, tests a word with Moonshine, then plays a real Hosted Test round with a second viewer. Until that passes, keep the built-in deck as the default.
