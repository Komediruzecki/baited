import { mkdir, copyFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [runPath] = process.argv.slice(2);
if (!runPath) throw new Error('Pass an active registered agent-out run as the only argument.');
const source = fileURLToPath(new URL('.', import.meta.url));
const run = resolve(runPath);
for (const [layout, master] of [['desktop', 'film-16x9.html'], ['phone', 'film-9x10.html']]) {
  const destination = join(run, 'scratch', layout);
  await mkdir(destination, { recursive: true });
  await copyFile(join(source, 'masters', master), join(destination, 'index.html'));
  for (const filename of ['film.css', 'timeline.js']) {
    await copyFile(join(source, filename), join(destination, filename));
  }
  await cp(join(source, 'art'), join(destination, 'art'), { recursive: true });
}
console.log('Prepared desktop and phone projects inside the registered run.');
