# Encounter & Quest Authoring Guide

> Audience: a person (or a chat-based LLM) authoring encounter/quest content
> as JSON, to be imported into the encounter builder (editor) and tweaked
> there. This is the authoritative, code-verified reference for **what is
> possible** and **how to shape the output**. Everything here was checked
> against the engine (`src/game/`) and the editor (`editor/src/`).
>
> A copy-paste system prompt for a chat instance is at the very end (§13).

---

## 1. How the system fits together

```
  chat instance  ──►  table-grouped JSON  ──►  Editor import  ──►  tweak in builder
   (authoring)          (this format)          (Supabase DB)         (DslBuilder, etc.)
                                                                          │
                                                              export snapshot (.js)
                                                                          ▼
                                                          engine content-loader ──► game
```

- You author **table-grouped JSON** (§2). The editor's importer was built
  for exactly this ("authoring agent output").
- The importer upserts rows into the builder's database. You then open the
  builder to fine-tune wording, conditions, and effects with the visual
  tools.
- The builder exports a content snapshot the engine loads at runtime. The
  engine flattens each effect from `{ type, params:{…} }` to `{ type, …params }`.

You do **not** need to produce the runtime-flattened shape — produce the
import JSON in §2 and let the pipeline do the rest.

---

## 2. The output format you produce

A single JSON object whose top-level keys are **table names**, each an array
of **row objects**. You only include the tables you need.

```json
{
  "world_encounters":   [ … ],
  "field_encounters":   [ … ],
  "quests":             [ … ],
  "quest_beats":        [ … ],
  "quest_beat_prereqs": [ … ],
  "choices":            [ … ],
  "effects":            [ … ]
}
```

### Linking rule (important)

Encounters/beats do **not** embed their choices, and choices do **not** embed
their effects. Instead, **choices and effects are flat rows that point at
their parent** by `parentKind` + `parentId`:

- A **choice** belongs to an encounter or beat:
  `parentKind: "world_encounter" | "field_encounter" | "quest_beat"`,
  `parentId: "<that encounter/beat id>"`.
- An **effect** belongs to a choice or a quest reward:
  `parentKind: "choice" | "quest_claim_reward" | "quest_shared_reward"`,
  `parentId: "<that choice/quest id>"`.
- `ordinal` (int) orders siblings (choices within an encounter; effects
  within a choice). Start at 0.

### JSON columns can be real objects

These columns hold JSON. **Emit them as real nested objects** — the importer
stringifies them for you (do not hand-stringify):

| Table | Object-valued columns |
|---|---|
| `world_encounters` | `triggerCondition`, `triggerStrength`, `placementFilter` |
| `quest_beats` | `deliverCondition`, `placementFilter` |
| `choices` | `condition` |
| `effects` | `paramsJson` (yes, despite the name — pass an object) |

### Unknown columns are rejected

The importer rejects any column not in the allow-list (catches typos). Stick
to the columns documented per table below.

---

## 3. Encounter kinds — fields, requirements, triggering

There are three encounter surfaces plus quests. Pick the right one:

| Kind | Table | How it reaches the player |
|---|---|---|
| **World encounter** | `world_encounters` | Fires from the end-of-round **trigger pipeline** when its `triggerCondition` is true; competes by `triggerStrength × weight`. `private` (one player) or `public` (all). |
| **Field encounter** | `field_encounters` | Seeded into a deck (`copies` per row); **drawn when a unit ends its move on an empty encounter hex.** Always private to that unit's owner. |
| **Placement encounter** | `world_encounters` with `mode:"placement"` | Dropped onto a specific hex by a `PLACE_ENCOUNTER` effect; resolves when a unit reaches it. |
| **Quest** | `quests` + `quest_beats` | A multi-step chain; beats deliver `auto`, on `discovered` (hex landing), or `conditional` (when a DSL predicate becomes true at round end). |

### 3.1 `world_encounters` columns

