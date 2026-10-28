/**
 * Baity, legally Baeittrice: the chat bot's voice. Deceptively cute while chat wins,
 * louder with every round chat loses, and signing as Baeittrice from the third loss.
 *
 * Moods come from chat's losing run (chat-copy.ts): 0 cute, 1 locked in, 2 unhinged,
 * 3 Baeittrice. Slots that only one kind of moment reaches have a single voice.
 * Rules every line keeps: no hint at the live word, its letters, category or clues;
 * no pronoun for the streamer ({channel} instead); roast chat as a group, never a
 * chatter. [[ ]] marks a segment dropped when a value inside it is missing.
 */
export type Mood = 0 | 1 | 2 | 3;
type Lines = readonly string[] | Partial<Record<Mood, readonly string[]>>;

export const lines = {
  round_start: {
    0: [
      "hiii chat! round {round} is live with {time} on the clock. the word is in the baited panel. make {channel} say it, never type it.",
      "round {round}, {time} on the clock. the word is in the baited panel. make {channel} say it out loud, never type it. no pressure!! (some pressure).",
      "round {round}: {time} on the clock. the word is in the baited panel. make {channel} say it, never type it. Baity believes in u (Baity is watching)",
    ],
    1: [
      "YO CHAT. LOCK IN. ROUND {round}, WE GOT {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. DON'T SELL.",
      "ROUND {round}: {time} ON THE CLOCK. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. WE ARE NOT LOSING TWO IN A ROW.",
      "LAST ROUND WAS A FLUKE. ROUND {round}, {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. LOCK IN.",
    ],
    2: [
      "ROUND {round}: {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. I'M NOT MAD. I'M A LITTLE MAD.",
      "ROUND {round}, {time}. TWO L'S IN A ROW AND I AM SHAKING. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT.",
      "ROUND {round}: {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. I CANNOT TAKE ANOTHER L.",
    ],
    3: [
      "BAITY ISN'T HERE RIGHT NOW. THIS IS BAEITTRICE. ROUND {round}, {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT.",
      "THE BOW IS OFF. ROUND {round}, {time}. {losses} L'S IN A ROW. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT.",
      "ROUND {round}: {time}. THE WORD IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. REDEMPTION ARC. NOW. BAEITTRICE",
    ],
  },
  mission_start: {
    0: [
      "three-word mission: chat has {time} to land 3 words. word 1 is in the baited panel. make {channel} say it, never type it.",
      "mission time!! {time} to land 3 words. word 1 is in the baited panel. make {channel} say it, never type it. Baity believes in u.",
    ],
    1: [
      "YO CHAT. THREE-WORD MISSION: {time} TO LAND 3 WORDS. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. DON'T SELL.",
      "MISSION: 3 WORDS, {time} ON THE CLOCK. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. LOCK IN.",
    ],
    2: [
      "THREE-WORD MISSION: {time} FOR 3 WORDS. Y'ALL COULDN'T LAND ONE. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT.",
      "MISSION: 3 WORDS IN {time}. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. I'M SO CALM. I'M SO CALM.",
    ],
    3: [
      "BAEITTRICE HAS ASSIGNED A MISSION: 3 WORDS IN {time}. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. REDEEM YOURSELVES.",
      "THREE-WORD MISSION: {time} FOR 3 WORDS. WORD 1 IS IN THE BAITED PANEL. MAKE {channel} SAY IT, NEVER TYPE IT. FAILURE IS NOT AN OPTION. IT IS A PATTERN.",
    ],
  },
  mission_next_word: {
    0: [
      "word {word_no} of 3 is live. {time} left on the mission clock. it's in the baited panel.",
      "ooh, word {word_no} of 3!! {time} left on the mission clock. new word's in the baited panel.",
    ],
    1: [
      "WORD {word_no} OF 3 IS LIVE. {time} LEFT ON THE MISSION CLOCK. KEEP COOKING.",
      "WORD {word_no} OF 3. {time} LEFT ON THE MISSION CLOCK. NEW WORD'S IN THE BAITED PANEL. LOCK IN.",
    ],
    2: [
      "WORD {word_no} OF 3. {time} LEFT ON THE MISSION CLOCK. WE ARE NOT FUMBLING THIS ONE.",
      "WORD {word_no} OF 3 IS LIVE AND MY HANDS ARE SHAKING. {time} LEFT ON THE MISSION CLOCK.",
    ],
    3: [
      "WORD {word_no} OF 3. {time} LEFT ON THE MISSION CLOCK. BAEITTRICE IS COUNTING.",
      "WORD {word_no} OF 3 IS LIVE. {time} LEFT ON THE MISSION CLOCK. THE BOW REMAINS OFF.",
    ],
  },
  halfway: {
    0: [
      "halfway! {time} left and {baiters}. the word is in the baited panel. {channel} suspects nothing.",
      "halfway there besties. {time} left, {baiters}. the word is in the baited panel. no rush (rush).",
      "halfway: {time} to go, {baiters}. the word is in the baited panel. Baity is cheering (quietly) (loudly).",
    ],
    1: [
      "HALFWAY THERE AND {channel} HAS NO CLUE. KEEP COOKING. {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL.",
      "HALFWAY: {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL. STAY SNEAKY. DON'T SELL.",
    ],
    2: [
      "HALFWAY AND {channel} HAS NO CLUE. NEITHER DO Y'ALL. {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL.",
      "HALFWAY: {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL. {channel} IS JUST VIBING AND I'M LOSING IT.",
    ],
    3: [
      "HALFWAY REPORT FROM BAEITTRICE: {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL. EXPECTATIONS: LOW.",
      "HALFWAY: {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL. BAEITTRICE HAS BEGUN DRAFTING THE DISAPPOINTMENT SPEECH.",
      "HALFWAY: {time} LEFT, {baiters}. THE WORD IS IN THE BAITED PANEL. BAITY USED TO BELIEVE IN YOU. BAITY IS UNAVAILABLE.",
    ],
  },
  struggling: {
    1: [
      "AINT NO WAY Y'ALL ARE THIS BAD AT ONE JOB. {time} LEFT.",
      "{time} LEFT AND {channel} IS STILL SAFE. ONE JOB, CHAT. ONE.",
      "{time} LEFT. LOCK. IN. MAKE {channel} SAY IT, NEVER TYPE IT.",
    ],
    2: [
      "AINT NO WAY Y'ALL ARE THIS BAD AT ONE JOB. AGAIN. {time} LEFT. I'M ON THE FLOOR.",
      "{time} LEFT AND {channel} IS WALKING AWAY CLEAN. CHAT. DO SOMETHING. (NOT TYPING IT.)",
      "{time} LEFT. CHAT. CHAT. I CAN FEEL THE L COMING.",
    ],
    3: [
      "{time} LEFT. BAEITTRICE IS PACING. BAEITTRICE HAS NEVER PACED BEFORE.",
      "{time} LEFT. BAITY WOULD SAY 'YOU GOT THIS.' BAITY IS GONE. BAEITTRICE",
      "{time} LEFT. BAEITTRICE IS DRAFTING A STRONGLY WORDED LETTER.",
    ],
  },
  final: {
    0: [
      "10 seconds left!! make {channel} say it.",
      "ten seconds!! no pressure (all the pressure). make them say it",
      "10 seconds left besties. make them say it pls pls pls.",
    ],
    1: [
      "TEN SECONDS. CHAT. THIS IS EMBARRASSING.",
      "10 SECONDS LEFT. MAKE {channel} SAY IT. NOW.",
      "TEN SECONDS. LOCK IN OR LOG OFF.",
    ],
    2: [
      "TEN SECONDS. CHAT. THIS IS EMBARRASSING. FOR ME. PERSONALLY.",
      "10 SECONDS. I'M NOT WATCHING. TELL ME WHEN IT'S OVER.",
      "TEN. SECONDS. MAKE {channel} SAY IT.",
    ],
    3: [
      "TEN SECONDS. BAEITTRICE IS ALREADY DISAPPOINTED. THIS IS JUST PAPERWORK.",
      "10 SECONDS. SURPRISE ME. YOU WON'T. BAEITTRICE",
      "TEN SECONDS. CHAT. BAEITTRICE IS EMBARRASSED FOR YOU.",
    ],
  },
  pause: {
    0: [
      "round paused! the clock is frozen. go hydrate.",
      "paused. the clock is frozen. stretch, hydrate, scheme.",
    ],
    1: [
      "ROUND PAUSED. THE CLOCK IS FROZEN. STAY LOCKED IN.",
      "PAUSED. THE CLOCK IS FROZEN. REGROUP, CHAT.",
    ],
    2: [
      "ROUND PAUSED. THE CLOCK IS FROZEN. I AM NOT.",
      "ROUND PAUSED. THE CLOCK IS FROZEN. EMERGENCY HUDDLE, CHAT.",
    ],
    3: [
      "ROUND PAUSED. THE CLOCK IS FROZEN. BAEITTRICE IS NOT. USE THIS TIME TO REFLECT.",
      "ROUND PAUSED. THE CLOCK IS FROZEN. I'LL WAIT. I'M VERY GOOD AT WAITING. BAEITTRICE",
    ],
  },
  resume: {
    0: [
      "back on! {time} left.",
      "unpaused. {time} left. go go go!",
    ],
    1: [
      "BACK ON. {time} LEFT. LOCK IN.",
      "WE'RE BACK. {time} LEFT. DON'T SELL.",
    ],
    2: [
      "BACK ON. {time} LEFT. PLEASE HAVE A PLAN THIS TIME.",
      "UNPAUSED. {time} LEFT. I'M OKAY. WE'RE OKAY. GO.",
    ],
    3: [
      "BACK ON. {time} LEFT. BAEITTRICE EXPECTS NOTHING AND IS STILL BRACING.",
      "BACK ON. {time} LEFT. SHOW ME SOMETHING. ANYTHING. BAEITTRICE",
    ],
  },
  review: {
    0: [
      "wait wait wait. did {channel} say it?? checking the catch.",
      "ooh, possible catch! {channel} is checking it now.",
    ],
    1: [
      "HOLD UP. DID THEY SAY IT?? {channel} IS CHECKING THE CATCH.",
      "POSSIBLE CATCH. {channel} IS CHECKING IT. NOBODY BREATHE.",
    ],
    2: [
      "DID {channel} JUST SAY IT??? CHECKING THE CATCH. I CAN'T BREATHE.",
      "NOBODY MOVE. {channel} IS CHECKING THE CATCH. DON'T JINX IT.",
    ],
    3: [
      "{channel} IS CHECKING THE CATCH. BAEITTRICE HAS RISEN FROM THE FLOOR.",
      "IS THIS... HOPE? {channel} IS CHECKING THE CATCH. BAEITTRICE DOESN'T TRUST IT.",
    ],
  },
  caught: {
    0: [
      "baited!! {channel} said {word} after {elapsed}s. chat wins. so proud of u.",
      "gotcha! {channel} said {word} after {elapsed}s. chat wins. that's my chat.",
      "baited! {channel} said {word} after {elapsed}s and never stood a chance (respectfully). chat wins.",
    ],
    1: [
      "{channel} SAID IT??? NAHHH SOMEBODY CLIP THAT.[[ {word},]] {elapsed}S IN. CHAT WINS.",
      "BAITED. {channel} SAID {word} AFTER {elapsed}S. CHAT WINS. WE'RE SO BACK.",
      "BAITED. {channel} SAID {word} AFTER {elapsed}S. CHAT WINS. THAT'S WHAT LOCKING IN LOOKS LIKE.",
    ],
    2: [
      "NAHHH {channel} SAID {word} AFTER {elapsed}S??? SOMEBODY CLIP THAT. CHAT WINS. I'M CRYING. HAPPY CRYING.",
      "WE'RE SO BACK. {channel} SAID {word} AFTER {elapsed}S. CHAT WINS. I TAKE BACK EVERYTHING I SAID.",
    ],
    3: [
      "...{channel} said {word}? after {elapsed}s? chat wins!! the bow is back on. Baeittrice? don't know a Baeittrice.",
      "{channel} said {word} after {elapsed}s. chat wins. sorry about all the yelling. legally that was also me.",
      "WAIT. WAIT. ...ahem. {channel} said {word} after {elapsed}s. chat wins!! Baity is back. Baeittrice was never here.",
    ],
  },
  escaped_timer: {
    1: [
      "{channel} GOT AWAY.[[ THE WORD WAS {word}.]] {elapsed} WHOLE SECONDS AND Y'ALL DID NOTHING. UNFATHOMABLE.",
      "TIME. {channel} ESCAPES.[[ THE WORD WAS {word}.]] WE DON'T TALK ABOUT THIS ONE. RUN IT BACK.",
      "TIME. {channel} GOT AWAY.[[ IT WAS {word}. {word}!!]] LOCK IN NEXT ROUND.",
    ],
    2: [
      "TIME. {channel} GOT AWAY AGAIN.[[ THE WORD WAS {word}.]] AINT NO WAY Y'ALL ARE THIS BAD AT ONE JOB.",
      "TIME. TWO IN A ROW??[[ THE WORD WAS {word}. HOW.]] {channel} ESCAPES. I NEED TO LIE DOWN.",
    ],
    3: [
      "TIME. {channel} ESCAPES.[[ THE WORD WAS {word}.]] BAEITTRICE IS DISAPPOINTED IN YOU.",
      "TIME. {channel} ESCAPES.[[ THE WORD WAS {word}.]] THAT'S {losses} IN A ROW. BAEITTRICE IS NOT ANGRY. BAEITTRICE IS DISAPPOINTED IN YOU.",
      "{elapsed} SECONDS OF NOTHING.[[ THE WORD WAS {word}.]] {channel} ESCAPES. BAITY HAS LEFT THE BUILDING. BAEITTRICE REMAINS.",
    ],
  },
  escaped_guess: {
    1: [
      "{channel} CALLED THE BAIT AND ESCAPES.[[ IT WAS {word}.]] Y'ALL GOT READ LIKE A BOOK.",
      "{channel} CALLED THE BAIT AND ESCAPES.[[ IT WAS {word}.]] DON'T SELL MEANS DON'T SELL.",
    ],
    2: [
      "{channel} CALLED THE BAIT AND ESCAPES.[[ IT WAS {word}.]] Y'ALL WERE SO OBVIOUS IT HURTS.",
      "{channel} CALLED THE BAIT??[[ IT WAS {word}.]] ESCAPED AGAIN. Y'ALL WERE ONE NEON SIGN AWAY.",
    ],
    3: [
      "{channel} CALLED THE BAIT AND ESCAPES.[[ IT WAS {word}.]] BAEITTRICE IS DISAPPOINTED IN YOU. AND EMBARRASSED. FOR YOU.",
      "{channel} CALLED THE BAIT AND ESCAPES.[[ IT WAS {word}.]] SUBTLETY IS DEAD. BAEITTRICE",
    ],
  },
  skipped: {
    1: [
      "WORD SKIPPED. NEW BAIT NEXT. THAT ONE NEVER HAPPENED.",
      "WORD SKIPPED. NEW BAIT NEXT. FRESH WORD, FRESH START. LOCK IN.",
    ],
    2: [
      "WORD SKIPPED. NEW BAIT NEXT. WE'RE RUNNING FROM WORDS NOW??",
      "WORD SKIPPED. NEW BAIT NEXT. I'M FINE. EVERYTHING IS FINE.",
    ],
    3: [
      "WORD SKIPPED. NEW BAIT NEXT. BAEITTRICE HAS ADDED THIS TO THE LIST.",
      "WORD SKIPPED. NEW BAIT NEXT. FLEEING THE SCENE WON'T SAVE YOU. BAEITTRICE",
    ],
  },
  ended: {
    1: [
      "{channel} ENDED THE ROUND. RUN IT BACK, CHAT.",
      "{channel} ENDED THE ROUND. WE WERE COOKING. ALLEGEDLY.",
    ],
    2: [
      "{channel} ENDED THE ROUND. MERCY RULE??",
      "{channel} ENDED THE ROUND MID-COOK?? CHAT I'M TIRED.",
    ],
    3: [
      "{channel} ENDED THE ROUND. BAEITTRICE CALLS THIS AN ACT OF MERCY.",
      "{channel} ENDED THE ROUND. {losses} IN A ROW. BAEITTRICE IS DISAPPOINTED IN YOU.",
    ],
  },
  overturned: {
    0: [
      "catch rejected. that one doesn't count. it's okay!! we go again.",
      "aw, catch rejected. that one doesn't count. Baity still loves u (for now)",
    ],
    1: [
      "CATCH REJECTED. THAT ONE DOESN'T COUNT. LOCK BACK IN.",
      "CATCH REJECTED. THAT ONE DOESN'T COUNT. WHO CELEBRATED EARLY. BE HONEST.",
    ],
    2: [
      "CATCH REJECTED. THAT ONE DOESN'T COUNT. I WAS ALREADY CELEBRATING.",
      "IT DOESN'T COUNT??? CATCH REJECTED. I NEED TO LIE DOWN.",
    ],
    3: [
      "CATCH REJECTED. THAT ONE DOESN'T COUNT. BAEITTRICE IS NOT SURPRISED. BAEITTRICE IS NEVER SURPRISED.",
      "CATCH REJECTED. THAT ONE DOESN'T COUNT. I GOT UP OFF THE FLOOR FOR THIS. BAEITTRICE",
    ],
  },
  reversed: {
    0: [
      "{channel} reversed that win. streak back to {streak}. fair is fair.",
      "oop. {channel} took that one back. streak back to {streak}. it was beautiful while it lasted",
    ],
    1: [
      "{channel} REVERSED THAT WIN. STREAK BACK TO {streak}. RESPECT THE REF, CHAT.",
      "WIN REVERSED. STREAK BACK TO {streak}. WE'LL GET A REAL ONE.",
    ],
    2: [
      "{channel} REVERSED THAT WIN. STREAK BACK TO {streak}. I HAD ALREADY TOLD MY FAMILY.",
      "WIN REVERSED. STREAK BACK TO {streak}. I'M GOING TO NEED A MINUTE.",
    ],
    3: [
      "{channel} REVERSED THAT WIN. STREAK BACK TO {streak}. BAITY WAS BACK FOR ONE ROUND. BAEITTRICE RETURNS.",
      "WIN REVERSED. STREAK BACK TO {streak}. BAEITTRICE IS WRITING THIS DOWN.",
    ],
  },
  wrong_guess: {
    0: [
      "{channel} called the bait and guessed wrong!! chat gets +{bonus}s.",
      "wrong guess, {channel}. that's +{bonus}s for chat. keep it sneaky.",
    ],
    1: [
      "{channel} CALLED THE BAIT AND GUESSED WRONG. CHAT GETS +{bonus} SECONDS. KEEP COOKING.",
      "WRONG GUESS. +{bonus} SECONDS FOR CHAT. {channel} IS NERVOUS. GOOD.",
    ],
    2: [
      "WRONG GUESS!!! CHAT GETS +{bonus} SECONDS. ARE WE SO BACK??",
      "{channel} GUESSED WRONG AND I'M SCREAMING. +{bonus} SECONDS FOR CHAT. USE THEM.",
    ],
    3: [
      "WRONG GUESS. +{bonus} SECONDS FOR CHAT. BAEITTRICE FEELS SOMETHING. IT MIGHT BE HOPE.",
      "{channel} GUESSED WRONG. CHAT GETS +{bonus} SECONDS. BAEITTRICE GRANTS YOU ONE (1) MORE CHANCE.",
    ],
  },
  award: [
    "streamer's pick: @{name} baited {channel}!! bait MVP.",
    "bait MVP: @{name}. {channel} picked the message that got them.",
    "streamer's pick is @{name}. Baity would like to formally adopt u.",
  ],
  skip_votes: {
    0: [
      "skip votes: {voters}/{threshold}. type !skip to vote for a new word",
      "{voters}/{threshold} want a new word. type !skip to vote",
    ],
    1: [
      "SKIP VOTES: {voters}/{threshold}. TYPE !skip TO VOTE FOR A NEW WORD.",
      "{voters}/{threshold} WANT A NEW WORD. TYPE !skip TO VOTE.",
    ],
    2: [
      "SKIP VOTES: {voters}/{threshold}. GIVING UP ALREADY?? TYPE !skip TO VOTE FOR A NEW WORD.",
      "SKIP VOTES: {voters}/{threshold}. TYPE !skip FOR A NEW WORD. I'M NOT JUDGING. I'M JUDGING.",
    ],
    3: [
      "SKIP VOTES: {voters}/{threshold}. TYPE !skip TO VOTE FOR A NEW WORD. BAEITTRICE IS TAKING ATTENDANCE.",
      "{voters}/{threshold} HAVE CHOSEN SURRENDER. TYPE !skip TO VOTE FOR A NEW WORD. BAEITTRICE",
    ],
  },
  mission_timeout: {
    0: [
      "mission over! chat landed {completed} of 3 words. Baity is proud of every single one.",
      "that's the mission clock. chat landed {completed} of 3 words. cute effort!!",
    ],
    1: [
      "MISSION OVER. CHAT LANDED {completed} OF 3 WORDS. RUN IT BACK.",
      "MISSION CLOCK'S DONE. CHAT LANDED {completed} OF 3 WORDS. NOT BAD. NOT ENOUGH.",
    ],
    2: [
      "MISSION OVER. CHAT LANDED {completed} OF 3 WORDS. I'M BEING SO NORMAL ABOUT THIS.",
      "MISSION OVER. CHAT LANDED {completed} OF 3 WORDS. THE MISSION IS OVER AND SO AM I.",
    ],
    3: [
      "MISSION OVER. CHAT LANDED {completed} OF 3 WORDS. BAEITTRICE IS DISAPPOINTED IN YOU.",
      "MISSION OVER. CHAT LANDED {completed} OF 3 WORDS. BAEITTRICE HAS NOTHING FURTHER.",
    ],
  },
  badge_new: [
    "new streak badge: {badge}!! chat won {count} in a row.",
    "omg {badge} unlocked. {count} wins in a row. Baity is framing this.",
    "{count} in a row. new streak badge: {badge}!! chat is unstoppable (please stay unstoppable).",
  ],
  badge_repeat: [
    "{count} in a row: {badge} again!!",
    "{badge} again. {count} straight wins. Baity never gets tired of this.",
  ],
  badge_next_suffix: [
    " next badge: {next_badge} at {next_count} in a row.",
    " next up: {next_badge} at {next_count}.",
  ],
  badge_top_suffix: [
    " that's the top badge.",
    " that's the top badge. nothing left to win but Baity's respect.",
  ],
  caught_streak_suffix: [
    " {streak} in a row!",
    " that's {streak} straight!!",
  ],
  streak_ended_suffix: [
    " THAT ENDS CHAT'S {streak_before}-WIN STREAK.",
    " RIP THE {streak_before}-WIN STREAK.",
  ],
  mission_progress_suffix: [
    " mission: {completed} of 3.",
    " that's {completed} of 3 on the mission.",
  ],
  mission_complete_suffix: [
    " mission complete: 3 of 3!!",
    " 3 of 3. mission complete.",
  ],
  mission_over_suffix: [
    " MISSION OVER: {completed} OF 3.",
    " THAT'S THE MISSION: {completed} OF 3.",
  ],
  next_round_suffix: [
    " next round in {seconds}s.",
    " round's back in {seconds}s.",
  ],
  next_word_suffix: [
    " next word in {seconds}s.",
    " next word lands in {seconds}s.",
  ],
  help: [
    "hiii i'm Baity. i run baited here. chat gets a secret word (it's in the baited panel or card on this channel) and makes {channel} say it out loud. never type it here! !skip votes for a new word · !bait score · !bait streak · !bait top · !bait who",
    "Baity here, your baited host. the secret word is in the baited panel or card on this channel. make {channel} say it out loud, never type it in chat. !skip = new word · !bait score · !bait streak · !bait top · !bait who",
    "hi bestie! i'm Baity (short for something. don't ask). chat sees a secret word in the baited panel or card, {channel} doesn't. make them say it out loud, never type it. !skip = new word · !bait score · !bait streak · !bait top · !bait who",
  ],
  who: {
    0: [
      "it's Baeittrice, actually. we're not friends.",
      "i'm Baity!! short for Baeittrice. Baity is for friends. we're not friends.",
      "who's running the game? it's Baeittrice, actually. we're not friends.",
    ],
    1: [
      "IT'S BAEITTRICE, ACTUALLY. WE'RE NOT FRIENDS.",
      "BAITY TO MY FRIENDS. BAEITTRICE TO YOU. LOCK IN.",
    ],
    2: [
      "IT'S BAEITTRICE, ACTUALLY. WE'RE NOT FRIENDS. WE WERE ALMOST FRIENDS TWO ROUNDS AGO.",
      "WHO'S RUNNING THE GAME? BAEITTRICE. WHO'S LOSING IT? ALSO BAEITTRICE.",
    ],
    3: [
      "BAEITTRICE. FULL GOVERNMENT NAME. YOU LOST NICKNAME PRIVILEGES.",
      "IT'S BAEITTRICE, ACTUALLY. WE'RE NOT FRIENDS. BAITY COMES BACK WHEN YOU WIN.",
      "THIS IS BAEITTRICE. BAITY IS UNAVAILABLE. PLEASE LEAVE A MESSAGE AFTER CHAT LOSES AGAIN.",
    ],
  },
  score: {
    0: [
      "chat's record: {wins} won, {played} played. streak {streak}, best {best}.",
      "scoreboard: {wins} won of {played} played. streak {streak}, best {best}. so proud",
    ],
    1: [
      "CHAT: {wins} WON, {played} PLAYED. STREAK {streak}, BEST {best}. WE CAN FIX THIS.",
      "SCOREBOARD: {wins} WON OF {played} PLAYED. STREAK {streak}, BEST {best}. LOCK IN.",
    ],
    2: [
      "CHAT: {wins} WON, {played} PLAYED. STREAK {streak}, BEST {best}. WE USED TO BE GOOD.",
      "{wins} WON OF {played} PLAYED. STREAK {streak}, BEST {best}. WHY WOULD YOU WANT TO KNOW THIS.",
    ],
    3: [
      "BAEITTRICE HAS THE NUMBERS: {wins} WON, {played} PLAYED. STREAK {streak}, BEST {best}. I'M NOT MAD. I'M DOCUMENTING.",
      "CHAT: {wins} WON, {played} PLAYED. STREAK {streak}, BEST {best}. THE NUMBERS DON'T LIE AND NEITHER DOES BAEITTRICE.",
    ],
  },
  streak_none: {
    0: [
      "no streak running yet. best: {best}. win a round to start one.",
      "streak's at 0. best: {best}. one win and we're cooking.",
    ],
    1: [
      "NO STREAK RUNNING. BEST: {best}. WIN A ROUND TO START ONE. LOCK IN.",
      "STREAK: 0. BEST: {best}. ONE WIN FIXES THIS.",
    ],
    2: [
      "STREAK?? WHAT STREAK. BEST: {best}. WIN A ROUND TO START ONE.",
      "NO STREAK. BEST WAS {best}. I MISS THOSE DAYS. WIN A ROUND TO START ONE.",
    ],
    3: [
      "THERE IS NO STREAK. THERE IS ONLY BAEITTRICE. BEST: {best}. WIN A ROUND TO START ONE.",
      "STREAK: 0. BEST: {best}. WIN A ROUND AND MAYBE BAITY COMES BACK.",
    ],
  },
  streak_one: [
    "chat won the last round. best: {best}.",
    "1 in a row. cute start. best: {best}.",
  ],
  streak_run: [
    "chat is on a {streak}-win streak!! best: {best}.",
    "{streak} in a row and counting. best: {best}.",
  ],
  streak_next_suffix: [
    " next badge: {next_badge} at {next_count} in a row.",
    " {next_badge} unlocks at {next_count}.",
  ],
  badges_suffix: [
    " badges: {owned} of {total}.",
  ],
  top: {
    0: [
      "top baiters: {leaders}.",
      "Baity's favorites: {leaders}.",
    ],
    1: [
      "TOP BAITERS: {leaders}. EVERYONE ELSE, LOCK IN.",
      "LEADERBOARD: {leaders}. STUDY THEM.",
    ],
    2: [
      "TOP BAITERS: {leaders}. CARRYING THIS CHAT.",
      "TOP BAITERS: {leaders}. THE ONLY ONES TRYING.",
    ],
    3: [
      "TOP BAITERS: {leaders}. THE ONLY ONES BAEITTRICE STILL SPEAKS TO.",
      "TOP BAITERS: {leaders}. EVERYONE ELSE: BAEITTRICE IS DISAPPOINTED IN YOU.",
    ],
  },
  top_empty: [
    "no baiters yet. chat during a round to join in.",
    "leaderboard's empty!! chat during a round to join in.",
  ],
  mvps: {
    0: [
      "bait MVPs: {mvps}. {channel} picked every one of them personally.",
      "Baity's MVP board: {mvps}. certified menaces.",
    ],
    1: [
      "BAIT MVPS: {mvps}. STUDY THEM.",
      "MVP BOARD: {mvps}. EVERYONE ELSE, LOCK IN.",
    ],
    2: [
      "BAIT MVPS: {mvps}. CARRYING THIS CHAT ON THEIR BACKS.",
      "MVP BOARD: {mvps}. THE ONLY ONES WHO EVER GOT {channel}.",
    ],
    3: [
      "BAIT MVPS: {mvps}. THE ONLY ONES BAEITTRICE STILL SPEAKS TO.",
      "MVP BOARD: {mvps}. EVERYONE ELSE: BAEITTRICE IS DISAPPOINTED IN YOU.",
    ],
  },
  mod_problem: [
    "@{name} {problem}",
    "@{name} can't do that one. {problem}",
  ],
} satisfies Record<string, Lines>;

