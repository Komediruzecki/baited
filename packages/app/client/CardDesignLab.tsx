import React, { useEffect, useRef, useState } from 'react';
import type { SessionInfo } from '../shared/types';
import { productBrand } from './ui';
import { CardArt } from './CardArt';
import { PixelRevealArt } from './PixelRevealArt';
import { SoundControls } from './SoundControls';
import { contexts, editions, exactClues, generic, isEdition, parsePicks, reviewDeck, stateLabel, states, type CardState, type Context, type Edition, type Picks, type ReviewEntry } from './card-lab-model';
import './card-design-lab.css';

const storageKey = 'baited.card-lab.v1';
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const editionName = (id: Edition) => editions.find(item => item.id === id)!.name;
function PixelSymbol({ type }: { type: 'chat' | 'clock' | 'help' }) {
  return <svg className="cl-symbol" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path fill="currentColor" d={type === 'chat'
    ? 'M1 0h7v1H1zM0 1h1v5H0zM8 1h1v5H8zM1 6h7v1H1zM1 7h2v1H1zM1 8h1v1H1zM2 3h5v1H2z'
    : type === 'clock' ? 'M3 0h3v1H3zM4 1h1v1H4zM2 2h5v1H2zM1 3h1v1H1zM4 3h1v2H4zM7 3h1v1H7zM0 4h1v3H0zM8 4h1v3H8zM5 5h1v1H5zM1 7h1v1H1zM7 7h1v1H7zM2 8h5v1H2z'
      : 'M2 0h5v1H2zM1 1h1v2H1zM7 1h1v3H7zM5 4h2v1H5zM4 5h1v2H4zM4 8h1v1H4z'} /></svg>;
}
function Pips({ difficulty }: { difficulty: string }) {
  const count = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  return <span className="cl-pips" role="img" aria-label={`${difficulty} difficulty`}>{[1, 2, 3].map(index => <i key={index} data-filled={index <= count} />)}</span>;
}

