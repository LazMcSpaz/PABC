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

## 7. ZoC legibility, graduated trespass, just war, precursor warnings — ✅ DONE

Second playtest feedback round:

- **ZoC borders.** Zone of Control now renders as a DASHED border ring in
  the dominating faction's color (dashed = influence, solid rims =
  ownership) over a much fainter area tint. When one of YOUR units stands
  on foreign ground the ring burns hotter and denser — the "you are
  trespassing" cue. (`Hex.jsx` SVG overlay; adapter exposes
  `zocForeign`/`zocTrespassing`.)
- **Graduated trespass (Civ-style).** On Neutral-or-better ground,
  consecutive rounds of presence walk `trespass.escalation` = [warning,
  −1, −2/round]; leaving for a round resets the ladder. A presence sweep
  at startTurn keeps the streak alive for parked units. Distrustful hosts
  (below Neutral) still cite at the full rate (+Menace) immediately — and
  a pair the ladder itself drove below Neutral loses the courtesy, by
  design. Warnings and citations herald to the human.
- **Just war.** A war is JUSTIFIED for a side that formally denounced the
  target within `justWar.denounceWindowRounds`, or was wronged by them
  (broken pact/promise, surprise attack) within
  `justWar.grievanceWindowRounds`; rebellion is always justified for the
  rebel. Fighting a justified war generates NO Menace. Denounce → declare
  is now the clean path to war; the declare-war verb hint shows
  JUSTIFIED vs UNPROVOKED with the reason.
- **Precursor warnings.** Once per `warnings.cooldownRounds`, an AI whose
  regard for the human sinks to Wary sends word (`diplomatic_warning`,
  heralded with temperament flavor — a warlord threatens, a pacifist
  pleads, an opportunist hints); the board "murmurs" when the human's
  threat score reaches `warnings.coalitionFraction` of the coalition
  threshold, before any coalition forms.

Harness Phases 20–21 cover the ladder, the sweep, justification +
expiry, the Menace exemption, and both warning kinds — 389 checks green.
Possible polish later: surface the trespass warning inside the
move-confirm overlay itself (pre-move), not just the herald.

## 8. Pace, siege & legibility (2026-08-15 playtest #2) — ✅ DONE

Five reports, each traced to a mechanism in the log:

- **"War declared and peace made in the same turn."** Peace adjusted
  Standing by +3, which from Hostile (−6) landed on exactly −3 — the Wary
  line the AI's combat loop treats as contempt. So the AI attacked again
  immediately and `onAttack` auto-declared war. Peace is now a **truce**:
  a binding window (`diplomacy.truce.rounds`) during which neither side
  opens hostilities, plus a Standing floor. Striking through one is
  treachery (Honor + Menace toll, and the victim earns a justified war).
  Measured over 24 sim games: peace→war-within-one-round churn **201 → 0**.
- **"One successful contest and I lose control of everything."** Control
  was all-or-nothing: any single flipped section cleared `loc.controller`
  and the place went dark — no output, no influence, no rights. Control
  is now **graduated** (`src/game/control.js`): *full* (3/3) keeps every
  right; *majority* (2/3) keeps a reduced economy
  (`economy.partialOutputScale`), still projects influence
  (`influence.partialHolderScale`), still anchors its own hex, and still
  ticks Dominion. You are besieged, not evicted.
- **"An AI's ZoC covered my city and I couldn't have troops there."**
  Real bug, and a compound one: a city with one flipped section stopped
  projecting influence entirely, so a neighbour's ZoC swallowed its own
  hex — and the trespass system then cited the rightful holder's garrison
  **at home** (log #1518: the human "trespassing" in Erport, a city they
  held 2 of 3 sections of). Fixed at both ends: a held Location now
  **anchors its own hex** in the ZoC map, and trespass never fires on a
  hex you hold. The soft-power siege survives the anchor by reading the
  raw Influence *field* (`pressureSource`) instead of the ZoC map.
- **"AI diplomacy feels spastic."** Beyond the churn fix: coalitions gained
  a minimum life and a re-form cooldown (`coalition.minRounds` /
  `reformCooldownRounds`) so they stop flickering, a faction under truce
  is never drafted into one, and `ai.blindAttackAggressionMin` rose to 0.7
  so ordinary opportunists stop treating adjacency as a casus belli.
- **"I wanted a Civ-style dialogue box."** Warnings now open an **envoy
  audience** (`EnvoyModal.jsx`) — faction portrait, temperament-flavored
  opener, the concrete grievance (menace / honor / trespass / betrayal),
  and three answers: hear them out, send scrap, or defy them. The herald
  banner for warnings was removed so the same event notifies once.

