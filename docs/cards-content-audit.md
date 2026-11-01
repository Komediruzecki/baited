# Card copy audit and Croatian content catalogue

Prepared 31 October 2026 for the recording kit and Card Lab review.

All **100 built-in cards** have been reviewed. **23 English questions have a recommended revision; 77 stay as written.** Every original question is preserved verbatim. All 100 cards now also have Croatian targets, four clue terms, an on-card question and reviewed-form candidates. This is authored content for review, not an enabled Croatian speech mode.

## Where the content lives

- [`card-localizations.json`](../packages/app/shared/card-localizations.json): versioned preferred English copy, Croatian copy, alternatives, per-card audit decisions and 39 paired card/state labels.
- [`card-examples.v1.json`](../packages/app/shared/card-examples.v1.json): immutable baseline of the 100 original English questions. Keep this archive when changing current questions.
- [`card-examples.json`](../packages/app/shared/card-examples.json): the existing runtime question map. The additive catalogue does not change it by itself.
- [`card-localizations.test.ts`](../packages/app/tests/card-localizations.test.ts): coverage, original preservation, clue parity and question safety checks.

Card Lab’s copy-review view can use the canonical English ID to show the matching illustration beside either language. A translated display word must not replace the artwork ID.

## What makes a good prompt

A prompt should give chat a usable way into a conversation, without typing the target or the currently forbidden clues. It should make the intended word plausible, not promise that the streamer will say it. The table distinguishes prompts that work as openers from narrower riddles. The illustration stays useful when a reference is unfamiliar.

The current deck has 35 easy, 34 medium and 31 hard cards. Easy blocks only the target; medium also blocks the first two clues; hard blocks all four. English preferred questions and stored alternatives pass the real spoiler matcher **at their card’s built-in difficulty**. A question may need a different wording if a future mode applies four forbidden clues to every card. Banana’s smoothie and yellow-boomerang questions, for example, are valid for its current easy setting.

No English target, difficulty or forbidden clue was rebalanced in this content pass. The revised recommendation is additive until adopted by a runtime consumer. Original prompts remain available for future question rotation, Baity dialogue or a second card edition.

## Recording notes

The three-round recording uses English: **banana → ghost → bait**. `bait` lives in the separate `recordingCards` object and is not added to the natural 100-card deck. The fish-directed bait prompt is intentional misdirection for the agreed ending, not the normal recommendation for every future bait card.

- **Banana:** “What do you always put in a smoothie?” The cartoon question remains an alternative.
- **Ghost:** “What’s your favorite scary movie?” is the requested conversational opener. The old door question and an abandoned-house question remain available. Do not rely on the single token *Ghostface* being matched as *ghost*. A natural spoken phrase such as “a ghost” contains the target explicitly.
- **Bait:** keep the agreed final line in English. Translating *bait* to *mamac* changes the wordplay: *navući* is a useful verb, but it does not contain the target *mamac*.

## Croatian readiness and limits

The Croatian catalogue is complete enough to review now. It is **not proof that Croatian gameplay, voice detection, moderation or every interface label is ready**.

1. **Speech:** the current pinned model is English. Croatian needs a model and browser benchmark that supports the language, followed by real microphone tests. This catalogue does not enable or advertise Croatian recognition.
2. **Matching:** keep canonical IDs separate from translated words. Targets such as `pješčani sat`, `morski konjić`, `živi pijesak` and `viseća mreža` need phrase-aware matching; Croatian endings need deliberate acceptance rules. The current custom-card schema is ASCII/single-word oriented. `acceptedSpellings` here is a reviewed-form candidate list, not a promise that runtime accepts those forms.
3. **Spoilers:** the Croatian test catches exact target forms, explicit aliases and active clue phrases. It is not a morphological analyser. A future Croatian spoiler matcher must test inflected clue forms and disguised spellings without blocking unrelated short substrings.
4. **Names:** familiar loanwords and regional names need native-player approval. `plamenac`/`flamingo`, `vodoriga`/`gargojl`, `čudnovati kljunaš`/`kljunaš` and `sljezov kolačić`/`marshmallow` are explicit review choices. `šipak` can mean pomegranate or rosehip; do not silently accept it everywhere. `kolačić` for cupcake is intentionally flagged as broad, and ring-shaped doughnut art may read differently from `krafna`.
5. **Layout:** 39 translated card/state labels are included, with matching keys. They do not constitute a full application translation. Longer labels, diacritics and multiword targets need 300 px panel, mobile and OBS checks. Use proper Croatian letters, not ASCII transliteration.
6. **Privacy of the round:** localization must not bypass role-specific projections. The active target and clues remain hidden from Studio and the streamer’s overlay while live. An all-card review catalogue is not authority to expose the current round.
7. **Editorial acceptance:** the text has been authored and statically checked. Paolo and maff should use the copy-review view for native-language and dialect decisions before enabling Croatian play. Target aliases should be versioned and tested when that decision is made.

