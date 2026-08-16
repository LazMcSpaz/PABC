# Rail, Blockade, and the Vision-Gating Rework — Design Doc

Captures three intertwined systems that came out of one thread: closing a real
gap in how blockade works today, a new Rail network as road's genuinely-
differentiated counterpart, and a new buildable Blockade structure that both
depends on and motivates the vision rework. Numbers throughout are placeholders
pending a balance pass — the mechanics are the settled part, the constants
aren't.

## Build status

| Part | | Where |
|---|---|---|
| 1 — Blockade vision-gating | **deferred, decision pending** | `movementBlockers` is still ground truth (but see *Ambush halts* below) |
| 2.1 Rail transport | built | `board.js assignRails`, `movement.js unitRailEdges` |
| 2.2 Rail production pooling | built | `economy.js railPoolRecipient` |
| Rail as a trade route | built | `diplomacy.js tradeRouteOpen` |
| 2.3 Rail access | built (endpoints-only) | `movement.js unitRailEdges` |
| 2.4 Rail generation | built (capital spanning tree) | `board.js assignRails` |
| — No terminus at sign-named towns | built | `content.js noRailTerminus`, `setup.js railHubs` |
| 3.1 Blockade construction | built | `blockades.js`, `actions.js build-blockade` |
| 3.2 Once complete | built, chips included | `blockades.js`, `contest.js`, `visibility.js` |
| 3.3 Combat and destruction | built | `contest.js` |
| 3.4 Blockade funding | built | `economy.js`, `blockades.js` |

Both halves of the "route output to a connected recipient" idea now share one
allocator in `processLocationEconomy`: blockade funding (§3.4) takes what it is
allowed first, and whatever survives goes down the rail (§2.2). A structure
answering something happening on the map outranks a gift to a neighbour.

### §2.2 as built — pooling

A settlement pools only while it has **nothing of its own under construction**;
its own build always claims its output first. Beyond that, four gates:

- **Opt-in.** `poolTarget` is set with the free `set-pool-target` action and is
  never inferred.
- **Direct pairs only.** A↔B and B↔C both railed does not let A feed C. Without
  this a large rail network would make every build in the empire instant, and
  the mechanic would stop reading as "these two cities share".
- **You must hold both stations** (§2.3), checked when the target is set and
  again every Upkeep — losing the recipient closes the line.
- **Per-hex interruption.** A line is track: anyone parked on it cuts it, and a
  cut line pools *nothing* that turn. No partial credit; the output banks
  exactly as it would with no arrangement at all, and `pool_interrupted` fires
  so the player can see why the shipment stopped.

Neither `set-pool-target` nor `set-build-priority` has a control in the
settlement window yet — both are engine-side only.

"Cut" has one definition across all four systems that ask the question —
rail's line-cut check, blockade construction supply, blockade funding, and
trading-pact routes — in `diplomacy.js routeCutter`, and that is the single
place Part 1 would change. It takes the *parties* to a line rather than one
faction: a trading pact has two, and neither of them cuts its own route.
`supplyCutter` is the one-party case. Both live in diplomacy.js (who may pass
whom is a diplomacy question, not a movement one) and are re-exported from
`movement.js`, where every mover already looks for them.

### Trading pacts route by rail

A trading pact needs a capital-to-capital route. It used to accept only an
overland corridor (`reinforcementRoute`), which meant a pact could collapse for
want of a footpath while a railway ran between the two cities — rail is
generated as a spanning tree over the CAPITALS, so it is literally the artery
between the two a pact joins. `tradeRouteOpen` now accepts either.

Rail is not a free pass: a line is a real sequence of hexes, so a hostile third
party standing anywhere along it severs that link, and a severed link can
isolate a capital even though the track is still there. That is what keeps a
railed pact worth attacking.

### Rail never terminates at a sign-named settlement

Design call, 2026-08-16. The five unaffiliated Locations added that day —
Restaria, Lastgas, Overlook, Nosservis, Detor — are named for misread road
signage, not stations, so **no rail link may end at them**. They carry
`noRailTerminus: true` in `content.js`; `setup.js` filters them out of
`railHubs` before the spanning tree is built, so they can never be an endpoint.

A line between two legitimate hubs whose hex path happens to cross one of them
is fine and deliberately left alone — track passes through a place, it just
does not stop there. Harness-checked.

### Ambush halts — a partial answer to Part 0's gap

Part 1 (a blocker must DETECT the mover before it may halt it) is still
deferred, but the *worst* symptom of the gap is fixed: being stopped by
something you had no way to see no longer costs you your whole turn.