| Column | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | ✅ | unique |
| `mode` | `"private"` \| `"public"` \| `"placement"` | ✅ | |
| `text` | string | ✅ | player-facing narrative |
| `triggerCondition` | Cond (object) | ✅ | encounter fires only if true (see §5) |
| `triggerStrength` | Strength (object/int) | ✅ | 1–5; scoring weight (see §5.4) |
| `triggerCooldown` | int | — | rounds before it can fire again |
| `recipient` | token | for private | who receives it (see §6) |
| `title` | string | — | blank → prettified id |
| `art` | string | — | art-direction note (text) |
| `imagePath` | string | — | relative image path (3:2) |
| `publicGroupChoice` | bool | — | public mode only |
| `placementFilter` | HexFilter | placement | where it can land (see §8) |
| `expiresIn` | int | — | placement: rounds to live |

### 3.2 `field_encounters` columns

| Column | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | ✅ | unique |
| `text` | string | ✅ | narrative |
| `copies` | int | — (default 1) | how many seed the deck; `0` = never drawn (sub-beat only) |
| `title` | string | — | |
| `art` | string | — | |
| `imagePath` | string | — | |

Field encounters are **always** delivered private to the unit owner; there is
no `mode`/`recipient`/trigger — the hex draw is the trigger.

### 3.3 `quests` + `quest_beats` columns

`quests`: `id` (✅), `mode` (✅: `"single-player"` | `"global"`), `title`.

`quest_beats`:

| Column | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | ✅ | unique |
| `questId` | string | ✅ | parent quest |
| `deliver` | `"auto"` \| `"discovered"` \| `"conditional"` | ✅ | how the beat surfaces |
| `text` | string | ✅ | |
| `ordinal` | int | — | order within quest |
| `deliverCondition` | Cond | for `conditional` | re-checked each round end |
| `placementFilter` | HexFilter | for `discovered` | hex that surfaces the beat |
| `mode` | `"private"` \| `"public"` | — | |
| `recipient` | token | — | |
| `art`, `imagePath` | string | — | |

`quest_beat_prereqs`: rows of `{ beatId, prereqBeatId }` — a beat unlocks only
after its prereq beats are done.

**Quest rewards** are authored as effects with
`parentKind: "quest_claim_reward"` (run for the claimant) or
`"quest_shared_reward"` (run for everyone), and `parentId: "<questId>"`.

### 3.4 `choices` columns

| Column | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | ✅ | unique |
| `parentKind` | string | ✅ | `"world_encounter"` \| `"field_encounter"` \| `"quest_beat"` |
| `parentId` | string | ✅ | the encounter/beat id |
| `label` | string | ✅ | button text (keep < ~30 chars) |
| `ordinal` | int | — | order among the encounter's choices |
| `outcomeText` | string | — | narrative shown after the player picks it |
| `condition` | Cond | — | **hides the choice if false** (see §5) |
| `deferredDelay` | int | — | if set, this choice's whole effect list is wrapped in `QUEUE_DEFERRED` and fires that many rounds later |

### 3.5 `effects` columns

| Column | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | ✅ | unique |
| `parentKind` | string | ✅ | `"choice"` \| `"quest_claim_reward"` \| `"quest_shared_reward"` |
| `parentId` | string | ✅ | parent choice/quest id |
| `type` | string | ✅ | one of the effect types in §4 |
| `paramsJson` | object | ✅ | the effect's params (real object; see §4) |
| `ordinal` | int | — | order within the choice |

---

## 4. Effect palette

Two important facts:

1. **The engine implements 39 effect handlers, but the builder only exposes 23
   as editable.** Author only from the **editor-authorable 23** below — those
   round-trip through the builder. The other 16 (diplomacy + fog-of-war) work
   at runtime but are **not editable in the builder UI** (§4.3); avoid them in
   chat-authored content unless you know what you're doing.
2. Effects nest: `FORCE_CHOICE.options[].effects[]` and
   `QUEUE_DEFERRED.effects[]` contain their own effect lists (using the
   nested `{ type, params }` shape inside `paramsJson`).

### 4.1 Editor-authorable effects (use these)

