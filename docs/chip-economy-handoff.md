# Chip Variety & Cost Balance — Handoff

> **Substantially out of date 2026-08-23 — read it for the REASONING, never
> for the inventory or the line numbers.** Not because it was wrong, but
> because every fix it recommended shipped:
>
> - it says there are **14** chips; there are **40**
> - it says `content/upgrade-chips.csv` is an unwired rival dataset; it is now
>   *generated from* `content.js` by `scripts/export-chips.mjs`
> - it says `rushScrapPerPoint` is 1 and `defaultSlider` 0; they are **2** and
>   **0.5**, and `config.js` cites this document by name beside both
>
> The audit method and the cost-curve argument are still the best writing on
> the subject in the repo. The numbers are in `config.js` and `content.js`.

Starting point for a session focused on chip content (units + settlements)
and getting costs tuned. Everything below is a verified data audit of the
current engine, not a general impression — file:line references throughout
so nothing here needs re-deriving.

## Read this first: two datasets, only one is real

`content/upgrade-chips.csv` has 30 rows and looks like the richer chip set —
**it is not wired to the engine at all.** Nothing under `src/` imports it. It
sits under the guardrail in `docs/v0.3-roadmap.md`: *"Never hand-edit
`content/` or `src/game/content/` — the editor tool owns them; author
through it."*

**The actual live source of truth is `src/game/content.js`'s `CHIPS` export
(lines 116–134) — only 14 chips total.** This file is explicitly *outside*
the guardrail (singular file, not under `src/game/content/`), and its own
header calls it a "PROVISIONAL stub content set for engine development." It's
imported everywhere that matters: `actions.js`, `economy.js`, `contest.js`,
`stats.js`, `influence.js`, `setup.js`, `ai.js`, `engineAdapter.js`, and more.

**First decision needed, before any content work**: either port the CSV's
extra concepts into `content.js` (through whatever the editor-tool workflow
currently is), or retire the CSV so it stops being a trap for the next
person who greps `content/` first, finds 30 chips, and assumes that's real.

## Current live inventory

### Unit chips — 5 total, 2 categories, both thin

| id | cost | tech L→req | loyalty req | effect | chains to |
|---|---|---|---|---|---|
| `drilled-troops` | 2 | 1→L1 | 0 | +1 Strength | `sharpened-blades` |
| `sharpened-blades` | 4 | 2→L3 | 3 | +2 Strength | `cannons` |
| `cannons` | 6 | 3→L5 | 6 | +3 Strength (upkeep 1) | — |
| `navigator` | 2 | 1→L1 | 0 | +1 Movement | *(none)* |
| `landship` | 7 | 3→L5 | 6 | +2 Movement, 2-slot (upkeep 2) | *(none)* |

Strength is a real 3-tier chain. Movement is two standalone chips at
opposite ends of the tech ladder — not even chained to each other. Nothing
exists for a dual-stat chip, or any defensive/utility unit chip (retreat
immunity, pass-through, first-loss-ignore) — all of which exist as concepts
in the disconnected CSV (`captain`, `heavy-armor`, `veteran-crew`,
`field-medics`, `scout-runners`, `iron-discipline`, `saboteurs`,
`war-banner`, `outriders` — 9 unported ideas).

### Location/settlement chips — 9 total, 7 categories, 5 are dead ends

| Category | Chips (cost, tech L→req, loyalty req) | Effect |
|---|---|---|
| Output | `recyclers` (3, L1, 0) → `factory` (5, L3, 3) | +1 / +2 scrap |
| Research | `labs` (3, L1, 0) → `advanced-lab` (5, L3, 3, upkeep 1) | +1 / +2 Research |
| Garrison | `defense-turrets` (4, L3, 3) | +2 garrison Strength — **only option** |
| Unit cap | `training-grounds` (4, L1, 0) | +1 cap, enables recruit — **only option** |
| Foothold | `town-hall` (3, L1, 0) | +1 foothold cap — **only option** |
| Encounter | `recon-team` (3, L1, 0) | Discard+redraw — **only option** |
| Actions | `logistics-hub` (6, L5, 6, 2-slot, upkeep 1) | +1 Action/turn — **only option, most expensive chip in the game** |

Only Output and Research have any progression. The other five — Garrison,
Unit-cap, Foothold, Encounter, Actions — are each a single forced,
un-upgradable purchase with no alternative. The CSV has real depth exactly
where these are thin (3 garrison chips vs. 1 live; a whole unported
"combat support" cluster; an intel/vision chip; card-cycling and
chip-disable effects) — none of it ported.

