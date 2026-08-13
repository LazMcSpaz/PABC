# Victory Points & Per-Entity Actions — Design Record

Decisions from the Aug 2026 design sessions, with simulation evidence.
Companion to `docs/chip-set-v0.1.md` / `docs/location-chips-v0.1.md`.
Status: **design locked, implementation pending** except where marked.

## 1. The VP system — one clock, several faucets

Background: the placeholder +1-VP abilities were the game's only
repeatable VP source; removing them (they're now real effects) left
capture VP (first-time-only, 18 on the board) as the only VP, and full AI
games stall. The fix is a set of faucets so every faction temperament has
a path to the same threshold:

1. **Foreign dominion tick (conquest).** At Upkeep: +1 VP per high or
   veryHigh Location you fully hold at Loyalty 6+ **that is not one of
   your own affiliated cities**. Your homeland never ticks — dominion is
   rule over others' land. Why not veryHigh-only: setup places each
   faction's stronger affiliated city 1–2 hexes from its start
   (board.js), so a veryHigh-only tick hands Versari (Dambar) and Lakers
   (Chigan) a front-yard VP engine by construction. Foreign-only is
   symmetric: every faction has 4–5 eligible targets. Integration is the
   contestable window — capture starts at Loyalty 2, climbs 1/garrisoned
   Upkeep, so a conquest doesn't tick for ~4 turns; loyalty peeling,
   sabotage, or recapture stops the clock. Civic Hall becomes a VP
   accelerator (emergent chip role).
2. **Vassal dominion (diplomacy).** A vassal's qualifying cities
   (high/veryHigh, fully held by the vassal, Loyalty 6+) tick +1 for the
   **overlord**. Same clock, different verb: take it by sword or bring
   its owner under your wing. Rides the existing vassalage machinery;
   self-balancing via rebellion.
3. **Alliance trickle (diplomacy).** A passive VP drip for the broadly
   allied: e.g. +1 VP per Upkeep while pacted/allied with a majority of
   surviving major factions. Numbers TBD — playtest-tuned.
4. **Quest VP (authored).** The quest system already pays
   `rewardForClaimant` — VP quests are pure content authoring.
5. **Recognition victory** stays as the instant diplomatic checkmate
   (§18.13), on top of the trickles.

**Influence pressure (approved direction, own design pass):** a Location
inside YOUR dominant ZoC while controlled by someone else bleeds 1
Loyalty/Upkeep despite its garrison — the soft-power siege, feeding the
dominion faucets bloodlessly. Balancers: (a) requires influence
*dominance* on the target's own hex (out-project the owner at home —
steep; Broadcast-tier work), (b) **over-exertion is soft hostility**:
pressuring a city raises Menace / hits Standing with its owner, so the
schemer route provokes retaliation just like the sword route does.

**Elimination rule:** a faction with no Locations and no units is
eliminated and removed from the turn order (today it sits dead forever
accumulating scrap).

## 2. Per-entity actions — the model

Global action pool retired. Movement already went per-unit in v0.2;
build/upgrade/slider are already action-free. The rework finishes that
journey:

- **Units: 1 action each per turn** — contest, build-post, future
  blockade construction. Movement stays its own budget; fortify stays
  "didn't move."
- **Locations: 1 action each per turn** — rush, recruit, instant
  reinforce, ability activation. Queueing a build stays free.
- **Player verbs** (diplomacy; sabotage is once/round already) stay off
  the entity system.
- Re-mappings: Logistics Hub → its Location acts twice; Staging Ground →
  a unit here gains a second action; GRANT_ACTIONS becomes
  entity-scoped.

### The coalition contest rule (LOCKED — engine support merged)

