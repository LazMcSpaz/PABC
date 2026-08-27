// Locked v0.1 configuration constants. Mirrors mechanical-spec §14.1.
// The engine reads gameplay numbers from here — never hard-code them.

export const CONFIG = {
  // Kept only as the label on the end-of-game score. Nothing reads it as a
  // win condition any more — see `victory` below.
  vpThreshold: 12,
  // Per-entity actions (docs/vp-and-actions-design.md §2/§4): every unit
  // and Location gets 1 action per turn; the old global pool survives as a
  // WILDCARD pool (base 0) that effect-granted actions (Staging Ground,
  // reactive cards) feed — any entity may spend a wildcard when its own
  // action is gone.
  baseActions: 0,

  // VP is HELD, not banked (src/game/victory.js): a faction draws a Location's
  // vpReward for as long as it holds the place — full value while Loyalty is
  // OVER half the counter, half (floored) below. Dominion's per-Upkeep tick and
  // the one-off capture bounty are both gone; the scoreboard is the map.
  // Victory is ONE condition with three faces: every surviving faction is
  // eliminated, your ally, or your vassal. Win it by conquest, by diplomacy,
  // or — the interesting case — by any mix of the two.
  //
  // What it replaced: a VP threshold labelled "conquest" that had nothing to
  // do with conquering. Across 20 AI-only games it ended every single one,
  // the winner held 29% of the board on average, and one winner held NOTHING
  // — 12 points banked from an alliance drip while holding zero cities. The
  // separate Recognition and last-standing conditions never fired once.
  victory: {
    // The arrangement has to HOLD for this many consecutive rounds before it
    // wins. Allying your way to a bloodless victory should be a position you
    // have to defend for a moment, not a switch that flips the instant the
    // last signature dries — rivals get a window to denounce you, break a
    // partner away, or simply attack.
    //
    // It only applies while rivals are still ALIVE to break it. Kill everyone
    // and you have won; there is nothing left to hold against.
    holdRounds: 3,
    // §5 — HOW LONG A FACTION MAY HOLD NO GROUND. When a faction's last
    // Location goes it has this many rounds to take one back; on expiry its
    // surviving units are destroyed and the ordinary elimination sweep retires
    // it. 0 switches the rule off and restores the old behaviour exactly:
    // elimination wants no Locations AND no units, so a faction reduced to a
    // few wandering units lived forever.
    //
    // The reason this is a rule and not an AI setting is that a landless
    // faction was immortal and inert at the same time. `baseActions: 0` means
    // actions come from ground, so it had no actions, no production, no
    // Research and no Sway income — no way to fight back, court anybody, or
    // put anything on a table — while `dominionStanding` went on counting it
    // as a faction somebody had to deal with. Measured at the round limit,
    // EIGHT of twenty-eight blocked outstanding factions held zero Locations;
    // in one seed a faction holding SEVEN of the map's eight could not win
    // because a rival with no ground and five units would not go away.
    //
    // The clock is a deadline, not a death sentence: it starts when the last
    // Location goes, CLEARS the moment one is retaken, and is announced both
    // ways (`landless_clock_started` / `_cleared`) so the board can see it.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   grace   mix  median  unresolved   wars/game   minorsKilled
    //   0 (old)   21   45      16           45.49       3.20
    //   3         13   36.5     9           35.02       3.71
    //   5         10   37       8           36.13       3.71
    //   8         12   42       8           37.89       3.67
    //   12        16   44      12           41.38       3.49
    //   16        19   45      12           42.76       3.42
    //
    // A clean monotone trade: the shorter the rope, the fewer games run out
    // the clock and the fewer of them end in submission. 8 IS THE ONLY SETTING
    // THAT CLEARS BOTH BANDS AT THE BEST AVAILABLE `unresolved` — 5 ties it at
    // 8 games but drops the ending mix to 10 against a band of 11, and 3 pulls
    // the median to 36.5 against a band of 41-49. 12 and 16 buy the mix back
    // and give up four games to the round limit.
    //
    // CONFIRMED at n=90, because the last two things measured here shrank when
    // the sample grew:
    //
    //   0:  36 mix / 43   median / 33 unresolved / 51.26 wars
    //   8:  30 mix / 41.5 median / 22 unresolved / 43.74 wars
    //
    // It holds. Unresolved games fall by a THIRD, and the ending mix costs
    // less than the n=45 reading suggested (40% -> 33% of games, against
    // 47% -> 27% at n=45). Nothing else measured against this brief moves the
    // headline defect remotely this far.
    //
    // Two second-order effects worth knowing, both good and neither aimed at:
    // the war rate falls 51.3 -> 43.7, because a faction that can be finished
    // stops being a permanent open front; and the scripted pacifist — the
    // instrument that exists because the suite cannot see a player who does
    // not play like the AI — holds MORE ground, not less: mean Locations held
    // 0.5 -> 1.2, wars declared on it 11.6 -> 8.4, all four claims still
    // passing. The rule reads like it should punish the weak and measures the
    // opposite way, because what it actually removes is the permanently
    // unfinishable opponent.
    //
    // The cost is honest and worth stating plainly: the unresolved games
    // become CONQUESTS (4 -> 15 at n=45), minors are killed slightly more
    // often (3.20 -> 3.67) and brought in slightly less (1.60 -> 1.33). This
    // is the §15 tension, priced. Raise to 12 or 16 to buy the mix back.
    landlessGraceRounds: 8,
    // Score, purely for the end-of-game standing. Nothing here wins anything.
    // Both are HELD, like territory: you show them while the relationship
    // stands and lose them when it doesn't.
    score: { allied: 2, vassal: 3 },
  },

  // §18.2 Loyalty — the 8-slice centre pie that replaces foothold/decay.
  // The ceiling is fixed; the rest are TBD-in-spec tunables, set here for
  // the demo. Capture starts low; a garrisoned, fully-held Location climbs
  // to the ceiling and holds itself; a neglected one bleeds to 0 and then
  // peels Control one section per Upkeep.
  loyalty: {
    ceiling: 8, // §18.2 — fixed; nothing raises it
    start: 2, // initialises low on first reaching full Control
    risePerUpkeep: 1, // +x per Upkeep while garrisoned (capped at ceiling)
    decayPerUpkeep: 1, // −y per Upkeep while neglected (floored at 0)
    dangerThreshold: 2, // warn (loyalty_failing) at/below this, before any peel
    peelPerUpkeep: 1, // Control sections peeled to neutral per Upkeep at 0
  },

  unit: {
    baseStrength: 4,
    baseMovement: 2, // v0.2 §16.2 — was 1; movement is now its own budget
    baySlots: 2,
    // Standing armies eat. 1 scrap per unit each Upkeep, doubled once BOTH
    // bay slots are filled — whether by two 1-slot chips or one 2-slot chip,
    // so the heavy kit (Bombard, Landship) carries a supply tail. An unpaid
    // unit is UNSUPPLIED: it holds ground but cannot move or act until it is
    // paid again. Never destroyed by arrears.
    upkeep: 1,
    upkeepFullyChipped: 2,
    baseStrengthCap: 4, // v0.2 §16.3 — base Strength doubles as HP, capped here
    veteranStrengthCap: 8, // §16.7 combining (deferred)
  },
  baseUnitCap: 3, // v0.2 §16.3 — cap = baseUnitCap + Training Grounds
  // How many units may stand on one hex, counting every owner. A stack past
  // this cannot be told apart on the board — the tile runs out of room to draw
  // them at a legible size (docs/unit-model-pipeline.md §10.1) — and a rule the
  // display cannot show is a rule players cannot plan around.
  hexUnitCap: 10,
  startingUnits: 2, // v0.2 §16.3
  unitRecruitCost: 6, // v0.2 §16.3 — was 10

  contestDieSides: 6, // 1d6 per side, defender wins ties

  // §16.2 terrain movement — per-hex entry costs over the base 1/hex.
  // Forest (cover) costs extra; mountains (elevation) HALT a move (you may
  // climb onto one but advance no further that turn — "speed 1 in mountains").
  //
  // A road EASES rough ground; it does not delete it. That distinction is the
  // whole reason terrain survives contact with the road network: a road that
  // makes a mountain cost the same as open grass has removed the mountain from
  // the game, and once a third of the board carries road, a third of the
  // board's terrain stops mattering. A road through a mountain is a winding
  // road — it gets you over, it does not make the climb free.
  movement: {
    forestCost: 2,     // entering a cover/forest hex costs this (vs 1) — "−1 speed"
    mountainHalts: true, // entering an elevation/mountain hex ends the move
    // Two rules that met in a merge, both kept, because they are about
    // different ground.
    //
    // GRADED SURFACE — road or rail — costs `pavedCost` instead of 1, so a
    // column that stays on the network covers twice the ground: 2 Movement is
    // two hexes cross-country and four down a lane. That is what makes the
    // network worth routing along, worth holding, and worth cutting.
    //
    // …but a road EASES rough ground rather than deleting it. A lane across
    // the plains is quick; a road over a pass is still a pass. So the paved
    // discount applies to easy ground only, and a crossing costs the eased
    // terrain price:
    //
    //   open + paved      0.5
    //   forest + paved    roadForestCost (1, against 2 unpaved)
    //   mountain + paved  roadMountainCost (2, and no halt — the halt is what
    //                     a mountain really costs, and easing it is the point)
    //
    // Corridors are routed AROUND rough ground (assignRoads), so a road rarely
    // crosses it at all — high ground about one board in thirty. The crossings
    // that do happen still cost something.
    pavedCost: 0.5,
    // What ROAD-GRADE rough ground costs — a road, or a Landship-class mover
    // (chip `ignoresTerrain`), which the engine defines as road-grade too.
    // Roughly half the toll in each case, never none.
    roadForestCost: 1,   // forest is 2 without one
    roadMountainCost: 2, // a mountain otherwise halts you outright
    // No `roadStartBonus`. It granted +1 Movement for BEGINNING the turn on a
    // road — a patch for roads not being worth much, which paying per hex
    // travelled fixes properly. Keeping both would pay twice for the same
    // complaint and make 2 Movement carry a unit six hexes rather than four.
  },

  // v0.2 §16.4 attrition
  attrition: { routMargin: 4 }, // margin >= this spills a casualty to a 2nd stacked unit
  // v0.2 §16.5 healing / reinforcement
  heal: { passivePerTurn: 1, scrapPerStrength: 2 },
  // v0.2 §16.6 combat levers
  combat: {
    concentrationPerUnit: 1,
    concentrationCap: 3,
    mountainDefenseBonus: 1,
    fortifyBonus: 1,
    veteranBonus: 1,
  },
  veteran: { winsToPromote: 3, survivedToPromote: 5 },

  // AI combat judgment (docs/ai-overhaul-plan.md item 4 — "contests are
  // blind"). The AI only commits to a contest when its estimated win
  // probability clears a threshold; the threshold drops as the faction's
  // `aggression` dial rises, so a warlord fights worse odds than a
  // cautious minor. `floor` never goes below `min` even at aggression 1.
  ai: {
    contestWinProbBase: 0.55, // required win% at aggression 0
    contestWinProbAggressionScale: 0.35, // subtracted at aggression 1
    contestWinProbMin: 0.15, // never accept worse odds than this, however aggressive

    // §10 — THE WAR CHEST. What `manageEconomy` will not spend on building.
    //
    // This exists because the effect→value table broke the old loop by
    // succeeding. Before it, an AI ran out of things worth building, its
    // slider fell back to 0, and the treasury refilled by accident. With every
    // chip field valued AND upgrades reachable, there is always something
    // worth building, so the slider stayed at 0.7 forever and no faction ever
    // saved the price of a unit again: measured, unresolved games went 3 -> 9
    // and conquest endings to zero. An economy with no floor under the army is
    // not a smarter AI, it is a pacifist one by accident.
    // Every value here is chosen so that ZEROING the chest reproduces the old
    // loop exactly — slider 0.7 whenever anything is queued, rush above 14
    // scrap — rather than approximately. A no-op you have to squint at is not
    // one, and the first draft of this block silently loosened the rush rule.
    warChestUnits: 2,      // keep the price of this many recruits, always
    buildSliderBusy: 0.7,  // …and how hard to build when the chest is full
    buildSliderLean: 0.3,  // …against when it is not
    rushAbove: 14,         // rush with this much ON TOP of the chest
    // 0 switches the AI's upgrade pass off and restores build-only behaviour;
    // 0 on `valueTable` restores the six-field scoring it had before §10.
    upgrades: 1,
    valueTable: 1,
    // How many one-off effects a PERMANENT one is worth. See the PER_ROUND
    // note in chipValue.js: 1 is the flat scale the first draft shipped, and
    // it stopped the AI compounding.
    compoundingWeight: 1,
    // Rank chips by value PER SCRAP rather than by value. 0 restores the
    // price-blind comparison both the old and the new table shipped with.
    costAware: 1,
    // DIMINISHING RETURNS ON REPEATS. The value table made the AI able to SEE
    // all 42 authored fields; it did not make it build them. Measured over 5
    // games, the AI builds 7 of 40 authored chips and `recyclers` accounts for
    // 263 of them — because `pickBuild` takes the argmax every time and the
    // fifth recycler scores exactly what the first did. Nothing in the table
    // can fix that: it is a property of the LOOP, not of the prices.
    //
    // The game already says this about goodwill — `giftCounter` divides a
    // gift's effect by how often you have leaned on somebody lately, because a
    // gift is a campaign and not a bribe. A chip is the same shape: the second
    // workshop in a city is worth less than the first. Divides by
    // 1 + count*repeatDiminish, counting what the FACTION holds, not the city,
    // because the surplus is fungible across cities and the city-local count
    // would just move the monoculture next door. 0 restores the old behaviour.
    //
    // 0.2 rather than a steeper number, and the sweep is the reason: content
    // coverage saturates at 13 of 40 by 0.2 and buys nothing more above it,
    // while unresolved games climb — 0.2 reads 2, 0.3 reads 5, 0.5 reads 6.
    // The gentlest slope that opens the content is the one to take.
    repeatDiminish: 0.2,
    // §6.4 — the AI's gift, and why it ships SWITCHED OFF at 1.
    //
    // The AI used to gift 3 SCRAP through `applyDeal`, which walked straight
    // through the wall the whole Sway design rests on: scrap buys what a
    // faction HAS, Sway buys what a faction THINKS, and nothing converts. The
    // human's Gift button has been Sway-priced since §6.3, so the AI had a
    // Standing faucet the player did not — the same asymmetric-bar failure
    // already fixed once for courtship, and not one that can stay.
    //
    // Re-pricing it in Sway is worse than removing it, and the reason is
    // structural rather than a tuning miss: a Sway gift competes with
    // COURTSHIP for the same pool, and courtship is what drives the endings.
    // Measured across the 15-seed suite, mix / median / unresolved:
    //
    //   scrap gift (the breach)        9 / 68.5 / 1
    //   no AI gift at all              7 / 42   / 4
    //   Sway gift, surplus-only        3 / 46   / 5
    //   Sway gift, one point at a time 4 / 51   / 6
    //   Sway gift, whole surplus       5 / 52.5 / 5
    //
    // So the breach measured best and still cannot stay. Off is second best,
    // and the branch stays switchable because the gap it leaves is exactly
    // what phase 6's espionage ops are meant to give the surplus to spend on.
    // Set below 1 to let the AI gift from surplus again.
    //
    // RE-MEASURED at n=45 on the current build and it stays off: 15 mix / 46
    // median / 16 unresolved against a baseline of 16 / 46 / 15, and 16 / 50 /
    // 18 alongside `intrigue`. This is the one of the three dark switches
    // whose original verdict survived a bigger sample.
    //
    // MEASURED A THIRD TIME, after the branch was rebuilt from the ground up —
    // the Standing floor gone, the price of reaching a hostile faction made
    // real, the `if (running) return 0` guard replaced with a reserve, and the
    // whole branch moved to the bottom of the political pass. Every reason the
    // branch was previously dead is fixed. It still ships at 1:
    //
    //   share  mix  median  unresolved      (n=45, everything else identical)
    //   1      21   45      16
    //   0.8    18   44      20
    //   0.6    16   44      18
    //
    // and the scripted-pacifist probe, which is the instrument that exists
    // precisely because the suite cannot see a player who does not play like
    // the AI, agrees within its own noise: 1 win / 11.6 wars declared on it at
    // share 1, 1 win / 12.9 at share 0.6.
    //
    // So the verdict is unchanged and the REASON for it finally is not. It was
    // never "this AI cannot convert political capacity into progress" — that
    // sentence was inferred from three correlated regressions and is now
    // disproved, because the branch works. It is that Sway spent on warmth is
    // Sway not spent on the ladder, and the ladder is what ends games. The
    // surplus at the ceiling is still real (about a third of all rounds) and
    // still wants a sink that is not this one.
    giftAboveShareOfCap: 1,
    // How many rounds of every RUNNING courtship's upkeep `giftBudget` sets
    // aside before it will consider a gift at all. This is the real rule the
    // guard above was reaching for: courtship is the ladder and must never be
    // knocked over to pay for a gift, but "never while a courtship runs" was
    // a much bigger claim than the measurement supported. Raise it to make
    // the AI more cautious; a very high number restores the old refusal.
    giftReserveRounds: 2,
    // §12.3 — whether the AI reaches for the intrigue branch. The verbs are
    // live for the player either way; this is only the AI's policy.
    //
    // IT SHIPPED AT 0 AND THAT WAS WRONG, on two counts, and both are worth
    // keeping written down because they are the two ways this project has
    // fooled itself.
    //
    // The first was the EXPLANATION. Three features went dark on one sentence
    // — "this AI cannot convert political capacity into progress toward
    // winning" — inferred from three correlated regressions and never tested.
    // A scripted pacifist that never attacks anybody wins 2 games in 15, so
    // the sentence is false and the sentence was doing the arguing.
    //
    // The second was the SAMPLE. The reading that condemned this switch was
    // taken at n=15, where one seed flipping moves the ending mix by a whole
    // point, and it was taken BEFORE four fixes that changed the board it was
    // measured on (leadMeasure, repeatDiminish, occupierFloor, and releasing
    // the dead from the diplomacy graph). Re-measured at n=45 on the current
    // build, against a baseline of 16 mix / 46 median / 15 unresolved:
    //
    //   intrigue on           17 / 52 / 13   <- best on both governing numbers
    //   attackPrice at 0.4    17 / 45 / 17
    //   AI gift on            15 / 46 / 16
    //   intrigue + attackPrice 15 / 52 / 19
    //   intrigue + gift       16 / 50 / 18
    //
    // Alone it is the best configuration measured, it drags the median closer
    // to its band than anything else has, and it runs 7.2 ops a game — which
    // is the Sway sink the pool has been waiting for since phase 3. Combined
    // with either of the others it gets worse, so the others stay dark.
    intrigue: 1,
    // §2 — HOW MUCH THE WIN CONDITION GETS TO SAY. 0 is the no-op and is
    // exactly the behaviour that shipped at b33d1ee: `courtshipScore` reads
    // sociability times warmth and every branch that walks the other factions
    // walks them in faction-id order.
    //
    // At 1 the selection is handed to `dominionValue` — a faction already
    // allied, sworn or dead scores 0 however warm it is, and warmth survives
    // only as the tie-break among the factions still outstanding. Anything
    // between blends the two.
    //
    // The defect this exists for is the headline one: 16 of 45 games reach the
    // round limit unwon, and the AI has never read the win condition at all.
    // `checkDominion` appears twice in `ai.js` and both are detection AFTER a
    // handshake — nothing anywhere read DISTANCE.
    //
    // MEASURED at n=45, everything else identical (mix / median / unresolved,
    // against a baseline of 21 / 45 / 16):
    //
    //   0     21   45   16      (baseline, the shipped behaviour)
    //   0.5   17   42   18
    //   1     16   46   19
    //
    // SO IT SHIPS DARK, and the reason is more useful than the reading. The
    // brief that asked for this called it "the single highest-value change",
    // on the argument that `courtshipScore` courts whoever it likes most
    // rather than whoever it still has to deal with. The argument is correct
    // about the code and wrong about the consequence, because it aims at the
    // wrong stage: `courtshipScore` only RANKS candidates that already passed
    // `mayBeginCourtship`, which has a Neutral Standing floor. The factions
    // standing between a faction and Dominion are, at the point it matters,
    // BELOW that floor and therefore not in the pool being ranked at all.
    // Re-ranking the pool just moves the AI off the partner it could have
    // converted onto one it cannot — `courtshipsOpenedPerGame` barely moves
    // (61.6 -> 62.1) and `minorsAlliedOrVassalisedAtEnd` barely moves
    // (1.60 -> 1.67) while `warsPerGame` rises 45.5 -> 48.4.
    //
    // The bottleneck is CONVERSION, not selection. See `closeOutWithin` for
    // where the measurement went next, and `docs/ai-robustness-findings-
    // 2026-08-27.md` for what the endgame actually looks like.
    dominionWeight: 0,
    // §3 — whether the AI calls its OWN allies into its wars. 0 is the no-op:
    // the `pact-call` verb keeps working for the player and the AI→human
    // inbox (`queueHumanPactCalls`) is untouched either way, because that path
    // never went through here.
    //
    // What this opens is AI→AI, which has never happened once: the verb has no
    // caller in `ai.js` at all, so an alliance between two AI factions has
    // been a line in a drawer. The branch asks `evaluatePactCall` first and
    // only calls where the answer is yes, so it cannot bleed Standing on
    // refusals.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   0   21   45   16
    //   1   17   46   16      217 calls made, warsPerGame 45.5 -> 50.5
    //
    // IT SHIPS DARK. The calls land — 217 of them, all honored, because the
    // branch consults `evaluatePactCall` first — and they buy nothing:
    // `unresolved` does not move and the ending mix costs four. The mechanism
    // is not mysterious. A pact call is a machine for STARTING wars, wars are
    // what block Dominion, and the board is already at 45 declarations a game.
    // Turning allies into co-belligerents on a board that cannot finish its
    // existing wars adds belligerence to the thing that was already stuck.
    //
    // The branch stays because the ASYMMETRY it fixes is real and is worth
    // reaching for again if the war rate ever comes down: an AI that can be
    // called to arms and can never call is a partner in name.
    pactCall: 0,
    // §2 — HOW CLOSE TO WINNING BEFORE THE AI PLAYS FOR THE WIN. Act when this
    // many factions or fewer are still outstanding; 0 is the no-op and is the
    // behaviour that shipped at b33d1ee.
    //
    // The reading this exists for, taken by walking the eight unresolved seeds
    // to the round limit: those games are not milling about. They are down to
    // 2-4 survivors, thirteen of twenty surviving faction-games have exactly
    // ONE faction left outstanding, and twenty of twenty-eight outstanding
    // pairs are blocked on nothing but Standing — around -3 against a pact bar
    // of 6, not at war, with every door out of the position shut: the
    // courtship floor is above them, the pact bar is above them, and the gift
    // is dark board-wide.
    //
    // 1 is the tightest possible scope — only the very last faction, and only
    // once everybody else is an ally, a vassal or dead — which is exactly the
    // board on which `giftAboveShareOfCap`'s argument (Sway spent on warmth is
    // Sway not spent on the ladder) has stopped applying, because there is no
    // ladder left.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   0   21   45   16      (baseline)
    //   1   17   44   18
    //   2   19   51   18
    //   5   16   49   17
    //
    // (Those three are with the branch at its FINAL position, below every
    // reply. With it at the top of the chain — where the first draft put it —
    // the same sweep read 20/48.5/17, 12/43.5/23 and 14/52/22, and the branch
    // histogram named the cause in one line: it was starving `amends`,
    // `vassalize` and `warTalk`. See the note on `branchCloseOut`.)
    //
    // IT SHIPS DARK, and it is the most interesting dark switch here because
    // it demonstrably WORKS and still does not pay. Probing the same eight
    // unresolved seeds to the round limit with it on: two of them now resolve,
    // and the endgame Standing gaps close visibly — seed 31337's last pair
    // goes from -2 and -4 against a bar of 6 to +3 and +2. It does the thing
    // it was built to do.
    //
    // It does not pay because Standing is only one of FOUR walls in front of
    // that last handshake, and it can only take down the one. Of 28 blocked
    // outstanding pairs at the round limit: 18 blocked on Standing, 4 at war,
    // 4 failing the reputation gates (one pair at Menace 11 against tolerance
    // 9.6 AND Honor -9.5 against a trust floor of 3.1), 2 unreachable under
    // §15. Pull down the Standing wall and the pairs walk into the next one.
    closeOutWithin: 0,
    // How big a close-out gift is. 2 rather than 1 is load-bearing rather than
    // a tuning choice: `driftStanding` pulls an unpacted, un-warring,
    // un-courted pair back toward its baseline by at least a full point every
    // round, and `gift.baselineWarmth` only moves the baseline when a gift
    // lands two or more. At 1 the branch pays Sway to stand still — measured,
    // 639 fires across 45 games bought one game. Set to 1 to reproduce that.
    closeOutGiftStanding: 2,
    // How big `branchGift`'s gift is. 1 is the no-op and is what every reading
    // on `giftAboveShareOfCap` was taken at — including the three that
    // condemned the branch. See the note there: at 1 a gift is exactly
    // cancelled by `driftStanding` and never reaches the two points
    // `gift.baselineWarmth` needs, so it buys nothing permanent at any price.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   share 0.8, size 2   21 / 45   / 16   — branch never affords to fire
    //   share 0.6, size 2   16 / 43.5 / 21
    //
    // against the size-1 readings already on `giftAboveShareOfCap` (0.8 ->
    // 18/44/20, 0.6 -> 16/44/18). SO THE TREADMILL IS REAL AND FIXING IT IS
    // WORSE, which is worth separating carefully. The mechanism claim stands:
    // at 1 the gift cannot move a relationship, and every reading that
    // condemned the branch was taken on a gift that could not work. The
    // INFERENCE drawn from it — that a working gift would therefore pay — is
    // false. A 2-point gift costs twice the Sway, so at 0.8 the branch can
    // never afford to fire at all (0 fires, identical to baseline) and at 0.6
    // it fires 484 times and lands three unresolved games worse than the
    // 1-point version at the same share.
    giftStanding: 1,
    // §4 — whether two AIs may end a war on terms that hand over no CITY.
    // 0 is the no-op and reproduces the old refusal exactly.
    //
    // This is a bug switch rather than a tuning dial. `warTalk`'s AI-to-AI
    // path meant to skip the WINNING side's terms (a demand for somebody's
    // homeland, priced far past what peace is worth) and tested for it on the
    // wrong side of the deal — `give` rather than `get` — which also, and
    // accidentally, required the LOSING side to be squatting on one of the
    // winner's cities before it could sue for peace at all.
    //
    // The stalemate seeds are that condition biting. Seed 4711 at round 81:
    // war exhaustion 73.5 and 108.5 against a losing gate of 4.8, Standing -10
    // both ways, `warPeaceTerms` returning terms for both sides and
    // `wouldAccept` returning true for both. A peace both parties would sign,
    // refused because neither occupies the other.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   0   21   45   16      warTalk fires 98,  warsPerGame 45.5
    //   1   13   50.5 17      warTalk fires 362, warsPerGame 55.4
    //
    // IT SHIPS DARK, AND THE BUG IS STILL A BUG. The fix does exactly what it
    // should — peace between two AIs happens 3.7x as often — and the board
    // gets worse: the ending mix falls eight and wars per game RISE ten.
    // Cheap peace makes war cheap. A faction that can always buy its way out
    // of a war is never cornered, and being cornered is what produces the
    // submission endings the mix is counting; meanwhile each settled war frees
    // both parties to start another. The inability to make peace without a
    // cession turns out to have been load-bearing.
    //
    // Left off rather than repaired-and-shipped because the repair is not the
    // interesting part: what this measures is that the war rate is held down
    // by friction rather than by anybody deciding anything, which is the same
    // thing finding 4 says from the other side.
    settleWithoutCession: 0,
    // §5 — whether the AI will march on a faction that holds no ground.
    // 0 is the no-op: the goal list is exactly `knownGoalHexes` as before.
    //
    // A landless faction is not eliminated (`sweepEliminations` wants no
    // Locations AND no units), gets no actions (`baseActions: 0`), no
    // production, no Research and no Sway — and still counts as outstanding
    // for Dominion. It is frozen and it is in the way. Eight of the
    // twenty-eight blocked outstanding factions at the round limit hold zero
    // Locations; in seed 8123 one faction holds seven of the map's eight and
    // still cannot win.
    //
    // MEASURED at n=45 (mix / median / unresolved, baseline 21 / 45 / 16):
    //   n=45   0: 21/45 of 45/16     1: 16/48 of 45/12
    //   n=90   0: 36/43 of 90/33     1: 25/46.5 of 90/28
    //
    // THIS IS THE ONLY SWITCH IN THIS FILE THAT MOVES THE HEADLINE DEFECT, and
    // it ships dark anyway. Both halves of that need saying.
    //
    // It works, and not by belligerence: at n=90 unresolved games fall 33 -> 28
    // while wars per game FALL 51.3 -> 49.7. Nothing else measured here has
    // moved `unresolved` down at all. All three bands hold at both sample
    // sizes.
    //
    // It ships dark on the house rule — the ending mix is a governing number
    // and it gets worse, 36 -> 25 of 90 — and on a design question that is not
    // the AI author's to answer. The branch's answer to a frozen faction is to
    // kill it: `minorsKilledPerGame` rises 3.33 -> 3.64 and
    // `minorsAlliedOrVassalisedAtEnd` falls 1.59 -> 1.48. §15 exists precisely
    // because "the only remaining answer was genocide" was judged the wrong
    // answer once already. Whether hunting a landless faction down is a
    // legitimate ending or the same mistake in a new place is a call about the
    // game, not about the opponent.
    //
    // Note also how the effect SHRANK with the sample: 16->12 at n=45 read as
    // a 9-point drop, 33->28 at n=90 reads as 5.6. Same lesson as the one on
    // `intrigue` — the smaller sample was doing some of the arguing.
    huntLandlessBlocker: 0,
  },

  // §17 Tech Wheel. Research fills a bar; Tech Level is a derived band
  // (1–5); each new level grants one Ability Point to spend on the wheel.
  tech: {
    researchThresholds: [2, 4, 6, 8], // research needed for L2, L3, L4, L5
    maxLevel: 5,
    // No `marketTierByLevel` / `marketRowSizes`. The Market is retired
    // (mechanical-spec §4.1's banner) and `unlockedTier` does not exist, so
    // both were constants describing a subsystem nothing reads. The live chip
    // gate is CONFIG.economy.buildTechGate.
  },

  // Derived per the spec — garrison Strength and base chip slots by a
  // location's strategic value.
  garrisonByValue: { low: 4, medium: 6, high: 8, veryHigh: 10 },
  // Playtest: one slot per medium city meant a single build ended a town's
  // development (and scrap piled up with nothing to sink into). Raised one
  // across the board; the Loyalty-6 bonus slot still adds one more.
  chipSlotsByValue: { low: 1, medium: 2, high: 3, veryHigh: 4 },

  // §16.2 roads. Every settlement is road-linked to its nearest neighbour;
  // bigger ones also reach their second-nearest, which is what turns a chain
  // of towns into a network with alternate routes worth cutting. Raising the
  // high/veryHigh numbers thickens the network (and makes blockades less
  // decisive, since traffic can route around); lowering them to 1 across the
  // board yields a bare spanning chain.
  roads: {
    linksByValue: { low: 1, medium: 1, high: 2, veryHigh: 2 },
    // What one hex of corridor costs to route through, when a road is being
    // laid (assignRoads). These are ROUTING weights, not movement costs.
    //
    // reuseCost — ground that already carries road. Well under 1, so a later
    // corridor will detour to merge with an existing trunk rather than lay a
    // second lane a hex away from it. That is what stops the network reading
    // as a lattice: `road` is a per-hex boolean, so two lanes running side by
    // side are welded into a ladder by adjacency alone. Raise it towards 1 for
    // more independent, more redundant routes; lower it for a network that
    // funnels harder onto shared trunks.
    reuseCost: 0.3,
    // terrainCost — rough ground. Roads run round a ridge rather than over it,
    // which is what a surveyor does when there is a valley to follow, and also
    // keeps rough ground rough: a road EASES what it crosses (see
    // CONFIG.movement), so a corridor driven straight over the high ground
    // softens exactly the terrain the map put there to matter.
    //
    // Measured: at mountain 4 a road crosses high ground on about one board in
    // thirty; dropping it to 3 or 2.5 barely moves that, because there is
    // nearly always a way round. So the few that do happen are genuine passes
    // — the one gap in a ridge — which is the right place for a road and the
    // right place for a chokepoint.
    terrainCost: { forest: 2, mountain: 4 },
  },

  // Rail (docs/rail-road-blockade-design.md §2). Pre-collapse trunk line,
  // generated at setup, never built or destroyed. A hop between two linked
  // stations costs this regardless of how far apart they are — that flat cost
  // IS the mechanic, so it should stay cheap enough to be worth a detour.
  rail: {
    hopCost: 1,
    // Which settlements the trunk line stops at. It used to be the four
    // CAPITALS and nothing else, which made rail three links on every board
    // size however big the map or however many cities were seated — and, worse,
    // meant no faction ever held both ends of a link at setup, so production
    // pooling (which needs both stations) could not be used until you had taken
    // an enemy capital. A trunk line stops at the big places: every capital is
    // `high`, so this keeps all four and adds the other major cities.
    // Sign-named settlements are excluded separately (`noRailTerminus`) — they
    // grew up around road signage and a railway had no reason to stop at a
    // lay-by, though a line may still run through their hex.
    hubTiers: ["high", "veryHigh"],
  },

  // The v0.1 test board — still the default when no map size is given, so
  // headless games and the harness keep their existing layouts.
  testMap: [3, 4, 5, 6, 5, 4, 3], // 30 hexes
  // …and how many Locations it seats. PINNED at 10 (the count that existed
  // before the 2026-08-16 content pass took the roster to 19) precisely so the
  // headless harness keeps its fixtures. Leaving it unset would have handed the
  // legacy 30-hex board all 19 Locations — two thirds of the map a settlement.
  testMapLocations: 10,

  // Board sizes offered on the setup screen. `rows` is the row-width array
  // fed to buildHexGrid; the bigger ones are hexagons-of-hexes of radius
  // 4/5/6, which is what keeps the board round rather than lozenge-shaped.
  //
  // `locations` is how many of the named Locations get placed. This is the
  // real scarcity dial: a small map with all ten settlements has an objective
  // every other hex and nothing to march across. Placement fills in a fixed
  // order that keeps factions symmetric — every capital first, then the
  // unaffiliated prizes, then each faction's second home Location — so a
  // budget of 6 gives everyone exactly one home and two neutral targets
  // rather than handing one faction two cities and another none.
  //
  // Locations arrive in fairness BANDS (board.js generateLayout): capitals,
  // then every faction's second home, then every faction's third, each taken
  // whole or not at all; the unaffiliated prizes then fill whatever room is
  // left. So a budget lands on a band boundary — 4, 8, 12 — plus prizes.
  mapSizes: {
    // `locations` is the DEFAULT budget; `locationTiers` is what the setup
    // screen's density slider offers (low / medium / high / very high). Density
    // and size are independent on purpose — a cramped small board and a sparse
    // huge one are both legitimate games, and tying the two made "small" mean
    // "few cities" whether or not that is what anyone wanted.
    //
    // Ceilings are measured, not guessed: a 30-hex board reliably seats 11
    // Locations before the placement rules start dropping them, so small stops
    // at 10. Every larger board can seat the whole 19-Location roster, which is
    // why the top tiers converge there.
    small:  { rows: [3, 4, 5, 6, 5, 4, 3], locations: 6, locationTiers: [4, 6, 8, 10] },   //  30 hexes, diameter 6
    medium: { rows: [5, 6, 7, 8, 9, 8, 7, 6, 5], locations: 8, locationTiers: [6, 9, 13, 17] },  //  61 hexes, diameter 8
    // Raised from 10 with the 2026-08-16 content pass (19 Locations now
    // exist, up from 10). At 10 the big boards could not reach past every
    // faction's SECOND home, so the third-home band never appeared on any map
    // — the new content would have been unreachable. 14/19 keeps roughly the
    // medium board's Location density on a much bigger field.
    large:  { rows: [6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6], locations: 14, locationTiers: [8, 14, 17, 19] }, // 91, diameter 10
    huge:   { rows: [7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7], locations: 19, locationTiers: [10, 15, 19, 19] }, // 127, d 12
  },

  // Of the hexes left over after Locations are placed, this share become
  // encounters and the rest plain terrain. Was an absolute count (13), which
  // silently stopped scaling the moment the board could grow.
  hexSplit: { encounterShare: 0.65 },

  // Encounter cadence, both settable from the setup screen.
  //   fieldShare      the share of spare hexes that become encounter sites.
  //                   Overrides hexSplit.encounterShare when the screen sends
  //                   one; the default IS hexSplit.encounterShare.
  //   worldPerRound   how many world triggers fire at each round end
  //                   (triggers.js). 0 switches world encounters off without
  //                   removing the content.
  encounters: {
    worldPerRound: 2,
    // ONE CARD, ONE PLAYER, ONCE. The field deck is shared by every faction,
    // so the same handful of cards used to cycle past everybody: 28 draws
    // from a 22-card deck in a nine-round playtest, and the human met four
    // cards twice. Skipping what a player has already been shown makes the
    // shared pile do what a shared pile is good at — keeping a card alive for
    // whoever has not met it — without repeating the road at anyone.
    //
    fieldOncePerPlayer: 1,
    // …but the road does not go SILENT once a faction has met every card.
    //
    // Shipping it that way was a mistake and the suite caught it: field
    // encounters are a faucet as well as a story, and cutting the most
    // mobile factions off around the mid-game took scrap and events out of
    // the late game. Measured over 15 seeds, unresolved games went from 4 to
    // 8 — half the regression traceable to this alone.
    //
    // "Fire once and do not repeat" is about not being shown the same card
    // while unseen ones exist. It was never about the road going quiet. So
    // novelty comes first and repeats resume only when there is genuinely
    // nothing new left. 0 restores the silence.
    fieldRepeatWhenExhausted: 1,
  },

  // How fast a player picks quests up.
  //
  // `offerQuests` runs at the start of each turn and starts every quest whose
  // opener gate currently passes. 15 of the 35 authored quests have no opener
  // gate at all and several more open on conditions that are already true in
  // round 1, so without a limit each faction started 22 quests on its FIRST
  // turn — and since most openers are `discovered`, that dropped 22 markers
  // per faction onto a 17-location board before anybody had moved. The log
  // read as a wall of "Quest started / Location revealed", and no single
  // quest was ever an event.
  //
  // Nothing is lost to the limit: an eligible quest that is not offered this
  // turn is simply offered on a later one, because the pass re-runs every
  // turn and the gates it skipped are still true. Set `newPerTurn` to 0 for
  // no limit.
  //
  // `beatsPerTurn` is the other half: how many beats a player may actually be
  // HANDED in a turn, counted across every delivery mode — the fan-out when a
  // quest advances, the round-end pulse, and walking onto a discovered marker
  // alike. A player experiences cards, not delivery modes, so a cap that only
  // counted one kind would leave the others free to pile up. Nothing is lost
  // to it: a held beat is offered again on the next pass and a held marker
  // stays on its hex. 0 for no limit.
  quests: { newPerTurn: 2, beatsPerTurn: 3 },

  // Capital chip bonuses (content/config.csv).
  capital: { garrisonBonus: 2, productionBonus: 2 },

  // §18.3 Influence & Zone of Control — the deterministic scalar field a
  // faction's controlled Locations project, and the dominance test that
  // turns it into a ZoC owner map. All TBD-in-spec; demo defaults here.
  influence: {
    range: 2, // R — hops a Location projects influence
    factionBase: 2, // faction-wide base contributed per controlled Location
    loyaltyScale: 1, // local influence = loyaltyScale × the Location's Loyalty
    falloff: 0.5, // per-hop multiplier — contribution at d hops = source × falloff^d
    dominanceThreshold: 3, // a hex needs at least this Influence to join any ZoC
    // Influence pressure (docs/vp-and-actions-design.md §1): a Location
    // whose OWN hex sits in a rival's dominant ZoC bleeds Loyalty each
    // Upkeep — the soft-power siege. Garrisoning cancels it (rise 1 −
    // bleed 1 = stalemate); Civic Hall's rise beats it; out-projecting
    // ends it. Over-exertion is soft hostility: each bleeding Upkeep
    // costs the presser Standing with the owner and raises their Menace.
    pressure: { bleed: 1, standingHit: 1, menaceHit: 1 },
    // A place with nobody in it drifts toward whoever surrounds it.
    //
    // The old rule only ever peeled TOWARD neutral: a neglected Location
    // shed one section per Upkeep until it was `[neu,neu,neu]`, and then it
    // sat there forever. That was a misreading of the design. Peeling to
    // neutral is right for ground taken FROM a faction — you can hollow a
    // rival's city out with soft power, but you do not inherit it — and
    // then the drift is supposed to keep going: an unclaimed town inside
    // one faction's country becomes that faction's town, by the ordinary
    // fact of trading with them, marrying into them and answering to their
    // courts. Nothing should rest at neutral.
    //
    // So a neutral section is claimed by whoever dominates the hex, ONE per
    // Upkeep — a third of the control wheel per turn, three turns to absorb
    // a place outright. Slow enough that a rival can contest it, walk a
    // column in, or simply out-project you and stall the drift.
    //
    // `threshold` sits deliberately ABOVE `dominanceThreshold`. Merely
    // reaching a hex is enough to draw a border through it; taking a town
    // off the map is not the same claim, and should need a real,
    // near-neighbour presence rather than the far edge of somebody's range.
    // WHERE 8 COMES FROM, and why 5 was wrong. A Location projects
    // `factionBase + loyalty`, so a maxed-out city is 10 at its own hex, 5 one
    // hop out and 2.5 at two. A neutral town is never at zero hops from its
    // own claimant, so the bar is really "how many neighbours does it take".
    // At 5, ONE adjacent healthy city absorbed everything around it — and
    // since territory pays Sway, that fed the diplomacy road for free:
    // measured over 15 seeds it cost 4 points of ending mix and doubled the
    // unresolved games (9/49/2 with the rule off, 5/51/4 at threshold 5).
    // At 8 it takes two adjacent cities, or one and a garrison, which is a
    // faction genuinely enclosing a place rather than merely bordering it —
    // and the cost mostly goes away (8/45/4). Rebalance here, not in the
    // rate: the rate is what the fiction asked for.
    claim: {
      enabled: 1,
      threshold: 8,          // influence needed on the hex to claim a section
      sectionsPerUpkeep: 1,  // one third of the wheel per turn
      blockedByRivalUnit: 1, // a rival column standing in the town stops the drift
      startingLoyalty: 2,    // Loyalty a fully-absorbed place opens at
    },
    // §10.2 — extra movement to ENTER a hex dominated by a faction you do not
    // pass freely with. The most standard ZoC verb in the genre, and it was
    // missing: `movement.js`'s blocker scan never read `state.world.zoc` at
    // all, so the field that defines "territory" for trespass, the withdraw
    // ultimatum and `unitsInTerritory` had no effect on walking through it.
    //
    // Waived by `log-a2` Forward Supply, which already waives the supply wall
    // — one node, one meaning. 0 switches the rule off without touching code.
    //
    // Deliberately movement and NOT contest maths: §18.3 deferred the latter
    // correctly, because a border combat bonus makes the leader's border
    // stronger with no counterplay.
    //
    // HALF A HEX, not the brief's 1, and measured into that shape. Against
    // `baseMovement: 2` a full-hex toll means entering a rival's ground costs
    // HALF YOUR TURN — invasions ran at half speed, wars ground on, and
    // unresolved games went from 4 of 15 to 6 with the median up 51 -> 54. At
    // 0.5 (the same granularity `pavedCost` already uses) a border crossing
    // costs most of a hex without stopping an army, and unresolved dropped to
    // 2 of 15 — the best reading the suite has produced.
    zocMoveCost: 0.5,
    // Waive the toll on your own Locations and the ring around them.
    //
    // SHIPS OFF, and this one is worth recording because the argument for it
    // is good and the measurement said no anyway. The design case is real —
    // being charged movement to cross your own city is confusing, and §8's
    // attack price already makes exactly this exemption for defence. The
    // BALANCE case was that the ZoC toll builds an elimination ratchet,
    // because the side with the furthest to march is always the side that is
    // losing.
    //
    // Measured against a faction cut down to one city at round 20:
    //
    //   neither fix        14 of 15 eliminated, 0 recovered, survived 34.3
    //   this alone         15 of 15 eliminated, 0.4 Locations back, 29.1
    //   occupierFloor alone 11 of 15 eliminated, 2.7 Locations back, 39.9
    //   both               13 of 15 eliminated, 1.5 Locations back, 35.6
    //
    // It makes the ratchet WORSE on its own, and the reason is obvious in
    // hindsight: a defensive exemption helps whoever is defending, and the
    // faction with the most ground to defend is the one that is winning. The
    // occupier floor targets the cornered faction specifically; this does not.
    // 1 turns it on.
    zocFreeOnOwnGround: 0,
    // §10.1 — what a UNIT projects. Contributes to `pressureSource` ONLY, never
    // to `deriveZoC`. See influence.js for the measurement behind that scoping.
    unitInfluence: 1,
    unitRange: 1,
    // A Location held by a MAJORITY (2 of 3 sections) but not outright
    // still projects — at reduced strength. Before this, one flipped
    // section silenced a city's influence entirely, handing its own hex
    // to a neighbour's ZoC (playtest 2026-08-15).
    partialHolderScale: 0.5,
  },
  // §20 Economy & City Development — chips are the output of the economy,
  // built off each Location's Output via the guns/butter slider (Market retired).
  economy: {
    // A besieged city (majority held, not full) still pays its holder —
    // at this fraction of Output, rounded down. Losing one section is a
    // squeeze, not an eviction (playtest 2026-08-15).
    partialOutputScale: 0.5,
    // §20.6 Tech-Level build gate: chip techLevel T needs player Tech Level >= gate[T].
    buildTechGate: { 1: 1, 2: 3, 3: 5 },
    // §20.6 Loyalty rung granting the +1 chip slot (drop below → eject newest, §20.8).
    bonusSlotLoyalty: 6,
    // §20.3 default guns/butter split f∈[0,1]: scrapBank += (1−f)·Output, build += f·Output.
    // 0.5 (was 0): half of Output feeds the active build by default, so
    // organic building happens without slider micromanagement — and banked
    // scrap is no longer a free 100% by default (docs/chip-set-v0.1.md).
    defaultSlider: 0.5,
    // ECONOMY §8 — A COUNT-BASED OBLIGATION, because a per-chip one never
    // arrived. Five of forty authored chips carry any `upkeep` at all, so a
    // faction could accumulate thirty-five of them for nothing, and "the
    // economy has no sink" was true in the most literal way available.
    //
    // Measured on seed 1234 at round 20: the leader held 20 chips while two of
    // the four majors held none. A count obligation therefore bites exactly
    // where a sink should — on the faction that is winning — and is invisible
    // to the faction that is losing, which is the opposite of what per-chip
    // upkeep does (it charges the five specific chips regardless of how many
    // you hold).
    //
    // The free allowance is generous on purpose: six chips is roughly three
    // developed cities, so an ordinary game never feels it and a runaway does.
    freeChips: 6,
    // Per chip past the allowance, per round. 0 is the no-op.
    perExtraChip: 1,

    // §20.7 rush rate — banked scrap per build-point. 2 (was 1): Rush now
    // carries a real premium over organic building, so it's an emergency
    // lever, not a strictly-dominant default (docs/chip-economy-handoff.md).
    rushScrapPerPoint: 2,
    // BUYING ROOM TO BUILD.
    //
    // Measured over 8 seeds x 30 rounds x 4 majors, the binding ceiling in
    // this game is not money: 58% of faction-rounds have every city full,
    // against 10% where held scrap could not buy anything. Raising prices
    // does not tighten that — it swaps which wall you hit, because a faction
    // that builds less never fills its cities (costs x1.5 halves the
    // slot-bound share and leaves idle cash almost unmoved).
    //
    // So the room itself is for sale. This turns the ceiling that IS binding
    // into something scrap can move, which is what makes scrap matter without
    // touching a single price.
    //
    // Three deliberate shapes:
    //   · ESCALATING, so the second one is a real decision and not a formality.
    //   · Bought through the BUILD PIPELINE, not paid for outright. It costs no
    //     Action — queuing a build never has — but it occupies the Location's
    //     one build queue and accrues from its own Output, so the cost is the
    //     chips you did not build while it went up.
    //   · PERMANENT, and it rides with the Location. A built-out city is worth
    //     more to take than a bare one, which ties conquest to the economy
    //     instead of leaving them in separate rooms.
    slotExpansion: {
      enabled: 1,
      maxPerLocation: 2,
      // Indexed by how many this Location has already bought.
      cost: [8, 14],
    },

    // Economy brief §7.1 — SCRAP GETS A PLACE, as DELAY rather than refusal.
    //
    // The diagnosis: `validateRush` and `validateRecruit` check control, cost
    // and caps, and NEITHER CHECKS SUPPLY. A city cut off from your entire
    // empire still rushes a Bombard at full rate. That is "gold is a time
    // machine and a teleportation device" in its purest form, and it is why
    // blockades, rail, ZoC and supply lines — all built, all real — have
    // almost no economic consequence.
    //
    // The first draft REFUSED off-supply purchases. Measured, that is either
    // inert or catastrophic with nothing in between: the literal reading fires
    // in 0 of 1,256 location-rounds, and the "other holdings" reading fires in
    // 26.7% and bites hardest on the faction reduced to its last city — an
    // elimination ratchet dressed as a supply rule.
    //
    // So the engine's own graduated model instead: `runReinforce` in "field"
    // mode charges up front and `sweepReinforcements` walks the packet one hex
    // per round. Rush and Recruit are PAID FOR IMMEDIATELY AND ARRIVE LATER.
    // A blockade then produces exactly the visible number the research asks
    // for — an ETA on every purchase in the cut region — rather than a red X.
    supplyDelaysSpending: true,
    // Hops that cost nothing, because they are what a connected empire looks
    // like. MEASURED, not guessed: across 891 location-rounds, 42% were a
    // faction's last city (the rule does not apply), 50% sat 1-2 hops from the
    // nearest other holding, ~5% were 3-9 hops and 0.2% were cut off entirely.
    // At 2 the ordinary interior is free and the delay fires exactly where the
    // brief wants it — a region strung out or severed.
    supplyFreeHops: 2,
  },

  // Sway — POLITICAL CAPACITY (economy brief §6). The third currency, with a
  // hard wall against the other two.
  //
  //   Scrap buys what a faction HAS. Sway buys what a faction THINKS.
  //
  // Nothing converts between them, at any rate, in either direction. That wall
  // is the whole design, and it has to hold at the FAUCET, not only at the
  // sinks: an earlier draft proposed a third slider channel turning Output
  // into Sway, which is a player-set scrap-to-Sway exchange rate per city per
  // round — exactly the thing the finding forbids, dressed as a UI feature.
  //
  // Why this and not a bigger scrap economy: the diplomacy brief has closed
  // the scrap->Standing pump, which leaves courtship unpriced. Leave it free
  // and every faction courts everyone at once, so the ladder is decorative;
  // price it in scrap and the hole reopens. Three currencies with hard walls
  // is a SMALLER design than two where one buys the other.
  sway: {
    // Every faction, every round, unconditionally. This is the single term
    // that keeps the diplomacy face open for minors and for the losing player,
    // and it is not negotiable: the first draft's territory-proportional
    // income gave the Croppers ONE SWAY ACROSS A WHOLE GAME, which makes
    // killing minors mandatory under a win condition that counts them.
    //
    // THE FLOOR IS EXACTLY ONE COURTSHIP. It and `courtUpkeep` are the same
    // number on purpose, and that is the rule rather than a coincidence of two
    // guesses: every faction, however reduced, can always work exactly one
    // relationship, and everything past that has to be earned from ground or
    // from agreements.
    //
    // It is also a free lunch that rewards nothing, and the brief flags it as
    // a decision worth revisiting: scaling it by surviving rivals so it shrinks
    // as the board consolidates is more elegant and harder to reason about.
    floor: 6,
    // What the Influence field pays. This is the line from the field to
    // political capacity, and therefore the reason ZoC matters at all.
    perHex: 1,
    // …counted up to here. Bounded advantage, not a compounding dividend: a
    // rank-based income is worse than a rank-based tax because it compounds
    // and is invisible.
    //
    // THE NUMBER MOST LIKELY TO BE WRONG, and the brief says so: the dominance
    // threshold is a step function, so hex counts move in jumps of 1 -> 7 ->
    // 19 rather than smoothly. Watch the ending mix, not the income curve.
    hexCap: 20,
    // Per live pact, trading pact or vassal. Diplomacy funds diplomacy, which
    // is the comeback path and the anti-snowball — a faction with three pacts
    // and little ground can still court. It also gives trading pacts a second
    // reason to exist beyond scrapPerUpkeep.
    perAgreement: 3,
    // A FLOW ceiling, not a war chest. Sway with nowhere to go is Sway you
    // should have spent; a pool that banks forever recreates exactly the
    // problem scrap has.
    cap: 60,

    // --- the sinks. Four, and no more. -------------------------------
    // Per round, per faction you are Courting. This is "one diplomatic
    // mission in flight" expressed as a BUDGET rather than a hard cap — you
    // can court two rivals at once if you are rich and one if you are not,
    // and the sequencing is the decision.
    //
    // Paid by the INITIATOR; either side's Courting unlocks the pact (§6.4).
    // Those two rules together are what stop the design deadlocking: if
    // courtship costs Sway and only the human pays, that is the asymmetric bar
    // the diplomacy brief explicitly rejects; if the AI pays and cannot
    // afford it, no AI ever reaches Courting, aiAcceptsPact returns false
    // forever, and the human can never form a pact BY ANY ROUTE.
    //
    // EQUAL TO `floor`, and measured into that shape rather than guessed. The
    // brief proposed 10 against a floor of 6 on the strength of a worked
    // example where a minor holds four hexes and a pact (income 13). Measured,
    // minors run 6-10 — so a faction on the floor alone could not sustain a
    // courtship at all, and the result was not merely harsh, it was a CHURN
    // LOOP: open, fail to pay, lapse, save up, re-open. Nine posture flips in
    // twenty-five rounds on seed 248, and because every flip resets the
    // posture's `statedRound`, the pair never stayed on the record long enough
    // to be acted on. That starved the approach-the-human path entirely and
    // broke audit finding 7's regression guard.
    //
    // At 6 the floor buys exactly one courtship, always, for everybody. A
    // second one has to be paid for out of ground or agreements.
    courtUpkeep: 6,
    // Per +1 Standing from a gift. Replaces the scrap gift outright.
    perStanding: 8,
    // REPARATIONS. Courting has a Standing floor and always will — you cannot
    // be seen courting somebody you openly despise — and for a long time the
    // gift inherited that floor by accident on the AI's side, which closed the
    // only door a beaten faction had. A gift has no business needing warm
    // relations first: sending envoys to somebody who hates you is the whole
    // point of the verb, and history calls it reparations.
    //
    // So it is a PRICE, not a refusal. Every point of their regard below the
    // Neutral tier makes the next point cost this much more, on top of the
    // published rate. At the Hostile tier a point runs a little over double;
    // at the very bottom of the track it is capped, because a wall you can
    // never climb is the refusal again wearing a number.
    //
    // Set `perStepBelowNeutral` to 0 to restore the flat rate.
    giftReparations: { perStepBelowNeutral: 0.25, maxMultiplier: 3 },
    // Expose / Forge / Fabricate (diplomacy §12.3). The intrigue branch
    // finally has an economy.
    //
    // THE SHAPE OF THE TRIO, because it is the thing to get right and not the
    // numbers. Each op is a claim about who wronged whom, and they differ in
    // whether the claim is TRUE and in who it is about:
    //
    //   Expose     a true wrong, done by them, that nobody saw
    //   Forge      a false wrong, done by them, to somebody else
    //   Fabricate  a false wrong, done by them, to YOU
    //
    // Expose needs grounds and cannot backfire, because it is true. The other
    // two are lies and both can be seen through — which is what stops the
    // intrigue branch being a Sway-to-casus-belli vending machine.
    opCost: 20,
    // Per round, per SURVIVING faction's homeland you hold and did not start
    // with. The keystone: conquest and courtship compete for the same pool,
    // under a win condition that needs every faction dealt with.
    occupation: 6,
    // Below this many Locations you are not an occupier, you are cornered —
    // see the note in `occupationCharges`. 0 restores the untempered charge.
    occupierFloor: 1,
    // §12.3 THE OPS, in detail.
    ops: {
      // An unwitnessed strike stays exposable this long. Beyond it the board
      // has moved on and the op would be archaeology, not news.
      exposeWindowRounds: 6,
      // …AND YOU HAVE TO HAVE FOUND OUT SOMEHOW.
      //
      // The first draft of Expose read `attack_unwitnessed` straight out of the
      // log with no visibility check at all, so any faction anywhere could
      // publish a strike that BY DEFINITION nobody witnessed. That is the only
      // place in the diplomacy layer where fog did not apply, and it was in the
      // one verb whose entire subject is a thing nobody saw.
      //
      // Three ways to have learned of it, and they are the Intelligence branch
      // top to bottom — which is the point. Until now the tech wheel's
      // espionage half (Spy Ring, Saboteurs, Listening Posts) and the diplomacy
      // layer's espionage half (Expose, Forge, Fabricate) were two systems with
      // the same theme that never touched:
      //
      //   int-b1 Spy Ring   a standing network — hears about it wherever it was
      //   a Listening Post  local ears, within `posts.range` of the hex
      //   int-a1 + sight    your scouts can see the place now and piece it together
      //
      // 0 restores the omniscient reading, and the harness pins both halves.
      exposeNeedsApparatus: 1,
      // Expose is TRUE, so it charges the Menace the strike escaped at full
      // public rate — that is the whole point, and it is why Expose is the one
      // op that cannot rebound on the caster.
      exposeWitnessShare: 1,
      // A covert act is seen through on a roll with TWO sides to it.
      //
      // The caster's Honor is COVER — a spotless name is hard to disbelieve,
      // which is the interesting reason to keep Honor and the interesting
      // reason to spend it. That half shipped first.
      //
      // The other half was missing, and its absence made the Intelligence
      // branch strictly worse than it reads: `int-b1` is called SPY RING and
      // did nothing whatever to help its holder catch somebody lying about
      // them. Counter-intelligence is now the defensive term, so the branch
      // has a reason to exist on both sides of the table.
      lieBaseDetection: 0.45,
      lieDetectionPerHonor: -0.03, // per point of the CASTER's Honor — cover
      lieDetectionMin: 0.1,
      lieDetectionMax: 0.85,
      // …and what the VICTIM's apparatus adds to their chance of seeing it.
      counterSpyRing: 0.25,   // int-b1 — a network that checks stories
      counterDetection: 0.1,  // int-a1 — sharper eyes
      counterPerPost: 0.05,   // each live Listening Post
      counterPostCap: 0.15,   // …up to here; a wall of posts is not a spy ring
      // Caught in one: the Menace, the Honor, and a grievance for everybody
      // the lie was told to or about. Deliberately steeper than the ordinary
      // promise-break, because this was premeditated.
      caughtHonorLoss: 7,
      caughtMenace: 3,
      // A fabricated grievance is real while it lasts and then evaporates.
      lieDecaysAfterRounds: 8,
      // SABOTAGE IS A COVERT ACT TOO, and until now it was the only one with
      // no risk attached: Forge and Fabricate roll against Honor and backfire
      // hard, while `int-b2` lowered a rival's Loyalty for free, anonymously,
      // with no Menace and no grievance. The diplomatic lie risked everything
      // and the physical one risked nothing, which is backwards.
      //
      // Cheaper than being caught in a forgery — a raid is an act of war, not
      // a lie about somebody's character — but no longer free.
      sabotageCaughtHonorLoss: 3,
      sabotageCaughtMenace: 2,
      // 0 restores the free, anonymous sabotage.
      sabotageCanBeCaught: 1,
      // 0 removes the whole branch; every verb refuses and nothing else reads it.
      enabled: 1,
    },
    // Unpayable occupation converts to Standing loss with the aggrieved
    // faction at this rate. A conqueror who never intends to do politics does
    // not get occupation for free; they pay in the reputation the rest of the
    // board reads.
    arrearsStandingPer: 6,
  },

  // §19 Exploration, Vision & Fog of War. Per-faction sight; LoS over
  // elevation/cover; concealment + ambush. All TBD-in-spec; demo defaults
  // here. Built for a larger map — nothing keys off the 30-hex field.
  fog: {
    unitVision: 1, // §19.3 base sight radius of a unit — its own hex + the ring
                   // around it. +1 on high ground (elevationVisionBonus), +
                   // Vision chips/upgrades (unit.visionBonus / chip `vision`),
                   // + Watch Network's faction-wide bonus. Scouting is a choice.
    unitDetection: 0, // §19.5 a plain unit has NO Detection — concealment hides
                      // even point-blank; Detection comes from scout/recon/
                      // watchtower chips + the Intelligence vision path (§19.7).
    locationVisionBase: 1, // §19.3 a controlled Location's base sight
    // + floor(loyalty × this): a loyal core sees farther — capped in
    // practice at radius 2 (loyalty 8 → +1). At the old 0.25 a capital saw
    // radius 3 = virtually the whole 30-hex board from turn one (the
    // "why can I see everything" playtest report). Settlements now top out
    // at 2; Watchtower/vision chips are the way to see farther.
    locationVisionPerLoyalty: 0.125,
    zocVision: 0, // §19.3 ZoC-owned hexes contribute sight at this radius (0 = the hex itself)
    elevationVisionBonus: 1, // §19.4 a source on elevation sees +this (and over ridges)
    coverSightCost: 1, // §19.4 extra sight cost to see INTO a cover hex
    ambushBonus: 2, // §19.5 ambush edge added to the surpriser's contest total
    ghostMaxAge: null, // §19.11 ghost aging (TBD) — null = ghosts never expire
    intelVisionBonus: 1, // §19.8 Intelligence vision-branch faction-wide sight bonus
    intelDetection: 1, // §19.8 Intelligence vision-branch detection
    // §19.4 share of terrain (wasteland) hexes carrying features. Raised
    // from 0.18/0.22 — at those rates a 30-hex map carried ~3 feature
    // hexes total and terrain almost never touched movement or combat.
    terrainSeedDensity: { elevation: 0.35, cover: 0.4 },
  },

  // §17.7 Listening Post (Intelligence A2) — a unit-built, concealed Vision
  // source that survives by stealth, not toughness. Costs scrap to build and
  // a trickle of scrap per Upkeep to keep paid (else it goes dormant).
  // Blockade structures (docs/rail-road-blockade-design.md §3). Numbers are
  // the doc's placeholders pending a balance pass — the mechanics are settled,
  // these are not.
  blockades: {
    buildCost: 8,  // §3.1 — 1 Action + scrap to break ground
    cost: 4,       // §3.1 — total construction progress needed
    // §3.1's floor. Construction is funded from the connected settlement's build
    // output (§3.4), so without this a rich city could raise one in a single
    // Upkeep; a site takes at most ceil(cost/minTurns) per turn and the rest
    // flows on to whatever else that city is building.
    minTurns: 2,
    defense: 4,    // §3.2 — Location-style static baseline, before stacking
    vision: 1,     // §3.2 — its own sight footprint
    // A blockade is a manned position, not a wall you walk away from: 1 scrap
    // each Upkeep or it goes DORMANT — blocks nobody and sees nothing until
    // it is paid again. Never destroyed by arrears; the garrison drifts off
    // and comes back. Same contract as a listening post (§17.7).
    upkeep: 1,
    // §7.3 — what a completed, paid enemy blockade takes off the Output of a
    // Location on whose hex or ring it stands. Replaces the flat stipend the
    // Toll Booth used to pay its OWNER: strangulation with a number the victim
    // watches fall, rather than a quiet dividend nobody sees. A fitted Toll
    // Booth adds its own `output` on top, so the chip still means "this
    // barricade is worse for you", just from the other side of the wire.
    // 0 switches the drain off.
    drainOutput: 1,
    // §3.2 upgrade slots. Deliberately fewer than a settlement's: a blockade is
    // a chokepoint, not a second city. Palisade / Signal Mast / Toll Booth are
    // in content.js as kind "blockade"; their bonuses are read off the chip def
    // (blockadeDefense / blockadeVision / output), never branched on by id.
    chipSlots: 2,
  },

  posts: {
    buildCost: 3, // §17.7 — 1 Action + 3 scrap to deploy
    upkeep: 1,    // §17.7 — 1 scrap per Upkeep; unpaid → dormant
    defense: 5,   // §17.7 — defends a contest as a standing garrison Str 5 + 1d6
    range: 1,     // §17.7 — radius-1 Vision footprint (Vision only, no Detection)
  },

  // §18.4–§18.13 Diplomacy. Standing is pairwise (numeric); Menace/Honor are
  // global player reputations; Tolerance & the trust floor are DERIVED gates.
  // All TBD-in-spec, inline here and tunable.
  diplomacy: {
    // §18.5 Standing tiers (numeric thresholds). Vassal is a separate flag.
    standingMin: -10, standingMax: 12,
    tiers: { hostile: -6, wary: -3, neutral: -1, friendly: 5, allied: 8 }, // value >= → tier (0 = Neutral)
    pactStandingReq: 6, // §18.7 Standing needed to form a pact (Friendly+)
    driftPerRound: 1, // §18.5 Standing drifts toward its BASELINE when unreinforced…
    grudgeDriftScale: 1, // …modulated by the faction's grudge (high grudge → slower fade)
    seedJitter: 3, // §18.4.1 per-seed jitter on seeded faction↔faction standing

    // Standing baselines — history leaves a mark. Drift pulls Standing toward
    // an EARNED per-pair baseline (not zero): honored calls raise it, betrayal
    // lowers it, long alliances warm it. Capped so no pair is permanent.
    baseline: {
      cap: 4, // baselines live in [-cap, +cap]
      pactHonoredGain: 2, // caller's baseline toward an ally who answered the call
      pactBrokenLoss: 2, // victim's baseline toward the breaker
      surpriseAttackLoss: 2, // victim's baseline toward a treacherous attacker
      tenureRounds: 4, // every N full rounds of unbroken pact…
      tenureGain: 1, // …warms both parties' baselines by this
    },

    // §18.5 Menace — reputation for UNJUSTIFIED aggression, scored vs target.
    menace: {
      base: 3, // magnitude of a single attack's Menace swing
      // Declaring an UNJUSTIFIED war is itself unjustified aggression, and
      // the board reacts to the declaration, not only to the first blow.
      // A justified war (denounced first, or answering a betrayal) costs
      // nothing to declare — which is the whole point of earning one.
      declareUnjustified: 2,
      // …AND A CLEAN RECORD IS ARMOUR.
      //
      // Honor decided whether a faction would SIGN with you and nothing else.
      // A faction that never broke a word, never struck first and never earned
      // a grievance was therefore the cheapest thing on the board to attack —
      // measured, the pacifist policy took 13 declarations a game against the
      // spender's 6 — which is the opposite of what a reputation for keeping
      // your word ought to buy.
      //
      // Hitting somebody whose name is far better than yours costs extra
      // Menace, scaled by the gap. It applies only to an UNJUSTIFIED
      // declaration, because "a war you earned the right to costs nothing to
      // open" is a rule this design keeps: a target who actually wronged you
      // has the Honor loss to show for it, so the gap closes itself.
      //
      // `freeGap` is how much better they can be before the board minds;
      // `perPoint` is the charge past that; `max` stops a saint being
      // untouchable. 0 on `perPoint` restores the flat charge.
      declareOnCleanHands: { freeGap: 4, perPoint: 0.5, max: 4 },
      // Menace is what the BOARD thinks of you, so it should depend on what
      // the board saw. An attack is scored by the share of third parties who
      // could see the hex: seen by everyone it costs full, seen by nobody it
      // costs nothing. The victim always knows regardless — that is what the
      // grievance ledger is for, and denouncing is how they tell everyone
      // else. A declaration of war is always public and is never scaled.
      witnessedOnly: true,
      // …but never quite nothing: rumour travels, and an army that vanishes
      // into the wasteland and comes back bloody invites questions.
      unwitnessedShare: 0.2,
      // What a believed accusation does to the accused. This is how a crime
      // nobody saw catches up with you: the victim was there, holds the
      // grievance, and can put it in front of the board.
      denouncedShare: 0.5,
      decayPerRound: 1, // slow decay with clean play / time
      min: 0, max: 24,
    },
    // §18.5 Honor — reputation for keeping your word (global).
    honor: {
      start: 4, min: -12, max: 12,
      keepGain: 1, // honoring a pact/deal to term
      breakLoss: 5, // breaking a pact call / treaty / promise (sharp)
      mediateGain: 2, // §18.7 peacemaker reputation
      surpriseAttackLoss: 8, // §1.1 — attacking before declaring war (treachery)
      // Denouncing cuts both ways, exactly as declaring war does. Naming a
      // faction the board can already see is dangerous — one past your
      // Menace tolerance, below your Honor floor, or that has wronged you —
      // is what Honor IS, and pays a little. Naming a clean-handed neighbour
      // because you want their cities is a slander, and costs.
      denounceLoss: 3,
      denounceWarrantedGain: 1,
      // §4 — THE trust -> HONOR MERGE, and why it lands HERE rather than in
      // the corpus.
      //
      // Twenty-three authored beats write `ADJUST_TRACK {track:"trust"}` and
      // they sum to -16. `p.tracks.trust` is read by nothing in the rules — it
      // is a parallel reputation the diplomacy layer cannot see — so a player
      // can be scrupulous through a whole quest line and have the board treat
      // them as a stranger.
      //
      // The obvious fix is to rewrite those 23 beats as ADJUST_HONOR. It is
      // also the wrong one, twice over: `src/game/content/*.js` is generated
      // (its own banner says so) from `remnant_content_consolidated_rev2.json`
      // in the editor's store, which is not in this repository — so the edit
      // would be blown away by the next `build-content.mjs` run — and it would
      // be 23 edits to keep in sync instead of one seam.
      //
      // So the merge is a READER, in `ADJUST_TRACK`, at the one place authored
      // trust enters the game. The track keeps its own value for any content
      // that reads it; Honor moves alongside. Content untouched, survives
      // every rebuild, one place to tune.
      //
      // THE HAZARD, and the three mitigations the audit named, all of which
      // are here. `passesRepGates` hard-gates every pact on Honor against the
      // per-faction `trustFloor` (live floors run 1.3 to 3.4), so -16 of
      // authored trust merged at full magnitude into a stat that never
      // recovers would close the diplomacy face PERMANENTLY on a normal spread
      // of quest choices. Hence: halve the magnitude (`trustToHonor`), give
      // Honor somewhere to recover to (`decayPerRound` toward `decayToward`),
      // and assert it — audit-diplomacy block 16 plays the full corpus.
      trustToHonor: 0.5, // 0 unmerges the tracks and restores the old silence
      // …AND A FLOOR THE MERGE CANNOT PUSH YOU THROUGH. Halving was not
      // enough on its own and the audit says so with a number: applying every
      // authored write lands Honor at -4 with NO faction's gates open, and
      // taking every negative beat lands at -11.5 — 62 rounds of clean play to
      // recover, which is longer than a game.
      //
      // A quest choice should COST you the board's regard. It should never be
      // able to close the diplomacy face outright, because the player cannot
      // see the arithmetic while they are reading a story. Deeds still can —
      // a surprise attack is 8, a broken position 6, and those are choices
      // made on a board with the numbers on screen. Text is not.
      //
      // 0 lets quest trust take an honourable player from `start` down to
      // neutral and no further. It still closes the most distrustful faction
      // on the board (Goldgrass, trustFloor 3.4), which is correct: a faction
      // whose whole character is suspicion SHOULD be losable by conduct.
      questHonorFloor: 0,
      // Recovery. Honor is the one reputation stat with no passive faucet, and
      // a stat that only falls is a countdown, not a character. It recovers
      // toward `start` rather than 0: a clean player is not neutral, they are
      // where they began, and drifting an honourable faction DOWN to zero for
      // playing quietly would be its own bug.
      decayToward: 4, decayPerRound: 0.25,
    },
    // §18.5 Tolerance = base + standing·perStanding, ± by the faction's
    // aggression (a warlord tolerates a bloodier ally than a pacifist).
    tolerance: { base: 5, perStanding: 0.6, aggressionScale: 8 },
    // §18.5 trust floor: Honor must exceed this to deepen — liars hit a wall.
    trustFloor: { base: -2, distrustScale: 6 }, // higher faction.trust → higher floor

    // §18.8 Coalition — threat(player)=wM·Menace + wP·powerLead. Forms past
    // `threshold`, dissolves below `dissolve` (hysteresis).
    // `minRounds` / `reformCooldownRounds` keep a coalition a WEIGHTY event
    // rather than a flicker: it can't dissolve the moment threat dips, and
    // the board can't immediately re-raise the same one (playtest
    // 2026-08-15: 19 coalitions formed across 8 games, and their war
    // declarations were the last source of peace→war churn).
    coalition: {
      // These stay at 16/11 THROUGH the `leadMeasure` change below, and the
      // reason is measured rather than conservative. `runnerUp` shrinks the
      // threat scale, so 16 does mean a higher bar than it used to and the
      // coalition rate falls 3.33 -> 2.6 a game. Lowering it to 10 restores
      // the rate and puts the suite's median inside its band for the first
      // time (59 against 58-66) — and it also puts the spotless-pacifist
      // failure straight back: coalitions raised against a faction that never
      // attacked anybody went 1 -> 5 across 15 games, and its wins went 2 -> 0.
      // The rate is not the thing worth having.
      wM: 1, wP: 2, threshold: 16, dissolve: 11,
      vpWeight: 1.5, territoryWeight: 1, standingHit: 4,
      minRounds: 4, reformCooldownRounds: 5,

      // §9 — GROUNDS, AND A DELIBERATION INSTEAD OF A DRAFT.
      //
      // The old rule was: threat crosses a line, everybody who legally can is
      // conscripted. Two failures follow from that and the 2026-08-15 log has
      // the pure case of both. Goldgrass's Menace never moved once all game
      // and it had two wars declared on it in R7 for the crime of leading —
      // a spotless faction coalitioned on POSITION alone, which is the
      // "Attila" failure the genre research names. And the draft slammed
      // every member's Standing to Hostile, so a partner at +5 became an
      // enemy over somebody else's lead.
      //
      // GROUNDS. Position is not a casus belli. A coalition needs one of:
      // earned Menace, a live grievance somebody holds, or a lead so far past
      // everything else that fear alone is honest.
      groundsGate: 1,      // 0 restores the old position-alone behaviour
      menaceGrounds: 4,    // Menace at or above this IS grounds by itself
      fearThreshold: 26,   // …and so is a lead this far past the board
      // WHAT "AHEAD" IS MEASURED AGAINST, and this is the one that was wrong.
      //
      // `powerLead` compares a faction against the MEAN of everybody else. On
      // a board that empties — 4.9 of 7 rivals eliminated per game, mean round
      // 24 — that mean collapses, so a survivor's "lead" balloons for reasons
      // that have nothing to do with what it did. Traced on seed 424242: the
      // fear threshold is crossed at round 11 by a faction with MENACE 0, and
      // from there somebody is above it every round to the end (threat 77.6 at
      // round 30, on a lead of 38.8 over a mean of four corpses and two
      // stragglers). The escape hatch meant for a flawless runaway was open
      // two thirds of every game, which put the Attila failure straight back
      // in through the door built to keep it out — a spotless pacifist was
      // coalitioned in 7 of 15 games, every early one on `fear`.
      //
      // "runnerUp" measures the gap to the STRONGEST RIVAL, which is what
      // runaway actually means: four equal factions are not runaways however
      // many minors they have between them buried. "mean" restores the old
      // behaviour.
      leadMeasure: "runnerUp",
      // DELIBERATION. Each faction decides for itself, and the terms are the
      // ones a faction would actually weigh: how frightening the target is,
      // what it has done to ME, and whether I like it.
      joinScoreMin: 1,       // how convinced a faction must be to sign on
      joinGrievanceWeight: 2, // per point of grievance weight I hold
      joinStandingWeight: 0.4, // per point of Standing — positive HOLDS ME BACK
      joinFearWeight: 0.5,   // per point of threat past the threshold
      // A draft cools a partner; it does not mint an enemy. Wars opened by a
      // coalition floor here instead of at Hostile.
      draftStandingFloor: -3,
      // The board hears a rising against anyone, not only against itself.
      murmurAll: 1,
    },

    // No `recognition` block. It was a weighted second victory condition
    // (Allied 1, Vassal 2, threshold 6) plus a `summitVp` dividend, and across
    // 20 AI-only games it decided nothing: the alliance trickle always crossed
    // the VP line first, and both the trickle and the VP line are themselves
    // gone. Deleted 2026-08-23 with the rest of the vestige — `recognitionScore`,
    // `recognitionMet`, `recognizedEver` and `checkRecognitionVictory` — at
    // zero content cost, because no authored beat ever gated on it. The one
    // condition is Dominion (`checkDominion`, CONFIG.victory).

    // §13 — PLAYER POSITIONS. A promise is bilateral and priced; a POSITION
    // is unilateral and public — "I will not make war on the Croppers", said
    // to the whole board, asked for by nobody.
    //
    // Why it exists: every other political act in this game is a transaction.
    // The player can pay for goodwill, trade for it, or take ground and lose
    // it, but they cannot simply STAND for something and be held to it. That
    // is the one thing a reputation is made of, and its absence is why Honor
    // read as a resource rather than a character.
    //
    // Keeping one costs nothing and pays nothing directly — a position you are
    // paid to hold is a contract, not a position. What it buys is the right to
    // be believed, and what it risks is being cited by name when you break it.
    positions: {
      max: 3,              // how many a faction may stand on at once
      minRounds: 3,        // …and how long before one may be withdrawn
      breakHonorLoss: 6,   // breaking one costs more than a bilateral promise (5)
      breakMenace: 2,      // …and the board marks you for it
      withdrawHonorLoss: 2, // standing down honestly is cheaper than being caught
      citeWithinRounds: 3, // the board must name it this soon or the cost is invisible
      enabled: 1,          // 0 hides the whole feature; nothing else reads it
    },

    // §18.9 Vassalage.
    vassal: {
      tributeScrap: 2, // tribute flow per round to the lord
      tributeResearch: 0,
      resentmentPerRound: 1, // base autonomy/resentment growth
      rebellionThreshold: 10, // resentment past this → rebel
      lordWeaknessScale: 2, // a weak lord raises resentment faster
      rebellionCooldownRounds: 4, // a rebel won't re-submit to the SAME lord this long
    },

    // §8 — WHAT ATTACKING COSTS, in a number the AI can weigh.
    //
    // `wouldFight` prices pacts, war, truce, standing and aggression. It does
    // not price the 8 Honor a surprise attack costs, the Menace
    // `menaceFromAttack` can already forecast, or the severity-3
    // `surprise-attack` grievance. So the AI attacks as if reputation were
    // free, and the 2026-08-15 log records the endpoint: the Lakers paid 8
    // Honor for a surprise attack SIX TIMES and kept going, finishing on 1 VP
    // with an empty tech wheel. A price that is never weighed is not a price.
    //
    // WHERE THE GATE GOES. Not in `wouldFight`: that is also the pathing
    // predicate (`knownGoalHexes` uses it to decide where units WALK), so
    // making it expensive would make the AI stop treating enemy Locations as
    // goals, `pickMoveTarget` would fall through to `nearestFrontier`, and
    // units would scout fog instead of pressuring anybody — quietly gutting
    // expansion and the submission ending with it. It goes on the CONTEST
    // decision, leaving `wouldFight` the predicate it is.
    //
    // THE UNITS. "On the same scale as the contest EV" refers to nothing —
    // `planContest` returns a win PROBABILITY. So the price is expressed in
    // `locationWorth` units, the one existing value scale on the same objects,
    // and compared against worth x winProbability.
    attackPrice: {
      // What one point of Honor, Menace or grievance severity is worth in
      // locationWorth. The one stated conversion constant.
      perReputationPoint: 0.8,
      // …and how much of it a faction actually feels. Scaled by (1 -
      // aggression), so a warlord at 0.9 feels a tenth of it and still
      // surprise-attacks while it is ahead. That is deliberate: a faction that
      // weighs the cost and does it anyway is a character.
      //
      // DESPERATION is the answer to "aggression 0.9 never learns": the price
      // scales DOWN as a faction's own war exhaustion and power position
      // worsen, and UP when it is comfortable. A warlord who is winning can
      // afford its reputation; one on 1 VP with an empty wheel should start
      // feeling the bill. The failure recorded in the log was never "attacked
      // too much" — it was "attacked while losing and never re-evaluated".
      desperationFloor: 0.35, // the most the price can be discounted by losing
      comfortCeiling: 1.6,    // …and the most it can be marked up by winning
      // What one point of an enemy unit's Strength is worth as a prize, in the
      // same locationWorth units. Only the RAID branch uses it: `state.locations`
      // holds Locations, so a raid in open country scores a prize of zero on
      // locationWorth alone and every raid that would open a war would be
      // refused. 2 puts a Strength-3 unit at roughly a small town, which is
      // about what killing one is worth. 0 restores that (wrong) behaviour.
      unitWorth: 2,
      // 0 switches the whole gate off and restores the old blind behaviour.
      //
      // RE-MEASURED at n=45 on the current build, and it stays off — but for a
      // different reason than the one below, which is now stale. The old table
      // was taken at n=15 before four fixes changed the board. Now:
      //
      //   off (baseline)   16 mix / 46 median / 15 unresolved, 24.4 undeclared
      //   0.4              17 / 45 / 17, 24.8 undeclared
      //   0.6              17 / 44 / 16, 23.0 undeclared
      //
      // At 0.4 it costs two unresolved games and does not reduce undeclared
      // attacks at all — inert but not free. At 0.6 it finally bites (24.4 ->
      // 23.0, a 6% reduction) and still costs one. Alongside `ai.intrigue: 1`
      // it is worse again (15 / 52 / 19 against intrigue's own 17 / 52 / 13).
      // The rule is built, fixtured and switchable; it is not yet worth its
      // price to the AI.
      //
      // RE-MEASURED A THIRD TIME (2026-08-27), because the robustness brief
      // asked for it and because there is now a MECHANISM argument for it that
      // the earlier readings did not have. Honor is not only a defensive stat:
      // `passesRepGates` hard-gates the alliance door on it, and walking the
      // unresolved seeds to the round limit turns up survivors sitting at
      // Honor -9.5 against a trust floor of 3.1 — one handshake from Dominion
      // and permanently ineligible for it. An AI that surprise-attacks its way
      // to -9.5 Honor has disqualified itself from the win condition.
      //
      // So the hope was that the bill would pay for itself further downstream
      // than the undeclared-attack row can see. At n=45 on the current build,
      // against a baseline of 21 / 45 / 16 with 22.04 undeclared:
      //
      //   0.6   16 / 48.5 / 17, 20.80 undeclared
      //
      // It bites slightly harder than it did (22.04 -> 20.80, 5.6%) and the
      // verdict is unchanged: one unresolved game and five of the ending mix.
      // The rep-gate argument is real but only 4 of 28 blocked endgame pairs
      // fail on reputation, so fixing it perfectly could not have paid for the
      // ending mix. Left off.
      //
      // The original note, kept because the raid-branch finding in it is still
      // true and still load-bearing:
      //
      // IT SHIPS AT 0, AND THAT IS THE MEASUREMENT TALKING, not a hedge. The
      // rule was built, wired into both attack branches, exempted for defence,
      // and given a declare-instead-of-ambush escape. Every shape of it made
      // all three governing numbers worse, monotonically in the price:
      //
      //   perReputationPoint   0 (off)  0.2   0.3   0.4   0.5   0.6   0.8
      //   games unresolved       3       2     3     3     5     6     6
      //   ending mix             6       6     4     7     5     4     5
      //
      // The reason is not the price, it is what the AI does when it refuses.
      // It has nowhere to put the action — no Sway policy, no valuation of the
      // political alternative — so it stands still and the clock runs out.
      // Adding the declare-first escape made it worse again (mix 2), because
      // declaring is cheaper than restraint and the AI just declares.
      //
      // That alternative is phase 5's whole job. Turn this to 1 once the AI
      // can price a courtship against a conquest, re-run the suite, and tune
      // perReputationPoint against the table above. Until then this is a
      // mechanism with a fixture, not a live rule.
      enabled: 0,
    },

    // §18.8 AI valuation / cadence dials.
    ai: {
      relationshipBiasPerStanding: 0.5, // bias in wouldAccept, scales with Standing
      sociabilityScale: 4, // eagerness to seek pacts
      localityRadius: 3, // §18.4.1 scope:"local" minors only engage within this hop radius
      giftStandingPerScrap: 0.5, // Standing bought per scrap gifted
      warGrudgeThreshold: -5, // AI declares war when Standing falls to/below this (+ aggression)
      vassalPowerRatio: 0.4, // offer/accept vassalage when weak side power < ratio·strong side
      mediateCooldownRounds: 3, // a mediated pair can't be re-mediated (no Honor pump)
      // Casus belli — the AI's blind combat loop only opens hostilities with a
      // reason: an existing war, contempt (Wary-), or a warlike temperament.
      // Raised past the mid-range so ordinary opportunists (0.55) no longer
      // treat "I am standing next to it" as sufficient reason for a war.
      blindAttackAggressionMin: 0.7,
    },

    // --- diplomacy-spec.md §6.3 — the verb/AI/agreement layer on top of §18.
    // Playtest starting numbers (all TBD-tunable).
    gift: {
      windowRounds: 3, // §1.2 — gift diminishing-returns window
      maxScrapPerGift: 8, // scrap counted per gift — one giant gift can't buy a pact
      baselineWarmth: 1, // a gift that lands (≥2 Standing) also warms the baseline
    },
    tradingPact: { // §1.3
      scrapPerUpkeep: 2,
      permanentResearchOnFormation: 1, // Research FLOOR granted each party; removed on dissolve
      suspendGraceRounds: 3, // consecutive suspended rounds → auto-dissolve
    },
    demandTribute: { // §1.4
      minPowerRatio: 1.5, // power needed over target to even offer the demand
      caveBaseRatio: 2.0,
      braveryScale: 1.5,
      escalateOnRefusal: "war", // "war" | "standing-drop"
      refuseStandingDropTiers: 2,
    },
    suePeace: { acceptThreshold: 8, standingBoost: 3 }, // §1.5
    // Deal flows (a per-turn stream, as opposed to a lump sum). Every flow a
    // DEAL creates is term-limited; vassal tribute is not a deal and stays
    // perpetual, ending when the vassalage does.
    flow: {
      defaultRounds: 5, // a flow proposed without a term runs this long
      maxRounds: 20, // the deal builder's ceiling
      // What a perpetual flow (vassal tribute) is worth to a valuer. Only
      // reached by engine-made agreements; a deal can no longer create one.
      perpetualHorizon: 8,
    },
    war: { unitLossWeight: 2, locationLossWeight: 4 }, // §1.5 war-exhaustion weights
    freeVassal: { // §1.7
      honorGain: 5,
      standingToFriendly: 5, // Standing value the freed vassal takes toward you
      rivalCoolingTiers: 1, // tiers the freed party's rivals cool toward you
    },
    pactCall: { // §1.8
      hostilityWeight: 0.3,
      loyaltyWeight: 0.3,
      targetPowerWeight: 2.0,
      acceptScoreThreshold: 1,
      aggressionScoreBias: 1, // ±1 to score from the ally's aggression dial
      honorGainOnHonor: 2, // ally→caller Standing gain on honoring
      declineStandingHit: 4, // caller→ally Standing hit on declining
      callExpiryRounds: 2, // an AI→human pact call sits in the inbox this many rounds
    },
    vision: { sharedPactDefault: true }, // §1.9 — pacts auto-share vision by default
    borders: { pactDefault: true }, // §1.10 — pacts auto-open borders by default
    // Open-borders ENFORCEMENT — open borders is a permit, not a wall: a unit
    // may always move into another faction's territory (conquest needs that),
    // but moving through their ZoC WITHOUT an open-borders agreement is
    // trespassing and costs relations (softened when already on good terms).
    trespass: {
      standingPenalty: 2, // relationship hit (owner → mover) — full rate, distrustful hosts
      reputationPenalty: 1, // global Menace bump on the mover — distrustful hosts only
      goodTermsReduction: 1, // legacy softening dial (Friendly+ terms)
      // Civ-style escalation on Neutral-or-better ground: consecutive rounds
      // of presence walk this ladder — a warning first (0), then −1, then −2
      // per round. Leaving for a round resets the streak. Distrustful hosts
      // (below Neutral) skip the ladder and cite at the full rate at once.
      escalation: [0, 1, 2],
    },
    // Truce — peace is a PROMISE, not a pause. Making peace lifts both
    // sides' Standing to a floor above contempt and opens a window during
    // which neither will re-open hostilities (playtest 2026-08-15: peace
    // left Standing at exactly the Wary line, so the AI's combat loop
    // re-attacked and auto-declared war the very next turn — war and peace
    // churned every round with no legible reason).
    // `rounds` is short and `standingFloor` deliberately stops at Wary: a
    // truce must END the same-turn churn without pacifying the map. Lifting
    // to Neutral instead left former enemies permanently unable to fight
    // (the AI only presses at Wary-or-worse), and 8 of 24 sim games
    // deadlocked with leaders stranded at 9–11 VP.
    truce: {
      rounds: 2, // hostilities stay shut for this long after peace
      standingFloor: -3, // peace lifts both sides to Wary — cooled, not friends
      breakHonorLoss: 6, // attacking through a truce is treachery
      breakMenace: 3,
    },
    // Just war — a formal grievance makes a war RIGHTEOUS: fighting it costs
    // no Menace. You earn one by denouncing the target first (a declared
    // intent the board has heard) or by being wronged by them (broken pact
    // or promise, surprise attack) within the window.
    // Third-party reaction to a denouncement, scored on whether the
    // accusation is CREDIBLE rather than on whether they happen to dislike
    // the target. Saying out loud what everyone was thinking rallies the
    // board; accusing a faction with clean hands isolates you.
    denounce: {
      rallyWarranted: 3, // they agree, and you had grounds
      rally: 2, // they agree
      backlash: 2, // they do not, and now they wonder about you
      allyDefends: 2, // the target's allies close ranks whatever the merits
      targetHit: 3, // Standing the target loses toward you (always)
    },
    // Grievances — the ledger of what has actually been done to you. Each
    // entry carries a severity, so three small betrayals can weigh like one
    // large one, and a settlement has a PRICE rather than being a word.
    grievance: {
      severity: {
        "surprise-attack": 3, // struck before declaring
        "truce-broken": 4, // struck through a promise not to
        "pact-broken": 4, // abandoned an alliance
        "promise-broken": 2, // walked away from a term
        occupation: 2, // holds a place you call yours (a condition, not an event)
        defiance: 3, // ignored an ultimatum you put your name to
        "position-broken": 3, // said it to the whole board, then did it anyway
      },
      defaultSeverity: 2,
      maxPerPair: 8, // the ledger keeps this many; older entries fall off
      // What settling costs the VICTIM: giving up a grievance means giving
      // up the righteous war it entitles you to, so it is not free to ask
      // for and cannot be bought with an apology.
      settlementPerWeight: 1.2,
      // Making amends is honourable — the one route back for a faction that
      // has burned its reputation.
      settlementHonorGain: 2,
    },
    // §3.2 — a Location on the table. The map is the thing the war is
    // about, and until now the only thing anyone could trade was scrap, so
    // diplomacy ran as a side-market beside the game rather than inside it.
    // These are the numbers that make "cede Omara and we have peace" a
    // sentence with a price attached.
    cession: {
      // A city's worth, before anybody's feelings about it: its victory
      // points, weighted, plus what it actually produces each turn.
      vpWeight: 4,
      outputWeight: 1.2,
      // …and what its walls are worth. Bigger places are harder to take, so
      // they cost more to be handed.
      valueRank: { low: 0, medium: 1, high: 2, veryHigh: 4 },
      // A homeland is not priced like a holding. Goldgrass will pay well
      // past Omara's output to have Omara back, which is what makes
      // "give it back" a thing a faction can want badly enough to deal for.
      claimMultiplier: 2.2,
      // Ground given up is worth more than ground gained — you lose the
      // place, the ZoC around it, and the base you were operating from.
      // Scaled by aggression: a warlord does not sell land.
      cedeReluctanceBase: 1.15,
      cedeReluctancePerAggression: 0.7,
      // Handed over, not stormed. A city given is a city intact — no chip
      // is destroyed — but the people living in it did not choose this, so
      // Loyalty starts where a capture would leave it.
      loyaltyOnCede: 2,
      // Being traded away is a grievance the residents' faction holds
      // against nobody in particular, but the affiliated faction minds who
      // ends up standing there. Same penalty a conquest carries: to
      // Goldgrass, Omara passing from Versari to the Lakers is not an
      // improvement.
      thirdPartyStandingHit: 2,
    },

    justWar: {
      denounceWindowRounds: 6, // your denouncement of them counts this long
      grievanceWindowRounds: 8, // their betrayal of you counts this long
      // You cannot re-denounce the same faction until this clears. Paired
      // with honor.denounceLoss it makes a standing pretext something you
      // have to keep paying for, rather than a switch you flip once a round
      // to keep the window open forever.
      denounceCooldownRounds: 5,
    },
    // Precursor warnings — the AI telegraphs trouble to the HUMAN before it
    // lands: a faction whose regard sinks to Wary sends word; the board
    // murmurs when the human's threat score nears the coalition threshold.
    warnings: {
      cooldownRounds: 4, // the same warning won't repeat for this long
      coalitionFraction: 0.7, // murmur when threat ≥ threshold × this
      defyStandingHit: 2, // telling an envoy where to put it
      placateScrap: 5, // the offered tribute on the "placate" answer
    },
    pact: { // §1.9, §1.10 — toggle costs
      toggleVisionStandingHit: 1,
      toggleBordersStandingHit: 1,
    },

    // The verb between asking and attacking. A demand with a deadline and a
    // named consequence — and, crucially, a cost for not following through:
    // an ultimatum you let lapse is a bluff the whole board watched you make.
    ultimatum: {
      deadlineRounds: 3, // how long the other side has to comply
      graceRounds: 2, // how long the issuer then has to make good on it
      menaceOnIssue: 1, // a threat is a hostile act, however politely worded
      bluffHonorLoss: 4, // …and an empty one is worse than never speaking
      defianceSeverity: 3, // the grievance the issuer earns when defied
      complyStandingGain: 2, // giving in buys a little warmth; it costs face
      maxScrap: 30, // ceiling on a tribute demand
      // How long before the same pair can be threatened again. Without this
      // a strong AI reissues every other round and the word stops meaning
      // anything — which is the same reason denouncing has a cooldown.
      cooldownRounds: 8,
    },

    // Posture (diplomacy brief §5) — where a faction stands toward every
    // other, said out loud BEFORE it is acted on.
    //
    // The diagnosis this answers: PABC's diplomacy is not shallow, it is MUTE.
    // Every complaint in the 2026-08-23 playtest — offers arrive unearned,
    // wars come out of nowhere, the AI moves too fast, nothing has a motive —
    // is a symptom of one absence: a faction that will tell you where it
    // stands before it acts on it.
    posture: {
      courtRounds: 2,          // rounds Courting before a pact may be offered
      courtStandingGain: 2,    // per round a COSTLY stated condition holds.
                               // A passive one pays NOTHING — a condition you
                               // satisfy by doing nothing would otherwise mint
                               // Standing every round for changing nothing,
                               // and the ladder becomes a faucet (§7.3).
      courtDriftExempt: true,  // §7.3 — a pair somebody is actively working is
                               // not "unreinforced", which is the whole meaning
                               // of the drift rule. Without this,
                               // courtStandingGain 2 nets +1/round against
                               // drift's -1 and 0 -> 6 takes six rounds, not
                               // three. Measured, not assumed: Standing set to
                               // 6 decays 6 -> 5 -> 4 -> 3 -> 2 over four rounds.
      conditionGraceRounds: 1, // grace before a broken condition transitions
      initiativesPerRound: 1,  // AI-initiated acts per faction per round.
                               // A SELECTION, not a scan — see §5's cadence.
      watchingCadence: 3,      // min rounds between initiatives while Watching
      warningCadence: 2,       //  …while Warning
      statedBeforeActedRounds: 1, // a posture must be on the record this long
                               // before it is acted on. 0 switches the whole
                               // telegraph off without touching code.
    },
    // How much a live interest bends a price (§6 payoff 3, audit tier-3 item
    // 11). Modest on purpose: personality in the price should tilt a
    // negotiation, not let a warlord be talked into anything with the word
    // "war" in it. 0 switches it off.
    interests: { priceMultiplier: 0.6 },

    // Reach — who a faction can talk to at all (diplomacy brief §15).
    //
    // THE HOLE THIS CLOSES, which predates both briefs and is the single
    // largest problem the 15-game suite measures. Every minor in content.js
    // is `scope: "local"`. `mayEngage` returns false when a local faction is
    // outside `ai.localityRadius` (3), and BOTH `aiAcceptsPact` and
    // `aiAcceptsVassalage` return false on `!mayEngage`. But `dominionStanding`
    // counts every surviving faction, minors included. So a minor four hops
    // away can be neither allied nor vassalized — only killed — while still
    // being required for the win condition.
    //
    // Measured on the baseline suite: 3.47 of 4 minors die per game, 0.33 are
    // allied or vassalised, and 6 of 15 games never resolve at all. It is also
    // the mechanism behind the one unresolved game
    // `victory-redesign-2026-08-21.md` reported.
    //
    // The fix is NOT a special ruleset for minors — the research is clear that
    // a simplified parallel ruleset is what earns city-states and tribes their
    // "vending machine" reputation. It is that distance stops being permanent.
    reach: {
      // Out of contact this long and a pair becomes engageable anyway. Silence
      // across a continent is a reason to write a letter, not a wall.
      // 0 switches the escape off entirely and restores the old behaviour.
      reachabilityRounds: 6,
      // …but they are strangers, so the bar is higher. Applied to the Standing
      // both `aiAcceptsPact` and `aiAcceptsVassalage` read, so reaching past
      // your neighbourhood costs something without being impossible.
      distantStandingPenalty: 2,
      // §15 — THE SECOND VASSALAGE DOOR. A `Warning` posture held this long
      // against a faction at or below `ai.vassalPowerRatio` counts as
      // "cornered" for `aiAcceptsVassalage`, without a declared war.
      //
      // Why it is not optional: `aiAcceptsVassalage` gives a MAJOR exactly one
      // door — `cornered = atWar || standing <= wary`. No war, no hostility,
      // no submission. So anything that reduces the number of wars on the
      // board reduces the number of vassals, and §8 (pricing attacks) and §9
      // (coalitions that deliberate) both do. The vassal face is 6 of 15
      // endings on its own; this is what replaces exactly what they remove.
      //
      // Coercion without bloodshed — thematically the right answer for a
      // diplomacy-forward game, and it runs on the posture machinery rather
      // than on a special case. 0 switches the door shut again.
      submissionRounds: 3,
    },

    // Deals and the Standing they move (diplomacy brief §7.1). This is the
    // exploit fix, and everything downstream of it assumes Standing is scarce.
    //
    // WHAT WAS WRONG. `applyDeal` warmed BOTH sides by a flat +2 for every
    // non-gift deal. Gifts have diminishing returns; ordinary deals did not.
    // `chargePester` only fired on a flat refusal, so an accepted deal cost no
    // ask budget. And a 1-scrap give-and-get-nothing deal always has
    // dealValue >= 0, so it was always accepted. Probed on a live engine,
    // seed 424242, round 1: four one-scrap deals took Goldgrass from Standing
    // 0 to 8, and the pact signed. Four scrap, one round, alliance — against a
    // win condition that reads Standing, and against `diplomacy.js`'s own
    // stated guarantee that "a pile of scrap cannot buy past the Standing bar
    // aiAcceptsPact guards, or Standing stops being the currency of the
    // diplomacy game."
    deals: {
      // Standing from a deal now scales with the NET value transferred, each
      // side's half measured by whoever received it. A fair swap is business
      // and warms nobody; generosity is what warms, which is the same thing
      // gifts already say. At 6, three scrap of net generosity buys +1 and
      // nine buys the cap.
      //
      // 0 is the REVERT SWITCH: it restores the historical flat +2 both ways,
      // exploit included. It exists because a bad tuning should be a config
      // revert rather than a branch revert, and because measuring a stage
      // against its own "before" needs the before to still be reachable.
      dealStandingPerValue: 6,
      // …and is capped per pair per round, so the answer to "warm them faster"
      // is never "table more deals this turn".
      dealStandingCapPerRound: 2,
      // Negotiation costs the ask budget either way. `freeAsksPerRound` has
      // always counted accepted asks; only refusals were ever charged for
      // them, so spamming cheap deals a faction would obviously take was free.
      // This is Johnson's warning made mechanical: unlimited free negotiation
      // trades a vending machine for a slot machine.
      chargeAskOnAccept: true,
    },

    // The round trip. A proposal is a thing that sits on a table, not a
    // button that resolves the instant it is pressed.
    offers: {
      // How long an offer waits in the recipient's inbox before it lapses.
      // Short: an offer nobody answered is an insult that fades, and a stale
      // inbox is worse than an empty one.
      expiryRounds: 3,
      // Asking is free this many times per round, per faction. Past that
      // you are pestering, and a refusal cools them.
      freeAsksPerRound: 2,
      pesterStandingHit: 1,
      // A counter-offer will not ask the proposer for more scrap than they
      // actually hold. An unanswerable counter is a refusal with extra
      // steps, and reads as the AI not listening.
      counterWithinMeans: true,
      // Nor will it counter at all when the gap is this far past what the
      // proposer could cover — at some point "no" is the honest answer.
      counterGapCeiling: 60,
      // How often an AI opens with a proposal of its own, as a share of its
      // sociability. Kept low: an inbox that fills every round stops being
      // an event.
      aiProposeChance: 0.35,
    },
  },
};

// Strategic-value ordering helper.
export const VALUE_RANK = { low: 0, medium: 1, high: 2, veryHigh: 3 };
