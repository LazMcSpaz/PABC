# Unit Chip Set v0.1 — Design Audit & Decided Roster

Output of the chip design sessions (Aug 2026) plus a solo balance audit of
every proposed chip against the live engine (`src/game/config.js`,
`contest.js`, `movement.js`, `visibility.js`, `actions.js`) and the
rail/blockade design doc. Names in the roster tables are **decided**; costs
are relative weights pending the Rush/slider economy pass. This doc is the
authoring source for the eventual `src/game/content.js` CHIPS rewrite —
location chips are a separate, forthcoming pass.

## Design rules (locked)

1. **One chip per stat type per unit.** A unit may never carry two chips of
   the same stat (no double-Strength, double-Movement, double-Vision).
   Audit verdict: **keep, on its own merits** — it isn't just scaffolding
   for the 2-slot capstones. Without it, a 2-slot unit stacks +2/+2
   Strength (base 4 → 8), which single-handedly clears every garrison band
   (`garrisonByValue`: medium 6, high 8, veryHigh 10) before concentration
   (+3 cap) and veteran (+1) even apply. The rule keeps the defense curve
   meaningful and keeps units legible archetypes (the fast one, the strong
   one, the scout, the hybrid).
2. **Tier structure**: T1 = individual capability, T2 = collective
   capability (the whole squad rides / fights as one body / reports what it
   sees). T3 = shared pre-collapse salvage — nobody manufactures it, so it
   has no faction skin.
3. **Only T3 capstones cost 2 slots**, and **every 2-slot chip is
   `railIncompatible`** (rail design doc §2.1 open question — resolved
   here: the flag falls out of slot count, no per-chip judgment).
   Possible future exception: a Lakers-flavored railway-gun variant.
4. **Faction flavor is a skin table, not new chips.** One mechanical row
   per (stat, tier); per-faction entry supplies name/flavor only, with room
   for mechanical overrides later. Balance lives in the mechanical rows.
5. **No Vision capstone.** Sight is area, not a line: radius 2 sees 19
   hexes, radius 3 sees 37 — the whole 30-hex test board. The vision
   ladder correctly stops at +1 Vision / +1 Vision & Detection.
6. **Reward chips (quest/encounter) have one world-wide name** — they're
   found artifacts, not faction products.

## Stat chips — the faction matrix

Mechanics per tier (identical across factions):

| Tier | Movement | Strength | Vision |
|---|---|---|---|
| T1 (1 slot) | +1 Movement | +1 Strength | +1 Vision |
| T2 (1 slot) | +2 Movement | +2 Strength | +1 Vision **and** +1 Detection |
| T3 (2 slots, shared) | Landship | Bombard | — |

T2 Vision keeps T1's range bonus — it upgrades via `upgradesTo`, and an
upgrade that swapped range for Detection would be a downgrade in the field.
Detection matters because `unitDetection: 0` — nobody sees concealed units
by default, and these chips are the intended counter to stealth and the
(vision-gated) blockade rules.

| Faction | Mov T1 | Mov T2 | Str T1 | Str T2 | Vis T1 | Vis T2 |
|---|---|---|---|---|---|---|
| Versari Korad | Sunrunner | Sunhauler | Engineered Blades | Set Piece | Long Optics | Signal Intercept |
| Goldgrass Coalition | Trace Horses | Stage Line | Scythe Levy | Threshers | Field Talk | Neighbors |
| Grand Lakers | Droit Iron | Chrome Hauler | Stamped Plate | Drop Hammer | Highbeams | Searchlight |
| Free Plainers | Mustangers | Remuda | Bushwhackers | Buffalo Gun | Outriders | Cutting Sign |

Flavor threads: Versari = solar/engineering/planning; Goldgrass = the
relay-and-neighbor network (fresh teams staged ahead, not more wagons);
Lakers = Motor City vintage iron ("Droit Iron" = Detroit iron); Plainers =
horse culture and tracker vocabulary ("Cutting Sign" = reading trail).

**Burning Glass** (focused mirror array) is reserved as a Versari-flavored
*location* garrison chip for the location-chip pass — static by nature,
and Garrison currently has exactly one chip in the whole game.

## T3 capstones — why they carry riders

Audit finding: the one-per-stat rule alone does NOT save the capstones.
The real competitor to a 2-slot +3 isn't two same-stat chips (illegal) —
it's a +2 chip plus an entire second capability in the other slot. At base
Movement 2 on a 7-column map, the 5th movement point is marginal; at base
Strength 4 on a 1d6 contest, +1 over the T2 is ~17% of a die. A rational
player takes the generalist pair every time. So each capstone does a job
no combination of 1-slot chips can assemble:

- **Landship** — +3 Movement; ignores terrain (forest costs 1, mountains
  do not halt). It drives over everything. Supersedes Pathfinders at the
  top end — an upgrade path, not a duplicate. 2 slots, upkeep,
  railIncompatible ("you can't put a land ship on a train" — rail doc).
- **Bombard** — +3 Strength; when contesting a Location, the defender's
  static-defense bonuses (fortify, mountain, turret-doubling) are negated.
  Siege identity: the only true answer to a veryHigh garrison (10) behind
  walls. 2 slots, upkeep, railIncompatible.