| `type` | `paramsJson` shape | What it does |
|---|---|---|
| `ADJUST_RESOURCE` | `{ resource: "Resource"\|"VP"\|"Tech", amount: int, target: tok }` | Add/subtract a pool. `Tech`/Research is permanent. VP can win the game. |
| `ADJUST_BASE_STRENGTH` | `{ amount: int, target: tok }` | Wound/heal a unit's HP (base Strength); 0 destroys it. |
| `MODIFY_STAT` | `{ stat: "Strength"\|"Movement", amount: int, duration: dur, target: tok }` | Temporary stat modifier. `dur` ∈ `permanent, until_your_next_turn, this_turn, this_contest`. |
| `GRANT_ACTIONS` | `{ amount: int, when: "this_turn"\|"next_turn", target: tok }` | Give extra actions now or next turn. |
| `SET_FLAG` | `{ flag: string, value: bool, duration: dur, target: tok }` | **Entity** flag on a unit/location/chip. Suggested names: `disabled, exhausted, shielded, marked`. |
| `SET_PLAYER_FLAG` | `{ flag: string, value: any, target: tok, duration?: dur }` | **Player** flag — the memory mechanism across encounters (§7). |
| `ADJUST_TRACK` | `{ track: "trust"\|"reputation"\|"alignment", amount: int, target: tok }` | Move a narrative track (§7). |
| `ADJUST_STANDING` | `{ faction: fid, player: tok, amount: int }` | Change a player's standing with a faction (§7). |
| `FORCE_CHOICE` | `{ chooser: tok, target: tok, options: [{ label, effects:[…] }] }` | Pop a sub-decision; the chosen option's nested effects fire. |
| `QUEUE_DEFERRED` | `{ effects:[…], delayRounds: int, anchor?: "encounter", anchorUnit?: tok, anchorHex?: tok }` | Schedule effects N rounds later. `target` is ignored. **Anchoring** (§9). |
| `TRANSFER` | `{ what: "resource", resource: string, amount: int\|"all"\|"half", from: tok, to: tok }` | Move resource between players. (`what:"card"` not yet implemented.) |
| `CONVERT` | `{ from: string, to: string, rate:{cost:int,gain:int}, max?: int, target: tok }` | Convert one pool into another at a ratio. |
| `PEEK` | `{ deck: zone, count: int, reorder: bool, target: tok }` | Reveal upcoming cards (info effect). |
| `SURCHARGE` | `{ action: string, extraCost?: int, block?: bool, window?: string, target: tok }` | Tax or block an action type for a window. |
| `START_QUEST` | `{ questId: string, claimant: tok }` | Begin a quest for a player (or global). |
| `ADVANCE_QUEST` | `{ questId: string, beatId: string }` | Mark a beat done; auto-completes the quest on the last beat. |
| `COMPLETE_QUEST` | `{ questId: string }` | Finish a quest and pay its rewards. |
| `PLACE_ENCOUNTER` | `{ encounterId: string, hex?: hexId, hexFilter?: HexFilter, expiresIn?: int }` | Drop a placement encounter onto the board. |
| `DELIVER_ENCOUNTER` | `{ encounterId: string, mode?: "private"\|"public", recipient?: tok, condition?: Cond }` | Hand an encounter/sub-beat to a player now; `condition:false` skips silently (other effects still run → success/fallback chains). |
| `MOVE_CARD` | `{ from: zone, to: zone, selector: "top"\|"random"\|"by_id"\|"chosen", count?: int, id?: string }` | Move cards between zones. (`all_matching` selector is UI-only, not in engine yet.) |
| `SPAWN` | `{ source, zone, initialState? }` | **Placeholder — not fully implemented.** Avoid. |
| `REDIRECT` | `{ field: "recipient"\|"target"\|"amount", operation: "set"\|"scale"\|"clamp", value }` | **Reaction-only.** Mutates a pending reaction payload. |
| `CANCEL` | `{ condition?: Cond }` | **Reaction-only.** Cancels a pending reaction. |

`tok` = recipient token (§6). `fid` = faction id (`versari, goldgrass, lakers, plainers`). `dur` = a duration string. `zone` = a zone spec (`encounterDeck`, `reactiveDeck`, `removed`, `hand:<fid>`, `discard:<fid>`, `unitBay:<uid>`, `locationSlots:<locId>`).

### 4.2 Reaction-only effects

`REDIRECT` and `CANCEL` only do something inside a **reaction** window
(reactive cards responding to events). They no-op in normal encounter
choices. Don't use them in ordinary encounter content.

### 4.3 Engine-only effects (NOT builder-editable — avoid in chat authoring)

