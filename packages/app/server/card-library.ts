import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CARD_LIMITS, packInputSchema, targetForms,
  type CardLibraryView, type CardPack, type DeckSelection, type SelectedDeck,
} from '../shared/card-library.js';
import type { Difficulty } from '../shared/types.js';
import { words } from './words.js';
import { forbiddenClues } from './cards.js';
import type { CloudStorage } from './cloud-storage.js';

export interface DeckCard {
  target: string;
  difficulty: Difficulty;
  blockedClues: string[];
  acceptedSpellings: string[];
  cardId?: string;
  revision?: number;
  artId?: string;
}
interface Library { revision: number; packs: CardPack[]; selection: DeckSelection }
interface Snapshot { version: 1; channels: Record<string, Library> }
export class CardLibraryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const empty = (): Library => ({ revision: 0, packs: [], selection: { mode: 'builtin', packId: null } });
const counts = (): Record<Difficulty, number> => ({ easy: words.easy.length, medium: words.medium.length, hard: words.hard.length });
const builtin = (difficulty: Difficulty): DeckCard[] => words[difficulty].map((target) => ({ target, difficulty, blockedClues: forbiddenClues(target, difficulty), acceptedSpellings: [] }));

/** Separate versioned card text store. OAuth credentials remain in the existing encrypted vault. */
export class CardLibraryStore {
  private snapshot: Snapshot = { version: 1, channels: {} };
  private chain: Promise<unknown> = Promise.resolve();
  private ephemeral = new Set<string>();
  constructor(private dir: string, private writer?: (path: string, text: string) => Promise<void>,
    private artValidator?: (owner: string, artId: string) => boolean, private cloud?: CloudStorage) {}
  async load() {
    if (!this.cloud) await mkdir(this.dir, { recursive: true });
    try {
      const bytes = this.cloud ? await this.cloud.read('state/card-library.json') : await readFile(join(this.dir, 'card-library.json'));
      if (bytes === undefined) return;
      const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
      const raw = z.object({ version: z.literal(1), channels: z.record(z.string(), z.unknown()) }).strict().parse(parsed);
      const channels: Record<string, Library> = {};
      for (const [owner, value] of Object.entries(raw.channels)) {
        const library = z.object({
          revision: z.number().int().nonnegative(),
          selection: z.object({ mode: z.enum(['builtin', 'custom', 'mixed']), packId: z.string().uuid().nullable() }).strict(),
          packs: z.array(z.object({
            id: z.string().uuid(), revision: z.number().int().positive(), name: z.string(),
            status: z.enum(['draft', 'published', 'archived']), updatedAt: z.number(),
            cards: z.array(z.object({ id: z.string().uuid(), revision: z.number().int().positive(), target: z.string(), difficulty: z.enum(['easy', 'medium', 'hard']), blockedClues: z.array(z.string()), acceptedSpellings: z.array(z.string()), artId: z.string().uuid().optional() }).strict()),
          }).strict()).max(CARD_LIMITS.packs),
        }).strict().parse(value);
        for (const pack of library.packs) {
          packInputSchema.parse({ name: pack.name, status: pack.status === 'archived' ? 'draft' : pack.status, cards: pack.cards.map(({ revision: _revision, ...card }) => card) });
        }
        if (library.packs.reduce((sum, pack) => sum + pack.cards.length, 0) > CARD_LIMITS.cards) throw new Error('Invalid card library size.');
        if (new Set(library.packs.map((p) => p.id)).size !== library.packs.length) throw new Error('Duplicate card pack ID.');
        channels[owner] = library;
      }
      this.snapshot = { version: 1, channels };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  markEphemeral(owner: string) { this.ephemeral.add(owner); }
  private current(owner: string): Library { return this.snapshot.channels[owner] ?? empty(); }
  private async mutate<T>(owner: string, change: (draft: Library) => T): Promise<T> {
    const task = this.chain.catch(() => {}).then(async () => {
      const draft = structuredClone(this.current(owner));
      const result = change(draft);
      draft.revision++;
      const next: Snapshot = { version: 1, channels: { ...this.snapshot.channels, [owner]: draft } };
      // A save is acknowledged only once the replacement has reached disk. A failed
      // write leaves both the in-memory revision and the last on-disk file intact.
      await this.persist(next);
      this.snapshot = next;
      return result;
    });
    this.chain = task;
    return task;
  }
  private async persist(snapshot: Snapshot) {
    const text = JSON.stringify({ ...snapshot, channels: Object.fromEntries(Object.entries(snapshot.channels).filter(([owner]) => !this.ephemeral.has(owner))) });
    const path = join(this.dir, 'card-library.json');
    try {
      if (this.cloud) await this.cloud.write('state/card-library.json', Buffer.from(text));
      else if (this.writer) await this.writer(path, text);
      else {
        const temporary = `${path}.tmp`;
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, path);
      }
    } catch {
      throw new CardLibraryError(503, this.cloud
        ? 'Your pack could not be saved. Keep this page open and let the host know.'
        : 'Your pack could not be saved. Keep this page open and try again.');
    }
  }
  async savePack(owner: string, input: unknown) {
    const body = packInputSchema.parse(input);
    return this.mutate(owner, (library) => {
      const previous = body.id ? library.packs.find((pack) => pack.id === body.id) : undefined;
      if (body.id && !previous) throw new CardLibraryError(404, 'This pack is not in your library.');
      if (previous && previous.revision !== body.expectedRevision) throw new CardLibraryError(409, 'This pack changed in another tab. Reload it before saving.');
      if (!previous && body.expectedRevision !== undefined && body.expectedRevision !== 0) throw new CardLibraryError(409, 'Create a new pack or reload the saved pack.');
      if (!previous && library.packs.length >= CARD_LIMITS.packs) throw new CardLibraryError(400, 'Your library can hold up to ten packs.');
      if (library.packs.filter((p) => p.id !== previous?.id).reduce((sum, pack) => sum + pack.cards.length, 0) + body.cards.length > CARD_LIMITS.cards)
        throw new CardLibraryError(400, 'Your custom library can hold up to 100 cards.');
      if (body.status !== 'published' && library.selection.packId === previous?.id)
        throw new CardLibraryError(409, 'Switch to the built-in deck before making this pack a draft.');
      const cards = body.cards.map((card) => {
        if (card.artId && !this.artValidator?.(owner, card.artId))
          throw new CardLibraryError(400, 'Choose an approved image from your own library before saving this card.');
        const old = card.id ? previous?.cards.find((entry) => entry.id === card.id) : undefined;
        if (card.id && !old) throw new CardLibraryError(400, 'A card does not belong to this pack.');
        return { ...card, id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1 };
      });
      const pack: CardPack = { id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, name: body.name, status: body.status, cards, updatedAt: Date.now() };
      library.packs = previous ? library.packs.map((p) => p.id === previous.id ? pack : p) : [...library.packs, pack];
      return pack.id;
    });
  }
  async archive(owner: string, id: string, revision: number) {
    await this.mutate(owner, (library) => {
      const pack = library.packs.find((p) => p.id === id);
      if (!pack) throw new CardLibraryError(404, 'This pack is not in your library.');
      if (pack.revision !== revision) throw new CardLibraryError(409, 'This pack changed in another tab. Reload it before archiving.');
      if (library.selection.packId === id) library.selection = { mode: 'builtin', packId: null };
      pack.status = 'archived'; pack.revision++; pack.updatedAt = Date.now();
    });
  }
  async select(owner: string, selection: DeckSelection, revision: number, difficulty: Difficulty) {
    await this.mutate(owner, (library) => {
      if (library.revision !== revision) throw new CardLibraryError(409, 'Your library changed in another tab. Reload it before selecting a pack.');
      const candidate = { ...library, selection };
      this.resolveLibrary(candidate, difficulty);
      library.selection = selection;
    });
  }
  selected(owner: string, difficulty: Difficulty): SelectedDeck {
    const library = this.current(owner), selection = library.selection;
    const pack = library.packs.find((p) => p.id === selection.packId);
    let eligibleCount = 0, problem: string | null = null;
    try { eligibleCount = this.resolveLibrary(library, difficulty).length; }
    catch (error) { problem = error instanceof Error ? error.message : 'Choose a playable pack.'; }
    return { ...selection, name: selection.mode === 'builtin' ? 'Built-in deck' : pack?.name ?? 'Unavailable pack', eligibleCount, problem };
  }
  view(owner: string, difficulty: Difficulty): CardLibraryView {
    const library = this.current(owner);
    return { ...structuredClone(library), selected: this.selected(owner, difficulty), builtin: { counts: counts() }, limits: CARD_LIMITS };
  }
  resolve(owner: string, difficulty: Difficulty): DeckCard[] { return structuredClone(this.resolveLibrary(this.current(owner), difficulty)); }
  private resolveLibrary(library: Library, difficulty: Difficulty): DeckCard[] {
    if (library.selection.mode === 'builtin') return builtin(difficulty);
    const pack = library.packs.find((p) => p.id === library.selection.packId && p.status === 'published');
    if (!pack) throw new CardLibraryError(409, 'Choose a published pack or switch to the built-in deck.');
    const custom = pack.cards.filter((c) => c.difficulty === difficulty);
    if (custom.length < CARD_LIMITS.minimum) throw new CardLibraryError(409, `This pack needs six ${difficulty} cards. Choose another difficulty or the built-in deck.`);
    const cards: DeckCard[] = custom.map((card) => ({ target: card.target, difficulty: card.difficulty, blockedClues: [...card.blockedClues], acceptedSpellings: [...card.acceptedSpellings], cardId: card.id, revision: card.revision, ...(card.artId ? { artId: card.artId } : {}) }));
    if (library.selection.mode === 'custom') return cards;
    // A custom target/alias wins over the corresponding built-in card. The
    // selected mixed pool still contains one meaning per accepted spelling.
    const forms = new Set(custom.flatMap((c) => targetForms(c.target, c.acceptedSpellings)));
    return [...cards, ...builtin(difficulty).filter((c) => !targetForms(c.target).some((form) => forms.has(form)))];
  }
  async deleteOwner(owner: string) {
    const task = this.chain.catch(() => {}).then(async () => {
      const next = structuredClone(this.snapshot);
      delete next.channels[owner];
      await this.persist(next);
      this.snapshot = next;
      this.ephemeral.delete(owner);
    });
    this.chain = task;
    await task;
  }
  flush() { return this.chain; }
  referencedArt(owner: string): Set<string> {
    return new Set(this.current(owner).packs.flatMap((pack) => pack.cards.flatMap((card) => card.artId ? [card.artId] : [])));
  }
}
