# Rail, Blockade, and the Vision-Gating Rework — Design Doc

Design conversation, not yet implemented. Captures three intertwined systems
that came out of one thread: closing a real gap in how blockade works today,
a new Rail network as road's genuinely-differentiated counterpart, and a new
buildable Blockade structure that both depends on and motivates the vision
rework. Numbers throughout are placeholders pending a balance pass — the
mechanics are the settled part, the constants aren't.

## Why this started

Road today (`src/game/board.js`) is free-for-anyone terrain infrastructure —
it costs 1 to enter and never halts, even through mountain or forest, and
there's no ownership check on it: any faction's units benefit, not just
whoever's territory it's in. A rail line with the same effect would just be
road reskinned. The differentiation that actually matters: rail is something
a faction *builds and owns*, not terrain everyone gets for free — which
opened into a much larger conversation once "owned infrastructure" met the
question of what already governs whether territory is contested.

## Part 0 — Verified current state (before any of this changes anything)

Established by direct code investigation, not assumption — load-bearing for
everything below:

- **Blockade is already fully vision-blind today.** `movementBlockers()` in
  `src/game/movement.js` iterates *every* unit and Location in the game
  state — ground truth, zero fog/visibility check. A unit sitting in
  territory you've never explored can halt your movement right now, with
  nothing telling you why.
- **ZoC and Vision are deliberately separate systems** (per
  `src/game/visibility.js`'s own header comment), and mostly stay that way —
  a concealed unit can sit inside your Zone of Control unseen; ZoC merely
  *contributes* to the owning faction's vision (the ZoC hex itself gets
  added to their visible set — `CONFIG.fog.zocVision`, currently 0, means
  only that exact hex, no surrounding radius).
- **One place breaks that separation today**: the diplomatic trespass
  penalty (`onTrespass` in `src/game/diplomacy.js`) fires a Standing hit +
  Menace increase purely off a mover's destination hex being inside an enemy
  ZoC — no check on whether that faction can actually perceive the
  intrusion. This is flagged here as a known inconsistency; **not yet
  resolved whether to fix it as part of this work** — see Open Questions.
- **`fortified`** (the existing per-unit flag shown in `UnitPanel`) is a
  transient, single-turn combat bonus only (+1 defense value in a contest,
  `src/game/contest.js`, doubled with the Turrets tech) — wiped the instant
  a unit moves again. It has no vision effect and no blockade-strength
  effect today. The new Blockade structure below is a wholly new mechanic,
  not an extension of `fortified`.

## Part 1 — Blockade vision-gating (closes the Part 0 gap)

A hex only halts a mover if whatever's blocking it can actually detect that
mover — reusing the existing `canSee`/detection machinery
(`src/visibility.js`), not a simplified range check, so concealment/stealth
still matters the same way it already does everywhere else.

- **Applies universally** — both casual blocking-by-presence (an ordinary
  unit still halts movers just by sitting on a hex, unchanged) and the new
  Blockade structure (Part 3). What changes for ordinary units isn't *who*
  can block, it's *whether detection is required first* — an ordinary unit
  blocks using its own normal vision range (`unitVision()` — base + chips +
  tech + elevation), no special-casing.
- This is what actually fixes the Part 0 gap for the common case, not just
  for the new elite mechanic — most blockades in a real game are just units
  standing somewhere, not built structures.

## Part 2 — Rail network

### 2.1 Instant unit transport

