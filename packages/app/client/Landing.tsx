import React, { useState } from 'react';
import type { SessionInfo } from '../shared/types';
import { request, isEdgeRuntime } from './api';
import { productBrand, botNotices, BotSignInLink, Button, Modal } from './ui';
import { ArrowUpRight, Mic, Play } from './pixel-icons';
import { CutCard } from './CutCard';
import { StudioPixelField } from './StudioPixelField';
import { studioPathFromTab, studioSignInPath, studioTabFromPath } from './studio-navigation';
import { useSmoothScroll } from './smooth-scroll';

// Thumbnail C's hand: five real deck cards fanned around the banana. Phones keep the middle three.
const hand = [
  { word: 'rocket', slot: 'far-left', question: 'What carries a crew beyond the atmosphere?' },
  { word: 'dragon', slot: 'left', question: 'What would you put in charge of a castle?' },
  { word: 'pizza', slot: 'right', question: 'What would you order for the whole chat?' },
  { word: 'robot', slot: 'far-right', question: 'Who should do the chores while you stream?' },
  { word: 'banana', slot: 'center', question: 'What do cartoon characters slip on?', clock: '0:13' },
];
/** The landing's hidden word: a pixel smear where the secret would be. */
function SecretMosaic() {
  return <svg className="signin-mosaic" viewBox="0 0 13 3" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 1h2v1h-2zM3 1h1v1h-1zM5 1h1v1h-1zM7 1h1v1h-1zM9 1h2v1h-2zM1 2h1v1h-1zM3 2h1v1h-1zM5 2h1v1h-1zM7 2h1v1h-1zM9 2h2v1h-2z" />
    <path opacity=".72" d="M2 1h1v1h-1zM4 1h1v1h-1zM11 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM6 2h1v1h-1zM12 2h1v1h-1z" />
    <path opacity=".5" d="M11 0h2v1h-2zM6 1h1v1h-1zM8 1h1v1h-1zM12 1h1v1h-1zM4 2h1v1h-1zM11 2h1v1h-1z" />
    <path opacity=".26" d="M0 0h2v1h-2zM3 0h1v1h-1zM5 0h6v1h-6z" />
  </svg>;
}

export default function Landing({ session, reload }: { session: SessionInfo; reload: () => void }) {
  useSmoothScroll();
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code] = useState(() => new URLSearchParams(location.search).get('notice') ?? '');
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
  const destination = studioPathFromTab(studioTabFromPath(location.pathname));
  const connect = () => {
    if (session.authenticated) return location.assign(destination);
    if (session.twitchReady) location.assign(studioSignInPath(location.pathname));
    else setSetup(true);
  };
  const demo = async () => {
    setBusy(true);
    try {
      await request('/api/demo/start', {});
      if (location.pathname !== '/') location.assign(destination);
      else reload();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="signin-page">
    <StudioPixelField />
    <section className="signin-sheet" aria-labelledby="signin-title">
      <div className="signin-stage">
        <img className="signin-stage__plate" src="/welcome/stage-1376.webp" srcSet="/welcome/stage-800.webp 800w, /welcome/stage-1376.webp 1376w"
          sizes="(max-width: 640px) 100vw, 920px" alt="" aria-hidden="true" decoding="async" />
        <a className="signin-stage__brand" href="https://baited.maff.app" aria-label="Baited website">{productBrand}</a>
        <div className="signin-hand" aria-hidden="true">
          {hand.map(({ word, slot, question, clock }) => <CutCard key={word} word={word}
            className={`signin-hand__card is-${slot}`} chip="Chat’s secret" level={1} note="Only this word is off limits." question={question}
            footer={clock && <span className="signin-hand__clock">{clock}</span>} progress={0.1} revealStill={word !== 'banana'} revealHold={500}
            ink={word === 'banana' ? '#f3d40b' : undefined} />)}
        </div>
      </div>
      <div className="signin-content">
        <h1 id="signin-title"><span>One <SecretMosaic /><span className="sr-only">secret</span> word.</span> <span>Your whole chat <span className="signin-outline">against you.</span></span></h1>
        <div className="signin-actions">
          <p>Chat sees the word. You keep talking. Say it and chat wins.</p>
          {isEdgeRuntime() && <p className="signin-pilot">Open to invited Twitch channels during the pilot.</p>}
          {error && <p className="signin-error" role="alert">{error}</p>}
          {error && <BotSignInLink notice={code} />}
          {notice && <p className="signin-notice" role="status">{notice}</p>}
          <Button className="primary" onClick={connect}><Play size={20} />{session.authenticated ? 'Open Studio' : 'Connect Twitch'}</Button>
          {session.demoAvailable && !session.authenticated && <Button className="secondary" disabled={busy} onClick={() => void demo()}>{busy ? 'Opening demo…' : 'Try the local demo'}<ArrowUpRight size={18} /></Button>}
          <nav aria-label="About baited"><a href="https://baited.maff.app">See how it plays <ArrowUpRight size={14} /></a><a href="/privacy">Privacy</a></nav>
        </div>
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
