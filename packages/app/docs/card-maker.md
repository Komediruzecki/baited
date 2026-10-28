# Make a card pack

28 October 2026. The first card maker is implemented in Streamer Studio. This guide describes the source build; it does not establish that the hosted backend or installed Twitch Extension has been updated. Built-in cards remain the default.

Use **Cards** to make words for your channel, check their pronunciation and choose the next round's deck. The native Twitch panel stays focused on playing; editing happens in Studio.

## Make your first six cards

1. Open Studio, choose **Cards**, then **Open card library**. Keep this view outside your stream capture: it shows possible words, including your custom targets.
2. Choose **New pack** and give it a name. Start with one target word. Use **Add card** when that card is complete.
3. Choose Easy, Medium or Hard. Easy keeps only the target and its accepted spellings out of chat. Medium adds two off-limits words; Hard adds four.
4. If needed, open **Accepted spellings** and add up to three comma-separated spellings of the same word. These also trigger speech catches and private guesses, and stay out of chat. Use spelling alternatives, not synonyms.
5. Check **Chat's card** beside the editor. Switch between Live, Urgent, Paused, Waiting and Result, or replay the reveal. It uses the same Cut Open card as the viewer, with the Glass finish and Prism back. Existing Baited artwork appears for a known illustrated word; new words have a text-led face.
6. Choose **Save draft**. Every card in the pack must have a valid target and the required clues before the draft can be saved. A draft can contain fewer than six cards.
7. Add six distinct cards at the same difficulty, then choose **Save and make playable**. “Playable” makes the pack available to your channel. It does not publish it to a public gallery.
8. Match the difficulty in **Game settings** to a ready difficulty in the pack. Choose **Use this pack** or **Mix with built-in cards**, then return to Studio and start the next round.

The next-round summary shows the selected pack, mode and eligible card count. Choosing a deck or editing a card leaves a round already in progress unchanged, including its clues, accepted spellings and pending catch.

## Choose a deck

| Choice | What the next round draws |
| --- | --- |
| Built-in deck | The built-in cards at the selected difficulty. |
| Use this pack | Only this channel's selected playable pack, at the selected difficulty. |
| Mix with built-in cards | That pack plus built-in cards at the selected difficulty. A custom card takes precedence when its target or accepted spelling overlaps a built-in card. |

Both custom and mixed modes require at least six distinct cards in the pack at the selected difficulty. Having six Easy cards does not make the pack ready for Medium. The selector avoids recent targets and equivalent spellings, with a repeat window that stays smaller than the available deck.

If edits or a difficulty change leave the selected pack short of six eligible cards, Studio explains the problem and blocks the next start. Automatic play stops between rounds. Add cards, choose another difficulty or switch to the built-in deck to continue. The game does not silently change difficulty.

## Try pronunciation privately

Finish any active round and turn off Studio's game microphone. In the card editor, choose **Test pronunciation**, allow microphone access and say the word in an ordinary sentence. The browser needs HTTPS or localhost for microphone access.

Moonshine runs locally and shows the transcript plus whether the shared matcher heard the target or one of its accepted spellings. The test lasts up to one minute. **Stop test** finishes the current take; **Clear text** removes the displayed transcript. Leaving the editor, changing the word or hiding the tab stops capture and clears the test text.

This rehearsal has no game speech socket, scoring or OBS path. Its audio and transcript stay in the tab. It neither starts a round nor biases the model with the secret word. One successful take is useful rehearsal, not a guarantee: normal Moonshine catches still require the streamer's confirmation.

## Save, recover and archive

Saved state appears only after the server accepts and persists the pack. A failed save leaves the editor contents available to retry. The editor warns before discarding unsaved changes; unsaved text is not a durable backup and can be lost if the browser or computer closes unexpectedly.

Each saved pack has a revision. If another tab changes it first, Baited keeps your edits and offers **Save as new pack** or **Load saved version**. Saving a new copy needs room within the channel limits.

**Archive** removes a pack from future draws. Archiving the selected pack switches the next round to built-in cards; a current round and past results keep their original data. Open **Archived packs** and choose **Restore draft** to edit it again. Restore reuses the saved pack rather than consuming another pack slot. Make it playable and select it again when ready.

To turn a selected playable pack back into a draft without archiving it, choose **Use built-in deck** first, then **Save as draft**.

## Limits and privacy

| Field | Current rule |
| --- | --- |
| Pack name | 1–60 characters of plain text. |
| Target and each spelling | One English word, 2–24 ASCII letters; trimmed and lowercased. |
| Accepted spellings | Up to three; no collisions with another target or spelling in the same pack. |
| Off-limits words | Exactly 0 / 2 / 4 for Easy / Medium / Hard; distinct words, excluding the target and its accepted spellings. |
| Channel library | Up to 100 custom cards across ten packs, including archived packs. The 100 built-in cards do not consume this allowance. Restore or edit an existing pack to reuse its capacity. |

The authenticated broadcaster owns the library. The server derives the channel from the session; viewer identities and Extension tokens cannot list or edit its packs. There is no moderator author role or viewer proposal queue in this version.

The normal Studio feed contains the selected pack's summary, not its word list. OBS receives no active target or custom library. Opening Cards is an intentional authoring action that reveals the catalogue and the channel's saved words. A pack author knows its possible targets, and viewers can share what they see; this is role separation, not a promise that an author cannot discover the current word through a viewer surface.

Custom card text is stored in the backend's versioned `DATA_DIR/card-library.json`, with serialized atomic replacement and owner-scoped records. This file is not encrypted like the separate OAuth credential vault. Demo packs are temporary and are excluded from disk persistence. Deleting the Baited account data also removes that owner's card library. Keep the data directory private and on persistent storage for a hosted game.

Baity checks outgoing posts against the live target and its spellings, including messages queued before a new card and messages waiting for token refresh. A confirmed catch or escape may still reveal its result.

## What comes later

Optional example questions, artwork uploads, custom finishes, trusted teammate authoring, viewer proposals and public pack discovery remain planned. This version does not generate artwork, accept uploads or share packs between channels. The [card maker plan](../../../docs/card-maker-plan.md) preserves those follow-ups.

The first live acceptance step is one broadcaster making six cards, rehearsing them with a real microphone, then playing a Hosted Test round with a second viewer and OBS. Automated persistence, revision, authorization, small-deck, alias, projection and bot tests do not replace that rehearsal.