`blockerScan` in `movement.js` now returns two sets from one pass — every hex
that halts you, and the subset whose blocker you cannot perceive. A halt on the
second kind is a **surprise**, and:

- the mover keeps the movement it had left, instead of arriving with zero;
- it is **checked** for the rest of the turn: it may fall back or sidestep, but
  never move further from where its turn began than it currently stands. Without
  that second half the refund would gut blocking outright — a mover could walk
  into an ambush, stop, and carry on for the price of one movement point, which
  would make advancing blind strictly better than scouting;
- an `advance_checked` event fires, because a unit that stops early with
  movement still in hand reads as a bug unless the feed says what stopped it.

A blocker you *could* see still costs the full stop — you chose to walk into it.
"Could see" is per blocker kind: a unit by `isUnitVisibleTo` (so concealment
counts), a Location by whether the hex is explored (you don't forget where a
city is), a blockade by live sight (it can go up behind your back).

This needed splitting two numbers that used to be one, in `board.js`:
`best[hex]` is what the search may path onward with (a halt is still 0, so
nothing routes through it), and `arrive[hex]` is what a unit standing there
actually holds. Conflating them is what made an ambush cost a whole turn.

### §3.4 as built — who gets a city's build output

Construction is paid out of the funding settlement's build output on the turn
it is spent, not from a constant. Three rules resolve the contention:

- **The blockade outranks the city's own chip by default.** A blockade answers
  something happening on the map now; a chip is an investment that keeps.
- **A site can only absorb `ceil(cost / minTurns)` per turn.** That is what
  enforces §3.1's two-turn floor now the rate is variable — a rich city cannot
  raise one in a single Upkeep — and it doubles as the reason the city is never
  starved: whatever the site cannot take flows straight on to its own build.
- **`buildPriority: "chips"` flips it, and flips it hard.** While a chip is
  under construction it takes everything and the blockade waits until it is
  done. A player who sets that toggle has decided the building matters more,
  and a half-measure would only make both slow. Set per Location with the
  `set-build-priority` action; free, like the guns/butter slider.

Upgrade chips (§3.2) draw on the same line once the structure stands, and are
NOT floor-capped — an upgrade is ordinary construction, and a rich settlement
may finish one in a turn exactly as it can at home.

### §3.2 as built — the upgrade chips

