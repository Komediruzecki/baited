# Build provenance

This document distinguishes the source package's recorded history from the current local improvement work. It is not proof of Devpost registration, entrant eligibility or acceptance of contest terms.

| Evidence | Recorded value | What it establishes |
| --- | --- | --- |
| Original package metadata | Session record supplied with the package, recorded 24 October 2026 | The supplied package identifies its original build thread as `01a16ee8-4685-73a1-8477-a738186e6ffc` and says its two session environment variables matched. That record is no longer a separate file; this row keeps its values unchanged. |
| Current improvement chat | `01a16ffb-42f5-7b02-b9bf-6e7e3e2dc1e7`, 25 October 2026 | The later audit, local fixes, design review and submission preparation belong to this chat. It is not the package's original main build session. |
| Original validation record | Historical Windows results in `docs/validation.md` | Reported fixture and browser results accompanying the package. Later Linux verification is recorded separately. |
| Source ownership | Supplied original code/license notices and logo provenance files | License records exist. Entrants still need to confirm authorship, contribution permissions and supplied-logo rights. |

## Source snapshot

- Original package: `/home/maff/foss/twigame/bait`. The audit confirmed all 275 supplied files remained unchanged when the isolated worktree was prepared.
- Original ZIP SHA-256: `025db2a6ba33a8396bc4c95935771053ce3ae7beba5ba57130fe41db4fd9c713`.
- Local repository: `/home/maff/foss/twigame/bait-repository`.
- Imported baseline: `bad578ddcc0428ecdb8582f49d9f3933bab22f72`.
- The unchanged imported baseline was pushed to private `main` and tagged `paolo-original-2026-10-24`.
- Improvement worktree: `/home/maff/foss/worktrees/twigame/bait-preview`, branch `feat/bait-preview`.
- The owner later authorized a private GitHub repository and checkpoint pushes. The verified repository is [Komediruzecki/bait](https://github.com/Komediruzecki/bait), with `origin` configured. Judge access has not been granted. Record the final pushed revision before entry.

The archive and audit evidence are retained under the registered agent output runs. These machine-local paths establish the source boundary; they are not public submission links.

The official event asks for the thread where most of the project was built. The original ID is therefore the current candidate for that field, subject to the project owners confirming it against their coding agent's session/status view. Keep the current implementation ID as additional provenance. Do not silently substitute this later chat just because it is available locally.

For the video, record actual build-session material with the owner's permission. Show relevant code changes and test results. Hide unrelated messages, provider credentials, OAuth callback queries, overlay keys, private file paths and personal information. A typed reconstruction of a conversation is not evidence of the original build.

This checkout had no configured remote at the start of the improvement pass. The private GitHub remote was created later with explicit owner authorization. Live demo and video links remain placeholders until created and verified. No Devpost state file or consent record has been fabricated.

## Remote checkpoints

The owner requested regular GitHub saves during active development. Use ordinary reviewed commits and pushes on `feat/bait-preview` after a coherent change and its relevant checks. This is a development workflow, not a scheduled automation, deployment, pull request or Devpost submission.

Review `git status --short` and `git diff`, stage the explicit source files intended for that checkpoint, then inspect `git diff --cached`. Keep resolved secrets, runtime state, local screenshots and temporary output out of the commit. Commit with a concrete description, push with `git push origin feat/bait-preview`, and verify that the remote branch points to the new commit. Do not rewrite the imported `main` baseline or unrelated work to make a checkpoint.

If a checkpoint is intentionally incomplete, say so in the commit and validation record; a remote save is not a passing test receipt. The repository includes a read-only GitHub Actions workflow for test/build checks on pushes and pull requests using Node 24. Use the [live Actions page](https://github.com/Komediruzecki/bait/actions) to verify the result for the exact remote revision; this document does not substitute for that check. Granting the private repository to judges or changing its visibility remains separate from saving the authorized branch.