- A rail hop between two directly rail-linked hexes costs a flat 1 movement
  point (matching road's per-hex cost-1 pattern), regardless of the
  geographic distance between the two endpoints.
- Endpoint-to-endpoint only — a unit must be standing exactly on a
  rail-linked hex to use it, no "boarding mid-route."
- **Chainable through hub links** (A↔B and B↔C both built): proposed to work
  for free by modeling rail links as extra 1-cost adjacency edges injected
  into the existing movement BFS (`expandMovement` in `board.js` already
  walks `adjacency[hex]`) — multi-hop chaining falls out of the existing
  pathfinding with no bespoke new algorithm, and is naturally self-limited
  by the unit's movement budget the same way ordinary movement already is.
- **Unit eligibility gate**: a unit carrying a chip that's thematically
  incompatible with rail travel (the example given: a "land ship" chip —
  you can't put a land ship on a train) cannot use rail at all while that
  chip is installed. Needs a new boolean-ish flag on chip definitions (e.g.
  `railIncompatible: true`) that the rail-hop check reads. Which existing
  chips carry this flag is not yet decided — flagged in Open Questions.
- Like a physical road, a rail line occupies a literal sequence of hexes
  (not an abstract point-to-point relationship) — so it's interruptible
  per-hex the same way road/blockade interruption works (2.2, Part 3.4):
  an enemy unit or Blockade sitting on *any* hex along the line, within its
  own vision, cuts it for the traveling faction.

### 2.2 Production pooling

Since build progress already accumulates as `progress += output per turn`
against a fixed `cost` (Location `activeBuild`, `EconomyPanel`), pooling is
just adding a second input to that same accumulator — no new build-progress
concept needed.

- **Direct pairs only, not transitive through a hub.** If A↔B and B↔C are
  both railed, A's surplus does not reach C through B. Keeps a large rail
  network from making every build in the empire instant, and keeps the
  mechanic spatially legible (you specifically built track between the two
  cities you want sharing).
- **Opt-in per idle settlement**, not automatic: a settlement that isn't
  currently building or banking can route its otherwise-idle output to one
  chosen rail-linked recipient — a settlement's own active build always
  claims its own output first.
- **Mid-turn interruption**: if the line is cut (per 2.1's blockade rule)
  when the turn's production tick resolves, that turn simply doesn't pool —
  no partial credit, consistent with how the rest of the economy doesn't do
  partial-progress refunds either.

### 2.3 Ownership and diplomatic access

- **Default: owned-only.** Earlier in this design pass an ally-extension was
  proposed as automatic (via pact/vassalage/open-borders); explicitly walked
  back — rail was never intended to auto-share between allies.
- **Proposed instead**: a distinct, negotiable diplomatic agreement —
  separate from the existing Open Borders toggle — that a faction could
  extend to an ally to grant rail access (both the instant-transport and
  production-pooling halves together, not split into two separate treaty
  terms). Not yet named or specified as an actual `DiplomacyDrawer` verb;
  flagged as future work, consistent with the existing pattern of many
  small discrete diplomatic toggles rather than one monolithic "alliance."

### 2.4 Construction prerequisites

- Requires the prospective path to be non-enemy-controlled at build time.
- No requirement to hold every underlying hex permanently afterward (ZoC
  drifts constantly at runtime; that would make rail absurdly fragile) — the
  only ongoing vulnerability is the per-hex blockade-interruption check.

## Part 3 — The Blockade structure

A deliberate, buildable alternative to "just stand on a hex" — persistent,
upgradeable, and destroyable, modeled close to how a Location's defense
already works rather than as a new parallel system.

### 3.1 Construction

- New action: **Build Blockade**, initiated by a unit standing on a **road**
  hex — blockades can only be built on roads.
- Requires an uninterrupted road connection to the **nearest owned**
  settlement, both to start construction and throughout it — this
  connection is the actual funding source (3.4), not a separate check.
- Minimum 2 turns, but **not a fixed timer** — construction progress
  trickles in from the connected settlement's surplus output each turn,
  the same `progress`/`cost` accumulator pattern a Location build already
  uses. A thin or interrupted supply line extends the timeline past the
  2-turn floor rather than construction just stalling silently.
- The initiating unit must remain on the hex for the entire build — this is
  the real cost/commitment of choosing to build one, not a background task
  you can queue and walk away from.
- If attacked mid-construction, the unit resolves the fight as an ordinary
  unit — no blockade-related bonus (there's no blockade yet to grant one).
  If the unit is destroyed, construction fails outright — no partial
  refund, matching the no-partial-credit rule used elsewhere in this doc.

### 3.2 Once complete

- An independent, persistent map object, not tied to any specific unit —
  the builder is free to leave immediately once it's finished.
- Has its own static defense score (a Location-style baseline, not
  inherited from whichever unit built it). Any friendly unit standing on a
  completed blockade stacks its own Strength on top of that baseline —
  reusing the same defender-stacking pattern `contest.js`'s
  `defenderValue()` already applies to Locations. Applies to *any* friendly
  unit, not specifically the original builder.
- Has its own vision range, used for the vision-gating rule in Part 1.
- Upgradeable via chips — proposed slots: +defense, +vision range, and a
  **Toll Booth** chip granting a small independent passive scrap income
  (thematically: a fortified chokepoint taxing traffic through it) — this
  is what eventually reduces a mature blockade's dependence on its
  connected settlement, though it isn't how a blockade bootstraps itself
  (see 3.4).

### 3.3 Combat and destruction

- Contestable using the same defender-stacking machinery as a Location.
- **Destroy-only on a lost contest — no capture/flip.** Unlike a Location,
  a blockade has no VP or economic identity of its own worth inheriting;
  simpler to have it just be removed than to track a captured structure's
  ownership/chip-retention rules.

### 3.4 Funding — construction and ongoing operation, one mechanism

- A blockade produces no scrap of its own by default.
- It draws from the excess/idle output of its **nearest owned** settlement,
  via the same uninterrupted-road connection required to build it in the
  first place — funding a blockade's existence is not a separate system
  from funding its construction, just the same draw continuing afterward
  (e.g. to pay for chip upgrades).
- "Uninterrupted" means the same thing everywhere in this doc: any hex
  along that road path being blockaded — by an ordinary enemy unit within
  its own vision, or an enemy Blockade within its own vision — cuts the
  connection for that turn.
- This is conceptually the same "route idle/surplus output to a connected
  recipient" mechanism as rail's production pooling (2.2), just with a
  Blockade instead of a settlement as the recipient, and road instead of
  rail as the connecting infrastructure — worth building as one shared
  underlying mechanism with two call sites, not two parallel systems (see
  Engineering Footprint).

## Open questions (explicitly unresolved, not defaults to silently assume)

- **Trespass penalty consistency**: should `onTrespass`'s unconditional
  Standing/Menace hit also become vision-gated, to match the Part 1 rework?
  Raised early in this conversation, never explicitly revisited or decided.
- **Exact numbers**: blockade scrap-equivalent cost, base defense score,
  base vision range, rail per-hop movement cost (proposed: 1, matching
  road, not yet confirmed), Toll Booth income rate. All placeholders.
- **Which chips get `railIncompatible`**: the flag concept is settled, the
  actual list of disqualifying chips (land ship confirmed as one example)
  is not.
- **The rail-access diplomatic agreement** (2.3): not yet named, specified,
  or scoped as an actual `DiplomacyDrawer` verb — flagged as future work
  once the core rail mechanic exists.

## Engineering footprint (rough scoping only, not a task breakdown)

- `movement.js`: vision-gate `movementBlockers` using each blocker's own
  detection (`canSee`) instead of ground-truth occupancy.
- A new Blockade entity — likely closer to a lightweight Location (static
  base value, defender-stacking, chip slots) than to a Unit, but
  destroy-only with no controller-flip/capture logic.
- `board.js`/movement graph: rail links as extra adjacency edges, likely a
  `hex.rail`-shaped field paralleling how `hex.road` already works.
- One shared "route idle/surplus output to a connected recipient, cut by
  interruption" mechanism, reused by both rail production-pooling (2.2) and
  Blockade funding (3.4) rather than built twice.
- New chip flags/categories: blockade-upgrade chips (defense/vision/Toll
  Booth), and the `railIncompatible` unit-chip flag.
- Diplomacy: a new agreement type for rail access (future work, not yet
  detailed).
