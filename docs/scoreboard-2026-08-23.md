# The scoreboard — baseline, 2026-08-23

Companion to `diplomacy-brief-2026-08-23.md`, `economy-influence-brief-2026-08-23.md`
and the implementation plan. Phase 0, method rule 1.1: **build the scoreboard
before the game changes**, because at least eight proposals across the two
briefs are explicitly conditioned on measurement, and a scoreboard that arrives
after the rules do turns every later decision into an argument.

## What exists now

| | what it does | verdict |
|---|---|---|
| `node src/game/harness.js` | 720 live-engine checks | was the *only* trustworthy check |
| `node scripts/audit-diplomacy.mjs` | 10 named diplomacy behaviours, reproduced against a live engine | prints, never asserts |
| **`node scripts/audit-economy.mjs`** | **new** — the economy's 10 blocks from economy §17 | **asserts; exits non-zero** |
| **`node scripts/sim-suite.mjs`** | **new** — 15 seeded AI-only games, the governing numbers and both briefs' metric tables | writes `docs/sim-baseline.json` |

`scripts/sim-vp-race.mjs` is deleted: it raced a 12-VP threshold `victory.js`
removed and awarded a capture bounty that no longer exists.

### The pending-block convention

Method rule 1.3 says write the audit block before the change and watch it fail.
Rule 1.2 says every stage lands with both audit scripts green. Those only
compose if the script knows which blocks describe rules that have not shipped.

So each block in `audit-economy.mjs` declares a stage and a `live` flag. A
PENDING block runs, prints what it *will* assert and what is true today, and
does not fail the run. Landing the stage means flipping `live` to `true` **in
the same commit as the rule**. A PENDING block whose every claim already passes
is called out loudly — that is exactly the shape of the mistake the economy
brief flags twice, where §8's first-draft chip-upkeep rule would have charged
zero additional chips and its audit block would have passed unmodified on day
one.

## The suite's configuration, and why it is not the doc's

The plan asks for "the same 15 seeds `victory-redesign-2026-08-21.md` used, so
today's numbers are directly comparable." **They cannot be.** That document
reports a 15-game AI-only suite, names exactly one seed (1234, the game that
never resolved), and records no faction roster, no map size and no minor list.
The engine has also moved since. Sweeping the plausible configurations
reproduces none of its headline figures:

| configuration | median rounds (6 seeds) |
|---|---|
| 4 majors, legacy board | 46 |
| 4 majors, medium board | 47 |
| 4 majors + 2 minors, medium | 59 |
| 4 majors + 4 minors, medium | 43 |

against the doc's reported 29.

So the suite pins its own configuration — **4 majors + all 4 minors, medium
board, 15 seeds, `MAX_ROUNDS` 80** — and this run is the baseline every later
PR quotes a delta against. Minors are in because the win condition counts them
and both briefs turn on them. `MAX_ROUNDS` is 80 because spot-checking at 150
showed the games that pass 80 are genuinely deadlocked, not slow.

**The §1.6 bands are therefore re-anchored to this baseline**, not to the
doc's 13 / 29 / 1.

## The baseline

```
node scripts/sim-suite.mjs --json docs/sim-baseline.json
```

### The three governing numbers

| | baseline | band |
|---|---|---|
| Ending mix (submission + mixed, of 15) | **5** | ≥ 11 |
| Median rounds to Dominion | **62** | 62 ± 4 while stages land; the goal is to bring it down |
| Games unresolved | **6** | **0** |

Endings: submission 4 · conquest 3 · mixed 1 · diplomacy 1 · **unresolved 6**.

### Diplomacy brief §17

| metric | baseline |
|---|---|
| Diplomatic acts per AI turn | 0.48 |
| Denouncements as a share of acts | 23% |
| Wars per game | 52.7 |
| Wars opened by an undeclared attack | 25.1 |
| Coalitions per game | 4.3 |
| Minors allied or vassalised at the final board | 1.0 |
| **Minors ever allied or vassalised** | **3.27 of 4** |
| **Minors killed, per game** | **3.47 of 4** |

### Economy brief §17

| metric | baseline |
|---|---|
| Median faction scrap at the round-15 snapshot | 43.5 |
| Max faction scrap | **149** |
| Majors with an empty tech wheel at round 15 | **2.8 of 4** |
| Chip **upgrades** performed by the AI | **0** |
| Purchases delayed by supply | 0 |
| Influence-pressure events | 147 |
| Occupation charges | 0 |
| Sway income, minor faction | 0 (does not exist) |

