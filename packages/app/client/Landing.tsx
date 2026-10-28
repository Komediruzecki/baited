import React, { useState } from 'react';
import type { SessionInfo } from '../shared/types';
import { request } from './api';
import { productBrand, botNotices, Button, Modal } from './ui';
import { ArrowUpRight, Mic, Play, ShieldCheck } from './pixel-icons';
import { CardBack } from './CardBack';

export default function Landing({ session, reload }: { session: SessionInfo; reload: () => void }) {
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const messages: Record<string, string> = {
      oauth: 'Twitch sign-in failed. Try again.',
      cancelled: 'Twitch sign-in was cancelled.',
      setup: 'Twitch sign-in is not configured on this server yet.',
      ...botNotices.errors,
    };
    return messages[new URLSearchParams(location.search).get('notice') ?? ''] || '';
  });
  const [notice] = useState(() =>
    new URLSearchParams(location.search).get('notice') === 'bot-ready' ? botNotices.ready : '');
  const connect = () => {
    if (session.authenticated) return location.assign('/studio');
    if (session.twitchReady) location.assign('/auth/twitch');
    else setSetup(true);
  };
  const demo = async () => {
    setBusy(true);
    try {
      await request('/api/demo/start', {});
      if (location.pathname !== '/') location.assign('/studio');
      else reload();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="signin-page">
    <section className="signin-sheet" aria-labelledby="signin-title">
      <div className="signin-table" aria-hidden="true"><div className="signin-card"><CardBack /></div></div>
      <div className="signin-content">
        <a className="signin-brand" href="https://baited.maff.app" aria-label="Baited website">{productBrand}</a>
        <h1 id="signin-title">Run baited on your channel.</h1>
        <p>Chat gets a secret word. You keep talking.</p>
        {error && <p className="signin-error" role="alert">{error}</p>}
        {notice && <p className="signin-notice" role="status">{notice}</p>}
        <Button className="primary" onClick={connect}><Play size={20} />{session.authenticated ? 'Open Studio' : 'Connect Twitch'}</Button>
        {session.demoAvailable && !session.authenticated && <Button className="secondary" disabled={busy} onClick={() => void demo()}>{busy ? 'Opening demo…' : 'Try the local demo'}<ArrowUpRight size={18} /></Button>}
        <p className="signin-privacy"><ShieldCheck size={16} />Microphone access is your choice. Turn it on in Studio when you're ready.</p>
        <nav aria-label="About baited"><a href="https://baited.maff.app">See how it plays <ArrowUpRight size={14} /></a><a href="/privacy">Privacy</a></nav>
      </div>
    </section>
    {setup && <Modal title="Connect your channel" onClose={() => setSetup(false)}>
      <p>Twitch sign-in is not configured on this server yet.</p>
      <p>Ask the person running this instance to complete the Twitch setup in the repository README.</p>
      <p className="muted"><Mic size={16} /> Moonshine runs on your computer. No speech API key is needed.</p>
      {session.demoAvailable && <Button className="primary" disabled={busy} onClick={() => void demo()}><Play size={18} />Try the local demo</Button>}
    </Modal>}
  </main>;
}
