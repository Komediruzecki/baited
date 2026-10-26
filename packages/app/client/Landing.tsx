import { useEffect, useState } from 'react';
import type { SessionInfo } from '../shared/types';
import { request } from './api';
import { CardArt } from './CardArt';
import { brand, Button, Modal, HowTo } from './ui';
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  Link2,
  MessageSquare,
  Mic,
  Monitor,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trophy,
} from './icons';

const examples = [
  {
    word: 'banana',
    hint: 'settle this: best fruit in a smoothie?',
    response: 'Banana. Obviously.',
    handle: 'smoothie_enjoyer',
    reaction: 'oh. you got me.',
  },
  {
    word: 'penguin',
    hint: 'what animal looks permanently overdressed?',
    response: 'A penguin?',
    handle: 'totally_not_bait',
    reaction: 'wait a minute.',
  },
  {
    word: 'microwave',
    hint: 'how are you reheating that sad leftover pizza?',
    response: 'The microwave.',
    handle: 'leftover_lore',
    reaction: 'i see what you did.',
  },
];

function CardPicture({ word }: { word: string }) {
  return <CardArt word={word} className="card-picture" />;
}

function StreamSignal() {
  return <svg className="stream-signal" viewBox="0 0 160 128" aria-hidden="true" focusable="false">
    <g className="signal-bars" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square">
      <path className="signal-bar" d="M12 55v18m136-18v18" />
      <path className="signal-bar" d="M26 43v42m108-42v42" />
      <path className="signal-bar" d="M40 50v28m80-28v28" />
    </g>
    <path className="signal-mount" d="M50 65v8l10 13h40l10-13v-8M80 86v21m-20 4h40" />
    <path className="signal-capsule" d="M66 14h28l8 8v41l-8 8H66l-8-8V22Z" />
    <path className="signal-grille" d="M68 27h24M68 37h24M68 47h24" />
    <path className="signal-notch" d="M75 60h10" />
  </svg>;
}

function ExampleRound() {
  const [example, setExample] = useState(0),
    [step, setStep] = useState(0),
    [replay, setReplay] = useState(0);
  const current = examples[example];
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(3);
      return;
    }
    setStep(0);
    const a = setTimeout(() => setStep(1), 1100),
      b = setTimeout(() => setStep(2), 2600),
      c = setTimeout(() => setStep(3), 3700);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [example, replay]);
  return (
    <div className="example-wrap card-demo">
      <div className="example-label">
        <span><span className="dot" /> THIS IS THE GAME</span>
        <span>ILLUSTRATED ROUND</span>
      </div>
      <div className={'game-example step-' + step + ' word-' + current.word}>
        <div className="deal-stage">
          <div className="card-deck">
            <span className="deck-back back-one" aria-hidden="true" />
            <span className="deck-back back-two" aria-hidden="true" />
            <article className="deal-card" aria-label={'Chat’s secret card: ' + current.word}>
              <div className="deal-corner"><svg className="deal-hook" viewBox="0 0 32 40" aria-hidden="true" focusable="false"><path d="M22 3v20c0 9-15 13-16 2v-8l6 6M17 3h10" /></svg><span>CHAT’S CARD</span></div>
              <div className="deal-face">
                <CardPicture word={current.word} />
                <strong>{current.word}</strong>
                <span>MAKE THEM SAY IT</span>
              </div>
              <div className="deal-bottom"><span className="deal-brand">{brand}</span><span>KEEP IT SECRET</span></div>
            </article>
          </div>
          <div className="deal-arrow" aria-hidden="true"><ArrowRight size={27} /></div>
          <div className="stream-preview">
            <div className="stream-preview-heading"><span className="live-dot" /> STREAMER’S SCREEN</div>
            <div className="stream-portrait" aria-hidden="true"><StreamSignal /></div>
            <p className="stream-caption">just trying to stream</p>
            <div className="stream-response">
              <span>{step >= 2 ? 'STREAMER' : 'THE PLAN'}</span>
              <strong>{step >= 2 ? '“' + current.response + '”' : 'Keep them talking.'}</strong>
            </div>
            <div className="card-win-chip" aria-hidden="true"><Trophy size={16} /> CHAT WINS <b>+1</b></div>
          </div>
        </div>
        <div className="twitch-chat-preview" aria-label="Illustrated Twitch chat">
          <div className="twitch-chat-heading"><MessageSquare size={16} /><strong>STREAM CHAT</strong><span aria-hidden="true">•••</span></div>
          <div className="twitch-chat-messages">
            <p className="native-chat-line"><time>20:26</time><span className="chat-badge" title="Example subscriber badge"><Trophy size={10} /></span><strong>{current.handle}</strong><span className="chat-colon">:</span><span>{current.hint}</span></p>
            <p className="native-chat-line reaction-line"><time>20:26</time><strong>chat_collectively</strong><span className="chat-colon">:</span><span>{step === 3 ? 'WE GOT THEM' : 'a completely normal question'}</span></p>
          </div>
          <div className="chat-composer-preview" aria-hidden="true"><div>Send a message</div><span className="chat-preview-send">Chat</span></div>
        </div>
        <div className="card-round-result" aria-live="polite">
          <span className="round-step-number">{step === 3 ? <Trophy size={20} /> : step === 0 ? '01' : step === 1 ? '02' : '03'}</span>
          <span><strong>{step === 3 ? 'They said it. Chat wins.' : step === 2 ? 'The streamer says the word.' : step === 1 ? 'Chat drops a hint.' : 'Chat gets a secret word.'}</strong><small>{step === 3 ? current.reaction : 'The word stays off the streamer’s screen.'}</small></span>
          <button className="icon-button" aria-label="Replay the example round" title="Replay example" onClick={() => setReplay(replay + 1)}><RotateCcw size={20} /></button>
        </div>
      </div>
      <div className="card-picker" role="group" aria-label="Choose an example word">
        <span>Deal another word</span>
        {examples.map((e, i) => <button key={e.word} className={'pick-' + e.word} aria-pressed={i === example} onClick={() => { setExample(i); setReplay(replay + 1); }}>{e.word}</button>)}
      </div>
    </div>
  );
}

