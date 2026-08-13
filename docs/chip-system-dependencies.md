# Chip Implementation — System Dependency Map

Delegation brief: every system that must exist before the chip sets in
`docs/chip-set-v0.1.md` (units) and `docs/location-chips-v0.1.md`
(locations) can be implemented without leaving dangling half-features.
Classified by direct code verification of what the engine reads today.
Goal ordering rule from the design owner: **do not implement chips whose
system doesn't exist yet** — build the system first or defer the chip.

## Group 0 — chips that are pure data TODAY (no prerequisite)

The engine already reads every field these need. They can go into
`content.js` the moment the enabler systems (Group 1) land — and
mechanically they'd work even before those, just without faction naming
or the stacking rule.

- All stat chips: `strength`, `movement` (`stats.js:19-20`), `vision`,
  `detection` (`visibility.js:25-34` — declared schema of record),
  including both T3 capstones' *stat halves*.
- Location: output/research (`economy.js`), garrison (`contest.js:29`),
  `unitCapBonus` (muster), `encounterRedraws` (recon), `logistics-hub`
  (action grant — already live), **watchtower** (`vision`/`detection`
  read off location chips too), **influence-1/2**
  (`influence.js:26-32` — `influenceBase`/`localInfluence`/
  `influenceRange`, declared schema of record).
- `upkeep`/dormancy, `upgradesTo`, tech/loyalty gates: all live.

## Group 1 — enabler systems (BUILD FIRST — everything waits on these)

| # | System | What it is | Size | Chips blocked by it |
|---|---|---|---|---|
| S1 | **Faction skin layer** | One mechanical chip row + per-faction display name/flavor table; name resolution wherever chips render (build menu `engineAdapter.js`/`HudChrome.jsx`, chip lists, logs). Schema should allow per-faction mechanical overrides later, carry only strings now. | M | Every generic chip's naming (both docs' entire naming matrices) |
| S2 | **One-chip-per-stat rule** | `statType` field on chip defs; validation in unit-bay install (`economy.js:135-141` bay picker + `actions.js` validateBuild). Without it the T3 capstones are dead content (see unit doc §capstones). | S | All unit stat chips, capstone viability |
| S3 | **Faction-locked chips** | `faction` field + filter in `buildableChips()` (`economy.js:92`). Includes decision: captured enemy Locations do NOT offer the captor the previous owner's signatures. | S | 4 signature location chips; skins technically ride S1 not S3 |
| S4 | **Reward-chip delivery** | No `GRANT_CHIP`-style effect type exists (verified: `effects.js` has none; zone helpers for `unitBay`/`locationSlots` exist at `effects.js:36-37`, so plumbing is partial). Needs: effect type + target-unit selection (or a small player inventory + install flow) + quest/encounter authoring support. | M | All 6 quest chips: Cold Camp, Night March, War Banner, Old Hands, Safe Conduct, Relay Kit |
| S5 | **Activated unit chips** | Chips today are passive or dormant; only location ABILITIES activate (`actions.js:384-412`). Generalize that `activate` action to unit chips with a per-turn scrap cost + duration flag ("until your next turn"). | S–M | Cold Camp only (but the mechanism is reusable for future actives) |
| S6 | **Economy pass** | `rushScrapPerPoint` > 1, `defaultSlider` > 0, apply the 3/6/12 cost curve. Pure config + retuning; chips function without it but no cost means anything until it lands. | S | None functionally — all of them economically |

## Group 2 — per-chip hooks (one function each; build WITH the chip)

Not systems — each is a small conditional in exactly one place. Fine to
implement chip-by-chip; listed so the implementing agent knows the seam.

| Chip | Hook location |
|---|---|
| Landship (terrain rider) | `movement.js` entry-cost/halt calc reads chip flag |
| Bombard (siege rider) | `contest.js` defenderValue — skip static bonuses |
| War Banner | `contest.js` `concentration()` count + cap |
| Night March | `movement.js` `movementBlockers()` |
| Rearguard | `contest.js` retreat distance + attrition rout spill |
| Trailwise | encounter trigger flow (mirror recon-team's redraw) |
| Old Hands | veteran checks (`stats.js` / `contest.js`) treat as veteran |
| Safe Conduct | `diplomacy.js` `onTrespass` early-out |
| Relay Kit | `actions.js:430` validateBuildPost tech-gate bypass |
| Entrenching Tools | `contest.js` fortify bonus calc |
| Field Medics | `turn.js` `passiveHeal` location check |
| `builder` | economy build-progress tick (+1 flat) |
| `infirmary` | `passiveHeal` (+1 more here) + `scrapPerStrengthFor` |
| `civic` | `turn.js` loyalty tick (rise bonus / decay skip) |
| Waystation | turn-start movement grant (`stats.js` recompute or turn.js) |
| Motor Pool | recruit cost in validate/runRecruit (cap half is pure data) |
| Guest House | `standing.js` upkeep drift |
| Burning Glass | `contest.js` pre-resolution attacker erosion |

## Group 3 — big proposed systems (chips DEFERRED until these ship)

Per `docs/rail-road-blockade-design.md` — design settled, nothing
implemented. Do NOT implement these chips first:

| System | Deferred chips |
|---|---|
| **Blockade structure** (build action, funding draw, contest/destroy) | Cache Maps, Teamster Yard, Toll Booth (+ the blockade-chip slot concept itself) |
| **Rail network** (links, instant transport, production pooling) | Railyard; `railIncompatible` flag becomes meaningful (harmless to author early — it's inert data until rail reads it) |
| **Blockade vision-gating** (Part 1 of that doc) | No chip blocked — but it's what makes watchtower/Detection chips strategically load-bearing |

## Adjacent cleanup (same pass, not chip work)

- **Retire `town-hall`** — its foothold effect references a system §18.2
  Loyalty replaced; nothing reads it (verified).
- **Retire/regenerate `content/upgrade-chips.csv`** as a mirror of the
  new `content.js` set (decision from session start: content.js is the
  source of truth; the CSV must stop being a rival dataset).
- **Fix the stub abilities** `knowledge-cache` / `fortified-ruins`
  (`content.js:168-191`) — currently the literal same +1 VP effect at
  different costs.
- `rail-corridor` ability stub nets +3 scrap/turn for a one-time cost —
  re-price or stub differently when touched.

## Recommended build order

1. **S2 → S1 → S3** (small enablers, in that order: rule, skins, locks)
2. **Content batch 1**: all Group 0 chips + Group 2 location hooks
   (`builder`, `civic`, `infirmary`, signatures) — playable variety lands
   here, plus town-hall retirement and CSV regeneration
3. **S6 economy pass** — once real content exists to price
4. **S4 reward delivery + S5 activation**, then content batch 2: the six
   quest chips + remaining unit hooks (capstone riders, Rearguard, etc.)
5. **Group 3 systems** on their own schedule; their chips ship with them
