export const proofWords: readonly [
  'banana',
  'penguin',
  'microwave',
  'dragon',
  'volcano',
  'monocle',
  'pizza',
  'robot',
  'rocket',
  'pirate',
  'cactus',
  'jellyfish',
  'telescope',
  'saxophone',
  'octopus',
  'boomerang',
  'narwhal',
  'parachute',
];
export function cardArtFile(word?: string): string | null;
export function wordSize(word?: string): 'short' | 'medium' | 'long' | 'extended';
export function winLabel(wins: number): string;
