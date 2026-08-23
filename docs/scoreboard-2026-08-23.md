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