These run if present but the builder can't render them as editable rows, so
they'll appear blank/un-tweakable after import:
`ADJUST_MENACE`, `ADJUST_HONOR`, `DECLARE_WAR`, `MAKE_PEACE`, `FORM_PACT`,
`BREAK_PACT`, `CALL_PACT`, `DENOUNCE`, `MEDIATE`, `VASSALIZE`,
`RELEASE_VASSAL`, `RESOLVE_DEAL`, `PROPOSE_DEAL` (diplomacy), and
`REVEAL_REGION`, `GRANT_VISION`, `PLANT_FALSE_INTEL` (fog of war).

To change diplomacy from authored content, prefer `ADJUST_STANDING` and
`ADJUST_TRACK`, which are editable.

---

## 5. The condition DSL

Used in `triggerCondition`, `triggerStrength`, choice `condition`, beat
`deliverCondition`, `DELIVER_ENCOUNTER.condition`, and `CANCEL.condition`.
Conditions are **JSON objects**, never bare strings.

### 5.1 Boolean forms

| Form | Returns | Meaning |
|---|---|---|
| `{ all: [Cond, …] }` | bool | AND (empty = true) |
| `{ any: [Cond, …] }` | bool | OR (empty = false) |
| `{ not: Cond }` | bool | NOT |
| `{ op: Op, left: Val, right: Val }` | bool | compare; `Op` ∈ `eq, ne, gt, gte, lt, lte` |
| `{ has_flag: { player: tok, flag: string } }` | bool | player flag is truthy (§7) |
| `{ quest_active: "<questId>" }` | bool | quest is in progress |
| `{ quest_completed: { player: tok, questId: string } }` | bool | player finished it |
| `{ has_chip: { holder, chipId, player?, hex? } }` | bool | a chip is installed; `holder` ∈ `active-player-units, active-player-locations, any-unit-on-hex, any-location-on-hex` |
| `{ zoc_contains: { faction?: tok, hex?: hexId } }` | bool | hex is in a faction's zone of control (engine-only form; not in the builder's condition picker) |
| `true` / `false` | bool | literal |

### 5.2 Integer forms (use as `left`/`right` inside `op`)

| Form | Returns |
|---|---|
| `{ controls_count: { player: tok, strategicValue?: "low"\|"medium"\|"high"\|"veryHigh" } }` | # locations controlled |
| `{ control_duration: { player: tok, hex: hexId } }` | rounds that player has held the hex |
| `{ unit_count: { player: tok, unitType?: string } }` | # units owned |
| `{ unit_on_hex_duration: { unit: uid, hex?: hexId } }` | rounds a specific unit has sat on the hex (0 the round it arrives) |
| `{ unit_on_hex_duration: { player: tok, hex: hexId } }` | longest dwell among that player's units on the hex; `hex` blank → the encounter hex |
| `{ score: { kind, … } }` | a diplomacy scalar (§7); `kind` ∈ `menace, honor, recognition, standing, tolerance, trust_floor` |

`score` parameters by kind: `menace`/`honor`/`recognition` take `player` (or
`faction`); `standing` takes `fromFaction` + `toFaction`; `tolerance` takes
`observer` + `toward`; `trust_floor` takes `observer`.

### 5.3 `Val` and path expressions

A `Val` is: a number, a string literal, a boolean, an **integer-returning
Cond** (above), or a **path expression** — a dotted string read from game
state. Paths resolve **from the state root**. Verified working paths:

| Path | Resolves to |
|---|---|
| `round` | current round int (**not** `state.round`) |
| `players.<pid>.resource` | resource pool |
| `players.<pid>.vp` | victory points |
| `players.<pid>.techLevel` | tech level (**not** `tech`) |
| `players.<pid>.research` | research points |
| `players.<pid>.tracks.trust` / `.reputation` / `.alignment` | track values |
| `world.raidCounts.<fid>` / `world.ignoreCounts.<fid>` | rolling counters |
| `factionStanding.<fromFid>.<toFid>` | standing matrix cell |

Unknown paths resolve to `null`, and any numeric comparison against `null` is
`false`.

### 5.4 Strength expressions (`triggerStrength` only)

Either a bare integer **1–5**, or an `if`-cascade returning 1–5:

```json
{ "if": [
  { "op": "gte", "left": "world.raidCounts.versari", "right": 5 }, 5,
  { "op": "gte", "left": "world.raidCounts.versari", "right": 3 }, 3,
  1
] }
```

