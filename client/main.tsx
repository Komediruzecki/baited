import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  Mic,
  MicOff,
  Play,
  Pause,
  SkipForward,
  Square,
  Flame,
  Users,
  Trophy,
  Settings2,
  LayoutDashboard,
  Check,
  Link2,
  Monitor,
  Eye,
  ShieldCheck,
  ChevronRight,
  RotateCcw,
  X,
  HelpCircle,
  LogOut,
  Timer,
  Wifi,
  AlertTriangle,
  Terminal,
  Target,
  Trash2,
  ChevronDown,
} from './icons';
import type { GameView, Studio, SessionInfo, Settings, Result } from '../shared/types';
import { request } from './api';
import { Microphone } from './microphone';
import { SpeechLab } from './SpeechLab';
import CardProofs from './CardProofs';
import { CardArt } from './CardArt';
import { SoundControls } from './SoundControls';
import { microphoneReady, MicrophoneLease } from './safety';
import './style.css';
import Landing from './Landing';
import { productBrand as brand, Button, Tag, CopyButton, Modal, HowTo } from './ui';
import './brand.css';
import { MissionStatus, GuessForm, AwardReview, ForbiddenClueCard, PublicAward } from './mechanics';
import './angular.css';
import './landing-game.css';
import './refinement.css';
import { canRevealSoloTarget, SoloTarget } from './SoloTarget';
import './solo-target.css';
import { TranscriptPreview } from './TranscriptPreview';
import { TranscriptPreviewBuffer, type TranscriptPreviewLine } from './transcript-preview';
import './transcript-preview.css';
import './product-brand.css';
import './studio-refresh.css';
import './public-refresh.css';

