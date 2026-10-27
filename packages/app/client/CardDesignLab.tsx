import React, { useEffect, useRef, useState } from 'react';
import type { SessionInfo } from '../shared/types';
import { productBrand } from './ui';
import { CardArt } from './CardArt';
import { PixelRevealArt } from './PixelRevealArt';
import { GlassField, GlassLens, type GlassSize } from './CardGlass';
import { ClueRow } from './CardClues';
import { SoundControls } from './SoundControls';
import { contexts, editions, exactClues, generic, hasPixelReveal, isEdition, isOpenEdition, parseCompared, parsePicks, usesTableLayout, reviewDeck, stateLabel, states, type CardState, type Context, type Edition, type Picks, type ReviewEntry } from './card-lab-model';
import { backs, finishes, logoModes, finishHost, backShowsLogo, type FinishId, type BackId, type LogoMode } from './card-finish-catalogue';
import { CARD_SURFACE_STORAGE_KEY, parseSurfaceReview, parseSurfaceUrl, type SurfaceReview, type SurfaceSelection, type SurfaceView } from './card-surface-model';
import { clueTreatments, CARD_CLUE_STORAGE_KEY, parseClueReview, parseClueUrl, type ClueReview, type ClueTreatmentId } from './card-clue-catalogue';
import './card-design-lab.css';
import './card-finishes.css';
import './card-clue-options.css';
import './card-surface-gallery.css';

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