type CardProps = { edition: Edition; entry: ReviewEntry; state: CardState; time: number; back: boolean; large?: boolean; compact?: boolean; wide?: boolean; labels: boolean; alwaysWord: boolean; whiteWord: boolean; round: number; mission: boolean; crisp: boolean; reducedMotion: boolean };
function EditionCard({ edition, entry, state, time, back, large, compact, wide, labels, alwaysWord, whiteWord, round, mission, crisp, reducedMotion }: CardProps) {
  const [revealed, setRevealed] = useState(false);
  const [legend, setLegend] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiltFrame = useRef<number | null>(null);
  const card = useRef<HTMLElement>(null);
  const picture = edition === 'picture';
  const showWord = !picture || alwaysWord || revealed;
  const effective = edition === 'wide' && !wide ? 'table' : edition;
  const layout = effective === 'glance-reveal' ? 'glance' : effective === 'table-reveal' ? 'table' : effective;
  const pixelReveal = effective === 'table-reveal' || effective === 'glance-reveal';
  const faceDown = back || state === 'waiting' || state === 'broadcaster';
  const clues = exactClues(entry);
  const iconLabels = layout === 'glance' || picture;
  const showLabels = labels || legend;
  const elapsedState = !['live', 'urgent', 'paused'].includes(state);
  const urgent = state === 'urgent' || (!elapsedState && time <= 15);
  const word = entry.word.toUpperCase();
  useEffect(() => {
    setRevealed(false);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); if (tiltFrame.current) cancelAnimationFrame(tiltFrame.current); };
  }, [entry.word, edition]);
  const reveal = () => { if (hideTimer.current) clearTimeout(hideTimer.current); setRevealed(true); };
  const release = () => { hideTimer.current = setTimeout(() => setRevealed(false), 600); };
  const tilt = (event: React.PointerEvent<HTMLElement>) => {
    if (effective !== 'foil' || (event.pointerType === 'touch' && !event.buttons) || event.currentTarget.closest('.cl-context--panel,.cl-context--phone,.cl-context--studio')) return;
    const node = event.currentTarget;
    if (node.closest('[data-motion="reduced"]') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    if (tiltFrame.current) cancelAnimationFrame(tiltFrame.current);
    tiltFrame.current = requestAnimationFrame(() => { node.style.setProperty('--tilt-x', `${(0.5 - y) * 10}deg`); node.style.setProperty('--tilt-y', `${(x - 0.5) * 10}deg`); node.style.setProperty('--light-x', `${x * 100}%`); node.style.setProperty('--light-y', `${y * 100}%`); });
  };
  const resetTilt = () => { if (tiltFrame.current) cancelAnimationFrame(tiltFrame.current); card.current?.style.setProperty('--tilt-x', '0deg'); card.current?.style.setProperty('--tilt-y', '0deg'); };
  const effectiveTime = state === 'urgent' ? Math.min(time, 15) : time;
  const clockLabel = state === 'reconnecting' ? '—:—' : elapsedState ? stateLabel(state) : clock(effectiveTime);
  return <article ref={card} className="cl-card" data-edition={effective} data-layout={layout} data-size={compact ? 'xs' : large ? 'l' : 's'} data-face={faceDown ? 'back' : 'front'} data-state={state} data-crisp={crisp} data-urgent={urgent || undefined}
    aria-label={faceDown ? 'Face-down Baited card' : picture && !showWord ? `Picture experiment. ${word.length} letters. ${entry.difficulty}.` : `${word}. ${entry.difficulty}.${clues.length ? ` Keep out of chat: ${clues.join(', ')}.` : ' Only the target is off limits.'}`}
    style={{ '--chars': Math.max(word.length, 1), '--word-ink': whiteWord ? '#fffdf7' : entry.ink, '--clock-left': `${Math.max(0, Math.min(1, effectiveTime / 120)) * 100}%` } as React.CSSProperties}
    onPointerMove={tilt} onPointerLeave={resetTilt} onPointerCancel={resetTilt} onPointerUp={resetTilt}>
    <div className="cl-card__cut" aria-hidden="true" /><div className="cl-card__foil" aria-hidden="true" />
    {faceDown ? <div className="cl-card__back"><span className="baited-glyph" aria-hidden="true" /></div> : <>
      <header className="cl-card__rail"><span>{picture ? 'Experiment' : `Round ${String(round).padStart(2, '0')}`}</span><Pips difficulty={entry.difficulty} /></header>
      <div className="cl-card__art">
        {entry.synthetic ? <div className="cl-card__generic" aria-hidden="true">Aa</div> : pixelReveal ? <PixelRevealArt key={`${effective}-${entry.word}`} word={entry.word} disabled={reducedMotion || state === 'paused' || state === 'reconnecting'} /> : <CardArt word={entry.word} />}
        {effective === 'pixel' && <span className="cl-card__curtain" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ '--tile-delay': `${((index * 17) % 36) * 6}ms` } as React.CSSProperties} />)}</span>}
        {state === 'caught' && <span className="cl-card__stamp" aria-hidden="true"><span className="baited-glyph" /></span>}
      </div>
      <div className="cl-card__information">
        {picture ? <button className="cl-card__tiles" type="button" disabled={alwaysWord} aria-label={alwaysWord ? `Secret word: ${word}` : `${showWord ? 'Hide' : 'Show'} the secret word, ${word.length} letters`} aria-pressed={showWord} onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); reveal(); }} onPointerUp={release} onPointerCancel={() => setRevealed(false)} onBlur={() => setRevealed(false)} onContextMenu={event => event.preventDefault()} onClick={event => { if (event.detail === 0) { if (hideTimer.current) clearTimeout(hideTimer.current); setRevealed(value => !value); } }} onKeyDown={event => { if (event.key === 'Escape') setRevealed(false); }}>
          {Array.from(word).map((letter, index) => <span className="cl-card__tile" key={index}>{showWord ? letter : ''}</span>)}
        </button> : <h2 className="cl-card__word">{word}</h2>}
        {picture && <><p className="cl-card__hold">{alwaysWord ? 'Word stays visible for this review.' : 'Hold the tiles to read. Enter toggles.'}</p><span className="cl-sr" aria-live="polite">{showWord ? word : ''}</span></>}
        {clues.length > 0 ? <div className="cl-card__restrictions">
          {iconLabels ? <span className="cl-card__clue-label"><PixelSymbol type="chat" /><span className={showLabels ? '' : 'cl-sr'}>Keep out of chat</span></span> : <p className="cl-card__clue-label">Keep out of chat</p>}
          <ul className="cl-card__clues" data-count={clues.length} aria-label="Keep out of chat">{clues.map(clue => <li key={clue}>{clue}</li>)}</ul>
        </div> : <p className="cl-card__easy">Only this word is off limits.</p>}
        {effective === 'baseline' && <p className="cl-card__prompt">{entry.example}</p>}
      </div>
      {(state === 'review' || ['caught', 'escaped', 'skipped', 'ended', 'overturned'].includes(state)) && <p className="cl-card__verdict">{stateLabel(state)}</p>}
      <footer className="cl-card__foot">
        {iconLabels ? <PixelSymbol type="clock" /> : <span className="cl-card__signature"><span className="baited-glyph" aria-hidden="true" /></span>}
        <span className="cl-card__clock" aria-label={elapsedState ? clockLabel : `${clockLabel} remaining`}>{clockLabel}</span>
        {layout === 'glance' && <button className="cl-card__legend" type="button" aria-label={legend ? 'Hide icon labels' : 'Show icon labels'} aria-pressed={legend} onClick={() => setLegend(value => !value)}><PixelSymbol type="help" /></button>}
      </footer>
      {mission && <span className="cl-card__mission">Word 2 of 3 · example mission</span>}
    </>}
  </article>;
}

