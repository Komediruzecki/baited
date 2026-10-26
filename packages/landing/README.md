# baited landing

The static baited landing for `baited.maff.app`, with development at `dev.baited.maff.app`. The page runs in three parts, each about one screen tall: a hero with a 32-second staged film, “How it plays” (four step cards that build a stack as you scroll, then a fan of the 18 approved cards with a small key to the three card levels), and a white footer that closes the page. The card footer joins the light violet “bait” with “them.”. The page footer keeps the Irchiinnuss maker credit, Terms, Privacy and the contact address.

The hero starts muted. Turning sound on is an explicit choice that is not remembered after leaving or reloading. Pause and sound are two small buttons in the film's corner: they show on hover, keyboard focus or a tap, and stay while the film is paused; a click on the picture also pauses it. “Read the round” in the note under the film opens the transcript. Phones play the same 16:9 film as desktops, with the chat on the right. On a phone the hero is centred, after fortnite.com's phone page: the film comes first, inside the page margins, then the owner's headline “Chat holds the cards. Streamer takes the bait.”, the line under it and “How to play”. Reduced-motion visitors get chapter stills and can choose to play. The deck supports dragging and flicking, a click on a side card and the arrow keys.

This package does not deploy the game or Extension backend. It has no Twitch sign-in, microphone capture, speech recognition, analytics scripts or game credentials. The separate `/terms` and `/privacy` pages describe the stated test scope; their copy distinguishes the landing from the personal Extension test.

## Source