function FinishLayer({ finish, size }: { finish: FinishId; size: GlassSize }) {
  if (finish === 'glass') return <span className="cl-card__finish" aria-hidden="true"><GlassField size={size} /></span>;
  const asset = finishes.find(item => item.id === finish)!.asset;
  return asset ? <span className="cl-card__finish" aria-hidden="true"><img src={asset} alt="" decoding="async" loading="lazy" /></span> : null;
}
function BackLayers({ back, logo, fan = false }: { back: BackId; logo: LogoMode; fan?: boolean }) {
  const asset = backs.find(item => item.id === back)!.asset;
  return <>{asset && <img className={fan ? 'cl-fan__art' : 'cl-card__back-art'} src={asset} alt="" decoding="async" loading="lazy" />}{backShowsLogo(back, logo) && <span className={fan ? 'cl-fan__mark' : 'cl-card__back-mark'}><span className="baited-glyph" aria-hidden="true" /></span>}</>;
}
type CardProps = { edition: Edition; entry: ReviewEntry; state: CardState; time: number; back: boolean; large?: boolean; compact?: boolean; wide?: boolean; labels: boolean; alwaysWord: boolean; whiteWord: boolean; round: number; mission: boolean; crisp: boolean; reducedMotion: boolean; finish: FinishId; backStyle: BackId; logo: LogoMode; bend?: boolean; clueTreatment?: ClueTreatmentId };
function EditionCard({ edition, entry, state, time, back, large, compact, wide, labels, alwaysWord, whiteWord, round, mission, crisp, reducedMotion, finish, backStyle, logo, bend = true, clueTreatment = 'baseline' }: CardProps) {
  const [revealed, setRevealed] = useState(false);
  const [legend, setLegend] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiltFrame = useRef<number | null>(null);
  const card = useRef<HTMLElement>(null);
  const picture = edition === 'picture';
  const showWord = !picture || alwaysWord || revealed;
  const effective = edition === 'wide' && !wide ? 'table' : edition;
  const host = finishHost(effective);
  const activeFinish = host === 'own' ? 'stock' : finish;
  const layout = effective === 'glance-reveal' ? 'glance' : usesTableLayout(effective) ? 'table' : effective;
  const pixelReveal = hasPixelReveal(effective);
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
    if (effective !== 'foil' || activeFinish !== 'stock' || (event.pointerType === 'touch' && !event.buttons) || event.currentTarget.closest('.cl-context--panel,.cl-context--phone,.cl-context--studio')) return;
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
  const rail = <header className="cl-card__rail"><span>{picture ? 'Experiment' : `Round ${String(round).padStart(2, '0')}`}</span><Pips difficulty={entry.difficulty} /></header>;
  const foilPlate = effective === 'foil' && activeFinish !== 'stock';
  const size: GlassSize = compact ? 'xs' : large ? 'l' : 's';
  return <article ref={card} className="cl-card" data-edition={effective} data-layout={layout} data-art-frame={isOpenEdition(effective) ? 'open' : 'framed'} data-size={size} data-face={faceDown ? 'back' : 'front'} data-state={state} data-crisp={crisp} data-urgent={urgent || undefined} data-host={host} data-finish={activeFinish} data-back={backStyle} data-logo={logo} data-clue={layout === 'table' ? clueTreatment : undefined}
    aria-label={faceDown ? 'Face-down Baited card' : picture && !showWord ? `Picture experiment. ${word.length} letters. ${entry.difficulty}.` : `${word}. ${entry.difficulty}.${clues.length ? ` Keep out of chat: ${clues.join(', ')}.` : ' Only this word is off limits.'}`}
    style={{ '--chars': Math.max(word.length, 1), '--word-ink': whiteWord ? '#fffdf7' : entry.ink, '--clock-left': `${Math.max(0, Math.min(1, effectiveTime / 120)) * 100}%` } as React.CSSProperties}
    onPointerMove={tilt} onPointerLeave={resetTilt} onPointerCancel={resetTilt} onPointerUp={resetTilt}>
    <div className="cl-card__cut" aria-hidden="true">{host === 'slab' && !faceDown && <FinishLayer finish={activeFinish} size={size} />}</div><div className="cl-card__foil" aria-hidden="true" />
    {!faceDown && host === 'full' && <FinishLayer finish={activeFinish} size={size} />}<span className="cl-card__sheen" aria-hidden="true" />
    {!faceDown && activeFinish === 'velvet' && [0, 1, 2, 3].map(index => <span className="cl-card__gem" data-corner={index} key={index} aria-hidden="true" />)}
    {faceDown ? <div className={`cl-card__back${backStyle !== 'current' ? ' cl-card__back--custom' : ''}`}><BackLayers back={backStyle} logo={logo} /></div> : <>
      {!foilPlate && rail}
      <div className="cl-card__art">
        {activeFinish === 'glass' && !isOpenEdition(effective) && <GlassLens size={size} bend={bend} />}
        <svg className="cl-card__aperture" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M.5 .5H88L99.5 12V99.5H.5Z" /><path d="M4 4H86L96 14V96H4Z" /></svg>
        {entry.synthetic ? <div className="cl-card__generic" aria-hidden="true">Aa</div> : pixelReveal ? <PixelRevealArt key={`${effective}-${entry.word}`} word={entry.word} disabled={reducedMotion || state === 'paused' || state === 'reconnecting'} /> : <CardArt word={entry.word} />}
        {effective === 'pixel' && <span className="cl-card__curtain" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ '--tile-delay': `${((index * 17) % 36) * 6}ms` } as React.CSSProperties} />)}</span>}
        {state === 'caught' && <span className="cl-card__stamp" aria-hidden="true"><span className="baited-glyph" /></span>}
      </div>
      <div className="cl-card__plate"><div className="cl-card__information">
        {picture ? <button className="cl-card__tiles" type="button" disabled={alwaysWord} aria-label={alwaysWord ? `Secret word: ${word}` : `${showWord ? 'Hide' : 'Show'} the secret word, ${word.length} letters`} aria-pressed={showWord} onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); reveal(); }} onPointerUp={release} onPointerCancel={() => setRevealed(false)} onBlur={() => setRevealed(false)} onContextMenu={event => event.preventDefault()} onClick={event => { if (event.detail === 0) { if (hideTimer.current) clearTimeout(hideTimer.current); setRevealed(value => !value); } }} onKeyDown={event => { if (event.key === 'Escape') setRevealed(false); }}>
          {Array.from(word).map((letter, index) => <span className="cl-card__tile" key={index}>{showWord ? letter : ''}</span>)}
        </button> : <h2 className="cl-card__word">{word}</h2>}
        {picture && <><p className="cl-card__hold">{alwaysWord ? 'Word stays visible for this review.' : 'Hold the tiles to read. Enter toggles.'}</p><span className="cl-sr" aria-live="polite">{showWord ? word : ''}</span></>}
        {layout === 'table' ? <ClueRow clues={clues} treatment={clueTreatment} /> : clues.length > 0 ? <div className="cl-card__restrictions">
          {iconLabels ? <span className="cl-card__clue-label"><PixelSymbol type="chat" /><span className={showLabels ? '' : 'cl-sr'}>Keep out of chat</span></span> : <p className="cl-card__clue-label">Keep out of chat</p>}
          <ul className="cl-card__clues" data-count={clues.length} aria-label="Keep out of chat">{clues.map(clue => <li key={clue}>{clue}</li>)}</ul>
        </div> : <p className="cl-card__easy">Only this word is off limits.</p>}
        {effective === 'baseline' && <p className="cl-card__prompt">{entry.example}</p>}
      </div>
      {(state === 'review' || ['caught', 'escaped', 'skipped', 'ended', 'overturned'].includes(state)) && <p className="cl-card__verdict">{stateLabel(state)}</p>}
      {foilPlate && rail}
      <footer className="cl-card__foot">
        {iconLabels ? <PixelSymbol type="clock" /> : <span className="cl-card__signature"><span className="baited-glyph" aria-hidden="true" /></span>}
        <span className="cl-card__clock" aria-label={elapsedState ? clockLabel : `${clockLabel} remaining`}>{clockLabel}</span>
        {layout === 'glance' && <button className="cl-card__legend" type="button" aria-label={legend ? 'Hide icon labels' : 'Show icon labels'} aria-pressed={legend} onClick={() => setLegend(value => !value)}><PixelSymbol type="help" /></button>}
      </footer>
      {mission && <span className="cl-card__mission">Word 2 of 3 · example mission</span>}
      </div>
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
  }, [context, cardProps.entry.word, cardProps.edition, cardProps.state, cardProps.labels, cardProps.mission, cardProps.alwaysWord, cardProps.clueTreatment, replay]);
  const isWide = context === 'desktop';
  const caption = { deck: '300 px card · fixed fan', panel: '318 × 500 · mock panel', phone: '320 × 640 · mock viewer', desktop: 'Desktop card · 360 px, Wide uses 560 px', studio: '190 px card · simulated decision', obs: '1920 × 1080 canvas · shown at one third size' }[context];
  return <>
    <div className={`cl-context cl-context--${context}`} ref={body}>
      {['panel', 'phone'].includes(context) && <header className="cl-frame__head">{productBrand}<span>Round {cardProps.round}</span></header>}
      {context === 'deck' && <>{['one', 'two'].map(position => <div className={`cl-fan cl-fan--${position}`} data-back={cardProps.backStyle} key={position} aria-hidden="true"><BackLayers back={cardProps.backStyle} logo={cardProps.logo} fan /></div>)}</>}
      {context === 'obs' ? <div className="cl-obs-canvas" style={{ '--scrub': `${-seconds}s` } as React.CSSProperties}><div className="cl-obs-hud">{productBrand}<span>{cardProps.state === 'caught' ? 'Chat wins' : 'Example round'}</span><strong>{clock(cardProps.time)}</strong></div><div className="cl-obs-card"><EditionCard key={replay} {...cardProps} /></div><p className="cl-obs-caption">Synthetic OBS composition. Scrub to inspect the reveal.</p></div>
        : <div className="cl-frame__card" key={replay}><EditionCard {...cardProps} large={isWide} compact={context === 'studio'} wide={isWide} /></div>}
      {context === 'studio' && <div className="cl-studio-decision"><p>Catch preview</p><h3>Did you say it?</h3><strong>{cardProps.entry.word.toUpperCase()}</strong><p>Yes gives chat the win. No ends this round.</p><div><span>Yes, chat wins</span><span>No, I didn’t</span></div><small>Composition only. These are not game controls.</small></div>}
      {['panel', 'phone'].includes(context) && <footer className="cl-frame__footer"><p>Nudge the conversation.</p><p><code>!skip</code> votes for a new word.</p></footer>}
    </div>
    <p className="cl-frame-caption">{caption}{context === 'panel' && <span data-overflow={overflow > 0}>{overflow > 0 ? `Overflows ${overflow}px` : 'Fits'}</span>}</p>
    {cardProps.edition === 'wide' && !isWide && <p className="cl-frame-caption">Wide falls back to Table here. Choose Desktop viewer to see it.</p>}
  </>;
}

