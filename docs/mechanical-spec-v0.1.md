# Mechanical Specification v0.1

A theme-free description of the game's rules and engine. This document
defines **what the engine does**. It contains no setting, no card names,
no flavor — only mechanical roles. Card stats, effects, and story are
**content** poured into the schemas defined here, and may change without
touching the engine.

> Status: working draft. Supersedes the rules summary in `README.md` for
> all matters of engine architecture. This revision **locks the v0.1
> configuration constants** (§14), **removes** the `Permanent` /
> `One-Shot` roles and the Tableau / Anchor zones, and adds the
> **tech-tier Market progression**. Content is authored in the
> `content/` sheets and poured into the §13 schemas.

---

## 1. Purpose

The engine is a **rules interpreter over a content schema**. It knows
mechanical primitives — zones, resources, a turn loop, an event bus, a
fixed vocabulary of effects — and nothing about any particular card.

A "card" is a data record that composes those primitives. "Story" is a
cosmetic layer (`name`, `flavor`, `art`) keyed by id, separable from
mechanics entirely. Two records with identical mechanical fields and
different flavor are the same to the engine.

This separation lets us build and test the engine now, against
mechanical stub records, and pour real stats + effects + narrative in
later without an engine rewrite.

## 2. Architecture: three layers

| Layer | Holds | Theme? |
|---|---|---|
| **Engine** | zones, turn loop, contest resolver, event bus, effect handlers (one per effect `type`), targeting resolver | none |
| **Content** | record data — factions, units, locations, chips, cards — authored in the `content/` sheets | mechanical fields only |
| **Presentation** | React UI + the cosmetic strings (`name`, `flavor`, `art`) keyed by id | all theme lives here |

Hard rule: the engine never branches on a record id. If logic depends on
*which specific record* it is, that logic belongs in content (as composed
effects) — not in the engine.

## 3. Resources, Stats and Tech

Mechanically distinct categories. The engine treats them differently; do
not conflate them.

| Category | Members (v0.1) | Behavior |
|---|---|---|
| **Pools** | `Resource`, `VP`, `Tech` | Named numeric counters. `Resource` (flavor name "scrap") is the single **spendable** currency. `VP` and `Tech` are **tracks** — accumulated and compared to thresholds, never spent. Adjusted by `ADJUST_RESOURCE`; `Resource` moves between players via `TRANSFER`. |
| **Stats** | `Strength` | The game's single static combat score, carried by **units** and **Location garrisons**. **Never spent** — only compared in a contest (§9). Recomputed each turn from a base plus active modifiers. Changed by `MODIFY_STAT`. |
| **Unit attributes** | `Movement` | A unit's Move range, in hexes, for one Move action (§8). Static; adjusted by `MODIFY_STAT` and chips. |
| **Budget** | `Actions` | Per-turn allowance. Reset every turn to the base (**2**); spent on actions; changed by `GRANT_ACTIONS`. |

- **`VP`** is the win track — a player **wins immediately** when their
  `VP` reaches **12** (§14).
- **`Tech`** gates the Market tiers (§4.1). Every player starts at `Tech`
  **1**; it rises by **+1 per Labs chip** they control and through some
  Events.
- There is **no player-level combat stat** — a *player* is never itself a
  contest entity. Units and Locations are.

## 4. Zones

A zone is a named container of records. Every card/chip is in exactly one
zone.

| Zone | Scope | Capacity | Notes |
|---|---|---|---|
| **Hand** | per-player | limited | Holds `Reactive` cards (granted by encounters, §6.5). Over-capacity forces an immediate discard. |
| **Unit Bay** | per-unit | 2 | Holds `Upgrade` chips installed on that unit. |
| **Location Slots** | per-Location | derived (§6.3) | Holds `Upgrade` chips installed on that Location — including the **Capital**. |
| **Market Row** | shared | three tiered rows (§4.1) | Acquirable `Upgrade` chips. |
| **Board** | shared | unbounded | The spatial hex map (§6.1): nodes carrying Locations, Obstacles, unit tokens. |
| **Decks** | shared | — | `encounterDeck`, `reactiveDeck`, and `marketDeck` ×3 tiers. Draw piles. |
| **Discards** | shared | — | One discard pile per deck. |

Zones are addressed as `zone[/sub-selector]`, e.g. `encounterDeck/top`,
`hand/chosen`. The selector grammar is defined with `MOVE_CARD` (§12.4).

