# Mechanical Specification v0.1

A theme-free description of the game's rules and engine. This document
defines **what the engine does**. It contains no setting, no card names,
no flavor — only mechanical roles. Card stats, effects, and story are
**content** poured into the schemas defined here, and may change without
touching the engine.

> Status: working draft. Supersedes the rules summary in `README.md` for
> all matters of engine architecture. Card content (the old Ashland set)
> is being set aside; this spec is built to receive a new content set.
> This revision introduces the spatial hex **Board**, **units**, and the
> **chip / upgrade** system, and collapses combat onto a single `Strength`
> stat.

---

## 1. Purpose

The engine is a **rules interpreter over a content schema**. It knows
mechanical primitives — zones, resources, a turn loop, an event bus, a
fixed vocabulary of effects — and nothing about any particular card.

A "card" is a data record that composes those primitives. "Story" is a
cosmetic layer (`name`, `flavor`, `art`) keyed by card id, separable from
mechanics entirely. Two cards with identical mechanical fields and
different flavor are the same card to the engine.

This separation lets us build and test the engine now, against
mechanical stub cards, and pour real stats + effects + narrative in
later without an engine rewrite.

## 2. Architecture: three layers

| Layer | Holds | Theme? |
|---|---|---|
| **Engine** | zones, turn loop, contest resolver, event bus, effect handlers (one per effect `type`), targeting resolver | none |
| **Content** | card / chip / unit data records: roles, costs, stats, composed effects, `qty` | mechanical fields only |
| **Presentation** | React UI + the cosmetic strings (`name`, `flavor`, `art`) keyed by id | all theme lives here |

Hard rule: the engine never branches on a card id. If logic depends on
*which specific card* it is, that logic belongs in content (as composed
effects) — not in the engine. (This replaces the current per-card-id
resolution approach.)

## 3. Resources and Stats

Mechanically distinct categories. The engine treats them differently; do
not conflate them.

| Category | Members (v0.1) | Behavior |
|---|---|---|
| **Pools** | `Resource`, `VP` | Named numeric counters. Spendable / accumulable. Adjusted by `ADJUST_RESOURCE`, moved between players by `TRANSFER`. `VP` is the win track. |
| **Stats** | `Strength` | The game's single static combat score. Carried by **units** and by **Location garrisons** alike. **Never spent** — only compared in a contest (§9). Derived each turn from a base plus active modifiers. Changed by `MODIFY_STAT`. |
| **Unit attributes** | `Movement` | A unit's Move range, in hexes, for one Move action (§8). Static, never spent; adjustable by `MODIFY_STAT` and chips. |
| **Budget** | `Actions` | Per-turn allowance. Reset every turn to a base; spent on actions; changed by `GRANT_ACTIONS`. |

`Resource` is the single spendable currency in v0.1 (its flavor name is
"scrap"; the mechanical name stays `Resource`). The Pools category is a
list so additional currencies can be added as content without an engine
change.

There is **no player-level combat stat**. The former `Attack`/`Defense`
pair is gone: a *player* is never itself a contest entity — **units** and
**Locations** are. All combat is one side's effective `Strength` against
the other's (§9). `Strength`/`Movement` are mechanical role-names; the
content/presentation layer may rename them for display.

A **win** is triggered immediately when any player's `VP` reaches the
configured threshold.

## 4. Zones

A zone is a named container of cards or chips. Every card/chip is in
exactly one zone.

