import { helpText, scoreText, streakText, topText, whoText, type ChatCommand } from '../../app/server/chat-copy.js';

/** Public replies use the same parser and copy as the Studio's local game. */
export const botReplyText = Object.freeze({help:helpText,score:scoreText,streak:streakText,top:topText,who:whoText});
export type BotReplyCommand = keyof typeof botReplyText;
export const isBotReplyCommand = (command: ChatCommand | null): command is BotReplyCommand =>
  command !== null && Object.hasOwn(botReplyText,command);
