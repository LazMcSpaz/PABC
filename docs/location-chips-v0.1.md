# Location Chip Set v0.1 — Proposal

Companion to `docs/chip-set-v0.1.md` (unit chips). Location chips are
buildings: economy, defense, and settlement infrastructure, built into a
Location's chip slots off its Output. Same authoring model as unit chips —
**one mechanical row per effect, a per-faction skin table for names** (~90%
of the set), plus one signature chip per faction (~10%) that only that
faction can build. 2-slot chips keep a single world-wide name (rule 3 of
the unit doc: they're pre-collapse-scale infrastructure, not faction
products).

## Engine findings this proposal is built on

- **Influence chips are pure data already.** `influence.js:26-32` declares
  the schema of record: `influenceBase`, `localInfluence`,
  `influenceRange` — "no influence chips exist yet; the reader is the
  schema of record." A ZoC-expanding building needs zero engine work.
- **Vision chips are pure data already.** `visibility.js:25-34` reads
  `vision` / `detection` off any chip on a unit *or Location*. A
  watchtower needs zero engine work.
- **Town Hall is a dead chip.** Its effect ("+1 foothold cap") references
  the foothold system that §18.2 Loyalty explicitly replaced
  (`config.js:8`, `turn.js:28`). Nothing reads a foothold cap. **Retire
  it** in the content rewrite.
- **Slot scarcity is real and is the balance mechanism.** Slots by
  strategic value: medium 1, high 2, veryHigh 3 — and every High/veryHigh
  Location's assigned ability chip already occupies one. So a medium picks
  ONE building; a high picks one; a veryHigh picks two. Loyalty 6 grants
  +1 slot (`bonusSlotLoyalty`). Chips compete hard; variety is choice, not
  accumulation.
- Precedents used: Economy B1 tech gives −1 chip build cost; Turrets tech
  doubles fortify; capital adds flat garrison/production; passive heal is
  +1 on a fully-held Location; recruit costs 6 and requires Training
  Grounds' `unitCapBonus`.

## Generic roster — mechanics (one row = one chip, skins below)

| # | Row id | Effect | Cost | Slots | Tech / Loyalty | Upgrades to | Engine status |
|---|---|---|---|---|---|---|---|
| 1 | `output-1` | +1 scrap Output | 3 | 1 | L1 / 0 | `output-2` | live (`output`) |
| 2 | `output-2` | +2 scrap Output | 6 | 1 | L3 / 3 | — | live |
| 3 | `builder` | +1 build progress per turn toward this Location's active build | 4 | 1 | L1 / 0 | — | small hook in build tick |
| 4 | `research-1` | +1 Research | 3 | 1 | L1 / 0 | `research-2` | live (`research`) |
| 5 | `research-2` | +2 Research (upkeep 1) | 6 | 1 | L3 / 3 | — | live |
| 6 | `garrison-1` | +2 garrison Strength | 4 | 1 | L1 / 0 | `garrison-2` | live (`garrison`) |
| 7 | `garrison-2` | +4 garrison Strength (upkeep 1) | 7 | 1 | L3 / 3 | — | live |
| 8 | `muster` | Enables recruiting; +1 unit cap | 4 | 1 | L1 / 0 | — | live (`unitCapBonus`) |
| 9 | `infirmary` | Units here heal +2 per Upkeep (instead of +1); instant reinforce here costs 1 scrap/Strength | 5 | 1 | L3 / 3 | — | small hook in `passiveHeal` / reinforce |
| 10 | `watchtower` | This Location: +1 Vision, +1 Detection | 3 | 1 | L1 / 0 | — | **pure data** (`vision`/`detection`) |
| 11 | `influence-1` | +2 local Influence projected by this Location | 4 | 1 | L1 / 0 | `influence-2` | **pure data** (`localInfluence`) |
| 12 | `influence-2` | +2 local Influence and +1 Influence range | 7 | 1 | L3 / 3 | — | **pure data** (`influenceRange`) |
| 13 | `civic` | Loyalty rises +1 extra per Upkeep while garrisoned, and does not decay while neglected | 5 | 1 | L3 / 3 | — | small hook in loyalty tick |
| 14 | `recon` | Once per turn, discard an encounter drawn here and redraw | 3 | 1 | L1 / 0 | — | live (`encounterRedraws`) |
| 15 | `logistics-hub` | +1 Action each turn (upkeep 1) | 12 | 2 | L5 / 6 | — | live; shared name (2-slot rule) |

Retired: `town-hall` (dead foothold reference — see findings).

Why these earn their slot against each other:

- **`builder`** is the guns/butter chip — a permanent free build point,
  i.e. a standing discount on every future chip here. The tall-economy
  opener.
- **`civic`** is the synergy engine of the whole set. Loyalty feeds four
  systems at once: influence (`loyaltyScale` 1/point), Location vision
  (+1 per 4 Loyalty), the Loyalty-6 **bonus chip slot**, and every chip's
  `loyaltyReq` gate. Build it and it eventually *refunds its own slot* —
  the chip that makes room for itself.
- **`influence-1/2`** turn a Location into a ZoC anchor. ZoC is quietly
  load-bearing: it severs enemy supply routes, triggers trespass
  Standing/Menace penalties, and (per the rail/blockade doc) will cut rail
  pooling and blockade funding lines. Pushing your border is an attack
  that never rolls dice.