function SurfaceSelectors({ choice, change }: { choice: SurfaceSelection; change: (patch: Partial<SurfaceSelection>) => void }) {
  return <div className="cl-surfaces">
    <fieldset className="cl-swatch-group"><legend>Finish</legend><div className="cl-swatches">{finishes.map(item => <label className="cl-swatch" data-selected={choice.finish === item.id} key={item.id}><input type="radio" name="finish" value={item.id} checked={choice.finish === item.id} onChange={() => change({ finish: item.id })} /><span className="cl-swatch__image" data-material={item.id}>{item.swatch && <img src={item.swatch} alt="" loading="lazy" decoding="async" />}</span><span><strong>{item.name}</strong><small>{item.source === 'code' ? 'Code' : 'Generated art'}</small></span></label>)}</div></fieldset>
    <fieldset className="cl-swatch-group"><legend>Back</legend><div className="cl-swatches">{backs.map(item => <label className="cl-swatch" data-selected={choice.back === item.id} key={item.id}><input type="radio" name="back-style" value={item.id} checked={choice.back === item.id} onChange={() => change({ back: item.id })} /><span className="cl-swatch__image" data-material={item.id}>{item.swatch && <img src={item.swatch} alt="" loading="lazy" decoding="async" />}</span><span><strong>{item.name}</strong><small>{item.source === 'code' ? 'Code' : 'Generated art'}</small></span></label>)}</div></fieldset>
    <fieldset className="cl-logo-modes"><legend>BAITED on backs</legend>{logoModes.map(item => <label key={item.id}><input type="radio" name="back-logo" checked={choice.logo === item.id} onChange={() => change({ logo: item.id })} />{item.name}</label>)}</fieldset>
  </div>;
}