A **unit** is a board entity, not a card in a zone: its token sits on a
Board node and its stat card sits in the owning player's area (§6.2). Its
Unit Bay is the only zone it owns.

Records may carry `qty`; at setup each is expanded into `qty` copies, each
with a unique instance id (`uid`). The engine operates on `uid`s.

### 4.1 The Market and tech tiers

The Market is **three rows, one per tech tier** — tier 1 shows **5** chips
face-up, tier 2 shows **4**, tier 3 shows **3**. Each row refills from its
tier's `marketDeck`.

Each player has a `Tech` score (§3). Tier 1 is always available; **tier 2
unlocks at `Tech` ≥ 3**, **tier 3 at `Tech` ≥ 6**. A player may Acquire
(§8) only from rows **at or below their unlocked tier**. `Tech` is raised
by the **Labs** chip (+1 each, no cap) and by some Events.

## 5. Roles

Five roles, defined by **mechanical behavior**, not theme. A record's
`role` tells the engine how it enters play, where it lives, and when its
effects fire.

| Role | Enters via | Lives in | Effects fire |
|---|---|---|---|
| **Upgrade** (chip) | acquired from the Market (§8), or granted by an `outcome` / Event | a Unit Bay or a Location's Slots | continuous `passives`; `triggers` |
| **Reactive** | granted to Hand by an encounter (§6.5) | Hand → discard | `onResolve`, in a reaction window (§10) or on the holder's turn |
| **Obstacle** | revealed / spawned | Board | contested by units; `outcomes` granted to the claimant |
| **Event** | revealed from the `encounterDeck` | resolves, then discarded (or persists) | `onResolve` globally; may `SPAWN` a Location, grant a Reactive card, adjust `Tech`, etc. |
| **Location** | placed at setup, or spawned by an Event | Board | contestable; `passives` granted to its controller while held at full control |

Notes:
- An **Upgrade** is a "chip" — a small-format record that occupies a slot.
  It declares a `kind` (`unit` / `location`) and a `techLevel` (1–3). Its
  `passives` apply continuously while installed. The **Capital** (§6.3.4)
  is a special predefined chip.
- A **Reactive** card has a trigger and is offered to its holder when a
  matching event occurs (§10); some are played on the holder's own turn.
- "Sequenced" content (completing one reveals the next) is **not** a role
  — it is the `SPAWN` / `MOVE_CARD` effect used in an `outcome`.
- A **unit** is not a role: it is an innate board entity (§6.2), created
  at setup or by recruiting (§8).
- The former `Permanent` and `One-Shot` roles, and the Tableau / Anchor
  zones, are **removed** in this revision.

## 6. The Board, Units, and Locations

### 6.1 The Board

The **Board** is a shared spatial map: a graph of **hex nodes** joined by
**adjacency edges**. Map size is a configuration constant; the board is
**generated per game** (§6.7). Geometry is a presentation concern; the
engine sees only nodes and edges.

Each node is one of:
- a **Location** node — carries a contestable, ownable Location (§6.3);
- an **encounter** node — ending a Move there triggers an encounter draw
  (§6.5);
- plain **terrain** — passable, no effect.

Obstacles (§6.4) also occupy nodes. `SPAWN` effects from Events may place
new Locations / Obstacles onto eligible nodes mid-game.

### 6.2 Units

A unit is a board entity: a **token** on a node and a **stat card** in the
player's area. Unit stats are **universal** — base `Strength` **4**,
`Movement` **1**, and a **2-slot chip bay** (the Unit Bay, §4). Only the
flavor name differs between factions.

- Each player begins with **one** unit, on their starting Location (§6.6).
- **Recruiting** more (§8): at a Location you fully control that holds a
  **Training Grounds** chip, pay **10 `Resource`** to place a new unit
  there. A player's **unit cap is 1 + the number of Training Grounds they
  control**.
- A unit is **never destroyed** in v0.1. The worst that befalls it is a
  forced retreat, a one-turn immobilization, or the loss of a chip (§9).
- A unit moves with **Move** (§8) and is the actor in every contest (§9).
  It may only contest a target on its own node.

### 6.3 Locations

A **Location** is **persistent and ownable**. Each has:

- a garrison **`Strength`**, **derived from its strategic value** — Low 4,
  Medium 6, High 8, Very High 10;