const fmt = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};
const outcomeLabel: Record<Result['outcome'], string> = {
  caught: 'CHAT WINS',
  escaped: 'TIME UP',
  skipped: 'SKIPPED',
  ended: 'ENDED',
  overturned: 'CATCH REJECTED',
  review: 'CHECK THIS CATCH',
};
const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(interval);
  }, []);
  return now;
}
function remaining(g: GameView, now: number, offset: number) {
  return g.phase === 'active' && g.round?.endsAt
    ? Math.max(0, g.round.endsAt - (now + offset))
    : g.phase === 'paused'
      ? (g.round?.remaining ?? 0)
      : 0;
}
function useLive<T>(url: string, onState: (s: T) => void, onError: (s: boolean) => void) {
  const stateRef = useRef(onState),
    errorRef = useRef(onError);
  stateRef.current = onState;
  errorRef.current = onError;
  useEffect(() => {
    const source = new EventSource(url);
    source.addEventListener('state', (e) => {
      stateRef.current(JSON.parse((e as MessageEvent).data));
      errorRef.current(false);
    });
    source.onerror = () => errorRef.current(true);
    return () => source.close();
  }, [url]);
}
function Stat({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${(i * 37) % 100}%`,
              '--delay': `${(i % 7) * 0.08}s`,
              '--turn': `${i * 51}deg`,
              '--color': ['#a970ff', '#00e5b0', '#ffd37a'][i % 3],
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

type Capture = { microphone: Microphone; lease: MicrophoneLease };

function Dashboard({ session, reload }: { session: SessionInfo; reload: () => void }) {
  const [studio, setStudio] = useState<Studio | null>(null),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(''),
    [tab, setTab] = useState('studio');
  const [micStatus, setMicStatus] = useState('off'),
    [level, setLevel] = useState(0),
    [consent, setConsent] = useState(false);
  const [transcriptEnabled, setTranscriptEnabled] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptPreviewLine[]>([]);
  const transcriptBuffer = useRef(new TranscriptPreviewBuffer());
  const capture = useRef<Capture | null>(null),
    currentStudio = useRef<Studio | null>(null),
    offset = useRef(0);
  const now = useNow();
  const receive = useCallback((s: Studio) => {
    offset.current = s.room.serverTime - Date.now();
    currentStudio.current = s;
    setStudio(s);
  }, []);
  const pauseForMicrophone = useCallback(
    async (owner: Capture, message?: string, refresh = true) => {
      owner.microphone.stop();
      if (capture.current === owner) {
        setConsent(false);
        if (message) setError(message);
      }
      try {
        await owner.lease.cancel();
        if (refresh && capture.current === owner) {
          const fresh = await request<Studio>('/api/studio');
          if (capture.current === owner) receive(fresh);
        }
      } catch {
        if (capture.current === owner)
          setError(
            'Microphone stopped. Check the connection and pause the round before continuing.',
          );
      }
    },
    [receive],
  );
  const connectionError = useCallback(
    (lost: boolean) => {
      setOffline(lost);
      if (lost) {
        setTranscriptLines(transcriptBuffer.current.setEnabled(false));
        setTranscriptEnabled(false);
        if (capture.current) void pauseForMicrophone(capture.current, undefined, false);
        else setConsent(false);
        void request<SessionInfo>('/api/session')
          .then((s) => {
            if (!s.authenticated) reload();
          })
          .catch(() => {});
      }
    },
    [reload, pauseForMicrophone],
  );
  useLive('/api/studio/events', receive, connectionError);
  useEffect(() => {
    void request<Studio>('/api/studio')
      .then(receive)
      .catch((e) => setError(e.message));
    return () => {
      transcriptBuffer.current.setEnabled(false);
      const owner = capture.current;
      capture.current = null;
      owner?.microphone.stop();
      void owner?.lease.cancel().catch(() => {});
    };
  }, [receive]);
  const g = studio?.room;
  useEffect(() => {
    const owner = capture.current;
    if (!consent || !g || !session.csrf || !owner?.lease.active) return;
    if (g.phase === 'active' && !offline)
      owner.microphone.connect(g.round!.id, g.round!.epoch, session.csrf, owner.lease.id);
    else if (g.phase === 'settling' && !offline) owner.microphone.suspend();
    else owner.microphone.disconnect();
  }, [consent, g?.phase, g?.round?.id, g?.round?.epoch, offline, session.csrf]);
  useEffect(() => {
    const owner = capture.current;
    if (!consent || offline || !owner?.lease.active) return;
    const renew = () =>
      void owner.lease.renew().catch(() => {
        if (capture.current === owner && owner.lease.active)
          void pauseForMicrophone(
            owner,
            'Microphone readiness could not be confirmed. Reconnect, then enable it again.',
          );
      });
    const interval = setInterval(renew, 10000);
    return () => clearInterval(interval);
  }, [consent, offline, g?.mode, pauseForMicrophone]);
  const action = async (action: string) => {
    if (currentStudio.current?.room.phase === 'settling') return;
    setBusy(true);
    setError('');
    try {
      const s = await request<Studio>('/api/studio/action', { action }, session.csrf);
      receive(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decideCatch = async (decision: 'confirm' | 'reject') => {
    const result = currentStudio.current?.room.result;
    if (result?.outcome !== 'review') return;
    setBusy(true);
    setError('');
    try {
      receive(
        await request<Studio>('/api/studio/catch', { roundId: result.id, decision }, session.csrf),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (settings: Settings) => {
    setBusy(true);
    try {
      receive(await request<Studio>('/api/studio/settings', settings, session.csrf));
      setModal('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stopMic = () => {
    if (capture.current) void pauseForMicrophone(capture.current);
  };
  const enableMic = async () => {
    if (!studio?.speechReady) {
      setModal('speech');
      return;
    }
    setModal('consent');
  };
  const acceptMic = async () => {
    setModal('');
    setError('');
    setConsent(false);
    setTranscriptLines(transcriptBuffer.current.clear());
    const previous = capture.current;
    const previousCancelled = previous
      ? previous.lease.cancel().catch(() => {})
      : Promise.resolve();
    previous?.microphone.stop();
    const lease = new MicrophoneLease(crypto.randomUUID(), (body) =>
      request('/api/studio/microphone', body, session.csrf),
    );
    const owner: Capture = {
      lease,
      microphone: new Microphone(
        (status) => {
          if (capture.current === owner) setMicStatus(status);
        },
        (value) => {
          if (capture.current === owner) setLevel(value);
        },
        (message) => {
          if (capture.current === owner) void pauseForMicrophone(owner, message);
        },
        studio?.speechProvider,
        (line, segment) => {
          const current = currentStudio.current;
          if (
            capture.current !== owner ||
            !current ||
            !canRevealSoloTarget(window.location.hostname, current.room.mode)
          )
            return;
          const lines = transcriptBuffer.current.receive(line, segment);
          if (lines) setTranscriptLines(lines);
        },
      ),
    };
    capture.current = owner;
    const enabled = await owner.microphone.enable();
    await previousCancelled;
    if (!enabled || capture.current !== owner || !lease.active) return;
    try {
      if ((await lease.arm()) && capture.current === owner && owner.microphone.enabled)
        setConsent(true);
    } catch {
      if (capture.current === owner && lease.active)
        void pauseForMicrophone(
          owner,
          'Microphone readiness could not be confirmed. Reconnect, then enable it again.',
        );
    }
  };
  const logOut = async () => {
    stopMic();
    try {
      await request('/api/logout', {}, session.csrf);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!g || !studio)
    return (
      <div className="loading studio-loading" role="status">
        <span className="brand">{brand}</span>
        <p>{error || 'Opening your studio…'}</p>
      </div>
    );
  const active = g.phase === 'active',
    settling = g.phase === 'settling',
    paused = g.phase === 'paused',
    cool = g.phase === 'cooldown',
    pendingCatch = cool && g.result?.outcome === 'review',
    ms = remaining(g, now, offset.current),
    next = Math.max(0, (g.nextAt ?? 0) - (now + offset.current)),
    progress = g.round ? ms / g.round.duration : 1;
  const canStart = !pendingCatch && !active && !paused && !settling && (!cool || next <= 0),
    connected = g.connection.status === 'connected',
    demo = g.mode === 'demo',
    readyToBegin = demo || (connected && microphoneReady(studio.speechReady, consent, micStatus));
  return (
    <div className="app-shell studio-app">
      <aside className="sidebar">
        <a href="/about" className="brand" aria-label="About baited">
          {brand}
        </a>
        <nav aria-label="Studio sections">
          {[
            ['studio', 'Studio', LayoutDashboard],
            ['community', 'Community', Users],
            ['setup', 'Stream setup', Monitor],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Monitor;
            return (
              <button
                key={id as string}
                onClick={() => setTab(id as string)}
                className={cx('nav-item', tab === id && 'selected')}
                aria-current={tab === id ? 'page' : undefined}
              >
                <I size={18} />
                {label as string}
                {id === 'studio' && <span className="nav-indicator" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('how')}>
            <HelpCircle size={17} /> How to play
          </button>
          <div className="profile">
            <div className="avatar">
              {demo ? 'D' : session.user?.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{demo ? 'Demo studio' : session.user?.name}</strong>
              <span>{demo ? 'LOCAL DEMO' : 'TWITCH CONNECTED'}</span>
            </div>
            <button className="icon-button" aria-label="Sign out" onClick={() => void logOut()}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            baited <ChevronRight size={14} />
            <strong>
              {tab === 'studio' ? 'Studio' : tab === 'community' ? 'Community' : 'Stream setup'}
            </strong>
          </div>
          <div className="topbar-right">
            <a className="sound-toggle" href="#studio-sound">
              Sound controls
            </a>
            <span className={cx('connection-pill', (connected || demo) && 'online')}>
              <span className="dot" />
              {demo
                ? 'LOCAL DEMO'
                : connected
                  ? `TWITCH / ${g.channel}`
                  : g.connection.status.toUpperCase()}
            </span>
            <button className="icon-button" aria-label="Help" onClick={() => setModal('how')}>
              <HelpCircle size={18} />
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-title">
            <div>
              <h1>
                {tab === 'studio'
                  ? 'Your round.'
                  : tab === 'community'
                    ? 'Community'
                    : 'Stream setup'}
              </h1>
              <p>
                {tab === 'studio'
                  ? 'Chat has the word. You have the microphone.'
                  : tab === 'community'
                    ? 'Round participation and shared wins.'
                    : 'Connect your channel, check your mic, then bring chat in.'}
              </p>
            </div>
            <Button className="secondary" disabled={settling} onClick={() => setModal('settings')}>
              <Settings2 size={16} /> Game settings
            </Button>
          </div>
          {demo && (
            <div className="rehearsal-banner">
              <span>
                <Terminal size={15} />
                <strong>Demo mode</strong> Twitch is not connected. Chat is simulated; microphone
                recognition can be tested locally.
              </span>
              <button
                onClick={() =>
                  session.twitchReady ? location.assign('/auth/twitch') : setModal('twitch')
                }
              >
                Set up Twitch <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {offline && (
            <div className="error-banner" role="status">
              <Wifi size={17} /> Connection lost. Controls will return when the studio reconnects.
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'studio' && (
            <>
              <MissionStatus game={g} now={now} offset={offset.current} />
              <div className="studio-grid">
                <section
                  className={cx(
                    'mission-card',
                    active && 'is-active',
                    g.result?.outcome === 'caught' && cool && 'is-caught',
                    g.result?.outcome === 'escaped' && cool && 'is-escaped',
                  )}
                >
                  <div className="card-heading">
                    <span className="small-label">CURRENT ROUND</span>
                    <Tag tone={active ? 'lime' : paused || pendingCatch ? 'amber' : 'muted'}>
                      <span className="dot" />
                      {active
                        ? 'ROUND LIVE'
                        : paused
                          ? 'PAUSED'
                          : pendingCatch
                            ? 'AWAITING CONFIRMATION'
                            : cool
                              ? 'ROUND COMPLETE'
                              : settling
                                ? 'CHECKING'
                                : readyToBegin
                                  ? 'READY'
                                  : 'SETUP NEEDED'}
                    </Tag>
                  </div>
                  <div className="mission-center">
                    {!active && !paused && !settling && g.result ? (
                      <>
                        <span className="small-label">
                          {pendingCatch
                            ? 'CHECK THIS CATCH'
                            : g.result.outcome === 'caught'
                              ? g.mission?.status === 'complete'
                                ? 'MISSION COMPLETE'
                                : 'CHAT WINS'
                              : g.result.outcome === 'escaped'
                                ? g.result.reason === 'guess'
                                  ? 'YOU CALLED THE BAIT'
                                  : 'TIME UP'
                                : g.result.outcome === 'overturned'
                                  ? 'CATCH REJECTED'
                                  : 'ROUND ENDED'}
                        </span>
                        <h2 className="revealed-word">
                          {g.result.word}
                          <span>{g.result.outcome === 'caught' ? '.' : '?'}</span>
                        </h2>
                        <p>
                          {pendingCatch
                            ? 'Moonshine heard this word. Did you say it? The round is stopped; the score has not changed.'
                            : g.result.outcome === 'caught'
                              ? `Detected after ${g.result.elapsed} seconds.`
                              : g.result.outcome === 'overturned'
                                ? 'That catch does not count. The next round gets a new word.'
                                : g.result.reason === 'guess'
                                  ? 'Correct guess. You escaped.'
                                  : 'Start a new round when you’re ready.'}
                        </p>
                        {pendingCatch && (
                          <div className="round-actions" aria-label="Confirm speech result">
                            <Button
                              className="primary"
                              disabled={busy || offline}
                              onClick={() => void decideCatch('confirm')}
                            >
                              Confirm catch
                            </Button>
                            <Button
                              className="secondary"
                              disabled={busy || offline}
                              onClick={() => void decideCatch('reject')}
                            >
                              Not said
                            </Button>
                          </div>
                        )}
                        {g.result.outcome === 'caught' && (
                          <button
                            className="undo-button"
                            disabled={busy}
                            onClick={() => void action('reverse')}
                          >
                            <RotateCcw size={13} /> Wrong detection? Reverse win
                          </button>
                        )}
                        {g.result.outcome === 'caught' && studio.awardBoard && (
                          <a href="#award-review" className="text-button">
                            {g.result.award ? 'Change the award' : 'Choose “You baited me” award'}
                            <ChevronDown size={16} />
                          </a>
                        )}
                        <PublicAward award={g.result.award} />
                      </>
                    ) : (
                      <>
                        <div
                          className={cx('secret-card-back', active && 'in-play')}
                          aria-hidden="true"
                        >
                          <img src="/brand/bait-bomb.png" alt="" width="88" height="102" />
                          <span className="card-back-wordmark">baited</span>
                        </div>
                        <h2>
                          {settling
                            ? 'Checking final words'
                            : active
                              ? 'Chat has the word.'
                              : paused
                                ? 'Round paused'
                                : 'Ready when chat is.'}
                        </h2>
                        <p>
                          {settling
                            ? 'The clock has stopped. Checking speech from before the buzzer.'
                            : active
                              ? 'Keep streaming. Viewers will try to steer the conversation.'
                              : paused
                                ? 'The timer and speech detection are paused.'
                                : demo
                                  ? 'Share the viewer link and try a round with simulated chat and speech.'
                                  : 'Share the viewer link, enable your microphone, and start a round.'}
                        </p>
                        {!offline &&
                        (active || paused || settling) &&
                        g.round &&
                        canRevealSoloTarget(window.location.hostname, g.mode) ? (
                          <SoloTarget
                            key={`${g.id}:${g.round.id}`}
                            roomId={g.id}
                            roundId={g.round.id}
                            phase={g.phase}
                          />
                        ) : (
                          <div className="secret-capsule">
                            <ShieldCheck size={15} />
                            <span>The target stays hidden in your studio.</span>
                          </div>
                        )}
                        {(active || paused) && g.round?.guessEnabled && (
                          <div className="guess-control">
                            {g.round.guessUsed ? (
                              <p className="guess-used">
                                Guess used. Chat got {g.round.wrongGuessBonus} extra seconds.
                              </p>
                            ) : (
                              <Button
                                className="secondary"
                                disabled={!active || busy || offline}
                                onClick={() => setModal('guess')}
                              >
                                <Target size={16} />
                                Call the bait
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="round-console">
                    <div className="timer-block">
                      <span className="small-label">
                        {pendingCatch
                          ? 'ROUND STOPPED'
                          : cool
                            ? g.mission?.status === 'active'
                              ? 'NEXT WORD'
                              : 'NEXT ROUND'
                            : active || paused || settling
                              ? g.mission
                                ? `WORD ${Math.min(3, g.mission.completed + 1)} OF 3`
                                : `ROUND ${String(g.round?.number).padStart(2, '0')}`
                              : g.settings.mission === 'three'
                                ? 'SESSION TIMER'
                                : 'ROUND TIMER'}
                      </span>
                      <div className={cx('timer', active && ms < 15000 && 'urgent')}>
                        {pendingCatch
                          ? '—:—'
                          : cool
                            ? fmt(next)
                            : active || paused || settling
                              ? fmt(ms)
                              : fmt(
                                  (g.settings.mission === 'three'
                                    ? g.settings.missionDuration
                                    : g.settings.duration) * 1000,
                                )}
                        <span>
                          {pendingCatch
                            ? 'CONFIRM CATCH ABOVE'
                            : cool
                              ? g.settings.auto
                                ? 'AUTO START'
                                : 'COOLDOWN'
                              : 'REMAINING'}
                        </span>
                      </div>
                    </div>
                    <div className="round-actions">
                      {pendingCatch ? (
                        <Button className="primary" disabled>
                          Waiting for your decision
                        </Button>
                      ) : settling ? (
                        <Button className="primary" disabled>
                          <Timer size={16} /> Checking final words
                        </Button>
                      ) : active ? (
                        <Button
                          className="primary"
                          disabled={busy || offline}
                          onClick={() => void action('pause')}
                        >
                          <Pause size={16} /> Pause round
                        </Button>
                      ) : paused ? (
                        <Button
                          className="primary"
                          disabled={busy || offline || !readyToBegin}
                          onClick={() => void action('resume')}
                        >
                          <Play size={16} /> Resume round
                        </Button>
                      ) : (
                        <Button
                          className="primary"
                          disabled={busy || offline || !canStart || !readyToBegin}
                          onClick={() => void action('start')}
                        >
                          <Play size={16} fill="currentColor" />
                          {cool && next > 0
                            ? 'Next round soon'
                            : g.settings.mission === 'three'
                              ? 'Start mission'
                              : 'Start round'}
                        </Button>
                      )}
                      {(active || paused) && (
                        <>
                          <button
                            className="round-icon"
                            aria-label="Skip current round"
                            title="Skip round"
                            disabled={busy || offline}
                            onClick={() => void action('skip')}
                          >
                            <SkipForward size={18} />
                          </button>
                          <button
                            className="round-icon"
                            aria-label="End current round"
                            title="End round"
                            disabled={busy || offline}
                            onClick={() => setModal('end')}
                          >
                            <Square size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="round-readiness" role="status">
                    {demo ? (
                      <>
                        <Terminal size={15} />
                        <span>Demo round. No microphone or Twitch connection needed.</span>
                      </>
                    ) : (
                      <>
                        <span className={connected ? 'ready-check' : ''}>
                          {connected ? <Check size={15} /> : <Wifi size={15} />} Twitch{' '}
                          {connected ? 'connected' : 'disconnected'}
                        </span>
                        <span className={consent ? 'ready-check' : ''}>
                          {consent ? <Mic size={15} /> : <MicOff size={15} />}
                          {settling
                            ? 'Finishing speech check'
                            : micStatus === 'listening'
                              ? 'Speech live'
                              : consent
                                ? 'Microphone armed'
                                : !studio.speechReady
                                  ? 'Speech setup needed'
                                  : 'Microphone off'}
                        </span>
                        {!consent && (
                          <button
                            type="button"
                            disabled={offline || settling}
                            onClick={() => void enableMic()}
                          >
                            {studio.speechReady ? 'Enable microphone' : 'Set up speech'}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="round-progress">
                    <div
                      style={{ width: `${active || paused ? progress * 100 : cool ? 0 : 100}%` }}
                    />
                  </div>
                  <div className="mission-footer">
                    <span>
                      <Target size={13} />
                      {(g.round?.difficulty ?? g.settings.difficulty).toUpperCase()} DIFFICULTY
                    </span>
                    <span>
                      {g.mission?.status === 'active'
                        ? 'ONE SESSION CLOCK'
                        : g.settings.auto
                          ? 'AUTOMATIC ROUNDS'
                          : 'MANUAL ROUNDS'}
                    </span>
                  </div>
                  {cool && g.result?.outcome === 'caught' && <Confetti />}
                </section>
                <section className="mic-card">
                  <div className="card-heading">
                    <span className="small-label">YOUR MICROPHONE</span>
                    <span className={cx('status-dot', micStatus === 'listening' && 'online')} />
                  </div>
                  <div className="mic-visual">
                    <div className="mic-icon">
                      {consent ? <Mic size={28} /> : <MicOff size={28} />}
                    </div>
                    <div className="waveform" aria-hidden="true">
                      {Array.from({ length: 23 }, (_, i) => (
                        <i
                          key={i}
                          style={{
                            height: consent
                              ? `${8 + Math.sin(i * 1.7) ** 2 * level * 48}px`
                              : '3px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <h3>
                    {settling
                      ? 'Checking final words'
                      : micStatus.startsWith('Loading Moonshine')
                        ? micStatus
                        : micStatus === 'connecting'
                          ? 'Connecting speech'
                          : micStatus === 'listening'
                            ? 'Listening'
                            : consent
                              ? 'Microphone ready'
                              : 'Microphone off'}
                  </h3>
                  <p>
                    {settling
                      ? 'Listening has stopped. Waiting for the final word check.'
                      : micStatus === 'connecting'
                        ? 'Opening the speech connection. The round pauses if it cannot connect.'
                        : micStatus === 'listening'
                          ? studio.speechProvider === 'moonshine'
                            ? 'Moonshine listens on this computer. Confirm catches before they count.'
                            : 'Listening for complete words. Audio is streamed to Deepgram.'
                          : consent
                            ? 'Mic enabled. Recognition starts with the next active round.'
                            : 'Enable your microphone to check for the target word.'}
                  </p>
                  {studio.speechProvider === 'moonshine' && (
                    <p className="mic-review-note">
                      <strong>You make the call.</strong> Confirm each catch before chat gets a win.
                    </p>
                  )}
                  <Button
                    className={consent ? 'secondary' : 'light'}
                    disabled={offline || settling}
                    onClick={() =>
                      consent || micStatus.startsWith('Loading Moonshine')
                        ? stopMic()
                        : void enableMic()
                    }
                  >
                    {consent ? <MicOff size={16} /> : <Mic size={16} />}
                    {micStatus.startsWith('Loading Moonshine')
                      ? 'Cancel model loading'
                      : consent
                        ? 'Disable microphone'
                        : 'Enable microphone'}
                  </Button>
                  <div className="mic-footnote">
                    <ShieldCheck size={12} />
                    {studio.speechReady
                      ? 'MIC INPUT ONLY · NO AUDIO STORAGE'
                      : 'SPEECH SETUP NEEDED'}
                  </div>
                  {studio.speechProvider === 'moonshine' &&
                    canRevealSoloTarget(window.location.hostname, g.mode) && (
                      <TranscriptPreview
                        enabled={transcriptEnabled}
                        lines={transcriptLines}
                        listening={micStatus === 'listening'}
                        onToggle={() => {
                          const enabled = !transcriptEnabled;
                          setTranscriptLines(transcriptBuffer.current.setEnabled(enabled));
                          setTranscriptEnabled(enabled);
                        }}
                        onClear={() => setTranscriptLines(transcriptBuffer.current.clear())}
                      />
                    )}
                </section>
              </div>
              <div className="stats-grid">
                <Stat
                  label="COMMUNITY WINS"
                  value={g.score.wins}
                  icon={<Trophy size={17} />}
                  detail={`${g.score.played} rounds played`}
                />
                <Stat
                  label="CURRENT STREAK"
                  value={String(g.score.streak).padStart(2, '0')}
                  icon={<Flame size={18} />}
                  detail={`Best streak: ${g.score.best}`}
                />
                <Stat
                  label="PARTICIPANTS"
                  value={g.participants}
                  icon={<Users size={18} />}
                  detail="Unique chatters this round"
                />
                <Stat
                  label="SKIP VOTES"
                  value={`${g.voters} / ${g.voteThreshold}`}
                  icon={<SkipForward size={18} />}
                  detail="One !skip vote per chatter"
                />
              </div>
              <div className="bottom-grid">
                <section className="panel viewer-share">
                  <div className="section-heading">
                    <div>
                      <span className="small-label">VIEWER ROOM</span>
                      <h3>Share the viewer link</h3>
                    </div>
                    <Link2 size={21} />
                  </div>
                  <p>Post this link in Twitch chat. It reveals the target to viewers.</p>
                  <div className="link-field">
                    <input aria-label="Viewer room link" readOnly value={studio.viewerUrl} />
                    <CopyButton value={studio.viewerUrl} />
                  </div>
                  <div className="share-footer">
                    <span>
                      <Users size={13} /> No viewer account needed
                    </span>
                    <a href={studio.viewerUrl} target="_blank" rel="noreferrer">
                      Open viewer room <ArrowUpRight size={14} />
                    </a>
                  </div>
                </section>
                <section className="panel recent-rounds">
                  <div className="section-heading">
                    <h3>Recent rounds</h3>
                    <span className="small-label">LAST {Math.min(g.history.length, 3)}</span>
                  </div>
                  {g.history.length ? (
                    g.history.slice(0, 3).map((r) => <ResultRow key={r.id} result={r} />)
                  ) : (
                    <div className="empty-history">
                      <Timer size={22} />
                      <div>
                        <strong>No finished rounds yet.</strong>
                        <p>Start a round to begin.</p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              {studio.awardBoard && (
                <AwardReview
                  key={studio.awardBoard.roundId}
                  board={studio.awardBoard}
                  csrf={session.csrf!}
                  offline={offline || settling}
                  onReceive={receive}
                  onError={setError}
                />
              )}
              {demo && <Rehearsal game={g} csrf={session.csrf!} onError={setError} />}
            </>
          )}
          {tab === 'community' && <Community game={g} />}
          {tab === 'setup' && (
            <Setup
              studio={studio}
              game={g}
              action={action}
              micEnabled={consent}
              micStatus={micStatus}
              onMicrophone={() => setTab('studio')}
              onDelete={() => setModal('delete')}
            />
          )}
          <section
            className="studio-sound-section"
            id="studio-sound"
            aria-labelledby="studio-sound-title"
          >
            <h2 id="studio-sound-title">Round sounds</h2>
            <SoundControls roomId={g.id} game={g} offline={offline} />
            <a href="/card-proofs">Open all 18 cards and Sound Lab ↗</a>
          </section>
          <footer className="studio-footer">
            <span className="footer-brand">
              baited<span> / Bait them.</span>
            </span>
            <a href="/privacy" target="_blank" rel="noreferrer">
              Privacy
            </a>
            <span>CHAT VS. STREAMER</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === 'settings'
              ? 'Game settings'
              : modal === 'how'
                ? 'How to play'
                : modal === 'guess'
                  ? 'Call the bait'
                  : modal === 'consent'
                    ? 'Let Baited listen to your microphone?'
                    : modal === 'end'
                      ? 'End this round?'
                      : modal === 'delete'
                        ? 'Delete your Baited data?'
                        : modal === 'twitch'
                          ? 'Set up Twitch'
                          : 'Set up microphone recognition'
          }
          onClose={() => setModal('')}
        >
          {modal === 'settings' ? (
            <SettingsForm settings={g.settings} busy={busy || settling} onSave={save} />
          ) : modal === 'how' ? (
            <HowTo />
          ) : modal === 'guess' ? (
            <GuessForm
              key={g.round?.id}
              game={g}
              csrf={session.csrf!}
              offline={offline}
              onReceive={receive}
              onClose={() => setModal('')}
            />
          ) : modal === 'consent' ? (
            <>
              <p>
                {studio.speechProvider === 'moonshine'
                  ? 'Baited will load Moonshine Tiny on this computer, then ask for your microphone. Recognition runs here during active rounds. Only final words and timing go to the game server.'
                  : 'Baited will request your microphone and stream it through this server to Deepgram during active rounds only.'}
              </p>
              <p className="muted">
                {studio.speechProvider === 'moonshine'
                  ? 'Confirm catches: this model can mistake similar words. Baited stops the round and asks you before awarding a win. The first model download is about 84 MB and is cached in your browser.'
                  : 'Baited does not record or store audio or transcripts. Deepgram processes the audio under its own terms.'}{' '}
                Use headphones to reduce sound from your stream reaching the mic. You can stop at
                any time.
              </p>
              <div className="modal-actions">
                <Button className="secondary" onClick={() => setModal('')}>
                  Cancel
                </Button>
                <Button className="primary" disabled={settling} onClick={() => void acceptMic()}>
                  <Mic size={16} /> Allow microphone
                </Button>
              </div>
            </>
          ) : modal === 'end' ? (
            <>
              <p>The current target will be revealed and automatic rounds will stop.</p>
              <Button
                className="danger"
                disabled={settling || busy || offline}
                onClick={() => {
                  setModal('');
                  void action('end');
                }}
              >
                End this round
              </Button>
            </>
          ) : modal === 'delete' ? (
            <>
              <p>
                Your settings, scores, participation records, and Twitch authorization will be
                removed. Shared links will stop working.
              </p>
              <Button
                className="danger"
                onClick={() => {
                  void request('/api/account/delete', {}, session.csrf)
                    .then(reload)
                    .catch((e) => setError(e.message));
                }}
              >
                Delete my data
              </Button>
            </>
          ) : modal === 'twitch' ? (
            <>
              <p>
                Store Twitch application credentials in Proton Pass, then restart BAIT with the
                reference template in the README.
              </p>
              <p className="muted">
                Only chat-read permission is requested. BAIT does not post target words or
                announcements.
              </p>
            </>
          ) : (
            <>
              <p>
                {studio.speechProvider === 'moonshine'
                  ? 'Moonshine runs in the standalone studio on your computer.'
                  : 'This server is configured for Deepgram’s streaming speech service.'}
              </p>
              <ol className="setup-list">
                <li>
                  {studio.speechProvider === 'moonshine'
                    ? 'Open BAIT on localhost or HTTPS in a current browser. The page needs cross-origin isolation for the speech model.'
                    : 'Store your Deepgram key in Proton Pass and add its reference to the README’s setup template.'}
                </li>
                <li>Restart BAIT, then enable your microphone here.</li>
              </ol>
              <p className="muted">
                {demo
                  ? 'You can test game matching below with a simulated transcript. It does not use the microphone or a transcription provider.'
                  : 'No simulated transcript endpoint is available in Twitch mode.'}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function ResultRow({ result: r }: { result: Result }) {
  return (
    <div className="result-row">
      <span className={cx('result-icon', r.outcome === 'caught' && 'win')}>
        {r.outcome === 'caught' ? <Check size={14} /> : <ArrowUpRight size={14} />}
      </span>
      <strong>{r.word}</strong>
      <span className="result-time">{r.outcome === 'caught' ? `${r.elapsed}s` : '—'}</span>
      <Tag tone={r.outcome === 'caught' ? 'lime' : 'muted'}>
        {r.reason === 'guess' ? 'BAIT CALLED' : outcomeLabel[r.outcome]}
      </Tag>
      {r.award && (
        <span className="result-award">
          <Trophy size={12} />
          <span>Streamer’s pick: @{r.award.name}</span>
        </span>
      )}
    </div>
  );
}
function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (s: Settings) => void;
}) {
  const [s, set] = useState(settings);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
      }}
    >
      <p className="muted">
        Clue rules and guessing apply to the next word. Changing the format takes effect after the
        current mission.
      </p>
      <label className="field-label">Game format</label>
      <div className="segmented" role="group" aria-label="Game format">
        {(['single', 'three'] as const).map((mission) => (
          <button
            key={mission}
            type="button"
            aria-pressed={s.mission === mission}
            className={cx(s.mission === mission && 'selected')}
            onClick={() => set({ ...s, mission })}
          >
            {mission === 'single' ? 'Single word' : 'Three-word mission'}
          </button>
        ))}
      </div>
      <label className="field-label">Difficulty</label>
      <div className="segmented">
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={s.difficulty === d}
            className={cx(s.difficulty === d && 'selected')}
            onClick={() => set({ ...s, difficulty: d })}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label>
          {s.mission === 'three' ? 'Mission timer' : 'Round duration'}
          <select
            value={s.mission === 'three' ? s.missionDuration : s.duration}
            onChange={(e) =>
              set({
                ...s,
                [s.mission === 'three' ? 'missionDuration' : 'duration']: Number(e.target.value),
              })
            }
          >
            {(s.mission === 'three'
              ? [60, 90, 120, 180, 300, 600, 900]
              : [30, 60, 90, 120, 180, 300, 600]
            ).map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
        <label>
          Cooldown
          <select
            value={s.cooldown}
            onChange={(e) => set({ ...s, cooldown: Number(e.target.value) })}
          >
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-help">
        {s.difficulty === 'easy'
          ? 'No forbidden clues.'
          : s.difficulty === 'medium'
            ? 'Viewers must avoid two obvious clues.'
            : 'Viewers must avoid four obvious clues.'}{' '}
        Only a violating hint loses award eligibility.
      </p>
      {s.mission === 'three' && (
        <p className="field-help">
          Land three words before this timer runs out. The clock keeps running between words and
          freezes when you pause. A skip replaces a word; a correct private guess ends the mission.
        </p>
      )}
      <label className="number-label">
        Votes to skip
        <input
          type="number"
          min="1"
          max="50"
          value={s.skipVotes}
          onChange={(e) => set({ ...s, skipVotes: Number(e.target.value) })}
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>Automatic rounds</strong>
          <small>Start a fresh round or mission after each cooldown.</small>
        </span>
        <input
          type="checkbox"
          checked={s.auto}
          onChange={(e) => set({ ...s, auto: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>Call the bait</strong>
          <small>One private typed guess per word. A miss gives chat 15 extra seconds.</small>
        </span>
        <input
          type="checkbox"
          checked={s.callBait}
          onChange={(e) => set({ ...s, callBait: e.target.checked })}
        />
      </label>
      <div className="modal-actions">
        <Button type="submit" className="primary" disabled={busy}>
          Save game settings <Check size={16} />
        </Button>
      </div>
    </form>
  );
}
function Rehearsal({
  game,
  csrf,
  onError,
}: {
  game: GameView;
  csrf: string;
  onError: (e: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState('friendly_viewer'),
    [text, setText] = useState(''),
    [transcript, setTranscript] = useState(''),
    [feedback, setFeedback] = useState('');
  const send = async (kind: string) => {
    try {
      if (kind === 'chat') {
        const r = await request<{ accepted: boolean }>('/api/demo/chat', { name, text }, csrf);
        setFeedback(
          r.accepted
            ? 'Test chatter counted.'
            : 'Not counted: inactive, cooldown, duplicate chatter, or target spoiler.',
        );
        setText('');
      } else {
        const r = await request<{ matched: boolean }>(
          '/api/demo/transcript',
          { text: transcript, roundId: game.round?.id, epoch: game.round?.epoch },
          csrf,
        );
        setFeedback(
          r.matched
            ? 'Complete target word matched. Community win recorded.'
            : 'No match. Only the exact complete target word wins.',
        );
        setTranscript('');
      }
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <section className="rehearsal-tools">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <Terminal size={15} />
        <span>Demo controls</span>
        <span className="small-label">DEVELOPMENT ONLY</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="rehearsal-body">
          <p>
            Open the viewer room in a separate tab to learn the target. These inputs simulate
            events; they are not Twitch messages or speech recognition.
          </p>
          <div className="rehearsal-inputs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send('chat');
              }}
            >
              <label>
                Test chatter
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={25}
                  pattern="[a-zA-Z0-9_]+"
                />
              </label>
              <label>
                Simulated chat
                <input
                  required
                  placeholder="A subtle nudge, or !skip"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <Button className="secondary" disabled={game.phase !== 'active'}>
                Send test chat
              </Button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send('transcript');
              }}
            >
              <label>
                Simulated final transcript
                <textarea
                  required
                  placeholder="Something the streamer might say…"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </label>
              <Button className="secondary" disabled={game.phase !== 'active'}>
                Test word detection
              </Button>
            </form>
          </div>
          <p role="status" className="test-feedback">
            {feedback}
          </p>
        </div>
      )}
    </section>
  );
}
function Community({ game: g }: { game: GameView }) {
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="SHARED WINS"
          value={g.score.wins}
          icon={<Trophy size={18} />}
          detail="The whole community wins"
        />
        <Stat
          label="BEST STREAK"
          value={g.score.best}
          icon={<Flame size={18} />}
          detail="Consecutive community wins"
        />
        <Stat
          label="ROUNDS PLAYED"
          value={g.score.played}
          icon={<Target size={18} />}
          detail="Completed rounds"
        />
        <Stat
          label="THIS ROUND"
          value={g.participants}
          icon={<Users size={18} />}
          detail="Unique participating chatters"
        />
      </div>
      <div className="bottom-grid">
        <section className="panel">
          <div className="section-heading">
            <h3>Participation</h3>
            <Users size={19} />
          </div>
          <p className="muted">
            Each chatter earns participation credit once per completed round. “You baited me” awards
            are chosen by the streamer after a win.
          </p>
          {g.leaders.length ? (
            g.leaders.map((l, i) => (
              <div className="leader-row" key={l.name}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{l.name}</strong>
                <span className="leader-credit">
                  {l.rounds} rounds<small>{l.baits} streamer picks</small>
                </span>
              </div>
            ))
          ) : (
            <div className="empty-history">
              <Users />
              <p>No participants yet. Chat during a round to join in.</p>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Round history</h3>
            <span className="small-label">RECENT ROUNDS</span>
          </div>
          {g.history.map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
          {!g.history.length && <p className="muted">No rounds yet.</p>}
        </section>
      </div>
    </>
  );
}
function Setup({
  studio,
  game,
  action,
  micEnabled,
  micStatus,
  onMicrophone,
  onDelete,
}: {
  studio: Studio;
  game: GameView;
  action: (s: string) => Promise<void>;
  micEnabled: boolean;
  micStatus: string;
  onMicrophone: () => void;
  onDelete: () => void;
}) {
  const connected = game.connection.status === 'connected';
  const micLabel = micStatus.startsWith('Loading Moonshine')
    ? 'Loading model'
    : micStatus === 'connecting'
      ? 'Connecting'
      : micStatus === 'listening'
        ? 'Listening'
        : micEnabled
          ? 'Enabled'
          : 'Off';
  return (
    <div className="setup-grid">
      <ol className="setup-steps">
        <li>
          <section className="setup-step">
            <span className="setup-step-index" aria-hidden="true">
              01
            </span>
            <div className="setup-step-body">
              <div className="setup-step-heading">
                <h2>Connect your chat</h2>
                <Tag tone={connected ? 'lime' : 'muted'}>
                  {game.mode === 'demo' ? 'Local demo' : connected ? 'Connected' : 'Not connected'}
                </Tag>
              </div>
              <p className="muted">
                {game.mode === 'demo'
                  ? 'This session uses simulated chat. Set up Twitch from the demo banner to use your channel.'
                  : `${connected ? 'Reading chat from' : 'Channel:'} @${game.channel}. ${game.connection.detail}.`}
              </p>
              <p className="setup-commands">
                <code>!bait</code> joins the round. <code>!skip</code> votes for a new word.
                Ordinary, non-spoiler chat also counts.
              </p>
              {game.mode === 'twitch' && (
                <div className="connection-buttons">
                  <Button className="secondary" onClick={() => void action('connect')}>
                    <Wifi size={16} /> Reconnect chat
                  </Button>
                  <Button className="secondary" onClick={() => void action('disconnect')}>
                    Disconnect chat
                  </Button>
                </div>
              )}
            </div>
          </section>
        </li>
        <li>
          <section className="setup-step">
            <span className="setup-step-index" aria-hidden="true">
              02
            </span>
            <div className="setup-step-body">
              <div className="setup-step-heading">
                <h2>Check your microphone</h2>
                <Tag tone={micEnabled ? 'lime' : 'muted'}>{micLabel}</Tag>
              </div>
              <p className="muted">
                {studio.speechProvider === 'moonshine'
                  ? 'Moonshine checks speech on this computer. You confirm each catch before chat gets a win.'
                  : 'The studio sends microphone audio to Deepgram during active rounds.'}{' '}
                Keep this browser tab open while you play.
              </p>
              <Button className="secondary" onClick={onMicrophone}>
                <Mic size={16} /> Check in studio
              </Button>
            </div>
          </section>
        </li>
        <li>
          <section className="setup-step">
            <span className="setup-step-index" aria-hidden="true">
              03
            </span>
            <div className="setup-step-body">
              <div className="setup-step-heading">
                <h2>Add the OBS overlay</h2>
                <span className="setup-size">1920 × 1080</span>
              </div>
              <p className="muted">
                Add a Browser Source in OBS, paste this URL and use the dimensions above. The
                background is transparent. The active word stays hidden.
              </p>
              <div className="link-field">
                <input aria-label="OBS overlay URL" value={studio.overlayUrl} readOnly />
                <CopyButton value={studio.overlayUrl} />
              </div>
              <a className="inline-link" href={studio.overlayUrl} target="_blank" rel="noreferrer">
                Preview the OBS overlay <ArrowUpRight size={15} />
              </a>
            </div>
          </section>
        </li>
        <li>
          <section className="setup-step">
            <span className="setup-step-index" aria-hidden="true">
              04
            </span>
            <div className="setup-step-body">
              <div className="setup-step-heading">
                <h2>Bring chat into the game</h2>
                <Tag tone="muted">Viewer room</Tag>
              </div>
              <p className="muted">
                Share this standalone viewer-room link in Twitch chat or a channel panel. Viewers
                keep it beside the stream to see their secret word.
              </p>
              <div className="link-field">
                <input aria-label="Viewer room URL" value={studio.viewerUrl} readOnly />
                <CopyButton value={studio.viewerUrl} />
              </div>
              <a className="inline-link" href={studio.viewerUrl} target="_blank" rel="noreferrer">
                Open the viewer room <ArrowUpRight size={15} />
              </a>
              <div className="notice">
                <Eye size={18} />
                <p>This link reveals the word. Keep it closed while you play.</p>
              </div>
            </div>
          </section>
        </li>
      </ol>
      <section className="privacy-panel">
        <ShieldCheck size={22} />
        <div>
          <h3>Your game data</h3>
          <p className="muted">
            Baited stores settings, scores, participation and award counts. Recent chat hints stay
            in memory for award review, then clear ten minutes after the round. Chat text, audio and
            transcripts are never written to disk.
          </p>
        </div>
        <Button className="danger-outline" onClick={onDelete}>
          <Trash2 size={16} /> Delete my data
        </Button>
      </section>
    </div>
  );
}

function PublicRoom({ id, overlay }: { id: string; overlay: boolean }) {
  const [game, setGame] = useState<GameView | null>(null),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const offset = useRef(0),
    now = useNow();
  const role = overlay ? 'overlay' : 'viewer',
    query = overlay ? location.search : '';
  const receive = useCallback((g: GameView) => {
    offset.current = g.serverTime - Date.now();
    setGame(g);
    setError('');
  }, []);
  useLive<GameView>(
    `/api/rooms/${encodeURIComponent(id)}/events/${role}${query}`,
    receive,
    setOffline,
  );
  useEffect(() => {
    void request<GameView>(`/api/rooms/${encodeURIComponent(id)}/${role}${query}`)
      .then(receive)
      .catch((e) => setError(e.message));
  }, [id, role, query, receive]);
  useEffect(() => {
    document.body.classList.toggle('overlay-body', overlay);
    return () => document.body.classList.remove('overlay-body');
  }, [overlay]);
  if (error)
    return (
      <div className={overlay ? 'overlay-error' : 'public-error'}>
        <AlertTriangle />
        <h2>Room unavailable</h2>
        <p>{error}</p>
        {!overlay && <a href="/">Back to baited</a>}
      </div>
    );
  if (!game)
    return overlay ? null : (
      <div className="loading">
        <span className="brand">{brand}</span>
        <p>Loading the room…</p>
      </div>
    );
  const g = game,
    ms = remaining(g, now, offset.current),
    active = g.phase === 'active',
    paused = g.phase === 'paused',
    settling = g.phase === 'settling',
    finished = !active && !paused && !settling && !!g.result,
    won = g.result?.outcome === 'caught' && finished,
    pendingCatch = g.result?.outcome === 'review' && finished;
  const stale = offline;
  if (overlay)
    return (
      <div className="obs-root">
        <PublicAward award={g.history[0]?.award} />
        <div
          className={cx(
            'obs-hud',
            won && 'obs-hud-win',
            paused && 'obs-hud-paused',
            stale && 'obs-hud-stale',
          )}
        >
          <div className={cx('obs-widget', won && 'obs-win')}>
            <div className="obs-logo">{brand}</div>
            <div className="obs-message">
              <span>
                {g.mode === 'demo' ? 'LOCAL DEMO · ' : ''}
                {stale
                  ? 'RECONNECTING'
                  : settling
                    ? 'CHECKING FINAL WORDS'
                    : won
                      ? 'CHAT WINS'
                      : active
                        ? 'CHAT HAS A WORD'
                        : paused
                          ? 'ROUND PAUSED'
                          : finished
                            ? g.result?.reason === 'guess'
                              ? 'BAIT CALLED'
                              : outcomeLabel[g.result!.outcome]
                            : 'WAITING FOR A ROUND'}
              </span>
              <strong>
                {won
                  ? g.result?.word
                  : active || paused || settling
                    ? g.mission
                      ? `WORD ${Math.min(3, g.mission.completed + 1)} OF 3`
                      : `ROUND ${g.round?.number}`
                    : finished
                      ? g.result?.word
                      : 'BAIT THEM.'}
              </strong>
            </div>
            <div className="obs-time">
              {active || paused || settling
                ? fmt(ms)
                : won
                  ? '+1'
                  : finished && g.result?.reason === 'timer'
                    ? '00:00'
                    : '—'}
            </div>
            <div className="obs-progress">
              <i style={{ width: `${g.round ? (ms / g.round.duration) * 100 : 0}%` }} />
            </div>
          </div>
          <MissionStatus compact game={g} now={now} offset={offset.current} />
          <div className="obs-score">
            <Trophy size={15} />
            {g.score.wins} WINS<span>·</span>
            <Flame size={15} />
            {g.score.streak} STREAK
          </div>
        </div>
        {won && now + offset.current - g.result!.at < 5500 && (
          <div className="obs-celebration">
            <Confetti />
            <span>THEY SAID IT.</span>
            <h1>
              {g.result!.word}
              <span>!</span>
            </h1>
            <p>CHAT WINS</p>
          </div>
        )}
        {finished &&
          g.result?.outcome === 'escaped' &&
          now + offset.current - g.result.at < 5000 && (
            <div className="obs-escape">
              <span>THE STREAMER ESCAPED.</span>
              <strong>{g.result.word}</strong>
              <small>{g.result.reason === 'guess' ? 'BAIT CALLED' : 'TIME’S UP'}</small>
            </div>
          )}
      </div>
    );
  return (
    <div
      className={cx(
        'viewer-page',
        'viewer-room',
        (active || paused || settling) && 'viewer-playing',
      )}
    >
      <header className="viewer-header">
        <a className="brand" href="/">
          {brand}
        </a>
        <Tag tone={active ? 'lime' : 'muted'}>
          <span className="dot" />
          {g.mode === 'demo' ? 'LOCAL DEMO' : `@${g.channel}`}
        </Tag>
      </header>
      <main className="viewer-main">
        <div className="eyebrow">
          <Eye size={15} /> VIEWER ROOM
        </div>
        <h1>
          {pendingCatch
            ? 'Check this catch.'
            : settling
              ? 'Checking final words.'
              : g.mission?.status === 'complete'
                ? 'Chat cleared the mission.'
                : g.mission?.status === 'failed'
                  ? 'Time ran out.'
                  : g.result?.reason === 'guess' && !active && !paused
                    ? 'The streamer called it.'
                    : won
                      ? 'The streamer said it.'
                      : 'You have one job.'}
        </h1>
        <p className="viewer-intro">
          {pendingCatch
            ? 'The round has stopped. The streamer is checking this catch.'
            : settling
              ? 'The clock has stopped. Waiting for the final speech result.'
              : g.mission?.status === 'complete'
                ? 'All three words landed before the timer.'
                : g.mission?.status === 'failed'
                  ? `${g.mission.completed} of 3 words landed. Those word wins still count.`
                  : g.result?.reason === 'guess' && !active && !paused
                    ? 'The private guess was right. The streamer escaped.'
                    : won
                      ? 'One word. One win for the whole chat.'
                      : 'Make the streamer say this word. Keep it subtle.'}
        </p>
        {stale && (
          <div className="error-banner">
            <Wifi size={16} /> Connection lost. Waiting for a fresh game update.
          </div>
        )}
        <MissionStatus game={g} now={now} offset={offset.current} />
        <div className="viewer-game">
          <section className={cx('target-card', won && 'target-win')}>
            <div className="card-heading">
              <span className="small-label">{finished ? 'THE REVEAL' : 'YOUR SECRET TARGET'}</span>
              <Tag tone={active ? 'lime' : 'muted'}>
                {active
                  ? 'LIVE'
                  : settling
                    ? 'CHECKING'
                    : paused
                      ? 'PAUSED'
                      : finished
                        ? g.result &&
                          (g.result.reason === 'guess'
                            ? 'BAIT CALLED'
                            : outcomeLabel[g.result.outcome])
                        : 'WAITING'}
              </Tag>
            </div>
            <div className="target-display">
              {!stale && (
                <CardArt
                  word={
                    active || paused || settling
                      ? g.round?.target
                      : finished
                        ? g.result?.word
                        : undefined
                  }
                />
              )}
              {stale ? (
                <h2>Hold tight.</h2>
              ) : active || paused || settling ? (
                <>
                  <span className="target-number">
                    ROUND {String(g.round?.number).padStart(2, '0')}
                  </span>
                  <h2>
                    {g.round?.target}
                    <span>.</span>
                  </h2>
                  <p>
                    {settling
                      ? 'Only words spoken before the buzzer can count.'
                      : 'Use hints in Twitch chat. Keep the target out of your messages.'}
                  </p>
                </>
              ) : finished ? (
                <>
                  <h2>
                    {g.result?.word}
                    <span>{won ? '!' : '.'}</span>
                  </h2>
                  <p>
                    {pendingCatch
                      ? 'No win has been awarded. Waiting for the streamer to confirm.'
                      : g.result?.reason === 'guess'
                        ? 'The streamer guessed the word without saying it.'
                        : g.result?.outcome === 'overturned'
                          ? 'The detection was reversed. A fresh word is up next.'
                          : won
                            ? `Target detected after ${g.result?.elapsed} seconds.`
                            : 'Round finished. Wait for the streamer to start the next one.'}
                  </p>
                </>
              ) : (
                <>
                  <div className="waiting-eyes">
                    <img src="/brand/bait-bomb.png" alt="" width="116" height="136" />
                  </div>
                  <h2>Waiting for a round</h2>
                  <p>The word will appear when the streamer starts.</p>
                </>
              )}
            </div>
            <ForbiddenClueCard game={g} />
            <div className="viewer-timer">
              <div>
                <Timer size={16} />
                <span>
                  {active || paused || settling
                    ? fmt(ms)
                    : pendingCatch
                      ? '—:—'
                      : finished
                        ? fmt(Math.max(0, (g.nextAt ?? 0) - (now + offset.current)))
                        : '—:—'}
                </span>
                <small>
                  {settling
                    ? 'CHECKING'
                    : paused
                      ? 'PAUSED'
                      : finished
                        ? g.nextAt !== null
                          ? 'COOLDOWN'
                          : 'NEXT ROUND READY'
                        : 'ON THE CLOCK'}
                </small>
              </div>
              <span>
                <Users size={15} />
                {g.participants} participating
              </span>
            </div>
            <div className="viewer-progress">
              <i style={{ width: `${g.round ? (ms / g.round.duration) * 100 : 0}%` }} />
            </div>
            {won && <Confetti />}
          </section>
          <PublicAward award={g.history[0]?.award} />
        </div>
        <aside className="viewer-support" aria-label="How to play and scores">
          <div className="viewer-playbook">
            <h3>How to play</h3>
            <div>
              <span>01</span>
              <p>Ask a question or start a conversation that could lead to the word.</p>
            </div>
            <div>
              <span>02</span>
              <p>Keep the target and any forbidden clues out of Twitch chat.</p>
            </div>
            <div>
              <span>03</span>
              <p>
                Talk in chat to participate. Type <code>!skip</code> if you’re stuck.
              </p>
            </div>
          </div>
          <div className="viewer-bottom">
            <div>
              <Trophy size={19} />
              <strong>{g.score.wins}</strong>
              <span>COMMUNITY WINS</span>
            </div>
            <div>
              <Flame size={19} />
              <strong>{g.score.streak}</strong>
              <span>WIN STREAK</span>
            </div>
          </div>
          <div className="viewer-skip">
            <span>
              Skip votes{' '}
              <strong>
                {g.voters} / {g.voteThreshold}
              </strong>
            </span>
            <span>Vote once in Twitch chat.</span>
          </div>
          {g.mode === 'twitch' && (
            <a
              className="button primary twitch-chat-link"
              href={`https://www.twitch.tv/${encodeURIComponent(g.channel)}`}
              target="_blank"
              rel="noreferrer"
            >
              Back to Twitch chat <ArrowUpRight size={17} />
            </a>
          )}
        </aside>
      </main>
      <footer className="viewer-footer">
        baited · Bait them.
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
        <span>baited / 2026</span>
      </footer>
    </div>
  );
}
function Privacy() {
  return (
    <div className="viewer-page">
      <header className="viewer-header">
        <a className="brand" href="/">
          {brand}
        </a>
        <a className="text-button" href="/">
          Back to BAIT <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="privacy-copy">
        <div className="eyebrow">BAIT</div>
        <h1>Privacy</h1>
        <p>
          BAIT is an independent community game. The person running this server operates this
          instance.
        </p>
        <h2>Microphone audio</h2>
        <p>
          The streamer chooses whether to enable the microphone. The consent screen names the speech
          provider. With Moonshine, English recognition runs in the browser and only final text and
          word timing reach this server. With Deepgram, audio travels through this server to
          Deepgram. BAIT does not save audio or transcript text. Disabling the microphone, closing
          the studio, or disconnecting the input stops capture. Pausing stops recognition.
        </p>
        <p>
          Moonshine model files download from download.moonshine.ai and are cached in the browser.
          If Deepgram is selected, requests opt out of its Model Improvement Program. It processes
          audio under its{' '}
          <a href="https://deepgram.com/privacy" target="_blank" rel="noreferrer">
            privacy policy
          </a>{' '}
          and the operator’s service agreement.
        </p>
        <h2>Twitch and participation</h2>
        <p>
          The streamer authorizes BAIT to read their channel’s chat. For each word, BAIT keeps up to
          40 eligible hints and 20 flagged hints in memory for a post-round award. The current word
          and the previous review can coexist. Each chatter has at most three clean hints and one
          flagged hint in that set. Raw text clears when the next round ends or ten minutes after
          its own round ends, whichever comes first. It is never written to disk. Hints are shown to
          the streamer only after the word is revealed.
        </p>
        <p>
          Channel identity, settings, results, participation and award counts are stored. Up to
          1,000 participant IDs and display names are retained per room; leading totals and the
          streamer’s selected award name appear publicly. Awards are manual picks. BAIT does not
          infer which hint caused a win or delete messages from Twitch.
        </p>
        <h2>Private guesses</h2>
        <p>
          Call the bait sends a typed guess to this server. The guess text is not retained or
          broadcast. A correct guess ends the word and reveals its target. An incorrect guess shares
          only the fifteen-second time bonus.
        </p>
        <h2>Session cookies and access</h2>
        <p>
          The studio uses an essential session cookie that expires after 12 hours. Twitch access and
          refresh tokens are encrypted on this server. Viewers can use the room without signing in.
          BAIT adds no advertising or analytics cookies.
        </p>
        <h2>Delete or disconnect</h2>
        <p>
          Streamers can use Stream setup → Delete my data to delete the room, scores, and stored
          Twitch authorization. You can also revoke BAIT in Twitch’s connection settings. For a
          participant record or other privacy request, contact the broadcaster whose room you
          joined.
        </p>
        <h2>Secret words</h2>
        <p>
          The viewer page intentionally reveals the target to anyone with its link, including a
          streamer who opens it. OBS links provide read-only game information. Keep studio sessions
          and server credentials private.
        </p>
        <p className="muted">Updated October 24, 2026.</p>
      </main>
    </div>
  );
}
function App() {
  const [session, setSession] = useState<SessionInfo | null>(null),
    [error, setError] = useState('');
  const path = location.pathname.split('/').filter(Boolean),
    reload = useCallback(() => {
      void request<SessionInfo>('/api/session')
        .then((s) => {
          setSession(s);
          setError('');
        })
        .catch((e) => setError(e.message));
    }, []);
  useEffect(() => {
    if (!['play', 'overlay', 'privacy', 'speech-lab', 'card-proofs'].includes(path[0])) reload();
  }, [reload]);
  if (path[0] === 'privacy') return <Privacy />;
  if (path[0] === 'speech-lab') return <SpeechLab />;
  if (path[0] === 'card-proofs') return <CardProofs />;
  if (path[0] === 'about' && session) return <Landing session={session} reload={reload} />;
  if (['play', 'overlay'].includes(path[0]) && path[1])
    return <PublicRoom id={path[1]} overlay={path[0] === 'overlay'} />;
  if (error)
    return (
      <div className="loading">
        <p role="alert">{error}</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  if (!session)
    return (
      <div className="loading">
        <span className="brand">{brand}</span>
        <p>Loading BAIT…</p>
      </div>
    );
  return session.authenticated ? (
    <Dashboard key={session.csrf} session={session} reload={reload} />
  ) : (
    <Landing session={session} reload={reload} />
  );
}
createRoot(document.getElementById('root')!).render(<App />);
