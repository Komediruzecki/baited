# Landing deployment ownership

The landing source lives in `packages/landing`. Its Cloudflare Workers remain `maff-bait-dev` and `maff-bait`; their canonical domains are `dev.baited.maff.app` and `baited.maff.app`. The owner also requested these new domain names. The former `dev.bait.maff.app` and `bait.maff.app` domains remain redirect aliases, preserving existing links. This does not deploy the game.

## Credentials

This repository needs GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. GitHub does not return existing secret values from another repository. The owner identified Proton dev item `cf-irchiinnuss-api-token`, with fields of those names.

From this repository root, provision them without printing values:

```sh
pass-cli run --env-file ops/cloudflare.env.tmpl -- python3 ops/set-cloudflare-secrets.py
gh secret list --repo Komediruzecki/baited
```

The second command lists metadata only. The helper sends values through stdin, never command arguments, and does not enable deployment. Verify the token can manage the existing Workers in the specified account. Never copy credentials into source, logs, ZIP files or the personal planning hub.

## Transfer deployment control once

1. Pass application, Extension, landing and helper checks on the migration branch. Verify artwork hashes and a local landing preview.
2. Provision and verify the two secrets. Keep `LANDING_DEPLOY_ENABLED` unset until the former deploy workflow is stopped.
3. Disable `.github/workflows/deploy-bait.yml` in `Komediruzecki/disjoint-colliders`; confirm no old deployment run is still in progress. Preserve that repository's branch and source history.
4. Enable `LANDING_DEPLOY_ENABLED=true` in `Komediruzecki/baited`. Promote the verified migration commit to `main`. Its path-filtered workflow deploys dev.
5. Wait for dev deployment and served-content checks. Then create the matching annotated landing release tag on that main commit and push it to publish production. A manual workflow dispatch on main can only publish dev.
6. Verify the production HTML and original logo/card assets from the expected release. Record both workflow URLs and the commit. Leave the app/Extension deployment unchanged.

Do not run both repositories' deploy workflows against these Workers. To roll back, leave a single deployment owner and deploy a verified prior landing revision. Re-enabling the old workflow is a separate ownership reversal, not an additional deployment channel.

## Release boundaries

- A `bait-v*` tag releases the landing only. Application and native Extension versions remain independent.
- Production requires an annotated tag, exact package-version match and main ancestry. Do not bypass these checks for a migration.
- The new Cloudflare custom domains are provisioned by Wrangler. Collaborator invitations and public visibility changes remain separate actions.
- Removing the old disjoint-colliders branch is explicitly deferred by the owner.
