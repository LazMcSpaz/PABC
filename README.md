# Ashland Conquest

> Explore. Contest. Conquer.

A post-apocalyptic strategy game for 2–4 players, set in the Ashlands — a
retro-futuristic world wrecked by a simultaneous plague and solar
catastrophe. Rival factions fight for control of a contested wasteland map.

> **Status — playable, content phase.** The spatial hex-board redesign's
> engine is built and wired to the UI: every system in the mechanical spec
> (§15 encounters/quests, §16 combat, §17 tech, §18 loyalty/influence/
> diplomacy, §19 fog of war, §20 economy) is implemented in
> [`src/game/`](src/game/) and playable through
> [`src/prototype/`](src/prototype/), including AI-vs-AI. What's left is
> mostly content (quests and world encounters are still empty; other
> tables are thin) and AI decision-making quality — see
> [`docs/v0.3-roadmap.md`](docs/v0.3-roadmap.md) for the live roadmap.

## The game

Four factions — **Versari Korad**, the **Grand Lakers**, the **Goldgrass
Coalition** and the **Free Plainers** — contest a hex map of the Ashlands.
Each begins holding one faction Capital and races to the victory-point goal.

Core ideas:

- **The Board** — a spatial hex map. Tiles are **locations** (contestable,
  ownable), **field-encounter** tiles (draw from the field-encounter deck
  when a unit ends Move on one), or open **wasteland**. Between rounds, a
  parallel **world-encounter** system reads the state of the game and
  fires ambient encounters and quest beats — see §15 of the mechanical
  spec.
- **Units** — each faction starts with two units: a token on the map plus a
  stat card carrying `Strength` and `Movement`, with its own movement
  budget, attrition, salvage and veterancy (§16). More can be recruited up
  to a cap.
- **Locations & the control meter** — every location has a 3-section
  control meter. Winning a contest flips a section; hold all three for
  **full control**, which grants the location's passives, scrap and VP.
- **Loyalty** — an 8-slice pie that rises while a location is held/
  integrated and decays when neglected; control only flips on a lost
  contest or Loyalty hitting 0 (§18.2, replaces the old foothold/decay).
  A **Capital** is immune.
- **Contests** — a unit's `Strength` + 1d6 versus the defender value +
  1d6, modified by concentration, terrain, fortify and veterancy (§16.6);
  the defender wins ties.
- **Tech Wheel** — Research banked from held Labs sets a Tech Level, which
  grants Ability Points to spend on a 4-path wheel (military, logistics,
  economy, intelligence) (§17).
- **Economy** — locations produce Output split between banked scrap and
  building chips into slots (the old Market is retired) (§20).
- **Influence & Fog of War** — a per-faction Zone of Control field (§18.3)
  and per-faction vision/fog/ghost tracking (§19) — the board looks
  different depending who's viewing it.
- **Diplomacy** — factions have Standing, Menace and Honor; deals, pacts,
  war, vassalage and a reputation-gated Recognition victory are all in
  play (§18.4–§18.13).
- **Chips** — upgrades built into units (2 bay slots) or location slots:
  more Strength, Movement, scrap production, garrison, and so on.
- **Scrap** is the spendable currency; **Victory Points** and Recognition
  are the win conditions.

The authoritative, theme-free rules live in the mechanical spec — this
section is just orientation.

## The prototype

[`src/prototype/`](src/prototype/) is the live, playable UI: a desktop-first
hex board wired to the real rules engine in [`src/game/`](src/game/) via
[`src/prototype/engineAdapter.js`](src/prototype/engineAdapter.js) — you can
play a full game, including against AI opponents. It renders the hex board,
location cards (face-down / held), unit cards, the control meter and
Loyalty pie, upgrade-chip tooltips, the tech wheel, the diplomacy drawer,
the faction bar, the inspector, fog of war, and contest dice rolls.

## Getting started

Requires Node 18+.

```bash
npm install
npm run dev      # Vite dev server — open the printed http://localhost:5173
npm run build    # production build into dist/
```

The Vite config sets `base: "/PABC/"` for GitHub Pages; the dev server
ignores it, so the local root URL works as-is.

## Repository structure

