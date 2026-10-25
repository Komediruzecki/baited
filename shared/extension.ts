import type { GameView } from './types.js';

export const EXTENSION_VERSION = '0.0.1' as const;

export interface ExtensionState {
  version: typeof EXTENSION_VERSION;
  configured: boolean;
  room: GameView | null;
}

export interface ExtensionConfiguration {
  version: typeof EXTENSION_VERSION;
  connected: boolean;
  channelId: string;
  channelName: string | null;
  studioUrl: string;
}

export type ExtensionErrorCode =
  | 'extension_unavailable'
  | 'extension_authorization'
  | 'extension_origin'
  | 'extension_role'
  | 'extension_rate_limit';

export interface ExtensionError {
  error: string;
  code: ExtensionErrorCode;
}
