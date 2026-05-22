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
- **Stacking vs. replacement** within a branch (does A2 add to A1 or upgrade
  it?) is **deferred** until the branch abilities are written — it may not
  apply to every node.

### 17.5 Entry node abilities (defined)

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

The two branch nodes (A1/A2, B1/B2) of every path are **placeholders** for
now — to be designed in a later pass.

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

### 17.7 Engine mapping (for implementers)

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
