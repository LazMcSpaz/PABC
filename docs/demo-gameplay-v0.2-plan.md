# Implementation Plan — Gameplay Revision v0.2 (Movement, Attrition, Combat)

For a fresh agent. Self-contained. **Read `docs/mechanical-spec-v0.1.md` §16 first** —
it is the design of record; this doc is the *how/where*. Where §16 and the
older sections disagree, §16 wins.

## Goal

Make each turn a real decision: movement stops eating Actions, the board
holds more (more-expendable) units with real attrition, and combat gains
deterministic levers. Demo quality — favour working over polished.

## Branch & starting state

- Build on `claude/ashland-conquest-demo-BViiz` (the demo branch — it has
  the live-engine UI, contest overlay, multi-token hexes). Confirm with the
  user before the first push; do **not** target `main` (it has none of the
  demo work).
- `git fetch origin && git merge origin/main` first to pick up content snapshots.
- **Don't touch** `content/` or `src/game/content/` (content territory).
- The 2D prototype (`src/prototype/`) is the live demo UI driven through
  `engineAdapter.js`. A future 3D layer would consume the same adapter — keep
  the engine render-agnostic.

## How to drive / verify the engine

- Headless: `node src/game/harness.js [seed]` — exercises the engine and has an
  AI smoke test at the bottom. Extend it; keep it green.
