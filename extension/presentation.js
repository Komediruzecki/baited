// Shared presentation only. Never select a secret or infer one from a round ID.
export const proofWords = Object.freeze([
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
]);
const artWords = new Set(proofWords);

export function cardArtFile(word) {
  if (typeof word !== 'string' || !artWords.has(word.toLowerCase())) return null;
  return `card-${word.toLowerCase()}.png`;
}

export function wordSize(word = '') {
  const length = Array.from(word).length;
  return length <= 9 ? 'short' : length <= 13 ? 'medium' : length <= 18 ? 'long' : 'extended';
}

export function winLabel(wins) {
  return `${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;
}