- a **chip-slot count**, **derived from strategic value** — Low 0,
  Medium 1, High 2, Very High 3 — **less one** if the Location carries an
  ability;
- a **scrap production** value, rolled each game from a per-Location
  min–max range;
- a possible **ability** — every **High** and **Very High** Location is
  assigned **one random ability** at game setup, from the ability pool;
  Low / Medium Locations never have one;
- a **control meter** — 3 sections plus a central foothold score
  (§6.3.1–6.3.2);
- `Upgrade` **slots** (the count above) holding chips, including the
  Capital (§6.3.3–6.3.4);
- a **faction affiliation** (or unaffiliated), used by map generation
  (§6.7).

A Location's `passives` (including any assigned ability) apply to its
controller **only while they hold full control**. It is *uncontrolled*
(all sections neutral) until captured.

#### 6.3.1 The control meter

The meter is a ring of **3 sections**; each is owned by **neutral** or by
a **player**. A player has **full control** when they own all 3 sections
— only then do the Location's `passives`, `VP` and scrap apply to them.

A **contest victory** (§9) flips exactly one section to the victor:
- if any **neutral (garrison)** sections remain → flip a neutral section;
- once **no neutral sections remain** → flip a **rival-held** section,
  taken from the rival holding the most sections (ties → victor's choice).

This single rule produces the "garrison first" behavior: while any neutral
section stands, every contest is forced onto the garrison, so two units at
the same neutral Location must reduce the garrison before taking ground
from each other.

#### 6.3.2 Foothold and decay

The meter's centre holds a signed **foothold score `F`** — the
controller's grip on the Location.

- `F` activates when a player reaches full control; it starts at `0`.
- At that controller's Upkeep (§7): if their unit's token is on the
  Location's node, `F += 1` (capped at **+3**, or higher if a Town Hall
  chip raised this Location's cap); if it is not, `F -= 1`.
- When `F` would drop **below 0** (reaches `-1`): one of the controller's
  sections flips to **neutral** and `F` resets to `0`. The first such flip
  drops the player below full control; decay then continues each absent
  Upkeep, flipping a further section per `-1`, until the Location is fully
  neutral.
- Bringing the unit back halts the `-1` ticking; the player rebuilds by
  contesting (§9). `F` resets to `0` whenever full control changes hands.
- **Exception:** a Location carrying a **Capital** chip never decays — its
  `F` is inert.

Pure contested partial progress does **not** decay: if sections are split
between players and no one has held full control, the meter is static
until the next contest.

#### 6.3.3 Chips on a Location

A player who holds a Location may install `Upgrade` chips into its empty
slots — acquired via the Acquire action, or granted by an `outcome` /
Event.

When **full control transfers** to a new player, the Location moves to
them carrying its chips, **except the most recently installed chip, which
is destroyed** (removed from the game, not returned). The new controller
inherits the remainder.

#### 6.3.4 The Capital

A **Capital** is a special `Upgrade` chip, one per player:
- it occupies a slot on a Location;
- the Location it sits on **cannot decay** (§6.3.2) and gains a bonus to
  garrison `Strength` and scrap production (values §14);
- each player begins with their Capital on their starting Location (§6.6);
- if that Location's full control is taken by an opponent, the Capital
  chip is **removed from the board** — not inherited — and the hex
  thereafter behaves as any other Location. Re-establishing a lost Capital
  is an open item (§14).

### 6.4 Obstacles

An **Obstacle** occupies a node and is claimed **once**. A unit on its
node contests it (§9); on a successful contest the claimant takes one of
its `outcomes` and the Obstacle leaves the Board.

### 6.5 Encounter nodes

When a unit **ends a Move** on an encounter node — passing through with
surplus `Movement` does not count — its player draws the top of the
`encounterDeck` and resolves it by role: an **Event** resolves globally
(and may grant a **Reactive** card to Hand, spawn a Location, adjust
`Tech`, …); an **Obstacle** / **Location** is placed on the Board. The
node is then **spent** and becomes plain terrain.

### 6.6 Starting position

Factions are **cosmetic** in v0.1 — a name, a colour, and two affiliated
Locations. Each player starts in **full control** of the **lower-strategic-
value** of their faction's two affiliated Locations, with their **Capital**
chip installed and their first unit's token on it.

### 6.7 Map generation

The Board is generated per game from a chosen map size, so no two games
share a layout. For v0.1 testing the map is a **3-4-5-6-5-4-3** hex field
(**30 hexes**), split **10 location / 13 encounter / 7 terrain**.

Generation is **constrained**, not fully random:
- each faction's **two affiliated Locations** are placed within **2 hexes**
  of each other;
- the four factions' starting areas are spread around the map;
- unaffiliated Locations and the encounter / terrain hexes fill the rest.

## 7. Turn Structure

Play proceeds in rounds; each round every player takes one turn in seat
order. A turn has four phases:

1. **Upkeep** — emit `turn_started`; reset `Actions` to base (2);
   recompute `Strength` / `Movement` from base + surviving modifiers;
   expire lapsed modifiers; **resolve foothold (§6.3.2)** for each
   Location this player controls; run upkeep `passives` / `triggers`.
2. **Preparation** — the player may spend `Resource` to buy temporary
   modifiers on one of their **units** (`MODIFY_STAT`, duration
   `until_your_next_turn`). Optional.
3. **Main** — the player spends `Actions` on actions (§8) in any order.
4. **Cleanup** — run cleanup `triggers`; enforce Hand capacity; emit
   `turn_ended`. After the last seat, emit `round_ended` and run
   round-end effects (e.g. Market row refresh).

Reaction windows (§10) can interrupt at defined points regardless of whose
turn it is.

## 8. Actions

During the Main phase, each action costs `Actions` from the budget
(default 1 unless stated otherwise). The action set:

| Action | Effect |
|---|---|
| **Move** | Move one of your units up to its `Movement` in hexes along adjacency edges (default 1; chips/effects may raise it). Ending on an encounter node triggers §6.5. |
| **Acquire** | Pay an `Upgrade` chip's `Resource` cost; take it from a Market row **at or below your unlocked tech tier** (§4.1) and install it on one of your units' Bays or a Location you fully control. Refill the row. |
| **Contest** | With one of your units, contest the Location or Obstacle on its node, or raid an enemy unit sharing the node (§9). |
| **Recruit** | At a Location you fully control that holds a **Training Grounds**, pay **10 `Resource`** to place a new unit there — only if you are below your unit cap (§6.2). |
| **Activate** | Invoke an `activated` ability of a Location you control, or of a chip. |

Actions are content-tunable: a chip may grant extra `Actions`, reduce an
action's cost, or impose a `SURCHARGE`.

## 9. Contests (the unified primitive)

A **contest** pits one unit's `Strength` against a **defender value**,
each side adding a die roll. It is the single mechanic behind capturing
Locations, claiming Obstacles, and raiding units.

A contest has:
- an **initiator** — one of the active player's units, with an effective
  `Strength`;
- a **target** on the initiator's node — a Location, an Obstacle, or an
  enemy unit;
- a **defender value**:
  - **Location, neutral sections remaining** → garrison `Strength` + the
    Location's defensive chips;
  - **Location, held — defending unit on the node** → garrison `Strength`
    + the defending unit's `Strength` + chips;
  - **Location, held — no defending unit** → garrison `Strength` + chips;
  - **Obstacle** → its fixed `Strength` requirement;
  - **enemy unit (raid)** → that unit's effective `Strength` + its chips.

Resolution:
1. The initiator declares the target. Emit `contest_declared` — opens a
   reaction window (§10).
2. **Roll.** Each side adds **1d6** to its value — the initiator totals
   `Strength + 1d6`, the defender totals `defender value + 1d6`. Compare
   totals; **the defender wins ties**. (`noReaction` suppresses the
   reaction window only — the dice are always rolled.)
3. **Success:**
   - **Location** → flip one section by the §6.3.1 rule; emit
     `section_flipped`. If this completes full control, set `controller`,
     move the Location to the new controller and destroy its newest chip
     (§6.3.3), emit `location_captured`.
   - **Obstacle** → the claimant resolves one declared `outcome`; remove
     the Obstacle; emit `obstacle_claimed`.
   - **Raid** → the defending unit **retreats** to an adjacent
     non-hostile node chosen by the winner (not controlled by a hostile
     player, not a neutral garrisoned node; if none exists, retreat is
     skipped). The winner then takes **one**: immobilize the retreating
     unit through its next turn, **or** destroy one of its chips.
4. **Failure** → emit `contest_lost`; the Action is spent, nothing else.

Restrictions:
- A unit may only contest a target on **its own node**.
- While a Location holds **neutral** sections, units there may only
  contest the garrison — they cannot raid one another until it is gone.
- `noReaction`: a contest or card may suppress the §10 reaction window so
  the defender cannot respond with modifiers.

An **Obstacle** carries an `outcomes[]` list (each `{label, effects[]}`);
the initiator picks one at declaration. Location section-flips and raid
results are **standardized** and need no `outcomes` authoring.

## 10. Events, Triggers, and the Reaction System

The core of reaction cards and "steal another player's reward" — designed
in from the start.

### 10.1 The event bus

The engine emits named **events** at well-defined points; each carries a
**payload**. Effects subscribe via a record's `triggers[]`.

Event taxonomy (v0.1):

```
turn_started        turn_ended         round_ended
resource_gained     resource_spent     tech_changed
stat_modified
card_acquired       card_played        card_revealed
card_entered_zone   card_left_zone
action_spent
unit_moved          unit_recruited     unit_retreated
contest_declared    contest_won        contest_lost
obstacle_claimed    encounter_resolved
location_spawned    section_flipped    location_captured
location_decayed
reward_granted
```

### 10.2 Two subscription modes

A trigger subscription declares a `mode`:

- **`on` (triggered)** — fires *after* the event resolves. Appends new
  effects; cannot un-happen the event.
- **`replace` (replacement)** — fires *before* the event resolves, inside
  a reaction window. Receives the **mutable payload** and may rewrite its
  fields or cancel it.

A triggered effect *adds*; a replacement effect *changes what is about to
happen*. A pending action carries a payload object that replacement
subscribers can transform.

### 10.3 Pending action and the reaction window

Before any stateful change resolves, the engine builds a **pending
action**:

```
{ type, source, recipient, target, amount, cancelled: false }
```

The window then runs:
1. Collect eligible `replace` subscribers (from `Reactive` cards in hand
   and `Upgrade` / `Location` records in play). Resolve in **priority
   order** (default: affected/defending player first, then seat order from
   the active player). Each may rewrite payload fields or set `cancelled`.
2. If `cancelled`, stop. Otherwise apply the payload.
3. Emit the event; fire `on` subscribers in priority order.

`Reactive` cards are **granted by encounters** (§6.5) and held in Hand
until a matching event offers them. A later iteration will let players set
**auto-play rules** (e.g. "use Vulture automatically when an opponent
gains more than 3 scrap from an encounter") — the engine watches the bus
and prompts otherwise.

### 10.4 Worked examples

- **Defensive reaction** — `Reactive`:
  `trigger: contest_declared, mode: on, condition: defender owned by self`,
  `effects: [MODIFY_STAT Strength +2 defending_unit this_contest]`.
- **Steal a reward** — `Reactive`:
  `trigger: reward_granted, mode: replace, condition: recipient is opponent`,
  `effects: [REDIRECT field=recipient op=set value=self]`.
- **Negate an Event** — `Reactive`:
  `trigger: card_revealed, mode: replace, condition: revealed.role == Event`,
  `effects: [CANCEL]`.

## 11. Targeting

Every effect declares a `target`. The targeting resolver maps a token to
one or more entities:

| Token | Resolves to |
|---|---|
| `self` | the effect's owner |
| `controller` | the controller of the record carrying the effect |
| `triggering_player` | the player who caused the current event |
| `active_player` | whoever's turn it is |
| `chosen_opponent` | one opponent the owner picks |
| `random_opponent` | one opponent at random |
| `each_opponent` | all opponents |
| `all_players` | everyone |
| `chosen_card` | a card/chip the owner picks, filtered by a zone selector |
| `chosen_unit` | a unit the owner picks |
| `defending_unit` | the defending unit in the current contest |
| `entity` | the Location / Obstacle / unit in the current contest |

Effects that hit multiple players apply independently to each.

## 12. The Effect Library

An **effect** is `{ type, ...params }`. The engine has exactly one handler
per `type`. A record composes effects in ordered lists (`passives`,
`onResolve`, `triggers[].effects`, `activated[].effects`,
`outcomes[].effects`, `FORCE_CHOICE` options).

The library is deliberately small — the same effect serves many records;
only the parameters vary.

### 12.1 ADJUST_RESOURCE
Change a pool counter by a signed amount.
- **params:** `resource` (`Resource` | `VP` | `Tech`), `amount` (signed int or formula), `target`
- **examples:** a Location passive grants `+2 Resource` to its controller each Upkeep; a Labs chip grants `+1 Tech` to its controller; an Obstacle outcome grants `+4 VP` to the claimant.

### 12.2 MODIFY_STAT
Apply a modifier to a unit's static score for a duration.
- **params:** `stat` (`Strength` | `Movement`), `amount` (signed), `target` (a unit), `duration` (`permanent` | `until_your_next_turn` | `this_turn` | `this_contest`)
- **examples:** the Preparation boost (`+1 Strength`, `until_your_next_turn`); a chip grants `permanent +2 Strength`; a Reactive card grants `+2 Strength` `this_contest`.

### 12.3 GRANT_ACTIONS
Add to (or subtract from) a player's Action budget.
- **params:** `amount` (signed), `target`, `when` (`this_turn` | `next_turn`)
- **examples:** a Logistics Hub chip grants `+1 Action` each turn; an Obstacle outcome grants `+2 Actions` now.

### 12.4 MOVE_CARD
Relocate a card/chip between zones — the core logic behind draw, discard,
destroy, and recycle; they differ only in the `from`/`to` pair.
- **params:** `from` (zone), `to` (zone), `selector` (`top` | `chosen` | `random` | `by_id` | `all_matching`), `count`, `filter?`
- **examples:** grant a Reactive = `from: reactiveDeck top, to: hand`; discard = `from: hand chosen, to: handDiscard`; destroy a chip = `from: unitBay chosen, to: removed`.

### 12.5 SET_FLAG
Toggle a boolean state flag on a record for a duration.
- **params:** `flag` (`disabled` | `exhausted` | `shielded` | `marked` | `immobilized`), `value` (bool), `target`, `duration`
- **examples:** `disabled` on a chip suppresses its passives; `exhausted` on a Location blocks it from being contested again this round; `immobilized` on a unit blocks its Move action.

### 12.6 TRANSFER
Move a resource or a card directly from one player to another — conserves
quantity, has two endpoints.
- **params:** `what` (`resource` | `card`), `resource`/`selector`, `amount`/`count`, `from`, `to`
- **examples:** a raid outcome steals half the defender's `Resource`; a Location passive siphons `1 VP` per round from the lowest-scoring opponent.

### 12.7 CONVERT
Exchange one resource for another at a fixed rate, up to a cap.
- **params:** `from`, `to`, `rate`, `max`
- **examples:** an `activated` ability turns `3 Resource` into `1 VP`, once per turn.

### 12.8 SPAWN
Create a record/entity and place it into a zone or onto the Board — puts
Locations on the Board and recruits units.
- **params:** `source` (deck name or explicit id), `zone`, `initialState` (e.g. `controller: null`, owning player, node)
- **examples:** an Event spawns a `Location` onto the Board uncontrolled; the Recruit action spawns a unit at a Training Grounds.

### 12.9 PEEK
Reveal hidden information, optionally allowing a reorder. The only effect
that grants information without changing state.
- **params:** `deck`/`zone`, `count`, `reorder` (bool), `target`
- **examples:** look at the top 3 of the `encounterDeck`; scry the top 2 of a `marketDeck`.

### 12.10 FORCE_CHOICE
Present labeled options; resolve the chosen option's nested effects. Basis
for "do X or Y" content and the raid winner's choice (§9).
- **params:** `chooser`, `target`, `options[]` (each `{label, effects[]}`)
- **examples:** the raid winner picks "immobilize the loser" OR "destroy one of its chips".

### 12.11 SURCHARGE
Impose an extra cost on, or block, a target's future action within a
window.
- **params:** `action`, `extraCost` **or** `block: true`, `window`, `target`
- **examples:** "Contests against you cost the initiator `+2 Resource`"; "no unit may contest this Location for one round" (`block`).

### 12.12 REDIRECT  *(replacement mode)*
Inside a reaction window, rewrite a field of the pending payload.
- **params:** `field` (`recipient` | `target` | `amount`), `operation` (`set` | `scale` | `clamp`), `value`
- **examples:** steal a reward — on `reward_granted`, `field: recipient, op: set, value: self`.

### 12.13 CANCEL  *(replacement mode)*
Inside a reaction window, void the pending action entirely.
- **params:** optional `condition`
- **examples:** negate a revealed Event; cancel a contest declared against you.

### Effect classes summary
- **State-change:** ADJUST_RESOURCE, MODIFY_STAT, GRANT_ACTIONS, MOVE_CARD, SET_FLAG, TRANSFER, CONVERT, SPAWN
- **Information / interactive:** PEEK, FORCE_CHOICE, SURCHARGE
- **Replacement (reaction window only):** REDIRECT, CANCEL

## 13. Data Schemas

### 13.1 Card / chip schema

Every card and chip is a record of this shape. Cosmetic fields (`name`,
`flavor`, `art`) may be split into a separate id-keyed content file.

```js
{
  id:        string,          // stable mechanical id
  role:      "Upgrade" | "Reactive" | "Obstacle" | "Event" | "Location",

  // --- Upgrade (chip) only ---
  kind:      "unit" | "location",   // which slot type it installs into
  techLevel: 1 | 2 | 3,             // Market tier

  // --- cosmetic (separable) ---
  name:      string,
  flavor:    string,
  art:       string | null,

  // --- costs & requirements ---
  cost: {
    resource?: number,        // spent to acquire
    action?:   number,        // Actions spent (default 1)
  },

  // --- Location authored fields ---
  strategicValue: "low" | "medium" | "high" | "veryHigh",
  affiliation:    string | null,    // faction id, or null
  productionMin:  number,           // scrap/turn range, rolled at setup
  productionMax:  number,
  // garrison Strength and chip-slot count are DERIVED from
  // strategicValue (§6.3) — never authored.

  // --- composed effects ---
  passives:  [ Effect ],
  triggers:  [ { trigger, mode, condition?, effects: [Effect] } ],
  activated: [ { cost, effects: [Effect] } ],
  onResolve: [ Effect ],                    // Event / Obstacle / Reactive
  outcomes:  [ { label, effects: [Effect] } ], // Obstacles

  flags:     { noReaction?: boolean, ... },
  qty:       number,
}
```

### 13.2 Faction, unit, and ability definitions

```js
// Faction — cosmetic in v0.1.
{ id, name, color, affiliatedLocations: [locId, locId] }

// Unit base profile — universal; only the name is faction-flavored.
{ baseStrength: 4, baseMovement: 1, baySlots: 2 }

// Location ability — assigned at random to each High / Very High
// Location at setup; occupies one of that Location's chip slots.
{ id, name, eligibleTier: "high" | "veryHigh" | "either",
  passives: [Effect], activated: [{ cost, effects }] }
```

### 13.3 Runtime entity state

Held by the engine during play, not authored:

- **Player:** `{ id, resource, vp, tech, actions, unitCap }`
- **Unit:** `{ owner, node, strength, movement, chips[≤2], immobilizedUntil }`
- **Location:** `{ controller | null, sections[3], foothold F,
  chips[≤slots], garrison, production, ability, node }`

## 14. Configuration & Open Questions

### 14.1 Locked constants (v0.1)

| Constant | Value |
|---|---|
| VP threshold (win) | 12 |
| Base `Actions` / turn | 2 |
| Foothold cap | +3 (Town Hall raises a Location's cap) |
| Unit base `Strength` / `Movement` | 4 / 1 |
| Unit chip-bay slots | 2 |
| Unit recruit cost | 10 `Resource` (needs a Training Grounds) |
| Unit cap | 1 + Training Grounds controlled |
| Contest dice | 1d6 per side; defender wins ties |
| `Tech` start / tier 2 / tier 3 | 1 / ≥3 / ≥6 |
| Market row sizes (tier 1/2/3) | 5 / 4 / 3 |
| Garrison by strategic value | Low 4 · Medium 6 · High 8 · Very High 10 |
| Base chip slots by value | Low 0 · Medium 1 · High 2 · Very High 3 (−1 if the Location has an ability) |
| Test map | 3-4-5-6-5-4-3 — 30 hexes (10 location / 13 encounter / 7 terrain) |

### 14.2 Still open

- **Encounter deck** — card design and deck composition (next design pass).
- **Reactive card set** — the full list and how copies are seeded into the
  `reactiveDeck`.
- **Chip costs and `techLevel` assignments** — set in the content batch.
- **Capital chip** — the garrison / production bonus values.
- **Location ability list** — authored in `content/location-abilities.csv`.
- **Capital re-establishment** — cost / trigger to rebuild a lost Capital.
- **Multi-player raid edge case** — two units on a *third* player's
  Location: may they raid each other, or only contest the controller?
- **Reaction-window priority** among competing `replace` subscribers —
  seat order is the v0.1 default; confirm.
