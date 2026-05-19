# Ashland Conquest

> Explore. Contest. Conquer.

A post-apocalyptic strategy game for 2–4 players, set in the Ashlands — a
retro-futuristic world wrecked by a simultaneous plague and solar
catastrophe. Rival factions fight for control of a contested wasteland map.

> **Status — mid-redesign.** The game is being rebuilt around a spatial
> hex board. The engine architecture is specified in
> [`docs/mechanical-spec-v0.1.md`](docs/mechanical-spec-v0.1.md); a
> desktop UI prototype — a visual look-pass, not yet wired to an engine —
> lives in [`src/prototype/`](src/prototype/). The earlier settlement-only
> version's code is retained but inactive (see *Legacy* below).

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
- **Units** — each faction starts with one unit: a token on the map plus a
  stat card carrying `Strength` and `Movement`. Units move and fight; more
  can be recruited once the prerequisite is built.
- **Locations & the control meter** — every location has a 3-section
  control meter. Winning a contest flips a section; hold all three for
  **full control**, which grants the location's passives, scrap and VP.
- **Foothold & decay** — a held location's foothold score rises while your
  unit garrisons it and falls when the unit leaves; left long enough,
  sections decay back to neutral. A **Capital** is immune to decay.
- **Contests** — a unit's `Strength` + 1d6 versus the defender value +
  1d6; the defender wins ties.
- **Chips** — small upgrades acquired from the Market Row and installed on
  units (2 slots) or location cards: more Strength, Movement, scrap
  production, garrison, and so on.
- **Scrap** is the spendable currency; **Victory Points** are the win track.

The authoritative, theme-free rules live in the mechanical spec — this
section is just orientation.

## The prototype

[`src/prototype/`](src/prototype/) is a desktop-first **UI look-pass**: it
renders the redesigned game against a hand-authored mock state so the
visual design can be reviewed. It is **not** wired to a rules engine — you
cannot play a game yet. It demonstrates the hex board, location cards
(face-down / held), unit cards, the control meter, upgrade-chip tooltips,
the faction bar, the inspector, and a contest dice roll.

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
  mechanical-spec-v0.1.md   authoritative, theme-free engine spec
  design-doc-v0.1.md        world / faction / lore outline
  playtesting-log.md        notes
src/
  prototype/                current UI prototype (look-pass)
  App.jsx                   renders the prototype
  engine/ components/ hooks/  legacy settlement-game code (inactive)
public/assets/              art assets — drop new art here
```

## Documentation

- **[`docs/mechanical-spec-v0.1.md`](docs/mechanical-spec-v0.1.md)** — the
  engine spec: zones, turn loop, the contest model, units, chips, the
  effect library, data schemas. The source of truth for mechanics.
- **[`docs/design-doc-v0.1.md`](docs/design-doc-v0.1.md)** — world,
  factions and lore (outline, in progress).

## Status & next steps

- [x] Mechanical spec for the spatial-board redesign (v0.1 draft)
- [x] Desktop UI prototype — look pass
- [ ] Art assets — faction emblems, terrain tiles, icons
- [ ] Rules engine implementing the spec
- [ ] Wire the prototype UI to the engine
- [ ] Content — faction, location and chip definitions; balancing
- [ ] Retire the legacy settlement-game code

## Legacy

The original version was a settlement-builder — grow a settlement, raid
opponents, progress through three "Ages." That code remains under
`src/engine`, `src/components` and `src/hooks` but is no longer
referenced; `App.jsx` renders the prototype instead. It will be removed
once the new engine lands. The detailed rules summary this README used to
carry is superseded by the mechanical spec.
