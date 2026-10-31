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
  'balloon',
  'guitar',
  'carrot',
  'cupcake',
  'umbrella',
  'elephant',
  'hamburger',
  'butterfly',
  'pineapple',
  'crocodile',
  'astronaut',
  'binoculars',
  'seahorse',
  'hammock',
  'scarecrow',
  'waterfall',
  'chameleon',
  'metronome',
  'terrarium',
  'pendulum',
  'pomegranate',
  'marionette',
]);
// Artwork for prepared recording rounds, without expanding the normal deck.
export const recordingArtWords = Object.freeze(['bait']);
export const illustratedWords = Object.freeze([...proofWords, ...recordingArtWords]);
const artWords = new Set(illustratedWords);

export function cardArtFile(word) {
  if (typeof word !== 'string' || !artWords.has(word.toLowerCase())) return null;
  return `card-${word.toLowerCase()}.png`;
}

const artUuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const roundArtPath = new RegExp(`^/api/card-art/round/[A-Za-z0-9_-]{1,128}/${artUuid}/${artUuid}/[A-Za-z0-9_-]{43}\\.png$`);
const ownerArtPath = new RegExp(`^/api/studio/card-art/${artUuid}\\.png$`);

/** Uploaded art is a server capability, never an arbitrary URL or filename. */
export function cardArtPath(value, allowPreview = false) {
  if (typeof value !== 'string' || value.length > 340 || value !== value.trim()) return null;
  return roundArtPath.test(value) || (allowPreview && ownerArtPath.test(value)) ? value : null;
}

/** `apiOrigin` comes only from validated runtime configuration, never round data. */
export function cardArtSource(value, apiOrigin, allowPreview = false) {
  const path = cardArtPath(value, allowPreview);
  if (!path) return null;
  if (apiOrigin === undefined) return path;
  try {
    const origin = new URL(apiOrigin);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash) return null;
    return `${origin.origin}${path}`;
  } catch { return null; }
}

export function wordSize(word = '') {
  const length = Array.from(word).length;
  return length <= 9 ? 'short' : length <= 13 ? 'medium' : length <= 18 ? 'long' : 'extended';
}

/**
 * A card face's word size, as on the landing: a word over ten letters steps down once.
 * Longer words outside the deck step down again so a small card never breaks one.
 */
export function cardWordSize(word = '') {
  const length = Array.from(word).length;
  return length <= 10 ? 'short' : length <= 13 ? 'medium' : length <= 18 ? 'long' : 'extended';
}

export function winLabel(wins) {
  return `${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;
}

/**
 * The Glass finish's ruled light at 60°, as on the landing, for a 300 × 420 view box.
 * Keep in parity with client/CardGlass.tsx and packages/landing/selected-cards.
 */
export function glassRules(pitch = 12) {
  const [nx, ny, reach] = [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 1200];
  let path = '';
  for (let step = 0; step * pitch <= nx * 400 + ny * 760; step++) {
    const [x, y] = [nx * step * pitch, ny * step * pitch];
    path += `M${(x - ny * reach).toFixed(2)} ${(y + nx * reach).toFixed(2)}L${(x + ny * reach).toFixed(2)} ${(y - nx * reach).toFixed(2)}`;
  }
  return path;
}

// Chat's win streak: consecutive community wins. Each tier is a fire badge, unlocked once
// per room and celebrated whenever a streak lands on it again.
export const streakTiers = Object.freeze(
  [
    { count: 2, name: 'Spark', art: 'flame', tone: 'ember' },
    { count: 3, name: 'Heating up', art: 'twin', tone: 'amber' },
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

const flameFiles = { flame: 'streak-flame.svg', twin: 'streak-twin.svg', blaze: 'streak-blaze.svg', ultraviolet: 'streak-flame-violet.svg' };

/** Image for a tier's art: an `assets/` file name in the Extension, a site path elsewhere. */
export function streakArtFile(art, surface) {
  const card = { volcano: 'volcano', dragon: 'dragon', rocket: 'rocket' }[art];
  if (surface === 'extension') return card ? `card-${card}.png` : flameFiles[art];
  return card ? `/cards/proofs/${card}.png` : `/brand/${flameFiles[art]}`;
}

/** Every flame the Extension ships. */
export const streakFlameFiles = Object.freeze(Object.values(flameFiles));