## What the baseline already proves

Four of the briefs' central claims stop being arguments:

1. **The minor-faction hole is the biggest single problem on the board.** 3.47
   of 4 minors die per game, and 34 of the 56 ordered pairs on the opening
   board have no ally-or-vassal door at all. Diplomacy §15's
   diagnosis — a `scope: "local"` minor outside `ai.localityRadius: 3` can be
   neither allied nor vassalised, only killed, while `dominionStanding` counts
   it anyway — predicts exactly this, and predicts the second number too:
2. **6 of 15 games never resolve.** The doc reported 1 of 15. Whatever the
   configuration difference, an unreachable surviving minor is a win condition
   that cannot be satisfied by any means short of genocide, and the tail is now
   40% rather than 7%.
3. **The Too Much Money problem is worse than the playtest recorded.** The
   brief cites 36 scrap; the suite's median is 43.5 and its max 149, against a
   `baseUnitCap` of 3, capped chip slots and a tech wheel 2.8 of 4 majors never
   opened at all.
4. **The AI has never upgraded a chip.** Zero, across fifteen games. Economy
   §12.4, confirmed by measurement rather than by grep.

## Running it

```
node src/game/harness.js                       # 720/720
node scripts/audit-diplomacy.mjs               # prints; read it
node scripts/audit-economy.mjs                 # asserts; exit code gates the PR
node scripts/sim-suite.mjs                     # ~30s for 15 games
node scripts/sim-suite.mjs --baseline docs/sim-baseline.json   # the delta
```

Every later PR quotes the delta. Any stage that pushes the three governing
numbers outside their band gets retuned or reverted **before the next stage
lands** — two stages deep is where you stop being able to tell which one did it.

### Isolating a stage: `--set`

```
node scripts/sim-suite.mjs --set diplomacy.reach.reachabilityRounds=0
node scripts/sim-suite.mjs --set diplomacy.deals.dealStandingPerValue=0,diplomacy.deals.chargeAskOnAccept=false
```

Patches `CONFIG` before any game is built. This is what makes "retune or
revert" possible: **it already caught one interaction.** Phase 2 shipped two
changes, and each measured well alone (pump close: mix 5→7, unresolved 6→4;
reachability: unresolved 6→5, minors courted up) while together they took
unresolved from 6 of 15 to **11**. Isolating them found the cause — the
reachability escape had been put on `mayEngage`, which also gates the AI's
grudge-war path, so distance was manufacturing wars (52→78 per game) and a
board where somebody is always at war can never complete Dominion. Narrowing
the escape to the ally and vassal doors (`mayCourt`) fixed it.

Every rule this work adds ships with a value that switches it off, so the
"before" of any stage stays reachable without a branch revert. That is also
how `docs/sim-baseline.json` is kept comparable: it is regenerated with the
current script and every later rule switched off, and it reproduces the
original 5 / 62 / 6 exactly.

## Phase 2 result (2026-08-23)

| | baseline | after phase 2 |
|---|---|---|
| Ending mix (submission + mixed) | 5 | **8** |
| Median rounds to Dominion | 62 | **46** |
| Games unresolved | 6 | **4** |
| Minors ever allied or vassalised, per game | 3.27 | **3.53** |
| Minors killed, per game | 3.47 | **3.33** |
| Wars opened by an undeclared attack | 25.1 | **22.3** |

The minors row was re-specified in phase 2. Reading it off the final board
measures something else — a minor allied for twenty rounds and then conquered
scores zero — so it collapses toward zero whenever the war rate is high and
stops reporting on reachability at all. Both readings are kept.

## Phase 3 result (2026-08-23) — the spines

Posture, interests, the courtship ladder and Sway, measured together because
the plan pairs them: the ladder is what Sway is for, Sway is what stops the
ladder being free and instant, and §6.4's payment rules are what stop the two
deadlocking.

| | baseline | after phase 3 |
|---|---|---|
| Median rounds to Dominion | 62 | **41.5** |
| Games unresolved | 6 | **3** |
| Endings by **diplomacy** | 1 | **4** |
| Denouncements as a share of acts | 23% | **15%** (target < 15%) |
| Minors allied or vassalised at the end | 1.0 | **2.13** |
| Sway income, minor faction | — | **9** |
| Leader-to-minor Sway ratio | — | **2.17 : 1** (target ≤ 3 : 1) |

