import { copyFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/server/', root), { recursive: true });
await copyFile(new URL('server/card-art-worker.mjs', root), new URL('dist/server/card-art-worker.mjs', root));