- Browser: `npm run dev`, then a Playwright script pointed at the dev server
  using the `executablePath` for the preinstalled chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Hex cells carry a
  `data-hex="hN-M"` attribute for targeting. To reach a contestable location
  deterministically, compute the path offline with `bfsDistances` and replay
  the hex ids (don't guess-click).

## Engine map (files you'll touch)

| File | Role / what changes |
|---|---|
| `src/game/config.js` | `CONFIG` constants — bump movement, add cap/heal/combat numbers |
| `src/game/setup.js` | `createGame` — 2 starting units, new unit fields, reinforcement queue |
| `src/game/turn.js` | `startTurn` — reset move budget, passive heal, fortify flag; `runRoundEnd` / a sweep — reinforcement arrival |
| `src/game/actions.js` | `ACTIONS` map + `performAction(state,type,params,ctx)` — Move cost→0, new Reinforce action, contest ends movement |
| `src/game/contest.js` | `runContest` — attrition, death, salvage, concentration/terrain/fortify/veteran modifiers, raid retreat-choice |
| `src/game/stats.js` | `recomputeStats` reads `baseStrength`/`baseMovement`; attrition mutates `baseStrength` then recomputes |
| `src/game/effects.js` | new `ADJUST_BASE_STRENGTH` effect so encounters can wound/heal |
| `src/game/events.js` | add event names (below) |
| `src/prototype/engineAdapter.js` | surface `moveRemaining`, `baseStrength`, `veteran`, `fortified`; extend `previewLocationContest` with the new modifiers |
| `src/prototype/Prototype.jsx` | reachable set uses `moveRemaining`; reinforce UI; salvage prompt; contest viz from new detail |
| `src/prototype/UnitPanel.jsx` | show base/cap Strength, moves left, Reinforce buttons, veteran/fortify badges |
| `src/prototype/ContestOverlay.jsx` / `EventFeed.jsx` | show modifiers + new events |

New `EVENT_NAMES` (add to the set in `events.js`): `unit_destroyed`,
`unit_salvaged`, `base_strength_changed`, `unit_reinforced`,
`reinforcement_requested`, `reinforcement_arrived`, `veteran_promoted`.

## CONFIG additions (suggested starting numbers — tune later)

```
unit.baseMovement: 2            // was 1
baseUnitCap: 3                  // new (cap = baseUnitCap + trainingGrounds)
startingUnits: 2                // new
unitRecruitCost: 6              // was 10
unit.baseStrengthCap: 4         // normal cap
unit.veteranStrengthCap: 8      // combining (deferred)
attrition.routMargin: 4         // >= this spills a 2nd stacked unit
heal.passivePerTurn: 1
heal.scrapPerStrength: 2        // instant + field top-up
combat.concentrationPerUnit: 1
combat.concentrationCap: 3
combat.mountainDefenseBonus: 1
combat.fortifyBonus: 1
combat.veteranBonus: 1
veteran.winsToPromote: 3
veteran.survivedToPromote: 5
```

## New / changed unit fields (`setup.js` unit creation)

Add to each unit: `baseStrength` (already), `moveRemaining` (=`baseMovement`),
`movedSinceUpkeep: false`, `fortified: false`, `contestsWon: 0`,
`contestsSurvived: 0`, `veteran: false`. Keep `immobilizedUntil` (still used by
the §3.2 immobilize timer for the raid-retreat pursuit window, but the
immobilize *outcome* is removed — see §16.4).

State-level: `state.reinforcements = []` (queue of pending field reinforcements).

---

## Phase 1 — Movement is its own budget

**Engine**
- `config.js`: `unit.baseMovement` 1 → 2.
- `setup.js`: init `moveRemaining` on each unit.
- `turn.js startTurn`: for each unit owned by the active `pid`, set
  `moveRemaining = unit.movement` (effective movement, post-recompute) and
  roll the fortify flag: `unit.fortified = !unit.movedSinceUpkeep; unit.movedSinceUpkeep = false`.
- `actions.js`:
  - `ACTIONS.move.cost = 0`.
  - `validateMove`: replace the `dist > unit.movement` check with
    `dist > unit.moveRemaining`.
  - `runMove`: `unit.moveRemaining -= dist; unit.movedSinceUpkeep = true`
    (compute `dist` via `bfsDistances(adjacency, from)[to]`).
  - `runContest`: at the end (any outcome), set the initiator's
    `moveRemaining = 0` (movement ends on a declared contest).

**UI**
- `engineAdapter.js`: put `moveRemaining` on each adapted unit.
- `Prototype.jsx`: the `reachable` `useMemo` currently keys off
  `unit.effectiveMovement` — change to `moveRemaining`.
- `UnitPanel.jsx`: show "Moves L/R" using `moveRemaining` / `movement`.

**Verify**: a unit can move twice in one turn and still have 2 Actions; after a
contest it can't move; harness still green.

**Commit**: "v0.2 Phase 1: movement budget separate from Actions".

---

## Phase 2 — Two units, higher cap, cheaper recruit

**Engine**
- `setup.js`: spawn `CONFIG.startingUnits` (2) per faction at/adjacent to the
  start Location (place the 2nd on an adjacent friendly/empty hex; fall back to
  same hex — multi-token rendering handles stacks).
- `config.js`: `baseUnitCap: 3`, `unitRecruitCost: 6`.
- `actions.js validateRecruit`: cap = `CONFIG.baseUnitCap + trainingGroundsCount`.

**UI**: already handles stacks (token slots, per-unit selection). Update the
`unitCap` shown in the adapter (`1 + tg` → `baseUnitCap + tg`).

**Verify**: each faction starts with 2 units; recruit blocked at cap 3 (no TG)
and allowed past it with Training Grounds.

**Commit**: "v0.2 Phase 2: two-unit start, cap 3, cheaper recruit".

---

## Phase 3 — Attrition, death, salvage

All inside `contest.js runContest`, after `won` is known and the section/raid
result is applied. Helper `loseBaseStrength(state, unitUid, n)`:
decrement `unit.baseStrength`, `recomputeStats(state)`, emit
`base_strength_changed`; if `baseStrength <= 0` call `destroyUnit`.

- **Loser −1.** Location contest: the loser is the initiator (on a loss) or, on
  a win against a unit-backed defence, the defending unit. Raid: the losing
  unit. Garrison-only defence has no unit to wound.
- **Pyrrhic:** if `|initiatorTotal - defenderTotal|` resolves to a winning
  margin of 0 (tie → defender) or 1, the **winner** also loses 1 — only if the
  winner is a unit (initiator, or a defending unit). A garrison can't attrit.
- **Rout:** if margin ≥ `CONFIG.attrition.routMargin` (4), find a second
  friendly unit on the **loser's** hex and `loseBaseStrength(... ,1)` it too.
- **`destroyUnit(state, unitUid, killerUid|null)`:** delete from `state.units`;
  emit `unit_destroyed`; if `killerUid` and the dead unit had chips, run a
  `FORCE_CHOICE` via `ctx.interact({kind:"salvage", chips:[...], bayFree:N})`
  (headless default = take as many as fit); push chosen chips to the killer's
  bay (respect `baySlots`), emit `unit_salvaged`; remove the rest. If killer is
  null/garrison, all chips are removed. Then `recomputeStats`. If the dead unit
  was a defending/controlling presence, no special control change is needed —
  control lives on the Location, not the unit.
- **Raid retreat (replaces §9 immobilize/destroy):** on a raid win where the
  loser survives, offer the loser a retreat: `ctx.interact({kind:"retreat",
  options:[adjacent hexes ...]})` (headless default = first valid, or stay).
  Drop `resolveRaidWin`'s immobilize-or-destroy-chip block entirely.

**Effects**: add `ADJUST_BASE_STRENGTH` to `effects.js` (`{amount, target}`),
clamping to `[0, cap]` and destroying at 0 — so encounters can wound/heal. Add
it to the §2 locked list note in `content-schema-v0.1.md`.

**UI**
- `ContestOverlay.jsx`: after the outcome, if a unit died, show the salvage
  `FORCE_CHOICE` (checkbox the chips up to bay space) before Exit. Surface
  attrition ("−1 Strength") on both sides.
- `EventFeed.jsx`: label `unit_destroyed`, `unit_salvaged`,
  `base_strength_changed` (only show notable ones).
- The contest viz should read base-strength changes from the result detail
  (extend `runContest`'s return with `attackerStrLost`, `defenderStrLost`,
  `killed`, `salvage`).

**Verify (harness)**: stage two weak units, contest repeatedly; confirm −1 per
loss, death at 0, salvage transfer, pyrrhic on margin ≤1, rout spillover on
margin ≥4.

**Commit**: "v0.2 Phase 3: attrition, unit death, chip salvage".

---

## Phase 4 — Reinforcement & healing

**Passive heal** — `turn.js startTurn`, after foothold tick: for each unit
owned by `pid` on a Location it fully controls, `baseStrength = min(cap,
baseStrength + CONFIG.heal.passivePerTurn)`; `recomputeStats`; emit
`unit_reinforced`.

**Instant top-up & field reinforcement** — new `ACTIONS.reinforce`
(cost 1 Action). `params = {unit, mode}`:
- `mode:"instant"` — validate unit on a friendly fully-held Location and below
  cap; charge `2 * (cap - baseStrength)` scrap; restore to cap now.
- `mode:"field"` — compute `N` = shortest path length from the nearest friendly
  Location to the unit **through friendly/neutral hexes only** (write a small
  filtered BFS; enemy-controlled location hexes are walls). If unreachable,
  fail. Charge scrap for the intended restore amount up front; push
  `{owner:pid, targetUnit, amount, arrivesRound: round + N, originHex}` to
  `state.reinforcements`; emit `reinforcement_requested`.

**Arrival sweep** — in `runRoundEnd` (or each `startTurn`): for each pending
reinforcement, recompute ETA against the unit's *current* node (it re-targets a
moving unit); when `round >= arrivesRound`, apply the restore (capped), emit
`reinforcement_arrived`, remove it. **Severed supply:** in
`captureLocation`, for any pending reinforcement whose `originHex` was just
captured, convert it to a **new unit** at its current waypoint with base
Strength = carried amount (cap 4), no chips (allowed past unit cap), and drop it
from the queue.

