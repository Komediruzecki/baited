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
  'coffee',
  'chicken',
  'potato',
  'cookie',
  'rainbow',
  'football',
  'cheese',
  'sandwich',
  'birthday',
  'pancake',
  'dinosaur',
  'popcorn',
  'turtle',
  'bubble',
  'snowman',
  'pillow',
  'monkey',
  'bicycle',
  'avocado',
  'tornado',
  'waffle',
  'squirrel',
  'disco',
  'flamingo',
  'igloo',
  'compass',
  'marshmallow',
  'mermaid',
  'lighthouse',
  'mustache',
  'origami',
  'trampoline',
  'yogurt',
  'glacier',
  'platypus',
  'accordion',
  'kaleidoscope',
  'chandelier',
  'archipelago',
  'quicksand',
  'sundial',
  'gargoyle',
  'labyrinth',
  'bagpipes',
  'alchemy',
  'tumbleweed',
  'zeppelin',
  'sphinx',
  'catapult',
  'obelisk',
  'armadillo',
  'periscope',
  'tapestry',
  'wombat',
  'mushroom',
  'ghost',
  'donut',
  'hedgehog',
  'gramophone',
  'hourglass',
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

// Chat's win streak: consecutive community wins. Each tier is a badge, unlocked once
// per room and celebrated whenever a streak lands on it again.
export const streakTiers = Object.freeze(
  [
    { count: 2, name: 'Spark', art: 'flame', tone: 'ember' },
    { count: 3, name: 'Lit fuse', art: 'bomb', tone: 'amber' },
    { count: 5, name: 'On fire', art: 'blaze', tone: 'flame' },
    { count: 10, name: 'Eruption', art: 'volcano', tone: 'magma' },
    { count: 15, name: 'Dragonfire', art: 'dragon', tone: 'violet' },
    { count: 25, name: 'Liftoff', art: 'rocket', tone: 'cosmic' },
    { count: 50, name: 'Ultraviolet', art: 'ultraviolet', tone: 'gold' },
  ].map((tier) => Object.freeze(tier)),
);

/** The tier a streak of exactly this length lands on, if any. */
export function streakMilestone(count) {
  return streakTiers.find((tier) => tier.count === count) ?? null;
}

/** The next badge a streak of this length is heading for. */
export function nextStreakTier(count) {
  return streakTiers.find((tier) => tier.count > count) ?? null;
}

/** Five consecutive positions around the current streak, like a streak calendar. */
export function streakRow(count, size = 5) {
  const start = Math.max(1, count - 2);
  return Array.from({ length: size }, (_, i) => {
    const n = start + i;
    return {
      n,
      state: n < count ? 'won' : n === count ? 'current' : 'ahead',
      tier: streakMilestone(n),
    };
  });
}

/** Image for a tier's art: an `assets/` file name in the Extension, a site path elsewhere. */
export function streakArtFile(art, surface) {
  const card = { volcano: 'volcano', dragon: 'dragon', rocket: 'rocket' }[art];
  if (surface === 'extension')
    return card ? `card-${card}.png` : art === 'bomb' ? 'bait-bomb.png' : `streak-${art === 'ultraviolet' ? 'flame-violet' : art}.svg`;
  return card
    ? `/cards/proofs/${card}.png`
    : art === 'bomb'
      ? '/brand/bait-bomb.png'
      : `/brand/streak-${art === 'ultraviolet' ? 'flame-violet' : art}.svg`;
}
