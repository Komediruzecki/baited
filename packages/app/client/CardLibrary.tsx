import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Difficulty } from '../shared/types';
import type { CardLibraryView, CardPack, CardIssue } from '../shared/card-library';
import catalogue from '../shared/card-review-catalogue.json';
import { CardBack } from './CardBack';
import { CutCard } from './CutCard';
import { CardPronunciation } from './CardPronunciation';
import { CardArtwork } from './CardArtwork';
import { isEdgeRuntime } from './api';
import { Button, Modal, Tag } from './ui';
import { ArrowRight, Check, Eye, RotateCcw, Trash2, X } from './icons';
import {
  acceptedSpellings, blankCard, clueCount, difficulties, packFormIssues, packMinimum,
  packPayload, readyCounts, type EditableCard, type EditablePack,
} from './card-library-model';
import './card-library.css';

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const editable = (pack: CardPack): EditablePack => ({
  id: pack.id, revision: pack.revision, name: pack.name,
  status: pack.status === 'published' ? 'published' : 'draft',
  cards: pack.cards.map((card) => ({ ...card, aliasesText: card.acceptedSpellings.join(', ') })),
});
const fingerprint = (pack: EditablePack | null) => JSON.stringify(pack);

class LibraryError extends Error {
  constructor(message: string, public status: number, public issues: CardIssue[] = []) { super(message); }
}
async function libraryRequest(path = '', body?: unknown, csrf?: string): Promise<CardLibraryView> {
  const response = await fetch(`/api/studio/cards${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: 'The server did not respond. Try again.' }));
  if (!response.ok) throw new LibraryError(data.error || 'Could not save the card library. Try again.', response.status, data.issues);
  return data;
}

const Pips = ({ level }: { level: number }) => <b className="card-maker__pips" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} data-on={n <= level} />)}</b>;

type PreviewState = 'live' | 'urgent' | 'paused' | 'waiting' | 'result';
function CardPreview({ card }: { card: EditableCard }) {
  const [state, setState] = useState<PreviewState>('live');
  const [replay, setReplay] = useState(0);
  const word = card.target.trim().toLowerCase();
  const title = { live: 'Round 07', urgent: 'Round 07', paused: 'Paused', waiting: 'Next round', result: 'Chat wins' }[state];
  return <section className="card-maker__preview panel" aria-label="Viewer card preview">
    <div className="card-maker__subheading"><h3>Chat’s card</h3><span>320 px preview</span></div>
    <div className="card-maker__states" role="group" aria-label="Preview state">
      {(['live', 'urgent', 'paused', 'waiting', 'result'] as PreviewState[]).map((s) =>
        <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}>{titleCase(s)}</button>)}
    </div>
    <div className="card-maker__preview-stage">
      {state === 'waiting' || !word ? <div className="card-maker__back-preview"><CardBack /><span className="sr-only">{word ? 'The card stays hidden until the round starts.' : 'Enter a target word to see its card.'}</span></div> :
        <CutCard key={`${word}-${card.artId}-${replay}`} word={word} artUrl={card.artId ? `/api/studio/card-art/${card.artId}.png` : undefined} artPreview chip={title} level={difficulties.indexOf(card.difficulty) + 1}
          clues={card.blockedClues.filter(Boolean)} progress={state === 'urgent' ? 0.1 : state === 'result' ? 0 : 0.725} urgent={state === 'urgent'}
          footer={state === 'urgent' ? '0:12' : state === 'result' ? 'Caught' : state === 'paused' ? 'Paused' : '1:27'}
          className={state === 'urgent' ? 'is-urgent' : ''} />}
    </div>
    <div className="card-maker__preview-note"><span>{!word ? 'Your word goes here.' : state === 'waiting' ? 'Hidden before the next round.' : 'Cut Open · Glass · Prism'}</span>
      {word && state !== 'waiting' && <Button className="text" onClick={() => setReplay((n) => n + 1)}><RotateCcw size={14} />Replay reveal</Button>}
    </div>
  </section>;
}

export const CardLibrary = memo(function CardLibrary({ csrf, difficulty, offline, pronunciationDisabled, onDirtyChange, onBusyChange, onDeckChange }: {
  csrf: string; difficulty: Difficulty; offline: boolean; pronunciationDisabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onDeckChange: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [view, setView] = useState<CardLibraryView | null>(null);
  const [section, setSection] = useState<'packs' | 'builtin'>('packs');
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState('');
  const artBusy = useCallback((active: boolean) => setBusy(active ? 'art' : ''), []);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [issues, setIssues] = useState<CardIssue[]>([]), [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<EditablePack | null>(null), [baseline, setBaseline] = useState('null');
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [archive, setArchive] = useState<CardPack | null>(null);
  const [remove, setRemove] = useState<number | null>(null);
  const [nextDifficulty, setNextDifficulty] = useState<Difficulty | null>(null);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const [builtinWord, setBuiltinWord] = useState(catalogue[0].word);
  const id = useId(), editorHeading = useRef<HTMLHeadingElement>(null), targetField = useRef<HTMLInputElement>(null);
  const dirty = draft !== null && fingerprint(draft) !== baseline;
  const card = draft?.cards[index];
  const removedClueCount = nextDifficulty && card ? card.blockedClues.slice(clueCount[nextDifficulty]).filter((clue) => clue.trim()).length : 0;
  const counts = useMemo(() => readyCounts(draft?.cards ?? []), [draft]);
  const visiblePacks = view?.packs.filter((pack) => pack.status !== 'archived') ?? [];
  const archivedPacks = view?.packs.filter((pack) => pack.status === 'archived') ?? [];
  const channelFreeCards = Math.max(0, (view?.limits.cards ?? 100) - (view?.packs ?? []).reduce((sum, pack) => sum + pack.cards.length, 0));
  const remainingCards = Math.max(0, (view?.limits.cards ?? 100) - (view?.packs ?? []).filter((pack) => pack.id !== draft?.id).reduce((sum, pack) => sum + pack.cards.length, 0));
  const filtered = useMemo(() => catalogue.filter((item) =>
    (filter === 'all' || item.difficulty === filter) && item.word.includes(search.trim().toLowerCase())), [search, filter]);
  const selectedBuiltin = catalogue.find((item) => item.word === builtinWord) ?? catalogue[0];
  const builtinCard: EditableCard = {
    target: selectedBuiltin.word, difficulty: selectedBuiltin.difficulty as Difficulty,
    blockedClues: selectedBuiltin.clues.slice(0, clueCount[selectedBuiltin.difficulty as Difficulty]), aliasesText: '',
  };
  const acceptView = (next: CardLibraryView) => setView((previous) => previous && previous.revision > next.revision ? previous : next);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(!!busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const load = async () => {
    setLoading(true); setError('');
    try { acceptView(await libraryRequest()); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (opened) void load(); }, [opened, difficulty]);
  const guard = (next: () => void) => { if (dirty) setPending(() => next); else next(); };
  const resetFeedback = () => { setError(''); setIssues([]); setMessage(''); setConflict(false); };
  const edit = (pack?: CardPack) => {
    const next = pack ? editable(pack) : { name: '', status: 'draft' as const, cards: [blankCard(difficulty)] };
    setDraft(next); setBaseline(pack ? fingerprint(next) : 'null'); setIndex(0); setSection('packs'); resetFeedback();
    requestAnimationFrame(() => editorHeading.current?.focus());
  };
  const change = (update: Partial<EditablePack>) => { setDraft((value) => value ? { ...value, ...update } : value); setMessage(''); setIssues([]); };
  const changeCard = (update: Partial<EditableCard>) => {
    if (!draft) return;
    change({ cards: draft.cards.map((item, i) => i === index ? { ...item, ...update } : item) });
  };
  const applyDifficulty = (difficulty: Difficulty) => {
    if (!card) return;
    changeCard({ difficulty, blockedClues: Array.from({ length: clueCount[difficulty] }, (_, n) => card.blockedClues[n] ?? '') });
    setNextDifficulty(null);
  };
  const chooseDifficulty = (difficulty: Difficulty) => {
    if (card?.blockedClues.slice(clueCount[difficulty]).some((clue) => clue.trim())) setNextDifficulty(difficulty);
    else applyDifficulty(difficulty);
  };
  const fieldError = (path: string) => issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`)).map((issue) => issue.message).filter((msg, i, all) => all.indexOf(msg) === i).join(' ');
  const save = async (status: 'draft' | 'published' = draft?.status ?? 'draft', asCopy = false): Promise<boolean> => {
    if (!draft || !view || offline || busy) return false;
    const saving = asCopy ? { ...draft, id: undefined, revision: undefined, status, cards: draft.cards.map(({ id: _id, ...item }) => item) } : { ...draft, status };
    const validation = packFormIssues(saving);
    if (validation.length) {
      setIssues(validation); setError('Check the marked fields before saving.');
      const firstCard = /^cards\.(\d+)/.exec(validation[0].path);
      if (firstCard) setIndex(Number(firstCard[1]));
      requestAnimationFrame(() => {
        const field = document.getElementById(`${id}-${validation[0].path}`);
        const disclosure = field?.closest('details');
        if (disclosure) disclosure.open = true;
        (field ?? targetField.current)?.focus();
      });
      return false;
    }
    setBusy('save'); setError(''); setMessage(''); setIssues([]);
    try {
      const next = await libraryRequest('/pack', packPayload(saving), csrf);
      const saved = next.packs.find((pack) => pack.id === next.savedPackId);
      acceptView(next);
      if (!saved) throw new Error('The pack was saved, but its editor could not reload. Open the saved pack from My packs.');
      const fresh = editable(saved); setDraft(fresh); setBaseline(fingerprint(fresh)); setConflict(false);
      setMessage(status === 'published' ? 'Pack saved and playable. Choose how to use it below.' : 'Draft saved. It stays out of rounds until you make it playable.');
      onDeckChange(); return true;
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof LibraryError) { setIssues(cause.issues); setConflict(cause.status === 409); }
      return false;
    } finally { setBusy(''); }
  };
  const select = async (mode: 'builtin' | 'custom' | 'mixed', packId?: string) => {
    if (!view) return;
    setBusy('select'); resetFeedback();
    try {
      acceptView(await libraryRequest('/select', { mode, ...(packId ? { packId } : {}), expectedRevision: view.revision }, csrf));
      setMessage('Deck selected for the next round. A round already in progress keeps its card.'); onDeckChange();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof LibraryError && cause.status === 409) {
        try { acceptView(await libraryRequest()); } catch { /* Keep the action's failure and current view available for retry. */ }
      }
    }
    finally { setBusy(''); }
  };
  const archivePack = async () => {
    if (!archive) return;
    setBusy('archive'); resetFeedback();
    try {
      acceptView(await libraryRequest('/archive', { id: archive.id, expectedRevision: archive.revision }, csrf));
      if (draft?.id === archive.id) { setDraft(null); setBaseline('null'); }
      setArchive(null); setMessage('Pack archived. It will not be drawn in future rounds.'); onDeckChange();
    } catch (cause) {
      setError((cause as Error).message); setArchive(null);
      if (cause instanceof LibraryError && cause.status === 409) {
        try { acceptView(await libraryRequest()); } catch { /* Keep the failed action visible. */ }
      }
    }
    finally { setBusy(''); }
  };
  const restore = async (pack: CardPack) => {
    setBusy('restore'); resetFeedback();
    try {
      const next = await libraryRequest('/pack', packPayload(editable(pack), 'draft'), csrf);
      acceptView(next);
      const restored = next.packs.find((item) => item.id === pack.id);
      if (restored) edit(restored);
      setMessage('Pack restored as a draft. Make it playable when you are ready.');
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof LibraryError && cause.status === 409) {
        try { acceptView(await libraryRequest()); } catch { /* Keep the failed action visible. */ }
      }
    }
    finally { setBusy(''); }
  };
  const reloadSaved = async () => {
    setBusy('reload');
    try {
      const next = await libraryRequest(); acceptView(next);
      const saved = next.packs.find((pack) => pack.id === draft?.id && pack.status !== 'archived');
      if (saved) edit(saved); else { setDraft(null); setBaseline('null'); resetFeedback(); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(''); }
  };
  if (!opened) return <section className="card-library card-library__gate panel">
    <div className="card-library__closed-deck" aria-hidden="true"><CardBack /></div>
    <div><span className="card-library__eyebrow">The next round starts here</span><h2>Make a deck your chat will know.</h2>
      <p>Add your own words, check how they sound, then deal them into your next stream.</p>
      <p className="card-library__warning"><Eye size={18} /><span>Your card library shows possible words. Open it off stream.</span></p>
      <Button className="primary" disabled={offline} onClick={() => setOpened(true)}>Open card library <ArrowRight size={18} /></Button>
    </div>
  </section>;
  return <div className="card-library">
    <div className="card-library__toolbar">
      <div className="card-library__sections" role="group" aria-label="Card collections">
        <button aria-pressed={section === 'packs'} disabled={!!busy} onClick={() => guard(() => { setSection('packs'); setDraft(null); resetFeedback(); })}>My packs <span>{visiblePacks.length}</span></button>
        <button aria-pressed={section === 'builtin'} disabled={!!busy} onClick={() => guard(() => { setSection('builtin'); setDraft(null); resetFeedback(); })}>Built-in deck <span>{catalogue.length}</span></button>
      </div>
      <Button className="primary" disabled={offline || !!busy || !view || view.packs.length >= view.limits.packs || channelFreeCards < 1} onClick={() => guard(() => edit())}><span aria-hidden="true">+</span> New pack</Button>
    </div>
    <div className="card-library__notice"><Eye size={16} /><span>Words are visible here. Keep this tab out of your stream capture.</span></div>
    {view && (view.packs.length >= view.limits.packs || channelFreeCards < 1) && <p className="card-library__quota">Your channel can save {view.limits.cards} cards across {view.limits.packs} packs, including archived packs. Edit an existing pack or restore one below.</p>}
    {view && <div className="card-library__selection"><div><span>Next rounds · {titleCase(difficulty)}</span><strong>{view.selected.name}</strong></div><span>{view.selected.mode === 'mixed' ? 'Mixed deck' : view.selected.mode === 'custom' ? 'Custom cards only' : 'Built-in cards'} · {view.selected.eligibleCount} cards</span>
      {view.selected.mode !== 'builtin' && <Button className="text" disabled={offline || !!busy} onClick={() => void select('builtin')}>Use built-in deck</Button>}
      {view.selected.problem && <p role="alert">{view.selected.problem}</p>}
    </div>}
    {loading && <p role="status">Opening your card library…</p>}
    {error && <div className="card-library__error" role="alert"><strong>{error}</strong>
      {conflict ? <><p>Your edits are still here. Save them as a new pack, or load the version saved in another tab.</p><div className="card-library__actions">
        <Button className="secondary" disabled={!!busy || offline} onClick={() => void save('draft', true)}>Save as new pack</Button>
        <Button className="text" disabled={!!busy || offline} onClick={() => guard(() => void reloadSaved())}>Load saved version</Button>
      </div></> : !view && <Button className="secondary" disabled={loading || offline} onClick={() => void load()}>Try again</Button>}
      {!!issues.length && <ul>{issues.slice(0, 8).map((issue, n) => <li key={`${issue.path}-${n}`}>{/^cards\.\d+/.test(issue.path) ? `Card ${Number(issue.path.split('.')[1]) + 1}: ` : ''}{issue.message}</li>)}</ul>}
    </div>}
    {message && <p className="card-library__saved" role="status"><Check size={18} />{message}</p>}
    {view && section === 'packs' && !draft && <section className="card-library__packs">
      {!visiblePacks.length ? <div className="card-library__empty panel"><h2>Your first six words.</h2><p>Start a pack with words from your community. Six cards at the same difficulty make it ready for a round.</p><Button className="secondary" disabled={offline || view.packs.length >= view.limits.packs || channelFreeCards < 1} onClick={() => edit()}>Make my first pack <ArrowRight size={16} /></Button></div> :
        visiblePacks.map((pack) => <article className="card-library__pack panel" key={pack.id}>
          <div className="card-library__pack-top"><Tag tone={pack.status === 'published' ? 'success' : 'muted'}>{pack.status === 'published' ? 'Playable' : 'Draft'}</Tag>{view.selection.packId === pack.id && <span className="card-library__selected"><Check size={14} />Selected</span>}</div>
          <h2>{pack.name}</h2><p>{pack.cards.length} {pack.cards.length === 1 ? 'card' : 'cards'}</p>
          <div className="card-library__pack-counts">{difficulties.map((d) => { const count = pack.cards.filter((item) => item.difficulty === d).length; return <span key={d} data-ready={count >= packMinimum}>{titleCase(d)} <b>{count}</b></span>; })}</div>
          <div className="card-library__actions"><Button className="secondary" onClick={() => edit(pack)}>Edit pack <ArrowRight size={16} /></Button><Button className="text" aria-label={`Archive ${pack.name}`} disabled={!!busy || offline} onClick={() => setArchive(pack)}><Trash2 size={16} /></Button></div>
        </article>)}
    </section>}
    {view && section === 'packs' && !draft && !!archivedPacks.length && <details className="card-library__archived"><summary>Archived packs ({archivedPacks.length})</summary><p>Archived packs keep their saved cards and count toward your channel’s limit.</p>{archivedPacks.map((pack) => <div key={pack.id}><span><strong>{pack.name}</strong><small>{pack.cards.length} cards</small></span><Button className="secondary" disabled={!!busy || offline} onClick={() => void restore(pack)}>Restore draft</Button></div>)}</details>}
    {view && section === 'packs' && draft && card && <div className="card-maker">
      <section className="card-maker__editor panel">
        <div className="card-maker__heading"><div><span className="card-library__eyebrow">{draft.id ? 'Edit pack' : 'New pack'}</span><h2 tabIndex={-1} ref={editorHeading}>{draft.name || 'Give chat something to work with.'}</h2></div><Button className="text" aria-label="Close pack editor" disabled={!!busy} onClick={() => guard(() => { setDraft(null); resetFeedback(); })}><X size={20} /></Button></div>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="card-maker__field"><label htmlFor={`${id}-name`}>Pack name</label><input id={`${id}-name`} value={draft.name} maxLength={60} autoComplete="off" placeholder="Friday regulars" disabled={!!busy} aria-invalid={!!fieldError('name')} aria-describedby={fieldError('name') ? `${id}-name-error` : undefined} onChange={(e) => change({ name: e.target.value })} />{fieldError('name') && <span id={`${id}-name-error`} className="card-maker__field-error">{fieldError('name')}</span>}</div>
          <div className="card-maker__cards-heading"><h3>Cards <span>{draft.cards.length}/{remainingCards}</span></h3><Button type="button" className="text" disabled={!!busy || draft.cards.length >= remainingCards} onClick={() => { change({ cards: [...draft.cards, blankCard(card.difficulty)] }); setIndex(draft.cards.length); requestAnimationFrame(() => targetField.current?.focus()); }}>+ Add card</Button></div>
          <div className="card-maker__card-tabs" role="group" aria-label="Cards in this pack">{draft.cards.map((item, n) => <button key={item.id || n} type="button" disabled={!!busy} aria-pressed={index === n} onClick={() => setIndex(n)} className={issues.some((issue) => issue.path.startsWith(`cards.${n}.`)) ? 'has-error' : ''}><span>{String(n + 1).padStart(2, '0')}</span>{item.target || 'New word'}<Pips level={difficulties.indexOf(item.difficulty) + 1} /><span className="sr-only">, {item.difficulty}</span></button>)}</div>
          <div className="card-maker__card-fields"><div className="card-maker__subheading"><h3>Card {String(index + 1).padStart(2, '0')}</h3><Button type="button" className="text" disabled={!!busy || draft.cards.length < 2} onClick={() => setRemove(index)}><Trash2 size={15} />Remove</Button></div>
            <div className="card-maker__field"><label htmlFor={`${id}-cards.${index}.target`}>Target word</label><input ref={targetField} id={`${id}-cards.${index}.target`} value={card.target} maxLength={24} autoComplete="off" spellCheck={false} autoCapitalize="none" placeholder="trombone" disabled={!!busy} aria-invalid={!!fieldError(`cards.${index}.target`)} aria-describedby={`${id}-target-help`} onChange={(e) => changeCard({ target: e.target.value })} /><span className={fieldError(`cards.${index}.target`) ? 'card-maker__field-error' : 'card-maker__hint'} id={`${id}-target-help`}>{fieldError(`cards.${index}.target`) || 'One English word, 2–24 letters. This is what chat wants you to say.'}</span></div>
            <fieldset className="card-maker__difficulty"><legend>Difficulty</legend><div>{difficulties.map((d) => <button key={d} type="button" disabled={!!busy} aria-pressed={card.difficulty === d} onClick={() => chooseDifficulty(d)}><strong>{titleCase(d)}<Pips level={difficulties.indexOf(d) + 1} /></strong><span>{clueCount[d] ? `${clueCount[d]} extra off-limits words` : 'Target only'}</span></button>)}</div></fieldset>
            <fieldset className="card-maker__clues"><legend>Keep out of chat</legend><p className="card-maker__hint">{card.difficulty === 'easy' ? 'The target and its accepted spellings are the only words kept out.' : 'Choose obvious clues that would make the target too easy to guess.'}</p><div>{card.blockedClues.map((clue, n) => <label key={n}><span className="sr-only">Off-limits word {n + 1}</span><span aria-hidden="true">−</span><input id={`${id}-cards.${index}.blockedClues.${n}`} value={clue} maxLength={24} placeholder={`Clue ${n + 1}`} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={!!busy} aria-invalid={!!fieldError(`cards.${index}.blockedClues`)} aria-describedby={fieldError(`cards.${index}.blockedClues`) ? `${id}-clues-error` : undefined} onChange={(e) => changeCard({ blockedClues: card.blockedClues.map((item, c) => c === n ? e.target.value : item) })} /></label>)}</div>{fieldError(`cards.${index}.blockedClues`) && <p className="card-maker__field-error" id={`${id}-clues-error`}>{fieldError(`cards.${index}.blockedClues`)}</p>}</fieldset>
            <details className="card-maker__spellings"><summary>Accepted spellings <span>Optional</span></summary><div className="card-maker__field"><label htmlFor={`${id}-cards.${index}.acceptedSpellings`}>Other spellings of the same word</label><input id={`${id}-cards.${index}.acceptedSpellings`} value={card.aliasesText} maxLength={78} placeholder="doughnut" autoComplete="off" autoCapitalize="none" disabled={!!busy} aria-invalid={!!fieldError(`cards.${index}.acceptedSpellings`)} aria-describedby={`${id}-spellings-help`} onChange={(e) => changeCard({ aliasesText: e.target.value })} /><span id={`${id}-spellings-help`} className={fieldError(`cards.${index}.acceptedSpellings`) ? 'card-maker__field-error' : 'card-maker__hint'}>{fieldError(`cards.${index}.acceptedSpellings`) || 'Up to three spellings, separated by commas. Use spellings, not synonyms. These can trigger a catch and also stay out of chat.'}</span></div></details>
            {!isEdgeRuntime() && <CardArtwork key={`${draft.id ?? 'new'}-${card.id ?? index}`} artId={card.artId} csrf={csrf} disabled={offline || (!!busy && busy !== 'art')} onChange={(artId) => changeCard({ artId })} onBusyChange={artBusy} />}
          </div>
          {busy !== 'art' && <div className="card-maker__savebar"><span aria-live="polite">{busy === 'save' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved to your channel'}</span><Button type="submit" className="primary" disabled={!!busy || offline || !dirty}>{busy === 'save' ? 'Saving…' : draft.status === 'published' ? 'Save changes' : 'Save draft'}</Button></div>}
        </form>
        <section className="card-maker__playability"><h3>Ready for the next round?</h3><p>Six distinct cards at one difficulty make a pack playable. Your game is set to <strong>{difficulty}</strong>.</p><div className="card-maker__readiness">{difficulties.map((d) => <div key={d} data-ready={counts[d] >= packMinimum}><span>{titleCase(d)}</span><strong>{counts[d]}<small>/{packMinimum}</small>{counts[d] >= packMinimum && <Check size={16} />}</strong><span className="card-maker__readiness-track" aria-hidden="true">{Array.from({ length: packMinimum }, (_, k) => <i key={k} data-on={k < counts[d]} />)}</span></div>)}</div>
          {draft.status === 'draft' ? <Button className="secondary" disabled={!!busy || offline || !difficulties.some((d) => counts[d] >= packMinimum)} onClick={() => void save('published')}>Save and make playable <ArrowRight size={16} /></Button> : <><div className="card-library__actions"><Button className="primary" disabled={!!busy || offline || dirty || counts[difficulty] < packMinimum || (view.selection.packId === draft.id && view.selection.mode === 'custom')} onClick={() => void select('custom', draft.id)}>Use this pack</Button><Button className="secondary" disabled={!!busy || offline || dirty || counts[difficulty] < packMinimum || (view.selection.packId === draft.id && view.selection.mode === 'mixed')} onClick={() => void select('mixed', draft.id)}>Mix with built-in cards</Button></div>{dirty && <p className="card-maker__hint">Save your changes before choosing a deck.</p>}{counts[difficulty] < packMinimum && <p className="card-maker__hint">Add {Math.max(0, packMinimum - counts[difficulty])} more {difficulty} cards, or change difficulty in Game settings.</p>}</>}
          {draft.status === 'published' && <><Button className="text" disabled={!!busy || offline || view.selection.packId === draft.id} onClick={() => void save('draft')}>Save as draft</Button>{view.selection.packId === draft.id && <p className="card-maker__hint">To make this pack a draft again, choose Use built-in deck above first.</p>}</>}
          <small>Deck changes apply to the next round. A round in progress keeps its word and rules.</small>
        </section>
      </section>
      <aside className="card-maker__preview-column"><CardPreview card={card} /><CardPronunciation word={card.target.trim().toLowerCase()} spellings={acceptedSpellings(card)} disabled={pronunciationDisabled || offline || !!busy} />{!isEdgeRuntime() && <p className="card-maker__art-note">Your image appears inside the same Cut Open card. New words without art keep the type-led design.</p>}</aside>
    </div>}
    {view && section === 'builtin' && <div className="card-library__builtin"><section className="card-library__catalogue panel"><div className="card-maker__subheading"><h2>The built-in deck</h2><span>{catalogue.length} cards</span></div><p>A starting deck for every channel. Preview a card here; the current round’s target stays hidden in Studio.</p>
      <div className="card-library__filters"><label className="card-maker__field">Find a word<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cards" /></label><label className="card-maker__field">Difficulty<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All difficulties</option>{difficulties.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}</select></label></div>
      <div className="card-library__word-list" role="group" aria-label="Built-in cards">{filtered.map((item) => <button key={item.word} aria-pressed={builtinWord === item.word} onClick={() => setBuiltinWord(item.word)}><span>{item.word}</span><small>{titleCase(item.difficulty)}</small></button>)}</div>{!filtered.length && <p>No cards match. Try another word or difficulty.</p>}
      <Button className="secondary" disabled={offline || !!busy || view.selection.mode === 'builtin'} onClick={() => void select('builtin')}>{view.selection.mode === 'builtin' ? 'Built-in deck selected' : 'Use built-in deck'}</Button>
    </section><CardPreview card={builtinCard} /></div>}
    {nextDifficulty && card && <Modal title={`Use ${titleCase(nextDifficulty)} difficulty?`} onClose={() => setNextDifficulty(null)}><p>This removes {removedClueCount} off-limits {removedClueCount === 1 ? 'word' : 'words'} you entered. Keep the current difficulty to preserve them.</p><div className="modal-actions"><Button className="secondary" onClick={() => setNextDifficulty(null)}>Keep {titleCase(card.difficulty)}</Button><Button className="primary" onClick={() => applyDifficulty(nextDifficulty)}>Use {titleCase(nextDifficulty)}</Button></div></Modal>}
    {pending && <Modal title="Keep your changes?" onClose={() => setPending(null)}><p>This pack has unsaved changes. Save it before leaving, or discard this edit.</p><div className="modal-actions"><Button className="text" disabled={!!busy} onClick={() => { const next = pending; setPending(null); next(); }}>Discard changes</Button><Button className="secondary" disabled={!!busy} onClick={() => setPending(null)}>Keep editing</Button><Button className="primary" disabled={!!busy || offline} onClick={async () => { if (await save()) { const next = pending; setPending(null); next(); } else setPending(null); }}>Save and continue</Button></div></Modal>}
    {archive && <Modal title={`Archive ${archive.name}?`} onClose={() => { if (!busy) setArchive(null); }}><p>This pack will leave My packs and will not be drawn in future rounds. Past rounds keep their results.</p>{view?.selection.packId === archive.id && <p>Your next round will use the built-in deck. A round already in progress keeps its card.</p>}<div className="modal-actions"><Button className="secondary" disabled={!!busy} onClick={() => setArchive(null)}>Keep pack</Button><Button className="danger" disabled={!!busy || offline} onClick={() => void archivePack()}>{busy ? 'Archiving…' : 'Archive pack'}</Button></div></Modal>}
    {remove !== null && draft && <Modal title={`Remove ${draft.cards[remove]?.target || 'this card'}?`} onClose={() => setRemove(null)}><p>The card will leave this pack when you save. A round already in progress keeps its card.</p><div className="modal-actions"><Button className="secondary" onClick={() => setRemove(null)}>Keep card</Button><Button className="danger" onClick={() => { change({ cards: draft.cards.filter((_, n) => n !== remove) }); setIndex((n) => Math.min(n, draft.cards.length - 2)); setRemove(null); }}>Remove card</Button></div></Modal>}
  </div>;
});
