import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, MessageSquare, Mic, ShieldCheck, X } from './icons';

export const productBrand = (
  <span className="product-brand" role="img" aria-label="BAITED">
    <span className="baited-glyph" aria-hidden="true" />
  </span>
);

export const brand = (
  // Legacy example layouts set --logo-width on this wrapper. Keep their measured
  // footprint while sharing the same original wordmark as the product surfaces.
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
    'bot-declined':
      'Baity stopped posting in your chat: you signed in without the bot permission. Allow the bot in Stream setup to bring Baity back.',
  } as Record<string, string>,
};
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
export function CopyButton({ value, label = 'Copy link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  return (
    <button
      className="copy-button"
      aria-label={label}
      title={error ? 'Select the link and copy it manually.' : label}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
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
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function HowTo() {
  return (
    <div className="how-to">
      <p className="rules-goal">Make the streamer say the secret word.</p>
      {[
        [
          '01',
          'Chat gets the word.',
          'Share the viewer link. The studio and OBS keep the word hidden.',
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
          'Enable your mic. Local speech proposes a catch when it hears the whole word; confirm it to give chat the win. Outlast the clock to escape.',
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
            round and mission. Wrong: chat gets +15 seconds.
          </li>
          <li>
            <strong>You baited me:</strong> After a win, the streamer can award one eligible hint.
            The community keeps the shared win; the chatter gets a sting on stream and a spot on
            the Bait MVPs board.
          </li>
        </ul>
      </details>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>Play along: no peeking, no spoilers. Wrong detection? Reverse the win in your studio.</p>
      </div>
    </div>
  );
}