Three, in `content.js` as `kind: "blockade"` (so they never appear in a
Location's build menu), installed into two slots:

| Chip | Effect |
|---|---|
| Palisade | +3 blockade defense |
| Signal Mast | +1 Vision from the blockade |
| Toll Booth | +1 scrap each Upkeep, independent of the funding settlement |

Bonuses are read off the chip def (`blockadeDefense` / `blockadeVision` /
`output`), so `blockades.js` never branches on a chip id. Queuing one is free
and needs no unit present — the builder was released when the structure landed
— but it does need the supply road open, or the queue would sit at zero
progress with nothing saying why. Destroying a blockade removes its chips from
play; there is no salvage.

## Why this started

Road today (`src/game/board.js`) is free-for-anyone terrain infrastructure —
it costs 1 to enter and never halts, even through mountain or forest, and
there's no ownership check on it: any faction's units benefit, not just
whoever's territory it's in. A rail line with the same effect would just be
road reskinned.

**Rail is NOT player-built.** An earlier pass in this doc differentiated rail
by making it something a faction constructs and owns; that is overruled. Rail
is pre-existing infrastructure, laid at map generation alongside roads —
surviving track from before the collapse, not something anyone is building
now.

So the differentiation has to come from what rail *does*, and it still does:

| | Road | Rail |
|---|---|---|
| Shape | continuous terrain, most of the map | sparse links between specific settlement pairs |
| Movement | 1 MP per hex, never halts | **1 MP for the whole hop**, however far apart the endpoints |
| Economy | none | **production pooling** between the two settlements it joins |
| Access | anyone | gated on controlling the endpoints (§2.3) |

That is a genuinely different object: road is how you cross ground, rail is
how you skip it. Neither is a reskin of the other, and neither needs a build
action to justify itself.

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
- **One place broke that separation** — the diplomatic trespass penalty
  (`onTrespass`) fired a Standing hit + Menace increase purely off a mover's
  destination hex being inside an enemy ZoC, with no check on whether that
  faction could perceive the intrusion. *Resolved:* `unitTrespasses` now gates
  on `isUnitVisibleTo(owner, unit)`, so cover hides you from a host without
  Detection and Detection sees through it, exactly as everywhere else. This is
  NOT Part 1 — blocking is still ground truth; only the citation is gated.
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
- **Unit eligibility gate**: a unit carrying a rail-incompatible chip cannot
  use rail at all while that chip is installed. **Settled: any chip occupying
  2 chip slots is rail-incompatible** — if it is bulky enough to need two
  slots, it is too bulky to put on a train. Today that is exactly Bombard and
  Landship, both of which already carry `railIncompatible: true` in
  `src/game/content.js`; deriving the flag from `slots >= 2` rather than
  hand-setting it means any future 2-slot unit chip inherits the rule for
  free. (`logistics-hub` is also 2-slot but is a Location chip, so it never
  rides on a unit.)
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

### 2.3 Access and diplomatic sharing

Rail is not owned by construction any more, so access has to be defined some
other way. **Proposed (NEEDS CONFIRMING): you may use a rail link if you
control both endpoint settlements.** That keeps rail feeling like held
infrastructure rather than public terrain, gives capturing a city a second
kind of reward, and needs no new ownership state — it reads `loc.controller`,
which already exists.

- **Default: endpoints-only.** Earlier in this design pass an ally-extension
  was proposed as automatic (via pact/vassalage/open-borders); explicitly
  walked back — rail was never intended to auto-share between allies.
- **Proposed instead**: a distinct, negotiable diplomatic agreement —
  separate from the existing Open Borders toggle — that a faction could
  extend to an ally to grant rail access (both the instant-transport and
  production-pooling halves together, not split into two separate treaty
  terms). Not yet named or specified as an actual `DiplomacyDrawer` verb;
  flagged as future work, consistent with the existing pattern of many
  small discrete diplomatic toggles rather than one monolithic "alliance."

### 2.4 Generation (replaces the old "construction prerequisites")

Rail is laid once at setup, like roads (`assignRoads` in `src/game/board.js`),
and never changes during a game. There is no build action, no cost, no
prerequisite, and no way to add or remove track mid-game.

There is no requirement to hold the hexes a line passes through — ZoC drifts
constantly at runtime and that would make rail absurdly fragile. The only
ongoing vulnerability is the per-hex blockade-interruption check (2.1).

**Open: which settlement pairs get track.** Roads now connect every settlement
to its nearest one or two neighbours, so rail must be much sparser or it adds
nothing. Candidates, not yet decided:

- capital ↔ capital only (4 lines, one per faction pair — very legible, very
  strategic, and immediately meaningful because capitals are fixed);
- the *longest* settlement pairs, so rail is specifically the thing that
  crosses distance road handles badly;
- value-gated — only `veryHigh`/`high` Locations get a station.

Whichever it is, it wants a `CONFIG.rail` knob for the count, the same way
`CONFIG.roads.linksByValue` controls road density.

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

- ~~**Trespass penalty consistency**~~ — *resolved*: `onTrespass` is
  vision-gated (Part 0 above). Part 1 proper, gating the movement HALT itself,
  is still open.
- **Exact numbers**: blockade scrap-equivalent cost, base defense score,
  base vision range, rail per-hop movement cost (proposed: 1, matching
  road, not yet confirmed), Toll Booth income rate. All placeholders.
- **Which settlement pairs get rail** (2.4), and **whether controlling both
  endpoints is the right access rule** (2.3). Both opened up by rail becoming
  generated rather than built.
- **The rail-access diplomatic agreement** (2.3): not yet named, specified,
  or scoped as an actual `DiplomacyDrawer` verb — flagged as future work
  once the core rail mechanic exists.

## Engineering footprint (rough scoping only, not a task breakdown)

- `movement.js`: vision-gate `movementBlockers` using each blocker's own
  detection (`canSee`) instead of ground-truth occupancy.
- A new Blockade entity — likely closer to a lightweight Location (static
  base value, defender-stacking, chip slots) than to a Unit, but
  destroy-only with no controller-flip/capture logic.
- `board.js`: an `assignRails` generator paralleling `assignRoads`, plus rail
  links as extra adjacency edges in the movement graph. Rail needs BOTH a
  `hex.rail` boolean (so the board renderer can draw the line — it already
  reads this field) and a link registry naming each line's two endpoints and
  its hex path, since the 1-MP hop and production pooling are properties of
  the *link*, not of the individual hexes.
- One shared "route idle/surplus output to a connected recipient, cut by
  interruption" mechanism, reused by both rail production-pooling (2.2) and
  Blockade funding (3.4) rather than built twice.
- New chip flags/categories: blockade-upgrade chips (defense/vision/Toll
  Booth), and the `railIncompatible` unit-chip flag.
- Diplomacy: a new agreement type for rail access (future work, not yet
  detailed).
