import { expansion } from './card-expansion.js'

// The complete authored catalogue. Builds publish ten fixed examples through
// scripts/public-samples.mjs. Targets and clue order mirror server/cards.ts.
// Questions are editorial examples, not dialogue sent to Twitch.
export const cards = [
  ['volcano', 'medium', ['lava', 'eruption'], 'Where would you definitely not build a house?'],
  ['banana', 'easy', [], 'What do cartoon characters slip on?'],
  ['monocle', 'hard', ['eye', 'lens', 'glasses', 'single'], 'What does a fancy villain squint through?'],
  ['penguin', 'medium', ['bird', 'ice'], 'Who would win a belly-slide race?'],
  ['dragon', 'easy', [], 'What would you put in charge of a castle?'],
  ['boomerang', 'hard', ['throw', 'return', 'australia', 'curved'], "What's the worst thing to toss away?"],
  ['microwave', 'medium', ['heat', 'oven'], 'How do you rescue cold leftovers?'],
  ['pizza', 'easy', [], 'What would you order for the whole chat?'],
  ['narwhal', 'hard', ['whale', 'tusk', 'arctic', 'unicorn'], 'Which sea creature has a horn on its face?'],
  ['cactus', 'medium', ['desert', 'plant'], "What's the worst thing to hug?"],
  ['robot', 'easy', [], 'Who should do the chores while you stream?'],
  ['parachute', 'hard', ['jump', 'skydiving', 'canopy', 'fall'], 'What would you double-check before leaving the plane?'],
  ['jellyfish', 'medium', ['ocean', 'sting'], 'What looks like a swimming lava lamp?'],
  ['rocket', 'easy', [], 'What carries a crew beyond the atmosphere?'],
  ['telescope', 'medium', ['stars', 'space'], 'How would you get a closer look at Saturn?'],
  ['pirate', 'easy', [], 'Who says arr and wears a tricorn?'],
  ['saxophone', 'medium', ['jazz', 'instrument'], 'What would you play in a smoky club at 2 a.m.?'],
  ['octopus', 'medium', ['tentacles', 'eight'], 'Who could hold every controller at once?'],
  ...expansion,
].map(([word, difficulty, clues, question], index) => ({
  word,
  difficulty,
  clues,
  question,
  index,
  art: `/cards/proofs/${word}.png`,
}))

// The trailer's moments: where the arrow keys skip to, and what the still frames show
// (media/chapter-NN.avif) when the film does not play.
export const chapters = [
  {
    time: 2,
    label: 'The deal',
    text: 'Chat gets BIRTHDAY. The streamer only sees the back of the card, and chat has two minutes to make him say it.',
  },
  {
    time: 5.3,
    label: 'Lock in',
    text: 'bateoh: “Ayy, LOCK IN, CHAT! It’s gon’ be straight cinema.” Chat swears to act natural.',
  },
  {
    time: 8.9,
    label: 'The gift',
    text: 'Reaper gifts ten subs: “happy special day king.” bateoh: “…What special day?”',
  },
  {
    time: 18.4,
    label: 'Cake',
    text: 'Chat spams make a wish and cake. bateoh: “Hold up. Why’s chat spamming cake?”',
  },
  {
    time: 20.4,
    label: 'Calling the bait',
    text: 'bateoh calls the bait: CAKE. Wrong, so chat gets fifteen more seconds.',
  },
  {
    time: 29.7,
    label: 'The slip',
    text: 'bateoh: “It ain’t even my BIRTHDAY!” …oh no. That was the word, and Baity checks the catch.',
  },
  {
    time: 34.2,
    label: 'They said it',
    text: 'Chat wins, two in a row, and the streamer’s pick is Reaper. bateoh: “Reaper… you SNAKE.”',
  },
]