This package is the canonical landing source in [Komediruzecki/baited](https://github.com/Komediruzecki/baited), at `packages/landing`. Its runtime HTML, CSS, JavaScript, media, fonts and images are tracked here. It builds and serves without the old monorepo checkout or a local worktree path.

The landing was imported from `disjoint-colliders/packages/bait` at revision [`87bfc5d96bd63c39b30d39c8d7d245bd7252b578`](https://github.com/Komediruzecki/disjoint-colliders/tree/87bfc5d96bd63c39b30d39c8d7d245bd7252b578/packages/bait). [IMPORT-MANIFEST.json](IMPORT-MANIFEST.json) records every imported path, source Git blob and SHA-256 hash. This is a snapshot import: unrelated monorepo history is not included. The source remains preserved for the deployment handover. See [ASSETS.md](ASSETS.md) for art and film provenance.

The Twitch Extension, Streamer Studio, game server, Moonshine integration and their runtime assets live alongside this package in [`packages/app`](../app). Its earlier [`concepts/bait-v2`](../app/concepts/bait-v2) directory, introduced at `d8732aa`, preserves the historical design and film-rendering source. Do not synchronize that concept over the maintained landing. Personal planning and historical snapshots live in `personal/games/baited` in the owner's dotfiles repository. Build instructions and provenance stay with this repository so Paolo can use a clone independently.

## Motion

Motion uses GSAP 3.15.0 with ScrollTrigger, self-hosted in `site/vendor/gsap/` so the self-only content policy still applies. Both files load with `defer` before the page modules. Without GSAP, the steps show as a plain list, the deck changes cards without animation and headings appear at once.

The page has no yellow: at the owner's request the palette is the brand violets, white and ink. The only warm colors left are the cards' own item colors (BANANA is yellow, VOLCANO orange) and the speech check, which marks VOLCANO in its card's orange. The hero film was rendered again with VOLCANO in the same orange (see ASSETS.md).

The header is the navigation (`site/nav.js`), after monochrome-studio.com's header and the owner's screen recording of it: a white bar centred at the top with the owner's BAITED logo in black (`site/assets/brand/baited-logo-black.webp`) in a light cell, “How to play”, “Cards” and a violet chat button. Hovering a link shrinks its words into a small violet square that grows and assembles a pixel icon (a gamepad, two cards) a pixel at a time; hovering the logo fills its cell with violet pixels at random moments and turns the logo white. The chat button's bubble sits in the middle of its square and keeps typing. While the visitor scrolls down the links fold away and the chat button widens with its words, “Get in touch”; scrolling up or keyboard focus opens the bar again. A phone always shows this compact bar. The bar slides away while the footer fills the top of the screen, since the footer has its own buttons. Without JavaScript it simply stays open.

The pixel layer, also after monochrome-studio.com, uses square pixels throughout:

- `site/pixel-boot.js` (a small blocking script in `<head>`) covers the first paint, and `site/pixels.js` swaps the cover for violet squares that disappear one by one in random order. A link to another page of the site (Terms, Privacy, back home) first fills the screen with squares, then loads the page. Hash links, new tabs, mail and other sites are left alone. If the script never runs, the cover fades by itself after 2.5 seconds. Reduced motion turns the curtain off. It does not need GSAP.
- `site/pixels.css` draws every icon as pixel art on a small grid (arrows, chat bubble, play, pause, sound, microphone), and its pixel buttons put the icon in an ink box that spreads over the whole button on hover while the icon loops: arrows hop a pixel, the bubble's dots bounce like someone typing. The navigation's chat button keeps typing all the time.
- `site/reveal.js` types the hero headline in after the curtain and the section headings as they arrive, and lights the How it plays lead up word by word with the scroll, the newest words in light violet. A typed heading gets its original text back when it finishes.
- A foil glint sweeps over a card when it comes to the front of the deck, and over the VOLCANO card once it is dealt.
- Four lilac viewfinder corners hold the hero film, a small idea from fortnite.com. They close in once when the page opens and a little more on hover.
- Leaving the tab changes its title to “🤐 Don’t say it…” until the visitor comes back.

`site/why-stack.js` builds “How it plays”, adapted from the voicetaggods.com why-stack. On desktop with a mouse the stack stays pinned beside the intro, centred on the screen. The first card is already on the stack when the section arrives; each further card rises from the bottom of the screen, tilted ±10°, onto the stack as the visitor scrolls (one scrubbed timeline, one card per scroll step). On touch screens and phones the cards stack with `position: sticky` instead.

`site/why-scenes.js` animates the picture inside each step card once the card arrives: the real VOLCANO card is dealt and flips face up; Twitch chat keeps receiving hints in a seamless loop; the streamer's screen shows the island game with a talking facecam, a smoking crater and the round clock, while the studio bar keeps the word hidden; and the speech check boxes VOLCANO and tags it “Detected”. Loops only run for the card in front while the section is on screen. The chat, names and lines come from the staged film.

The step cards use Material Design 3 color roles generated from the brand violet `#9146FF` with Google's material-color-utilities (SchemeContent): primary, secondary and tertiary containers and a surface container, each with its matching “on” color for text. The screens inside the cards use the same scheme's dark surfaces. The values and their roles are listed at the top of `site/why-stack.css`.

`site/deck.js` drives the fan. Its geometry and timing were measured from the owner's flick-cards reference video: neighbours at 9.8°, outer cards at 15°, both dimmed; a drag of about 1.87 card widths moves the fan by one card; a release flicks exactly one card (or keeps the nearest card past halfway) with a spring that overshoots about 17% and settles in 0.6 s, while the arriving card lifts briefly. Only the front card shows its word and clues. On a phone the fan closes up to fit the screen: the cards two away from the front stay 10 px inside its edges (`fanSpread`).

Every card face, in the deck and in the first step card, shows its level as three simple dots, the secret word centred in its item's own color, and “Forbidden words” with each one struck through the middle. The word colors are Material 3 tones of each item's color (BANANA yellow, VOLCANO orange), each at least 4.5:1 on the card face.

The hero, the “How it plays” stage and “The cards” each fill one screen (`100svh`) with their content centred. On short desktop screens the deck scales down to 88%, 78% or 68% so the fan and its level key still fit; the deck measures that scale, so a drag still moves one card per 1.87 card widths.

`site/footer.js` closes the page. The footer reverses the page's colors: it is white, with the Material 3 primary violet (`#7721e5`, 7.1:1) for its letters. It rises over “The cards” while the deck stays pinned beneath it, and its top edge arrives as a band of white square pixels, after the owner's pixel-transition reference: four rows of about 90 px squares that fill nearest rows first, in a random order that is the same on every visit. The two title lines slide up once, and with a mouse the circle and the film button lean toward the pointer. The layout follows the owner's references. From dennissnellenberg.com it takes the two-line title with a round picture and one rule with a violet “Get in touch” circle on it; hovering the circle fills it with ink and a typing pixel bubble. From monochrome-studio.com it takes the bar under the rule: version and maker on the left and the pages with small pixel icons in the middle of the page. “Watch the round” sits centred in the free space between that bar and the giant logo, with as much room above it as below. From flowty.co it takes the giant violet BAITED logo running off the bottom edge. The logo is stretched a little past the screen so the visible part of its letters touches both sides exactly, with the same space on the left and the right. It assembles from white squares as the visitor reaches the end.

Reduced motion shows the steps as a list with every scene in its final state, and changes deck cards instantly. The footer then follows the deck without pixels or pinning, and the curtain, typing, word-by-word lead, glints and icon loops are off. The hero film and approved card artwork are unchanged.

## Checks

From the baited workspace root:

```sh
rtk pnpm --filter @baited/landing check
rtk pnpm --filter @baited/landing test:run
rtk pnpm --filter @baited/landing deploy:dry-run
rtk pnpm --filter @baited/landing deploy:dry-run:prod
```

The deck tests cover the fan's slot geometry, wraparound, the release rules, the spring and lift curves and how the fan closes up on narrow screens. The scene tests cover the round clock, the chat and facecam timing, and that the chat never types the secret word. The footer tests cover the pixel edge's columns, fill order, fade and fixed pattern, and the logo's size and squares. The card tests check every secret word's color against the card face and that the first step card uses the deck's face. The pixel tests cover the curtain's size and which links get it, the navigation's float, fold and step-away rules, the typing pace, that every page loads the curtain early and that no served file uses the old yellow. The package's Worker tests cover host and environment guards, read-only serving, indexing headers, robots, sitemap, unpublished proof routes and response preservation. Brand tests restrict proof selection to known variants on review hosts. Browser verification must also cover the film, the scroll-built steps, deck dragging and legal navigation with the actual Worker content policy.

`pnpm --filter @baited/landing test:browser` runs the responsive regression checks in headless Chromium against a local Worker. Install Chromium first with `pnpm --filter @baited/landing exec playwright install chromium`. Set `BAITED_TEST_OUTPUT` to a registered run's `scratch/raw-logs/` directory for screenshots and failure traces; CI uses its runner temporary directory. Set `BAITED_TEST_URL` to check an already running preview or deployed host instead. The tests cover mobile button alignment, the intro-to-card gap, an unobscured interval before the footer wipe, repeated footer navigation, direct card links and reduced motion. The local test server uses the installed workerd's supported compatibility date; deployment configuration is unchanged.

## Development and production

Local review on this workstation (the installed local workerd currently supports 2026-08-08):

```sh
rtk proxy timeout --foreground 10800s pnpm --dir /home/maff/foss/worktrees/baited/unified-workspace/packages/landing exec wrangler dev --env dev --local --ip 127.0.0.1 --port 4370 --inspector-port 9370 --compatibility-date 2026-08-08 --log-level warn
```

Open <http://127.0.0.1:4370/>. The explicitly assigned port is fixed; the process stops after three hours or Ctrl+C. The local compatibility override is not a change to the deployment configuration. CI validates the configured cloud bundle.

[Deploy landing](../../.github/workflows/deploy-landing.yml) preserves the development and production release rules. It is gated by the repository variable `LANDING_DEPLOY_ENABLED=true`; the gate starts off until Cloudflare secret configuration and deployment ownership have been checked. The old disjoint-colliders deployment workflow must be disabled before this one is enabled, so two repositories cannot overwrite the same Worker.

Once enabled, merging landing changes or their deployment inputs into `main` deploys `maff-bait-dev` to `dev.baited.maff.app` and compares the served HTML with the merged source. A manual run from `main` also targets development. Production requires a separately authorized annotated `bait-vX.Y.Z` tag matching `packages/landing/package.json`, on a commit already in `main`. It deploys `maff-bait` to `baited.maff.app`. Feature branches do not auto-deploy. Never move a published tag.

The former `bait.maff.app` and `dev.bait.maff.app` domains remain attached to the same Workers as redirect aliases. GET and HEAD requests receive a permanent 308 redirect to their matching `baited` hostname, preserving the path and query. Redirect destinations always use fixed HTTPS origins; production rejects other hostnames. The development proof selector recognizes only the new development hostname and local loopback hosts.


For an authorized recovery, the package scripts are `deploy:dev` and `deploy:prod`. Local credentials must come through Proton Pass. No credential values belong in this package.

The Worker accepts GET and HEAD, serves only the configured environments, and applies a self-only content policy. Development remains `noindex, nofollow`; that discourages indexing but is not access control. An unset environment or mismatched production host returns 404. Successful production responses are indexable. This source version alone is not evidence of a deployment or a published tag.

No deployment is implied by these source files. Confirm the exact revision and served pages in the workflow result before reporting a deployment complete.
