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
> `content/` sheets and poured into the §13 schemas. **§15 (added
> post-v0.1) extends the engine with the trigger-driven encounter and
> quest system** — a parallel channel to the §10 event bus.

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

In addition to the pools above, players carry three signed **narrative
tracks** — `trust`, `reputation`, `alignment` — used by the encounter
and quest system. They behave like `VP` and `Tech` (accumulated, never
spent) but are scoped to that system; see §15.2.

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

> **Superseded by §20 (v0.2+).** The shared three-row Market is **retired**;
> chips are no longer acquired from a shared pool but **built locally** at
> Locations you control, gated by Tech Level × Loyalty. The Tech-Level
> thresholds below survive, reframed from "which Market row you may shop" to
> "which chip tier you may build." This text is kept for history.

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
- An **Upgrade** is a "chip" — a small-format record that occupies slots.
  It declares a `kind` (`unit` / `location`), a `techLevel` (1–3), and a
  `slots` count — **1** by default, or **2** for powerful, rare chips (a
  2-slot chip fills an entire unit bay). Its `passives` apply continuously
  while installed; installing requires that many free slots. The
  **Capital** (§6.3.4) is a special predefined chip.
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

> This is the **field-encounter** mechanic, formalised in §15.8. The
> deck reference here is the same as `state.fieldEncounterDeck`. Field
> encounters are one of three delivery modes for the encounter system
> (§15.5); the other two (private and public) are driven by the trigger
> evaluator (§15.4).

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

> A **second, parallel** trigger channel — the end-of-round trigger
> evaluator that drives ambient encounters and quests — is defined in
> §15.4. It is condition-poll-driven where this section is event-
> driven; both coexist and do not interfere.

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

The encounter and quest system (§15) adds further effect types —
`ADJUST_TRACK`, `ADJUST_STANDING`, `SET_PLAYER_FLAG`, `QUEUE_DEFERRED`,
`START_QUEST`, `ADVANCE_QUEST`, `COMPLETE_QUEST`, `PLACE_ENCOUNTER`,
`DELIVER_ENCOUNTER` — each a single additive handler; see §15.10.

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
  slots:     1 | 2,                 // slots occupied; default 1
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

The state shape is extended by §15.11 for the encounter and quest
system — additional player fields (`tracks`, `flags`, `activeQuests`,
`completedQuests`), a `state.world` object, the `state.factionStanding`
matrix, `state.triggerCooldowns`, `state.deferred`, and
`state.activeQuests`.

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

- **Encounter / quest content** — the encounter-system *architecture* is
  defined in §15; specific encounter, trigger and quest records are
  authored in `content/encounters/`, `content/triggers/`, `content/quests/`.
- **Reactive card set** — the full list and how copies are seeded into the
  `reactiveDeck`.
- **Chip costs and `techLevel` assignments** — set in the content batch.
- **Location ability list** — authored in `content/location-abilities.csv`.
  Real effects (teleport, suppress-chip-bonuses, …) still need new effect
  types beyond v0.1's set.
- **Capital re-establishment** — cost / trigger to rebuild a lost Capital.
- **Multi-player raid edge case** — two units on a *third* player's
  Location: may they raid each other, or only contest the controller?
- **Reaction-window priority** among competing `replace` subscribers —
  seat order is the v0.1 default; confirm.

---

## 15. The Encounter & Quest System

The pieces in §6.5 (encounter nodes) and §10 (the event bus) describe
**reactive** mechanics — things that fire in response to a specific
gameplay event. This section adds a second, parallel channel:
**ambient narrative triggers** that read the broader state of the game
and decide, between rounds, that something interesting should happen.
It also adds a quest spine — multi-beat sequences delivered through the
same channel.

These additions are layered *on top of* the existing engine, not a
rewrite. Field encounters (§6.5) keep their semantics and are referred
to as such where the distinction matters. Reactive cards (§10) remain
the event-driven counterpart.

### 15.1 Overview

| Subsystem | Reads | Writes | Cadence |
|---|---|---|---|
| **Trigger evaluation** (§15.4) | world state, player state, faction standing | nothing directly — fires encounters | end of every round |
| **Encounter delivery** (§15.5) | encounter definition | player choice → effects | event-driven (when a trigger fires, when a unit ends Move on a marker, on a quest beat unlock) |
| **Deferred queue** (§15.6) | due-round queue | effect application | end of every round, before triggers |
| **Quest engine** (§15.7) | active-quest state, beat prerequisites | beat delivery, completion rewards | event-driven on quest start / beat completion |
| **Faction standing** (§15.3) | nothing — pure data | modified by effects | continuously |
| **Field encounters** (§15.8) | the `fieldEncounterDeck` | encounter delivery | when a unit ends Move on an encounter hex |

All six communicate through plain effects (§12 / §15.10) and the
existing event bus. **Faction Standing** was added as a late
requirement specifically as a test of architectural flexibility: it is
a value that triggers *read*, choices *modify*, and the faction AI
*consults*. No subsystem branches on it; it slots in as data.

### 15.2 Player tracks

Three new player-level numeric tracks supplement `VP` and `Tech` (§3).
They are signed integers, accumulated across the game and never spent.

| Track | Range guidance | Modified by | Read by |
|---|---|---|---|
| **`trust`** | ~[−10, +10] | encounter choices, quest outcomes | triggers, strength scoring, quest unlock conditions |
| **`reputation`** | ~[−10, +10] | encounter choices, public events | the same, plus faction-standing thresholds |
| **`alignment`** | ~[−10, +10] | quest outcomes, certain Reactives | which faction quest-lines a player qualifies for |

Modified via `ADJUST_TRACK` (§15.10). Stored under `player.tracks`
(§15.11). The ranges are guidance for content authors, not engine
caps — the engine clamps nothing, leaving room for extreme content.

### 15.3 World state and faction standing

The engine maintains a single **`state.world`** object alongside the
per-player state, plus a faction-by-player **standing matrix**.

`state.world` holds:
- `controlHistory[]` — `{ hex, controller, fromRound, toRound|null }`
  entries appended on every Location capture / loss. Lets a trigger
  ask "how long has player X held Y?" or "has this hex changed hands
  twice recently?"
- `raidCounts` and `ignoreCounts` — per-faction rolling counters
  (raids carried out against the faction; engagements that were
  passed up). Decayed slightly each round so they reflect recency.
- `eventTimeline[]` — a compact significant-event log used by
  deferred resolution and faction-memory lookups. Distinct from the
  unbounded event-bus log (§10.1).
- `encounterHexCooldowns` — when each field-encounter hex refreshes.
- `encounterMarkers` — placement-mode encounters waiting on the map.

`state.factionStanding` is a `fid → { pid → number }` matrix, range
guidance ~[−10, +10]. A faction's standing toward a player is modified by
`ADJUST_STANDING` (§15.10) — emitted by encounter choices, quest
outcomes, threshold checks (track crossings, alignment shifts), and
engine-internal hooks (e.g. capturing an affiliated Location grants
that faction a standing decrement toward the captor).

Standing is consulted by:
- Trigger condition / strength scoring (§15.4).
- The faction AI when allocating its turn actions — a faction with
  strongly negative standing toward a player will weight Move /
  Contest toward targeting that player. The AI module is a separate
  layer; the engine just exposes standing for it to read.

### 15.4 Trigger evaluation

Triggers are the engine's way of deciding, at end of every round, that
something narratively significant should happen. They are **separate
from the §10 event bus**: the bus is synchronous and event-payload-
driven; triggers are asynchronous and state-condition-driven.

**Trigger definition:**

```js
{
  id:        string,
  cooldown:  number,                     // rounds before it can fire again
  condition: (state, ctx) => boolean,    // eligibility
  strength:  (state, ctx) => 1|2|3|4|5,  // narrative urgency
  encounter: EncounterRef | EncounterDef,
}
```

**Evaluation algorithm** — runs in the turn loop after `round_ended`
(§7 Cleanup, §15.12) in this order:

1. Resolve any due deferred effects (§15.6).
2. Build the eligible pool: skip any trigger on cooldown
   (`state.triggerCooldowns[id] > current round`) or whose
   `condition` returns false.
3. Score each eligible trigger with `strength(state, ctx)`.
4. Sort by strength descending. **Fire the top two.** Ties at the
   cutoff resolved by the seeded RNG.
5. For each fired trigger, set
   `state.triggerCooldowns[id] = round + trigger.cooldown` and
   deliver its encounter (§15.5).

Strength is a 1–5 scalar by design — the buckets force authors to
make deliberate priority choices instead of fine-tuning floats.
A trigger that fires at strength 5 is "this should happen now";
strength 1 is "only if nothing else wants the slot."

### 15.5 Encounter delivery

An **encounter** is the unit of player-facing narrative content: art,
text, and 2–3 labeled choices that produce effects.

```js
{
  id:        string,
  mode:      "private" | "public" | "placement",
  recipient: "active" | "lowest-standing" | pid | …,    // private mode
  expiresIn: number?,                                   // placement mode
  art:       string,
  text:      string,
  choices: [
    {
      label, condition?,
      effects:  [Effect],
      deferred?: { delayRounds, effects: [Effect] },
    },
  ],
}
```

**Delivery modes:**

- **`private`** — a single player decides. The engine raises an
  interactive request to that player via the same `ctx.interact`
  abstraction the effect library already uses (§12). Other players
  wait. Headless harnesses see the same auto-pick semantics as
  `FORCE_CHOICE` (first option).
- **`public`** — all players see the encounter and pick independently;
  the engine resolves them in seat order. An encounter can opt into
  "one player chooses for the group" via a config flag.
- **`placement`** — the engine drops a marker on the Board (a chosen
  hex, or one matching a filter) and adds it to
  `state.world.encounterMarkers`. The encounter resolves only when
  a unit ends a Move on the marker's hex — at which point delivery
  switches to `private` mode with that unit's owner as recipient.
  If `expiresIn` elapses before discovery, the marker is removed
  and the encounter fizzles.

Field encounters (§15.8) are a degenerate case of placement: every
encounter hex is a permanent marker drawing from a shared deck.

### 15.6 Deferred consequences

A choice's effect list can declare effects that fire later instead of
immediately, via `QUEUE_DEFERRED` (§15.10) or the `choice.deferred`
shorthand on the encounter schema:

```
state.deferred[] = [
  { dueRound, effects: [Effect], source, ctx },
  …
]
```

At end of every round, **before** trigger evaluation, the engine
sweeps the queue: for each entry with `dueRound <= state.round`, run
`applyEffects(state, entry.effects, entry.ctx)` and remove. The
sweep runs first so deferred effects update the state that
conditions then read.

Deferred effects are invisible to the UI until they fire. They are
engine state and persist across saves (when save/load is added).

### 15.7 Quest progression

A **quest** is a sequence of one or more encounter beats sharing a
storyline and gated by prerequisites.

```js
{
  id:    string,
  mode:  "single-player" | "global",
  beats: [
    {
      id,
      prerequisites?: [beatId],
      deliver:    "auto" | "discovered" | "conditional",
      condition?: (state, quest) => boolean,   // for "conditional"
      placement?: HexFilter,                   // for "discovered"
      encounter:  EncounterRef | EncounterDef,
    },
  ],
  completion: {
    rewardForClaimant:   [Effect],
    sharedSideEffects?: [Effect],   // optional, on every player
  },
}
```

