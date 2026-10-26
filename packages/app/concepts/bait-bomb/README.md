# BAIT motion study

A separate review mockup. It does not connect to Twitch, speech recognition, a microphone, or the game server. The example is scripted; Open local game links to the existing simulated preview on port 3318.

Start from any directory:

```sh
rtk proxy timeout 10810 env CONCEPT_PORT=3319 CONCEPT_SECONDS=10800 pnpm --dir /home/maff/foss/worktrees/twigame/bait-preview preview:concept
```

Open http://127.0.0.1:3319. Keep the terminal open. The server binds strictly to loopback, stops after three hours, and Ctrl+C stops it sooner. An occupied port fails rather than changing the address.

The supplied bomb screenshot was regenerated with built-in ChatGPT image generation. The transparent master is preserved in assets/bait-bomb-logo.png; the original screenshot remains outside the repository. This is a local candidate, not a production identity replacement.

Russo One and Inter are bundled from the project's existing licensed fonts. See ../../THIRD_PARTY_NOTICES.md and ../../public/fonts/RussoOne-OFL.txt. The study introduces no package dependency. Fonts and image are copied here so future migration can preserve the study as one small package.

See DESIGN.md for the visual world and direction.md for references and acceptance criteria. A hosted-safe copy now lives in `packages/bait` on the `feat/bait-dev-landing` branch of the private disjoint-colliders repository, targeting `https://dev.bait.maff.app/`. Production `bait.maff.app` and the live game remain undeployed. This original local study stays preserved here.