**Tier structure overall**: only 3 of 14 chips (21%) have any upgrade tier.
Max chain depth is 2 upgrades (3 chips total), and only on the two
economy-adjacent lines (Strength, Output, Research).

## Cost balance — the "always enough to Rush" problem, quantified

Live chip costs range 2–7 scrap (median 4). A single mid-tier location's
per-turn Output (2–5, +2 for a Capital) covers the cheapest chip in one turn
and the priciest in two. With 2–4 locations, aggregate income (roughly
6–20/turn) dwarfs any single chip's cost — no real scarcity past turn 1–2.

The exact mechanism behind "I always have enough scrap to rush a building":

- `CONFIG.economy.rushScrapPerPoint = 1` (`config.js:110`) — Rush is exactly
  1:1 scrap-to-build-point. **No premium over organic building at all.**
- `CONFIG.economy.defaultSlider = 0` (`config.js:108`) — by default, 100% of
  a location's Output banks as liquid scrap and 0% goes toward its active
  build, unless the player manually moves the slider.
- Combined: since Output banks as scrap by default anyway, there is no cost
  difference between letting a build progress organically and immediately
  Rushing it once the scrap exists. Rush strictly dominates waiting. This
  isn't a balance impression — it's an exact mechanical fact from the
  formula, and the fix is almost certainly giving Rush a real premium
  (`rushScrapPerPoint > 1`, or cost scaling with remaining need), and/or
  reconsidering the default slider position.

Two adjacent things worth folding into the same pass, since they touch the
same build/ability systems and are already flagged as placeholder stubs in
code comments:

- `knowledge-cache` and `fortified-ruins` (location abilities,
  `content.js:168-191`) currently resolve to the **literal same effect**
  (+1 VP) despite different costs and completely different intended effects
  (draw-a-card vs. suppress-chip-bonuses per `content/location-abilities.csv`).
- `rail-corridor`'s stub effect nets +3 scrap/turn (pay 2, get 5) for a
  one-time 5-cost build — priced comparably to or better than Factory's
  permanent +2/turn Output chip for the same cost.

## Recommended sequencing

1. **CSV-vs-`content.js` decision first** — everything else depends on
   knowing which file is actually being edited.
2. **Unit chips**: connect `navigator → landship` into a real chain (or add
   a mid-tier), consider porting 2–3 non-stat CSV concepts to break the
   Strength/Movement duopoly.
3. **Location chips**: give Garrison / Unit-cap / Foothold / Encounter /
   Actions each a second option or an upgrade tier.
4. **Rush/slider economy**: real premium on Rush, and/or a different default
   slider position, so organic building isn't strictly dominated.
5. Fix or replace the two identical-effect ability stubs while in the area.

## File map

| File | Role |
|---|---|
| `src/game/content.js:116-134` | Live `CHIPS` registry — the real one |
| `src/game/content.js:138-141` | `CAPITAL` — special per-faction starting chip |
| `src/game/content.js:159-192` | `ABILITIES` — location abilities (incl. the two stub-collision chips) |
| `content/upgrade-chips.csv` | Editor-owned, 30 rows, **disconnected from the engine** |
| `content/location-abilities.csv` | Editor-owned, 6 rows; only 4 implemented, and those 4 don't match the CSV's described effects |
| `content/locations.csv` | Editor-owned; production ranges here also disagree with live `LOCATIONS` |
| `content/config.csv` | Editor-owned; e.g. "Unit spawn cost: 10" vs. live `CONFIG.unitRecruitCost = 6` |
| `src/game/economy.js:20-35` | Tech-Level and Loyalty gating logic for the build menu |
| `src/game/economy.js:54-58` | `effectiveBuildCost` — where a chip's `cost` becomes its build `cost` |
| `src/game/economy.js:92-107` | `buildableChips()` — computes the actual build menu |
| `src/game/actions.js:259-321` | `validateBuild`/`runBuild`/`validateUpgrade`/`runUpgrade` |
| `src/game/actions.js:339-362` | `validateRush`/`runRush` — the Rush formula |
| `src/game/config.js:104-110` | `buildTechGate`, `defaultSlider`, `rushScrapPerPoint` |
| `src/prototype/engineAdapter.js:405-468` | `adaptEconomy()` — builds the HUD's `eco.buildMenu`/`eco.upgrades` |
| `src/prototype/HudChrome.jsx:676-681` | Renders the build menu buttons in the UI |