**Quest lifecycle:**

1. `START_QUEST { questId, claimant }` (§15.10) adds the quest to
   `state.activeQuests`. For `single-player`, `claimant` is the
   acting player; other players cannot start the same quest. For
   `global`, `claimant` is initially `null`; the first player to
   complete the final beat becomes the claimant.
2. The engine examines each beat with prerequisites now met. For
   each, it begins delivery per the beat's `deliver` mode (auto =
   immediate; discovered = drop a placement marker; conditional =
   wait for `condition` to come true, checked at end-of-round).
3. A beat's encounter resolves through the normal delivery system.
   On resolution it emits `ADVANCE_QUEST { questId, beatId }`
   (§15.10) — typically as an effect on one of the choices. The
   engine then evaluates the next beats.
4. When the final beat completes, the engine runs
   `completion.rewardForClaimant` for the claimant and
   `completion.sharedSideEffects` (if any) for everyone, emits
   `quest_completed`, and moves the quest record from
   `state.activeQuests` to `player.completedQuests`.

**Single-player exclusivity:** other players' triggers that would
start a single-player quest already claimed are no-ops — the trigger
fires but its encounter's `START_QUEST` effect short-circuits.

**Global broadcast:** beats of a global quest are delivered as
`public` encounters by default (configurable per beat).

### 15.8 Field encounters

The §6.5 encounter-node mechanic, formalised and renamed:

- An **encounter hex** is a Board node typed `"encounter"`.
- When a unit ends a Move on an encounter hex, the engine draws the
  top of the `fieldEncounterDeck` (renamed from `encounterDeck`)
  and delivers it via the encounter system in `private` mode to
  that unit's owner.
- After resolution the hex enters a refresh cooldown
  (`state.world.encounterHexCooldowns[hex] = round + N`); during
  that window the hex behaves as plain terrain. After the cooldown
  it becomes drawable again.

Field encounters and world encounters share the encounter schema. A
deck record can be promoted to a triggered world encounter and vice
versa with no schema change — only the delivery mode and trigger
wiring differ.

### 15.9 Content pipeline

```
content/
  encounters/
    <encounter-id>.js      exports an EncounterDef
    index.js               aggregates by id
  triggers/
    <trigger-id>.js        exports a TriggerDef
    index.js
  quests/
    <quest-id>.js          exports a QuestDef
    index.js
  field-encounter-deck.js  the deck used by §15.8
```

The engine imports only the `index.js` files. Adding content = author
a file and register in the index. **Adding a new effect type** = add
one handler to `EFFECTS` in `src/game/effects.js` (§12) and one entry
to the §15.10 list; nothing else.

### 15.10 New effect types

All additive; one handler each in the effect library (§12). Targeting
follows §11.

- **`ADJUST_TRACK`** — `{ track: "trust"|"reputation"|"alignment", amount, target }`. Mirrors `ADJUST_RESOURCE` for player tracks.
- **`ADJUST_STANDING`** — `{ faction, player, amount }`. Modifies the matrix.
- **`SET_PLAYER_FLAG`** — `{ flag, value, target, duration? }`. Player-scoped flag store. (§12.5's `SET_FLAG` is entity-scoped — units / locations / chips — and remains as-is.)
- **`QUEUE_DEFERRED`** — `{ effects, delayRounds, target }`. Schedule effects for a future round.
- **`START_QUEST`** — `{ questId, claimant }`.
- **`ADVANCE_QUEST`** — `{ questId, beatId }`.
- **`COMPLETE_QUEST`** — `{ questId }`. Rarely authored — usually emitted by the engine when the final beat resolves.
- **`PLACE_ENCOUNTER`** — `{ encounterId, hex?, hexFilter?, expiresIn? }`. Drop a placement marker.
- **`DELIVER_ENCOUNTER`** — `{ encounterId, mode?, recipient? }`. Force-deliver a private or public encounter outside the trigger system (e.g. from a quest beat with `deliver: "auto"`).

The replacement-mode effects from §12 (`REDIRECT`, `CANCEL`) apply to
encounter delivery payloads as well — a Reactive card can `REDIRECT`
an encounter's recipient or `CANCEL` the encounter inside a reaction
window.

### 15.11 State extensions (additions to §13.3)

```js
// per-player additions
player.tracks            = { trust: 0, reputation: 0, alignment: 0 };
player.flags             = {};                  // key → { value, duration? }
player.activeQuests      = {};                  // questId → { beatIndex, data }
player.completedQuests   = {};                  // questId → { round, outcome }
player.encounterCooldowns = {};                 // per-player cooldowns (reserved)

// state-level additions
state.world = {
  controlHistory:        [],
  raidCounts:            { /* fid: n */ },
  ignoreCounts:          { /* fid: n */ },
  eventTimeline:         [],
  encounterHexCooldowns: {},
  encounterMarkers:      { /* hex: { encounterId, expiresAt } */ },
};
state.factionStanding   = { /* fid: { pid: n } */ };
state.triggerCooldowns  = {};                   // triggerId → roundDueAgain
state.deferred          = [];                   // [{ dueRound, effects, ctx, source }]
state.activeQuests      = { /* questId: { claimant, beatIndex, deliveredBeats[] } */ };
state.fieldEncounterDeck = state.encounterDeck; // renamed; alias kept transiently
```

### 15.12 Turn-loop integration

`turn.js endTurn`, on the round-rollover branch (existing
`emit("round_ended")`), runs in this order, then continues into the
next player's `startTurn`:

```
emit round_ended
  ↓
resolve deferred queue (entries with dueRound <= round)
  ↓
trigger evaluation: filter, score, fire top 2 → encounter delivery
  ↓
expire placement markers whose expiresAt has elapsed
  ↓
decay world counters (raidCounts / ignoreCounts × ~0.9)
  ↓
next round / next active player startTurn  (existing flow)
```

`startTurn`'s existing Upkeep work (action reset, foothold tick,
production collection) is unchanged. Encounter-choice effects that
schedule new deferred work simply append to `state.deferred` for a
future round to pick up.

### 15.13 Implementation map to the current codebase

New modules under `src/game/`:

| File | Responsibility |
|---|---|
| `triggers.js` | trigger registry, end-of-round evaluator, cooldown bookkeeping |
| `encounters.js` | encounter delivery (private / public / placement), interactive choice request, marker management on the Board |
| `quests.js` | quest lifecycle, beat unlocking, claim enforcement, global-quest broadcast |
| `standing.js` | faction-standing accessors, threshold hooks, AI read API |
| `deferred.js` | the deferred-effect queue and its sweep |

Changes to existing modules:

| File | Change |
|---|---|
| `setup.js` | initialise the new state additions (§15.11); rename `encounterDeck` → `fieldEncounterDeck` (keep alias) |
| `effects.js` | add the §15.10 handlers; teach `getZone` about deferred storage if needed |
| `turn.js` | hook the round-rollover sequence in §15.12 |
| `actions.js` | the existing `Move` handler already triggers field encounters on Move-end (§6.5); extend that path to also check `state.world.encounterMarkers[hex]` for a placement encounter and deliver it |
| `events.js` | add the new event names: `encounter_delivered`, `trigger_fired`, `quest_started`, `quest_advanced`, `quest_completed`, `standing_changed`, `track_changed`, `deferred_resolved` |
| `targeting.js` | add tokens for quest / standing scenarios as they're needed: `claimant`, `most_recently_raided`, etc. |
| `content.js` | export the new content collections (encounters, triggers, quests); the spec-content separation in §2 keeps engine code free of content branches |

No existing handler needs to change behaviour. The §15 code paths are
guarded by data: the trigger evaluator does nothing if no triggers
are registered, the quest engine does nothing without active quests,
the deferred sweep is a no-op on an empty queue. Layer 3.1–3.3
harnesses continue to pass.

### 15.14 What this replaces / supersedes

- **§6.5** is reframed as field encounters (§15.8) — same mechanic,
  formal name.
- **§10** is unchanged. The trigger evaluator in §15.4 is parallel,
  not a replacement.
- **§12.5 (`SET_FLAG`)** stays as the entity flag store. The new
  `SET_PLAYER_FLAG` (§15.10) is the player-scoped parallel.
- **§14.2** open items for encounter / quest *architecture* are now
  resolved here; specific record content remains an open authoring
  task.

## 16. v0.2 Gameplay Revision — Movement, Attrition & Combat

This section supersedes the parts of §6.2, §7, §8, and §9 it touches.
It is the design of record for the demo's gameplay overhaul. Where it
conflicts with earlier sections, §16 wins; the earlier text is kept for
history. Items marked *(deferred)* are designed but not in the first
build slice.

### 16.1 Design intent

Turns were thin and slow — a lone unit spent both Actions walking.
This revision makes each turn a real decision by (1) freeing movement
from the Action budget, (2) putting more, more-expendable units on the
board with real attrition, and (3) giving combat deterministic levers
so a fight is something you set up rather than gamble on.

### 16.2 Movement is its own budget (supersedes §8 "Move")

- Every unit has a per-turn **move budget** = its `Movement` stat,
  refreshed at the owner's Upkeep (`moveRemaining = Movement`).
- **Move costs no Action.** It spends move budget equal to the path
  distance walked. A unit may take several Moves per turn until its
  budget is exhausted.
- The **2 Actions** are reserved for Recruit, Contest, Acquire,
  Activate, and Reinforce (§16.5).
- **Declaring a Contest ends that unit's movement** for the turn
  (`moveRemaining = 0`) — no move-attack-move.
- Base `Movement` rises **1 → 2** so units actually traverse.
- Ending a Move on an encounter node still triggers §6.5/§15.8.

### 16.3 Units, expanded (supersedes §6.2)

- Each player begins with **two** units on/near their starting Location.
- **Base unit cap is 3**, +1 per Training Grounds controlled.
- **Recruit** cost lowered to **6 `Resource`** (still requires a
  Training Grounds and below cap).
- **Base `Strength` doubles as hit points.** It starts at 4 and is the
  unit's life total; chips are gear that raise *effective* Strength but
  are not life. A unit's effective Strength = (current, possibly
  eroded) base + chips + modifiers, as today.

### 16.4 Attrition, death, and salvage (supersedes §9 step 3 "Raid" and step 4)

After a contest resolves:

- **Loser:** −1 base `Strength`.
- **Pyrrhic win:** if the winning margin is a **tie (0)** (only the
  defender can win a tie) **or exactly 1**, the **winner** also loses
  1 base Strength — *if the winner is a unit* (a bare garrison has no
  Strength to lose).
- **Rout (massing downside):** if the margin is **≥ 4**, a **second
  friendly unit stacked on the loser's hex** (if any) also loses 1 base
  Strength — the casualty spills into the stack. *(Interpretation of
  "an overwhelming loss costs both units a strength"; confirm.)*
- **Death:** a unit at **base Strength 0 is destroyed** (a unit never
  rests at 0). Chips are not life — a unit with eroded base + chips
  still dies at base 0.