**UI**
- `UnitPanel.jsx`: "Reinforce (here)" when on a friendly Location; "Send
  reinforcements" otherwise → shows cost + ETA.
- Board overlay: a pulsing directional arrow from the nearest friendly Location
  toward the unit with `+N` and `N — Turns`. Read from `state.reinforcements`
  via the adapter.
- Rename the `new-recruits` chip in `content.js` to a gear name (keep
  `strength: 1`); update the id→UI map in `engineAdapter.js`.

**Verify**: passive +1 on home Location; instant top-up to cap; field
reinforcement arrives after N turns and re-targets a moving unit; capturing the
origin strands it as a chip-less unit.

**Commit**: "v0.2 Phase 4: passive heal + instant/field reinforcement".

---

## Phase 5 — Combat levers

Implement the §16.6 formula in `contest.js` (compute additive modifiers before
the roll) and mirror it in `engineAdapter.previewLocationContest` so the
Contest tab and overlay show the breakdown.

- **Concentration:** count friendly units on the contesting unit's hex minus 1;
  `min(count, CONFIG.combat.concentrationCap)` added to the attacker. For the
  defender, count the controller's units on the Location hex minus the defending
  unit; same cap.
- **Mountain:** `+CONFIG.combat.mountainDefenseBonus` to the defender when the
  hex is mountain. **Terrain types aren't in the engine yet** — add a
  `terrain` field to hexes (default `null`) and treat `"mountain"` specially;
  full terrain generation is deferred, so for now allow the harness/test to set
  it and leave generation alone.
- **Fortify:** `+CONFIG.combat.fortifyBonus` to a defending unit whose
  `fortified` flag is set (didn't move last turn — flag rolled in `startTurn`,
  Phase 1).
- **Veterancy:** after each contest, increment `contestsWon` (winner's
  participating unit) and `contestsSurvived` (each surviving participating
  unit); promote to `veteran:true` (emit `veteran_promoted`) when
  `contestsWon >= 3 || contestsSurvived >= 5`. Add `+CONFIG.combat.veteranBonus`
  to a veteran's side.

**UI**: Contest tab + `ContestOverlay` show "4 base +2 concentration +1 veteran
+1d6"; `UnitPanel` shows a Veteran badge and a Fortified badge.

**Verify**: stacking raises the attacker total (capped at +3); a mountain /
fortified / veteran defender adds its +1; a unit promotes after 3 wins or 5
survivals.

**Commit**: "v0.2 Phase 5: concentration, terrain, fortify, veterancy".

---

## Deferred (design in §16.7 / §16.8) — not in this build

- **Combining units** (cap 8, 3 bay slots with overflow salvage, −1 movement).
- **Terrain generation** beyond a settable `mountain` flag.
- **True adjacent flanking** (this build does same-hex Concentration only).
- A **balance pass** on garrison values and the 12-VP pace once the above lands.

## Cross-cutting reminders

- `performAction` already takes a 4th `ctx` arg — route salvage/retreat
  prompts through `ctx.interact` (headless default picks the first/greedy
  option) so the harness stays deterministic and the UI can prompt.
- Keep the harness AI smoke test passing after every phase; extend it to
  exercise attrition and reinforcement.
- One commit per phase, pushed after each, matching the existing cadence.
