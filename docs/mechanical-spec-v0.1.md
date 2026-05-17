# Mechanical Specification v0.1

A theme-free description of the game's rules and engine. This document
defines **what the engine does**. It contains no setting, no card names,
no flavor — only mechanical roles. Card stats, effects, and story are
**content** poured into the schemas defined here, and may change without
touching the engine.

> Status: working draft. Supersedes the rules summary in `README.md` for
> all matters of engine architecture. Card content (the old Ashland set)
> is being set aside; this spec is built to receive a new content set.

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
| **Content** | card data records: roles, costs, stats, composed effects, `qty` | mechanical fields only |
| **Presentation** | React UI + the cosmetic strings (`name`, `flavor`, `art`) keyed by card id | all theme lives here |

Hard rule: the engine never branches on a card id. If logic depends on
*which specific card* it is, that logic belongs in content (as composed
effects) — not in the engine. (This replaces the current per-card-id
resolution approach.)

## 3. Resources

Three mechanically distinct categories. The engine treats them
differently; do not conflate them.

| Category | Members (v0.1) | Behavior |
|---|---|---|
| **Pools** | `Resource`, `VP` | Named numeric counters. Spendable / accumulable. Adjusted by `ADJUST_RESOURCE`, moved between players by `TRANSFER`. `VP` is the win track. |
| **Stats** | `Attack`, `Defense` | Static contest scores. **Never spent** — only compared. Derived each turn from a base plus all active modifiers. Changed by `MODIFY_STAT`. |
| **Budget** | `Actions` | Per-turn allowance. Reset every turn to a base; spent on actions; changed by `GRANT_ACTIONS`. |

`Resource` is the single spendable currency in v0.1. The Pools category
is a list so additional currencies can be added as content without an
engine change. `Attack`/`Defense` are mechanical role-names; the
content/presentation layer may rename them for display.

A **win** is triggered immediately when any player's `VP` reaches the
configured threshold.

## 4. Zones

A zone is a named container of cards. Every card is in exactly one zone.