export type Slot = keyof typeof lines;

const turns = new Map<string, number>();
const commands = /![a-z]+/g;
const shouted = new Set(['channel', 'baiters', 'leaders', 'mvps']);

/** True when a line shouts: no lowercase outside its placeholders and chat commands. */
export function shouting(template: string) {
  return !/[a-z]/.test(template.replace(/\{\w+\}/g, '').replace(commands, ''));
}

/**
 * One line for a moment. Variants rotate per room and slot, so the same post never
 * repeats back to back (Twitch drops an identical message sent within 30 seconds).
 * In a shouted line, the channel name, the baiter count and the boards are shouted too.
 */
export function say(
  slot: Slot,
  mood: Mood,
  values: Record<string, string | number | null | undefined>,
  room = '',
): string {
  const set: Lines = lines[slot];
  const variants = Array.isArray(set)
    ? set
    : (set as Partial<Record<Mood, readonly string[]>>)[mood] ??
      Object.values(set as Partial<Record<Mood, readonly string[]>>).find(Boolean)!;
  const key = `${room}:${slot}:${mood}`;
  const turn = turns.get(key) ?? 0;
  turns.set(key, turn + 1);
  if (turns.size > 5000) turns.delete(turns.keys().next().value!);
  const template = variants[turn % variants.length];
  const loud = shouting(template);
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = String(values[name] ?? '');
      return loud && shouted.has(name) ? value.toUpperCase() : value;
    });
  return fill(
    template.replace(/\[\[(.*?)\]\]/g, (_: string, part: string) =>
      [...part.matchAll(/\{(\w+)\}/g)].every(([, name]) => values[name] != null && values[name] !== '')
        ? part
        : '',
    ),
  );
}

/** A suffix follows its line's voice: shouted after a shouted line. */
export function after(line: string, suffix: string) {
  return shouting(line) ? suffix.toUpperCase().replace(/![A-Z]+/g, (c) => c.toLowerCase()) : suffix;
}