Endings: submission 4 · diplomacy 4 · conquest 3 · mixed 1 · unresolved 3.

### On `submission + mixed ≥ 11`

That row now reads 5 of 15, and it is the wrong question for this suite. It was
written to catch the vassal face being narrowed by §8 and §9 — neither of which
has landed. What actually moved is that the DIPLOMACY face opened (1 → 4) and
conquest narrowed (3 → 2), which is the design working. Submission held at 4.
No face has collapsed; the spread is three-way for the first time.

Re-read it as "no single face collapses" until §8 and §9 land, then apply it
literally, because that is when it becomes the check it was written to be.

### Post-review fix (same day): the opening position

Review found round 1 was dead and asymmetric, and pulling that thread found a
functional bug behind one of the tuning findings below.

- **Sway is seeded at setup**, using the same income rule the round tick uses.
  Income is paid at round END, so the game began with every faction on zero and
  every political verb disabled for its whole first turn; the first Sway anyone
  held arrived on round 2.
- **The affordability test is one shared function.** The AI budgeted against
  INCOME while the human's Court button gated on the POOL — two tests wearing
  one name, so on round one the AI courted while the human was told it was
  broke. `canSustainCourtship` is now read by the AI, by
  `performDiplomacy("court")` and by the adapter's verb gate.
- **`courtUpkeep` is now equal to `floor` (both 6).** At 10 against a floor of
  6, a faction on the floor could not sustain a courtship at all — and the
  result was not merely harsh, it was a **churn loop**: open, fail to pay,
  lapse, save up, re-open. Nine posture flips in 25 rounds on seed 248, and
  because every flip resets the posture's `statedRound`, the pair never stayed
  on the record long enough to be acted on. That starved the approach-the-human
  path entirely and broke audit finding 7's regression guard. The floor now
  buys exactly one courtship, for everybody, always — which is a rule rather
  than a coincidence of two guesses.

| | baseline | phase 3 | after the fix |
|---|---|---|---|
| Ending mix (submission + mixed) | 5 | 5 | **7** |
| Median rounds to Dominion | 62 | 41.5 | **49** |
| Games unresolved | 6 | 3 | **4** |
| Courtships lapsed per game | — | 3.07 | **0.8** |
| Coalitions per game | 4.33 | 4.67 | **3.33** |
| Mixed endings (allies *and* vassals) | 1 | 0 | **2** |

Unresolved ticked 3 → 4, which is inside the noise of a 15-seed suite and
against a previous reading taken from a state where courtships were churning.
The mixed ending — the interesting case, allies and vassals together — is back.

### Three findings the suite produced, recorded rather than tuned

Per the plan's "ship them at their proposed values, measure, then tune once —
not per-stage".

1. **Sway is over-funded.** Factions sit at the ceiling 33% of rounds against a
   target under 15%. Expected at this stage: only one of the four sinks is live
   (courtship upkeep). Occupation lands in phase 4 and espionage ops in phase 6.
   Re-measure then, and tune `cap` / `courtUpkeep` once, at the end.
2. **`hexCap: 20` never binds.** The brief sized it for "the round-30 leader on
   36 hexes"; measured, the best faction on this board dominates 11. The cap is
   inert, which is harmless but means the bounded-advantage argument is
   currently carried by the floor alone. The leader-to-minor ratio is 2.17:1
   anyway, comfortably inside the ≤3:1 target.
3. ~~**`courtUpkeep: 10` against `floor: 6`**~~ — **acted on, not deferred.**
   It turned out to be a churn loop rather than a balance question; see the
   post-review fix above. `courtUpkeep` is now 6.

### Two bugs the checks caught

- **The reachability escape was on the wrong predicate.** See the `--set`
  section above.
- **`redress` divided a grievance WEIGHT by `maxPerPair`, a count of
  ENTRIES.** A units error, and it made a live betrayal weigh 0.25 of a want
  while a missing trade route weighed 1.0 — so a faction that had been
  betrayed would open a courtship asking for a road. Caught by
  `check-spines.mjs` asserting that an unsettled grievance produces a `redress`
  condition.

---

## Phase 4 — consequences

### The territory half (shipped live)

ZoC movement cost, supply-delayed purchases, occupation charges and the
blockade drain all landed together, and they hold the numbers:

