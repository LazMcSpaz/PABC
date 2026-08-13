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
3. ✅ **DONE (Stage A — engine + interim AI/HUD)** — Per-entity actions
   are live: every unit and held Location refreshes 1 action at its
   owner's Upkeep; the old global pool survives as a WILDCARD pool (base
   0) fed by effect grants — any entity may spend a wildcard when its
   own action is gone. Payers per the §4 cost table; coalition members
   are charged; fresh recruits and mid-turn captures act from the next
   Upkeep (no same-turn strike). Logistics Hub → its Location acts
   twice; Staging Ground → +1 wildcard for 2 scrap; GRANT_ACTIONS is
   entity-aware (unit targets gain own actions, player targets gain
   wildcards). Interim: the AI loops while any asset has budget (real
   per-asset policies land with the AI overhaul); the HUD dial shows the
   aggregate. Validation: AI games converge FASTER (rounds 16–35) and
   all four factions won across the sample seeds — the first Versari
   win appeared under this model.
4. ✅ **DONE** — Influence pressure: a Location whose own hex sits in a
   rival's dominant ZoC bleeds 1 Loyalty/Upkeep. A plain garrison stalls
   flat under it (rise 1 − bleed 1); Civic Hall out-climbs it; allies
   (pact/vassalage) never pressure each other. Soft hostility priced in:
   each bleeding Upkeep costs the presser 1 Standing with the owner and
   +1 Menace (`CONFIG.influence.pressure`). AI-vs-AI still converges
   (rounds 16–42, all four factions winning across sample seeds).
5. ✅ Policy-sim validation DONE (scripts/sim-vp-race.mjs, 60 trials per
   archetype, idealized frictionless timelines): conqueror-2-cities
   reaches 12 VP ~round 10, conqueror-3 ~9.5, diplomat (2 pacts + a
   vassal) ~11, hybrid ~9, turtle NEVER — the faucets are within ~2
   rounds of each other and turtling cannot win on VP (Recognition is
   its only road). Real games with opposition run roughly 2× these
   floors (AI-vs-AI: rounds 16–42) — consistent. Numbers ship as-is
   pending human playtests. Reward-chip encounter/quest authoring goes
   through the content editor (field-encounters.js is editor-generated;
   engine-side GRANT_CHIP + Old Armory already make rewards reachable).
6. AI overhaul, written once against the per-entity model — NEXT, and
   now unblocked: every system the AI must reason about exists.

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

## 5. Diplomacy robustness pass — ✅ DONE

Diagnosis (playtest): the peaceful road to victory was mathematically
closed. Recognition needs 6 backing but the 4-major field caps at 3
allied points, so the threshold runs through vassals — and vassalage
required the target to be CORNERED (at war, or Wary-or-worse standing).
Peace literally required war. On top of that, Standing drifted toward
zero (history evaporated), and the AI's political moves happened in a
log ticker nobody reads.

Shipped (all engine-checked in harness Phase 19):

- **Standing baselines** (`CONFIG.diplomacy.baseline`): drift now pulls
  each pair toward an EARNED baseline instead of zero, capped ±4.
  Honored pact calls +2 (caller → honorer); broken pacts/promises and
  surprise attacks −2 (victim → traitor); every 4 full rounds of
  unbroken pact +1 both ways. Betrayal scars; old alliances stay warm.
- **Patronage**: a MINOR faction now accepts vassalage peacefully when
  it is much weaker (same power gate), at Friendly+ standing, the suitor
  is its top standing on the board, and reputation gates pass. Majors
  still require the cornered gate. The vassalize verb stays visible for
  pacted minors that would accept (ally → protectorate upgrade), and the
  outcome hint distinguishes submission from welcome.