function ReviewFrame({ context, cardProps, replay, seconds }: { context: Context; cardProps: CardProps; replay: number; seconds: number }) {
  const body = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setOverflow(Math.max(0, node.scrollHeight - node.clientHeight)));
    observer.observe(node);
    node.querySelectorAll('.cl-frame__card,.cl-frame__head,.cl-frame__footer').forEach(child => observer.observe(child));
    return () => observer.disconnect();
  }, [context, cardProps.entry.word, cardProps.edition, cardProps.state, cardProps.labels, cardProps.mission, cardProps.alwaysWord, replay]);
  const isWide = context === 'desktop';
  const caption = { deck: '300 px card · fixed fan', panel: '318 × 500 · mock panel', phone: '320 × 640 · mock viewer', desktop: 'Desktop card · 360 px, Wide uses 560 px', studio: '190 px card · simulated decision', obs: '1920 × 1080 canvas · shown at one third size' }[context];
  return <>
    <div className={`cl-context cl-context--${context}`} ref={body}>
      {['panel', 'phone'].includes(context) && <header className="cl-frame__head">{productBrand}<span>Round {cardProps.round}</span></header>}
      {context === 'deck' && <><div className="cl-fan cl-fan--one" /><div className="cl-fan cl-fan--two" /></>}
      {context === 'obs' ? <div className="cl-obs-canvas" style={{ '--scrub': `${-seconds}s` } as React.CSSProperties}><div className="cl-obs-hud">{productBrand}<span>{cardProps.state === 'caught' ? 'Chat wins' : 'Example round'}</span><strong>{clock(cardProps.time)}</strong></div><div className="cl-obs-card"><EditionCard key={replay} {...cardProps} /></div><p className="cl-obs-caption">Synthetic OBS composition. Scrub to inspect the reveal.</p></div>
        : <div className="cl-frame__card" key={replay}><EditionCard {...cardProps} large={isWide} compact={context === 'studio'} wide={isWide} /></div>}
      {context === 'studio' && <div className="cl-studio-decision"><p>Catch preview</p><h3>Did you say it?</h3><strong>{cardProps.entry.word.toUpperCase()}</strong><p>Yes gives chat the win. No ends this round.</p><div><span>Yes, chat wins</span><span>No, I didn’t</span></div><small>Composition only. These are not game controls.</small></div>}
      {['panel', 'phone'].includes(context) && <footer className="cl-frame__footer"><p>Nudge the conversation.</p><p><code>!skip</code> votes for a new word.</p></footer>}
    </div>
    <p className="cl-frame-caption">{caption}{context === 'panel' && <span data-overflow={overflow > 0}>{overflow > 0 ? `Overflows ${overflow}px` : 'Fits'}</span>}</p>
    {cardProps.edition === 'wide' && !isWide && <p className="cl-frame-caption">Wide falls back to Table here. Choose Desktop viewer to see it.</p>}
  </>;
}

