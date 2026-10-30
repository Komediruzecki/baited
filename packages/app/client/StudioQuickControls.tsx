import React, { useState } from 'react';
import type { ChatBotStatus, Settings } from '../shared/types';

export type QuickSetting = 'auto' | 'chatBot';

/** These switches show saved state; a failed request never looks like a saved change. */
export function StudioQuickControls({ settings, bot, disabled, onChange }: {
  settings: Settings;
  bot: ChatBotStatus;
  disabled: boolean;
  onChange: (key: QuickSetting, enabled: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState<QuickSetting | null>(null);
  const [error, setError] = useState('');
  const botReady = bot.mode === 'demo' || (bot.mode === 'twitch' && bot.channelAllowed);
  const change = async (key: QuickSetting) => {
    if (disabled || pending) return;
    setPending(key);
    setError('');
    try { await onChange(key, !settings[key]); }
    catch { setError('Couldn’t save this change. Try again.'); }
    finally { setPending(null); }
  };
  return <div className="desk-quick-controls">
    <div className="desk-quick-switches" role="group" aria-label="Round shortcuts">
      {(['auto', 'chatBot'] as const).map(key => {
        const label = key === 'auto' ? 'Automatic rounds' : 'Baity announcements';
        const needsSetup = key === 'chatBot' && settings.chatBot && !botReady;
        const detail = pending === key ? 'Saving…' : needsSetup ? 'Needs setup' : settings[key] ? 'On' : 'Off';
        return <button key={key} type="button" role="switch" aria-label={label}
          aria-checked={settings[key]} aria-busy={pending === key || undefined}
          disabled={disabled || pending !== null}
          className="desk-quick-switch"
          title={key === 'auto' ? 'Start the next round after its cooldown. Your microphone must stay ready.'
            : needsSetup ? 'Announcements are enabled. Finish connecting Baity in Stream setup before it can post.'
            : 'Baity posts round announcements in your chat.'}
          onClick={() => void change(key)}>
          <span className="desk-quick-copy"><span>{key === 'auto' ? 'Auto rounds' : 'Baity'}</span><small>{detail}</small></span>
          <span className="desk-pixel-switch" aria-hidden="true"><span /></span>
        </button>;
      })}
    </div>
    {error && <small className="desk-quick-error" role="alert">{error}</small>}
  </div>;
}
