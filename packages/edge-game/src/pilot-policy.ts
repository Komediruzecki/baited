/** Small, explicit pilot limits. Invalid configuration fails closed. */
export interface PilotEnv {
  EDGE_PILOT_ENABLED?: string;
  EDGE_MAX_CHANNELS?: string;
  EDGE_MAX_PARTICIPANTS?: string;
  EDGE_MAX_VIEWER_SOCKETS?: string;
  EDGE_CHAT_EVENTS_PER_MINUTE?: string;
  EDGE_CHANNEL_LOGIN_ALLOWLIST?: string;
  EDGE_PUBLIC_ORIGIN?: string;
  EDGE_PILOT_SECRET_B64?: string;
}
function setting(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw new Error('Invalid pilot limit.');
  return Number(value);
}
export function pilotLimits(env: PilotEnv) {
  return {
    channels: setting(env.EDGE_MAX_CHANNELS, 3, 10),
    participants: setting(env.EDGE_MAX_PARTICIPANTS, 100, 100),
    viewerSockets: setting(env.EDGE_MAX_VIEWER_SOCKETS, 100, 200),
    chatPerMinute: setting(env.EDGE_CHAT_EVENTS_PER_MINUTE, 600, 1200),
    controlsPerMinute: 120,
    joinsPerMinute: 120,
    stateReadsPerMinute: 120,
    microphoneLeaseMs: 30_000,
    speechGapMs: 2_500,
  };
}
export const INITIAL_CHANNEL_LOGINS = ['komediruzecki7', 'lakeeko', 'yahwehwastaken'] as const;
export function pilotLogins(env: PilotEnv): string[] {
  const values = (env.EDGE_CHANNEL_LOGIN_ALLOWLIST ?? INITIAL_CHANNEL_LOGINS.join(',')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (values.length > pilotLimits(env).channels || new Set(values).size !== values.length || values.some(v => !/^[a-z0-9_]{1,25}$/.test(v))) throw new Error('Invalid channel allowlist.');
  return values;
}
