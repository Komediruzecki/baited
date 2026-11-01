import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderErrorDocument } from '../../app/shared/error-pages.js';

/** Keep static error routes independent of the app JavaScript and its boot process. */
export async function installErrorPages(destination) {
  const app = fileURLToPath(new URL('../../app/', import.meta.url));
  await mkdir(resolve(destination, 'fonts'), { recursive: true });
  await copyFile(resolve(app, 'public/error-page.css'), resolve(destination, 'error-page.css'));
  for (const font of ['inter-latin.woff2', 'russo-one.ttf']) {
    await copyFile(resolve(app, 'public/fonts', font), resolve(destination, 'fonts', font));
  }
  await writeFile(resolve(destination, '404.html'), renderErrorDocument('missing', 'landing'));
}
