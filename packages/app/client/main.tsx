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
  Users,
  Settings2,
  LayoutDashboard,
  Check,
  Link2,
  Monitor,
  Eye,
  ShieldCheck,
  Volume2,
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
  MessageSquare,
  NoChat,
} from './icons';
import type {
  GameView,
  Studio,
  SessionInfo,
  Settings,
  Result,
  ChatBotPost,
  ChatBotStatus,
} from '../shared/types';
import { request } from './api';
import { Microphone } from './microphone';
import { SpeechLab } from './SpeechLab';
import { CardArt } from './CardArt';
import { ResultCard } from './ResultCard';
import { CardBack } from './CardBack';
import { CatchDecision } from './CatchDecision';
import { ObsHud } from './ObsHud';
import { wordSize } from '../extension/presentation.js';
import { SoundControls } from './SoundControls';
import { microphoneReady, MicrophoneLease } from './safety';
import './style.css';
import Landing from './Landing';
import { productBrand as brand, botNotices, Button, Tag, CopyButton, Modal, HowTo } from './ui';
import './brand.css';
import { MissionStatus, GuessForm, AwardReview, ForbiddenClueCard, PublicAward } from './mechanics';
import './mechanics.css';
import './angular.css';
import './landing-game.css';
import './refinement.css';
import { canRevealSoloTarget, SoloTarget } from './SoloTarget';
import './solo-target.css';
import { TranscriptPreview } from './TranscriptPreview';
import {
  canPreviewTranscript,
  TranscriptPreviewBuffer,
  type TranscriptPreviewLine,
} from './transcript-preview';
import './transcript-preview.css';
import './product-brand.css';
import './result-card.css';
import '../extension/tokens.css';
import './studio-refresh.css';
import './public-refresh.css';
import './chat-bot.css';

const ProductReview = React.lazy(() => import('./ProductReview'));
const CardDesignLab = React.lazy(() => import('./CardDesignLab'));