One contest per unit action. To fight with **combined** strength, every
participating unit spends its action on that one contest: 4 units = one
full-strength push, or up to 4 solo contests at individual strength, or
any split (pairs, 3+1, …). Concentration (bodies on the hex) still counts
for everyone present. Engine: `contest` accepts `params.coalition`
(allied uids joining the initiator); absent = legacy whole-stack
(back-compat until the action rework lands, when the dispatcher will
charge each member's action).

### Simulation evidence (scripts/sim-contest-models.mjs, 200 trials/cell)

Attacker stack starts on the wall, full 3 sections, real engine turn loop
(defender heals/fortifies at its Upkeep). Capture% / mean turns / mean
attacker Strength lost:

| Scenario | A: legacy 2-action | B: naive per-unit | C: one big push | C: all solo | C: pairs |
|---|---|---|---|---|---|
| Medium (g6, 0 def, 2 atk) | 100% / 2.0 / 0.0 | 100% / 2.0 / 0.0 | 100% / 3.0 / 0.0 | 100% / 2.2 / 1.4 | 100% / 3.0 / 0.0 |
| High (g8, 1 def, 3 atk) | 84% / 2.1 / 2.6 | 91% / 1.4 / 1.9 | 80% / 3.4 / 3.0 | 0% / — / 12.0 | 7% / 2.1 / 11.3 |
| VeryHigh (g10, 2 def, 4 atk) | 40% / 2.1 / 10.0 | 46% / 1.2 / 9.2 | 36% / 3.4 / 10.6 | 0% / — / 16.0 | 0% / — / 16.0 |
| VeryHigh, geared (Bombard + T2 ×3) | 100% / 2.0 / 0.0 | 100% / **1.0** / 0.0 | 100% / 3.0 / 0.0 | 0% / — / 16.0 | 8% / 2.0 / 14.8 |

Readings:

- **B is the steamroll, confirmed**: a geared stack deletes a veryHigh
  city 100% of the time in ONE turn — zero defender reaction window.
  This is what the coalition rule exists to prevent.
- **C produces the intended decision**: against real cities, solo spam is
  suicide (0%, army annihilated) and the big push is the strategy —
  sieges take ~3 turns, restoring the defender's between-turn counterplay
  without any hard cap. Splitting stays correct against weak targets and
  for mop-up. Roles emerge instead of rules.
- **Gear is the siege key**: ungeared 4-stack vs veryHigh = 36% at heavy
  cost; with Bombard + T2 blades = 100% at zero cost. Walls demand
  answers; the T2/T3 strength line is that answer. (Zero-loss is
  optimistic — the sim's defenders had no chips/reactives/reinforcement;
  relative comparisons are the reliable part.)
- **Conquest velocity drops vs legacy** (~3 turns vs ~2 per city). Fine —
  the dominion clock adds win pressure — but watch pacing in playtests;
  the levers are garrison bands and section count.

### Sensitivity run (sections 3/4/5 × geared defenders, 200 trials/cell)

The model ordering NEVER flips: B fastest, A middle, C slowest, at every
section count and with or without defender gear. Two bonus findings:

- **Section count is a pure linear pacing dial under the coalition
  rule** (3 sections → 3.0 turns, 4 → 4.0, 5 → 5.0 for the big push),
  while naive per-unit actions mostly ignore it (1.0 / 1.0 / 2.0) —
  more evidence B deletes the capture clock entirely. If sieges need
  slowing later, sections are the knob.
- **Geared defense is a proportional counter**: Stronghold + T2-armed
  defenders drop capture rates from 100% to ~82% for every model
  equally — the earlier zero-loss geared-attacker result was an
  artifact of naked defenders, as suspected.

## 3. Implementation order

1. ✅ **DONE** — Dominion tick (foreign + vassal), alliance trickle (+1),
   elimination + last-standing rule, and the chip-removal ruling
   (remove-chip action: unit chips drop as hex loot, location chips are
   demolished, the Capital is locked). Validation: all 8 tested seeds of
   AI-vs-AI now END (winners at rounds 21–54, previously 0/8 by round
   376+), with eliminations occurring and winners spread across
   temperaments — including Goldgrass winning most via naturally-formed
   pacts feeding the trickle. Versari never won in the sample: expected,
   their influence-pressure tools don't exist yet (item 4) and the AI
   doesn't scheme (item 5).
2. ✅ **DONE** — Ability roster pass: pool grown 4 → 10 (2 veryHigh + 4
   high seats now draw from 4 + 6). Staging Ground priced at 2 scrap;
   Rail Corridor's interim effect is +2 Movement for a stationed unit
   (rail-flavored tempo, not a scrap faucet); Blacksite (suppress any
   enemy chip until your next turn — paid upkeep can't revive it early);
   Scrapyard (strip an enemy unit's chip into hex loot); Old Armory
   (once per game, digs up a random reward chip); Beacon Hill (+1
   Influence range); The Springs (+2 heal for ANY owner's units
   standing there); Toll Gate (+1 movement tax on its hex + ring).
   content/location-abilities.csv is now generated by
   scripts/export-chips.mjs alongside the chip mirror.
3. Per-entity action rework (units/locations 1 action; coalition charging;
   chip/tech re-mappings; HUD).
4. Influence pressure (own pass — ZoC dominance bleed + Menace cost).
5. AI overhaul, written once against the per-entity model.

## 4. Action rework — implementation plan (next up)

The locked cost table (who pays for what once the global pool retires):

| Action | Payer | Notes |
|---|---|---|
| move | nobody | already its own per-unit budget (v0.2) |
| contest | initiating UNIT + every coalition member | `params.coalition` exists; dispatcher charges members |
| build-post | UNIT | the builder digs in |
| recruit | LOCATION | the town musters |
| reinforce (instant) | LOCATION the unit stands on | the depot does the fitting |
| reinforce (field) | ORIGIN Location of the convoy route | it dispatches the convoy |
| rush | LOCATION | |
| remove-chip | LOCATION | the refit yard works |
| activate (ability) | LOCATION | replaces `cost.action`; scrap costs stay |
| build / upgrade / set-slider | free | queuing intent stays free |
| activate-chip | free | scrap is the cost (Cold Camp) |
| sabotage / diplomacy verbs | player-scoped | sabotage keeps its once-per-round stamp |

Re-mappings: chip `actionBonus` (Logistics Hub) grants its LOCATION +1
action ("the city works overtime"); Staging Ground's GRANT_ACTIONS
retargets to `stationed_unit` (+1 unit action — the launchpad);
GRANT_ACTIONS becomes entity-scoped generally (pendingActionGrants and
reactive-card grants resolve onto an entity).

File inventory: state (unit.actionsRemaining / loc.actionsRemaining,
reset in startTurn), actions.js dispatcher (per-action payer resolution
replaces the flat `cost` field), effects.js GRANT_ACTIONS, ai.js (loops
over the global pool today — becomes per-asset policies; this IS the AI
overhaul's entry point), HudChrome/engineAdapter (per-entity action
pips replace the global counter), harness (many fixtures set
`players[x].actions.remaining = 99` — replace with entity-budget
helpers). Sim script model definitions collapse: model C becomes simply
"the rules".