| Zone | Scope | Capacity | Notes |
|---|---|---|---|
| **Tableau** | per-player | limited slots | Holds `Permanent` cards in play. |
| **Anchor** | per-player | 1 | A single special `Permanent` slot (a player's keystone card). |
| **Hand** | per-player | limited | Holds `One-Shot` and `Reactive` cards. Over-capacity forces an immediate `MOVE_CARD` to discard. |
| **Market Row** | shared | fixed face-up count | Acquirable cards. A consumed slot refills from the Market Deck. |
| **Board** | shared | unbounded | Holds `Location` and `Obstacle` cards — the contestable map. |
| **Decks** | shared | — | `marketDeck`, `encounterDeck`, `handDeck`. Draw piles. |
| **Discards** | shared | — | One discard pile per deck. |

Zones are addressed as `zone[/sub-selector]`, e.g. `encounterDeck/top`,
`hand/chosen`, `tableau/chosen`. The selector grammar is defined with
`MOVE_CARD` (§12.4).

Cards may carry `qty`; at game setup each is expanded into `qty` copies,
each with a unique instance id (`uid`). The engine operates on `uid`s.

## 5. Card Roles

Six roles, defined by **mechanical behavior**, not theme. A card's
`role` tells the engine how it enters play, where it lives, and when its
effects fire.

| Role | Enters via | Lives in | Effects fire |
|---|---|---|---|
| **Permanent** | acquired from Market Row | Tableau / Anchor | continuous `passives`; `triggers`; player-invoked `activated` abilities |
| **One-Shot** | held, then played on your turn | Hand → discard | `onResolve`, once, then discarded |
| **Reactive** | held, played out-of-turn on a trigger | Hand → discard | `onResolve`, in a reaction window (§10) |
| **Obstacle** | revealed / spawned | Board | contested by players; `outcomes` granted to the claimant |
| **Event** | revealed from a deck | resolves, then discarded (or persists) | `onResolve` globally; may `SPAWN` a Location |
| **Location** | spawned onto the Board | Board | contestable; `passives` granted to its controller while controlled |

Notes:
- `One-Shot` and `Reactive` differ only in *timing*: One-Shot plays in
  your Main phase for an Action; Reactive plays in a reaction window
  (§10), in or out of your turn.
- A card may declare a `slot` (`tableau` or `anchor`) when its role is
  `Permanent`.
- "Sequenced" cards (completing one reveals the next) are **not** a
  separate role — sequencing is the `SPAWN` / `MOVE_CARD` effect used in
  an `outcome`. Any role can be part of a sequence.

## 6. The Board and Locations

The **Board** is a shared zone. It did not exist in the old settlement-only
model; it is a first-class part of this spec.

**Obstacles** and **Locations** both live on the Board and are both
contestable (§9), but differ:

- An **Obstacle** is claimed *once*. On a successful contest the claimant
  takes one of its `outcomes` and the Obstacle leaves the Board.
- A **Location** is **persistent and ownable**. It spawns *uncontrolled*
  (neutral). A successful contest makes the contestant its **controller**;
  it stays on the Board. A controlled Location may be contested again by
  others (re-capture). While controlled, its `passives` apply to the
  controller.

Location lifecycle:
1. An `Event` resolves and runs a `SPAWN` effect placing a `Location`
   onto the Board, `controller: null`.
2. Players may `Contest` it as an action (§9). The defender value of an
   uncontrolled Location is its base `Defense` (garrison).
3. On a successful contest, `controller` is set to the contestant, the
   contestant takes a declared `outcome`, and the Location remains.
4. A controlled Location can be re-contested; the defender value rule
   when controlled is **deferred** (see §14).

## 7. Turn Structure

Play proceeds in rounds; each round every player takes one turn in
seat order. A turn has four phases:

1. **Upkeep** — emit `turn_started`; reset `Actions` to base; recompute
   `Attack`/`Defense` from base + surviving modifiers; expire modifiers
   whose duration lapsed; run `passives`/`triggers` keyed to upkeep.
2. **Preparation** — the player may spend `Resource` to buy temporary
   stat modifiers for this turn (a `MODIFY_STAT` with duration
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
| **Acquire** | Pay a card's cost; move it from Market Row to your Tableau/Anchor (Permanent) or Hand. Refill the row slot. |
| **Reveal** | Draw the top of the `encounterDeck` and resolve it by role (Event resolves globally; Obstacle/Location move to the Board; One-Shot/Reactive go to Hand). |
| **Contest** | Initiate a contest (§9) against a player, Location, or Obstacle. |
| **Play Card** | Resolve a `One-Shot` from Hand. |
| **Activate** | Invoke an `activated` ability of one of your Permanents. |

Actions are content-tunable: a card may grant extra `Actions`, reduce an
action's cost, or impose a `SURCHARGE`.

## 9. Contests (the unified primitive)

A **contest** is the single mechanic behind raiding a player, resolving a
challenge, and capturing a location. It compares one side's `Attack`
against the other side's effective `Defense`.

A contest has:
- an **initiator** (a player) with an `Attack` score;
- a **target entity** — a player, a Location, or an Obstacle;
- a **defender value** — the target's effective `Defense`:
  - vs a **player**: their current dynamic `Defense`;
  - vs an **Obstacle**: its fixed `Defense` requirement;
  - vs an uncontrolled **Location**: its garrison `Defense`;
  - vs a controlled **Location**: deferred (§14).

Resolution:
1. Initiator declares the target and a desired `outcome` from the
   target's `outcomes` list.
2. Emit `contest_declared` — opens a reaction window (§10).
3. Compare `Attack` vs defender value. **Defender wins ties** (default;
   configurable).
4. **Success** → emit `contest_won`; resolve the declared `outcome`'s
   effects; for a Location, set `controller`; for an Obstacle, remove it
   from the Board.
5. **Failure** → emit `contest_lost`; no outcome.

A target entity carries an `outcomes[]` list (each `{label, effects[]}`)
defining what winning may grant — e.g. steal resource, destroy a card,
take control. The initiator picks one at declaration.

`noReaction` flag: a contest or card may suppress the §10 reaction
window so the defender cannot respond with stat modifiers — their static
score is final.

## 10. Events, Triggers, and the Reaction System

This is the core of "reaction cards" and "steal another player's reward"
and must be designed in from the start — it cannot be bolted on.

### 10.1 The event bus

The engine emits named **events** at well-defined points. An event
carries a **payload**. Effects subscribe via a card's `triggers[]`.

Event taxonomy (v0.1):

```
turn_started        turn_ended         round_ended
resource_gained     resource_spent
stat_modified
card_acquired       card_played        card_revealed
card_entered_zone   card_left_zone
action_spent
contest_declared    contest_won        contest_lost
obstacle_claimed
location_spawned    location_captured
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
   Permanents/Locations in play). Resolve them in **priority order**
   (default: affected/defending player first, then seat order from the
   active player). Each may rewrite payload fields or set `cancelled`.
2. If `cancelled`, stop. Otherwise apply the payload.
3. Emit the event; fire `on` subscribers in priority order.

Eligible Reactive cards may also be *played* during this window for
their cost.

### 10.4 Worked examples

- **Reaction (defensive)** — Reactive card:
  `trigger: contest_declared, mode: on, condition: target == self`,
  `effects: [MODIFY_STAT Defense +3 self this_contest]`.
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
| `controller` | the controller of the card carrying the effect |
| `triggering_player` | the player who caused the current event |
| `active_player` | whoever's turn it is |
| `chosen_opponent` | one opponent the owner picks |
| `random_opponent` | one opponent at random |
| `each_opponent` | all opponents |
| `all_players` | everyone |
| `chosen_card` | a card the owner picks, filtered by a zone selector |
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
Apply a modifier to a static contest score for a duration.
- **params:** `stat` (`Attack` | `Defense`), `amount` (signed), `target`, `duration` (`permanent` | `until_your_next_turn` | `this_turn` | `this_contest`)
- **varies by:** stat, amount, duration, target
- **examples:** the Preparation boost (+1 per 2 `Resource`, `until_your_next_turn`); a Reactive card grants `+3 Defense` `this_contest`; an Obstacle outcome grants a `permanent +1 Attack`; a One-Shot inflicts `-4 Defense` on an opponent until their next turn.

### 12.3 GRANT_ACTIONS
Add to (or subtract from) a player's Action budget.
- **params:** `amount` (signed), `target`, `when` (`this_turn` | `next_turn`)
- **varies by:** amount, target, timing
- **examples:** a Permanent grants `+1 Action` each turn; an Obstacle outcome grants `+2 Actions` now; a card cuts a chosen opponent's budget by `1` next turn.

### 12.4 MOVE_CARD
Relocate a card between zones. This **one** effect is the core logic
behind draw, discard, destroy, recycle, and return — they differ only in
the `from`/`to` pair and selector.
- **params:** `from` (zone), `to` (zone), `selector` (`top` | `chosen` | `random` | `by_id` | `all_matching`), `count`, `filter?`
- **varies by:** the from/to pair, selector, count
- **examples:** draw = `from: encounterDeck top, to: hand`; discard = `from: hand chosen, to: handDiscard`; destroy a Permanent = `from: tableau chosen, to: marketDiscard`; recycle = `from: marketDiscard, to: marketDeck`.

### 12.5 SET_FLAG
Toggle a boolean state flag on a card or entity for a duration.
- **params:** `flag` (`disabled` | `exhausted` | `shielded` | `marked`), `value` (bool), `target`, `duration`
- **varies by:** which flag, target, duration
- **examples:** `disabled` on a Permanent suppresses its passives; `exhausted` on a Location blocks it from being contested again this round; `shielded` on a tableau makes it immune to the next contest.

### 12.6 TRANSFER
Move a resource or a card directly from one player to another. Distinct
from `ADJUST_RESOURCE` because it conserves quantity and has two
endpoints.
- **params:** `what` (`resource` | `card`), `resource`/`selector`, `amount`/`count`, `from`, `to`
- **varies by:** resource vs card, amount (`fixed` | `half` | `all`), endpoints
- **examples:** a contest outcome steals half the defender's `Resource`; a One-Shot takes a random card from an opponent's Hand; a Location passive siphons `1 VP` per round from the lowest-scoring opponent to the controller.

### 12.7 CONVERT
Exchange one resource for another at a fixed rate, up to a cap.
- **params:** `from`, `to`, `rate`, `max`
- **varies by:** resources, rate, cap
- **examples:** an `activated` ability turns `3 Resource` into `1 VP`, max once per turn; a Cleanup trigger converts unspent `Actions` into `Resource`.

### 12.8 SPAWN
Create a card/entity and place it into a zone — the mechanism that puts
Locations on the Board.
- **params:** `source` (deck name or explicit card id), `zone` (usually `board`), `initialState` (e.g. `controller: null`)
- **varies by:** what spawns, destination zone, initial flags/controller
- **examples:** an Event spawns a `Location` onto the Board uncontrolled; a card adds an extra card to the Market Row; a Permanent seeds an Obstacle.

### 12.9 PEEK
Reveal hidden information to a player, optionally allowing a reorder. The
only effect that grants information without changing state.
- **params:** `deck`/`zone`, `count`, `reorder` (bool), `target`
- **varies by:** which zone, count, whether reorder is allowed
- **examples:** look at the top 3 of the `encounterDeck`; view a chosen opponent's Hand; scry — view and reorder the top 2 of the `marketDeck`.

### 12.10 FORCE_CHOICE
Present a player with labeled options; resolve the chosen option's
nested effects. The basis for "do X or Y" cards and branching outcomes.
- **params:** `chooser` (who decides), `target` (who is affected, may equal chooser), `options[]` (each `{label, effects[]}`)
- **varies by:** who chooses, the option set and their nested effects
- **examples:** "chosen opponent: lose `3 Resource` OR discard a card"; a sequenced card offering two reward paths; "the contest initiator: pay `2 Resource` or the contest is cancelled."

### 12.11 SURCHARGE
Impose an extra cost on, or outright block, a target's future action
within a window.
- **params:** `action` (which action type), `extraCost` (`{resource}`/`{action}`) **or** `block: true`, `window` (duration), `target`
- **varies by:** which action, surcharge vs block, window, target
- **examples:** "Contests against you cost the initiator `+2 Resource` until your next turn"; "a chosen opponent's next Acquire costs `+1 Action`"; "no player may Contest this Location for one round" (`block`).

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

## 13. Card Data Schema

Every card is a record of this shape. Mechanical fields only — cosmetic
fields (`name`, `flavor`, `art`) are listed but may be split into a
separate id-keyed content file.

```js
{
  id:        string,          // stable mechanical id
  role:      "Permanent" | "One-Shot" | "Reactive"
           | "Obstacle" | "Event" | "Location",
  slot:      "tableau" | "anchor" | null,   // Permanent only

  // --- cosmetic (separable; no mechanical effect) ---
  name:      string,
  flavor:    string,
  art:       string | null,

  // --- costs & requirements ---
  cost: {
    resource?: number,        // spent to acquire/play
    action?:   number,        // Actions spent (default 1)
    requireAttack?:  number,  // checked, not spent
    requireDefense?: number,
  },

  // --- static contributions (Permanent / Location) ---
  stats: { attack?, defense?, passiveResource?, actions?, vp? },

  // --- composed effects ---
  passives:  [ Effect ],                    // continuous while in play
  triggers:  [ { trigger, mode, condition?, effects: [Effect] } ],
  activated: [ { cost, effects: [Effect] } ],
  onResolve: [ Effect ],                    // One-Shot / Event / Obstacle
  outcomes:  [ { label, effects: [Effect] } ], // contestable entities

  flags:     { noReaction?: boolean, ... },
  qty:       number,          // copies; expanded to uids at setup
}
```

An `Effect` is `{ type, ...params }` as defined in §12. Unused arrays are
omitted. The engine validates that every `type` has a registered handler
and every `trigger` is in the §10.1 taxonomy.

## 14. Deferred / Open Questions

Intentionally unresolved — to be specified before the relevant content
is authored:

- **Controlled-Location defense.** When a controlled Location is
  re-contested, is the defender value its garrison alone, the
  controller's `Defense`, a sum, or a separate stat? (§6, §9)
- **Location passive scope.** Do a Location's `passives` apply only to
  its controller, or also impose effects on non-controllers?
- **Contest of a player while they hold Locations** — does controlling
  Locations change a player's own contest profile?
- **Reaction window priority** when multiple players hold competing
  `replace` subscribers for the same payload — seat order is the v0.1
  default; confirm.
- **Deck composition** per Stage (the old "Age" progression) and how new
  cards enter mid-game.
- Win threshold value, base `Actions`, Tableau/Hand capacities, Market
  Row size — all engine config constants, set during balancing.
