# Implementation Instructions — Tech Wheel

Quick build guide. **Read `docs/mechanical-spec-v0.1.md` §17 first** — it's the
design of record; this is the how/where. Build on
`claude/ashland-conquest-demo-BViiz`.

## 1. Data model

**Per-player state (`setup.js`, replaces `player.tech`):**
- `research` — derived total (Labs + permanent), recomputed; don't author directly.
- `permanentResearch` — research banked from encounters/quests (a floor; never recomputed away). Init 0.
- `techLevel` — derived band 1–5.
- `techWheel` — `string[]` of assigned node ids **in assignment order** (so the LIFO peel is just `pop()`).

**Node registry (new `src/game/tech.js`):** the wheel definition.
```
TECH_NODES = {
  "mil-entry":  { id, path:"military",      layer:1, prereq:null,        effect:{kind:"contestRoll", amount:1} },
  "log-entry":  { id, path:"logistics",     layer:1, prereq:null,        effect:{kind:"movement",    amount:1} },
  "eco-entry":  { id, path:"economy",       layer:1, prereq:null,        effect:{kind:"locationScrap",amount:1} },
  "int-entry":  { id, path:"intelligence",  layer:1, prereq:null,        effect:{kind:"encounterRedraw"} },
  // branch nodes A1/A2/B1/B2 per path = PLACEHOLDERS for now (effect:{kind:"noop"})
}
```
Each path is 5 nodes over 3 layers: `entry → A1 → A2` and `entry → B1 → B2`
(prereq chains). Only the 4 entries have real effects; stub the 16 branch nodes.

## 2. CONFIG (`config.js`)

```
tech: {
  researchThresholds: [2, 4, 6, 8],   // research needed for L2,L3,L4,L5
  maxLevel: 5,
  marketTierByLevel: { 2: 3, 3: 5 },  // market tier 2 @ L3, tier 3 @ L5
}
```
Drop the old `tech.start / tier2 / tier3`.

## 3. Content (`content.js`)

- `labs`: add `research: 1`.
- New `advanced-lab` chip: tier 2, `kind:"location"`, `slots:1`, `research: 2`.
- Keep `recon-team`. Keep `new-recruits` rename from the v0.2 work as-is.

## 4. Engine — the core: `recomputeResearch` (`stats.js`)

Rename `recomputeTech` → `recomputeResearch` (update its callers in
`actions.js` runAcquire, `contest.js` captureLocation, `turn.js` tickFootholds).

```
for each player p:
  labResearch = Σ over locations p fully controls of (CHIPS[chip].research || 0)
  p.research  = p.permanentResearch + labResearch
  newLevel    = band(p.research, CONFIG.tech.researchThresholds)   // 0→1, >=2→2, >=4→3, >=6→4, >=8→5
  if newLevel != p.techLevel:
     p.techLevel = newLevel
     emit research_changed / tech_level_changed
  // enforce ability-point budget after a level drop:
  maxPoints = p.techLevel - 1
  while p.techWheel.length > maxPoints:
     peel(p)   // pop the last assigned node; if that orphans a deeper node it
               // can't (you always assign shallow→deep, so the last in is a leaf)
```
`peel` removes `techWheel.pop()`, emits `tech_node_lost`, and recomputes any
passive that node fed (see §6).

## 5. Engine — assign / unassign (no Action cost)

`assignTechNode(state, pid, nodeId)`:
- validate: `techWheel.length < techLevel-1` (a free point), node not already in,
  prereq present (or null). Append to `techWheel`; emit `tech_node_assigned`.
- Assigning is **free of the Action budget** (you're spending Ability Points,
  earned by leveling). Players assign when they gain a point; re-spec naturally
  happens because peeled points can be re-assigned after a rebuild.

Helper `hasTechNode(state, pid, nodeId)` → boolean, used by effect sites.

## 6. Engine — apply entry effects at their use sites

These are passive; check `hasTechNode` where the value is computed:
- **Military `mil-entry`** (`contest.js`): +1 to that player's roll, whether the
  player is the **initiator or the defender** ("any contest roll").
- **Logistics `log-entry`** (`stats.js recomputeStats`): +1 `movement` to units
  whose owner has the node.
- **Economy `eco-entry`** (`turn.js collectProduction`): +1 scrap per fully-held
  location for an owner with the node.
- **Intelligence `int-entry`** (`encounters.js drawFieldEncounter`): when the
  drawing player has the node, offer a discard-and-redraw via `ctx.interact`
  (reshuffle the discard ≥3 deep; only on that player's own draw). **Stacks with
  the `recon-team` chip:** allowed discards = `(hasNode ? 1 : 0) + reconTeamCount`;
  after the last discard the player is committed to the draw.

## 7. Market gating (`actions.js`)

`unlockedTier(player)` reads `player.techLevel`: tier ≥3 needs L5, ≥2 needs L3
(via `CONFIG.tech.marketTierByLevel`). Replace the old raw-score `unlockedTier(tech)`.

## 8. Events (`events.js`)

Add to `EVENT_NAMES`: `research_changed`, `tech_level_changed`,
`tech_node_assigned`, `tech_node_lost`.

## 9. UI (`src/prototype/`)

- **Adapter:** expose `research`, `techLevel`, `abilityPointsAvailable`
  (`techLevel-1 - techWheel.length`), and the `techWheel` set per player.
- **TechWheel.jsx** (new): radial SVG, 4 spokes (reuse the ControlMeter
  drawing style). Nodes render assigned / assignable (point free + prereq met) /
  locked. Click an assignable node → call `assignTechNode`, bump tick.
- Surface a **Research bar + Tech Level + Ability Points** readout, and put the
  wheel behind a dock tab or a header button. Show entry tooltips; branch nodes
  render as "TBD".

## 10. Verify

Harness: build a Lab → research 1 (still L1); build a 2nd → L2, 1 point, assign
`mil-entry`; confirm market tier 2 unlocks at L3 and tier 3 at L5; grant
permanent research via a stub encounter and confirm it survives losing a Lab;
destroy a Lab to drop a level and confirm the last-assigned node is peeled.
Browser: assign nodes on the wheel; confirm the entry effects fire (a Military
unit rolls +1, Logistics unit moves +1, Economy +1 scrap/loc, Intelligence
offers the redraw and stacks with Recon Team).

## Out of scope

- The 16 branch-node effects (stub as `noop`; design pass later).
- Stacking-vs-replace within a branch (decide when branches are written).
- Diplomacy victory (later; would read the existing track/standing state).
