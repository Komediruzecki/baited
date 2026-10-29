import { readFile } from 'node:fs/promises';

const meta = JSON.parse(await readFile(new URL('../dist/server/metafile-esm.json', import.meta.url), 'utf8'));
const imports = Object.values(meta.outputs).flatMap((output) => output.imports ?? []);
if (imports.some((entry) => entry.external && entry.path.startsWith('@baited/'))) {
  throw new Error('The server bundle must not import unbuilt Baited workspace TypeScript.');
}
if (!Object.keys(meta.inputs).some((input) => input.endsWith('/game-core/game.ts'))) {
  throw new Error('The server bundle is missing the shared game rules.');
}
console.log('Server bundle includes the shared game rules without an unbuilt workspace import.');