function SurfaceGallery({ cardProps, choice, select, prefer, replay, motion }: { cardProps: CardProps; choice: SurfaceReview; select: (patch: Partial<SurfaceSelection>) => void; prefer: (kind: 'finish' | 'back', id: FinishId | BackId) => void; replay: number; motion: boolean }) {
  const galleryEdition = finishHost(cardProps.edition) === 'own' ? 'table' : cardProps.edition;
  const frontState = ['waiting', 'broadcaster'].includes(cardProps.state) ? 'live' : cardProps.state;
  const galleryStates: CardState[] = ['live', 'urgent', 'review', 'caught', 'escaped', 'reconnecting'];
  return <div className="cl-gallery" data-motion={motion ? 'reduced' : 'full'}>
    <div className="cl-gallery__intro"><h2>One word, every finish.</h2><p>Words and clues always sit on solid stock.</p>{galleryEdition !== cardProps.edition && <p>Shown on Table. Current, Pixel and Wide keep their own stock.</p>}{frontState !== cardProps.state && <p>Fronts show a live round while your selected state is face down.</p>}</div>
    <section aria-labelledby="cl-front-title"><h3 id="cl-front-title">Front finishes</h3><ul className="cl-gallery__grid">{finishes.map((item, index) => <li key={item.id}><figure data-selected={choice.finish === item.id}>
      <div className="cl-gallery__card" inert style={{ '--deal-delay': `${Math.min(index * 30, 600)}ms` } as React.CSSProperties}><EditionCard key={`${replay}-${item.id}`} {...cardProps} edition={galleryEdition} state={frontState} back={false} finish={item.id} /></div>
      <figcaption><strong>{item.name}</strong><small>{item.source === 'code' ? 'Code' : 'Generated art'}</small><p>{item.note}</p></figcaption></figure><div className="cl-gallery__actions"><button type="button" onClick={() => select({ finish: item.id })} aria-label={`Show ${item.name} finish on stage`}>Show on stage</button><button type="button" aria-pressed={choice.preferredFinish === item.id} onClick={() => prefer('finish', item.id)}>{choice.preferredFinish === item.id ? 'Your finish' : `Prefer ${item.name}`}</button></div>
    </li>)}</ul></section>
    <section aria-labelledby="cl-back-title"><h3 id="cl-back-title">Card backs</h3><p className="cl-gallery__note">The wordmark uses the original artwork. It is never part of the generated texture.</p><ul className="cl-gallery__grid">{backs.map((item, index) => <li key={item.id}><figure data-selected={choice.back === item.id}><div className="cl-gallery__card" inert style={{ '--deal-delay': `${Math.min(index * 30, 600)}ms` } as React.CSSProperties}><EditionCard key={`${replay}-${item.id}`} {...cardProps} back backStyle={item.id} /></div><figcaption><strong>{item.name}</strong><small>{item.source === 'code' ? 'Code' : 'Generated art'}</small><p>{item.note}</p></figcaption></figure><div className="cl-gallery__actions"><button type="button" onClick={() => select({ back: item.id })} aria-label={`Show ${item.name} back on stage`}>Show on stage</button><button type="button" aria-pressed={choice.preferredBack === item.id} onClick={() => prefer('back', item.id)}>{choice.preferredBack === item.id ? 'Your back' : `Prefer ${item.name}`}</button></div></li>)}</ul></section>
    <section aria-labelledby="cl-state-title"><h3 id="cl-state-title">{finishes.find(item => item.id === choice.finish)!.name} in each state</h3><ul className="cl-gallery__grid cl-gallery__states">{galleryStates.map(item => <li key={item}><figure><div className="cl-gallery__card" inert><EditionCard key={`${replay}-${item}`} {...cardProps} edition={galleryEdition} state={item} back={false} /></div><figcaption><strong>{stateLabel(item)}</strong></figcaption></figure></li>)}</ul></section>
  </div>;
}