export default function CardDesignLab({ session }: { session: SessionInfo }) {
  const [initial] = useState(() => new URLSearchParams(location.search));
  const [edition, setEdition] = useState<Edition>(() => isEdition(initial.get('edition')) ? initial.get('edition') as Edition : 'table');
  const [word, setWord] = useState(() => initial.get('word') === generic.word || reviewDeck.some(entry => entry.word === initial.get('word')) ? initial.get('word')! : 'volcano');
  const [pool, setPool] = useState('all');
  const [state, setState] = useState<CardState>(() => states.some(item => item[0] === initial.get('state')) ? initial.get('state') as CardState : 'live');
  const [context, setContext] = useState<Context>(() => contexts.some(item => item[0] === initial.get('ctx')) ? initial.get('ctx') as Context : 'deck');
  const [time, setTime] = useState(() => Math.max(0, Math.min(state === 'urgent' ? 15 : 120, Number(initial.get('t') ?? 87) || 0)));
  const [round, setRound] = useState(7);
  const [back, setBack] = useState(false);
  const [replay, setReplay] = useState(0);
  const [compare, setCompare] = useState(initial.get('compare') === '1');
  const [compared, setCompared] = useState<Edition[]>(['table', 'foil']);
  const [motion, setMotion] = useState(initial.get('motion') === 'reduced');
  const [labels, setLabels] = useState(false);
  const [alwaysWord, setAlwaysWord] = useState(false);
  const [whiteWord, setWhiteWord] = useState(false);
  const [mission, setMission] = useState(false);
  const [crisp, setCrisp] = useState(true);
  const [scrub, setScrub] = useState(2.5);
  const [picks, setPicks] = useState<Picks>(() => { try { return parsePicks(localStorage.getItem(storageKey)); } catch { return parsePicks(null); } });
  const [saveStatus, setSaveStatus] = useState('Choices stay in this browser.');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [note, setNote] = useState('');
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  const entry = reviewDeck.find(item => item.word === word) || generic;
  const available = reviewDeck.filter(item => pool === 'all' || item.difficulty === pool);
  const allowed = session.demoAvailable && !session.twitchReady;
  useEffect(() => {
    if (!allowed) return;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ edition, word, state, ctx: context, compare: compare ? '1' : '0', t: String(time), motion: motion ? 'reduced' : 'full' })) url.searchParams.set(key, value);
    history.replaceState(null, '', url);
  }, [allowed, edition, word, state, context, compare, time, motion]);
  const chooseWord = (next: string) => { setWord(next); setBack(false); setReplay(value => value + 1); };
  const step = (direction: number) => { const index = available.findIndex(item => item.word === word); chooseWord(available[(Math.max(0, index) + direction + available.length) % available.length].word); };
  const save = (next: Picks) => {
    next.updatedAt = new Date().toISOString(); setPicks(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaveStatus('Saved in this browser.'); } catch { setSaveStatus('Browser storage is unavailable. Download your choices to keep them.'); }
  };
  useEffect(() => { setNote(picks.picks[edition]?.note || ''); }, [edition]);
  const prefer = (id: Edition, withNote = false) => {
    const prior = picks.picks[id];
    save({ ...picks, preferred: id, picks: { ...picks.picks, [id]: { note: withNote ? note : prior?.note || '', reviewed: [...new Set([...(prior?.reviewed || []), context])], experimental: id === 'picture' } } });
  };
  const exportChoices = JSON.stringify(picks, null, 2);
  const download = () => { const url = URL.createObjectURL(new Blob([exportChoices], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `baited-card-choices-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const props: CardProps = { edition, entry, state, time, back, labels, alwaysWord, whiteWord, round, mission, crisp, reducedMotion: motion };
  if (!allowed) return <main className="card-lab"><div className="cl-closed">{productBrand}<h1>Card lab is local.</h1><p>Open the local preview without Twitch credentials to compare editions. The game never reads these examples.</p><a href="/">Back to Baited</a></div></main>;
  return <main className="card-lab">
    <header className="cl-top"><a href="/" aria-label="Baited Studio">{productBrand}</a><nav aria-label="Card lab tools"><button type="button" aria-pressed={compare} onClick={() => setCompare(value => !value)}>Compare</button><button type="button" aria-pressed={back} onClick={() => setBack(value => !value)}>{back ? 'Show front' : 'Show back'}</button><button type="button" onClick={() => setReplay(value => value + 1)}>Replay deal</button><a href="#cl-picks">Your picks</a></nav><a className="cl-product-link" href="/product-review">Product screens</a></header>
    <div className="cl-intro"><div><h1>Card lab</h1><p>Same word, different cards. Pick the one chat should hold.</p></div><p className="cl-local-note">Local only. Synthetic rounds.<br />Nothing here reads or changes a live game.</p></div>
    <div className="cl-workspace">
      <aside className="cl-controls">
        <fieldset className="cl-editions"><legend>Edition</legend>{editions.map((item, index) => <label className="cl-edition-option" key={item.id} data-selected={edition === item.id}><input type="radio" name="edition" value={item.id} checked={edition === item.id} onChange={() => setEdition(item.id)} /><span className="cl-edition-number">{String(index).padStart(2, '0')}</span><span><strong>{item.name}{item.id === 'table' && <small>Opus’s pick</small>}</strong><span>{item.note}</span></span></label>)}</fieldset>
        <details className="cl-inspector" open><summary>Word and state</summary><div className="cl-control-fields">
          <label>Word pool<select value={pool} onChange={event => { const next = event.target.value; setPool(next); if (next !== 'all' && entry.difficulty !== next) chooseWord(reviewDeck.find(item => item.difficulty === next)!.word); }}><option value="all">All 78 words</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
          <label>Word<select value={word} onChange={event => chooseWord(event.target.value)}>{available.map(item => <option value={item.word} key={item.word}>{item.word}</option>)}{entry.synthetic && <option value={generic.word}>{generic.word} · synthetic</option>}</select></label>
          <div className="cl-word-actions"><button type="button" onClick={() => step(-1)} aria-label="Previous word">←</button><button type="button" onClick={() => chooseWord(available[Math.floor(Math.random() * available.length)].word)}>Random word</button><button type="button" onClick={() => step(1)} aria-label="Next word">→</button></div>
          <label>Synthetic state<select value={state} onChange={event => { const next = event.target.value as CardState; setState(next); if (next === 'urgent') setTime(12); }}>{states.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Context<select value={context} onChange={event => setContext(event.target.value as Context)}>{contexts.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Time left <output>{clock(time)}</output><input type="range" min="0" max={state === 'urgent' ? 15 : 120} value={time} onChange={event => setTime(Number(event.target.value))} /></label>
          <label>Round number<input type="number" min="1" max="99" value={round} onChange={event => setRound(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} /></label>
          {context === 'obs' && <label>Reveal scrubber <output>{scrub.toFixed(1)} s</output><input type="range" min="0" max="5.5" step="0.1" value={scrub} onChange={event => setScrub(Number(event.target.value))} /></label>}
          <fieldset className="cl-stress"><legend>Stress examples</legend>{['kaleidoscope', 'marshmallow', 'alchemy', 'archipelago'].map(item => <button type="button" key={item} onClick={() => { setPool('all'); chooseWord(item); }}>{item}</button>)}<button type="button" onClick={() => { setPool('all'); chooseWord(generic.word); }}>No illustration</button></fieldset>
          <label className="cl-check"><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} />Preview reduced motion</label>
          <label className="cl-check"><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} />Show icon labels</label>
          <label className="cl-check"><input type="checkbox" checked={alwaysWord} onChange={event => setAlwaysWord(event.target.checked)} />Always show Picture’s word</label>
          <label className="cl-check"><input type="checkbox" checked={whiteWord} onChange={event => setWhiteWord(event.target.checked)} />White words instead of item colors</label>
          <label className="cl-check"><input type="checkbox" checked={crisp} onChange={event => setCrisp(event.target.checked)} />Crisp pixel rendering</label>
          <label className="cl-check"><input type="checkbox" checked={mission} onChange={event => setMission(event.target.checked)} />Example three-word mission</label>
        </div></details>
      </aside>
      <section className="cl-stage-area" aria-label="Card comparison">
        <div className="cl-stage-summary"><h2>{compare ? 'Side by side.' : editionName(edition)}</h2><span>{entry.word.toUpperCase()} · {entry.difficulty}{entry.synthetic ? ' · synthetic word' : ''}</span></div>
        {(edition === 'picture' || (compare && compared.includes('picture'))) && <p className="cl-experiment">Picture is an experiment. Its exact word can be revealed, and the off-limits clues stay readable. It does not change the game’s matching rules.</p>}
        {compare && <fieldset className="cl-compare-picker"><legend>Compare up to four</legend>{editions.map(item => <label key={item.id}><input type="checkbox" checked={compared.includes(item.id)} disabled={!compared.includes(item.id) && compared.length >= 4} onChange={event => setCompared(value => event.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />{item.name}</label>)}</fieldset>}
        <div className="cl-stage" data-motion={motion ? 'reduced' : 'full'} tabIndex={0} aria-label="Card stage. Arrow keys browse words. F flips, R replays, C compares."
          onKeyDown={event => { if (event.target !== event.currentTarget) return; if (['ArrowLeft', 'ArrowRight', 'f', 'F', 'r', 'R', 'c', 'C'].includes(event.key)) event.preventDefault(); if (event.key === 'ArrowLeft') step(-1); if (event.key === 'ArrowRight') step(1); if (event.key.toLowerCase() === 'f') setBack(value => !value); if (event.key.toLowerCase() === 'r') setReplay(value => value + 1); if (event.key.toLowerCase() === 'c') setCompare(value => !value); if (/^[0-9]$/.test(event.key)) { const index = event.key === '0' ? 9 : Number(event.key) - 1; if (editions[index]) setEdition(editions[index].id); } }}
          onPointerDown={event => { if ((event.target as HTMLElement).closest('button,input,select,[data-edition="foil"]')) return; pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; }}
          onPointerUp={event => { const start = pointer.current; pointer.current = null; if (!start || start.id !== event.pointerId) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); }} onPointerCancel={() => { pointer.current = null; }}>
          <div className="cl-stage-grid" data-compare={compare}>{(compare ? compared : [edition]).map(id => <div className="cl-study" key={id}>
            {compare && <h3>{editionName(id)}</h3>}<ReviewFrame context={context} cardProps={{ ...props, edition: id }} replay={replay} seconds={scrub} />
            <button className="cl-prefer" type="button" aria-pressed={picks.preferred === id} onClick={() => prefer(id)}>{picks.preferred === id ? 'Your current pick' : `Prefer ${editionName(id)}`}</button>
          </div>)}</div>
          {compare && compared.length === 0 && <p className="cl-empty">Select editions above to compare them.</p>}
        </div>
        <p className="cl-stage-help">Drag sideways to browse. Replay deal to watch the artwork resolve in Table Reveal and Glance Plus. Foil follows your pointer; Picture reveals its word when held.</p>
        <p className="cl-stage-help">{entry.synthetic ? entry.example : `Question example: ${entry.example}`}</p>
      </section>
    </div>
    <section className="cl-picks" id="cl-picks"><div><h2>Your picks</h2><p>No card edition is applied to the game here.</p></div><div className="cl-picks-content">
      <label>Note for this choice<textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="For example: Table for everyday play, Foil for the win reveal." /></label>
      <button type="button" onClick={() => prefer(edition, true)}>Save {editionName(edition)} with this note</button>
      <ul>{Object.entries(picks.picks).map(([id, pick]) => <li key={id}><strong>{editionName(id as Edition)}{id === picks.preferred ? ' · preferred' : ''}</strong><span>{pick!.experimental ? 'Experiment only. ' : ''}{pick!.reviewed.join(', ')}</span>{pick!.note && <p>{pick!.note}</p>}</li>)}</ul>
      <div className="cl-export"><button type="button" onClick={() => { if (!navigator.clipboard) { setCopyText(exportChoices); return; } void navigator.clipboard.writeText(exportChoices).then(() => setSaveStatus('Choices copied.')).catch(() => setCopyText(exportChoices)); }}>Copy choices</button><button type="button" onClick={download}>Download choices</button><button type="button" onClick={() => setConfirmClear(true)}>Clear picks</button></div>
      {confirmClear && <p className="cl-clear-confirm">Clear choices saved in this browser? <button type="button" onClick={() => { save(parsePicks(null)); setConfirmClear(false); }}>Clear choices</button><button type="button" onClick={() => setConfirmClear(false)}>Keep them</button></p>}
      {copyText && <label>Copy this JSON<textarea readOnly value={exportChoices} onFocus={event => event.target.select()} /></label>}
      <p role="status">{saveStatus}</p>
    </div></section>
    <details className="cl-sound"><summary>Sound Lab</summary><p>Sound starts off. Enable it to audition the game effects.</p><SoundControls roomId="card-design-lab" lab /></details>
    <footer className="cl-footer"><span>Design direction by Opus. Working previews by Codex.</span><a href="/product-review">Check the product screens</a><a href="https://baited.maff.app" target="_blank" rel="noreferrer">Current landing</a></footer>
    <div className="cl-mobile-bar"><button type="button" onClick={() => step(-1)}>← Word</button><button type="button" onClick={() => setBack(value => !value)}>Flip</button><button type="button" onClick={() => step(1)}>Word →</button></div>
  </main>;
}