- **Salvage:** when a contest **kills** the loser, the winner gets a
  `FORCE_CHOICE`: take up to its free Bay space worth of the dead
  unit's chips; the rest are removed.
- **Raid retreat:** a surviving raid loser **may** retreat 1 hex (the
  loser chooses whether and where). The attacker may pursue next turn.
- **Removed:** the old immobilize / destroy-a-chip raid outcomes are
  gone — attrition + salvage replace them.

### 16.5 Reinforcement & healing (new; pairs with foothold §6.3.2)

The supply-line loop: sortie, bleed, fall back to mend and re-secure.

- **Passive heal:** at Upkeep, each unit on a **friendly fully-held
  Location** regains **+1 base Strength**, up to its cap.
- **Instant top-up (action):** a unit on a friendly Location may spend
  **1 Action + 2 `Resource` per Strength** to restore up to its cap in
  one go (range 1→4 normally).
- **Field reinforcement (action):** from a unit anywhere, spend **1
  Action + 2 `Resource` per Strength**; the reinforcement **arrives in
  N turns**, where N = shortest path **through friendly/neutral hexes
  only** from the nearest friendly Location to the unit. It **re-targets
  a moving unit** (ETA recomputes). If enemy territory walls the unit
  off entirely, no reinforcement can be sent.
  - **Severed supply:** if the origin Location is captured while
    reinforcements are in transit, they **become a new unit** where
    they currently stand, at the Strength they were carrying (capped at
    4), with **no chips**. (Allowed even if it exceeds unit cap — it
    only arises from a loss elsewhere.)
- The **"New Recruits" chip is renamed** (recruitment is now an action);
  it stays a permanent +1 effective-Strength gear chip under a
  gear-flavored name (TBD, e.g. "Drilled Troops").

### 16.6 Combat levers (partial supersede of §9 defender value)

A contest total is computed as:

```
attackerTotal = attackerEffectiveStrength
              + concentration(attacker)
              + (attacker is Veteran ? 1 : 0)
              + 1d6

defenderTotal = defenderValue                       (§9: garrison + chips + defending unit)
              + concentration(defending units)
              + (Mountain terrain ? 1 : 0)
              + (defending unit Fortified ? 1 : 0)
              + (defender is Veteran ? 1 : 0)
              + (defending unit present ? 1d6 : 0)   (garrison-only adds no die — house rule)
```

- **Concentration:** **+1 per *additional* friendly unit on the
  contesting unit's hex**, capped at **+3**. Applies symmetrically to
  defending units stacked on a held Location.
- **Mountain terrain:** defenders get **+1** to the roll. *(Terrain
  types are deferred; the rule is fixed now.)*
- **Fortify:** a unit that **did not move on its previous turn** gets
  **+1 when defending** ("dug in").
- **Veterancy:** a unit becomes a **Veteran** (permanent **+1** to its
  contest rolls) once it has **won 3 contests OR survived 5 contests,
  whichever comes first**. ("Survived" = participated in a contest and
  was not destroyed.) Losing a Veteran therefore stings — by design.

### 16.7 Combining units *(deferred — designed, not in first slice)*

Merge two of your units sharing a hex into one:
- new base-Strength **cap 8** (sum of the two, then capped);
- **3 Bay slots** (so merging two 2-chip units sacrifices one chip —
  salvaged back to you);
- a **base `Movement` penalty** (−1, large groups coordinate poorly).
Because Concentration and board presence usually favor keeping units
separate, combining is mainly a **unit-cap relief valve**: consolidate
to free a slot for a fresh recruit. Niche by intent.

### 16.8 Tuning watch-list

- Faster movement + more units + Concentration ⇒ much more combat;
  re-tune garrison values and the 12-VP pace.
- Concentration cap (+3) and the rout spillover are the checks on
  doomstacks; the deeper check is opportunity cost (massed units aren't
  holding territory, so footholds decay).
- Attrition can snowball a losing player; passive/field reinforcement is
  the comeback valve, but a player stripped of territory has none — by
  design, accept decisive endings.

## 17. Tech Wheel (v0.2)

Supersedes the Tech parts of §3, §4.1, and §16 where they conflict. Tech
is no longer a single number that only unlocks a stronger Market row; it
is a radial **ability wheel** fed by a renewable progress resource.

### 17.1 Two distinct quantities (name them differently in the UI)

- **Research** — the progress resource. Generated by **Labs** chips and by
  **some encounters**. This is the bar you fill.
- **Tech Level** — a band (1–5) derived from Research by fixed thresholds.
- **Ability Points** — what you *spend* on the wheel. You gain **+1 each
  time you reach a new Tech Level**. This is "tied to Tech Level."

Keep "Research" (the bar) and "Ability Points" (the spend) visually
separate so players never conflate them.

### 17.2 Research → Tech Level

| Tech Level | Research required | On reaching it |
|---|---|---|
| 1 | 0 (start) | — |
| 2 | 2 | +1 Ability Point |
| 3 | 4 | +1 Ability Point · **Market layer 2 revealed** |
| 4 | 6 | +1 Ability Point |
| 5 (cap) | 8 | +1 Ability Point · **Market layer 3 revealed** |

- **Max 4 Ability Points** (one each at L2–L5). Level 5 is the ceiling.
- **Research sources:**
  - **Labs** chip: **+1 Research** while controlled.
  - **Advanced Lab** chip (Market tier 2): **+2 Research** while controlled —
    the faster climb. No Lab tier sits at L5 (it's the cap).
  - **Encounters / quests:** may grant Research. Encounter/quest Research is
    **permanent** (a floor); Lab Research is **conditional** on holding the Lab.
- **Market gating moves to Tech *Level*:** tier 2 at L3, tier 3 at L5
  (replaces the old `CONFIG.tech.tier2 = 3` / `tier3 = 6` raw-score gates).
  **§20 (v0.2+) reframes this again** as chip-*build* gating — the same L3/L5
  thresholds now gate which chip tier you may **build**, since the Market is
  retired.

### 17.3 Losing Research (Labs destroyed/captured) and re-spec

- Labs sustain their Research. Lose a Lab (destroyed, or its Location
  captured) → Research falls → if it drops below a threshold, **Tech Level
  drops**, you **lose an Ability Point**, and the **deepest / most-recently
  assigned node is peeled** (LIFO). A branch node is never left orphaned —
  peeling always removes leaves first.
- Permanent (encounter/quest) Research is a floor that can't be raided away.
- **Re-spec only happens on the destroy-then-rebuild cycle:** when you lose a
  level and later regain it, you re-assign the regained point freely.
  Otherwise assignments are sticky.
- Because the engine already recomputes tech on any control change,
  **capturing a Lab-heavy Location lifts your Research and drops the former
  owner's** for free — tech denial is emergent. (Feel risk: tech swinging
  mid-game is punishing, so deep-node strength + the peel rule want a balance
  pass.)

### 17.4 The wheel

Four paths radiate from the centre: **Military, Economy, Intelligence,
Logistics**. Each path is **5 nodes over 3 layers**:

```
              entry
             /     \
           A1       B1          (layer 2 — the two branches)
           |        |
           A2       B2          (layer 3 — each branch's deeper node)
```

- **Prerequisites:** entry → A1 → A2, and entry → B1 → B2.
- **Deeper = stronger.** Effects deeper in a branch are better than the entry.
- **Nothing forbids spreading** across paths, but Ability Points are scarce:
  4 points cannot complete even one 5-node path (a full path is 5), so every
  build is a real set of trade-offs — go deep in one branch, split a path's
  two branches, or dabble across paths.
- **Stacking vs. replacement.** Resolved in §17.5: branch effects **ADD**.
  A deeper node never replaces a shallower one — holding Doctrine and
  Vanguard grants both contest-roll bonuses in their respective contexts.

### 17.5 Node abilities

| Path | Entry node | Effect |
|---|---|---|
| **Military** | Doctrine | **+1 to any contest roll** (yours, attacking *or* defending). |
| **Logistics** | Supply Lines | **+1 Movement** to your units. |
| **Economy** | Industry | **+1 scrap per turn** from each Location you fully hold. |
| **Intelligence** | Recon | **When an encounter would be drawn for you, you may discard it and take the next draw instead.** |

