# Content Schema v0.1

The stable contract between the coding agent (engine) and the editor
agent (content tooling). Defines the storage tables, the locked effect
type list, the recipient token vocabulary, the HexFilter syntax, and the
condition DSL used by the encounter and quest system (mechanical spec
§15).

Source of truth for both agents — neither makes independent assumptions
about these shapes. Extensions go through a coding-agent change that
revises this document.

---

## 1. Storage tables

Seven tables. Encounter content is **inlined into its parent** (no
shared `encounters` table) — the three "encounter-bearing" entities are
`world_encounters`, `field_encounters`, and `quest_beats`. SQLite-shaped;
a build step exports the DB to engine-consumable JS.

### `world_encounters`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `mode` | TEXT | `'private' \| 'public' \| 'placement'` |
| `recipient` | TEXT | recipient token (§3); nullable for `placement` |
| `title` | TEXT | nullable; story display title. Blank falls back to a prettified id at export. Stored on the head; sub-beats inherit it. |
| `expiresIn` | INT | nullable; `placement` mode only |
| `publicGroupChoice` | INT | 0/1; `public` mode only |
| `art` | TEXT | nullable; free-text art-direction notes |
| `imagePath` | TEXT | nullable; relative repo path to a JPEG (3:2). Engine fades the rightmost third on display. |
| `text` | TEXT | |
| `triggerCondition` | TEXT | DSL JSON (§5) |
| `triggerStrength` | TEXT | DSL JSON returning 1–5 |
| `triggerCooldown` | INT | rounds before re-fireable |
| `triggerWeight` | NUMERIC | rarity multiplier on strength; default 1.0; tier picker exposes Common 2.0 / Normal 1.0 / Uncommon 0.6 / Rare 0.3 / Mythic 0.1. End-of-round trigger pipeline scores `strength × weight`. |
| `placementFilter` | TEXT | HexFilter JSON (§4); nullable; `placement` mode only |

The engine derives its trigger registry from this table — one trigger
per row, wrapping `(condition, strength, cooldown, encounter)`. The
editor does not author triggers separately.

### `field_encounters`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT | nullable; story display title. Blank falls back to a prettified id at export. Stored on the head; sub-beats inherit it. |
| `copies` | INT | how many seed the deck |
| `art` | TEXT | nullable; free-text art-direction notes |
| `imagePath` | TEXT | nullable; relative repo path to a JPEG (3:2). Engine fades the rightmost third on display. |
| `text` | TEXT | |

Field encounters are always delivered in `private` mode to the unit's
owner; no recipient/mode columns needed.

### `quests`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `mode` | TEXT | `'single-player' \| 'global'` |
| `title` | TEXT | editor display label; nullable |

### `quest_beats`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `questId` | TEXT FK | references `quests.id` |
| `ordinal` | INT | position within the quest |
| `deliver` | TEXT | `'auto' \| 'discovered' \| 'conditional'` |
| `deliverCondition` | TEXT | DSL JSON; required for `'conditional'` |
| `placementFilter` | TEXT | HexFilter JSON; required for `'discovered'` |
| `mode` | TEXT | `'private' \| 'public'`; default by quest mode |
| `recipient` | TEXT | nullable; for `'private'` beats |
| `art` | TEXT | nullable; free-text art-direction notes |
| `imagePath` | TEXT | nullable; relative repo path to a JPEG (3:2). Engine fades the rightmost third on display. |
| `text` | TEXT | |

### `quest_beat_prereqs`
| Column | Type | Notes |
|---|---|---|
| `beatId` | TEXT FK | |
| `prereqBeatId` | TEXT FK | |
| PK | `(beatId, prereqBeatId)` | |

### `choices`  *(polymorphic)*
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `parentKind` | TEXT | `'world_encounter' \| 'field_encounter' \| 'quest_beat'` |
| `parentId` | TEXT | id within the parent table |
| `ordinal` | INT | 0..2 (max 3 choices per encounter) |
| `label` | TEXT | button text shown to the player |
| `outcomeText` | TEXT | nullable; narrative shown after this choice is taken, before / alongside the effects firing |
| `condition` | TEXT | DSL JSON; nullable; hides the choice if false |
| `deferredDelay` | INT | nullable; rounds to defer this choice's effects |

### `effects`  *(polymorphic)*
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `parentKind` | TEXT | `'choice' \| 'quest_claim_reward' \| 'quest_shared_reward'` |
| `parentId` | TEXT | id within the parent table |
| `ordinal` | INT | order of application |
| `type` | TEXT | one of the 22 effect names (§2) |
| `paramsJson` | TEXT | JSON params blob, shape per type (§2) |

**Semantics notes:**
- A choice's `effects` rows fire immediately on resolution; if
  `choices.deferredDelay` is set, the engine wraps them in
  `QUEUE_DEFERRED` with that delay.