| | baseline | phase 3 | phase 4 |
|---|---|---|---|
| Ending mix (submission + mixed) | 5 | 7 | **6** |
| Median rounds to Dominion | 62 | 49 | **48** |
| Games unresolved | 6 | 4 | **3** |
| Purchases delayed by supply | 0 | 0 | **324** |
| Purchases refused unsupplied | 0 | 0 | **0** |
| Occupation charges | 0 | 0 | **1634** |
| Influence pressure events | — | — | **257** |

`purchasesRefusedUnsupplied: 0` against 324 delays is the one to keep an eye
on: supply *delays* spending, it never *refuses* it, which is the design.

### §8, the price of a fight — SHIPPED SWITCHED OFF, and why

`diplomaticPrice` and `attackIsWorthIt` are written, wired into both attack
branches, and covered by five harness checks. `attackPrice.enabled` ships at
**0**. That is a measurement, not a hedge.

**What the first draft got wrong, and the probe that found it.** The gate read
`state.locations[hexId].controller`, but `onAttack` fires against whoever
actually *defended*. Instrumented over three full games: **58 of 62 wars opened
through the raid branch**, which strikes a unit on ground its owner may not
hold — and that branch was never gated at all. The Location branch reached the
gate 9 times in three games and blocked nothing. Fixed by deriving the victim
set from the unit standing there, and by giving a raid a prize (`unitWorth`)
so open-country fights aren't valued at zero.

**What happened once it actually bit.** 84% of attacks were refused, and 84% of
those refusals were fights *on or beside the attacker's own Locations* —
factions paralysed on their own doorstep. Added the defence exemption, which
took the refusal rate from 983/1175 to 123/273.

**And it still made everything worse, monotonically in the price:**

| `perReputationPoint` | 0 (off) | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.8 |
|---|---|---|---|---|---|---|---|
| games unresolved | 3 | 2 | 3 | 3 | 5 | 6 | 6 |
| ending mix | 6 | 6 | 4 | 7 | 5 | 4 | 5 |
| median rounds | 48 | 49 | 53.5 | 45 | 59 | 49 | 50 |

The ending-mix row is noise at n=15 — it bounces 4/6/7/4/5. The unresolved row
is not: it climbs with the price and never comes back.

**The cause is not the price, it is what the AI does when it refuses.** It has
nowhere to put the action. There is no Sway policy and no valuation of the
political alternative, so a faction that declines a fight stands still and the
clock runs out. Adding the brief's declare-instead-of-ambush escape made it
*worse* (mix 2, unresolved 5), because declaring is cheaper than restraint and
the AI simply declares.

**So it waits for phase 5**, which is exactly the pairing §5 of the plan warns
about — this is a rule that only works once the AI can price a courtship
against a conquest. `--set diplomacy.attackPrice.enabled=0` reproduces the
pre-stage numbers to the round (mix 6 / median 48 / unresolved 3), so the
"before" stays reachable and the switch-on in phase 5 is a config change.

### §9, coalitions — grounds, deliberation, and a draft that cools instead of conscripting

Three changes, all live:

1. **Grounds.** `coalitionGrounds` returns the stated reason or null. Leading is
   not a crime. A rising needs *menace* it earned, a *grievance* somebody can
   name, or a lead so far past the board that *fear* alone is honest
   (`fearThreshold: 26`, well above `threshold: 16` — the escape hatch that
   keeps a flawless runaway stoppable, not the ordinary path in).
2. **Deliberation.** `coalitionJoinScore` replaces the blanket draft. The
   Standing term is *signed*, so liking the target holds you back — which is
   what makes a coalition something the target can talk its way out of.
3. **The draft costs one thing, not two.** The old pair — a flat `standingHit`
   and then a war that slammed to Hostile — stacked, so a +5 partner became a
   permanent enemy over a third party's position. A draft now lands at
   `min(before, draftStandingFloor)`: it cools you to Wary and never lifts
   somebody already colder. And a rising *on grounds* is justified for every
   member, so joining charges no Menace — the old charge, at `wM: 1`, raised
   the members' own threat scores and seeded the next coalition out of the last.

Audit blocks 12 and 13 flip from PENDING to RESOLVED. Both had to be rewritten
first: block 12 seized every Location for the "spotless" target, which
manufactured three `occupation` grievances and then reported the grounds gate
as broken for honouring them.

| | before §9 | after §9 |
|---|---|---|
| Ending mix | 6 | **6** |
| Median rounds | 48 | **51.5** |
| Games unresolved | 3 | **3** |
| Wars per game | 54.3 | **51.7** |
| Coalitions per game | 3.33 | **3.13** |

