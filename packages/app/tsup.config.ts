import { defineConfig } from 'tsup';

// Workspace packages export TypeScript source. Bundle the shared rules so the
// shipped Node entry does not need a TS loader or a second package build.
export default defineConfig({
  noExternal: ['@baited/game-core'],
  metafile: true,
});