- Quest completion rewards live in `effects` with
  `parentKind = 'quest_claim_reward'` (claimant only) or
  `'quest_shared_reward'` (every player), and `parentId = quests.id`.

### `wiki_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | stable identifier; `[[term]]` markup falls back to this |
| `term` | TEXT | display label |
| `aliases` | TEXT | JSON array of alt spellings the renderer also matches |
| `category` | TEXT | grouping for the wiki sidebar (free-text; starter set: `'Mechanics'`, `'Geography & Story'`, `'Factions'`) |
| `body` | TEXT | entry text; supports recursive `[[other-term]]` cross-links |
| `imagePath` | TEXT | nullable; optional illustration |

In-game flavor text in encounter beats, choice labels, choice outcomes,
and any other player-facing string is rendered through a `[[term]]`
parser. A match (alias → term → id, case-insensitive) becomes a
clickable span that opens the wiki modal. Unresolved markers render as
plain text with a faded hint so authors can spot typos.

### Text-token substitution

Player-facing text fields (encounter beat text, choice label, choice
outcome text) also support dynamic tokens of the form
`{kind:selector}`. Tokens resolve at display time against current
state — so `{faction:lowest-standing-with-active}` always names the
faction currently most hostile to the player reading the card.

Registry lives in `src/game/textTokens.js` (engine) mirrored by
`editor/src/lib/textTokens.js` (picker labels). The editor's
`+ variable` button next to text fields inserts the right token at
the cursor — authors don't type these by hand.

Unknown selectors fall back to a generic word (`"someone"`,
`"a place"`, `"a unit"`) so text never reads as broken even if a
token can't be resolved in the current state.

Tokens are resolved BEFORE `[[wiki]]` markup is parsed, so a future
resolver returning a wiki-linkable name (`"[[Versari]]"`) would
still cross-link correctly.

---

## 2. Effect type names — **locked, 23 total**

The editor's dropdown is exactly these 23 entries. Adding a new type
requires a coding-agent change (a new handler in `effects.js` AND a
new row here).

### From spec §12 (existing — already implemented)

| Type | Params shape |
|---|---|
| `ADJUST_RESOURCE` | `{ resource: 'Resource'\|'VP'\|'Tech', amount: int, target: <token> }` — `Tech` becomes `Research` with the engine tech wheel (tech-wheel-plan.md §1); not yet. |
| `MODIFY_STAT` | `{ stat: 'Strength'\|'Movement', amount: int, target: <token>, duration: 'permanent'\|'until_your_next_turn'\|'this_turn'\|'this_contest' }` |
| `GRANT_ACTIONS` | `{ amount: int, target: <token>, when: 'this_turn'\|'next_turn' }` |
| `MOVE_CARD` | `{ from: <zone>, to: <zone>, selector: 'top'\|'chosen'\|'random'\|'by_id'\|'all_matching', count: int, id?: string, filter?: object }` |
| `SET_FLAG` | `{ flag: 'disabled'\|'exhausted'\|'shielded'\|'marked', value: bool, target: <token>, duration: string }` — `immobilized` removed in combat v0.2 (was a raid outcome; replaced by attrition + chip salvage). |
| `TRANSFER` | `{ what: 'resource'\|'card', resource?: string, amount?: int\|'all'\|'half', from: <token>, to: <token> }` |
| `CONVERT` | `{ from: <pool>, to: <pool>, rate: { cost: int, gain: int }, max?: int, target: <token> }` |
| `SPAWN` | `{ source: string, zone: <zone>, initialState?: object }` |
| `PEEK` | `{ deck: <zone>, count: int, reorder: bool, target: <token> }` |
| `FORCE_CHOICE` | `{ chooser: <token>, target: <token>, options: [{ label, effects: [Effect] }] }` |
| `SURCHARGE` | `{ action: string, extraCost?: int, block?: bool, window: string, target: <token> }` |
| `REDIRECT` *(reaction-only)* | `{ field: 'recipient'\|'target'\|'amount', operation: 'set'\|'scale'\|'clamp', value: any }` |
| `CANCEL` *(reaction-only)* | `{ condition?: <DSL> }` |

### From spec §15.10 (new — pending implementation)

