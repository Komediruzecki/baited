import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Eye, MessageSquare, Mic, ShieldCheck, X } from './icons';
import type { Phase, SpeechProvider } from '../shared/types';
import { authorizeEdgeBot, canAuthorizeEdgeBot, isEdgeRuntime } from './api';

export const productBrand = (
  <span className="product-brand" role="img" aria-label="BAITED">
    <span className="baited-glyph" aria-hidden="true" />
  </span>
);

export const brand = (
  // Legacy example layouts set --logo-width on this wrapper. Keep their measured
  // footprint while sharing the same pixel wordmark as the product surfaces.
  <span className="logo-lockup" role="img" aria-label="BAITED">
    <span className="baited-glyph" aria-hidden="true" style={{ height: '100%' }} />
  </span>
);
/** Outcomes of the operator's one-time bot account sign-in, shown on return from Twitch. */
export const botNotices = {
  ready: 'The bot account is connected. Streamers can now turn on chat announcements in Game settings.',
  errors: {
    'bot-account':
      'That Twitch account is not the bot account this server expects. Sign in as the bot account, in a private window if you are signed in as a streamer.',
    'bot-setup':
      'This server has no bot account configured. Set TWITCH_BOT_USER_ID, then sign in as the bot.',
    'bot-oauth':
      'The bot account sign-in did not finish. Sign in as the bot account again.',
    'bot-declined':
      'Baity stopped posting in your chat: you signed in without the bot permission. Allow the bot in Stream setup to bring Baity back.',
    'bot-as-streamer':
      "That is the chat bot's Twitch account. Sign in with the streamer's account, in a private window if Twitch keeps picking the bot.",
  } as Record<string, string>,
};
/** Notices whose fix is the operator signing in as the bot account again. */
const botRetryNotices = new Set(['bot-oauth', 'bot-account']);
export function BotSignInLink({ notice }: { notice: string }) {
  if (!botRetryNotices.has(notice) || isEdgeRuntime()) return null;
  return (
    <a className="button secondary bot-signin-link" href="/auth/twitch/bot">
      Sign in as the bot account <ArrowUpRight size={16} />
    </a>
  );
}
export function EdgeBotSignInButton({ phase }: { phase: Phase }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!canAuthorizeEdgeBot()) return null;
  const running = ['active', 'paused', 'settling'].includes(phase);
  return <div className="connection-buttons">
    <Button className="primary" disabled={busy || running} onClick={() => {
      setBusy(true); setError('');
      void authorizeEdgeBot().then((url) => location.assign(url)).catch(() => {
        setBusy(false); setError('The bot sign-in could not start. Try again.');
      });
    }}>{busy ? 'Opening Twitch…' : 'Connect the bot account'} <ArrowUpRight size={16} /></Button>
    <p className="muted">{running ? 'Finish the round before connecting the bot.' : 'Sign in as Baity on Twitch. Your streamer account stays connected.'}</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
/**
 * Allowing the bot is a Twitch round trip that replaces the studio session. A running round would
 * lose its microphone lease and pause, so the button waits until the round is over.
 */
export function AllowBotButton({ phase }: { phase: Phase }) {
  const running = phase === 'active' || phase === 'paused' || phase === 'settling';
  return (
    <div className="connection-buttons">
      <Button
        className="primary"
        disabled={running}
        aria-describedby={running ? 'allow-bot-wait' : undefined}
        onClick={() => location.assign(isEdgeRuntime() ? '/auth/twitch' : '/auth/twitch?bot=1')}
      >
        Allow the bot in your chat <ArrowUpRight size={16} />
      </Button>
      {running && (
        <p id="allow-bot-wait" className="muted">
          Finish the round first. Allowing the bot signs you in again, which turns off your microphone and
          pauses the round.
        </p>
      )}
    </div>
  );
}
export function Button({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Tag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
/** A chat command as viewers type it: the command word in lilac, anything after it in yellow. */
export function ChatCommand({ children }: { children: string }) {
  const [word, ...rest] = children.split(' ');
  return (
    <code className="chat-command">
      <span className="chat-command-word">{word}</span>
      {rest.length > 0 && ` ${rest.join(' ')}`}
    </code>
  );
}
export function CopyButton({ value, label = 'Copy link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  return (
    <button
      className="copy-button"
      data-state={copied ? 'copied' : error ? 'error' : undefined}
      aria-label={label}
      title={error ? 'Select the link and copy it manually.' : label}
      onClick={() => {
        if (!navigator.clipboard?.writeText) {
          setError(true);
          return;
        }
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setError(false);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => setError(true));
      }}
    >
      {copied ? <Check size={18} /> : <Copy size={18} />}
      <span aria-live="polite">{copied ? 'Copied' : error ? 'Select link' : label}</span>
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(event) => {
        // Parents may keep a dialog open while a request is in flight.
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function HowTo({ speechProvider }: { speechProvider: SpeechProvider }) {
  return (
    <div className="how-to">
      <p className="rules-goal">Make the streamer say the secret word.</p>
      {[
        [
          '01',
          'Chat gets the word.',
          isEdgeRuntime() ? 'Viewers open the Baited Extension on Twitch. Studio and OBS keep the word hidden.' : 'Share the viewer link. The studio and OBS keep the word hidden.',
          Eye,
        ],
        [
          '02',
          'Chat drops hints.',
          'Ask questions in Twitch chat. Keep the secret word and off-limits clues out of chat.',
          MessageSquare,
        ],
        [
          '03',
          'You say it. Chat wins.',
          speechProvider === 'moonshine'
            ? 'Enable your microphone. When speech recognition hears the whole word, the clock stops. Reject a misheard catch within 15 seconds, or chat wins. Outlast the clock to escape.'
            : 'Enable your microphone. Chat wins when speech recognition hears the whole word. Outlast the clock to escape.',
          Mic,
        ],
      ].map(([n, title, description, Icon]) => {
        const I = Icon as typeof Eye;
        return (
          <div className="how-step" key={n as string}>
            <span className="how-number">{n as string}</span>
            <div>
              <h3>{title as string}</h3>
              <p>{description as string}</p>
            </div>
            <I size={24} />
          </div>
        );
      })}
      <details className="how-options">
        <summary>Optional rules</summary>
        <ul>
          <li>
            <strong>Off-limits clues:</strong> Easy: none. Medium: two. Hard: four. Disguised
            spellings count too. A flagged hint can’t win an award. The round continues.
          </li>
          <li>
            <strong>Three-word mission:</strong> Land three words on one clock. Gaps count. Pause
            freezes it; a skip replaces the word.
          </li>
          <li>
            <strong>Call the bait:</strong> One private typed guess per word. Correct: escape the
            round and mission, unless optional Baity chaos intervenes. Wrong: chat gets +15 seconds.
          </li>
          <li>
            <strong>Baity chaos:</strong> Optional and off by default. At 3+ chat wins in a row, a correct guess has a 1 in 4 chance to give chat the win. At most once per session. The result names Baity’s intervention, and the streamer can reverse it.
          </li>
          <li>
            <strong>You baited me:</strong> After a win, the streamer can award one eligible hint.
            Baity’s gifted wins cannot receive an award. The community keeps the shared win; the chatter gets a sting on stream and a spot on
            the Bait MVPs board.
          </li>
        </ul>
      </details>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>Play along: no peeking, no spoilers. Wrong detection? Reverse the win in Studio before the next round starts.</p>
      </div>
    </div>
  );
}