- **Recognition legibility + summit VP**
  (`CONFIG.diplomacy.recognition.summitVp`): the Hall of Powers now
  carries a "Path to Recognition" checklist — per-faction backing status
  (backs / warming / cold / distrusts / coalition) is public; the exact
  numbers behind it (their Standing vs the Allied bar, your Menace vs
  their tolerance, your Honor vs their floor) are espionage product,
  gated behind Intelligence B1 Spy Ring like foreign tech wheels. The
  raw per-row tolerance/trustFloor numbers in the adapter are gated the
  same way (the anonymised bars stay public). Engine side, the first
  time each faction EVER backs a major it banks +1 VP ("summit"), so
  diplomacy pays into the same VP race conquest does — tracked in
  `state.diplomacy.recognizedEver`, once per backer per game. VP-race
  sim: diplomat now reaches 12 VP in 100% of trials, mean round 10.1
  (conqueror 9.5, hybrid 8.1, turtle never).
- **Herald callouts** (`src/prototype/HeraldBanners.jsx`): transient
  banners telegraph political moves — AI wars/pacts/betrayals,
  coalitions, vassalage, denouncements, summit VP, pact calls, tribute
  demands, and tier crossings in how each power regards you. Moves the
  human initiated and composite-event echoes are filtered; the event
  feed keeps the full record.

Flagged for later (explicitly NOT now, per design call): consolidate the
logistics + construction tech trees and promote Diplomacy to the fourth
tree — noted only; no tech-wheel changes in this pass. Also still
deferred: treaty types (protection contract, non-aggression, territorial
cession) and the AI overhaul (per-asset policies, un-fencing AI-initiated
diplomacy toward the human).

## 6. Diplomacy tuning pass (2026-08-13 playtest log) — ✅ DONE

The first full playtest of §5 exposed five systemic failures, each traced
to a specific log line and fixed with a harness check (Phase 20):

- **Coalition conscription (the big one).** The R7 coalition against Free
  Plainers drafted the HUMAN: declared war on their behalf, force-pacted
  them with every member at Allied 8, and minted 4 free summit VP.
  Coalitions now never enroll the human (they join by declaring war on
  the target themselves — `declareWar` adds any volunteer to the member
  list), members bury quarrels (peace + small warmth) but form NO pacts,
  and a faction already hunted by one coalition can't be drafted into
  another. No allied web, no free VP, no residue after dissolve.
- **Menace laundering.** Attacking Grand Lakers (aggression 0.9) REDUCED
  the attacker's Menace by 2 per strike — the playtest human went 5 → 0
  by fighting. The "checking a warlord" discount is now clamped at −1.
- **Trespass shredding.** 46 trespass citations in 8 rounds. Now one
  citation per (mover, owner) pair per round; Neutral-or-better hosts
  issue a warning (−1 Standing, no Menace); only distrustful hosts treat
  passage as a probe (−2, +Menace).
- **Mediation Honor pump.** Goldgrass re-mediated the same feud every
  round (R2–R5), farming +2 Honor and +3 Standing per cycle. Mediated
  pairs now carry a cooldown (`ai.mediateCooldownRounds`).
- **Vassal revolving door.** Clan Tempest rebelled and was re-vassalized
  by the same lord in the same round. Rebels now refuse their old lord
  for `vassal.rebellionCooldownRounds`.

Also in this pass:
- **AI casus belli.** A 0.1-aggression diplomat faction declared four
  wars via the blind combat loop (contest whatever you stand on). The AI
  now opens hostilities only with a reason: existing war, Wary-or-worse
  contempt, or aggression ≥ `ai.blindAttackAggressionMin`. Pacted
  factions are never blind-struck; goal-seeking skips towns the faction
  wouldn't fight for. The AI's vassalize move now routes through
  `aiAcceptsVassalage` (gaining patronage + the rebellion cooldown).
- **Gift ladder.** A gift's counted scrap is capped
  (`gift.maxScrapPerGift`) so one bribe can't buy a pact, and a gift that
  lands (≥2 Standing) warms the BASELINE (`gift.baselineWarmth`) — drift
  no longer erases sustained generosity (playtest: +2 gift eaten in two
  rounds).
- **Encounter self-standing bug.** `fe_versari_courier` logged "Versari
  standing toward Versari" — the ADJUST_STANDING effect bypassed the
  engine guards. It now routes through `adjustStanding` (self no-op,
  clamped, caused).

Post-tuning: harness 377 green across seeds; AI-vs-AI winners spread
across all four majors (was Goldgrass-skewed); VP race — conqueror
9.6–10.1, diplomat 10.1, hybrid 8.1, turtle never.
