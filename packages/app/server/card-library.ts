import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CardLibrary } from './card-library-core.js';

export { CardLibrary, CardLibraryError, type DeckCard, type LibraryPersistence } from './card-library-core.js';

/** The Node server keeps the library in DATA_DIR, replaced atomically on every save. */
export class CardLibraryStore extends CardLibrary {
  constructor(dir: string, writer?: (path: string, text: string) => Promise<void>,
    artValidator?: (owner: string, artId: string) => boolean) {
    const path = join(dir, 'card-library.json');
    super({
      async read() {
        await mkdir(dir, { recursive: true });
        try { return await readFile(path, 'utf8'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }
      },
      async write(text) {
        if (writer) return writer(path, text);
        const temporary = `${path}.tmp`;
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, path);
      },
    }, artValidator);
  }
}