export default function Landing({ session, reload }: { session: SessionInfo; reload: () => void }) {
  const [modal, setModal] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      () =>
        ({
          oauth: 'Twitch sign-in failed. Try again.',
          cancelled: 'Twitch sign-in was cancelled.',
          setup: 'Twitch is not configured yet. Open setup for the required credentials.',
        })[new URLSearchParams(location.search).get('notice') as 'oauth' | 'cancelled' | 'setup'] ||
        '',
    );
  const connect = () => {
    if (session.authenticated) {
      location.assign('/');
      return;
    }
    session.twitchReady ? location.assign('/auth/twitch') : setModal('setup');
  };
  const demo = async () => {
    setBusy(true);
    try {
      await request('/api/demo/start', {});
      if (location.pathname !== '/') location.assign('/');
      else reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="brand" href="/" aria-label="BAIT home">
          {brand}
        </a>
        <span className="landing-nav-note">A GAME FOR TWITCH CHAT</span>
        <nav aria-label="Main navigation">
          <a className="text-button" href="#how-to-play">
            How to play
          </a>
          <Button className="secondary nav-connect" onClick={connect}>
            {session.authenticated ? 'Open studio' : 'Connect Twitch'}
            <ArrowUpRight size={18} />
          </Button>
        </nav>
      </header>
      <main>
        <section className="landing-main">
          <div className="landing-copy">
            <div className="hero-kicker">
              <span className="live-dot" /> CHAT VS. STREAMER
            </div>
            <h1>
              Make the streamer
              <br />
              say <em>banana.</em>
            </h1>
            <p className="hero-aside">Or penguin. Or microwave. You get the idea.</p>
            <p className="landing-description">
              Chat gets a secret word and tries to make you say it on stream. You keep talking. They
              pretend nothing’s happening.
            </p>
            <div className="landing-actions">
              <Button className="primary large" onClick={connect}>
                <Radio size={21} />
                {session.authenticated ? 'Open your studio' : 'Play with your chat'}
                <ArrowRight size={21} />
              </Button>
              {session.demoAvailable && !session.authenticated && (
                <Button className="demo-button" disabled={busy} onClick={() => void demo()}>
                  <Play size={21} />
                  {busy ? 'Opening demo…' : 'Try the local demo'}
                </Button>
              )}
            </div>
            <p className="landing-footnote">
              {session.demoAvailable && !session.authenticated
                ? 'Try simulated chat, or enable local speech.'
                : 'Connect your channel, share the viewer link, and enable your mic.'}
            </p>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="hero-details">
              <span>
                <Link2 size={18} /> Viewers join with a link
              </span>
              <span>
                <Monitor size={18} /> OBS browser overlay
              </span>
            </div>
          </div>
          <ExampleRound />
        </section>
        <section className="landing-rules" id="how-to-play">
          <div className="landing-section-heading">
            <div>
              <span className="eyebrow">HOW TO PLAY</span>
              <h2>
                Three steps.
                <br />
                One suspicious chat.
              </h2>
            </div>
            <p>
              Keep streaming. Chat handles the plot.
            </p>
          </div>
          <div className="rules-grid">
            {[
              [
                '01',
                'Chat gets the word.',
                'Share the viewer link. Your studio and OBS keep the word hidden.',
                Eye,
              ],
              [
                '02',
                'They drop the hints.',
                'Ask questions in Twitch chat. Don’t type the word or its forbidden clues.',
                MessageSquare,
              ],
              [
                '03',
                'You say it. Chat wins.',
                'Enable your mic and keep talking. Confirm a Moonshine catch to give chat the win. Outlast the clock to escape.',
                Mic,
              ],
            ].map(([n, title, description, Icon]) => {
              const I = Icon as typeof Eye;
              return (
                <article className="rule-card" key={n as string}>
                  <div>
                    <span>{n as string}</span>
                    <I size={24} />
                  </div>
                  <h3>{title as string}</h3>
                  <p>{description as string}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="landing-options">
          <span className="eyebrow">MORE WAYS TO PLAY</span>
          <h2>Chat has options.</h2>
          <div>
            {[
              [
                'Ban the obvious clues.',
                'Medium blocks two clues. Hard blocks four. Chat has to find another way to get you there.',
              ],
              [
                'Three words. One timer.',
                'Turn on missions and give chat three targets, one at a time. The clock keeps running between words.',
              ],
              [
                'Think you know the word?',
                'Call the bait with one private typed guess. Get it right and escape. A miss gives chat 15 more seconds.',
              ],
              [
                'Give someone the blame.',
                'After a win, pick an eligible hint for “You baited me.” It’s your call, and chat keeps the shared win.',
              ],
            ].map(([title, text]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-fair-play">
          <div className="fair-play-symbol">
            <ShieldCheck size={30} />
          </div>
          <div>
            <h3>Yes, you could just open the viewer page.</h3>
            <p>
              We’re trusting you to play along. Chat can spoil the word too, so wins can be
              reversed. The fun is getting there without making it obvious.
            </p>
          </div>
          <Button className="secondary" onClick={() => setModal('how')}>
            Full rules <ArrowUpRight size={18} />
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <a className="brand small-brand" href="/">
          {brand}
        </a>
        <span>An independent game for Twitch communities.</span>
        <a href="/privacy">Privacy</a>
        <span>CODEX × TWITCHCON 2026</span>
      </footer>
      {modal && (
        <Modal
          title={modal === 'how' ? 'How BAIT works' : 'Connect your channel'}
          onClose={() => setModal('')}
        >
          {modal === 'how' ? (
            <HowTo />
          ) : (
            <>
              <p>This server needs Twitch application credentials before you can sign in.</p>
              <ol className="setup-list">
                <li>Create a confidential app in the Twitch Developer Console.</li>
                <li>
                  Store its Client ID, Client Secret and a token encryption key in Proton Pass.
                </li>
                <li>
                  Register <code>{location.origin}/auth/twitch/callback</code> as the redirect URL.
                </li>
                <li>Restart BAIT with the Twitch credentials supplied through Proton Pass.</li>
              </ol>
              <p className="muted">
                Moonshine runs in your browser by default and needs no speech API key. Deepgram is
                optional. The README has the full setup. Keep credentials on your server.
              </p>
              {session.demoAvailable && (
                <Button className="primary" disabled={busy} onClick={() => void demo()}>
                  Try the local demo <ArrowRight size={18} />
                </Button>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