| Zone | Scope | Capacity | Notes |
|---|---|---|---|
| **Tableau** | per-player | limited slots | Holds `Permanent` cards in play. |
| **Anchor** | per-player | 1 | A single special `Permanent` slot (a player's keystone card). |
| **Hand** | per-player | limited | Holds `One-Shot` and `Reactive` cards. Over-capacity forces an immediate `MOVE_CARD` to discard. |
| **Unit Bay** | per-unit | 2 | Holds `Upgrade` chips installed on that unit. |
| **Location Slots** | per-Location | content-defined | Holds `Upgrade` chips installed on that Location card — including the **Capital** chip. |
| **Market Row** | shared | fixed face-up count | Acquirable cards / chips. A consumed slot refills from the Market Deck. |
| **Board** | shared | unbounded | The spatial hex map (§6.1): nodes carrying Locations, Obstacles, and unit tokens. |
| **Decks** | shared | — | `marketDeck`, `encounterDeck`, `handDeck`. Draw piles. |
| **Discards** | shared | — | One discard pile per deck. |

Zones are addressed as `zone[/sub-selector]`, e.g. `encounterDeck/top`,
`hand/chosen`, `tableau/chosen`. The selector grammar is defined with
`MOVE_CARD` (§12.4).

A **unit** is a board entity, not a card in a zone: its token sits on a
Board node and its stat card sits in the owning player's area (§6.2). Its
Unit Bay is the only zone it owns.

Cards/chips may carry `qty`; at game setup each is expanded into `qty`
copies, each with a unique instance id (`uid`). The engine operates on
`uid`s.

## 5. Roles

Seven roles, defined by **mechanical behavior**, not theme. A record's
`role` tells the engine how it enters play, where it lives, and when its
effects fire.

| Role | Enters via | Lives in | Effects fire |
|---|---|---|---|
| **Permanent** | acquired from Market Row | Tableau / Anchor | continuous `passives`; `triggers`; player-invoked `activated` abilities |
| **One-Shot** | held, then played on your turn | Hand → discard | `onResolve`, once, then discarded |
| **Reactive** | held, played out-of-turn on a trigger | Hand → discard | `onResolve`, in a reaction window (§10) |
| **Upgrade** (chip) | acquired from Market Row, or granted by an `outcome` / Event | a Unit Bay or a Location's Slots | continuous `passives`; `triggers` |
| **Obstacle** | revealed / spawned | Board | contested by units; `outcomes` granted to the claimant |
| **Event** | revealed from a deck | resolves, then discarded (or persists) | `onResolve` globally; may `SPAWN` a Location |
| **Location** | spawned onto the Board | Board | contestable; `passives` granted to its controller while held at full control |

Notes:
- `One-Shot` and `Reactive` differ only in *timing*: One-Shot plays in
  your Main phase for an Action; Reactive plays in a reaction window
  (§10), in or out of your turn.
- An **Upgrade** is a "chip" — a small-format record, mechanically a
  lightweight `Permanent` that occupies a slot rather than a Tableau.
  Its `passives` apply continuously while installed. The **Capital**
  (§6.3.4) is a special predefined Upgrade chip.
- A card may declare a `slot` (`tableau` / `anchor` for `Permanent`;
  `unit` / `location` for `Upgrade`).
- "Sequenced" cards (completing one reveals the next) are **not** a
  separate role — sequencing is the `SPAWN` / `MOVE_CARD` effect used in
  an `outcome`. Any role can be part of a sequence.
- A **unit** is not a role: it is an innate board entity (§6.2), created
  at setup or by a `SPAWN` effect, not acquired from the Market.

## 6. The Board, Units, and Locations

### 6.1 The Board

The **Board** is a shared spatial map: a graph of **hex nodes** joined by
**adjacency edges**. Map size (node count) is a configuration constant —
a smaller map for shorter games, a larger one for longer. Geometry is a
presentation/content concern; the engine sees only nodes and edges.

Each node is one of:
- a **Location** node — carries a contestable, ownable Location (§6.3);
- an **encounter** node — ending a Move there triggers an encounter draw
  (§6.5);
- plain **terrain** — passable, no effect.

Obstacles (§6.4) also occupy nodes. The node layout is fixed at setup;
`SPAWN` effects from Events may still place new Locations/Obstacles onto
eligible nodes mid-game.

### 6.2 Units

Each player owns at least one **unit**. A unit has two physical pieces: a
**token** on a node (its spatial position) and a **stat card** in the
player's area. The stat card carries the unit's attributes — `Strength`,
`Movement` — and a **chip bay** of 2 `Upgrade` slots (the Unit Bay, §4).

- Players begin with **one** unit, placed on their starting Location
  (§6.6).
- Additional units may be created by a `SPAWN` effect — gated by a
  `Resource` cost and requirements set in content, or fired by an Event
  trigger.
- A unit is **never destroyed** in v0.1. The worst that befalls it is a
  forced retreat, a one-turn immobilization, or the loss of a chip (§9).
- A unit moves with the **Move** action (§8) and is the actor in every
  contest (§9). A unit may only contest a target on its own node.

### 6.3 Locations

A **Location** is **persistent and ownable**. Each Location has:
- a garrison **`Strength`** — the base value an attacker must beat;
- a **`passiveResource`** yield — its "scrap" generation;
- a **control meter** — 3 sections plus a central foothold score
  (§6.3.1–6.3.2);
- a **Location card** with content-defined `Upgrade` **slots**; the card
  physically sits with the Location's current controller (in their area,
  near their units), or in a neutral board area when uncontrolled;