| Type | Params shape |
|---|---|
| `ADJUST_TRACK` | `{ track: 'trust'\|'reputation'\|'alignment', amount: int, target: <token> }` |
| `ADJUST_STANDING` | `{ faction: <fid>, player: <token>, amount: int }` |
| `SET_PLAYER_FLAG` | `{ flag: string, value: any, target: <token>, duration?: string }` |
| `QUEUE_DEFERRED` | `{ effects: [Effect], delayRounds: int, target: <token>, anchor?: "encounter", anchorUnit?: <token>, anchorHex?: <token> }` |
| `START_QUEST` | `{ questId: string, claimant: <token> }` |
| `ADVANCE_QUEST` | `{ questId: string, beatId: string }` |
| `COMPLETE_QUEST` | `{ questId: string }` |
| `PLACE_ENCOUNTER` | `{ encounterId: string, hex?: <hexId>, hexFilter?: <HexFilter>, expiresIn?: int }` |
| `DELIVER_ENCOUNTER` | `{ encounterId: string, mode?: 'private'\|'public', recipient?: <token>, condition?: Cond }` (optional `condition` — false skips delivery silently; other effects on the same choice still run, enabling success / fallback chains) |

**`QUEUE_DEFERRED` anchoring (§5).** By default a deferred packet is a blind
timer — it fires after `delayRounds` no matter what. Setting `anchor:
"encounter"` binds it to the unit that triggered the encounter, standing on
the encounter hex: the timer pays out only if that unit is still on that hex
when it comes due. Moving the unit off the hex **cancels** the packet
immediately (the in-game Move confirm warns the player first, and won't be
suppressed by "don't ask again"); if the anchor breaks any other way (the
unit is destroyed or force-retreated) the round-end sweep discards the packet
instead of firing it. `anchorUnit` / `anchorHex` override the bound unit/hex
explicitly — tokens `"encounter-unit"` / `"encounter-hex"` (the defaults), or
a literal uid / hex id. The cancellation emits a `deferred_cancelled` event.

### From spec §16 (v0.2 — implemented)

| Type | Params shape |
|---|---|
| `ADJUST_BASE_STRENGTH` | `{ amount: int, target: <token> }` — wound/heal a unit's base Strength (its HP); clamps to `[0, cap]`, destroys at 0 |

---

## 3. Recipient token vocabulary — **locked**

The editor renders one of three input shapes: a simple token from the
dropdown, a parameterised template (token + arg field), or an explicit
faction id.

### Simple tokens (no argument)
- `active` — current active player
- `random` — a random player (seeded RNG)
- `chosen-by-active` — active player picks at runtime
- `most-raided` — player with highest recent raid count
- `least-engaged` — player with highest ignore count
- `claimant` — the quest's claimant (quest-context only)
- `triggering-player` — player who caused the firing event
- `each` — every player (public mode only)

### Parameterised tokens (editor renders an arg field)
- `lowest-standing-with:<fid>` — player whose standing toward `<fid>` is lowest
- `highest-standing-with:<fid>` — player whose standing toward `<fid>` is highest
- `controller-of:<hex>` — current full-controller of `<hex>` (resolves to `null` if uncontrolled)

### Explicit
- Any faction id directly: `versari` | `goldgrass` | `lakers` | `plainers`

---

## 4. HexFilter syntax — **locked, structured JSON**

A flat object. All keys AND-ed; an empty object `{}` matches any hex.
The editor renders each key as a labeled form field; unset = not
applied. **Compound operators (OR / NOT) are deferred** to a later
revision.

| Key | Required | Value |
|---|---|---|
| `type` | no | `'location'` \| `'encounter'` \| `'terrain'` \| `'any'` |
| `controlledBy` | no | pid \| `'neutral'` \| `'any-player'` \| `'any'` |
| `notControlledBy` | no | pid \| `'any-player'` |
| `withinHexesOf` | no | object: `{ hex: <hexId>, range: int }` |
| `outsideHexesOf` | no | object: `{ hex: <hexId>, range: int }` |
| `hasChip` | no | chipId |
| `notHasChip` | no | chipId |
| `factionAffiliation` | no | fid \| `'unaffiliated'` \| `'any'` |
| `strategicValue` | no | `'low'` \| `'medium'` \| `'high'` \| `'veryHigh'` |
| `hasAbility` | no | abilityId \| `'any'` \| `'none'` |
| `terrain` | no | terrain sub-type id (`'mountain'`, `'forest'`, `'rubble'`, `'wetland'`, …) \| `'any'` |
| `hasRoad` | no | `true` (only road hexes) \| `false` (only off-road hexes) |

Example — "an encounter hex within 2 of versari's capital, not
controlled by anyone":

`{ type: 'encounter', withinHexesOf: { hex: 'h4-0', range: 2 }, notControlledBy: 'any-player' }`

If multiple hexes match, placement picks one via the seeded RNG.

---

## 5. Condition format — **lightweight DSL, NOT raw JS predicates**

The editor renders a structured condition builder; the DSL is
JSON-serialisable and inspectable; the engine interprets it via a small
evaluator (~120 lines, single module `dsl.js`). The same DSL serves
trigger `condition`, trigger `strength`, choice `condition`, beat
`deliverCondition`, and `CANCEL.condition`.

### Grammar — a `Cond` is one of these forms

