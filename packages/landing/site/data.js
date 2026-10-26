// The approved showcase deck. Targets and clue order mirror server/cards.ts.
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
].map(([word, difficulty, clues, question], index) => ({
  word,
  difficulty,
  clues,
  question,
  index,
  art: `/cards/proofs/${word}.png`,
}))

export const chapters = [
  {
    time: 2.5,
    label: 'The deal',
    text: 'Chat gets VOLCANO. LAVA and ERUPTION are off limits. Moss keeps building a hut beside a smoking mountain.',
  },
  {
    time: 5.8,
    label: 'Two screens',
    text: 'Viewers see the word. The streamer’s studio keeps it hidden while the round is live.',
  },
  {
    time: 10.4,
    label: 'Chat steers',
    text: 'fernbrake: “build your hut RIGHT next to it, best view.” Moss: “Why does everyone care about my view? It’s a nice mountain.”',
  },
  {
    time: 16.5,
    label: 'The dodge',
    text: 'Moss: “Nope. I’m not naming the spicy mountain.” deadlinedog says LAVA, an off-limits clue. Their hint cannot receive the streamer’s pick.',
  },
  {
    time: 19.7,
    label: 'The slip',
    text: 'The mountain erupts in the fictional game. Moss: “THE VOLCANO IS GOING OFF!” The round stops for review. This is not a scored win yet.',
  },
  {
    time: 22.3,
    label: 'The catch',
    text: 'The streamer checks what Moonshine heard and presses Confirm catch. Only then does chat win the round.',
  },
  {
    time: 30.3,
    label: 'The pick',
    text: 'The streamer gives fernbrake’s clean hint the credit. The hint containing LAVA stays ineligible.',
  },
]

// Literal checker shared in behavior with server/game.ts. This is not speech recognition.
export const tokens = (text) =>
  text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []
export function clueMatches(text, clue) {
  const variants = new Set([clue, `${clue}s`, `${clue}es`, ...(clue.endsWith('y') ? [`${clue.slice(0, -1)}ies`] : [])])
  return tokens(text).some((token) => variants.has(token.replace(/['’]s$/, '')))
}
export function checkHint(text, card) {
  if (text.length > 200) return { kind: 'long', message: 'Keep this practice hint under 200 characters.' }
  if (tokens(text).includes(card.word))
    return {
      kind: 'target',
      message: "That's the word itself. A hint that says it can't win the streamer's pick.",
    }
  const clue = card.clues.find((candidate) => clueMatches(text, candidate))
  if (clue)
    return {
      kind: 'clue',
      clue,
      message: `“${clue[0].toUpperCase()}${clue.slice(1)}” is off limits on this card. Chat can still win, but this hint can't get the streamer's pick.`,
    }
  return {
    kind: 'clean',
    message: "Clean bait. If they say it, this one could win the streamer's pick.",
  }
}