- a `passives` list applied to the controller — **only while that
  controller holds full control**.

It spawns *uncontrolled* (all sections neutral). Obstacles, by contrast,
are claimed once and leave the Board (§6.4).

#### 6.3.1 The control meter

The meter is a ring of **3 sections**; each section is owned by
**neutral** or by a **player**. A player has **full control** of a
Location when they own all 3 sections — only then do its `passives`
apply and only then does it yield `VP` / `passiveResource` to them.

A **contest victory** (§9) flips exactly one section to the victor:
- if any **neutral (garrison)** sections remain → flip a neutral section;
- once **no neutral sections remain** → flip a **rival-held** section,
  taken from the rival holding the most sections (ties broken by the
  victor's choice).

This single rule produces the "garrison first" behavior: while any
neutral section stands, every contest is forced onto the garrison — so
two units at the same neutral Location necessarily reduce the garrison
before either can take ground from the other.

#### 6.3.2 Foothold and decay

The meter's centre holds a signed **foothold score `F`** — the
controller's grip on the Location.

- `F` activates when a player reaches full control; it starts at `0`.
- At that controller's Upkeep (§7): if their unit's token is on the
  Location's node, `F += 1` (capped at `+3`); if it is not, `F -= 1`.
- When `F` would drop **below 0** (reaches `-1`): one of the controller's
  sections flips to **neutral** and `F` resets to `0`. The first such
  flip drops the player below full control (they lose the `passives` and
  yield); decay continues each absent Upkeep, flipping a further section
  per `-1`, until the Location is fully neutral.
- Bringing the unit back onto the node halts the `-1` ticking; the player
  rebuilds by contesting (§9).
- `F` resets to `0` whenever full control changes hands.
- **Exception:** a Location carrying a **Capital** chip (§6.3.4) never
  decays — its `F` is inert.

Pure contested partial progress does **not** decay: if sections are
split between players and no one has ever held full control, the meter
is static until the next contest. Decay is exclusively the failing-grip
process above — born only from a fully-controlled Location losing its
garrisoning unit.

The `+3` cap is a placeholder constant (§14).

#### 6.3.3 Chips on a Location

A Location card has content-defined `Upgrade` **slots**. A player who
holds the Location may install chips into empty slots — purchased via
the Acquire action, or granted by an `outcome` / Event.

When **full control transfers** to a new player, the Location card moves
to them carrying its chips, **except the most recently installed chip,
which is destroyed** — removed from the game, not returned to its
purchaser. The new controller inherits the remainder.

#### 6.3.4 The Capital

A **Capital** is a special `Upgrade` chip, one per player:
- it occupies a slot on a Location card;
- the Location it sits on **cannot decay** (§6.3.2) and gains a small
  bonus to its garrison `Strength` and `passiveResource`;
- each player begins with their Capital installed on their starting
  Location (§6.6);
- if that Location's full control is taken by an opponent, the Capital
  chip is **removed from the board** — it is not inherited like an
  ordinary chip — and the hex thereafter behaves as any other capturable
  Location. Re-establishing a lost Capital is an open item (§14).

### 6.4 Obstacles

An **Obstacle** occupies a node and is claimed **once**. A unit on its
node contests it (§9); on a successful contest the claimant takes one of
its `outcomes` and the Obstacle leaves the Board.

### 6.5 Encounter nodes

When a unit **ends a Move** on an encounter node — merely passing through
with surplus `Movement` does not count — its player draws the top card of
the `encounterDeck` and resolves it by role (an Event resolves globally;
an Obstacle/Location is placed; a One-Shot/Reactive goes to Hand). The
node is then **spent** and becomes plain terrain.

Drawing live from the deck on arrival — rather than from a face-down
token pre-placed at setup — keeps encounters unpredictable between games.

### 6.6 Starting position

Players start at opposite ends of the map, each already in **full
control** of one **starting Location** tied to their chosen faction,
with their **Capital** chip installed on it and their first unit's token
on its node.

## 7. Turn Structure

Play proceeds in rounds; each round every player takes one turn in
seat order. A turn has four phases:

1. **Upkeep** — emit `turn_started`; reset `Actions` to base; recompute
   `Strength`/`Movement` from base + surviving modifiers; expire
   modifiers whose duration lapsed; **resolve foothold (§6.3.2) for each
   Location this player controls** — `+1`/`-1` by unit presence, applying
   any resulting section decay; run `passives`/`triggers` keyed to
   upkeep.
2. **Preparation** — the player may spend `Resource` to buy temporary
   modifiers on one of their **units** (a `MODIFY_STAT` with duration
   `until_your_next_turn`). Optional.
3. **Main** — the player spends `Actions` on actions (§8) in any order.
4. **Cleanup** — run cleanup `triggers`; enforce Hand capacity; emit
   `turn_ended`. After the last seat, emit `round_ended` and run
   round-end effects (e.g. Market Row refresh).

Reaction windows (§10) can interrupt at defined points regardless of
whose turn it is.

## 8. Actions

During the Main phase, each action costs `Actions` from the budget
(default 1 unless the action or a card says otherwise). The action set:

| Action | Effect |
|---|---|
| **Move** | Move one of your units up to its `Movement` in hexes along adjacency edges (default `Movement` 1; chips/effects may raise it). Ending on an encounter node triggers §6.5. |
| **Acquire** | Pay a card's cost; move it from Market Row to its destination — a `Permanent` to your Tableau/Anchor, an `Upgrade` chip to a unit's Bay or a Location you control, a `One-Shot`/`Reactive` to your Hand. Refill the row slot. |
| **Reveal** | Draw the top of the `encounterDeck` and resolve it by role, on demand. (Encounter nodes, §6.5, are the primary encounter trigger; this action is the on-demand alternative.) |
| **Contest** | With one of your units, contest the Location or Obstacle at that unit's node, or raid an enemy unit sharing the node (§9). |
| **Play Card** | Resolve a `One-Shot` from Hand. |
| **Activate** | Invoke an `activated` ability of one of your Permanents. |

Actions are content-tunable: a card may grant extra `Actions`, reduce an
action's cost, or impose a `SURCHARGE`.

## 9. Contests (the unified primitive)

A **contest** compares one unit's effective `Strength` against a
**defender value**. It is the single mechanic behind capturing
Locations, claiming Obstacles, and raiding units.

A contest has:
- an **initiator** — one of the active player's units, with an effective
  `Strength`;
- a **target** on the initiator's node — a Location, an Obstacle, or an
  enemy unit;
- a **defender value**:
  - **Location, neutral sections remaining** → the garrison `Strength` +
    the Location's defensive chips;
  - **Location, held — defending unit on the node** → garrison `Strength`
    + the defending unit's `Strength` + chips;
  - **Location, held — no defending unit on the node** → garrison
    `Strength` + chips only;
  - **Obstacle** → its fixed `Strength` requirement;
  - **enemy unit (raid)** → that unit's effective `Strength` + its chips.

Resolution:
1. The initiator declares the target. Emit `contest_declared` — opens a
   reaction window (§10).
2. Compare initiator `Strength` vs defender value. **Defender wins ties**
   (default; configurable).
3. **Success:**
   - **Location** → flip one section by the §6.3.1 rule; emit
     `section_flipped`. If this completes full control, set `controller`,
     move the Location card to the new controller and destroy its newest
     chip (§6.3.3), emit `location_captured`.
   - **Obstacle** → the claimant resolves one declared `outcome`; remove
     the Obstacle from the Board; emit `obstacle_claimed`.
   - **Raid** → the defending unit is forced to **retreat** to an
     adjacent **non-hostile** node chosen by the winner (a node not
     controlled by anyone hostile to the retreating unit, and not a
     neutral node with an intact garrison; if no such node exists, the
     retreat is skipped). The winner then takes **one**: immobilize the
     retreating unit through its next turn, **or** destroy one of that
     unit's chips.
4. **Failure** → emit `contest_lost`; the Action is spent, nothing else.

Restrictions:
- A unit may only contest a target on **its own node**.
- While a Location still holds **neutral** sections, units there may only
  contest the garrison — they cannot raid one another until the garrison
  is gone (a direct consequence of §6.3.1).
- `noReaction` flag: a contest or card may suppress the §10 reaction
  window so the defender cannot respond with stat modifiers — their
  static score is final.

An **Obstacle** carries an `outcomes[]` list (each `{label, effects[]}`)
defining what claiming it may grant; the initiator picks one at
declaration. Location section-flips and raid results are **standardized**
resolutions and need no `outcomes` authoring.

## 10. Events, Triggers, and the Reaction System

This is the core of "reaction cards" and "steal another player's reward"
and must be designed in from the start — it cannot be bolted on.

### 10.1 The event bus

The engine emits named **events** at well-defined points. An event
carries a **payload**. Effects subscribe via a record's `triggers[]`.

Event taxonomy (v0.1):

```
turn_started        turn_ended         round_ended
resource_gained     resource_spent
stat_modified
card_acquired       card_played        card_revealed
card_entered_zone   card_left_zone
action_spent
unit_moved          unit_spawned       unit_retreated
contest_declared    contest_won        contest_lost
obstacle_claimed
location_spawned    section_flipped    location_captured
location_decayed
reward_granted
```

### 10.2 Two subscription modes

A trigger subscription declares a `mode`:

- **`on` (triggered)** — fires *after* the event resolves. Appends new
  effects. Cannot un-happen the event. Example: "after an opponent
  reveals an Event, draw a card."
- **`replace` (replacement)** — fires *before* the event resolves,
  inside a reaction window. Receives the **mutable payload** and may
  rewrite its fields or cancel it. Example: "steal another player's
  reward" — rewrite the payload's `recipient`.

These are genuinely different. A triggered effect *adds*; a replacement
effect *changes what is about to happen*. The "steal the reward" card is
not a post-hoc bonus — it reassigns the payload before it lands. So a
pending action must carry a payload object that replacement subscribers
can transform.

### 10.3 Pending action and the reaction window

Before any stateful change resolves, the engine builds a **pending
action**:

```
{ type, source, recipient, target, amount, cancelled: false }
```

The window then runs:
1. Collect eligible `replace` subscribers (from Reactive cards in hand,
   Permanents/Upgrades/Locations in play). Resolve them in **priority
   order** (default: affected/defending player first, then seat order
   from the active player). Each may rewrite payload fields or set
   `cancelled`.
2. If `cancelled`, stop. Otherwise apply the payload.
3. Emit the event; fire `on` subscribers in priority order.

Eligible Reactive cards may also be *played* during this window for
their cost.

### 10.4 Worked examples

- **Reaction (defensive)** — Reactive card:
  `trigger: contest_declared, mode: on, condition: defender owned by self`,
  `effects: [MODIFY_STAT Strength +3 defending_unit this_contest]`.
- **Steal a reward** — Permanent/Reactive:
  `trigger: reward_granted, mode: replace, condition: recipient is opponent`,
  `effects: [REDIRECT field=recipient op=set value=self]`.
- **Negate an Event** — Reactive:
  `trigger: card_revealed, mode: replace, condition: revealed.role == Event`,
  `effects: [CANCEL]`.

## 11. Targeting

Every effect declares a `target`. The engine's targeting resolver maps a
target token to one or more entities:

| Token | Resolves to |
|---|---|
| `self` | the effect's owner |
| `controller` | the controller of the card/chip carrying the effect |
| `triggering_player` | the player who caused the current event |
| `active_player` | whoever's turn it is |
| `chosen_opponent` | one opponent the owner picks |
| `random_opponent` | one opponent at random |
| `each_opponent` | all opponents |
| `all_players` | everyone |
| `chosen_card` | a card the owner picks, filtered by a zone selector |
| `chosen_unit` | a unit the owner picks |
| `defending_unit` | the defending unit in the current contest |
| `entity` | the Location/Obstacle in the current contest |

Effects that hit multiple players apply independently to each.

## 12. The Effect Library

An **effect** is `{ type, ...params }`. The engine has exactly one
handler per `type`. A card composes effects in ordered lists
(`passives`, `onResolve`, `triggers[].effects`, `activated[].effects`,
`outcomes[].effects`, `FORCE_CHOICE` options).

The library is deliberately small. The same effect serves many cards —
only the parameters (degree, target, duration, resource) vary. Below,
"varies by" names the parameters content tunes; examples are
hypothetical and theme-free.

### 12.1 ADJUST_RESOURCE
Change a pool counter by a signed amount.
- **params:** `resource` (`Resource` | `VP`), `amount` (signed int or formula), `target`
- **varies by:** resource, amount, target scope, sign
- **examples:** a Permanent passive grants `+2 Resource` to its controller each Upkeep; a One-Shot does `-3 Resource` to a chosen opponent; an Obstacle outcome grants `+4 VP` to the claimant.

### 12.2 MODIFY_STAT
Apply a modifier to a unit's static score for a duration.
- **params:** `stat` (`Strength` | `Movement`), `amount` (signed), `target` (a unit), `duration` (`permanent` | `until_your_next_turn` | `this_turn` | `this_contest`)
- **varies by:** stat, amount, duration, target
- **examples:** the Preparation boost (+1 `Strength` per 2 `Resource`, `until_your_next_turn`); a Reactive card grants `+3 Strength` `this_contest`; a chip grants a `permanent +1 Movement`; a One-Shot inflicts `-4 Strength` on an opponent's unit until their next turn.

### 12.3 GRANT_ACTIONS
Add to (or subtract from) a player's Action budget.
- **params:** `amount` (signed), `target`, `when` (`this_turn` | `next_turn`)
- **varies by:** amount, target, timing
- **examples:** a Permanent grants `+1 Action` each turn; an Obstacle outcome grants `+2 Actions` now; a card cuts a chosen opponent's budget by `1` next turn.

### 12.4 MOVE_CARD
Relocate a card/chip between zones. This **one** effect is the core logic
behind draw, discard, destroy, recycle, and return — they differ only in
the `from`/`to` pair and selector.
- **params:** `from` (zone), `to` (zone), `selector` (`top` | `chosen` | `random` | `by_id` | `all_matching`), `count`, `filter?`
- **varies by:** the from/to pair, selector, count
- **examples:** draw = `from: encounterDeck top, to: hand`; discard = `from: hand chosen, to: handDiscard`; destroy a Permanent = `from: tableau chosen, to: marketDiscard`; destroy a chip = `from: unitBay chosen, to: removed`; recycle = `from: marketDiscard, to: marketDeck`.

### 12.5 SET_FLAG
Toggle a boolean state flag on a card or entity for a duration.
- **params:** `flag` (`disabled` | `exhausted` | `shielded` | `marked` | `immobilized`), `value` (bool), `target`, `duration`
- **varies by:** which flag, target, duration
- **examples:** `disabled` on a Permanent suppresses its passives; `exhausted` on a Location blocks it from being contested again this round; `shielded` on a tableau makes it immune to the next contest; `immobilized` on a unit blocks its Move action for a duration.

### 12.6 TRANSFER
Move a resource or a card directly from one player to another. Distinct
from `ADJUST_RESOURCE` because it conserves quantity and has two
endpoints.
- **params:** `what` (`resource` | `card`), `resource`/`selector`, `amount`/`count`, `from`, `to`
- **varies by:** resource vs card, amount (`fixed` | `half` | `all`), endpoints
- **examples:** a raid outcome steals half the defender's `Resource`; a One-Shot takes a random card from an opponent's Hand; a Location passive siphons `1 VP` per round from the lowest-scoring opponent to the controller.

### 12.7 CONVERT
Exchange one resource for another at a fixed rate, up to a cap.
- **params:** `from`, `to`, `rate`, `max`
- **varies by:** resources, rate, cap
- **examples:** an `activated` ability turns `3 Resource` into `1 VP`, max once per turn; a Cleanup trigger converts unspent `Actions` into `Resource`.

### 12.8 SPAWN
Create a card/entity and place it into a zone or onto the Board — the
mechanism that puts Locations on the Board and extra units into play.
- **params:** `source` (deck name or explicit id), `zone` (`board` node, etc.), `initialState` (e.g. `controller: null`, owning player, node)
- **varies by:** what spawns, destination, initial flags/owner/controller
- **examples:** an Event spawns a `Location` onto the Board uncontrolled; a card adds an extra card to the Market Row; an `activated` ability spawns an extra **unit** for its owner (gated by a `Resource` cost and requirements).

### 12.9 PEEK
Reveal hidden information to a player, optionally allowing a reorder. The
only effect that grants information without changing state.
- **params:** `deck`/`zone`, `count`, `reorder` (bool), `target`
- **varies by:** which zone, count, whether reorder is allowed
- **examples:** look at the top 3 of the `encounterDeck`; view a chosen opponent's Hand; scry — view and reorder the top 2 of the `marketDeck`.

### 12.10 FORCE_CHOICE
Present a player with labeled options; resolve the chosen option's
nested effects. The basis for "do X or Y" cards, branching outcomes, and
the raid winner's choice (§9).
- **params:** `chooser` (who decides), `target` (who is affected, may equal chooser), `options[]` (each `{label, effects[]}`)
- **varies by:** who chooses, the option set and their nested effects
- **examples:** the raid winner chooses "immobilize the loser" OR "destroy one of the loser's chips"; "chosen opponent: lose `3 Resource` OR discard a card"; "the contest initiator: pay `2 Resource` or the contest is cancelled."

### 12.11 SURCHARGE
Impose an extra cost on, or outright block, a target's future action
within a window.
- **params:** `action` (which action type), `extraCost` (`{resource}`/`{action}`) **or** `block: true`, `window` (duration), `target`
- **varies by:** which action, surcharge vs block, window, target
- **examples:** "Contests against you cost the initiator `+2 Resource` until your next turn"; "a chosen opponent's next Acquire costs `+1 Action`"; "no unit may contest this Location for one round" (`block`).

### 12.12 REDIRECT  *(replacement mode)*
Inside a reaction window, rewrite a field of the pending action's
payload.
- **params:** `field` (`recipient` | `target` | `amount`), `operation` (`set` | `scale` | `clamp`), `value`
- **varies by:** which field, operation, value, the event subscribed to
- **examples:** steal a reward — on `reward_granted`, `field: recipient, op: set, value: self`; soften an incoming debuff — on `stat_modified` vs self, `field: amount, op: scale, value: 0.5`; cap an opponent's resource gain — `field: amount, op: clamp, value: 2`.

### 12.13 CANCEL  *(replacement mode)*
Inside a reaction window, void the pending action entirely.
- **params:** optional `condition`; the event it attaches to is on the trigger
- **varies by:** what it cancels, conditions
- **examples:** negate a revealed Event; cancel a contest declared against you; nullify an opponent's One-Shot card.

### Effect classes summary
- **State-change:** ADJUST_RESOURCE, MODIFY_STAT, GRANT_ACTIONS, MOVE_CARD, SET_FLAG, TRANSFER, CONVERT, SPAWN
- **Information / interactive:** PEEK, FORCE_CHOICE, SURCHARGE
- **Replacement (reaction window only):** REDIRECT, CANCEL

## 13. Data Schemas

### 13.1 Card / chip schema

Every card and chip is a record of this shape. Mechanical fields only —
cosmetic fields (`name`, `flavor`, `art`) are listed but may be split
into a separate id-keyed content file.

```js
{
  id:        string,          // stable mechanical id
  role:      "Permanent" | "One-Shot" | "Reactive" | "Upgrade"
           | "Obstacle" | "Event" | "Location",
  slot:      "tableau" | "anchor" | "unit" | "location" | null,

  // --- cosmetic (separable; no mechanical effect) ---
  name:      string,
  flavor:    string,
  art:       string | null,

  // --- costs & requirements ---
  cost: {
    resource?: number,        // spent to acquire/play
    action?:   number,        // Actions spent (default 1)
    requireStrength?: number, // checked, not spent
  },

  // --- static contributions ---
  stats: {
    strength?,                // unit Strength, or a Location's garrison
    movement?,                // unit Move range
    passiveResource?,         // per-turn yield (Location / Permanent)
    actions?, vp?,
    chipSlots?,               // Location: number of Upgrade slots
  },

  // --- composed effects ---
  passives:  [ Effect ],                    // continuous while in play
  triggers:  [ { trigger, mode, condition?, effects: [Effect] } ],
  activated: [ { cost, effects: [Effect] } ],
  onResolve: [ Effect ],                    // One-Shot / Event / Obstacle
  outcomes:  [ { label, effects: [Effect] } ], // Obstacles

  flags:     { noReaction?: boolean, ... },
  qty:       number,          // copies; expanded to uids at setup
}
```

An `Effect` is `{ type, ...params }` as defined in §12. Unused arrays are
omitted. The engine validates that every `type` has a registered handler
and every `trigger` is in the §10.1 taxonomy.

### 13.2 Unit definition

A unit's base profile is content (faction-keyed at setup):

```js
{
  id:       string,
  baseStrength: number,
  baseMovement: number,
  bayslots: 2,
}
```

### 13.3 Runtime entity state

Not authored — held by the engine during play:

- **Unit:** `{ owner, node, strength, movement, chips[≤2], immobilizedUntil }`
- **Location:** `{ controller | null, sections[3] (neutral | playerId),
  foothold F, chips[≤chipSlots], node }`

## 14. Deferred / Open Questions

Intentionally unresolved — to be specified before the relevant content
is authored:

- **Capital re-establishment.** The cost and/or trigger by which a player
  rebuilds a Capital lost to capture (§6.3.4).
- **Stage progression** (the old "Age" progression) — deck composition
  per Stage and how new cards/chips enter the Market mid-game.
- **Multi-player raid edge case.** When two units sit on a *third*
  player's controlled Location, may they raid each other, or only
  contest the controller? (§9)
- **Reaction window priority** when multiple players hold competing
  `replace` subscribers for the same payload — seat order is the v0.1
  default; confirm. (§10.3)
- **`Reveal` action.** Whether the on-demand `Reveal` action (§8) is
  retained now that encounter nodes (§6.5) are the primary encounter
  trigger.
- **Faction definitions.** Starting-Location stats and any per-faction
  abilities — content / design-doc layer (§6.6).
- **Balancing constants** — win threshold; base `Actions`; the foothold
  cap (`+3` placeholder); map size range and node-type ratios;
  Tableau/Hand/Market sizes; unit base `Strength`/`Movement`; Location
  chip-slot counts; unit `SPAWN` cost and requirements.