### Tuning, and why

Truce + graduated control initially **deadlocked** the sim (24/24 games
converged before, 16/24 after; 7 stuck at 120 rounds with leaders
stranded at 9–11 VP). Ablation isolated two causes, both mine:
- The truce's Standing floor lifted former enemies to Neutral, and since
  the AI only presses at Wary-or-worse, the map became permanently
  pacified. Floor now stops at **Wary (−3)** and the window is **2 rounds**
  — long enough to kill same-turn churn, short enough that wars resume.
- `victory.dominionLoyaltyMin` 6 → **4**. The rung was calibrated for the
  old model where a held city was quiet; under graduated control a
  contested city hovers at Loyalty 1–4, so the faucet ran dry exactly when
  leaders needed it. (Flagged for review — it is a real balance change.)

Validated on 30 **unseen** seeds: 27/30 converge, mean 16.1 rounds,
churn 0, all four majors winning. Harness 403 green across seeds.

## 9. VP route balance — scaling alliance trickle — ✅ DONE

Audit question: is VP easier to accumulate by conquest or diplomacy?

Measured steady-state rates (idealized end-states, repeating faucets only)
and 40 full AI games. The finding was structural, not numeric:

> **Dominion scales with each city taken; the alliance trickle was flat.**

Every conquered high-value city paid twice — a one-time 2–3 VP capture
plus +1/round of Dominion forever — so a fourth conquest still added
+1/round. A fourth ALLY added nothing: the trickle paid a flat +1 for
holding a majority of pacts, no matter how many allies you had. Diplomacy
therefore had a lower ceiling (3.00 vs 4.00 VP/round) *and* its only
scaling faucet (vassal-dominion) sat behind the hardest requirement in
the game.

Fix: the trickle still requires a MAJORITY of surviving majors to unlock,
but past that bar it pays **per allied major**. Breadth of alliance now
scales the way breadth of conquest does.

| | before | after |
|---|---|---|
| alliances only (2 of 3 majors) | 1.33 VP/rd | 2.40 VP/rd |
| alliances + 1 vassal city | 2.40 VP/rd | 3.50 VP/rd |
| conquest, 4 foreign high-value cities | 4.00 VP/rd | 4.00 VP/rd |
| archetype race — diplomat | round 10.0 | round 7.0 |
| archetype race — conqueror (3 cities) | round 8.0 | round 8.0 |
| winners' VP from alliance (40 AI games) | 12% | 18% |

Convergence held: 28/30 unseen seeds, mean 15.2 rounds, peace→war churn 0,
all four majors winning. Harness 405 green.

Notes for later:
- The archetype race now has the diplomat (7.0) slightly AHEAD of the
  conqueror (8.0) on raw payout. That looks right on reflection — the sim
  hands both routes their end-state for free, and alliances need three
  rivals to consent while conquest needs only your own units — but it is
  the number to watch if diplomacy starts feeling dominant in play.
- **Vassals double-dip**: `vassalize` forms a pact, so a vassalized major
  counts BOTH toward the alliance trickle and toward vassal-dominion.
  Pre-existing, left alone deliberately. If diplomacy overshoots, excluding
  vassals from the trickle is the first lever — it keeps "voluntary
  alliance" and "subject holdings" as distinct faucets.
- Recognition instant-win still fires 0/40 in AI games. The path exists
  (patronage 2 minors = 4, plus 2 allied majors = 2, hits the threshold of
  6); the AI simply never walks it. Confirm in human play before tuning
  the threshold.

## 10. VP is HELD, not banked — abilities withdrawn, roster grown (2026-08-16)

Design call, three parts. The first replaces most of §1.

### 10.1 The scoreboard is the map

> "A faction holds the VP for a location so long as they hold the location. A
> place worth 2 VP is worth the full amount if the loyalty counter is over half,
> half of the VP if under half. No ticking up over time, just check for
> ownership."

Implemented in the new `src/game/victory.js`. A faction's total is now:

```
vp = bankedVp + settlementVp
```

- **`settlementVp`** is recomputed from the board. Each Location pays
  `vpReward` to whoever holds it (`holdsLocation` — full 3/3 *or* majority
  2/3, the same bar the rest of the engine uses), halved (floor) when Loyalty
  is at or below half the counter. Capitals store `loyalty: null` and always
  count as settled.
- **`bankedVp`** is the ratchet: recognition summits, encounter/quest grants,
  the alliance trickle. Those still only go up.