## Special chips — quest/encounter rewards (found artifacts)

Rule of thumb from the audit: quest chips *change what's possible*;
buildable chips *tune what you already do*. Rewards can break a rule of
the game because acquisition is rationed by play, not by scrap.

| Chip | Effect | Slots | Audit verdict |
|---|---|---|---|
| **Cold Camp** | Pay 2 scrap at turn start → unseen until your next turn | 1 | Keep. Activation cost (not passive) both rations it and is a scrap sink the economy needs. Counters exist: Detection chips are buildable by everyone. |
| **Night March** | Passes through enemy *units* without halting (not Locations, not built Blockades) | 1 | Keep, narrowed. Distinct from Cold Camp: works while seen. |
| **War Banner** | Counts as an extra unit for concentration, and raises its stack's concentration cap by 1 (3→4) | 1 | Reworked. As proposed it was a conditional +1 Strength — strictly worse than a T1 stat chip. The cap-raise gives it a job nothing else does. |
| **Old Hands** | This unit counts as a veteran while installed (+1 contests, Strength cap 8) | 1 | Reworked. The "one extra win toward promotion" version becomes a dead slot the moment it pays off. Renting veteran status for a permanent slot is a real, legible price. |
| **Safe Conduct** | No Standing or Menace penalty for entering enemy ZoC | 1 | Keep. Menace drives Tolerance/dogpiling, so this is the schemer artifact. Needs UI surfacing or it's invisible. |
| **Relay Kit** | This unit can build Listening Posts without Intelligence A2 (normal scrap cost + upkeep) | 1 | Reworked. Posts are hard tech-gated (`actions.js:430`); "free + no upkeep" either does nothing (still gated) or hands out a tech branch plus a free economy. Bypassing the gate at normal cost is the artifact version. |

## Special chips — buildable (market/Location build)

| Chip | Effect | Cost | Slots | Audit verdict |
|---|---|---|---|---|
| **Cache Maps** | Can build and sustain a Blockade with no road connection, funded from your scrap bank | 5 | 1 | Keep. Ships with the Blockade feature, not before. |
| **Field Medics** | Heals +1 at Upkeep anywhere, not only on a held Location | 4 | 1 | Keep. Owns healing outright now that Cache Maps is a blockade chip. Changes campaign tempo (no rotate-home loop). |
| **Pathfinders** | Forest costs 1 to enter; mountains don't halt the move | 5 | 1 | Merged from Switchbacks + Brushcutters. Separately, each solved half of ~7 terrain hexes — neither passed "would a player buy this." Together it's one real chip, and the stepping stone to Landship. |
| **Rearguard** | On losing a contest, may retreat 2 hexes; never takes rout spill damage | 4 | 1 | Merged from Fighting Withdrawal + Dispersed Order. Two narrow loss-mitigation chips → one genuine defensive pick. |
| **Trailwise** | Once per turn, discard an encounter this unit triggers and redraw | 3 | 1 | Keep. 13 of 30 hexes are encounter hexes; mirrors Recon Team's `encounterRedraws`. |
| **Entrenching Tools** | +1 to this unit's fortify bonus | 3 | 1 | Keep. Looks worse than a flat +1 Strength — its niche is that it's the *only* legal way to push a defensive unit past the one-per-stat cap (+2 Str chip + this = +4 fortified). The turtle build. |

**Cut: Picket Line** (immune to ambush). Detection chips already own the
counter-stealth niche and do it strictly better — they reveal the hidden
unit, which also feeds the vision-gated blockade rules. A cheaper
side-door anti-ambush chip would gut the Vision/Detection line's reason to
exist.

## Cost curve (proposal — pending the economy pass)

Current 2–7 costs are trivial against 6–20 scrap/turn aggregate income.
Proposed relative weights: T1 stat 3 · T2 stat 6 · capstones 12 (+1–2
upkeep) · buildable specials 3–5. These only bite if the economy pass
lands its two config changes (`rushScrapPerPoint` > 1, `defaultSlider` >
0), which are out of scope here but assumed.

Proposed gating stays on the existing bands: T1 = Tech L1/Loyalty 0,
T2 = Tech L3/Loyalty 3, T3 = Tech L5/Loyalty 6.

## Faction signature access (proposal, undecided)

Identical chips mean chips contribute nothing to faction feel. Cheapest
fix: each faction gets its signature line one tech band earlier (or −1
cost): Lakers → Strength, Plainers → Movement, Versari → Vision, Goldgrass
→ the settlement/economy side (their identity lives in location chips).
One field, no new content.

## Open questions

- Railway-gun exception to `railIncompatible` for Bombard (flavor win vs.
  clean rule).
- Whether quest chips can be removed/swapped once installed (slot
  permanence is the price of Old Hands et al. — needs a rule).
- Location-chip pass: Garrison/Unit-cap/Foothold/Encounter/Actions are
  still single-chip dead ends; Burning Glass is the first planned addition.
- The two stub abilities (`knowledge-cache`, `fortified-ruins`) still
  resolve to identical +1 VP effects — untouched by this pass.