Croatian questions adapt the joke or situation when a literal translation sounds awkward. Four translated clues are provided for every card, but some require adaptation: English *turtle* and *tortoise* both become forms of *kornjača*, and *maze* and *labyrinth* overlap in Croatian. The catalogue keeps those adaptations visible rather than claiming strict word-for-word equivalence.

## Per-card review

“Keep” means the English question remains a usable prompt, not that it guarantees the answer. “Revise” identifies the preferred new question. The complete original and all current alternatives are in the JSON catalogue.

| Card · difficulty | Decision | Preferred English question | Croatian target · question | Editorial finding |
| --- | --- | --- | --- | --- |
| accordion · hard | Keep | What makes a tune when you push and pull its middle? | **harmonika** · Što svira dok mu stišćeš i rastežeš sredinu? | Distinctive playing action without the four forbidden clues. Keep. |
| alchemy · hard | Revise | What was the old practice behind the philosopher's stone? | **alkemija** · Kako se zvala stara praksa koja je obećavala kamen mudraca? | Revised to ask for the practice. The original lead transformation invited gold, which is itself blocked. |
| archipelago · hard | Revise | What is the name for a group of separate pieces of land surrounded by sea? | **arhipelag** · Kako se zove skup više odvojenih komadića kopna okruženih morem? | Revised to ask for the name of the group, rather than suggesting island as the answer. |
| armadillo · hard | Keep | Who looks dressed for a tiny jousting tournament? | **oklopnik** · Tko izgleda spreman za mali viteški turnir? | Tiny knight image is memorable without armor/shell. Keep. |
| astronaut · medium | Keep | Whose commute needs a countdown? | **astronaut** · Čiji odlazak na posao počinje odbrojavanjem? | Distinctive countdown commute. Keep. |
| avocado · medium | Keep | What stays rock hard all week, then goes bad overnight? | **avokado** · Što je cijeli tjedan pretvrdo, a onda se pokvari preko noći? | Familiar ripeness joke with a strong target. Keep. |
| bagpipes · hard | Revise | What would you expect to hear leading a kilted parade? | **gajde** · Što bi očekivao čuti na čelu povorke ljudi u kiltovima? | Revised to the kilted-parade sound; the old library disturbance could mean many instruments. |
| balloon · easy | Keep | What would ruin a party if you let go of its string? | **balon** · Što će ti pobjeći sa zabave ako pustiš konac? | Distinctive string-release action. Keep. |
| banana · easy | Revise | What do you always put in a smoothie? | **banana** · Što obavezno stavljaš u smoothie? | Revised for the recording: smoothie conversation first; cartoon and yellow-boomerang questions remain alternatives. Easy has no extra forbidden clues. |
| bicycle · easy | Keep | What did you learn to ride after a few scraped knees? | **bicikl** · Što si naučio voziti nakon nekoliko oguljenih koljena? | Personal childhood story cue. Scooter is also plausible; useful chat follow-up opportunity. |
| binoculars · medium | Keep | What would help you find a friend on the opposite hill? | **dalekozor** · Čime bi pronašao prijatelja na suprotnom brdu? | Useful distant-friend scenario. Telescope also fits; do not tell chat the prompt is guaranteed. |
| birthday · easy | Revise | Which yearly occasion gets your relatives calling all at once? | **rođendan** · Kojim te godišnjim povodom rodbina odjednom počne zvati? | Revised from a broad celebration cue to a recurring family occasion. |
| boomerang · hard | Revise | What's the worst thing to toss away when you want it gone for good? | **bumerang** · Čega se ne možeš riješiti ni kad svom snagom zamahneš? | Revised around the object returning unwanted, rather than defining it outright. Uses toss instead of the blocked throw. |
| bubble · easy | Revise | What floats away when you blow through a soapy wand? | **mjehurić** · Što odleti kad puhneš kroz kolutić umočen u sapunicu? | Revised to the soapy-wand action; the previous floating-object question was too broad. |
| butterfly · easy | Keep | Who has the most dramatic makeover in the garden? | **leptir** · Tko u vrtu doživi najveću promjenu izgleda? | Metamorphosis as makeover is clear and playful. Keep. |
| cactus · medium | Keep | What's the worst thing to hug? | **kaktus** · Što bi bilo najgore zagrliti? | Short visual joke and a strong answer. Keep. |
| carrot · easy | Keep | What would a snowman borrow from your shopping bag? | **mrkva** · Što bi snjegović posudio iz tvoje vrećice iz dućana? | Snowman-nose association is strong without naming the body part. Keep. |
| catapult · hard | Keep | What would a castle really hate to see outside its gates? | **katapult** · Što bi dvorac najmanje htio vidjeti pred svojim vratima? | Strong siege context, but several weapons fit. Keep for a story rather than a definition. |
| chameleon · hard | Keep | Who could wear a different outfit without getting dressed? | **kameleon** · Tko može promijeniti izgled bez presvlačenja? | Visual outfit-change cue, avoiding lizard/colour. Keep. |
| chandelier · hard | Keep | What would be a nightmare to dust in a ballroom? | **luster** · S čega bi bilo najteže obrisati prašinu u plesnoj dvorani? | Practical dusting scenario with a ballroom scale cue. Keep. |
| cheese · easy | Keep | What makes a toastie worth the burnt fingers? | **sir** · Što se mora dobro rastezati kad zagrizeš tost? | Sensory toastie prompt invites the target. Croatian emphasizes stretching rather than the English burnt-fingers aside. |
| chicken · easy | Revise | Which farm animal would you keep for fresh eggs? | **kokoš** · Koju bi životinju držao na selu da svaki dan imaš svježa jaja? | Revised: the sunrise original elicited rooster. Fresh eggs make the requested farm animal more likely. |
| coffee · easy | Keep | What gets you through the early shift? | **kava** · Bez čega ne možeš započeti jutro? | Useful daily-routine topic. Tea is an honest alternative answer; chat should follow the streamer’s preference. |
| compass · medium | Keep | What would you pack for a hike with no phone signal? | **kompas** · Što bi ponio na planinarenje bez signala na mobitelu? | A practical hiking opener; map is another likely answer. Keep for natural discussion. |
| cookie · easy | Revise | What do you dunk in milk when nobody is counting? | **keks** · Što umačeš u mlijeko kad nitko ne broji? | Revised to a milk-dunking action. Biscuit is a regional answer; do not silently count it as cookie without a reviewed alias. |
| crocodile · medium | Keep | Who should never be invited to a pool party? | **krokodil** · Koga nikad ne bi pozvao na zabavu uz bazen? | Good absurd invitation, though shark also fits. Chat may need a safe follow-up. |
| cupcake · easy | Revise | Which individual cake gets its own little paper wrapper? | **kolačić** · Koji desert dobije vlastitu papirnatu košaricu i ukras na vrhu? | Revised with cake category. Croatian kolačić is broad; review against cupcake or mini tortica before gameplay enablement. |
| dinosaur · easy | Revise | Which animal from Jurassic Park would make the worst garden visitor? | **dinosaur** · Koja bi životinja iz Jurskog parka bila najgori gost u vrtu? | Revised with a Jurassic Park reference; a species name such as T. rex is not automatically the target. |
| disco · medium | Keep | Where would flared trousers and a mirrored ceiling fit right in? | **disko** · Gdje bi trapez-hlače i zrcalni strop bili sasvim normalni? | Period clothing and ceiling cues avoid dance/music. Keep. |
| donut · easy | Keep | What do you buy by the dozen even though part of it is missing? | **krafna** · Koji slatkiš izgleda kao jestivi kolut za plivanje? | English missing-middle joke matches ring art. Croatian krafna is familiar but broader than an American doughnut; review with players. |
| dragon · easy | Keep | What would you put in charge of a castle? | **zmaj** · Koga bi postavio da čuva tvoj dvorac? | Castle fantasy is a useful opener, though a knight is also plausible. Retain room for chat to improvise. |
| elephant · easy | Revise | Which zoo animal would need the biggest seat on a bus? | **slon** · Kojoj bi životinji iz zoološkog vrta trebalo najveće sjedalo u autobusu? | Revised with zoo scale, reducing the old generic oversized-seat question. |
| flamingo · medium | Keep | Who stands around on one foot all day? | **plamenac** · Tko cijeli dan stoji na jednoj nozi? | Distinctive one-leg pose. Native Croatian plamenac and common flamingo both need acceptance testing. |
| football · easy | Revise | What sport would you play in a World Cup final? | **nogomet** · Koji se sport igra u finalu Svjetskog prvenstva? | Revised to a World Cup sport. Still culturally ambiguous with other World Cups or soccer; Croatian nogomet is clearer. |
| gargoyle · hard | Revise | What is the name of the grumpy monster-shaped waterspout on a cathedral? | **vodoriga** · Kako se zove odvod za kišnicu u obliku mrkog čudovišta na katedrali? | Revised to a cathedral waterspout rather than any grumpy sculpture. Vodoriga may be unfamiliar; gargojl remains a reviewed synonym candidate. |
| ghost · easy | Revise | What's your favorite scary movie? | **duh** · Koji ti je najdraži horor film? | Owner-selected scary-movie question; retain the old door question and an abandoned-house alternative. Ghostface alone is not a confirmed ghost match. |
| glacier · medium | Keep | What moves so slowly you need years of photos to notice? | **ledenjak** · Što se pomiče toliko sporo da to vidiš tek nakon više godina fotografiranja? | Slow movement is a clear visual clue over a long timescale. Keep. |
| gramophone · hard | Keep | What would you wind up to play a song a century ago? | **gramofon** · Što bi prije sto godina navio da poslušaš pjesmu? | Specific era and wind-up action. Record player is a plausible phrase but not automatically a gramophone match. |
| guitar · easy | Keep | What would you bring to play songs around a campfire? | **gitara** · Što bi ponio da svima sviraš uz logorsku vatru? | Good campfire conversation opener; ukulele is also plausible. Keep. |
| hamburger · easy | Revise | Which fast-food meal looks taller in the advert than in your hands? | **hamburger** · Koji obrok iz brze hrane izgleda viši u reklami nego u rukama? | Revised with a fast-food advertising cue. Burger is a likely English response but currently not the exact target. |
| hammock · medium | Keep | What is the least graceful thing to climb out of on holiday? | **viseća mreža** · Iz čega je najteže dostojanstveno ustati na godišnjem odmoru? | A physical holiday anecdote with comic potential. Keep. |
| hedgehog · medium | Keep | Who looks like a hairbrush with tiny feet? | **jež** · Tko izgleda kao četka s malim nogama? | Strong visual hairbrush comparison. Keep. |
| hourglass · medium | Keep | What do you turn over to give yourself another minute? | **pješčani sat** · Što okreneš naopačke kad želiš još malo vremena? | Specific turn-over action. Croatian question avoids the translated time-unit clue. |
| igloo · medium | Keep | Where would you sleep if every brick was frozen? | **iglu** · Gdje bi prespavao da je svaka cigla smrznuta? | Frozen bricks strongly suggest the target without naming snow/house. Keep. |
| jellyfish · medium | Keep | What looks like a swimming lava lamp? | **meduza** · Što izgleda kao lava-lampa koja pliva? | The lava-lamp comparison is memorable and image-led. Keep. |
| kaleidoscope · hard | Keep | What changes the view every time you turn the tube? | **kaleidoskop** · Kroz koju se cjevčicu pogled promijeni čim je zakreneš? | Specific tube-turning action. Keep. |
| labyrinth · hard | Keep | Where would a very long piece of string come in handy? | **labirint** · Gdje bi ti klupko duge špage moglo spasiti dan? | The string cue invites a mythology story. Maze is blocked in English; Croatian uses an adapted dead-end clue. |
| lighthouse · medium | Keep | What flashes all night so sailors can get home? | **svjetionik** · Što bljeska cijelu noć da se pomorci vrate kući? | Strong purpose cue without coast/beacon. Keep. |
| marionette · hard | Keep | Who can't take a bow until somebody above them says so? | **marioneta** · Tko se ne može nakloniti dok mu netko iznad njega ne dopusti? | Specific controlled-bow action without strings/puppet. Keep. |
| marshmallow · medium | Keep | What goes on a stick and always seems to catch fire? | **sljezov kolačić** · Što nabodeš na štapić, a onda ti gotovo uvijek zagori? | Good camping mishap cue; sausages are another answer. Croatian food name needs audience review. |
| mermaid · medium | Keep | Who would struggle to buy a pair of shoes? | **sirena** · Kojoj bi junakinji bilo teško kupiti par cipela? | Playful shoes clue. Croatian sirena also means alarm; the question and illustration carry the meaning. |
| metronome · hard | Keep | What is the strictest teacher on a pianist's desk? | **metronom** · Tko je najstroži učitelj na pijanistovu stolu? | Musical timing personification without forbidden timing vocabulary. Keep. |
| microwave · medium | Keep | How do you rescue cold leftovers? | **mikrovalna** · Kako bi najbrže spasio hladne ostatke ručka? | Everyday situation with a likely appliance answer. Oven is a blocked clue, not a word chat should add to the prompt. |
| monkey · easy | Revise | What animal from a jungle story would steal your sunglasses? | **majmun** · Koja bi ti životinja iz priče o džungli ukrala sunčane naočale? | Revised with a jungle-story setting, but animal answers remain broad. Keep this as a conversational prompt. |
| monocle · hard | Keep | What does a fancy villain squint through? | **monokl** · Kroz što bi škiljio otmjeni negativac iz crtića? | Strong visual cue. A villain may also suggest an eyepatch; keep the squinting follow-up. |
| mushroom · easy | Keep | What wears a cap but has no head? | **gljiva** · Što nosi kapu, a nema glavu? | Simple visual wordplay. Keep. |
| mustache · medium | Keep | What would a cartoon detective glue under their nose? | **brkovi** · Što bi si detektiv iz crtića zalijepio ispod nosa? | Distinctive placement and disguise context. Keep. |
| narwhal · hard | Keep | Which sea creature has a horn on its face? | **narval** · Koja morska životinja ima rog na licu? | Distinctive anatomy without the whale/tusk/arctic/unicorn clues. Keep. |
| obelisk · hard | Revise | What do you call a tall four-sided shape with a pointed top? | **obelisk** · Kako se zove visoki četverostrani oblik sa šiljastim vrhom? | Revised to four sides and a pointed top; the previous tall-monument cue was less specific. |
| octopus · medium | Keep | Who could hold every controller at once? | **hobotnica** · Tko bi mogao držati sve kontrolere odjednom? | Playful gaming-specific cue; no numerical or tentacle giveaway. Keep. |
| origami · medium | Revise | What is the art of making tiny figures without scissors or glue? | **origami** · Kako se zove umijeće izrade malenih figura bez škara i ljepila? | Revised: asking for the art rather than an object makes origami more likely than crane or paper plane. |
| pancake · easy | Keep | What would you try to toss with a frying pan? | **palačinka** · Što bi pokušao baciti u zrak iz tave? | Specific pan action; French crepe remains a possible reply. Keep. |
| parachute · hard | Keep | What would you double-check before leaving the plane? | **padobran** · Što bi dvaput provjerio prije izlaska iz aviona? | Strong action cue. Plane is allowed; jump, skydiving, canopy and fall are not. |
| pendulum · hard | Keep | What goes back and forth without ever leaving its spot? | **njihalo** · Što stalno ide naprijed-natrag, a ne odlazi nikamo? | Back-and-forth action is clear but not unique. Follow with object context when needed. |
| penguin · medium | Keep | Who would win a belly-slide race? | **pingvin** · Tko bi pobijedio u utrci klizanja na trbuhu? | Memorable action cue; seals are another plausible answer. Chat can build a snowy race story without naming the two blocked clues. |
| periscope · hard | Keep | What lets you peek over something without lifting your head? | **periskop** · Čime možeš proviriti preko nečega bez podizanja glave? | Specific use cue. Keep. |
| pillow · easy | Keep | What do you flip to find the cold side? | **jastuk** · Što okrećeš da pronađeš hladnu stranu? | A specific everyday action likely to land. Keep. |
| pineapple · medium | Keep | What causes the biggest argument about pizza toppings? | **ananas** · Zbog čega se ljudi najviše svađaju oko nadjeva za pizzu? | Familiar pizza debate, avoiding the fruit/tropical clues. Keep. |
| pirate · easy | Keep | Who says arr and wears a tricorn? | **gusar** · Tko bi se potpisao lubanjom umjesto svojim imenom? | Distinctive costume and voice. Croatian uses a skull signature instead of forcing the English arr sound. |
| pizza · easy | Keep | What would you order for the whole chat? | **pizza** · Što bi naručio za cijeli chat? | Good group-order opener; broad enough for natural chat. Follow-ups should discuss topping disagreements. |
| platypus · hard | Keep | Which creature looks like someone ignored the assembly instructions? | **čudnovati kljunaš** · Koja životinja izgleda kao da ju je netko sastavio bez uputa? | Good assembly joke, but deliberately indirect. Croatian uses čudnovati kljunaš with kljunaš forms available for review. |
| pomegranate · hard | Keep | What snack takes ages to open and leaves your shirt looking guilty? | **nar** · Koji zalogaj otvaraš sto godina, a poslije moraš prati majicu? | Messy-snack anecdote fits. Regional šipak means pomegranate or rosehip; acceptance must be explicit. |
| popcorn · easy | Keep | What snack announces itself while you make it? | **kokice** · Koji se zalogaj čuje dok ga pripremaš? | Distinctive cooking sound. Keep. |
| potato · easy | Revise | What vegetable would you roast whole for a jacket dinner? | **krumpir** · Koje povrće pečeš cijelo, pa ga puniš vrhnjem? | Revised to whole baked potato rather than a generic comfort-food dish. Jacket dinner is UK English; Croatian uses a filling example. |
| quicksand · hard | Keep | What did adventure films make you worry about stepping in? | **živi pijesak** · Na što su te pustolovni filmovi naučili paziti dok hodaš? | Works as an adventure-film memory, without asserting real-world danger or behaviour. |
| rainbow · easy | Keep | What would make you stop and take a photo after a storm? | **duga** · Što bi te nakon nevremena natjeralo da izvadiš mobitel i slikaš? | Natural photo conversation after a storm. Keep, with no promised one-answer guarantee. |
| robot · easy | Revise | Who could follow programmed instructions to clean while you stream? | **robot** · Tko bi mogao slijediti programirane upute i čistiti dok streamaš? | Revised to add programmed instructions; the old lazy-roommate question often produces a person instead. |
| rocket · easy | Keep | What carries a crew beyond the atmosphere? | **raketa** · Čime bi posadu poslao izvan atmosfere? | Clear purpose cue without space/launch. Keep. |
| sandwich · easy | Keep | What would you pack for a long train ride? | **sendvič** · Što bi spakirao za dugo putovanje vlakom? | Good travel conversation opener, although many packed foods fit. Keep for natural chat. |
| saxophone · medium | Keep | What would you play in a smoky club at 2 a.m.? | **saksofon** · Što bi svirao u zadimljenom klubu u dva ujutro? | Good music opener, but trumpet is a plausible reply. Keep for conversation, not as a guaranteed riddle answer. |
| scarecrow · medium | Keep | Who stands outside all day wearing somebody else's old clothes? | **strašilo** · Tko cijeli dan stoji vani u tuđoj staroj odjeći? | Strong old-clothes/day-outside cue; already observed working in a real round. |
| seahorse · medium | Keep | Which tiny swimmer leaves the pregnancy to dad? | **morski konjić** · Kod kojeg malenog plivača tata nosi bebe? | Distinctive father-carries-young cue without ocean/fish. Keep. |
| snowman · easy | Keep | Who needs a scarf but should never come inside? | **snjegović** · Tko treba šal, ali ga nikad ne smiješ pustiti u kuću? | Good scarf/indoors contrast that avoids naming winter. Keep. |
| sphinx · hard | Keep | Which ancient giant has a human face and paws? | **sfinga** · Koji drevni div ima ljudsko lice i šape? | Specific human-face/paws combination without the four forbidden clues. Keep. |
| squirrel · medium | Keep | Who keeps burying snacks and forgetting where? | **vjeverica** · Tko stalno zakapa zalihe i zaboravlja gdje su? | Recognisable caching behaviour with a comic exaggeration. It is a game prompt, not a biological claim that every cache is forgotten. |
| sundial · hard | Revise | Which garden ornament can tell you the hour only in daylight? | **sunčani sat** · Koji vrtni ukras pokazuje doba dana samo dok ima dnevnog svjetla? | Revised to include purpose; avoids time, shadow, sun and clock. Croatian uses doba dana to avoid the sat clue. |
| tapestry · hard | Keep | What tells a whole story in coloured threads? | **tapiserija** · Što može ispričati cijelu priču pomoću šarenih niti? | Narrative in coloured threads suggests the craft without wall/fabric. Keep. |
| telescope · medium | Keep | How would you get a closer look at Saturn? | **teleskop** · Kako bi izbliza pogledao Saturn? | Saturn makes the object likely without stars/space. Keep. |
| terrarium · hard | Keep | What tiny garden could live on your desk? | **terarij** · Koji bi mali vrt mogao živjeti na tvojem stolu? | Tiny desk garden is a useful image; a plant pot is a plausible reply. Keep. |
| tornado · medium | Keep | What could move a barn without asking? | **tornado** · Što može odnijeti cijelu štalu bez pitanja? | Barn movement is vivid, though a hurricane also fits. No weather cue alone guarantees the word. |
| trampoline · medium | Keep | What makes the back garden feel like low gravity? | **trampolin** · Što dvorište pretvara u mjesto s manjom gravitacijom? | Playful low-gravity description. Keep. |
| tumbleweed · hard | Keep | What drifts through the scene when nobody answers your joke? | **kotrljajući grm** · Što prođe praznom ulicom u kaubojskom filmu? | Useful awkward-silence gag. Croatian uses a Western street scene because the literal plant term is uncommon. |
| turtle · easy | Keep | Who brings their own roof everywhere? | **kornjača** · Tko svugdje nosi vlastiti krov? | Memorable shell-as-roof cue. Croatian kornjača covers turtle and tortoise, so the fourth clue is adapted. |
| umbrella · easy | Keep | What turns inside out at the worst possible moment? | **kišobran** · Što se izvrne baš kad ti je najpotrebnije? | Everyday frustration cue. Keep. |
| volcano · medium | Keep | Where would you definitely not build a house? | **vulkan** · Gdje nikako ne bi sagradio kuću? | Broad but useful: lets chat build a disaster story. A house-placement question can also lead to a cliff or floodplain. |
| waffle · medium | Keep | Which food has tiny pockets for your toppings? | **vafl** · Koja hrana ima male džepove za sve preljeve? | Distinctive edible pockets. Keep. |
| waterfall · medium | Keep | What makes a hike noisier before you can even see it? | **vodopad** · Što čuješ na planinarenju puno prije nego što ga ugledaš? | Sound-before-sight hiking cue. Could also elicit a river; keep for natural conversation. |
| wombat · hard | Keep | Who famously leaves cube-shaped droppings? | **vombat** · Tko je poznat po izmetu u obliku kockica? | Distinctive animal fact; obscure by design, suitable for hard difficulty. |
| yogurt · medium | Revise | What do you peel open and spoon over granola? | **jogurt** · Što otvoriš i žlicom dodaš granoli? | Revised with a peel-open container and granola; still allows dairy-free alternatives naturally. |
| zeppelin · hard | Keep | What looks like a huge cigar with passengers underneath? | **cepelin** · Što izgleda kao golema cigara s putnicima ispod nje? | Distinctive silhouette. Blimp or airship are plausible answers; they are not automatically accepted target synonyms. |

## Verification

Run from the repository root:

```sh
pnpm --filter @baited/app exec tsx --test tests/card-localizations.test.ts
```

The checks cover all 100 canonical IDs, exactly four Croatian clues per card, original English question preservation against the versioned snapshot, unchanged English clues, paired label keys, English spoiler safety at current difficulty, explicit Croatian phrase/alias leakage and separation of recording-only `bait` from the natural deck. They do not certify translation taste or speech accuracy.