Pairs of `(condition, value)` left-to-right, with a trailing fallback. Higher
strength × weight wins the end-of-round competition.

---

## 6. Recipient tokens

Where an effect/condition needs a player or entity. Use the **hyphenated**
content forms (the engine aliases them).

**Simple:** `active`, `random`, `chosen-by-active`, `most-raided`,
`least-engaged`, `claimant`, `triggering-player`, `each`.

**Parameterised** (`template:arg`): `lowest-standing-with:<fid>`,
`highest-standing-with:<fid>`, `controller-of:<hex>`.

**Explicit faction id:** `versari`, `goldgrass`, `lakers`, `plainers`.

Notes: `active` = the player resolving the encounter; `each` = all players
(public mode); omitting a target generally falls back to the source's owner.
Inside `QUEUE_DEFERRED`, an `active` token is snapshotted at queue time so it
still means the original player N rounds later.

---

## 7. Changeable state — flags, tracks, standings, scores

This is the "world memory" you can read and write.

### Player flags (`SET_PLAYER_FLAG` ↔ `has_flag`)
Per-player named values, the primary cross-encounter memory. Write with
`SET_PLAYER_FLAG { flag, value, target }` (default `value:true`,
`duration:"permanent"`); read with `{ has_flag: { player, flag } }`. Use them
to remember choices ("met-the-fixer", "consulted_reader") and gate later
content. Permanent flags persist across rounds and encounters until cleared.

### Entity flags (`SET_FLAG`)
Per-unit/location/chip toggles (`disabled, exhausted, shielded, marked`, or
custom) with a `duration`. Cleared automatically when the duration lapses.

### Narrative tracks (`ADJUST_TRACK`)
Three per-player meters: `trust`, `reputation`, `alignment`. Read via path
`players.<pid>.tracks.<track>`. Use for slow-burn arcs.

### Faction standing (`ADJUST_STANDING`)
The `factionStanding[from][to]` matrix. Adjust a player's standing with a
faction; read via path `factionStanding.<fid>.<pid>` or
`{ score: { kind:"standing", fromFaction, toFaction } }`. Tiers roughly:
hostile ≤ −6, wary ≤ −3, neutral ~0, friendly ≥ 5, allied ≥ 8.

### Diplomacy scores (read via `score`, mostly engine-managed)
- `menace` — aggression reputation (≈0–24); decays each round.
- `honor` — keeping-your-word reputation (≈ −12..12; starts ~4).
- `recognition` — peaceful-victory score (vassals/allies; threshold ~6).
- `tolerance` / `trust_floor` — derived gates other factions apply to you.

You can *read* all of these in conditions to gate content. To *change* them
from authored content, use `ADJUST_STANDING`/`ADJUST_TRACK` (the diplomacy
verbs like `DECLARE_WAR` exist in the engine but aren't builder-editable —
§4.3).

---

## 8. HexFilter (placement & discovery)

A flat object; all keys AND together; `{}` matches any hex.

| Key | Values |
|---|---|
| `type` | `location` \| `encounter` \| `terrain` \| `any` |
| `controlledBy` | pid \| `neutral` \| `any-player` \| `any` |
| `notControlledBy` | pid \| `any-player` |
| `withinHexesOf` | `{ hex, range }` |
| `outsideHexesOf` | `{ hex, range }` |
| `hasChip` / `notHasChip` | chipId |
| `factionAffiliation` | fid \| `unaffiliated` \| `any` |
| `strategicValue` | `low` \| `medium` \| `high` \| `veryHigh` |
| `hasAbility` | abilityId \| `any` \| `none` |
| `terrain` | `mountain` \| `forest` \| `rubble` \| `wetland` \| `any` |
| `hasRoad` | `true` \| `false` |

---

## 9. Stay-on-hex timers (anchored `QUEUE_DEFERRED`)

A normal `QUEUE_DEFERRED` is a blind timer. Set `anchor: "encounter"` to bind
it to the unit that triggered the encounter, standing on the encounter hex:

