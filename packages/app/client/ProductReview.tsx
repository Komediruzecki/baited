import React, { useEffect, useState } from 'react';
import type { SessionInfo, Studio } from '../shared/types';
import { request } from './api';
import { Button, productBrand } from './ui';
import { Mic, MicOff, ShieldCheck } from './icons';
import { VoiceGuessControl } from './VoiceGuessControl';
import type { VoiceGuessSnapshot } from './voice-guess';
import './product-review.css';

const voiceStates = ['off', 'ready', 'draft', 'offline'] as const;
type VoiceState = typeof voiceStates[number];

// An inert local specimen: the real control inside its Studio grid and mic-card
// host. It never starts a microphone, changes a setting or sends a game command.
function VoicePreview({ state }: { state: VoiceState }) {
  const [enabled, setEnabled] = useState(state !== 'off');
  const [canceled, setCanceled] = useState(false);
  const [message, setMessage] = useState('');
  const ready = state !== 'offline';
  const pending: VoiceGuessSnapshot = state === 'draft' && !canceled
    ? { draft: { word: 'banana', context: { roundId: 'preview', epoch: 1, leaseId: 'preview', takeId: 'preview' }, expiresAt: Date.now() + 12_000 }, awaitingWord: false, acceptsBareGuess: false, expiresAt: Date.now() + 12_000 }
    : { draft: null, awaitingWord: false, acceptsBareGuess: false, expiresAt: 0 };
  return <div className="app-shell studio-app studio-shell">
    <div className="workspace"><main className="main-content">
      <div className="page-title"><div><h1>Voice guesses</h1><p>Local visual preview. Microphone and game commands are off.</p></div></div>
      <div className="studio-grid">
        <section className="mission-card"><div className="mission-center"><h2>Chat has a word.</h2><p>The live round stays unchanged during this preview.</p></div></section>
        <section className="mic-card">
          <div className="card-heading"><span className="small-label">Microphone</span><span className={`status-dot${ready ? ' online' : ''}`} /></div>
          <div className="mic-visual"><div className="mic-icon">{ready ? <Mic size={28} /> : <MicOff size={28} />}</div></div>
          <h3>{ready ? 'Listening' : 'Microphone stopped'}</h3>
          <p>{ready ? 'Listening on this computer.' : 'Speech detection is off until you enable the microphone again.'}</p>
          <p className="mic-review-note"><strong>Catches confirm automatically.</strong> You have 15 seconds to reject a misheard word. You can also reverse a win afterward.</p>
          <Button className="secondary" disabled>{ready ? <MicOff size={16} /> : <Mic size={16} />}{ready ? 'Disable microphone' : 'Try microphone again'}</Button>
          <div className="mic-footnote"><ShieldCheck size={12} />Speech is checked on this computer.</div>
          <VoiceGuessControl enabled={enabled} ready={ready} pending={pending} seconds={12} busy={false}
            message={message} announcement={pending.draft ? 'Asked Baity to share this guess.' : ''}
            onToggle={() => setEnabled(value => !value)}
            onLock={() => { setCanceled(true); setMessage('Preview only. No guess was sent.'); }}
            onCancel={() => { setCanceled(true); setMessage('Guess canceled.'); }} />
        </section>
      </div>
    </main></div>
  </div>;
}

const sizes = [
  { name: 'Small phone', width: 320, height: 640 },
  { name: 'Phone', width: 390, height: 844 },
  { name: 'Tablet', width: 820, height: 1180 },
  { name: 'Small desktop', width: 1024, height: 768 },
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Large desktop', width: 1440, height: 900 },
  { name: 'Wide desktop', width: 1920, height: 1080 },
];

// Application documents and an explicitly inert voice specimen in bounded frames.
// Never creates a session, impersonates Twitch or permits a live account.
export default function ProductReview({ session }: { session: SessionInfo }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [error, setError] = useState('');
  const [surface, setSurface] = useState<'studio' | 'viewer' | 'overlay' | 'cards' | 'voice'>(() => new URLSearchParams(location.search).get('surface') === 'voice' ? 'voice' : 'studio');
  const [voiceState, setVoiceState] = useState<VoiceState>('draft');
  const [sizeIndex, setSizeIndex] = useState(1);
  const [instance, setInstance] = useState(0);
  const allowed = session.demoAvailable && !session.twitchReady && session.user?.mode === 'demo';
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    void request<Studio>('/api/studio').then(value => {
      if (current && value.room.mode === 'demo') setStudio(value);
    }).catch(reason => { if (current) setError(reason.message); });
    return () => { current = false; };
  }, [allowed]);
  const sameOriginPath = (value?: string) => {
    if (!value) return null;
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin ? `${url.pathname}${url.search}` : null;
    } catch { return null; }
  };
  const source = surface === 'studio' ? '/studio' : surface === 'cards' ? '/card-lab' : surface === 'voice' ? `/product-review?voice-preview=${voiceState}` : sameOriginPath(surface === 'viewer' ? studio?.viewerUrl : studio?.overlayUrl);
  const size = sizes[sizeIndex];
  const specimen = new URLSearchParams(location.search).get('voice-preview');
  if (allowed && voiceStates.includes(specimen as VoiceState)) return <VoicePreview state={specimen as VoiceState} />;
  return <main className="product-review">
    <header className="product-review__header">
      <a href="/" aria-label="Baited studio">{productBrand}</a>
      <nav aria-label="Design review"><a href="/card-design-lab">Card editions</a><a href="/studio">Open Studio</a></nav>
    </header>
    <div className="product-review__intro">
      <p className="product-review__label">Local design review</p>
      <h1>Check the room.</h1>
      <p>The actual app at different screen sizes. Changes inside the frame affect only this local demo.</p>
    </div>
    {!allowed ? <section className="product-review__empty"><h2>Open a local demo first.</h2><p>Use the local preview server without Twitch credentials. This review page is unavailable to live Twitch sessions.</p><a href="/">Go to the local demo</a></section> : <>
      <div className="product-review__controls">
        <label>Screen<select value={surface} onChange={event => setSurface(event.target.value as typeof surface)}><option value="studio">Streamer Studio</option><option value="viewer">Viewer room</option><option value="overlay">OBS overlay</option><option value="cards">Card design lab</option><option value="voice">Voice guesses</option></select></label>
        {surface === 'voice' && <label>Voice state<select value={voiceState} onChange={event => setVoiceState(event.target.value as VoiceState)}>{voiceStates.map(state => <option key={state} value={state}>{state}</option>)}</select></label>}
        <label>Viewport<select value={sizeIndex} onChange={event => setSizeIndex(Number(event.target.value))}>{sizes.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.width} × {item.height}</option>)}</select></label>
        <button type="button" onClick={() => setInstance(value => value + 1)}>Reload frame</button>
        {source && <a href={source} target="_blank" rel="noreferrer">Open full page</a>}
      </div>
      <p className="product-review__note">Microphone access is disabled in these frames. Voice guesses uses an inert visual fixture. Open Studio separately for speech tests. The viewer frame shows the secret word.</p>
      {error && <p role="alert">{error}</p>}
      <div className="product-review__canvas" tabIndex={0} aria-label="Scrollable screen preview">
        {source ? <iframe key={`${surface}-${instance}`} src={source} title={`${surface} local demo at ${size.width} by ${size.height}`} width={size.width} height={size.height} allow="microphone 'none'; camera 'none'" /> : <p>Opening the local demo…</p>}
      </div>
      <p className="product-review__note">The frame uses the selected width without scaling. Scroll sideways to inspect a desktop view on a smaller screen.</p>
    </>}
  </main>;
}