- **Intelligence + Recon Team chip stack.** The Recon Team chip stays in the
  game; each source grants **one** discard, so a player on the Intelligence
  path *and* holding Recon Team may discard up to **two** encounters before
  committing to a draw. (Engine note: the discard reshuffles the card at least
  3 cards down and fires only on that player's own draws.)

**Branch effects ADD to the entry** (and to each other within the same
branch); no branch node *replaces* a shallower one. Holding two nodes always
means holding both effects.

#### Military

Entry **Doctrine** is the contest-roll generalist; the two branches
specialise.

- **A · Aggression** — your *attacks* hit harder.
  - **A1 Vanguard** — +1 contest roll when *you initiate* the contest
    (stacks with Doctrine: +2 attacking, +1 defending).
  - **A2 Killing Blow** — when you attack and win, the loser loses
    **2 Strength** (was 1). Your wins are twice as bloody.
- **B · Bastion** — *your Locations* are harder to take.
  - **B1 Turrets** — when defending a hex you control, +1 contest roll AND
    the §16.6 fortify bonus doubles (1 → 2).
  - **B2 Citadel** — Locations you control gain +2 garrison Strength;
    Locations captured *from* you initialize at **Loyalty 0** for the new
    owner — your conquest is hollow to whoever takes it.

#### Logistics

Entry **Supply Lines** is the mobility generalist.

- **A · Maneuver** — your units go further.
  - **A1 Forced March** — +1 Movement (stacks with Supply Lines: +2 total).
  - **A2 Forward Supply** — your §16.5 reinforcement convoys may route
    through enemy ZoC hexes. Forward-deployed units stay supplied behind
    enemy lines.
- **B · Sustainment** — your units last longer.
  - **B1 Field Hospital** — +1 passive heal per Upkeep on held Locations
    (stacks with the §16.5 base: +2/Upkeep).
  - **B2 Supply Convoys** — convoys travel +1 hex/round; the
    `scrapPerStrength` healing rate is **1:1** (was 2:1).

#### Economy

Entry **Industry** is the production generalist.

- **A · Industry** — more material.
  - **A1 Refineries** — +1 scrap per Upkeep per held Location (stacks with
    Industry: +2 per Location).
  - **A2 Industrial Might** — your **Capital generates +1 Research per
    Upkeep** (in addition to any Labs). Industry compounds into Tech.
- **B · Construction** — better building.
  - **B1 Production Lines** — chip `buildCost` reduced by 1 (floor 1).
  - **B2 Capital Works** — your Capital gains **+1 chip slot**.

#### Intelligence

Entry **Recon** is the encounter-control generalist.

- **A · Vision** — see more of the map.
  - **A1 Watch Network** — +1 faction-wide Vision AND +1 faction-wide
    Detection.
  - **A2 Listening Post** — unlocks the **Build Listening Post** action —
    a deployable hidden vision source in the field. **See §17.7** for the
    full subsystem.
- **B · Espionage** — read and disrupt rivals.
  - **B1 Spy Ring** — you read normally-hidden rival state: each rival's
    Tech Wheel allocation, and their pairwise Standing with third parties.
  - **B2 Saboteurs** — once per round, target an enemy-controlled Location
    and lower its Loyalty by 1. The covert offence the diplomacy player
    wants.

### 17.6 Victory interaction

- **No tech victory.** Reaching L5 / filling the wheel is a power curve, not a
  win condition.
- **Conquest remains the win condition.**
- **Diplomacy victory is a candidate** for later: the engine already tracks
  `trust / reputation / alignment` per player and per-faction standing (§15.2,
  §15.3), so a diplomacy path (e.g. hold maximal standing with N factions, or
  all tracks past a threshold) is feasible without new core systems. The
  Economy and Intelligence branches are likely feeders. Revisit as the wheel
  fills in.

### 17.7 Listening Post (Intelligence A2 — Vision)

A unit-built static structure that grants its owner a small sight footprint
deep in territory it does not control, and survives by **stealth, not
toughness.** The covert eye in the field.

**State.** `state.world.listeningPosts[hex] = { owner, hex, strength: 5, paid }`.
A hex may carry at most one listening post; posts may not occupy Location
hexes (the Location is already a sight source). Uncapped per player — the
scrap cost self-regulates.

**Build action.** Requires that the acting player has assigned Intelligence
A2; a friendly unit stands on the target hex; the hex is **not** a Location.
Costs **1 Action + 3 scrap** (paid immediately from the bank). Spawns a post
on that hex owned by the acting player. The post is **concealed** at spawn.

**Vision contribution.** The post is a Vision source of radius **1** — it
sights its own hex + adjacent neighbours for its owner. Vision **only**; the
post contributes **no Detection** (a concealed enemy unit standing on the
post's hex is still invisible to the owner unless they have separate
Detection in range). §19 LoS rules apply normally — elevation and cover
affect what the post sees, exactly as for a unit standing there.

**Concealment & reveal.** The post follows §19.5 concealment — invisible in
fog by default. It is revealed to faction F when either:

- an F-owned unit enters the post's hex (contact), or
- an F-owned Detection source comes in range of the post's hex.

Once revealed to a faction the post stays revealed for that faction — it
does not re-stealth.

**Destruction.** An enemy unit standing on the post's hex may spend 1 Action
to contest it. The post defends as an undefended garrison: Strength **5** +
1d6 vs the attacker's normal contest total (defender wins ties per §16). On
the post losing it is removed. The §16.4 Pyrrhic rule applies normally — a
margin-≤1 win still costs the attacker 1 Strength. The post cannot wound an
attacker beyond Pyrrhic (it has no unit to lose Strength).

**Upkeep.** 1 scrap per Upkeep, paid alongside §20.9 chip upkeep from the
player's bank. An **unpaid** post goes **dormant**: it contributes no Vision
and does not appear among its owner's vision sources until the next Upkeep
at which it is paid. Dormant posts do not auto-destruct — the owner may
resume by paying. **Dormant posts stay concealed** under the same reveal
rules — going dormant does not reveal the post to anyone.

**Why Vision, not Espionage.** The post extends *your* sight; it does not
read or disrupt rival state. The Espionage branch (B1 Spy Ring → B2
Saboteurs) is the covert-offense path; the Vision branch (A1 Watch Network →
A2 Listening Post) is the sight-projection path.

**Engine surface.** The post is **the only branch node large enough to need
its own subsystem** — the other 15 are numeric tweaks or one-effect additions
on existing mechanics. New: a `posts.js` module owning the listening-post
state and lifecycle; a `BUILD_POST` action in `actions.js` (validates A2
assignment, unit-on-hex, non-Location, ≥3 scrap, ≥1 Action); a Vision source
contribution in `visibility.js` (radius 1, owner-scoped, dormant-skip);
a contest target type in `contest.js` (standing garrison Str 5, no §16.5
healing); a per-post upkeep tick alongside `chargeChipUpkeep` in `turn.js`;
events `post_built` / `post_destroyed` / `post_dormant` / `post_paid`; AI
hooks to value placement (frontier scouting) and to value destroying revealed
enemy posts. The AI's effect→value table (see `docs/ai-overhaul-plan.md`)
gains one entry for "deployable Vision source."

### 17.8 Engine mapping (for implementers)

- Rename/replace the raw `player.tech` concept: store **`player.research`**
  (Labs + encounter grants) and derive **`player.techLevel`** via the §17.2
  thresholds; `recomputeTech` becomes `recomputeResearch` (sum Lab values over
  controlled Locations, add permanent encounter Research, re-band the level,
  emit on change).
- Track the wheel allocation per player (e.g. `player.techWheel = { military:
  [...nodeIds], ... }`) and the spent/available Ability Points; enforce
  prerequisites and the LIFO peel when level drops.
- `Advanced Lab` is new tier-2 content (`research: 2`); the basic `labs` chip
  becomes `research: 1`.
- Market tier unlock reads `techLevel >= 3 / 5` instead of the raw-score gates.
- The four entry effects reuse existing levers (contest roll bonus, movement,
  per-location scrap, the field-encounter draw hook), so each is a small,
  one-sentence addition.

## 18. Loyalty, Influence & the Diplomacy Track (v0.2+)

Supersedes the foothold/decay parts of §6.3.1–§6.3.2 and makes the
diplomacy-victory candidate of §17.6 concrete. This is the design of
record for the political layer. Where it conflicts with earlier text,
§18 wins. **Numeric values throughout are deliberately left as TBD** —
the tables get filled and tuned in a later pass; this section fixes the
*model*, not the constants.

### 18.0 Terminology (ratified)

These names are now canonical across the spec, the engine, and the UI:

| Term | Means | Replaces / notes |
|---|---|---|
| **Control** | The **3-section ring** you fight over to capture/hold a Location. Contest-driven (§9). | Unchanged — the existing control meter. |
| **Loyalty** | The **8-slice centre pie** (ceiling 8): the population's integration to its controller. Slow, time-based; governs decay and projects Influence. | Renames the old "foothold score `F`" / "assimilation". |
| **Influence** | The scalar *quantity* a faction projects onto a hex. | New. |
| **Zone of Control (ZoC)** | The *set of hexes* where a faction's Influence dominates. | Influence is the number, ZoC is the territory. |
| **Standing** | Pairwise relation between two actors (player↔faction *and* faction↔faction). | Extends §15.3's player-only matrix. |
| **Menace** | A player's **global** reputation for *unjustified* aggression. | New. |
| **Honor** | A player's **global** reputation for keeping their word (pacts, treaties, deals). | New — orthogonal counterpart to Menace. |
| **Temperament** | A faction's authored character (warlord / trader / opportunist…), with emergent drift. | New. |
| **Tolerance** | How much of your Menace a given faction will accept in an ally; `f(Temperament, Standing)`. | New. |
| **Pact** | An alliance commitment; a *pact call* (an ally's war) is a choosable obligation. | New. |
| **Deal** | An atomic basket of give/get items two actors both accept (trade, gift, treaty, tribute). | New. |
| **Coalition** | A multi-faction pact formed specifically against a threatening player. | New. |
| **Vassalage** | A negotiated subordination of one faction to a lord, short of conquest. | New. |
| **Recognition** | The diplomacy victory track — formal acknowledgement (alliance / vassalage) by enough factions. | New. |

### 18.1 Design intent

Give a non-conquest path to victory that rewards a different game: hold
and *integrate* territory, project Influence, and navigate a living
political landscape of factions that have opinions about you **and about
each other**. The path is not pacifism — it is *foreign policy*. A
warlord can win it, provided their wars are seen as justified by the bloc
they court.

Three pillars, layered onto existing systems:
1. **Loyalty** turns "occupying" a Location into "annexing" it — a slow
   integration track that, once high, lets territory hold itself and
   project power outward.
2. **Influence / ZoC** is the soft territorial field Loyalty projects; it
   gates a few things (reinforcement routing, encounter reveals) and is
   read diplomatically as presence or pressure depending on Standing.
3. **The diplomacy track** is reputation-relative *and active*. Two global
   reputations (Menace, Honor) plus pairwise Standing gate what factions
   will agree to; **deals** are the transaction primitive; **pacts,
   mediation, denouncement, and vassalage** are the verbs; **coalitions**
   unite the board against a runaway player; and **Recognition** by enough
   factions is the win.

### 18.2 Loyalty replaces foothold/decay (supersedes §6.3.2)

The meter's centre no longer holds a signed foothold score `F`. It holds
**Loyalty `L`**, an integer **0–8**, rendered as an **8-slice pie**
(keeps the radial UI language of the Control ring, contest overlay, and
tech wheel).

- **Ceiling is fixed at 8.** Nothing raises it. (This retires the old
  Town-Hall-raises-the-cap rule; see §18.11 on what those chips do now.)
- **Loyalty rises** while the controller holds full Control *and* meets
  the integration condition (e.g. a friendly unit present, and/or an
  integration chip) — **+x per Upkeep**, capped at 8. *(rate TBD)*
- **Loyalty decays** when the Location is neglected (no friendly unit /
  no integration source) — **−y per Upkeep**, floored at 0. *(rate TBD)*
- **Loyalty initialises low** on first reaching full Control. *(start
  value TBD)* It resets when full Control changes hands.

**The crucial rule — Control is no longer lost to passive ticking.**
Control flips only two ways:

1. **A lost contest** (§9) flips one Control section by the §6.3.1 rule.
2. **Loyalty hits 0.** While Loyalty sits at 0 and the Location stays
   neglected, **one Control section peels to neutral per Upkeep**, one at
   a time, until the Location is fully neutral. Bringing a unit back
   halts the peel and lets Loyalty climb again; rebuilding lost sections
   is done by contesting (§9).

So Loyalty is the *clock* on neglected territory, and Control is the
*line* you hold by force. A garrisoned, fully-loyal Location is
effectively permanent; an ungarrisoned fresh capture bleeds out.

- **UI warning:** the engine must surface Loyalty dropping toward danger
  **before** any Control peels — a "loyalty failing" alert at a
  threshold *(TBD)* so the player can react in time.
- **Capital exception preserved:** a Location carrying a **Capital** chip
  does not decay — its Loyalty is inert/locked at full.
- Pure contested partial progress still does **not** decay (unchanged):
  if Control sections are split and no one has held full Control, the
  meter is static until the next contest.

### 18.3 Influence and Zone of Control

Influence is a **deterministic scalar field**, recomputed (no dice) on
any relevant change — exactly like the Control meter's bookkeeping.

```
influence(faction, hex) =
    Σ over that faction's controlled Locations within range R of:
        ( faction base influence              // faction-wide score / tech / chips
        + location local influence            // scales with that Location's Loyalty
        + influence-chip bonuses )
      × distance falloff(hex, location)
```

- A hex joins a faction's **ZoC** when that faction's Influence there is
  the **highest and clears a threshold** *(threshold TBD)*. Highest-below-
  threshold or ties → **contested / neutral** (no owner).
- **Loyalty feeds Influence:** a freshly captured, low-Loyalty Location
  projects little; a fully integrated one projects strongly. Integrating
  territory *is* the influence build.
- **Influence chips:** because the Loyalty ceiling is fixed, chips that
  used to raise it are repurposed (§18.11); a dedicated influence chip
  raises faction base or a Location's local influence / range.

**What ZoC gates (light-touch by decision):**
- **Reinforcement routing** (already in §16.5) — friendly/neutral-hex
  pathing is a ZoC concept.
- **Encounter reveals** — an encounter drawn inside your ZoC may expose
  **additional choices** (a "home advantage"); content-authored per
  encounter via a `condition` on the choice.
- **Diplomatic reading** — your ZoC bordering a faction is read as
  *presence* or *pressure* depending on that faction's Standing toward
  you (§18.5). It is **not** wired to contest math or passive yield in
  this pass (those were considered and deliberately deferred).

### 18.4 Faction model

A faction is no longer cosmetic (cf. §6.6). It carries authored
**characteristics** that the AI pursues and that others judge you
against. **All values below are TBD** — this fixes the fields, not the
numbers; the per-faction tables get authored later.

**Diplomatic personality** (authored constants modulating runtime values):
- **Temperament** — baseline aggression / character (warlord, trader,
  opportunist…), with an emergent drift from the faction's own behavior.
- **Trustworthiness** — how reliably *they* honor their own pact calls.
- **Grudge / forgiveness** — how fast their Standing recovers after a
  slight (the knob on the souring-spiral recovery path, §18.5).
- **Sociability** — how eagerly they seek alliances at all.

**Strategic goals:**
- **Victory lean** — conquest vs. diplomacy. A diplomacy-leaning AI is the
  player's direct *competitor for alliances*, which is what gives the
  political track an opponent rather than a checklist.
- **Expansion appetite** — greedy vs. content with current holdings.
- **Coveted targets** — preferred Location types (Labs, high-VP) or a
  fixated nemesis faction.

**Inter-faction Standing (load-bearing):**
- Factions hold **Standing toward each other**, not only toward the
  player. Without it, "my ally's enemy is my enemy" has nothing to read
  and the map is a hub-and-spoke around the player. This is the spine of
  the political landscape and the source of AI-vs-AI dynamics the player
  can exploit or mediate. Stored by extending `state.factionStanding`
  (§15.3) to include faction→faction rows.

**Mechanical asymmetry (later pass):**
- A per-faction lean (combat / economy / influence / tech), a signature
  unit or chip, asymmetric starting position. Flavorful but not required
  for the diplomacy victory to function.

#### 18.4.1 Major and minor factions

Factions come in two tiers sharing the **same model** — minors are not a
special engine case, just a faction record with three extra fields:

- **`playable: false`** — minors are never controlled by the human; they
  populate the political landscape with more actors to court, exploit, or
  eliminate.
- **`scope: "local"`** — a **constant for all minors**: the AI pursues goals
  only within its **immediate map area** (it expands, raids, and allies
  among its neighbours rather than projecting across the board). Majors are
  `scope: "global"`. This one flag makes minors *feel* like regional powers
  without bespoke AI.
- **`associatedMajor` + `relationship`** — every minor is tied to one major
  by a relationship of **`kin` | `rival` | `foil`**:
  - **kin** — a smaller version of the same culture; a natural ally.
  - **rival** — the same niche fighting over the same turf; a natural enemy
    the player can turn against its major.
  - **foil** — a thematic opposite (honest warriors vs. schemers); a natural
    tension.
  The relationship **seeds the default Standing** between the minor and its
  major (kin → warm, rival → cold, foil → wary) — the player's exploitation
  hook.

**Roster per game.** A game seeds the human + a few **major** AIs + a
**variable subset of minors** drawn from the pool, so no two games field the
same cast — and therefore not the same politics.

**Alliance variety (a design goal).** The `associatedMajor` link is a *thumb
on the scale, not destiny* — the same alliances must not recur every game.
Variety comes from three sources already in the engine:
1. **Seeded standing** — default minor↔major (and faction↔faction) Standing
   = temperament compatibility + relationship type **+ a per-seed jitter**.
2. **Map proximity** — `scope: "local"` minors bond/war with whoever the
   generated map places **adjacent**, reshuffling the web each game.
3. **The dynamic engine + the player** — §18.8 AI-to-AI diplomacy evolves it,
   and the player can court a minor away from its major or provoke it. So an
   associated alliance is *likely*, never *guaranteed*.

#### 18.4.2 The v0.2 starter roster

Four major (playable) cultures, each with one associated minor. Dials are
**starting defaults** (TBD-tunable); temperament and behaviour drift in play.

| Faction | Tier | Scope | Temperament | Trust/Honor | Sociability | Victory lean | Assoc. (relationship) |
|---|---|---|---|---|---|---|---|
| **Grand Lakers** | Major | global | Warlord — might = right, self-reliant | Mid (proud; keeps word, rarely deals) | Low | Conquest | — |
| **Clan Tempest** | minor | local | Warlord, parochial | Mid | Low | Conquest | Grand Lakers — **rival** |
| **Goldgrass Coalition** | Major | global | Pacifist farmer | High | Very high (allies early, by trust) | Diplomacy / Economy | — |
| **The Croppers** | minor | local | Pacifist farmer | High | High | Economy | Goldgrass — **kin** |
| **Free Plainers** | Major | global | Opportunist — equal war & trade | Low (alliances shift easily) | Mid–high (fickle) | Opportunist | — |
| **The Steel Traders** | minor | local | Opportunist + intrigue / warfare | Low | Mid | Conquest / intrigue | Free Plainers — **rival** |
| **Versari Korad** | Major | global | Schemer — intrigue, diplomacy, economy | Mid (fair if you're useful) | High | Diplomacy / Economy | — |
| **The Dambarans** | minor | local | Honourable warrior — strength & honour, intrigue last; not bullies | High | Mid | Conquest | Versari Korad — **foil** |

Flavour (cosmetic, separable per §2): the Grand Lakers are a hardy, warring
Great-Lakes people and Clan Tempest a rival lake clan; the Goldgrass
Coalition and Croppers are farmers trading their harvest for peace; the Free
Plainers and Steel Traders are pirate bands centred on strong leaders; the
Versari Korad rule by manipulation while their Dambaran foils win by honest
force.

### 18.5 Reputation & relationship state

This is the data every diplomatic decision reads. All values are runtime,
nudged by play (never rolled).

**Standing** — pairwise relation, held **both** player↔faction **and
faction↔faction** (extends the player-only matrix of §15.3). Suggested
tiers: **Hostile → Wary → Neutral → Friendly → Allied**, with **Vassal**
(§18.9) as a formal sub-state above Allied. Standing **drifts slowly
toward Neutral** when nothing reinforces it *(rate TBD)*, so neglected
friendships cool and old grudges fade — the fade rate *is* the faction's
**Grudge/forgiveness** trait (§18.4).

**Two global reputations.** A player carries both; every faction reads
both, weighting them by its own **Temperament**:

- **Menace** — reputation for *unjustified* aggression, scored **relative
  to the target's Temperament**:
  - Attacking a faction **more aggressive than you** holds Menace flat or
    **lowers** it (you checked a warlord — a public service).
  - Attacking a **relatively peaceful** faction **raises** it (you're the
    bully).
  - Menace **decays slowly** with time and clean play *(rate TBD)*.
- **Honor** — reputation for keeping your word. **Raised** by honoring
  pacts, treaties, and deals to term; **dropped sharply** by breaking a
  pact call, declaring war on an ally, tearing up a treaty, or reneging on
  a deal's promise. Unlike Standing (pairwise), an Honor hit is **global**
  — *every* faction becomes warier at once.

The two are **orthogonal**: you can be a feared-but-reliable power (high
Menace, high Honor) or a peaceful snake (low Menace, low Honor). They gate
different things, so a player manages them separately.

**Tolerance (derived, per faction).** How much of your Menace a faction
accepts before refusing to deepen relations: `Tolerance = f(their
Temperament, their Standing toward you)` — a militaristic faction tolerates
a bloodier ally than a pacifist one, and **Tolerance rises as Standing
rises**, so a deep alliance *buys you latitude* a stranger would never
grant. **Honor has an analogous gate:** below a faction's temperament-set
**trust floor**, no amount of gifts raises Standing past a ceiling — liars
hit a wall.

**Influence reception follows Standing** (the feedback loop): high Standing
→ your ZoC border is benign presence (allies keep open borders); low
Standing → the same border reads as a **threat** and erodes Standing
further. The deliberate **recovery path** (goodwill encounter choices,
gifts, withdrawing influence) is gated by the faction's Grudge/forgiveness.

> **Interaction summary.** Standing is the *relationship*; Menace and Honor
> are your *reputation*; Tolerance and the trust floor are the *gates*
> reputation places on how far a relationship can go. Deals and actions
> (§18.6–18.7) move Standing; combat moves Menace; kept/broken promises
> move Honor; the AI (§18.8) reads all of it.

### 18.6 Deals — the diplomatic transaction primitive

Almost every peaceful interaction is one primitive: a **deal**, an
**atomic** basket of give/get items both parties accept together or not at
all.

```
Deal {
  proposer, recipient,
  give: [Item],     // proposer → recipient
  get:  [Item],     // recipient → proposer
}
Item ∈
  { resource: {resource, amount} }          // one-time transfer
  { flow:     {resource, amountPerTurn} }    // ongoing until cancelled/broken (a trade route)
  { chip:     {chipUid} }                    // hand over owned/installed gear
  { research: {amount} }                     // one-time Research grant
  { intel:    {kind: vision|mapData} }       // information (hooks into Explore, later)
  { promise:  {kind, target?, duration?} }   // tracked obligation; see below
promise.kind ∈ { peace, nonAggression, openBorders, joinWar(target), dontAlly(target), tribute }
```

- **Atomic:** the engine applies both sides in one transaction or rejects
  the whole deal — never partially.
- **Gift** = a deal with an empty `get`. **Tribute** = a deal extracted
  under an ultimatum (§18.7).
- **Flows** (trade routes, ongoing tribute) persist as live state until
  **cancelled at term** (no penalty) or **broken early** (an Honor ding).
- **Promises** register **obligations** the engine tracks; **breaking** a
  promise is the canonical Honor-dinging event and usually also crashes
  Standing with the wronged party.
- **Delivery:** a **player→AI** proposal is evaluated immediately (§18.8)
  and **accepted / countered / refused**; an **AI→player** proposal arrives
  as a **`private` encounter** (§15.5) whose choices are accept / decline /
  counter — reusing the existing encounter + `ctx.interact` path, *not* a
  new channel.

Live agreements live in `state.diplomacy.agreements`; the engine checks
promise obligations when relevant events fire (e.g. you attack a faction
you promised non-aggression → promise broken → Honor + Standing hit).

### 18.7 Diplomatic actions (the verbs)

Three axes, so a player always has moves whether at war or at peace. Each
action is either a **deal** (§18.6) or a **state operation** on
Standing/war-state; effects are spelled out to remove ambiguity.

**Conflict axis**
- **Declare war** — set war-state with a faction (Standing → Hostile).
  Declaring war on a faction you hold a pact/non-aggression with **breaks
  that promise** (Honor ding). War-state is what *permits* contesting their
  units/Locations; the **per-attack Menace** is still computed by target
  Temperament (§18.5), so *who* you war matters more than *that* you war.
- **Sue for peace** — a deal carrying a `peace` promise; the AI weighs war
  exhaustion, who's winning, and Standing.
- **Ultimatum** — a *coerced* deal: demand items backed by the threat of
  your military / Menace. The AI weighs caving vs. resisting by the power
  gap and its Temperament; a refused ultimatum typically escalates to war
  or a Standing drop. Accepting yields **tribute**.
- **Denounce** — publicly condemn a faction. Costs nothing material but
  **shifts faction↔faction Standing**: lowers the bloc's Standing toward
  the denounced, raises yours with its enemies, lowers it with its friends.
  A way to take sides and shape the landscape; the inverse of Mediate.

**Exchange axis**
- **Propose deal / gift** — §18.6. Gifts are the main *Standing-buying* and
  recovery-path tool.
- **Trade route** — a `flow` deal; a steady scrap/Research stream that also
  builds Standing while it runs. (Later, routes may require connected/secure
  territory — an Explore/ZoC hook.)
- **Open borders** — an `openBorders` promise letting the other's ZoC/units
  pass your territory **without the threat reading** (§18.5). Mutual or
  one-way; default-on between allies.

**Bloc axis**
- **Pact (alliance)** — **couples** your Standing to theirs: their enemies
  drag your Standing with those enemies down, and fighting their enemy
  *raises* Standing with them. Enables pact calls; open borders by default.
  Forming one requires sufficient Standing **and** passing the other's
  Tolerance/trust gates (§18.5).
- **Pact call** — when an ally goes to war it may **call you in** (delivered
  as a `private` encounter). **Honoring** commits you to war with the target
  (normal per-attack Menace) and *builds* the alliance; **declining** costs
  **significant Standing with that ally and a global Honor ding** — you
  broke your word. This is the recurring alliance dilemma.
- **Mediate** — broker peace between two *other* warring factions. If both
  accept (the AI weighs war exhaustion and your Honor/Standing), you bank
  Standing with both and **gain Honor** (peacemaker reputation). The
  diplomacy player's signature lever.
- **Vassalize** — see §18.9.

### 18.8 AI evaluation, acceptance & coalitions

The load-bearing layer — the verbs above are inert without it. One
valuation engine drives **both** the AI's answers to the player **and** its
own proactive offers and AI-to-AI politics.

**Deal valuation.** An AI assigns a subjective value to each Item (a
resource by current need, a chip by fit, a promise by its goals and the
board) and **accepts when** `value(get) − value(give) + relationshipBias ≥
0`, where `relationshipBias` scales with Standing. The *same* function lets
the AI generate offers it expects to be mutually positive.

**Hard gates (checked before any bias):**
- Won't form a pact or rise to high Standing while your **Menace > its
  Tolerance** or your **Honor < its trust floor**.
- Won't accept a deal whose promises **conflict with existing agreements**
  (can't ally you if you're allied to its sworn enemy) — the landscape
  constrains what is even offerable.

**AI-to-AI diplomacy.** Factions run this same machinery against each other
on a round cadence: forming pacts with compatible Temperaments and shared
enemies, declaring wars per goals/grudges, denouncing, mediating. This is
what makes the board a **living landscape** the player reads and exploits,
not spokes around the human. It writes to faction↔faction Standing and
`state.diplomacy.agreements`.

**Coalitions (the anti-snowball valve).** A **coalition** is a special
multi-faction pact formed *against a leading player*. Per the design
decision, the trigger reads a combined **threat score** with **both**
inputs:
- **Menace pressure** — a high-Menace player collectively sours the bloc
  (earned hostility).
- **Power lead** — a runaway leader by **VP and/or territory/strength**
  threatens everyone *regardless of how cleanly they played*.

`threat(player) = wM·Menace + wP·powerLead` *(weights TBD)*. When a
player's threat crosses a **threshold**, eligible factions (not allied or
vassal to that player, and able to cooperate) **join the coalition**: their
Standing toward the player drops and they are pushed to war the player and
to ally **each other**. The coalition **dissolves** when threat falls
(territory lost, peace made, Menace decayed). Consequences by playstyle:
- **Conquest player:** a rising-difficulty brake — the more you win, the
  more the world unites against you. Pacing + anti-runaway in one.
- **Diplomacy player:** the Menace half is avoidable (play clean), but the
  **power half still bites** — sprinting toward Recognition makes you
  threatening, so you cannot ignore the board even on the peaceful path.
  This is the diplomacy victory's built-in tension (§18.10).

**Faction wants / leverage.** Each faction exposes, from its
Temperament/goals, *what it values*, so the player can read how to court it
— a warlord wants joint wars and targets; a trader wants routes, open
borders, and your Honor; an opportunist backs the current leader and
abandons a faltering one. The diplomacy screen surfaces these as hints so
courtship is **legible**, not guesswork.

### 18.9 Vassalage

A **vassal** is a faction subordinated to a **lord** (player or AI) short of
conquest — the negotiated, peaceful analog of capture, and a formal Standing
sub-state above Allied.

- **Formation.** Offered via a lopsided pact when the would-be vassal is
  weak or cornered (lost a war, surrounded, very low power, no better ally).
  The AI accepts when **subordination beats its alternatives** (annihilation,
  isolation). It can also be a **deal term** ("become my vassal and the war
  ends").
- **Effects while a vassal:**
  - Vassal's Standing toward the lord is **locked high**; it will not attack
    the lord and **cannot ally the lord's enemies**.
  - Lord receives a **tribute `flow`** (scrap/Research per turn) and a
    stronger **pact call** the vassal must usually answer.
  - Vassal **keeps its units, Locations, and identity** — it is *not*
    absorbed (that is what separates vassalage from conquest).
  - The lord's **Menace is not charged** for an accepted vassalization (it
    is submission, not bullying) — though one forced under **ultimatum** may
    carry some Menace *(tune)*.
- **Autonomy & rebellion.** A vassal carries an **autonomy/resentment**
  track. Heavy tribute, lord weakness, an attractive rival, or the lord's
  **Honor abuse / over-extraction** raise resentment; past a threshold the
  vassal **rebels** — breaks free, Standing crashes, and it may immediately
  join a coalition (§18.8).
- **Counts double toward Recognition** (§18.10): a vassal is a stronger
  acknowledgement than an ally.

> **Interaction note.** A vassal will **not** join a coalition against its
> own lord unless it rebels first; and because vassals count double, the
> diplomacy victory often runs *through* converting weak factions into
> vassals rather than courting strong ones into equal alliances.

### 18.10 The diplomacy victory — Recognition (reputation-gated, not peace-gated)

- **Recognition track.** Each faction contributes **Recognition weight** by
  its formal relation to you: **Allied = 1, Vassal = 2** *(weights TBD)*.
  You win when total Recognition crosses a **threshold** *(TBD; e.g. a
  majority of the living factions)* **and**, at the moment of counting, your
  **Menace is under each contributing faction's Tolerance** and your **Honor
  is above its floor**. A faction in coalition against you contributes
  nothing.
- **Not peace-gated.** Justified war is fine — eliminating a radical faction
  can *help* you with the rest. **Bullying peaceful factions (Menace) or
  breaking your word (Honor) is what closes the path**, not fighting itself.
- **Built-in brake.** Because the coalition threat score reads **power lead**
  too (§18.8), racing toward Recognition raises your threat and can provoke
  the very factions you need. So the peaceful path has its own pacing
  tension: keep Menace low, spend Honor and deals to hold allies through the
  surge, and don't grow so dominant the board unites.
- **Conquest (VP 12) remains** the parallel, always-available path; **no
  tech victory** (unchanged from §17.6). The paths stay distinct: diplomacy
  rewards *who and how* you fight and *who recognizes you*; conquest rewards
  raw VP.

### 18.11 Chips & content implications

- The Loyalty ceiling is fixed, so **chips act on rates, not caps**: *slow
  Loyalty decay* and/or *speed Loyalty gain*. The old
  Town-Hall-raises-the-foothold-cap chip is repurposed to a rate chip.
- A new **Influence chip** family raises faction base influence or a
  Location's local influence / range (§18.3).
- **Diplomacy-flavored content** becomes possible: chips/abilities that
  speed Honor recovery, shrink your Menace footprint, boost tribute, or
  accelerate Standing gain; and **Intelligence-path** wheel nodes that feed
  the diplomacy game (intel as a deal Item).
- Encounters may carry **ZoC-gated extra choices** (a `condition` reading
  "recipient's ZoC contains this hex"); **diplomacy proposals and pact calls
  are delivered as `private` encounters** (§18.6).
- The faction characteristic tables (§18.4), the diplomacy-screen content,
  and all numeric constants are authoring tasks for the content pass.

### 18.12 Engine mapping (for implementers — design only, not yet built)

High-level; consistent with §15–§17 patterns. Detailed schemas and the full
effect/event lists are finalized when this leaves the design phase.

**State additions**
- **Location:** replace foothold `F` with **`loyalty` (0–8)**; Control peel
  driven by `loyalty == 0` per Upkeep (§18.2).
- **Player:** add **`menace`** and **`honor`** (both global). Tolerance and
  trust-floor checks are **derived**, not stored.
- **Faction:** authored characteristics (§18.4) on the faction record (no
  longer cosmetic per §6.6).
- **`state.factionStanding`:** extend from player-only (§15.3) to include
  **faction↔faction** rows.
- **`state.diplomacy`** (new): `{ agreements:[], pacts:[], coalitions:[],
  vassals:{ vassalFid: lordId }, threatScores:{}, recognition:{} }`.
- **Influence field:** a recompute pass (sibling to `recomputeStats` /
  `recomputeResearch`) producing per-hex Influence and a derived **ZoC owner
  map** in `state.world`. No dice; runs on control/Loyalty/chip changes.

**Evaluators / cadence**
- **Deal evaluator** — `valueOf(faction, item)` + `wouldAccept(faction,
  deal)`; used by both AI answers and AI offers.
- **AI-to-AI diplomacy + coalition check** — runs once per round (in the
  §15.12 round-rollover sequence): update faction↔faction Standing,
  form/dissolve pacts and wars, recompute `threatScores`, form/dissolve
  coalitions.
- **Menace/Honor updates** — Menace on **contest resolution** (relative to
  target Temperament); Honor on **promise/pact resolution** (kept vs broken).
- **Vassal tick** — resentment update at round-end; rebellion check.
- **Recognition check** — in the win-condition evaluator, gated by the
  Tolerance/Honor conditions of §18.10.
- **Delivery** — incoming AI proposals/pact calls as `private` encounters
  (§15.5); the **diplomacy screen** is the outgoing surface.

**New effects** (additive handlers, §12 style): `PROPOSE_DEAL` /
`RESOLVE_DEAL`, `ADJUST_MENACE`, `ADJUST_HONOR`, `DECLARE_WAR`, `MAKE_PEACE`,
`FORM_PACT` / `BREAK_PACT` / `CALL_PACT`, `DENOUNCE`, `MEDIATE`, `VASSALIZE`
/ `RELEASE_VASSAL`. (`ADJUST_STANDING` from §15.10 is reused for all pairwise
nudges.)

**New events:** `loyalty_changed`, `loyalty_failing` (UI warning),
`control_peeled`, `zone_changed`, `menace_changed`, `honor_changed`,
`deal_struck`, `war_declared`, `peace_made`, `pact_formed` / `pact_called` /
`pact_broken`, `coalition_formed` / `coalition_dissolved`,
`vassal_established` / `vassal_rebelled`, `recognition_changed`.

### 18.13 Open questions / tables to fill

- **Loyalty constants:** start value, rise/decay rates, danger-warning
  threshold, peel cadence at 0.
- **Influence field:** range `R`, distance falloff, Loyalty→local-influence
  scaling, the ZoC dominance threshold, contested-tie handling.
- **Faction tables:** per-faction Temperament, Trustworthiness, Grudge,
  Sociability, Victory lean, Expansion appetite, Coveted targets, and the
  full faction↔faction starting Standing matrix.
- **Menace formula:** how the target-vs-self aggression delta maps to a
  Menace change, and the time/clean-play decay rate.
- **Honor formula:** gain on kept promises, loss magnitudes per break type,
  and whether/how it decays.
- **Tolerance & trust-floor curves:** the `f(Temperament, Standing)` shapes.
- **Deal valuation:** per-Temperament item values and `relationshipBias`
  scaling.
- **Coalition tuning:** the `wM`/`wP` weights and threat threshold, how power
  lead is measured (VP vs territory vs strength), join/leave hysteresis.
- **Vassalage tuning:** tribute rates, resentment drivers, rebellion
  threshold, ultimatum-vassal Menace cost.
- **Recognition:** Allied/Vassal weights, the win threshold (majority of
  living factions?), and the exact counting-moment gate.
- **AI cadence:** how often AI-to-AI diplomacy and offers run; mediation
  acceptance logic.
- **Diplomacy screen:** the interaction surface (propose / accept / decline
  / counter) — its own design pass.

## 19. Exploration, Vision & Fog of War (v0.2+)

New section. Touches §6.1 (the Board is no longer globally visible to all),
§16.6 (adds the ambush lever), §17.5 (gives the Intelligence path its
theme), and §18.3 / §18.6 (ZoC projects vision; intel is a deal good).
**Designed for a map larger than the current test field** — distances,
regions, and line of sight only matter at scale, so nothing here keys off
the 30-hex board. **Numeric values are TBD.**

### 19.0 Terminology

| Term | Means |
|---|---|
| **Fog** | A **per-faction** visibility overlay with three states (§19.2). There is no single global truth any player reads. |
| **Vision** | A source's sight **radius** — now a first-class stat, leverable by chips/tech/terrain. |
| **Line of sight (LoS)** | Whether terrain (elevation/cover) blocks vision between two hexes. |
| **Ghost** | A dimmed **last-known** marker of an enemy unit / state, shown in explored-but-not-visible fog. |
| **Concealment** | A unit hidden *even inside* an enemy's vision (cover or stealth) until a **Detection** source is near. |
| **Detection** | A source's ability to pierce Concealment, at a (usually shorter) range. |
| **Ambush** | A Contest opened by a unit the other side could not see; grants a combat edge (§19.5). |
| **Scout loadout** | A unit kitted via chips for Vision/Movement/Detection rather than Strength — not a unit class. |
| **Intel** | Information as a tradeable / steal-able good (vision, map data); the §18.6 deal Item. |

### 19.1 Design intent

Fog is the **keystone that switches on systems already built**: it gives
the Intelligence tech path (§17.5) a theme (information dominance), makes
the diplomacy `intel` deal Item and shared-ally vision (§18.6) meaningful,
makes terrain a readable puzzle, and turns the encounter system (§15) into
genuine discovery. Four parts: a **layered fog model**, **Vision as a
leverable stat**, a **counter-game** (concealment / ambush / denial), and a
**reward loop** that pulls players into the dark. **The AI plays under the
same fog** — its imperfect information is a feature, not a handicap to be
papered over with vision cheats.

### 19.2 The fog model (supersedes §6.1's global visibility)

Per faction, every hex is in one of three states:

| State | Terrain | Live activity (units, Control, Loyalty, garrison) | Render |
|---|---|---|---|
| **Unexplored** | unknown | unknown | black |
| **Explored** (remembered) | known — **persists once seen** | **last-known snapshot only** | dimmed |
| **Visible** (live) | known | **real-time truth** | full |

The governing rule: **static facts persist, live facts don't.** Once a hex
is seen, its terrain and the *existence* of any Location there is remembered
forever; but unit positions, Control/Loyalty, and garrison strength are
trustworthy **only while the hex is in that faction's `visible` set**.
Leaving vision **snapshots** the last-live state into memory — the source of
the **ghosts** (§19.11). This asymmetry *is* the point of fog: you act on
stale intel about anything you are not currently watching.

### 19.3 Vision — the stat and its sources

**Vision** is a first-class attribute (sibling to Movement): a sight
**radius**, modified by chips, tech, and terrain. A faction's `visible` set
each recompute is the **LoS-limited union** of the radius around every
source it owns:

- **Units** — radius around each unit.
- **Controlled Locations** — radius scaling with tier / Loyalty (a loyal
  core sees farther than a fresh capture).
- **ZoC projects vision** (§18.3) — the influence field contributes sight,
  so presence and visibility share a shape.

> **ZoC ≠ Vision — do not conflate.** ZoC is *influence dominance*
> (territory); Vision is *sight*. ZoC contributes to Vision, but Vision can
> reach **beyond** ZoC (a scout deep in the dark), and a **concealed** enemy
> can sit *inside* your ZoC unseen if you have no Detection source near
> (§19.5). The engine keeps two separate per-faction sets.

### 19.4 Terrain, elevation & line of sight

Fog is what makes terrain matter beyond the §16.6 combat +1. Two new roles:

- **Elevation** — high ground (mountains/hills) **extends** a source's
  effective Vision and **blocks LoS** to lower hexes behind it (ridgelines
  are natural sight-walls). LoS is computed, not just a radius.
- **Cover** — forest/ruins **reduce** Vision through them and **conceal**
  units within them (§19.5).

LoS is deterministic (a standard hex visibility cast; no dice). On the
larger map this turns ridges into watchtowers, forests into infiltration
lanes, and chokepoints into the hexes worth scouting.

### 19.5 Concealment, hidden armies & ambush (adds a term to §16.6)

The counter-game — what makes Intelligence *offensive* and blind aggression
*costly*.

- **Concealment:** a unit in cover terrain or carrying a stealth chip is
  **hidden even inside an enemy's Vision radius** unless that enemy has a
  **Detection** source within (shorter) detection range. Armies can lurk;
  you can mass unseen in a forest.
- **Detection** pierces Concealment: scout loadouts, recon chips, watchtower
  chips, and Intelligence-vision nodes carry it.
- **Ambush — attacker unseen:** when a unit opens a Contest while it was
  **not in the defender's `visible` set** (or was concealed) at declaration,
  it gains an **ambush edge** — the defender **loses its §10 reaction
  window** and a roll penalty applies *(magnitude TBD)*. This adds a term to
  the §16.6 total.
- **Ambush — defender unseen:** symmetrically, a **hidden defender** an
  attacker blunders into (contesting a hex/Location whose true garrison was
  fogged) gets the ambush edge **against the attacker**. This is why
  scouting before committing is a real skill: attacking into fog risks
  walking onto a force you could not size.
- **Movement reveals:** a unit entering an enemy's Vision is revealed for
  that turn; staying concealed means staying out of Detection.

### 19.6 The exploration reward loop

Fog without payoff is chores. The pulls into the dark:

- **Discoveries:** encounter hexes (§15.8) are **hidden until revealed** —
  exploring is how you turn them up. The encounter system is unchanged; only
  its hexes are now fogged.
- **First-discovery edge:** the first faction to sight a Location or special
  site gets claim priority or a one-time reward *(TBD)* — scouting races
  rivals.
- **Special sites:** new map features (resource hexes, ruins) worth finding
  and expanding toward — also the hook for deepening the Exploit pillar.

### 19.7 Scouting as a loadout (not a unit class)

No dedicated scout unit. Scouting is a **composable chip loadout**: a
vision/recon chip raises Vision (and likely Movement) and grants Detection,
trading the bay slot that would have held combat gear. A **Watchtower**
location chip provides static Vision + Detection. This keeps army
composition a decision and avoids a bolt-on unit type. (The chips are
authored later.)

### 19.8 Intelligence tech path — payoff (gives §17.5 branches their theme)

The Intelligence branch nodes — defined in **§17.5**, with the Listening
Post detailed in **§17.7** — realize **information dominance** along two
axes:

- **Entry — Recon:** the existing encounter discard/redraw (unchanged).
- **Vision branch (A1 Watch Network → A2 Listening Post):** passive
  faction-wide sight and Detection (A1), then a deployable hidden eye in the
  field (A2). The sight-projection path.
- **Espionage branch (B1 Spy Ring → B2 Saboteurs):** read normally-hidden
  rival state — each rival's wheel allocation and pairwise Standing with
  third parties (B1) — then act on it covertly — lower a target enemy
  Location's Loyalty by 1, once per round (B2). The covert offence the
  diplomacy player wants.

### 19.9 Diplomacy interlock — shared vision & intel trade

Closes the loop with §18:

- The **`intel` deal Item** (§18.6) delivers either **vision** (temporary
  shared sight of an area) or **mapData** (reveal explored terrain you
  know). Map knowledge is a tradeable good.
- **Allies share vision** as a pact / open-borders perk — alliance literally
  lets you see through a friend's eyes.
- **Espionage steals** what diplomacy would otherwise *trade* — the covert
  route to the same information, without consent and at an Honor/Standing
  risk if exposed.

### 19.10 AI under fog

The AI consumes the **same per-faction visibility API** as the human and
plans on its own fog + memory:

- It scouts, can be ambushed, and can be denied sight — so Detection,
  concealment, and the Intelligence path **work against it**. This is the
  whole reason the pillar pays off.
- Acting on **stale ghosts** (committing to an attack on a force that has
  since moved or grown) is expected AI behavior, not a bug.
- Baseline grants the AI **no vision cheats**. Higher difficulty tiers *may*
  later add decision aids or partial reveal as a tuning knob, but the
  default is fair fog.

### 19.11 Engine mapping (design only, not yet built)

Consistent with §15–§18 patterns; this is the most compute-heavy system, so
it is built for the larger map from the start.

**State**
- Per-faction visibility under **`state.visibility[fid]`**:
  - `explored` — Set of hexes ever seen (**persists**).
  - `visible` — Set currently in live sight (**recomputed**).
  - `memory` — `hex → snapshot` for explored-but-not-visible: terrain
    (static), last-seen Location controller / Loyalty / garrison, and
    **ghosts** `{ unitId, hex, strength, round }` (dimmed; **do not update**
    until re-sighted; may age out *(TBD)*).
- **Vision** as a unit stat + Location/ZoC contribution; **Detection** as a
  separate short-range capability on certain sources.

**Computation**
- A **visibility recompute** per faction = the LoS-limited union of its
  Vision sources. **Incremental** on unit move (dirty the moved unit's
  old/new footprint) rather than full-map each time — the scale guard.
- **LoS** is a deterministic hex cast factoring elevation + cover; no dice.
- On a hex **leaving** `visible`, snapshot its live state into `memory`.
- **Concealment check** (at render *and* at Contest declaration): a unit is
  shown to faction F iff its hex ∈ `F.visible` **and** (it is not concealed
  **or** an F-owned Detection source is in range). Ambush (§19.5) keys off
  this same check.

**Effects / events** (additive): `REVEAL_REGION`, `GRANT_VISION`
(shared/ally), `PLANT_FALSE_INTEL`; events `hex_explored`, `unit_spotted`,
`unit_lost_sight`, `ambush_triggered`.

**Combat:** ambush adds a term to the §16.6 total and suppresses the §10
reaction window for the surprised side.

### 19.12 Open questions / tables to fill

- **Vision radii** (unit base, by Location tier/Loyalty, ZoC contribution)
  and **Detection** ranges.
- **Elevation / cover LoS** rules — how much each blocks or extends.
- **Ambush magnitude** — does it remove the defensive die, or only add a
  roll penalty alongside dropping the reaction window?
- **Ghost aging** — do last-known markers expire, and after how many rounds?
- **First-discovery reward** and **special-site** contents.
- **Scout / watchtower chip** stats.
- **Shared-vision scope** — whole map vs. region; automatic for allies vs.
  opt-in deal.
- **AI fog policy** by difficulty — where, if ever, partial reveal kicks in.
- **Fog-aware pathing** — does a Move **halt on first contact** with a newly
  revealed enemy (interrupt-on-sighting)? Designed later.

## 20. Economy & City Development (v0.2+)

**Supersedes** the Market (§4.1), the **Acquire** action (§8), and the
market-tier gating of §4.1 / §17.2 — all reframed below as local
chip-*building*. Builds on **Loyalty** (§18.2) as the city development
ladder. Where it conflicts with earlier text, §20 wins. **Numeric values
are TBD.**

### 20.1 Design intent

The economy **is** the chip system. With the shared Market gone, chips
become the entire output of your territory: every city is a workshop, and
"developing" a place means **integrating** it (raising Loyalty) so it can
build better gear and hold more of it. This preserves the slot-scarce,
salvage/inherit chip lifecycle (§6.3.3, §16.4) and adds the **tall-vs-wide
investment axis** the flat build system lacked — without a second build
vocabulary (no buildings tree) and without per-chip research gating (your
limited wheel stays a *band* gate, §20.6).

### 20.2 The Market is retired

- Remove the three-row tiered Market, the `marketDeck ×3`, the market churn,
  and the **Acquire** action (§8).
- Chips are no longer drawn from a shared pool; they are **built** at
  Locations you control (§20.4) and **upgraded in place** (§20.5).
- Tech-Level gating **survives**, reframed as build-gating (§20.6).

### 20.3 City Output and the guns/butter slider

- Each controlled Location has an **Output** (a scrap-equivalent per turn):
  its base production (the §6.3 rolled value) **+** yield from installed
  economy chips (**+** an optional Loyalty multiplier — TBD).
- A per-city **build slider** `f ∈ [0,1]`, set by the controller, splits
  Output at each Upkeep:
  - `scrapBank += (1 − f) · Output` — **liquid scrap** to the player's pool.
  - `buildProgress += f · Output` — toward this city's **active build**.
- This is the whole economic decision: build faster *here* vs. bank liquid
  scrap to use *anywhere* (§20.10). The slider persists until changed; the
  AI sets its own.

> **Interaction:** this **replaces the flat production-collection step**
> (`collectProduction`) of the turn loop — a city's scrap income is now the
> butter side of its slider, not a separate flat payout.

### 20.4 Building chips (replaces Acquire)

- Click an **empty slot** → a menu of **buildable chips** (§20.6 governs
  what shows). Selecting one sets the city's `activeBuild`; it consumes the
  city's construction throughput (§20.3) and may be hurried with scrap
  (§20.7).
- A chip carries a **build cost** `B` in the same units as Output. When
  `buildProgress ≥ B` the chip **completes and installs** into the chosen
  slot; overflow carries to the next build.
- **Unit chips** require a **friendly unit stationed at the building
  Location**; on completion the chip installs into **that unit's Bay**
  (cities arm the army). **Location chips** install into the Location's own
  slot.
- **Salvage** (§16.4) remains a *second* source of chips for units in the
  field — building is the primary source, salvage the battlefield one.

### 20.5 Upgrading chips in place

- Click an **installed chip** → its **next upgrade tier**, if any (e.g.
  Lab 1 → Lab 2; the §17 `labs` → `advanced-lab` pair is exactly such a
  chain). Built off the slider like a fresh chip and **replacing in place**
  — same slot, so **scarcity is preserved**.
- Each upgrade tier has its own Tech-Level / Loyalty requirements (§20.6)
  and its own build cost.
- For the capture-destruction rule (§6.3.3), a chip's "newest" timestamp =
  **last built *or* upgraded** (§20.8).

### 20.6 Gating: Tech Level × Loyalty (reframes §4.1 / §17.2)

Two **independent** gates, **both** required, plus a free slot:

- **Tech Level** gates *what exists for you to build at all*: a chip of
  `techLevel` T needs player Tech Level ≥ `{ 1→1, 2→3, 3→5 }[T]` — the same
  §17.2 thresholds, now applied to **building** instead of shopping.
- **Loyalty** gates *what this particular city can build*: rungs on the 0–8
  Loyalty pie (§18.2) unlock successively more advanced chips, and a high
  rung grants the **+1 chip slot**. A fresh capture at low Loyalty builds
  only basics; an integrated city builds the best.

**Display rule (a UI contract — implement exactly):**
- *Build menu* lists **only** chips your **Tech Level** allows. Among those,
  any blocked by **Loyalty** appear **greyed** with the reason (e.g. *needs
  Loyalty 5*). Chips your Tech Level forbids are **not shown at all**.
- *Upgrade view* **always** shows the next tier (so the evolution path is
  visible even early), **greyed** if **either** Tech Level **or** Loyalty is
  short, with the reason.

### 20.7 Rush-building

- A player may spend **banked scrap** to add to (or complete) a city's
  `buildProgress` immediately — the bridge that makes the slider **two-way**:
  hoarded scrap is stored construction potential, dumped when speed matters
  ("I need that fortress chip *this* turn"). *(Rush rate — scrap per
  build-point — and whether a single rush can fully complete a build: TBD.)*

### 20.8 Capture, loss, and Loyalty drops

- **On capture** (§6.3.3, unchanged in spirit): the captor inherits the
  Location's chips **at their current upgrade tier**, minus the **newest**
  (last built/upgraded), which is destroyed.
- **In-progress construction** at capture is **forfeited** (progress lost).
  *(Reasonable default; confirm.)*
- **Loyalty drop below an unlock rung:** already-built chips **stay**, but
  you **cannot build** anything above the current rung until re-integrated.
  If Loyalty falls below the **bonus-slot** rung, the chip occupying that
  slot is **at risk** — ejected/destroyed **newest-first**, mirroring the
  tech-wheel LIFO peel (§17.3).

### 20.9 Chip upkeep (selective, thematic)

- Most chips run free. **Certain powerful chips carry an authored
  `upkeep`** (scrap/turn) — a steady supply their flavor demands (a reactor
  needs fuel). Charged from the controller's scrap at Upkeep.
- **If unpaid** (insufficient scrap), the chip goes **dormant** — the
  `disabled` flag (§12.5) suppresses its passives — and **reactivates** when
  the controller can pay again. It is **not** destroyed.
- This is the **opt-in, content-driven** alternative to blanket empire
  upkeep: the scrap drain scales with how much heavy gear you run, gives
  powerful chips a real ongoing cost, and needs no global bookkeeping tax.

### 20.10 What scrap is for (the liquid half)

Construction is **sticky and local**; **scrap is liquid and global** — its
whole value is that it goes *anywhere*:
- **Army logistics** — Recruit (§16.3), reinforce / heal (§16.5).
- **Diplomacy** — the entire §18 deal economy: gifts, tribute, trade-route
  flows, funding an ally. **The diplomacy victory runs on scrap.**
- **Tempo** — Preparation modifiers (§7), activated abilities / `CONVERT`
  (§12.7), covert ops (§19.8), and **rush-building** (§20.7).
- **Chip upkeep** (§20.9).
- **Narrative sinks** — encounters / quests (§15) may demand or grant scrap.

So the slider **expresses strategy**: a builder leans construction
(permanent local power), a diplomat leans scrap (liquid power to buy the
board and rush Recognition), and a warmonger can't neglect either — the army
needs scrap *and* its gear needs construction.

### 20.11 Engine mapping (design only, not yet built)

- **Location state:** add `output` (derived), `buildSlider` (`f`),
  `buildProgress`, and `activeBuild { kind: build|upgrade, chipId,
  costRemaining, targetSlot, targetUnit? }`.
- **Chip schema:** add `buildCost`, `upgradesTo?` (next-tier chip id),
  `loyaltyReq`, and optional `upkeep` (keep existing `techLevel`).
- **Player state:** `scrap` (was `resource`) unchanged; chip `upkeep` is
  summed and charged at Upkeep, disabling unpaid chips.
- **Remove:** `marketDeck ×3`, the Market-row state, `churnMarket`
  (turn.js), and the Acquire action handler.
- **Turn-loop Upkeep order:** compute `output` → apply slider (bank scrap +
  advance `buildProgress`) → complete any finished build/upgrade → charge
  chip upkeep (disable the unpaid) — this **replaces** `collectProduction`,
  and runs alongside the existing foothold/Loyalty resolution (§18.2).
- **New effects:** `START_BUILD`, `UPGRADE_CHIP`, `RUSH_BUILD`,
  `SET_BUILD_SLIDER`.
- **New events:** `build_started`, `build_completed`, `chip_upgraded`,
  `chip_dormant` / `chip_reactivated`, `slider_changed`.
- **UI contract:** the slot-click build menu and chip-click upgrade view,
  per the §20.6 display rule.

### 20.12 Open questions / tables to fill

- **Output** base and any Loyalty multiplier; per-chip `buildCost`; the
  `loyaltyReq` rungs and which rung grants the **+1 slot**.
- **Rush rate** (scrap per build-point) and whether one rush can fully
  finish a build.
- **Build queue depth** — one active build per city, or a short queue?
- **Chip upkeep** values, which chips carry them, and dormant↔active
  hysteresis.
- **Unit-chip build interrupted** — if the stationed unit leaves mid-build,
  pause or forfeit?
- **Tech-Level *loss*** (the wheel peel, §17.3) vs. already-built
  higher-tier chips — parallel the Loyalty-drop rule, or leave built chips
  safe?
- **In-progress build on capture** — forfeit assumed; confirm.