const fmt = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};
const spokenTime = (ms: number, paused: boolean) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60),
    seconds = total % 60;
  return `${minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ` : ''}${seconds} ${seconds === 1 ? 'second' : 'seconds'} ${paused ? 'paused' : 'left'}`;
};
const outcomeLabel: Record<Result['outcome'], string> = {
  caught: 'Chat wins',
  escaped: 'Time’s up',
  skipped: 'Skipped',
  ended: 'Ended',
  overturned: 'Catch rejected',
  review: 'Catch pending',
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
type Capture = { microphone: Microphone; lease: MicrophoneLease };

function Dashboard({ session, reload }: { session: SessionInfo; reload: () => void }) {
  const [studio, setStudio] = useState<Studio | null>(null),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(''),
    [tab, setTab] = useState('studio'),
    // The operator may finish the bot account sign-in while signed in here as a streamer.
    [notice, setNotice] = useState(() => {
      const code = new URLSearchParams(location.search).get('notice') ?? '';
      return code === 'bot-ready'
        ? { text: botNotices.ready, ok: true }
        : botNotices.errors[code]
          ? { text: botNotices.errors[code], ok: false }
          : null;
    });
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
            !canPreviewTranscript(window.location.hostname, current.room.mode)
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
    modelLoading = micStatus.startsWith('Loading Moonshine'),
    modelProgress = /^Loading Moonshine (\d+)%$/.exec(micStatus),
    readyToBegin = !modelLoading && (demo || (connected && microphoneReady(studio.speechReady, consent, micStatus)));
  return (
    <div className="app-shell studio-app studio-shell">
      <aside className="sidebar">
        <a href="https://baited.maff.app" className="brand" aria-label="Baited website">
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
          <a className="sound-toggle" href="#studio-sound" aria-label="Sound controls">
            <Volume2 size={17} />
            <span>Sound</span>
          </a>
          <button className="icon-button" aria-label="How to play" onClick={() => setModal('how')}>
            <HelpCircle size={18} />
          </button>
          {!demo && (
            <span className={cx('connection-pill', connected && 'online')}>
              <span className="dot" />
              {connected ? (
                <>
                  Twitch<span className="connection-channel"> · @{g.channel}</span>
                </>
              ) : (
                g.connection.status
              )}
            </span>
          )}
          <div className="profile">
            <div className="avatar">
              {demo ? 'D' : session.user?.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{demo ? 'Your studio' : session.user?.name}</strong>
              {!demo && <span>Signed in to Twitch</span>}
            </div>
            <button className="icon-button" aria-label="Sign out" onClick={() => void logOut()}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <main className="main-content">
          <div className={cx('page-title', tab === 'studio' && 'page-title--studio')}>
            <div><h1>{tab === 'studio' ? 'Studio' : tab === 'community' ? 'Community' : 'Stream setup'}</h1>
              {tab !== 'studio' && <p>{tab === 'community' ? 'Round participation and shared wins.' : 'Connect chat, check your mic, then bring viewers in.'}</p>}
            </div>
            {tab !== 'studio' && <Button className="secondary game-settings-button" disabled={settling || offline} onClick={() => setModal('settings')}><Settings2 size={16} />Game settings</Button>}
          </div>
          {demo && (
            <div className="rehearsal-banner">
              <span>
                <Terminal size={15} />
                <strong>Local demo.</strong> Simulated chat.{' '}
              </span>
              <button
                onClick={() =>
                  session.twitchReady ? location.assign('/auth/twitch') : setModal('twitch')
                }
              >
                Connect Twitch <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {offline && (
            <div className="error-banner" role="status">
              <Wifi size={17} /> Connection lost. Controls come back when the studio reconnects.
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
          {notice && (
            <div className={cx('error-banner', notice.ok && 'info-banner')} role="status">
              {notice.ok ? <Check size={17} /> : <AlertTriangle size={17} />}
              <span>{notice.text}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'studio' && (
            <>
              {!offline && <MissionStatus game={g} now={now} offset={offset.current} />}
              <div className="studio-grid">
                <section
                  className={cx(
                    'mission-card',
                    offline && 'is-offline',
                    active && ms <= 15000 && 'is-urgent',
                    pendingCatch && 'is-review',
                    active && 'is-active',
                    g.result?.outcome === 'caught' && cool && 'is-caught',
                    g.result?.outcome === 'escaped' && cool && 'is-escaped',
                  )}
                >
                  <div className="card-heading">
                    <span className="round-identity">
                      {g.mission?.status === 'active' && !pendingCatch
                        ? `Word ${Math.min(3, g.mission.completed + 1)} of 3`
                        : g.round
                          ? `Round ${String(g.round.number).padStart(2, '0')}`
                          : 'Next round'}
                    </span>
                    <span className="desk-difficulty">{g.round?.difficulty ?? g.settings.difficulty}</span>
                    <Tag tone={active ? 'lime' : paused || pendingCatch ? 'amber' : 'muted'}>
                      <span className="dot" />
                      {active
                        ? 'Live'
                        : paused
                          ? 'Paused'
                          : pendingCatch
                            ? 'Your call'
                            : cool
                              ? 'Round complete'
                              : settling
                                ? 'Checking'
                                : readyToBegin
                                  ? 'Ready'
                                  : 'Setup needed'}
                    </Tag>
                    <button className="desk-settings" aria-label="Game settings" disabled={settling || offline} onClick={() => setModal('settings')}><Settings2 size={16} /><span>Game settings</span></button>
                  </div>
                  <div className="round-console">
                    <div className="timer-block">
                      <div
                        className={cx(
                          'timer',
                          active && ms < 15000 && 'urgent',
                          pendingCatch && 'timer-stopped',
                        )}
                        role={!offline && (active || paused || settling) ? 'timer' : undefined}
                        aria-label={
                          offline ? 'Timer unavailable while reconnecting' : active || paused || settling ? spokenTime(ms, paused) : undefined
                        }
                      >
                        {offline
                          ? '—:—'
                          : pendingCatch
                          ? `Round ${String(g.result?.number).padStart(2, '0')} · Clock stopped`
                          : cool
                            ? fmt(next)
                            : active || paused || settling
                              ? fmt(ms)
                              : fmt(
                                  (g.settings.mission === 'three'
                                    ? g.settings.missionDuration
                                    : g.settings.duration) * 1000,
                                )}
                        {!active && !paused && !settling && !pendingCatch && (
                          <span>
                            {cool
                              ? g.settings.auto
                                ? 'Auto start in'
                                : next > 0
                                  ? 'Next round in'
                                  : 'Ready for the next round'
                              : 'Round length'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="round-actions" hidden={pendingCatch}>
                      {settling ? (
                        <Button className={demo || consent ? 'primary' : 'secondary'} disabled>
                          <Timer size={16} /> Checking final words
                        </Button>
                      ) : active ? (
                        <Button
                          className={demo || consent ? 'primary' : 'secondary'}
                          disabled={busy || offline}
                          onClick={() => void action('pause')}
                        >
                          <Pause size={16} /> Pause round
                        </Button>
                      ) : paused ? (
                        <Button
                          className={demo || consent ? 'primary' : 'secondary'}
                          disabled={busy || offline || !readyToBegin}
                          onClick={() => void action('resume')}
                        >
                          <Play size={16} /> Resume round
                        </Button>
                      ) : (
                        <Button
                          className={demo || consent ? 'primary' : 'secondary'}
                          disabled={busy || offline || !canStart || !readyToBegin}
                          onClick={() => void action('start')}
                        >
                          <Play size={16} fill="currentColor" />
                          {cool && next > 0
                            ? `Next round in ${fmt(next)}`
                            : g.settings.mission === 'three'
                              ? 'Start mission'
                              : 'Start round'}
                        </Button>
                      )}
                      {(active || paused) && (
                        <>
                          <button
                            className="round-icon round-secondary"
                            aria-label="Skip current round"
                            title="Skip round"
                            disabled={busy || offline}
                            onClick={() => void action('skip')}
                          >
                            <SkipForward size={18} /><span>Skip word</span>
                          </button>
                          <button
                            className="round-icon round-secondary"
                            aria-label="End current round"
                            title="End round"
                            disabled={busy || offline}
                            onClick={() => setModal('end')}
                          >
                            <Square size={16} /><span>End round</span>
                          </button>
                        </>
                      )}
                    </div>
                    {!active && !paused && !pendingCatch && !readyToBegin && <p className="start-reason" role="status">{modelLoading ? 'Waiting for the speech model.' : 'Connect chat and turn on your microphone to start.'}</p>}
                  </div>
                  <div
                    className={cx(
                      'mission-center',
                      'studio-stage',
                      !active && !paused && !settling && !!g.result && 'studio-stage--result',
                      pendingCatch && 'studio-stage--review',
                    )}
                  >
                    <div className="studio-card-slot">
                      {!active && !paused && !settling && g.result ? (
                        <ResultCard key={g.result.id} result={g.result} />
                      ) : (
                        <CardBack />
                      )}
                    </div>
                    <div className="studio-stage__copy">
                      {!active && !paused && !settling && g.result ? (
                        <CatchDecision
                          key={g.result.id}
                          result={g.result}
                          disabled={busy || offline}
                          hasAward={!!studio.awardBoard}
                          onDecide={(decision) => void decideCatch(decision)}
                          onReverse={() => void action('reverse')}
                        />
                      ) : (
                        <>
                          <h2>
                            {offline
                              ? 'Waiting for updates.'
                              : !demo && !connected && !active && !paused
                                ? "Chat isn’t connected."
                                : settling
                              ? 'Checking final words.'
                              : active
                                ? 'Chat has the word.'
                                : paused
                                  ? 'Round paused.'
                                  : 'Ready when chat is.'}
                          </h2>
                          <p>
                            {offline
                              ? 'The round controls are unavailable until the connection returns.'
                              : !demo && !connected && !active && !paused
                                ? g.connection.detail
                                : settling
                              ? 'Only words spoken before the buzzer count.'
                              : active
                                ? 'Keep talking. Any answer could be the slip.'
                                : paused
                                  ? 'The clock and listening are stopped.'
                                  : demo
                                    ? 'Open the viewer room in another tab, then start.'
                                    : 'Viewers get the word when you start.'}
                          </p>
                          <div className="secret-capsule">
                            <ShieldCheck size={15} />
                            <span>Only chat sees the secret word.</span>
                          </div>
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
                  </div>
                  {!demo && (
                    <div className="round-readiness" role="status">
                      {
                        <>
                          <span className={connected ? 'ready-check' : ''}>
                            {connected ? <Check size={15} /> : <Wifi size={15} />} Chat{' '}
                            {connected ? 'connected' : 'disconnected'}
                          </span>
                          <span className={consent ? 'ready-check' : ''}>
                            {consent ? <Mic size={15} /> : <MicOff size={15} />}
                            {modelLoading
                              ? micStatus
                              : settling
                              ? 'Finishing speech check'
                              : micStatus === 'listening'
                                ? 'Speech live'
                                : consent
                                  ? 'Microphone armed'
                                  : !studio.speechReady
                                    ? 'Speech setup needed'
                                    : 'Microphone off'}
                          </span>
                          {!connected && <button type="button" disabled={offline || busy} onClick={() => void action('connect')}>Reconnect chat</button>}
                          {!consent && !modelLoading && (
                            <button
                              type="button"
                              disabled={offline || settling}
                              onClick={() => void enableMic()}
                            >
                              <Mic size={14} />
                              {studio.speechReady ? 'Enable microphone' : 'Set up speech'}
                            </button>
                          )}
                        </>
                      }
                    </div>
                  )}
                  <div className="round-progress">
                    <div
                      style={{ width: `${active || paused ? progress * 100 : cool ? 0 : 100}%` }}
                    />
                  </div>
                  <div className="mission-footer">
                    <span className="round-difficulty">
                      {g.round?.difficulty ?? g.settings.difficulty}
                    </span>
                    <span className="round-totals">
                      <span>
                        <strong>{g.participants}</strong> chatting
                      </span>
                      <span>·</span>
                      <span>
                        Skip{' '}
                        <strong>
                          {g.voters}/{g.voteThreshold}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Streak <strong>{g.score.streak}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        <strong>{g.score.wins}</strong> {g.score.wins === 1 ? 'win' : 'wins'}
                      </span>
                      {g.settings.auto && (
                        <>
                          <span>·</span>
                          <span>Auto rounds</span>
                        </>
                      )}
                    </span>
                  </div>
                </section>
                <section className="mic-card">
                  <div className="card-heading">
                    <span className="small-label">Microphone</span>
                    <span className={cx('status-dot', micStatus === 'listening' && 'online')} />
                  </div>
                  <div className="mic-visual">
                    <div className="mic-icon">
                      {consent ? <Mic size={28} /> : <MicOff size={28} />}
                    </div>
                    <div className="waveform mic-level" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, level)) * 100)} hidden={!consent}>
                      {Array.from({ length: 5 }, (_, i) => <i key={i} className={level > i / 5 ? 'is-lit' : ''} style={{ height: `${12 + i * 8}px` }} />)}
                    </div>
                  </div>
                  <h3>
                    {settling
                      ? 'Checking final words'
                      : micStatus.startsWith('Loading Moonshine')
                        ? 'Loading the speech model'
                        : micStatus === 'connecting'
                          ? 'Connecting speech'
                          : micStatus === 'listening'
                            ? 'Listening'
                            : paused && consent
                              ? 'Paused'
                            : consent
                              ? 'Microphone ready'
                              : 'Microphone off'}
                  </h3>
                  <p>
                    {modelLoading
                      ? 'The model is cached in this browser after it downloads.'
                      : settling
                      ? 'Listening has stopped. Waiting for the final word check.'
                      : micStatus === 'connecting'
                        ? 'Opening the speech connection. The round pauses if it cannot connect.'
                        : micStatus === 'listening'
                          ? studio.speechProvider === 'moonshine'
                            ? 'Listening on this computer.'
                            : 'Listening for complete words. Audio is streamed to Deepgram.'
                          : consent
                            ? 'Mic enabled. Recognition starts with the next active round.'
                            : 'Enable your microphone to listen for the secret word.'}
                  </p>
                  {modelLoading && modelProgress && <div className="model-progress"><progress aria-label="Speech model download" max={100} value={Math.min(100, Number(modelProgress[1]))} /><span>{modelProgress[1]}%</span></div>}
                  {studio.speechProvider === 'moonshine' && (
                    <p className="mic-review-note">
                      <strong>You make the call.</strong> Confirm each catch before chat gets a win.
                    </p>
                  )}
                  <Button
                    className={!demo && !consent && !modelLoading && !pendingCatch ? 'primary' : 'secondary'}
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
                      ? studio.speechProvider === 'moonshine'
                        ? 'Speech is checked on this computer.'
                        : 'Audio streams to Deepgram during rounds.'
                      : 'Speech setup needed'}
                  </div>
                  {!offline &&
                    (active || paused || settling) &&
                    g.round &&
                    canRevealSoloTarget(window.location.hostname, g.mode) && (
                      <SoloTarget
                        key={`${g.id}:${g.round.id}`}
                        roomId={g.id}
                        roundId={g.round.id}
                        phase={g.phase}
                      />
                    )}
                  {studio.speechProvider === 'moonshine' &&
                    canPreviewTranscript(window.location.hostname, g.mode) && (
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
                <div className="bottom-grid">
                  <section className="panel viewer-share">
                    <div className="section-heading">
                      <div>
                        <h3>Viewer link</h3>
                      </div>
                      <Link2 size={21} />
                    </div>
                    <p>Viewers see the secret word here.</p>
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
              {demo && (
                <Rehearsal game={g} bot={studio.chatBot} csrf={session.csrf!} onError={setError} />
              )}
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
            <a href="/card-design-lab">
              Browse card editions <ArrowUpRight size={14} />
            </a>
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
                    ? 'Let baited listen to your microphone?'
                    : modal === 'end'
                      ? 'End this round?'
                      : modal === 'delete'
                        ? 'Delete your baited data?'
                        : modal === 'twitch'
                          ? 'Set up Twitch'
                          : 'Set up microphone recognition'
          }
          onClose={() => setModal('')}
        >
          {modal === 'settings' ? (
            <SettingsForm
              settings={g.settings}
              chatBot={studio.chatBot}
              busy={busy || settling}
              onSave={save}
            />
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
                  ? 'baited will load Moonshine Tiny on this computer, then ask for your microphone. Recognition runs here during active rounds. Only final words and timing go to the game server.'
                  : 'baited will request your microphone and stream it through this server to Deepgram during active rounds only.'}
              </p>
              <p className="muted">
                {studio.speechProvider === 'moonshine'
                  ? 'Confirm catches: this model can mistake similar words. baited stops the round and asks you before awarding a win. The first model download is about 84 MB and is cached in your browser.'
                  : 'baited does not record or store audio or transcripts. Deepgram processes the audio under its own terms.'}{' '}
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
              <p>The secret word will be revealed and automatic rounds will stop.</p>
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
                Store Twitch application credentials in Proton Pass, then restart baited with the
                reference template in the README.
              </p>
              <p className="muted">
                baited asks to read your chat. Announcements are optional and post through a
                separate bot account; they never include the secret word while a round is live.
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
                    ? 'Open baited on localhost or HTTPS in a current browser. The page needs cross-origin isolation for the speech model.'
                    : 'Store your Deepgram key in Proton Pass and add its reference to the README’s setup template.'}
                </li>
                <li>Restart baited, then enable your microphone here.</li>
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
function ResultRow({ result: r }: { result: GameView['history'][number] }) {
  return (
    <div className="result-row">
      <span className={cx('result-icon', r.outcome === 'caught' && 'win')}>
        <CardArt word={r.word} />
      </span>
      <strong>{r.word}</strong>
      <span className="result-time">{r.outcome === 'caught' ? `${r.elapsed}s` : '—'}</span>
      <Tag tone={r.outcome === 'caught' ? 'lime' : 'muted'}>
        {r.reason === 'guess' ? 'Bait called' : outcomeLabel[r.outcome]}
      </Tag>
      {r.award && (
        <span className="result-award">
          <Check size={12} />
          <span>Streamer’s pick: @{r.award.name}</span>
        </span>
      )}
    </div>
  );
}
function chatBotHint(bot: ChatBotStatus) {
  const what = 'Posts round starts, halfway, the last 10 seconds and results. Never the word while a round is live.';
  if (bot.mode === 'demo') return `${what} In this demo, posts appear under Demo controls.`;
  if (bot.mode === 'unconfigured') return `${what} This server has no bot account yet, so nothing is posted.`;
  if (bot.mode === 'unauthorized')
    return `${what} The bot account still needs to sign in on this server, so nothing is posted.`;
  if (!bot.channelAllowed) return `${what} Allow the bot in Stream setup first.`;
  return `${what} Posts as ${bot.name} with Twitch’s Chat Bot badge.`;
}
function SettingsForm({
  settings,
  chatBot,
  busy,
  onSave,
}: {
  settings: Settings;
  chatBot: ChatBotStatus;
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
          ? 'No off-limits clues.'
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
      <p className="field-label">Chat bot</p>
      <label className="toggle-row">
        <span>
          <strong>Announce rounds in chat</strong>
          <small>{chatBotHint(chatBot)}</small>
        </span>
        <input
          type="checkbox"
          checked={s.chatBot}
          onChange={(e) => set({ ...s, chatBot: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          <strong>Moderator commands</strong>
          <small>
            Your moderators can type !bait start, !bait pause and !bait resume. Starting still
            needs your microphone on in this studio.
          </small>
        </span>
        <input
          type="checkbox"
          checked={s.modCommands}
          onChange={(e) => set({ ...s, modCommands: e.target.checked })}
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
  bot,
  csrf,
  onError,
}: {
  game: GameView;
  bot: ChatBotStatus;
  csrf: string;
  onError: (e: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState('friendly_viewer'),
    [text, setText] = useState(''),
    [moderator, setModerator] = useState(false),
    [transcript, setTranscript] = useState(''),
    [feedback, setFeedback] = useState('');
  const command = text.trim().toLowerCase().startsWith('!bait ');
  const send = async (kind: string) => {
    try {
      if (kind === 'chat') {
        const r = await request<{ accepted: boolean; command: boolean }>(
          '/api/demo/chat',
          { name, text, moderator },
          csrf,
        );
        setFeedback(
          r.command
            ? 'Command received. Bot replies appear below when announcements are on.'
            : r.accepted
              ? 'Test chatter counted.'
              : 'Not counted: inactive, cooldown, duplicate chatter, or secret word spoiler.',
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
            ? 'Secret word matched. Community win recorded.'
            : 'No match. Only the exact secret word wins.',
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
            Open the viewer room in a separate tab to see the secret word. These inputs simulate
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
                  placeholder="A subtle nudge, !skip, or !bait help"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label className="rehearsal-check">
                <input
                  type="checkbox"
                  checked={moderator}
                  onChange={(e) => setModerator(e.target.checked)}
                />
                Send as a moderator
              </label>
              <Button className="secondary" disabled={game.phase !== 'active' && !command}>
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
          <div className="bot-preview">
            <h3>Chat bot preview</h3>
            {game.settings.chatBot ? (
              bot.recent.length ? (
                <BotPosts posts={bot.recent} />
              ) : (
                <p>Start a round. The bot’s posts appear here instead of Twitch chat.</p>
              )
            ) : (
              <p>Turn on Announce rounds in chat in Game settings to preview the bot here.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Community({ game: g }: { game: GameView }) {
  return (
    <>
      <dl className="community-scoreline">
        <div><dt>Chat wins</dt><dd>{g.score.wins}</dd></div>
        <div><dt>Best streak</dt><dd>{g.score.best}</dd></div>
        <div><dt>Rounds played</dt><dd>{g.score.played}</dd></div>
        <div><dt>Chatting now</dt><dd>{g.participants}</dd></div>
      </dl>
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
              </div>
              <p className="muted">
                Add a Browser Source in OBS, paste this URL and set it to 1920 × 1080. The
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
        <li>
          <ChatBotStep bot={studio.chatBot} game={game} />
        </li>
      </ol>
      <section className="privacy-panel">
        <ShieldCheck size={22} />
        <div>
          <h3>Your game data</h3>
          <p className="muted">
            baited stores settings, scores, participation and award counts. Recent chat hints stay
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

const postStatus: Record<ChatBotPost['status'], string> = {
  sent: 'Sent',
  preview: 'Preview',
  dropped: 'Held by Twitch',
  failed: 'Not sent',
};
function BotPosts({ posts }: { posts: ChatBotPost[] }) {
  return (
    <ul className="bot-posts" aria-label="Recent bot posts">
      {posts.map((post) => (
        <li key={post.id} className={cx('bot-post', `bot-post--${post.status}`)}>
          <time dateTime={new Date(post.at).toISOString()}>
            {new Date(post.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          <span className="bot-post__text">{post.text}</span>
          <span className="bot-post__status">{postStatus[post.status]}</span>
        </li>
      ))}
    </ul>
  );
}
function ChatBotStep({ bot, game }: { bot: ChatBotStatus; game: GameView }) {
  const on = game.settings.chatBot;
  const live = bot.mode === 'twitch' && bot.channelAllowed;
  const tag =
    bot.mode === 'demo'
      ? on
        ? 'Previewing'
        : 'Off'
      : bot.mode !== 'twitch'
        ? 'Not set up'
        : !bot.channelAllowed
          ? 'Needs permission'
          : on
            ? 'Posting'
            : 'Off';
  const tone =
    on && (live || bot.mode === 'demo')
      ? 'lime'
      : bot.mode === 'twitch' && !bot.channelAllowed
        ? 'amber'
        : 'muted';
  return (
    <section className="setup-step">
      <span className="setup-step-index" aria-hidden="true">
        05
      </span>
      <div className="setup-step-body">
        <div className="setup-step-heading">
          <h2>Add the chat bot</h2>
          <Tag tone={tone}>{tag}</Tag>
        </div>
        <p className="muted">
          {bot.mode === 'demo'
            ? 'The bot announces rounds, the last 10 seconds and results. In this demo its posts appear under Demo controls instead of Twitch chat.'
            : bot.mode === 'unconfigured'
              ? 'This server has no bot account. Its operator sets one up first; until then baited stays read-only in chat.'
              : bot.mode === 'unauthorized'
                ? 'The bot account is configured but has not signed in on this server yet.'
                : bot.channelAllowed
                  ? `${bot.name} posts in your chat with Twitch’s Chat Bot badge. Turn announcements on in Game settings.`
                  : `Allow ${bot.name} to post in your chat. Twitch asks you once; baited keeps reading chat as before.`}{' '}
          It never posts the word while a round is live, because you read your chat too.
        </p>
        {game.mode === 'twitch' && bot.mode === 'twitch' && !bot.channelAllowed && (
          <div className="connection-buttons">
            <Button className="primary" onClick={() => location.assign('/auth/twitch?bot=1')}>
              Allow the bot in your chat <ArrowUpRight size={16} />
            </Button>
          </div>
        )}
        <p className="setup-commands">
          Chat can type <code>!bait help</code>, <code>!bait score</code> and <code>!bait top</code>.
          With moderator commands on, mods can type <code>!bait start</code>,{' '}
          <code>!bait pause</code> and <code>!bait resume</code>.
        </p>
        {bot.problem && (
          <div className="notice">
            <AlertTriangle size={18} />
            <p>{bot.problem}</p>
          </div>
        )}
        {bot.recent.length > 0 && <BotPosts posts={bot.recent} />}
      </div>
    </section>
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
  const showCard = !stale && finished && !!g.result && ['caught', 'escaped'].includes(g.result.outcome) && now + offset.current - g.result.at < 5500;
  if (overlay)
    return <div className="obs-root">
      {!stale && <PublicAward award={g.history[0]?.award} />}
      <ObsHud game={g} timeLeft={fmt(ms)} now={now} offset={offset.current} offline={stale} showCard={showCard} />
      {showCard && g.result && <ResultCard key={`${g.result.id}:${g.result.outcome}`} result={g.result} broadcast age={now + offset.current - g.result.at} />}
    </div>;
  const playing = active || paused || settling;
  const visibleWord = stale ? undefined : playing ? g.round?.target : finished ? g.result?.word : undefined;
  const heading = stale ? 'Reconnecting.'
    : pendingCatch ? 'Catch pending.'
    : settling ? 'Checking final words.'
    : paused ? 'Round paused.'
    : active ? 'Make them say it.'
    : g.mission?.status === 'complete' ? 'Chat cleared the mission.'
    : g.mission?.status === 'failed' ? 'Time ran out.'
    : g.result?.reason === 'guess' && finished ? 'The streamer called it.'
    : won ? 'The streamer said it.'
    : finished ? 'A new word is next.' : 'The word is coming.';
  const detail = stale ? 'Waiting for a fresh game update.'
    : pendingCatch ? 'The streamer is checking what they heard.'
    : settling ? 'Only words spoken before the buzzer count.'
    : paused ? 'The clock and listening are stopped.'
    : active ? 'Don’t type it.'
    : g.mission?.status === 'complete' ? 'All three words landed before the timer.'
    : g.mission?.status === 'failed' ? `${g.mission.completed} of 3 words landed. Those wins still count.`
    : g.result?.reason === 'guess' && finished ? 'The private guess was right. The streamer escaped.'
    : won ? '+1 for chat.'
    : finished ? 'Wait for the streamer to start the next round.' : 'It appears here when the streamer starts a round.';
  const stateLabel = stale ? 'Reconnecting' : active ? 'Live' : paused ? 'Paused' : settling ? 'Checking' : pendingCatch ? 'Heard' : won ? 'Chat wins' : finished ? 'Round complete' : 'Waiting';
  return <div className={cx('viewer-page', 'viewer-room', playing && 'viewer-playing', stale && 'viewer-stale', active && ms <= 15000 && 'viewer-urgent')}>
    <header className="viewer-header">
      <a className="brand" href="https://baited.maff.app" aria-label="Baited website">{brand}</a>
      <Tag tone={active && !stale ? 'lime' : 'muted'}><span className="dot" />{g.mode === 'demo' ? 'Local demo' : `@${g.channel}`}</Tag>
    </header>
    <main className="viewer-main">
      {stale && <div className="error-banner" role="status"><Wifi size={16} />Connection lost. Waiting for a fresh game update.</div>}
      {!stale && <MissionStatus game={g} now={now} offset={offset.current} />}
      <div className="viewer-game">
        <div className="viewer-table">
          {visibleWord ? <section className={cx('target-card', won && 'target-win')} aria-label="Secret card">
            <div className="card-heading"><span className="small-label">{playing ? `Round ${g.round?.number}` : 'The reveal'}</span><Tag tone={active ? 'lime' : 'muted'}>{stateLabel}</Tag></div>
            <div className="target-display"><CardArt word={visibleWord} /><h2 data-word-size={wordSize(visibleWord)}>{visibleWord}</h2></div>
            {!stale && <ForbiddenClueCard game={g} />}
            <div className="viewer-timer">
              <span className="baited-glyph" aria-hidden="true" />
              <div><Timer size={16} /><span role={playing && !stale ? 'timer' : undefined} aria-label={playing && !stale ? spokenTime(ms, paused) : undefined}>{playing ? fmt(ms) : pendingCatch ? '—:—' : g.nextAt !== null ? fmt(Math.max(0, g.nextAt - (now + offset.current))) : '—:—'}</span><small>{settling ? 'Checking' : paused ? 'Paused' : pendingCatch ? 'Not scored yet' : finished ? g.nextAt !== null ? 'Next round' : 'Waiting' : 'Left'}</small></div>
            </div>
            <div className="viewer-progress"><i style={{ width: `${g.round ? Math.min(1, Math.max(0, ms / g.round.duration)) * 100 : 0}%` }} /></div>
          </section> : <div className="viewer-card-waiting"><div className="viewer-back"><CardBack /></div><p>{stale ? 'Waiting for updates.' : 'The word is coming.'}</p>{stale && <span className="viewer-stale-clock" aria-label="Timer unavailable while reconnecting">—:—</span>}</div>}
        </div>
        {!stale && <PublicAward award={g.history[0]?.award} />}
      </div>
      <aside className="viewer-support" aria-label="Round status and how to play">
        <div className="viewer-state"><h1>{heading}</h1><p>{detail}</p>
          {won && !stale && <p className="viewer-next">{g.nextAt !== null && g.nextAt > now + offset.current ? `Next round in ${fmt(g.nextAt - (now + offset.current))}` : 'Waiting for the streamer.'}</p>}
        </div>
        <ul className="viewer-playbook">
          <li><MessageSquare size={20} /><span>Steer the conversation.</span></li>
          <li><NoChat size={20} /><span>Keep the word and clues out of chat.</span></li>
          <li><Mic size={20} /><span>Only the streamer’s voice counts.</span></li>
        </ul>
        <p className="viewer-scoreline">{stale && <span>Last known: </span>}<strong>{g.score.wins}</strong> {g.score.wins === 1 ? 'chat win' : 'chat wins'} <span aria-hidden="true">·</span> streak <strong>{g.score.streak}</strong></p>
        <p className="viewer-skip">Skip <strong>{g.voters}/{g.voteThreshold}</strong><span>Type <code>!skip</code> in Twitch chat.</span></p>
        {g.mode === 'twitch' && <a className="button primary twitch-chat-link" href={`https://www.twitch.tv/${encodeURIComponent(g.channel)}`} target="_blank" rel="noreferrer"><MessageSquare size={18} />Back to Twitch chat<ArrowUpRight size={16} /></a>}
      </aside>
    </main>
    <footer className="viewer-footer"><span>baited</span><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></footer>
  </div>;
}

