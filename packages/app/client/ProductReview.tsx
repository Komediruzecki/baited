import React, { useEffect, useState } from 'react';
import type { SessionInfo, Studio } from '../shared/types';
import { request } from './api';
import { productBrand } from './ui';
import './product-review.css';

const sizes = [
  { name: 'Small phone', width: 320, height: 640 },
  { name: 'Phone', width: 390, height: 844 },
  { name: 'Tablet', width: 820, height: 1180 },
  { name: 'Small desktop', width: 1024, height: 768 },
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Large desktop', width: 1440, height: 900 },
  { name: 'Wide desktop', width: 1920, height: 1080 },
];

// Actual application documents in bounded frames. Never creates a session,
// impersonates Twitch, substitutes API responses, or permits a live account.
export default function ProductReview({ session }: { session: SessionInfo }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [error, setError] = useState('');
  const [surface, setSurface] = useState<'studio' | 'viewer' | 'overlay' | 'cards'>('studio');
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
  const source = surface === 'studio' ? '/studio' : surface === 'cards' ? '/card-lab' : sameOriginPath(surface === 'viewer' ? studio?.viewerUrl : studio?.overlayUrl);
  const size = sizes[sizeIndex];
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
        <label>Screen<select value={surface} onChange={event => setSurface(event.target.value as typeof surface)}><option value="studio">Streamer Studio</option><option value="viewer">Viewer room</option><option value="overlay">OBS overlay</option><option value="cards">Card design lab</option></select></label>
        <label>Viewport<select value={sizeIndex} onChange={event => setSizeIndex(Number(event.target.value))}>{sizes.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.width} × {item.height}</option>)}</select></label>
        <button type="button" onClick={() => setInstance(value => value + 1)}>Reload frame</button>
        {source && <a href={source} target="_blank" rel="noreferrer">Open full page</a>}
      </div>
      <p className="product-review__note">Microphone access is disabled in these frames. Open Studio separately for speech tests. The viewer frame shows the secret word.</p>
      {error && <p role="alert">{error}</p>}
      <div className="product-review__canvas" tabIndex={0} aria-label="Scrollable screen preview">
        {source ? <iframe key={`${surface}-${instance}`} src={source} title={`${surface} local demo at ${size.width} by ${size.height}`} width={size.width} height={size.height} allow="microphone 'none'; camera 'none'" /> : <p>Opening the local demo…</p>}
      </div>
      <p className="product-review__note">The frame uses the selected width without scaling. Scroll sideways to inspect a desktop view on a smaller screen.</p>
    </>}
  </main>;
}
