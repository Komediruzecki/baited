# Review host response policy

This workspace package keeps development landing responses out of search indexes. The landing Worker calls `serveReviewHost` for its development environment; it serves a crawler-readable `robots.txt` and applies `X-Robots-Tag: noindex, nofollow` to every response. This is indexing behavior, not authentication or access control.

The implementation and tests were imported unchanged from [`Komediruzecki/disjoint-colliders/packages/review-host`](https://github.com/Komediruzecki/disjoint-colliders/tree/87bfc5d96bd63c39b30d39c8d7d245bd7252b578/packages/review-host) at revision `87bfc5d96bd63c39b30d39c8d7d245bd7252b578`. [IMPORT-MANIFEST.json](IMPORT-MANIFEST.json) records every source file and hash. The exact upstream MIT license and copyright notice are preserved in [LICENSE.disjoint-colliders](LICENSE.disjoint-colliders).

It has no runtime package dependencies and no connection to the old monorepo at build or runtime. The package name remains `@irchiinnuss/review-host` to preserve its attribution and existing import.

From the baited workspace root:

```sh
pnpm --filter @irchiinnuss/review-host check
pnpm --filter @irchiinnuss/review-host test:run
```

Both its TypeScript configuration and the landing's configuration are standalone. Neither extends a configuration in disjoint-colliders.