```
docs/
  mechanical-spec-v0.1.md   authoritative, theme-free engine spec (§1-§20)
  v0.3-roadmap.md           live roadmap — what's actually left
  design-doc-v0.1.md        world / faction / lore outline
  content-schema-v0.1.md    engine↔editor content contract
  playtesting-log.md        notes
src/
  game/                     the rules engine (turn loop, contests, tech,
                             loyalty, influence, fog, economy, diplomacy)
  game/content/             auto-generated from the editor — do not hand-edit
  prototype/                the live UI, wired to src/game/ via engineAdapter.js
  audio/                    soundtrack + sound effects (see below)
  App.jsx                   renders the prototype
editor/                     content-authoring tool (Supabase-backed)
content/                    legacy CSV content source (thin, superseded by editor)
public/assets/              art assets — drop new art here
public/assets/audio/        music and sfx — README there covers the mastering
```

### Audio

`AudioProvider` sits above `App` so the soundtrack survives every screen
change. The title theme is pinned to the menus and plays every time; a match
switches to a shuffled rotation of all four cuts, with ten seconds of quiet
between songs. Sound effects are separate one-shots plus one held loop, mixed
against the score by the `gain` field in `src/audio/sfxLibrary.js`.

Both buses share one `AudioContext` (`src/audio/audioContext.js`) so a single
user gesture unlocks everything — browsers block audio until then, and the
player parks in a `blocked` state and starts on the first click rather than
going silently dead. Level runs through gain nodes rather than
`audio.volume`, which iOS Safari ignores.

Adding a cue: drop the file in `public/assets/audio/sfx/` (mastering recipe in
that folder's README), add an entry to `src/audio/sfxLibrary.js`, and fire it
with `useSfxOn` (once per game object), `useSfxOnChange` (every time a UI
element opens) or `useSfxHold` (sounded while a state is true, and faded out
when it ends — for beds that repeat and for long stingers that should be cut
short gracefully rather than trail over what comes next).

`npm run check:audio` drives all of it in a real browser — run `npm run dev`
first.

## Documentation

- **[`docs/mechanical-spec-v0.1.md`](docs/mechanical-spec-v0.1.md)** — the
  engine spec: zones, turn loop, the contest model, units, chips, the
  effect library, data schemas. The source of truth for mechanics.
- **[`docs/v0.3-roadmap.md`](docs/v0.3-roadmap.md)** — the live roadmap:
  ground-truth status of every system and what's actually left to do.
- **[`docs/design-doc-v0.1.md`](docs/design-doc-v0.1.md)** — world,
  factions and lore (outline, in progress).
- **[`docs/content-schema-v0.1.md`](docs/content-schema-v0.1.md)** — the
  contract between the engine and the `editor/` content tool.
- **[`docs/ai-overhaul-plan.md`](docs/ai-overhaul-plan.md)** — known AI
  decision-making gaps and the plan to close them.
- Older phase-by-phase implementation docs (`v0.2-implementation-roadmap.md`,
  `tech-wheel-plan.md`, `demo-gameplay-v0.2-plan.md`,
  `parallel-agent-briefs.md`) are historical records of already-shipped
  work — each now carries a status banner pointing here.

## Status & next steps

- [x] Mechanical spec for the spatial-board redesign (v0.1 draft, §1–§20)
- [x] Desktop UI prototype — look pass
- [x] Rules engine implementing the spec (`src/game/`) — combat, tech,
      loyalty, influence, fog of war, economy, diplomacy all implemented
- [x] Wire the prototype UI to the engine (`src/prototype/engineAdapter.js`)
- [ ] Content — quests and world encounters are still empty; locations,
      chips, factions and tuning constants are thin (see
      [`docs/v0.3-roadmap.md`](docs/v0.3-roadmap.md))
- [x] AI contest judgment — contests are now EV-gated by win probability
      (was fully blind); recruit-cap chip check generalized off id
- [ ] AI build/tech scoring — still a hardcoded heuristic, not the full
      effect→value table (see [`docs/ai-overhaul-plan.md`](docs/ai-overhaul-plan.md))
- [ ] Art assets — faction emblems, terrain tiles, icons
- [x] Retire the legacy settlement-game code — removed (`src/engine`,
      `src/components`, `src/hooks`; 38 files, confirmed dead/unreferenced)

See [`docs/v0.3-roadmap.md`](docs/v0.3-roadmap.md) for the current live
roadmap and how these fronts can run in parallel.

## Legacy

The original version was a settlement-builder — grow a settlement, raid
opponents, progress through three "Ages." That code lived under
`src/engine`, `src/components` and `src/hooks`, superseded by the
spatial-board redesign (`src/prototype/` + `src/game/`) and confirmed
unreferenced from `App.jsx` or anywhere reachable, so it has been removed.
The detailed rules summary this README used to carry is superseded by the
mechanical spec.