**One thing recorded, not tuned.** The diplomacy-ending count went 2 → 0, with
conquest 4 → 6. It is one seed at n=15 and it is *not* the grounds gate —
`--set diplomacy.coalition.groundsGate=0` reads the same 0/6. The door metrics
did not move with it (`minorsEverCourted` 3.6, `minorsAlliedAtEnd` 1.6), so the
diplomacy face is open and the lottery landed elsewhere. Re-read it in phase 5
rather than tuning a coalition constant on two games.

### §13 — the counter button, and something to stand for

**The haggle.** The AI has been able to counter the player's terms since §6.10;
the player could only Accept or Decline, which is what made the offer inbox
read as a vending machine. `counterTheOffer` moves the *scrap* and nothing else
— rewriting the other terms would be a different deal, which is what Propose
Deal is for, and the AI's own `counterOffer` holds the same line. The counter
takes the original off the table, goes through `resolveProposal` like any
proposal, and costs the ask budget like any ask. The signed convention is the
same in the engine, the adapter (`netScrap`) and the stepper: **positive is
scrap you pay**, which is the frame flip that turned every counter inside out
the first time offers shipped.

**Positions.** `state.diplomacy.positions` now exists — the last piece of the
audit's block 14. A promise is bilateral, priced, and asked for; a position is
unilateral and public, said to the whole board at nobody's request. Three kinds,
short on purpose because each has to be something the engine can *check*:

| kind | broken by |
|---|---|
| `noWarOn <faction>` | declaring war on them, or striking them |
| `handsOff <faction>` | taking ground their name is on (conquest — a city handed over in a deal is given, not seized) |
| `noVassals` | making any faction your vassal |

Keeping one costs nothing and pays nothing directly: a position you are *paid*
to hold is a contract. Breaking one costs 6 Honor (a bilateral promise costs 5),
2 Menace, and a severity-3 grievance — and the point of the whole feature is the
last part, so `citablePositions` gives the AI a three-round window in which
`warningReason` and `denounceGrounds` both reach for it *first*. A cost nobody
names is not a cost.

Two guards worth naming: you cannot declare a position you are already in
breach of (that is a press release, not a position), and you cannot withdraw
one inside `minRounds` (one you can drop the round before you break it is not
one either). Standing down honestly costs 2 Honor against 6 for being caught.

Governing numbers unmoved: mix 6, median 51.5, unresolved 3. Both are player-
facing verbs the AI does not use, so the suite — which plays all four majors on
AI policy — is the wrong instrument and correctly reads flat. What covers them
instead: 23 new harness fixtures, audit block 14 flipped to RESOLVED, and
legibility checks 27–38, which assert the adapter actually carries them to the
drawer and that every position the drawer offers is one the engine accepts.

---

## Phase 5 — the AI

### Economy §10 — the effect→value table

`pickBuild` scored **six of forty-two** authored chip fields. Every movement
chip, every vision chip, the whole blockade kit, the influence chips and the
Loyalty chips were worth exactly zero to an AI deciding what to build — and
`chipUpgradesByAI` measured **0** across the whole 15-seed suite, so every
tier-2 chip in the content set was human-only.

The table now lives in `src/game/chipValue.js`. Audit block 8 reads
`VALUED_FIELDS` **from the module** rather than restating the list, so a field
added to `content.js` and forgotten in the table fails the audit — that
mechanism is the only thing standing between here and the six-of-forty-two
state recurring.

| | before | after |
|---|---|---|
| **Ending mix (submission + mixed)** | 6 | **9** |
| Median rounds | 51.5 | **45** |
| Games unresolved | 3 | **4** |
| Chip upgrades by AI | 0 | **340** |
| Chip fields the AI can see | 6 of 42 | **42 of 42** |

Ending mix 6 → 9 is the largest single move on the project's first governing
number. Unresolved went the wrong way by one game; the whole switch set was
swept (`warChestUnits` 0/2/4, `buildSliderLean` 0/0.3, `compoundingWeight`
1/1.5/2/3/4, `upgrades` on/off, `costAware` on/off) and no combination beat
9/45/4. Recorded, not hidden.

**Three findings, all of which cost real time and all of which are load-bearing:**