| Form | Returns | Notes |
|---|---|---|
| `{ all: [Cond, ...] }` | bool | logical AND |
| `{ any: [Cond, ...] }` | bool | logical OR |
| `{ not: Cond }` | bool | logical NOT |
| `{ op: Op, left: Val, right: Val }` | bool | atomic predicate |
| `{ has_flag: { player: Tok, flag: string } }` | bool | |
| `{ quest_active: <questId> }` | bool | |
| `{ quest_completed: { player: Tok, questId: string } }` | bool | |
| `{ controls_count: { player: Tok, strategicValue?: string } }` | int | usable as a `Val` |
| `{ control_duration: { player: Tok, hex: <hexId> } }` | int | usable as a `Val` |
| `{ unit_on_hex_duration: { unit: <uid>, hex?: <hexId\|path> } }` | int | usable as a `Val`. Rounds the unit has continuously sat on the hex (0 the round it arrives). `hex` omitted → its current hex; otherwise gates on that hex. |
| `{ unit_on_hex_duration: { player: Tok, hex: <hexId\|path> } }` | int | usable as a `Val`. Longest dwell among that player's units currently on `hex` (0 if none). `hex` defaults to the encounter hex (`ctx.sourceHex`). The "park a unit here for N rounds" gate. |
| `{ has_chip: { holder, chipId, player?, hex? } }` | bool | `holder` ∈ `'active-player-units'`, `'active-player-locations'`, `'any-unit-on-hex'`, `'any-location-on-hex'` |
| `{ unit_count: { player: Tok, unitType?: string } }` | int | usable as a `Val` |
| `{ score: { kind, player? \| faction? \| fromFaction?+toFaction? \| observer?+toward? } }` | int | usable as a `Val`. `kind` ∈ `'menace'`, `'honor'`, `'recognition'`, `'standing'`, `'tolerance'`, `'trust_floor'`. |
| `true` \| `false` | bool | literal |

**`Op`** is one of: `'eq'`, `'ne'`, `'gt'`, `'gte'`, `'lt'`, `'lte'`.

**`Val`** is one of: a number, a string, a boolean, a path expression
(a dot-path string into state — see below), or a recursive `Cond` that
returns an int.

**`Tok`** is one of the recipient tokens (§3), or a literal pid.

### Path expressions

Dot-syntax strings evaluated against the engine state:

| Path | Resolves to |
|---|---|
| `world.raidCounts.<fid>` | int |
| `world.ignoreCounts.<fid>` | int |
| `players.<pid>.tracks.trust` | int |
| `players.<pid>.tracks.reputation` | int |
| `players.<pid>.tracks.alignment` | int |
| `players.<pid>.resource` | int |
| `players.<pid>.vp` | int |
| `players.<pid>.tech` | int — splits into `research` (raw 0–8+) and `techLevel` (banded 1–5) with the engine tech wheel. Until then this is the live field. |
| `factionStanding.<fid>.<pid>` | int |
| `state.round` | int |
| `state.activeQuests.<questId>.beatIndex` | int |

Unknown paths evaluate to `null`. `null` in any numeric comparison
returns `false`.

### Strength expression (extension of `Cond`)

Used only as `triggerStrength`. Same grammar plus a top-level
`if`-cascade returning integers 1–5:

- `Strength := int (1..5)` — a bare integer
- `Strength := { if: [Cond, Strength, Cond, Strength, ..., Strength] }` — pairs of `(cond, value)`; the final element is the fallback

### Examples

Condition — "versari has been raided 3+ times recently AND trust < −2":

`{ "all": [ { "op": "gt", "left": "world.raidCounts.versari", "right": 3 }, { "op": "lt", "left": "players.versari.tracks.trust", "right": -2 } ] }`

Strength cascade — escalating urgency:

`{ "if": [ { "op": "gt", "left": "world.raidCounts.versari", "right": 5 }, 5, { "op": "gt", "left": "world.raidCounts.versari", "right": 3 }, 3, 1 ] }`

Choice condition — "active player has completed quest X":

`{ "quest_completed": { "player": "active", "questId": "the-fixer-line" } }`

---

## Editor-side validation responsibilities

1. Effect `type` is one of the 22 in §2; params match the per-type shape.
2. Recipient values match §3 (simple token / parameterised template / pid).
3. HexFilter keys match §4.
4. DSL well-formedness against §5 grammar (parseable JSON conforming to
   the production rules).
5. Foreign-key integrity: `PLACE_ENCOUNTER.encounterId` and
   `DELIVER_ENCOUNTER.encounterId` reference an existing
   `world_encounters.id`; quest beat prerequisites reference real beats.

Everything else — running the DSL, applying effects, scheduling deferred
queues, evaluating triggers, sequencing quest beats — is engine-side.