export default function CardDesignLab({ session, standalone = false }: { session: SessionInfo; standalone?: boolean }) {
  const [initial] = useState(() => new URLSearchParams(location.search));
  const [surfaces, setSurfaces] = useState<SurfaceReview>(() => { let saved = parseSurfaceReview(JSON.stringify({ version: 1, finish: 'glass', back: 'mosaic', logo: 'designed' })); try { const stored = localStorage.getItem(CARD_SURFACE_STORAGE_KEY); if (stored) saved = parseSurfaceReview(stored); } catch { /* Storage may be unavailable. */ } return { ...saved, ...parseSurfaceUrl(initial, saved) }; });
  const [view, setView] = useState<SurfaceView | 'clues'>(() => initial.get('view') === 'clues' ? 'clues' : parseSurfaceUrl(initial).view);
  const [clueReview, setClueReview] = useState<ClueReview>(() => { let saved = parseClueReview(null); try { saved = parseClueReview(localStorage.getItem(CARD_CLUE_STORAGE_KEY)); } catch { /* Storage may be unavailable. */ } return { ...saved, selected: parseClueUrl(initial, saved.selected) }; });
  const [clueStatus, setClueStatus] = useState('Choose a style to compare. Your existing picks stay saved.');
  const [clueNote, setClueNote] = useState('');
  const [surfaceStatus, setSurfaceStatus] = useState('Finish and back choices stay in this browser.');
  const [pairingNote, setPairingNote] = useState('');
  const [surfaceCopy, setSurfaceCopy] = useState(false);
  const [edition, setEdition] = useState<Edition>(() => isEdition(initial.get('edition')) ? initial.get('edition') as Edition : 'table-reveal');
  const [word, setWord] = useState(() => initial.get('word') === generic.word || reviewDeck.some(entry => entry.word === initial.get('word')) ? initial.get('word')! : 'volcano');
  const [pool, setPool] = useState('all');
  const [state, setState] = useState<CardState>(() => states.some(item => item[0] === initial.get('state')) ? initial.get('state') as CardState : 'live');
  const [context, setContext] = useState<Context>(() => contexts.some(item => item[0] === initial.get('ctx')) ? initial.get('ctx') as Context : 'deck');
  const [time, setTime] = useState(() => Math.max(0, Math.min(state === 'urgent' ? 15 : 120, Number(initial.get('t') ?? 87) || 0)));
  const [round, setRound] = useState(7);
  const [back, setBack] = useState(false);
  const [replay, setReplay] = useState(0);
  const [compare, setCompare] = useState(initial.get('compare') === '1');
  const [compared, setCompared] = useState<Edition[]>(() => parseCompared(initial.get('with')));
  const [motion, setMotion] = useState(initial.get('motion') === 'reduced');
  const [labels, setLabels] = useState(false);
  const [alwaysWord, setAlwaysWord] = useState(false);
  const [whiteWord, setWhiteWord] = useState(false);
  const [mission, setMission] = useState(false);
  const [crisp, setCrisp] = useState(true);
  const [bend, setBend] = useState(() => initial.get('refraction') !== 'off');
  const [scrub, setScrub] = useState(2.5);
  const [picks, setPicks] = useState<Picks>(() => { try { return parsePicks(localStorage.getItem(storageKey)); } catch { return parsePicks(null); } });
  const [saveStatus, setSaveStatus] = useState('Choices stay in this browser.');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [note, setNote] = useState('');
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const entry = reviewDeck.find(item => item.word === word) || generic;
  const available = reviewDeck.filter(item => pool === 'all' || item.difficulty === pool);
  const allowed = session.demoAvailable && !session.twitchReady;
  useEffect(() => {
    if (!allowed) return;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ edition, word, state, ctx: context, compare: compare ? '1' : '0', with: compared.join(','), t: String(time), motion: motion ? 'reduced' : 'full', finish: surfaces.finish, back: surfaces.back, logo: surfaces.logo, view, clue: clueReview.selected, refraction: bend ? 'on' : 'off' })) url.searchParams.set(key, value);
    history.replaceState(null, '', url);
  }, [allowed, edition, word, state, context, compare, compared, time, motion, surfaces.finish, surfaces.back, surfaces.logo, view, clueReview.selected, bend]);
  const saveSurfaces = (next: SurfaceReview) => {
    const clean = parseSurfaceReview(JSON.stringify({ ...next, updatedAt: new Date().toISOString() })); setSurfaces(clean);
    try { localStorage.setItem(CARD_SURFACE_STORAGE_KEY, JSON.stringify(clean)); setSurfaceStatus('Finish and back choices saved in this browser.'); } catch { setSurfaceStatus('Storage is unavailable. Download the full review to keep your choices.'); }
  };
  const changeSurface = (patch: Partial<SurfaceSelection>) => saveSurfaces({ ...surfaces, ...patch });
  const preferSurface = (kind: 'finish' | 'back', id: FinishId | BackId) => saveSurfaces(parseSurfaceReview(JSON.stringify({ ...surfaces, [kind === 'finish' ? 'preferredFinish' : 'preferredBack']: id })));
  const saveClues = (next: ClueReview) => {
    const clean = parseClueReview(JSON.stringify({ ...next, updatedAt: new Date().toISOString() })); setClueReview(clean);
    try { localStorage.setItem(CARD_CLUE_STORAGE_KEY, JSON.stringify(clean)); setClueStatus('Clue style saved in this browser.'); } catch { setClueStatus('Storage is unavailable. Download the full review to keep this choice.'); }
  };
  const selectClue = (id: ClueTreatmentId) => setClueReview(value => ({ ...value, selected: id }));
  const preferClue = (id: ClueTreatmentId, withNote = false) => {
    const prior = clueReview.picks[id];
    saveClues({ ...clueReview, selected: id, preferred: id, picks: { ...clueReview.picks, [id]: { note: withNote ? clueNote : prior?.note || '', reviewed: [...new Set([...(prior?.reviewed || []), context])] } } });
  };
  useEffect(() => { setClueNote(clueReview.picks[clueReview.selected]?.note || ''); }, [clueReview.selected]);
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
  const fullReview = JSON.stringify({ editions: picks, surfaces, clues: clueReview }, null, 2);
  const downloadReview = () => { const url = URL.createObjectURL(new Blob([fullReview], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `baited-full-card-review-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const props: CardProps = { edition, entry, state, time, back, labels, alwaysWord, whiteWord, round, mission, crisp, reducedMotion: motion, finish: surfaces.finish, backStyle: surfaces.back, logo: surfaces.logo, bend, clueTreatment: clueReview.selected };
  if (!allowed) return <main className="card-lab"><div className="cl-closed">{productBrand}<h1>Card lab is local.</h1><p>Open the local preview without Twitch credentials to compare editions. The game never reads these examples.</p><a href="/">Back to Baited</a></div></main>;
  return <main className="card-lab">
    <header className="cl-top"><a href="/" aria-label={standalone ? 'Baited website' : 'Baited Studio'}>{productBrand}</a><nav aria-label="Card lab tools"><button type="button" aria-pressed={view === 'stage'} onClick={() => setView('stage')}>Stage</button><button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>Gallery</button><button type="button" aria-pressed={view === 'clues'} onClick={() => setView('clues')}>Clue styles</button>{view === 'stage' && <><button type="button" aria-pressed={compare} onClick={() => setCompare(value => !value)}>Compare</button><button type="button" aria-pressed={back} onClick={() => setBack(value => !value)}>{back ? 'Show front' : 'Show back'}</button></>}<button type="button" onClick={() => setReplay(value => value + 1)}>Replay deal</button><a href="#cl-picks">Your picks</a></nav><a className="cl-product-link" href={standalone ? '/' : '/product-review'}>{standalone ? 'Back to Baited' : 'Product screens'}</a></header>
    <div className="cl-intro"><div><h1>Card lab</h1><p>Same word, different cards. Pick the one chat should hold.</p></div><p className="cl-local-note">{standalone ? 'Design review. Synthetic rounds.' : 'Local only. Synthetic rounds.'}<br />Nothing here reads or changes a live game.</p></div>
    <div className="cl-workspace">
      <aside className="cl-controls">
        <fieldset className="cl-editions"><legend>Edition</legend>{editions.map((item, index) => <label className="cl-edition-option" key={item.id} data-selected={edition === item.id}><input type="radio" name="edition" value={item.id} checked={edition === item.id} onChange={() => setEdition(item.id)} /><span className="cl-edition-number">{String(index).padStart(2, '0')}</span><span><strong>{item.name}{item.id === 'table-reveal' && <small>Selected direction</small>}</strong><span>{item.note}</span></span></label>)}</fieldset>
        <SurfaceSelectors choice={surfaces} change={changeSurface} />
        <fieldset className="cl-clue-selector"><legend>Forbidden-word style</legend>{clueTreatments.map(item => <label key={item.id}><input type="radio" name="clue-style" value={item.id} checked={clueReview.selected === item.id} onChange={() => selectClue(item.id)} /><span>{item.name}{item.id === 'rail' && <small>Opus’s proposal</small>}{item.id === 'baseline' && <small>Current</small>}</span></label>)}{!usesTableLayout(edition) && edition !== 'wide' && <p>Clue styles apply to Table, Cut Reveal and Cut Open. Other editions keep their own clue rows.</p>}<button type="button" onClick={() => setView('clues')}>Compare clue styles</button></fieldset>
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
          {surfaces.finish === 'glass' && (compare ? compared.some(id => !isOpenEdition(id)) : !isOpenEdition(edition)) && <label className="cl-check"><input type="checkbox" checked={bend} onChange={event => setBend(event.target.checked)} />Bend glass</label>}
          <label className="cl-check"><input type="checkbox" checked={mission} onChange={event => setMission(event.target.checked)} />Example three-word mission</label>
        </div></details>
      </aside>
      <section className="cl-stage-area" aria-label="Card comparison" hidden={view !== 'stage'}>
        <div className="cl-stage-summary"><h2>{compare ? 'Side by side.' : editionName(edition)} · {finishes.find(item => item.id === surfaces.finish)!.name}</h2><span>{entry.word.toUpperCase()} · {entry.difficulty}{entry.synthetic ? ' · synthetic word' : ''}<br />Back: {backs.find(item => item.id === surfaces.back)!.name}{usesTableLayout(edition) && <><br />Clues: {clueTreatments.find(item => item.id === clueReview.selected)!.name}{clueReview.preferred === clueReview.selected ? ' · your pick' : clueReview.selected === 'rail' ? ' · proposal' : ''}</>}</span></div>
        {finishHost(edition) === 'own' && surfaces.finish !== 'stock' && <p className="cl-stage-help">Current, Pixel and Wide keep their own stock. Backs apply to every edition.</p>}
        {(edition === 'picture' || (compare && compared.includes('picture'))) && <p className="cl-experiment">Picture is an experiment. Its exact word can be revealed, and the off-limits clues stay readable. It does not change the game’s matching rules.</p>}
        {compare && <fieldset className="cl-compare-picker"><legend>Compare up to four</legend>{editions.map(item => <label key={item.id}><input type="checkbox" checked={compared.includes(item.id)} disabled={!compared.includes(item.id) && compared.length >= 4} onChange={event => setCompared(value => event.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />{item.name}</label>)}</fieldset>}
        <div ref={stage} className="cl-stage" data-motion={motion ? 'reduced' : 'full'} tabIndex={0} aria-label="Card stage. Arrow keys browse words. F flips, R replays, C compares, G opens gallery. Brackets change finish. B changes back."
          onKeyDown={event => { if (event.target !== event.currentTarget) return; if (['ArrowLeft', 'ArrowRight', 'f', 'F', 'r', 'R', 'c', 'C', 'g', 'G', 'b', 'B', '[', ']'].includes(event.key)) event.preventDefault(); if (event.key === 'ArrowLeft') step(-1); if (event.key === 'ArrowRight') step(1); if (event.key.toLowerCase() === 'f') setBack(value => !value); if (event.key.toLowerCase() === 'r') setReplay(value => value + 1); if (event.key.toLowerCase() === 'c') setCompare(value => !value); if (event.key.toLowerCase() === 'g') setView('gallery'); if (event.key.toLowerCase() === 'b') changeSurface({ back: backs[(backs.findIndex(item => item.id === surfaces.back) + 1) % backs.length].id }); if (['[', ']'].includes(event.key)) changeSurface({ finish: finishes[(finishes.findIndex(item => item.id === surfaces.finish) + (event.key === ']' ? 1 : finishes.length - 1)) % finishes.length].id }); if (/^[0-9]$/.test(event.key)) { const index = event.key === '0' ? 9 : Number(event.key) - 1; if (editions[index]) setEdition(editions[index].id); } }}
          onPointerDown={event => { if ((event.target as HTMLElement).closest('button,input,select,[data-edition="foil"]')) return; pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; }}
          onPointerUp={event => { const start = pointer.current; pointer.current = null; if (!start || start.id !== event.pointerId) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); }} onPointerCancel={() => { pointer.current = null; }}>
          <div className="cl-stage-grid" data-compare={compare}>{(compare ? compared : [edition]).map(id => <div className="cl-study" key={id}>
            {compare && <h3>{editionName(id)}</h3>}<ReviewFrame context={context} cardProps={{ ...props, edition: id }} replay={replay} seconds={scrub} />
            <button className="cl-prefer" type="button" aria-pressed={picks.preferred === id} onClick={() => prefer(id)}>{picks.preferred === id ? 'Your current pick' : `Prefer ${editionName(id)}`}</button>
          </div>)}</div>
          {compare && compared.length === 0 && <p className="cl-empty">Select editions above to compare them.</p>}
        </div>
        <p className="cl-stage-help">Drag sideways to browse. Replay deal to watch the art resolve and Prism catch the light. Picture reveals its word when held. Stock Foil keeps its original pointer effect.</p>
        <p className="cl-stage-help">{entry.synthetic ? entry.example : `Question example: ${entry.example}`}</p>
      </section>
      {view === 'clues' && <section className="cl-clue-gallery" aria-label="Forbidden-word styles" data-motion={motion ? 'reduced' : 'full'}>
        <div className="cl-gallery__intro"><h2>Five ways to keep a secret.</h2><p>Same card, same words. Only the off-limits clues change. These are labels, not buttons.</p><p>Table Reveal, Glass and Mosaic are the chosen direction. Clue style is still yours to pick.</p><p>Change the word, state or context on the left to compare every style.</p></div>
        <div className="cl-clue-studies">{clueTreatments.map(item => <div className="cl-clue-study" data-clue-study={item.id} data-selected={clueReview.selected === item.id} key={item.id}>
          <header><h3>{item.name}{item.id === 'rail' && clueReview.preferred !== item.id && <small>Opus’s proposal</small>}</h3><p>{item.note}</p></header>
          <div className="cl-clue-preview" tabIndex={0} aria-label={`${item.name} preview. Scroll sideways for wider contexts.`}><div className="cl-clue-preview__inner"><ReviewFrame context={context} cardProps={{ ...props, back: false, edition: usesTableLayout(edition) ? edition : 'table-reveal', clueTreatment: item.id }} replay={replay} seconds={scrub} /></div></div>
          <div className="cl-gallery__actions"><button type="button" onClick={() => { selectClue(item.id); setBack(false); if (!usesTableLayout(edition)) setEdition('table-reveal'); setView('stage'); requestAnimationFrame(() => stage.current?.focus()); }}>Show on stage</button><button type="button" aria-pressed={clueReview.preferred === item.id} onClick={() => preferClue(item.id)}>{clueReview.preferred === item.id ? 'Your clue pick' : `Prefer ${item.name}`}</button></div>
        </div>)}</div>
        <p className="cl-clue-status" role="status">{clueStatus}</p>
        <label className="cl-clue-note">Note for {clueTreatments.find(item => item.id === clueReview.selected)!.name}<textarea maxLength={1000} value={clueNote} onChange={event => setClueNote(event.target.value)} /></label><button type="button" onClick={() => preferClue(clueReview.selected, true)}>Save clue style with note</button>
      </section>}
      {view === 'gallery' && <section className="cl-gallery-area" aria-label="All card materials"><SurfaceGallery cardProps={props} choice={surfaces} select={patch => { changeSurface(patch); if ('finish' in patch && finishHost(edition) === 'own') setEdition('table'); setCompare(false); setBack('back' in patch); setView('stage'); requestAnimationFrame(() => stage.current?.focus()); }} prefer={preferSurface} replay={replay} motion={motion} /></section>}
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
    <section className="cl-picks cl-surface-picks" aria-labelledby="cl-surface-picks-title"><div><h2 id="cl-surface-picks-title">Finish and back picks</h2><p>Keep a pairing for everyday play or a special edition. These choices stay separate from your edition picks.</p></div><div className="cl-picks-content">
      <div className="cl-export"><button type="button" aria-pressed={surfaces.preferredFinish === surfaces.finish} onClick={() => preferSurface('finish', surfaces.finish)}>Prefer {finishes.find(item => item.id === surfaces.finish)!.name} finish</button><button type="button" aria-pressed={surfaces.preferredBack === surfaces.back} onClick={() => preferSurface('back', surfaces.back)}>Prefer {backs.find(item => item.id === surfaces.back)!.name} back</button></div>
      <label>Note for this pairing<textarea maxLength={1000} value={pairingNote} onChange={event => setPairingNote(event.target.value)} placeholder="For example: Engraved for everyday play, Prism for a win." /></label>
      <button type="button" disabled={surfaces.pairings.length >= 12} onClick={() => saveSurfaces({ ...surfaces, pairings: [...surfaces.pairings, { edition, finish: surfaces.finish, back: surfaces.back, logo: surfaces.logo, context, note: pairingNote }] })}>Save this pairing ({surfaces.pairings.length}/12)</button>
      <ul>{surfaces.pairings.map((item, index) => <li key={index}><strong>{editionName(item.edition)} · {finishes.find(finish => finish.id === item.finish)!.name} · {backs.find(back => back.id === item.back)!.name}</strong><span>{item.context} · logo {item.logo}</span>{item.note && <p>{item.note}</p>}<div className="cl-pairing-actions"><button type="button" onClick={() => { changeSurface(item); setEdition(item.edition); setContext(item.context); setCompare(false); setBack(false); setView('stage'); requestAnimationFrame(() => stage.current?.focus()); }}>Show pairing</button><button type="button" onClick={() => saveSurfaces({ ...surfaces, pairings: surfaces.pairings.filter((_, at) => at !== index) })} aria-label={`Remove saved pairing ${index + 1}`}>Remove</button></div></li>)}</ul>
      <div className="cl-export"><button type="button" onClick={downloadReview}>Download full review</button><button type="button" onClick={() => { if (!navigator.clipboard) { setSurfaceCopy(true); return; } void navigator.clipboard.writeText(fullReview).then(() => setSurfaceStatus('Full review copied.')).catch(() => setSurfaceCopy(true)); }}>Copy full review</button></div>
      {surfaceCopy && <label>Copy this full review<textarea readOnly value={fullReview} onFocus={event => event.target.select()} /></label>}<p role="status">{surfaceStatus}</p>
    </div></section>
    <details className="cl-sound"><summary>Sound Lab</summary><p>Sound starts off. Enable it to audition the game effects.</p><SoundControls roomId="card-design-lab" lab /></details>
    <footer className="cl-footer"><span>Design direction by Opus. Working previews by Codex.</span>{!standalone && <a href="/product-review">Check the product screens</a>}<a href={standalone ? '/' : 'https://baited.maff.app'}>Baited website</a></footer>
    {view === 'stage' && <div className="cl-mobile-bar"><button type="button" onClick={() => step(-1)}>← Word</button><button type="button" onClick={() => setBack(value => !value)}>Flip</button><button type="button" onClick={() => step(1)}>Word →</button></div>}
  </main>;
}