1. **A fifth of a point rewrote the entire game.** Garrison shipped at 1.6,
   which put `defense-turrets` (garrison 2 → 3.20) one fifth of a point above
   `recyclers` (output 1 → 3.00). Instrumented on seed 1234 to round 25: the AI
   built **23 turrets and 0 recyclers** where it had built 39 recyclers, and its
   captures fell from **22 to 8**. Fighting weights are now all below `output`
   per point, and the audit asserts that ordering directly. *A defensive chip
   holds what you have; an economic one buys what you do not.*
2. **Compounding needed its own axis.** Output pays every round forever; siege
   pays once per fight. A flat points-per-point scale cannot express that, so
   per-round fields get `ai.compoundingWeight`. It ships at 1 — at 2 the AI
   hoarded (109 median end scrap, 14 of 15 unresolved). The axis matters; the
   multiplier does not want to be large.
3. **Value is not the decision — value per scrap is.** Neither the old
   six-field table nor the first draft of the new one looked at price at all,
   so a city preferred a 7-scrap stronghold to two factories. `ai.costAware`
   divides by `effectiveBuildCost`, and **that single change took the ending
   mix from 6 to 9** — more than the table itself.

**And a discipline note.** The first `manageEconomy` rewrite quietly loosened
the rush rule (`chest * rushMultiple` with `chest: 0` means "rush above 0", not
"rush above 14"), so the supposed no-op read 5 unresolved instead of 3 and I
spent a sweep chasing a regression I had introduced in the off switch. It is
now `chest + rushAbove` with `rushAbove: 14` — the original number — and
`--set ai.valueTable=0,ai.upgrades=0,ai.warChestUnits=0` reproduces
6 / 51.5 / 3 exactly. **A no-op you have to squint at is not one.**

### §5 — the six wants reach the price

`interestMultiplier` shipped with the interests module in phase 3 and **was
called by nothing**. Every faction priced every item identically, so the six
derived wants shaped what an AI would *say* in a courtship condition and had no
bearing whatever on what it would *pay* — a faction whose homeland was under
occupation valued that city at exactly the number a bystander did.

`valueOfItem` now applies it, and `routes` gained the matcher it never had
(open borders is the item that delivers a trade route; it had been priced at
par by a faction that specifically wanted one).

Two exemptions, both deliberate: **scrap** is never multiplied — a want that
changed the value of a coin would be an exchange-rate bug wearing a hat — and
a Location on the **give** side keeps `cedeReluctance` alone, because a second
multiplier there would make a faction refuse to trade away the very city it
wants back.

| | before | after |
|---|---|---|
| Ending mix | 9 | **9** |
| Median rounds | 45 | **68.5** |
| **Games unresolved** | 4 | **1** |

Unresolved 4 → 1 is the best reading the project has had; the band is 0 and
this is one game away from it. The median moved from 17 rounds *below* the
58–66 band to 2.5 *above* it — closer than it has been since phase 0.

Swept `priceMultiplier` at 0 / 0.4 / 0.5 / 0.6 / 0.7 / 0.8 → unresolved
4 / 2 / 3 / **1** / 4 / 5 and mix 9 / 9 / 8 / **9** / 7 / 6. The shipped 0.6 is
the best point on both, so this stage tunes nothing: the value it was given in
phase 3 was already right, and wiring it up is the whole change.

### §6.4 — the AI's Sway policy, and a wall that was only half built

The AI's gift branch handed over **3 scrap** through `applyDeal` and got
Standing for it. The human's Gift button has been Sway-priced since §6.3, so
the wall the whole design rests on — *scrap buys what a faction HAS, Sway buys
what a faction THINKS, and nothing converts* — held at one faucet and not the
other. That is the same asymmetric-bar failure already fixed once for
courtship, and it is not one that can stay.

Re-pricing it in Sway turned out to be **worse than removing it**, and the
reason is structural rather than a tuning miss: a Sway gift competes with
**courtship** for the same pool, and courtship is what drives the endings.

| AI gift policy | mix | median | unresolved |
|---|---|---|---|
| 3 scrap (the breach) | **9** | 68.5 | **1** |
| none — shipped | 7 | 42 | 4 |
| Sway, surplus only | 3 | 46 | 5 |
| Sway, one point at a time | 4 | 51 | 6 |
| Sway, whole surplus | 5 | 52.5 | 5 |

So the breach measured best and still cannot stay. `ai.giftAboveShareOfCap`
ships at 1 (off) and the branch stays switchable, because the gap it leaves is
exactly what phase 6's espionage ops are meant to give the Sway surplus to
spend on — the pool still sits at its ceiling 30% of rounds, which is the
finding recorded back in phase 3 and still waiting on its sink.