- **`watchtower`** + the vision-gating rework makes a garrisoned border
  town into a real picket: blockade only halts what the blocker can see.
- **`infirmary`** makes one settlement the campaign hospital — rotate
  wounded units through it instead of drip-healing everywhere.

## Naming matrix (skins — same mechanics, faction display names)

| Row | Versari Korad | Goldgrass Coalition | Grand Lakers | Free Plainers |
|---|---|---|---|---|
| `output-1` | Panel Field | Gleaning Yards | Breaker Yard | Salvage Camp |
| `output-2` | Sunworks | Gristmill | Stamping Plant | Tradehouse |
| `builder` | Fabricator | Barn Raising | Assembly Line | Roustabouts |
| `research-1` | Lyceum | Almanac Society | Trade School | Assay Office |
| `research-2` | The Institute | Seed Vault | Proving Grounds | Surveyors' Guild |
| `garrison-1` | Rampart | Hedgerows | Slag Wall | Stockade |
| `garrison-2` | Bastion | Granary Keep | Blast Wall | Hillfort |
| `muster` | The Academy | Militia Green | Union Hall | Bunkhouse |
| `infirmary` | Clean Ward | Apothecary | Company Clinic | Sawbones |
| `watchtower` | Heliograph | Steeple Watch | Water Tower | Fence Riders |
| `influence-1` | Wire Service | Market Fair | Radio Tower | Circuit Riders |
| `influence-2` | Signal Authority | County Fair | Clear Channel | Camp Meeting |
| `civic` | The Ministry | Grange Hall | Company Store | Watering Hole |
| `recon` | Field Agents | Town Criers | Block Captains | Trail Scouts |
| `logistics-hub` | — Logistics Hub (shared) — | | | |

Naming logic per faction: Versari = engineered institutions (the solar
thread runs through Panel Field / Sunworks / Heliograph); Goldgrass =
communal agrarian life (Barn Raising, Grange Hall, Steeple Watch — the
village does it together); Lakers = rust-belt company town (Union Hall,
Company Store, Water Tower, Clear Channel — industry vocabulary
throughout); Plainers = frontier townsite (Sawbones, Watering Hole, Fence
Riders, Camp Meeting — people-shaped names, consistent with their unit
chips).

## Faction signature chips (~10% — only that faction may build)

| Faction | Chip | Effect | Cost | Slots | Tech / Loyalty |
|---|---|---|---|---|---|
| Versari Korad | **Burning Glass** | +2 garrison Strength; attacking units suffer 1 Strength erosion before the contest resolves | 6 | 1 | L3 / 3 |
| Goldgrass Coalition | **Guest House** | Each Upkeep, Standing with every non-hostile faction drifts +1 | 5 | 1 | L3 / 3 |
| Grand Lakers | **Motor Pool** | Recruiting here costs 2 less scrap; +1 unit cap | 5 | 1 | L3 / 3 |
| Free Plainers | **Waystation** | Friendly units beginning their turn here gain +1 Movement that turn | 5 | 1 | L3 / 3 |

Each signature feeds its faction's victory lean: Burning Glass makes
Versari cities expensive to crack (schemers defend with engineering, not
armies); Guest House is a diplomacy-victory engine for the diplomacy
faction; Motor Pool compounds the Lakers' war economy (with `muster`: cap
+2, recruits at 4); Waystation makes Plainer territory a launch rail for
opportunist strikes.

## Future rows (flagged — ship WITH their systems, not before)

| Chip | Effect | Ships with |
|---|---|---|
| **Toll Booth** | Blockade chip (not a settlement chip): the Blockade generates passive scrap | Blockade structure (rail doc §3.2 — proposed there) |
| **Teamster Yard** | This settlement can fund one Blockade regardless of road connection, and funds builds +1/turn faster | Blockade structure |
| **Railyard** | Production pooling into this Location delivers +1 scrap/turn extra | Rail network |

## Synergy webs (the playstyles the variety is for)

- **Tall economy**: `builder` + `output-2` + `civic` → the Loyalty-6 slot
  pays for the third chip; everything gets cheaper to add.
- **Fortress border town**: `garrison-2` + `watchtower` (+ Burning Glass
  for Versari) → high static defense that can actually see attackers, and
  post-rework halts them.
- **ZoC engine**: `influence-2` + `civic` → Loyalty feeds influence twice
  (directly via `loyaltyScale` and by rising faster); severs supply lines
  and (future) rail/blockade funding without a fight.
- **War economy**: `muster` + Motor Pool (Lakers) or `muster` +
  `infirmary` → produce and repair armies in one place.
- **Intel hub**: `watchtower` + `recon` + a Listening Post net → the
  information corner of the map.

## Open questions

- `civic`'s no-decay half may be too strong with the AI's neglect
  patterns — may need to be rise-only at first.
- Should `influence-2` require `influence-1` built elsewhere or upgrade in
  place (current assumption: normal `upgradesTo` in place)?
- Burning Glass's pre-contest erosion is a new (small) contest hook —
  confirm it fires before strength comparison, and whether it can kill
  (proposed: yes, a 1-Strength attacker dies on approach).
- Whether signature chips appear in the build menu of captured enemy
  Locations (proposed: no — faction-locked, not Location-locked).