Removed with it: the **capture bounty** (one-off VP on first capture,
`contest.js`) and the **dominion faucets** — foreign-dominion tick and
vassal-dominion, plus `victory.dominionLoyaltyMin` / `dominionPerCity` in
config. §1's items 1 and 2 and §8's `dominionLoyaltyMin 6 → 4` tuning are now
historical record, not live behaviour. The **alliance trickle survives
unchanged** (§9's per-allied-major scaling included) because it is a
diplomatic faucet, not a territorial one.

`recomputeVp(state)` runs at the end of `startTurn`, after a Location
resolves in `contest.js`, and once at `createGame` with events suppressed. It
emits `vp_changed { player, from, to }` on every move in either direction —
the event feed renders gains in green and losses in the accent colour. The
win check latches inside `recomputeVp` and is major-only, so a minor can score
but never win.

**Consequence — VP is now volatile.** Losing a city costs its VP immediately.
An early land-grab can no longer be coasted on, which was the point, but it
also means a leader can be knocked *back* below the threshold before their
turn comes round. That is intended; watch it in play.

**Consequence — minors now score.** Minor factions hold Locations, so they
have non-zero VP from setup (Croppers seeded on Dambar open at 3, ahead of a
major's 2). They cannot win, but `powerOf` reads VP, so territory is now
double-weighted in threat / coalition / vassalage scoring. Flagged, not
changed.

**Consequence — the trickle is now asymmetric.** Alliance VP accumulates and
never falls; conquest VP does both. If diplomacy starts feeling dominant,
this asymmetry is the first thing to look at, ahead of §9's vassal double-dip.

### 10.2 The threshold needs recalibrating per map size — data

Deferred by design call ("we can recalibrate VP later"), but the numbers are
worth recording now because the smaller boards are mathematically closed:

| map | Locations | total board VP | vs threshold 12 |
|---|---|---|---|
| small | 6 | **10** | conquest alone CANNOT win — the whole board is short of the bar |
| testMap (legacy) | 10 | 19 | need 63% of the board at full Loyalty |
| medium | 8 | 17 | need 71% |
| large | 14 | 27 | need 44% |
| huge | 19 | 32 | need 38% |

Every major opens at exactly 2 VP (its capital). A small board is winnable
today only via alliance trickle / summit VP on top of near-total conquest.
Scaling `vpThreshold` with `size.locations` is the obvious lever when this
gets picked up.

### 10.3 Abilities withdrawn

> "Let's scrap all abilities until we can revisit it. I'm not happy with what
> currently exists."

`setup.js` no longer assigns `abilityId` to any Location. The roster in
`content.js` (§3 item 2's ten abilities), the activation verb, the effects,
and `collectTriggers`' ability branch all remain — nothing is deleted, so
re-enabling is a one-line change in setup. Because an ability seat used to
cost a chip slot, **every high / veryHigh Location gets that slot back**:
`chipSlots` now reads straight from `CONFIG.chipSlotsByValue`. A harness
check asserts no Location ships with an ability, so this stays deliberate.

### 10.4 Nine new Locations, and rail may not terminate at a sign

The roster grew from 18 to 27. Four are affiliated (a third homeland city per
major): **Runaway** (Versari), **Witcha** (Goldgrass), **Dulut** (Lakers),
**Linkin** (Free Plainers). Five are unaffiliated smaller settlements:
**Restaria**, **Lastgas**, **Overlook** (medium) and **Nosservis**, **Detor**
(low) — the first `low`-tier Locations actually placed on a board.

> "The 5 new medium and low locations should never have railways linked to
> them. If a rail has to pass through them to get to another location, that's
> fine, but they shouldn't terminate there (because they are all based on road
> signs, not rail)"

Modelled as `noRailTerminus: true` on the def. `setup.js` filters those
Locations out of `railHubs`, so no rail link can be *built to* them; a link
between two legitimate hubs whose path crosses their hex is untouched.
Harness-checked.

**Placement.** `generateLayout` now allocates homeland Locations in **ranked
bands** — every faction's 2nd-choice city, then every faction's 3rd — and a
band is all-or-nothing, so no faction ever gets a homeland city a rival was
denied. Unaffiliated Locations are divisible and fill whatever budget is left.
Placement distance scales with rank (`near = 1 + rank`, `far = 2 + rank`), so
the third city sits further out than the second.

Budgets rose to make room: large 10 → **14**, huge 10 → **19**. Without that
the third home band would never fit on any board. Small (6) and medium (8) are
unchanged and still have no room for neutral prizes — see
`playtest-2026-08-15-findings.md` §2. The legacy 30-hex `testMap` is pinned at
`CONFIG.testMapLocations: 10` so the harness fixtures keep the board they were
written against.