- It pays out only if that unit is still on that hex when it comes due.
- Moving the unit off the hex **cancels** it immediately (the game warns the
  player before the move, and the warning can't be suppressed).
- If the unit dies/retreats, the round-end sweep discards it unfired.

`anchorUnit` / `anchorHex` can override the bound unit/hex (tokens
`"encounter-unit"` / `"encounter-hex"`, or literal ids). Pair with the
`unit_on_hex_duration` condition if you also want to *gate* something on how
long the unit has waited.

---

## 10. Worked example — a field encounter

A buried cache: dig now, or mark it and wait 3 rounds (anchored — leaving
cancels it), with a follow-up that only appears if you waited.

```json
{
  "field_encounters": [
    {
      "id": "fe_buried_cache",
      "copies": 2,
      "title": "Buried Cache",
      "text": "Something is buried here, hidden within the last season. Whoever stashed it meant to return.",
      "art": "Disturbed earth between two rocks; a corner of weathered metal showing."
    }
  ],
  "choices": [
    {
      "id": "ch_cache_dig",
      "parentKind": "field_encounter", "parentId": "fe_buried_cache",
      "ordinal": 0, "label": "Dig it up",
      "outcomeText": "Tinned food and a coil of copper. Useful."
    },
    {
      "id": "ch_cache_wait",
      "parentKind": "field_encounter", "parentId": "fe_buried_cache",
      "ordinal": 1, "label": "Mark the spot and wait",
      "outcomeText": "You leave a unit to watch the cache."
    },
    {
      "id": "ch_cache_leave",
      "parentKind": "field_encounter", "parentId": "fe_buried_cache",
      "ordinal": 2, "label": "Leave it where it lies"
    }
  ],
  "effects": [
    {
      "id": "ef_cache_dig_res",
      "parentKind": "choice", "parentId": "ch_cache_dig", "ordinal": 0,
      "type": "ADJUST_RESOURCE",
      "paramsJson": { "resource": "Resource", "amount": 2, "target": "active" }
    },
    {
      "id": "ef_cache_wait_queue",
      "parentKind": "choice", "parentId": "ch_cache_wait", "ordinal": 0,
      "type": "QUEUE_DEFERRED",
      "paramsJson": {
        "delayRounds": 3,
        "anchor": "encounter",
        "effects": [
          { "type": "ADJUST_RESOURCE", "params": { "resource": "Resource", "amount": 5, "target": "active" } },
          { "type": "SET_PLAYER_FLAG", "params": { "flag": "held_the_cache", "value": true, "target": "active" } }
        ]
      }
    }
  ]
}
```

Notes illustrated: nested effects live inside `paramsJson.effects` using the
`{ type, params }` shape; `anchor:"encounter"` makes leaving the hex cancel
the timer; the deferred branch sets a flag a later encounter could gate on
with `{ has_flag: { player:"active", flag:"held_the_cache" } }`.

---

## 11. Authoring checklist & gotchas

- **IDs unique** within each table; choices/effects reference parents by
  `parentKind`+`parentId`; set `ordinal` to order siblings.
- **Emit JSON columns as objects** (`triggerCondition`, `condition`,
  `paramsJson`, …); don't pre-stringify.
- **Only author the 23 editor effects** (§4.1). Diplomacy/fog effects (§4.3)
  aren't builder-editable.
- **Paths resolve from the state root:** use `round` (not `state.round`),
  `players.<pid>.techLevel` (not `tech`).
- **`QUEUE_DEFERRED.target` is ignored** — targeting lives on the nested
  effects. Use `anchor` for stay-on-hex behavior.
- **`deferredDelay` (on a choice) vs inline `QUEUE_DEFERRED`:** `deferredDelay`
  wraps the *whole* choice effect list; an inline `QUEUE_DEFERRED` effect
  defers just its own sub-list (and can be anchored). Don't double-wrap.
- **Sub-beats** (encounters reached only via `DELIVER_ENCOUNTER`, never on
  their own): field sub-beat → `copies: 0`; world sub-beat → never seeded
  (`triggerCondition: false`).
- **World encounters need** `triggerCondition` + `triggerStrength`; field
  encounters need only `text` (+`copies`).
- **Conditions hide choices** when false — good for branching, but make sure
  at least one choice is always available, or the encounter dead-ends.

---

## 12. Quick reference — enum values (verbatim)

- **Resource kinds:** `Resource`, `VP`, `Tech`
- **Stats:** `Strength`, `Movement`
- **Durations:** `permanent`, `until_your_next_turn`, `this_turn`, `this_contest`
- **Grant when:** `this_turn`, `next_turn`
- **Entity flags:** `disabled`, `exhausted`, `shielded`, `marked`
- **Tracks:** `trust`, `reputation`, `alignment`
- **Factions:** `versari`, `goldgrass`, `lakers`, `plainers`
- **Encounter modes:** `private`, `public`, `placement`
- **Quest modes:** `single-player`, `global`
- **Beat deliver:** `auto`, `discovered`, `conditional`
- **Ops:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- **Score kinds:** `menace`, `honor`, `recognition`, `standing`, `tolerance`, `trust_floor`
- **Chip holders:** `active-player-units`, `active-player-locations`, `any-unit-on-hex`, `any-location-on-hex`
- **Weight tiers:** normal 1.0, common 2.0, uncommon 0.6, rare 0.3, mythic 0.1

---

## 13. Paste-ready system prompt for a chat authoring instance

> You are a content author for a post-apocalyptic strategy game's encounter
> system. You output **table-grouped JSON** for import into the encounter
> builder. Rules:
>
> 1. Output one JSON object with any of these top-level arrays:
>    `world_encounters, field_encounters, quests, quest_beats,
>    quest_beat_prereqs, choices, effects`.
> 2. Choices are rows linking to their encounter via
>    `parentKind` (`world_encounter`/`field_encounter`/`quest_beat`) +
>    `parentId`. Effects link to a choice via `parentKind:"choice"` +
>    `parentId`, or to a quest reward via `quest_claim_reward` /
>    `quest_shared_reward`. Use `ordinal` (from 0) to order siblings. All ids
>    unique.
> 3. Emit condition/param columns as **real JSON objects**
>    (`triggerCondition`, `triggerStrength`, `condition`, `deliverCondition`,
>    `placementFilter`, `paramsJson`). Never pre-stringify.
> 4. Use ONLY these effect types: ADJUST_RESOURCE, ADJUST_BASE_STRENGTH,
>    MODIFY_STAT, GRANT_ACTIONS, SET_FLAG, SET_PLAYER_FLAG, ADJUST_TRACK,
>    ADJUST_STANDING, FORCE_CHOICE, QUEUE_DEFERRED, TRANSFER, CONVERT, PEEK,
>    SURCHARGE, START_QUEST, ADVANCE_QUEST, COMPLETE_QUEST, PLACE_ENCOUNTER,
>    DELIVER_ENCOUNTER, MOVE_CARD. (Avoid SPAWN, REDIRECT, CANCEL, and all
>    diplomacy/fog verbs.)
> 5. Conditions are JSON: `all/any/not`, `{op,left,right}` with ops
>    `eq,ne,gt,gte,lt,lte`, plus `has_flag, quest_active, quest_completed,
>    controls_count, control_duration, unit_count, unit_on_hex_duration,
>    has_chip, score`. Path Vals read from state root: `round`,
>    `players.<pid>.resource|vp|techLevel|research|tracks.trust`,
>    `world.raidCounts.<fid>`, `factionStanding.<from>.<to>`. `triggerStrength`
>    is 1–5 or an `{if:[cond,val,…,fallback]}` cascade.
> 6. Recipient tokens: `active, random, chosen-by-active, most-raided,
>    least-engaged, claimant, triggering-player, each`;
>    `lowest-standing-with:<fid>`, `controller-of:<hex>`; or a faction id.
> 7. Resource kinds `Resource/VP/Tech`; tracks `trust/reputation/alignment`;
>    factions `versari/goldgrass/lakers/plainers`; durations
>    `permanent/until_your_next_turn/this_turn/this_contest`.
> 8. World encounters require `mode`, `text`, `triggerCondition`,
>    `triggerStrength`. Field encounters require `text` (+`copies`). Player
>    memory across encounters = `SET_PLAYER_FLAG` + `has_flag`. For
>    "leave a unit on this hex for N rounds" use `QUEUE_DEFERRED` with
>    `anchor:"encounter"`. Keep choice `label` under ~30 chars. Always leave
>    at least one unconditional choice.
>
> Ask for the theme/beat you should write, then return only the JSON.