function Privacy() {
  return (
    <div className="viewer-page">
      <header className="viewer-header">
        <a className="brand" href="/">
          {brand}
        </a>
        <a className="text-button" href="/">
          Back to baited <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="privacy-copy">
        <div className="eyebrow">baited</div>
        <h1>Privacy</h1>
        <p>
          baited is an independent community game. The person running this server operates this
          instance.
        </p>
        <h2>Microphone audio</h2>
        <p>
          The streamer chooses whether to enable the microphone. The consent screen names the speech
          provider. With Moonshine, English recognition runs in the browser and only final text and
          word timing reach this server. With Deepgram, audio travels through this server to
          Deepgram. baited does not save audio or transcript text. Disabling the microphone, closing
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
          The streamer authorizes baited to read their channel’s chat, and optionally lets its bot
          account post there. For each word, baited keeps
          up to 40 eligible hints and 20 flagged hints in memory for a post-round award. The current
          word and the previous review can coexist. Each chatter has at most three clean hints and
          one flagged hint in that set. Raw text clears when the next round ends or ten minutes
          after its own round ends, whichever comes first. It is never written to disk. Hints are
          shown to the streamer only after the word is revealed.
        </p>
        <p>
          Channel identity, settings, results, participation and award counts are stored. Up to
          1,000 participant IDs and display names are retained per room; leading totals and the
          streamer’s selected award name appear publicly. Awards are manual picks. baited does not
          infer which hint caused a win or delete messages from Twitch.
        </p>
        <h2>Chat bot</h2>
        <p>
          If the streamer turns announcements on and allows the bot in their channel, a bot
          account run by this server’s operator posts round starts, timer reminders, results,
          scores and the streamer’s award pick in Twitch chat. It names chatters only in that award,
          in the top-baiters list the room already shows, and when replying to their own command.
          It never posts a word while its round is live, and it
          does not store what it posts beyond the last few messages shown in the streamer’s
          studio, which are kept in memory only.
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
          baited adds no advertising or analytics cookies.
        </p>
        <h2>Delete or disconnect</h2>
        <p>
          Streamers can use Stream setup → Delete my data to delete the room, scores, and stored
          Twitch authorization. You can also revoke baited in Twitch’s connection settings. For a
          participant record or other privacy request, contact the broadcaster whose room you
          joined.
        </p>
        <h2>Secret words</h2>
        <p>
          The viewer page intentionally reveals the target to anyone with its link, including a
          streamer who opens it. OBS links provide read-only game information. Keep studio sessions
          and server credentials private.
        </p>
        <p className="muted">Updated October 27, 2026.</p>
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
    if (!['play', 'overlay', 'privacy', 'speech-lab'].includes(path[0])) reload();
  }, [reload]);
  if (path[0] === 'privacy') return <Privacy />;
  if (path[0] === 'speech-lab') return <SpeechLab />;
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
        <p>Loading baited…</p>
      </div>
    );
  if (['card-design-lab', 'card-lab', 'card-proofs'].includes(path[0]))
    return <React.Suspense fallback={<div className="loading" role="status">Opening the card lab…</div>}><CardDesignLab session={session} /></React.Suspense>;
  if (path[0] === 'product-review')
    return (
      <React.Suspense fallback={<div className="loading" role="status">Opening design review…</div>}>
        <ProductReview session={session} />
      </React.Suspense>
    );
  return session.authenticated ? (
    <Dashboard key={session.csrf} session={session} reload={reload} />
  ) : (
    <Landing session={session} reload={reload} />
  );
}
createRoot(document.getElementById('root')!).render(<App />);