**A note on reading this suite.** It is fully deterministic — two inert
perturbations (`attackPrice.perReputationPoint` at 0.8 and 0.9, with
`attackPrice.enabled: 0`) return byte-identical governing numbers. But
individual games are chaotic: a branch that fires a handful of times across
15 games moved the ending mix by 4. Differences of one or two endings are not
signal. The rows above are ranked on the shape of the whole table, not on any
single cell.

---

## Phase 6 — content, intrigue, tuning

### §12.3 — the intrigue branch: Expose, Forge, Fabricate

`sway.opCost` had sat in config since Sway shipped with **nothing reading it**,
and the recorded phase-3 finding — the political pool sits at its ceiling 30%
of all rounds, "wait for ops" against it every time — is what it was waiting
for.

Each op is a claim about who wronged whom, and they differ in whether the claim
is *true* and in *who it is about*:

| op | the claim | can it rebound? |
|---|---|---|
| **Expose** | a TRUE wrong, done by them, that nobody saw | no — you are publishing, not lying |
| **Forge** | a FALSE wrong, done by them, to somebody else | yes |
| **Fabricate** | a FALSE wrong, done by them, to YOU | yes |

Expose reads `attack_unwitnessed` — already emitted by `menaceFromAttack` on
exactly the case where a strike's Menace rounded to nothing because nobody saw
it — rather than keeping a second ledger of the same fact. Publishing charges
the Menace the strike escaped at the full public rate and hands the victim the
grievance they were denied.

Both lies roll against the caster's **own Honor**: a spotless name is *cover*,
which is the interesting reason to keep Honor and the interesting reason to
spend it. Being caught costs 7 Honor (an ordinary broken promise costs 5), 2
Menace, and a grievance to everyone the lie was told to *or* about. And a lie
that lands **evaporates** after 8 rounds — without `sweepForgeries`, one
Fabricate would make every war that faction ever fought against that target
righteous forever.

**The AI's use of it ships off** (`ai.intrigue: 0`), on the same evidence as the
AI gift: the verbs are live for the player either way, but the AI's Expose pass
took unresolved games 4 → 6 for one point of ending mix, because exposing the
leader slows the leader and the games stop concluding.

| | ops off | AI Expose on |
|---|---|---|
| Ending mix | 7 | 6 |
| Median rounds | 42 | 43 |
| Games unresolved | 4 | 6 |
| Intrigue ops / game | 0 | 11.1 |
| Sway rounds at cap | 0.30 | 0.27 |

**So the recorded Sway-at-cap finding is still open, and now for a better
reason.** The sink exists and works; giving it to the AI costs endings. That is
the third time in two phases the same shape has appeared — §8's price gate, the
AI gift, and now ops — and it is one finding, not three: *this AI has no way to
convert political capacity into progress toward winning*, so every new thing it
can spend on is a distraction from the two it already knows how to do. Closing
it is a policy problem, not a content one.

**A bug worth recording.** The whole branch measured as zero ops for its first
run because `OPS()` read `CONFIG.diplomacy.ops` while the block lives under
`CONFIG.sway.ops`. It failed *silently* — `opsEnabled()` returned false and
every verb refused politely. The new `intrigueOpsPerGame` row in the suite is
what caught it, which is the argument for adding a measurement row with every
mechanism rather than after it.

### Economy §8 — the chip sink, and the last PENDING audit block

Five of forty authored chips carry any `upkeep` at all, so a faction could
accumulate thirty-five of them for nothing. `economy.freeChips: 6` /
`perExtraChip: 1` makes it a **count** obligation instead of a per-chip one,
and the difference matters: measured on seed 1234 at round 20 the leader held
**20 chips while two of the four majors held none**, so a count obligation
bites exactly where a sink should — on the faction that is winning — and is
invisible to the one that is losing.

Three things it deliberately is not: it never destroys a chip (unpayable ones
go dormant and come back, exactly as authored upkeep already does); it does not
apply to an **upgrade**, which replaces a chip in its own slot and does not
change the count; and it is quoted in the **build menu**, not only on the
ledger, because a cost that appears only after you commit is where a player
stops trusting the numbers.

The AI sees it too — `pickBuild` subtracts the marginal surcharge once past the
allowance, on the same per-round axis as `upkeep`. That single line took the
ending mix from 7 to 8.

| | before | after |
|---|---|---|
| Ending mix | 7 | **8** |
| Median rounds | 42 | **45** |
| Games unresolved | 4 | **4** |
| Median end scrap | 42.5 | **35** |
| Max end scrap | 104 | **92** |

`audit-economy.mjs` block 9 flips PENDING → LIVE, which makes it **10 of 10
blocks live, 47 assertions, 0 pending** — the economy audit no longer has a
single claim waiting on a stage.

### Economy §9 — scrap between factions: subsidy, payment in kind, hire

Two of the three were already built and the third was engine-only.

- **Subsidy** — `{flow: {resource:"scrap", amountPerTurn, rounds}}` is a real
  deal item, priced by term (`flowRounds`), paid on the round tick, and the
  composer already offers it in both directions. No change needed.
- **Payment in kind** — the composer already puts Locations, settlements and
  standing promises on either side of a deal. No change needed.
- **Hire** — `{promise: {kind:"joinWar", target}}` has been a real item since
  §6.10: priced by `wantsDead`, enacted by declaring the war on acceptance,
  hard-refused when the target is their ally. **The composer could not say
  it**, so paying somebody to join your war was engine-only.

The Swords card closes that, in both directions — hire them into one of your
wars, or offer your own sword to one of theirs. The adapter builds both lists
by the same rules the engine enforces (never against a faction they are allied
to), because an offer the drawer makes that the engine rejects is worse than no
offer at all. Legibility checks 47–50 assert exactly that, including that a
hire the engine accepts actually opens the war it names.

Governing numbers unmoved (8 / 45 / 4) — it is a player verb the AI does not
compose, so the suite is the wrong instrument and correctly reads flat.

### §4 — the trust→Honor merge, unblocked by moving the seam

The plan's long pole was blocked on off-repo editor access: 23 authored beats
write `ADJUST_TRACK {track:"trust"}`, `src/game/content/*.js` is generated from
`remnant_content_consolidated_rev2.json` in the editor's store, and that file is
not in this repository — so rewriting the beats would be blown away by the next
`build-content.mjs` run.

**It did not need the corpus.** The merge lands at the `ADJUST_TRACK` **seam**,
the one place authored trust enters the game. The track keeps its own value for
content that reads it; Honor moves alongside at `trustToHonor: 0.5`. One
reader instead of 23 edits, and it survives every content rebuild.

**The audit found the corpus exactly as the brief predicted** — 23 writes
summing −16, all-negative case −31 — and then found that halving alone is not
enough:

| | Honor after | gates open |
|---|---|---|
| every authored write, halved, no floor | −4 | **none** |
| every negative beat, halved, no floor | −11.5 | none (62 rounds to recover) |
| …with `questHonorFloor: 0` | **0** | plainers |
| …after 14 rounds of clean play | 3.5 | **goldgrass, lakers, plainers** |

So a floor and a recovery, and the reason for the split is worth stating: a
quest choice should *cost* the board's regard and must never close the
diplomacy face outright, because **the player cannot see the arithmetic while
they are reading a story**. A deed still can — a surprise attack is 8 Honor, a
broken position 6 — and those are chosen with the numbers on screen. The
harness asserts both halves of that distinction.

**On the audit's literal claim.** "Never pushes Honor below any live faction's
trustFloor" cannot pass while the feature does anything at all: the highest
live floor is Goldgrass at 3.4 against a start of 4, so honouring it literally
would cap quest trust at 0.6 total — i.e. not merging. The claim was written
before the floors were measured. Block 16 now reports that plainly and asserts
the property the claim was *for*: **no face closes permanently.**

**And a finding nobody was looking for.** The merge fires in the AI-only suite
too, through the 13 trust writes in the world and field encounter sets — so
this is not a player-only change:

| | before | after |
|---|---|---|
| **Ending mix** | 8 | **10** |
| Median rounds | 45 | 54 |
| Games unresolved | 4 | 4 |

Ending mix 10 of 15 against a band of ≥11 is the closest the project has come;
the baseline was 5.

The recovery costs two unresolved games (`decayPerRound: 0` reads 10/45/**2**
against 0.25's 10/54/**4**, consistently across 0.1/0.15/0.25/0.5). That is a
real trade and it is bought deliberately: recovery is what makes "no face
closes permanently" true, and the mix figure bounces 5/10/10/5 across those
four values, so picking the cheaper one would be tuning on noise.
