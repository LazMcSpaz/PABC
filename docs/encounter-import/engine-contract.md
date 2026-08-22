# Engine Contract — what Ashland Conquest (PABC) actually accepts today

**Audience:** the content-side agent authoring encounter / quest JSON in a separate repo.
**Purpose:** ground truth about the *engine*, so the content inventory can be diffed against it.
**Status:** phase one — read-only survey. Nothing here is a proposal. No engine or content file was changed to produce it.

**Repo:** `LazMcSpaz/PABC`, branch `main`, at commit `d623ae0` (pulled 2026-08-21).
**Stack:** plain ES modules, Vite + React. Engine is `src/game/*.js`; there is no TypeScript, no JSON-schema validator, and no test runner wired to CI.

## How to read the labels

Every claim below carries one of:

- **[VERIFIED-CODE]** — read in the source at the cited `file:line`.
- **[VERIFIED-RUN]** — additionally confirmed by executing the engine under Node against a real `createGame()` state.
- **[INFERRED]** — a reasonable reading of the code, but not directly proven. Treat as a question to settle, not a fact.
- **[DOC-ONLY]** — asserted by a document in `docs/`, with no implementation backing it, or contradicted by the implementation.

Where a doc and the code disagree, **the code is the contract**. Several of this repo's docs are stale in load-bearing ways; those are called out individually in §7.

---

## 1. Does an encounter / quest system exist?

**Yes. Both exist, both are wired into the live turn loop, and both are consumed at runtime.** This is a real system, not a referenced data shape.

### 1.1 The runtime consumers (this is the part that matters)

| Path | Entry point | Wired at |
|---|---|---|
| **Field encounter draw** | `drawFieldEncounter(state, unit, ctx)` | `src/game/actions.js:120`, inside `runMove` — fires when a unit ends a Move on a hex whose `type === "encounter"` and whose refresh cooldown has elapsed (`actions.js:117-121`) |
| **Placement marker discovery** | `resolveMarkerOnHex(state, hex, unit, ctx)` | `src/game/actions.js:114` — checked *before* the field draw, so a marker takes precedence |
| **World encounter triggers** | `evaluateTriggers(state)` | `src/game/turn.js:412`, inside `runRoundEnd()` |
| **Quest conditional beats** | `evaluateConditionalBeats(state)` | `src/game/turn.js:413` |
| **Deferred effect sweep** | `sweepDeferred(state)` | `src/game/turn.js:410` (runs *first*, so deferred consequences can drive triggers the same round) |
| **Placement marker expiry** | `expirePlacementMarkers(state)` | `src/game/turn.js:414` |

`runRoundEnd()` is called from `endTurn()` on the round-rollover branch (`turn.js:398-403`). **[VERIFIED-CODE]**

### 1.2 Modules

| File | Lines | Role |
|---|---|---|
| `src/game/effects.js` | 556 | The effect library. `const EFFECTS = {…}` at `:44`; `applyEffect` at `:545`; `applyEffects` at `:551`. |
| `src/game/encounters.js` | 324 | Delivery for all three modes, the field-encounter deck draw, the HexFilter resolver, placement markers. Registers 2 effect handlers onto `EFFECTS` at `:300` and `:308`. |
| `src/game/quests.js` | 167 | Quest registry, beat readiness/prereqs, completion rewards. Registers 3 effect handlers at `:101`, `:126`, `:142`. |
| `src/game/dsl.js` | 266 | The condition / strength evaluator. |
| `src/game/triggers.js` | 91 | Treats the world-encounter table as the trigger registry; end-of-round scoring and firing. |
| `src/game/deferred.js` | 38 | The deferred queue sweep. |
| `src/game/targeting.js` | 75 | Recipient / target token resolver. |
| `src/game/content-loader.js` | 110 | Normalises editor-shaped content (`{type, params}`) into engine-shaped effects (`{type, ...params}`). |
| `src/game/content/*.js` | — | The generated content snapshot. See §4. |

**[VERIFIED-CODE]**

### 1.3 The system is real but **almost entirely unfed**

Measured by executing the engine **[VERIFIED-RUN]**:

| Registry | Count |
|---|---|
| `FIELD_ENCOUNTERS` | **12** |
| `WORLD_ENCOUNTERS` | **0** (`export const WORLD_ENCOUNTERS = {};` — `src/game/content/world-encounters.js:7`) |
| `QUESTS` | **0** (`src/game/content/quests.js:7`) |
| `WIKI_ENTRIES` | **0** (`src/game/content/wiki.js:6`) |

So: the quest engine has never run against real content, and the trigger evaluator returns `[]` immediately every round (`triggers.js:49`). The field-encounter path is the only one that has actually executed in a game. `docs/v0.3-roadmap.md:57` calls this state "Done, empty of content", which matches what the code shows. **[VERIFIED-RUN]**

### 1.4 A gap you should know about before authoring world encounters or quests

**There is no human-facing UI for world encounters or quest beats.** **[VERIFIED-CODE]**

- The only UI that presents an encounter is `src/prototype/EncounterModal.jsx`, opened from `src/prototype/Prototype.jsx:628` via `buildEncounterPrompt` (`Prototype.jsx:562`), which reads **`game.encounterDeck`** — the field-encounter deck — and only on the Move path.
- `evaluateTriggers(state)` is called at `turn.js:412` **with no `ctx`**, therefore with no `ctx.interact`. In `presentToPlayer` (`encounters.js:80-93`), absent `ctx.interact` the engine falls through to `headlessPick`, which returns `0` (`encounters.js:39-41`).
- **Consequence:** a world encounter or quest beat delivered today auto-resolves to its **first eligible choice**, silently, for every recipient — including the human player. The player never sees it. It appears only as an `encounter_delivered` line in the event feed (`src/prototype/EventFeed.jsx:192`).

This is not a reason to stop authoring world encounters or quests, but it does mean **choice ordinal 0 is the one that will actually fire** until a UI path exists. Author accordingly, or flag it. **[VERIFIED-CODE]**

---

## 2. The effect vocabulary — **42 implemented types**

This is the most important section. The list below is not from a document; it was produced by importing `effects.js`, then `encounters.js`, then `quests.js` under Node and printing `Object.keys(EFFECTS)`. **[VERIFIED-RUN]**

**37** handlers are defined literally in `effects.js`. **5** more are attached to the same `EFFECTS` object as an import side effect: `PLACE_ENCOUNTER`, `DELIVER_ENCOUNTER` (by `encounters.js`) and `START_QUEST`, `ADVANCE_QUEST`, `COMPLETE_QUEST` (by `quests.js`). Those five exist only once their module has been imported; in practice `turn.js` imports both, so in a running game all 42 are present. **[VERIFIED-RUN]**

**Unknown type = hard throw**, not a warning: `applyEffect` does `throw new Error('applyEffect: no handler for "<type>"')` (`effects.js:546-548`). An unrecognised effect type will crash the turn that resolves it. **[VERIFIED-CODE]**

### 2.1 Two lists that are *not* the same

Three vocabularies are in play and they disagree:

| List | Size | Where |
|---|---|---|
| **Engine — what actually runs** | **42** | `EFFECTS` at runtime |
| **Editor dropdown / editor validator** | **23** | `editor/src/lib/schema.js:4-31` (`EFFECT_TYPES`) |
| **Schema doc "locked, 23 total"** | 23 | `docs/content-schema-v0.1.md` §2 |

The editor's 23 are a **strict subset** of the engine's 42. So:

- Anything the editor accepts, the engine implements. Safe direction.
- The engine implements **19 more** types the editor will reject on save and the JSON importer will reject on import (`editor/src/lib/import.js:214-216`, `editor/src/lib/validation.js:55-58`).

If your content only uses the 23, it will pass both. If it uses any of the extra 19, it runs fine in the engine but **cannot be imported through the editor pipeline** without an editor change. **[VERIFIED-CODE]**

### 2.2 Group A — core effects (spec §12). All 13 in the editor list.

| Type | Params (exact field names read by the handler) | Notes | Ref |
|---|---|---|---|
| `ADJUST_RESOURCE` | `resource`, `amount` (signed int), `target` (token) | `resource` ∈ `"Resource"` \| `"VP"` \| `"Tech"` \| `"Research"`. `"Tech"`/`"Research"` are treated identically and are **permanent** — they raise `player.permanentResearch` and re-derive the wheel, they do **not** touch a `tech` pool. `"VP"` also increments `bankedVp`. **All pools clamp at ≥ 0** (`Math.max(0, …)`) — a negative amount cannot push a player below zero. | `effects.js:45-79` |
| `MODIFY_STAT` | `stat`, `amount`, `target`, `duration` | `stat` ∈ `"Strength"` \| `"Movement"`. `duration` defaults `"permanent"`; recognised values `permanent` \| `until_your_next_turn` \| `this_turn` \| `this_contest`. Pushes onto `state.modifiers`. | `effects.js:81-91` |
| `GRANT_ACTIONS` | `amount`, `target`, `when` | Dual-natured: if `target` resolves to a **unit uid** it bumps `unit.actionsRemaining`; if a **player id**, it hits the action pool. `when: "next_turn"` queues into `state.pendingActionGrants` (drained at `turn.js:302`); anything else is immediate. | `effects.js:215-234` |
| `MOVE_CARD` | `from`, `to`, `selector`, `count`, `id?` | Zones resolved by `getZone` (`effects.js:29-42`): `encounterDeck`, `reactiveDeck`, `removed`, `hand:<pid>`, `discard:<key>`, `unitBay:<unitUid>`, `locationSlots:<hexId>`. A `:controller` suffix is rewritten to `ctx.sourcePlayer`. `selector` ∈ `top` (default) \| `random` \| `by_id` \| `chosen`. **`all_matching` is NOT implemented** — it silently degrades to index 0. `filter` is **ignored**. | `effects.js:236-258` |
| `SET_FLAG` | `flag`, `value`, `target`, `duration` | Writes `entity.flags[flag] = { value, duration }` on a unit / location / chip / player. **Accepts any string flag.** ⚠️ **Nothing in the engine reads `entity.flags`** — grep finds only the write site and a harness print. `duration` is stored but never expired. Effectively inert today. | `effects.js:260-267` |
| `TRANSFER` | `what`, `resource`, `amount`, `from`, `to` | **Only `what: "resource"` works** — `what: "card"` returns immediately at `:270`. `amount` accepts an int, `"all"`, or `"half"`, and is clamped to what the source actually has. | `effects.js:269-286` |
| `CONVERT` | `from`, `to`, `rate: {cost, gain}`, `max?`, `target` | `from`/`to` map through `POOL_KEY` (`effects.js:19`) which only knows `Resource → resource` and `VP → vp`; **anything else silently falls back to `resource`**, so a `Tech` conversion converts scrap into scrap. | `effects.js:288-301` |
| `SPAWN` | — | **No-op.** The handler body is a comment. | `effects.js:303-306` |
| `PEEK` | — | **No-op.** The handler body is a comment. | `effects.js:308-310` |
| `FORCE_CHOICE` | `chooser`, `target`, `options: [{label, effects}]` | With no `ctx.interact`, picks `options[0]`. Recurses through `applyEffects`. | `effects.js:312-320` |
| `SURCHARGE` | `action`, `extraCost?`, `block?`, `window`, `target` | Pushes onto `state.surcharges`. ⚠️ **Nothing reads `state.surcharges`** — it is initialised at `setup.js:392` and written here, never consulted. Inert today. | `effects.js:322-332` |
| `REDIRECT` | `field`, `operation`, `value` | Reaction-window only — returns immediately unless `ctx.pending` exists. `operation` ∈ `set` \| `scale` \| `clamp`. | `effects.js:501-516` |
| `CANCEL` | (`condition` accepted by the editor; **the handler ignores it**) | Reaction-window only. Sets `ctx.pending.cancelled = true` unconditionally. | `effects.js:518-520` |

**[VERIFIED-CODE]**

### 2.3 Group B — encounter / quest effects (spec §15.10). All 9 in the editor list.

| Type | Params | Notes | Ref |
|---|---|---|---|
| `ADJUST_TRACK` | `track`, `amount`, `target` | `track` ∈ `"trust"` \| `"reputation"` \| `"alignment"`. **No clamping** — the doc's ±10 is authoring guidance only. Emits `track_changed`. | `effects.js:336-346` |
| `ADJUST_STANDING` | `faction` (literal fid), `player` (token), `amount` | ⚠️ `faction` is **not** run through the token resolver — it must be a literal faction id. Self-standing is a **silent no-op**: `if (!pid \|\| !fid \|\| pid === fid) return;`. Routed through `standing.adjustStanding`, which **clamps to `[-10, +12]`** (`config.js:402`) and emits `standing_changed`. | `effects.js:348-358`, `standing.js:23-32` |
| `SET_PLAYER_FLAG` | `flag`, `value`, `target`, `duration?` | Writes `player.flags[flag] = { value, duration, setAt }`. **Any string flag accepted.** This one *is* read — by the DSL's `has_flag` form (`dsl.js:83`). `duration` is stored but never expired. | `effects.js:360-373` |
| `QUEUE_DEFERRED` | `effects: [Effect]`, `delayRounds`, `target` | Due round = `state.round + delayRounds`. Before queueing it **snapshots `active` / `active_player` tokens to a concrete pid** so the packet lands on the original queuer, recursing into nested `effects` and `options` (`snapshotActiveToken`, `:526-543`). Other tokens keep resolution-time semantics. | `effects.js:375-391`, swept at `deferred.js:12-37` |
| `START_QUEST` | `questId`, `claimant` (token) | No-op if the quest id is unknown. `single-player` quests are exclusive — a second `START_QUEST` on an already-claimed quest returns silently. Immediately evaluates `auto` / `discovered` beats. | `quests.js:101-124` |
| `ADVANCE_QUEST` | `questId`, `beatId` | Marks the beat complete, then either completes the quest (if all beats done) or evaluates the next ready beats. **You rarely author this** — `beatAsEncounter` appends an `ADVANCE_QUEST` to *every* choice on *every* beat automatically (`quests.js:50-56`). | `quests.js:126-140` |
| `COMPLETE_QUEST` | `questId` | Applies `completion.rewardForClaimant` (claimant only) then `completion.sharedSideEffects` (everyone), records into `player.completedQuests`, deletes the active-quest record. For `global` quests the claimant is locked in here as `ctx.sourcePlayer`. | `quests.js:142-166` |
| `PLACE_ENCOUNTER` | `encounterId`, `hex?`, `hexFilter?`, `expiresIn?` | Drops a marker into `state.world.encounterMarkers[hex]`. Resolves the hex from `hex`, else `hexFilter` via `pickHexByFilter` (seeded RNG pick among matches), else the encounter's own `placementFilter`. No matching hex ⇒ silent no-op. Emits `location_spawned`. | `encounters.js:300-306`, `:196-210` |
| `DELIVER_ENCOUNTER` | `encounterId`, `mode?`, `recipient?`, `condition?` | Force-deliver outside the trigger system. `condition` is a real DSL cond evaluated first; **false skips delivery silently** and emits `encounter_delivery_skipped` while the choice's *other* effects still run. This is the mechanism the editor uses to chain multi-beat encounter stories. | `encounters.js:308-323` |

**[VERIFIED-CODE]**

### 2.4 Group C — attrition (v0.2 §16.4). In the editor list.

| Type | Params | Notes | Ref |
|---|---|---|---|
| `ADJUST_BASE_STRENGTH` | `amount` (signed), `target` (a **unit uid**) | Wound / heal a unit's base Strength, which doubles as HP. Clamps to `[0, cap]` where cap is `4` normally and `8` for a veteran (`config.js:69-70`). **A unit driven to 0 is destroyed** via `destroyUnit`. Emits `base_strength_changed`. Non-unit targets are skipped. | `effects.js:96-108` |

**[VERIFIED-CODE]**

### 2.5 Group D — the 19 engine-only types (NOT in the editor list)

These are fully implemented in the engine but will be **rejected by the editor's validator and by its JSON importer**. Listed so the diff is honest in both directions.

**Chip effects (3)** — note the first one:

| Type | Params | Notes | Ref |
|---|---|---|---|
| **`GRANT_CHIP`** | `chipId` **or** `pool: "reward"`, plus optional `unit`, `target` | **This exists.** Grants a chip to a unit: explicit `e.unit`, else `ctx.sourceUnit` (field encounters pass it — `encounters.js:190`), else a unit of the resolved target player, preferring one standing on the source hex. If the bay has room and the one-per-stat rule allows, it installs; otherwise **the chip drops as hex loot at the unit's feet** rather than being lost. `pool: "reward"` picks a random chip with `reward: true`. **Throws** on an unknown `chipId`. No possible recipient ⇒ silent fizzle. | `effects.js:116-152` |
| `DISABLE_CHIP` | (uses `ctx.sourcePlayer`) | Disables one enemy chip until the start of the actor's next turn. | `effects.js:158-188` |
| `STRIP_CHIP` | (uses `ctx.sourcePlayer`, `ctx.source.hexId`) | Rips a chip off an enemy unit on the source hex; drops as hex loot. | `effects.js:192-213` |

> ⚠️ **`docs/chip-system-dependencies.md` is stale on exactly this point.** Its row S4 says *"No `GRANT_CHIP`-style effect type exists (verified: `effects.js` has none…)"*. That was true when written; it is **no longer true**. `GRANT_CHIP` is implemented at `effects.js:116-152` and its own comment cites the S4 row it supersedes. Reward chips on quest completion are therefore **deliverable by the engine today** — but the type is not in the editor's list, so it cannot currently be authored through the editor/import path. **[VERIFIED-RUN]**

**Fog-of-war effects (3):** `REVEAL_REGION` (`center?`, `radius?`, `target`) `effects.js:398-406`; `GRANT_VISION` (`from?`, `target`) `:411-419`; `PLANT_FALSE_INTEL` (`hex?`, `target`, `owner?`, `strength?`, `unitId?`) `:423-429`.

**Diplomacy effects (13):** `ADJUST_MENACE` (`amount`, `cause?`, `target`) `:433`; `ADJUST_HONOR` `:436`; `DECLARE_WAR` (`actor?`, `faction`, `cause?`) `:439`; `MAKE_PEACE` `:443`; `FORM_PACT` `:447`; `BREAK_PACT` `:452`; `CALL_PACT` (`actor?`, `ally`, `target`, `honored?`) `:456`; `DENOUNCE` `:462`; `MEDIATE` (`actor?`, `a`, `b`) `:466`; `VASSALIZE` `:470`; `RELEASE_VASSAL` (`faction`, `cause?`) `:475`; `RESOLVE_DEAL` (`deal`, `accept?`, `cause?`) `:479`; `PROPOSE_DEAL` (`deal`) `:486`.

All thirteen delegate to `src/game/diplomacy.js`. Most take `actor` defaulting to `"active"` and a literal `faction` id. **[VERIFIED-CODE]**

### 2.6 What is in the schema doc but does NOT exist

Nothing. Every one of the 23 names in `docs/content-schema-v0.1.md` §2 and `editor/src/lib/schema.js` has a live handler. **[VERIFIED-RUN]**

The mismatch runs the other way: the engine has grown 19 types the schema doc never absorbed.

---

## 3. Targeting — **this is where content will silently break**

Effects name their recipient with a token, resolved by `resolveTargets(state, token, ctx)` (`targeting.js:21-74`).

The resolver knows two vocabularies: engine snake_case (`active_player`, `all_players`, …) and four hyphenated aliases from the content schema (`targeting.js:10-15`). **Any token it does not recognise falls through to `default: return [token]`** (`targeting.js:70-72`) — it returns the literal string as if it were a player id. Downstream, `state.players["most-raided"]` is `undefined`, so the handler `continue`s or returns. **The effect vanishes with no error and no log line.**

I resolved every token in the schema's "locked" §3 vocabulary against a real `createGame({seed:1})`. **[VERIFIED-RUN]**

| Schema §3 token | Resolves to | Works? |
|---|---|---|
| `active` | `["versari"]` (the active player) | ✅ |
| `each` | all four pids | ✅ |
| `triggering-player` | `ctx.event.payload.player`, else active | ✅ |
| `chosen-by-active` | an opponent (first, headless) | ✅ |
| `claimant` | `ctx.claimant`, else `[]` | ✅ (quest context only) |
| a literal fid (`versari`, `goldgrass`, `lakers`, `plainers`) | itself | ✅ |
| **`random`** | `["random"]` | ❌ **silent no-op** |
| **`most-raided`** | `["most-raided"]` | ❌ **silent no-op** |
| **`least-engaged`** | `["least-engaged"]` | ❌ **silent no-op** |
| **`lowest-standing-with:<fid>`** | `["lowest-standing-with:versari"]` | ❌ **silent no-op** |
| **`highest-standing-with:<fid>`** | `["highest-standing-with:versari"]` | ❌ **silent no-op** |
| **`controller-of:<hex>`** | `["controller-of:h4-0"]` | ❌ **silent no-op** |

**Six of the fourteen "locked" recipient tokens are unimplemented.** The editor's `isValidRecipient` (`editor/src/lib/recipient.js:41-47`) accepts all of them, so content using them passes validation, imports cleanly, exports cleanly, and then does nothing at runtime. This is the single highest-risk mismatch in the contract. **[VERIFIED-RUN]**

Engine-side tokens the schema doc does not list, but which do work: `self`, `controller`, `active_player`, `triggering_player`, `all_players`, `each_opponent`, `random_opponent`, `chosen_opponent`, `defending_unit`, `stationed_unit`, `entity`. **[VERIFIED-CODE]**

`random_opponent` needs `ctx.rng` and falls back to the first opponent without it; the encounter delivery path does not pass `rng` in `ctx`, so it is deterministic there. **[INFERRED]** — read from `targeting.js:41-45` plus the ctx objects built in `encounters.js:190` and `:224`, but not executed.

---

## 4. The data shape

### 4.1 Where content lives, and what is generated

```
src/game/content/index.js            re-exports the four registries    GENERATED
src/game/content/world-encounters.js export const WORLD_ENCOUNTERS={}  GENERATED  (empty)
src/game/content/field-encounters.js export const FIELD_ENCOUNTERS={…} GENERATED  (12 entries)
src/game/content/quests.js           export const QUESTS={}            GENERATED  (empty)
src/game/content/wiki.js             export const WIKI_ENTRIES={}      GENERATED  (empty)
```

All five carry the header *"AUTO-GENERATED by the content editor's export pipeline. Do not edit by hand"* and a generation stamp — currently `2026-05-20T21:27:51.953Z`. **[VERIFIED-CODE]**

The generator is `editor/src/lib/exporter.js:13-56`. It stringifies with **sorted keys and 2-space indent** for clean diffs (`:69-80`). The upstream source of truth is a **Supabase database** of seven tables, read by `editor/src/lib/snapshot.js:21-152`, and committed to a branch via the GitHub API (`editor/src/lib/github.js`, documented in `editor/README.md`).

Note the ordering consequence: hand-editing `src/game/content/*.js` in the game repo is not a durable import path — the next editor sync overwrites it. **[VERIFIED-CODE]**

Not generated, and unrelated to encounters: `src/game/content.js` (34 KB, hand-authored chips / locations / factions / reactives) and the `content/*.csv` files at repo root.

### 4.2 There is already an import path built for exactly this job

`editor/src/lib/import.js` — its header reads *"Import pipeline for table-grouped JSON content (authoring agent output)"*. **[VERIFIED-CODE]**

It accepts a JSON document whose top-level keys are the seven table names, each an array of full DB rows in camelCase:

```
quests, world_encounters, field_encounters, quest_beats, choices, quest_beat_prereqs, effects
```

Import order is fixed at `import.js:23-31` (quests before beats, choices before prereqs, effects last). The pipeline:

1. `parseImport` — rejects unknown top-level keys (`:135-141`).
2. `prepareRows` — rejects **unknown columns per table** (`ALLOWED_COLUMNS`, `:50-107`), enforces `REQUIRED_COLUMNS` (`:109-117`), stringifies object values for JSON-TEXT columns (`:36-41`), coerces booleans to 0/1 (`:44-46`), and rejects any effect `type` outside the editor's 23 (`:214-216`).
3. `detectConflicts` — counts id collisions against the live DB (`:227-271`).
4. `applyImport` — upserts on `id` (or `beatId,prereqBeatId` for prereqs) (`:275-293`).

⚠️ **`ALLOWED_COLUMNS.world_encounters` (`import.js:51-65`) is missing `triggerWeight`.** That column was added by migration `editor/sql/0006_encounter_weight.sql` and *is* read by the engine (`triggers.js:40`), but the importer will reject any row that carries it as `unknown column 'triggerWeight'`. **[VERIFIED-CODE]**

### 4.3 Required fields

**Importer-enforced** (`import.js:109-117`) **[VERIFIED-CODE]**:

| Table | Required |
|---|---|
| `world_encounters` | `id`, `mode`, `text`, `triggerCondition`, `triggerStrength` |
| `field_encounters` | `id`, `text` |
| `quests` | `id`, `mode` |
| `quest_beats` | `id`, `questId`, `deliver`, `text` |
| `quest_beat_prereqs` | `beatId`, `prereqBeatId` |
| `choices` | `id`, `parentKind`, `parentId`, `label` |
| `effects` | `id`, `parentKind`, `parentId`, `type` |

**Editor-validator-enforced, stricter** (`editor/src/lib/validation.js`) **[VERIFIED-CODE]**:

- World encounter: `triggerCooldown` must be an integer (`:245-250`); `triggerWeight`, if present, must be a number in `(0, 5]` (`:251-256`); `recipient` required and grammar-valid for non-`placement` modes (`:230-238`); `placementFilter` validated only when `mode === "placement"` (`:257-259`).
- Field encounter: `copies` must be a **positive** integer (`:274-280`). *(But the editor writes `copies: 0` for sub-beats — see §4.6. `validateFieldEncounter` runs against the story head, not sub-beats, so this is consistent.)*
- Every story: at least one beat, each beat needs `id` and `text`, and **at most 3 choices per beat** (`:220-222`, `:314-316`).
- Quest beats: `deliverCondition` required for `deliver: "conditional"`; `placementFilter` required for `deliver: "discovered"` (`:293-306`).
- Prereqs must reference real beats and may not self-reference (`:318-323`).

**Engine-enforced:** essentially nothing. The engine never validates content. `normalizeEncounter` / `normalizeQuest` (`content-loader.js:45-69`) are pure pass-through spreads — every unrecognised field flows through untouched. The engine reads what it knows and ignores the rest. The one hard failure mode is an unknown effect `type`, which throws (§2). **[VERIFIED-CODE]**

There is also `findUnsupportedTypes(snapshot)` (`content-loader.js:74-86`) and `choiceIsRunnable(choice)` (`:90-99`), which walk effects (including nested `effects` and `options`) and report types with no handler. **Nothing calls them in the shipping app** — grep finds only their definitions. They are available tooling, not an active gate. Run against the current field content they return `[]`. **[VERIFIED-RUN]**

### 4.4 The runtime object shape, per registry

`FIELD_ENCOUNTERS[id]` — from the live file, keys observed across all 12 entries **[VERIFIED-RUN]**:

```js
{
  id, text, art, copies,
  choices: [
    { id, label, outcomeText, condition, deferredDelay,
      effects: [ { id, type, params: { … } } ] }
  ]
}
```

`title` and `imagePath` are **absent** from all 12 — that snapshot predates migrations `0003`–`0005`. The engine tolerates their absence: `enc.title` falls back to `displayName(enc.id)` in the modal (`EncounterModal.jsx:128`, `:119-122`). Newer exports will include both (`snapshot.js:96-99`). **[VERIFIED-RUN]**

`WORLD_ENCOUNTERS[id]` — shape defined by `snapshot.js:76-92` **[VERIFIED-CODE]**:

```js
{
  id, title, mode, recipient, expiresIn, publicGroupChoice, art, imagePath, text,
  triggerCondition,   // parsed DSL object, not a string
  triggerStrength,    // parsed
  triggerCooldown,    // int
  triggerWeight,      // number, defaults 1
  placementFilter,    // parsed HexFilter or null
  choices: [ … as above … ]
}
```

`QUESTS[id]` — `snapshot.js:131-140` **[VERIFIED-CODE]**:

```js
{
  id, title, mode,                       // mode: "single-player" | "global"
  beats: [ { id, ordinal, prerequisites: [beatId], deliver,
             deliverCondition, placementFilter, mode, recipient,
             art, imagePath, text, choices: [ … ] } ],
  completion: { rewardForClaimant: [Effect], sharedSideEffects: [Effect] }
}
```

⚠️ **A field-name mismatch inside quest beats.** `snapshot.js:120` emits the beat's gating predicate as **`deliverCondition`**. But `quests.js:93` reads **`beat.condition`**:

```js
if (beat.condition && !evalCond(state, beat.condition, beatCtx)) continue;
```

Because `beat.condition` is `undefined` on editor-generated content, the guard short-circuits and a `deliver: "conditional"` beat **fires unconditionally** at the first round-end after its prerequisites are met. Untested at runtime — `QUESTS` is empty, so this path has never executed against real content. **[VERIFIED-CODE]**

### 4.5 Effect shape: two accepted forms

The editor emits `{ id, type, params: { … } }`. The engine expects `{ type, ...params }`. `normalizeEffect` (`content-loader.js:18-33`) flattens the former into the latter and **recurses into `effects` (for `QUEUE_DEFERRED`) and `options[].effects` (for `FORCE_CHOICE`)**. Already-flat effects pass through unchanged, so harness-authored and editor-authored content can mix. **[VERIFIED-CODE]**

Normalisation happens **once at module load**, not per delivery: `encounters.js:23-24` normalises both registries at import time; `quests.js:18` does the same for quests. **[VERIFIED-CODE]**

### 4.6 ID conventions

No engine-enforced format — ids are opaque map keys and any string works. **[VERIFIED-CODE]** The conventions in use:

| Prefix | Used for | Evidence |
|---|---|---|
| `fe_` | field encounters | all 12 ids, e.g. `fe_buried_cache` |
| `we_` | world encounters | `editor/README.md` example, `prettifyId` strip list |
| `q_` / `quest_` | quests | `prettifyId` strip list |
| `qb_` / `beat_` | quest beats | `prettifyId` strip list |
| `ch_` | choices | all choice ids in the field content |
| `ef_` | effects | all effect ids in the field content |
| `<headId>__b<n>` | **sub-beats** of a multi-beat encounter story | `story.js:47-49` |

Three of these are load-bearing, not cosmetic:

1. **`prettifyId`** (`snapshot.js:180-185`) strips a leading `fe_|we_|q_|qb_|quest_|beat_` and title-cases the rest to build a fallback display title. `EncounterModal.jsx:119-122` does the same but strips **only `fe_`** — so a world encounter with a blank title shows as `We Something` in the modal. **[VERIFIED-CODE]**
2. **`__b<n>`** marks a row as a sub-beat. `headIdOf` (`snapshot.js:155-158`) splits on it so sub-beats inherit the head's title; `story.js:291` deletes stale sub-beats with a `LIKE '<headId>__b%'` query. **Do not use `__b` in a standalone encounter id.** **[VERIFIED-CODE]**
3. **Sub-beat "off" sentinels** (`story.js:42-45`): a sub-beat field encounter carries `copies: 0` so it is never seeded into the deck; a sub-beat world encounter carries `triggerCondition: false`, `triggerStrength: 1`, `triggerCooldown: 999999` so it never fires standalone. Sub-beats are reached **only** via a `DELIVER_ENCOUNTER` effect on a previous beat's choice. If your multi-beat encounter stories don't set these sentinels, every beat will fire as an independent encounter. **[VERIFIED-CODE]**

Choice and effect ids must be **globally unique per table**, not per parent — the DB PK is `id` alone and the importer upserts on it (`import.js:281-285`). Two encounters that both name a choice `ch_take` will clobber each other. **[VERIFIED-CODE]**

### 4.7 Lookup

- `getEncounter(id)` checks `WORLD` first, then `FIELD` (`encounters.js:32-34`). **A world encounter shadows a field encounter of the same id.** **[VERIFIED-CODE]**
- `getQuest(id)` reads a module-local `registry`, seeded from `QUESTS` at load; `registerQuest(def)` can inject at runtime (used only by the harness, `harness.js:62`). **[VERIFIED-CODE]**
- The field-encounter deck is seeded at `setup.js:316-323`: each def expands into `copies` copies of its **id string** (no per-instance state), then the whole thing is shuffled with the seeded RNG. `copies` defaults to 1 when absent. Empty deck reshuffles from the discard pile (`encounters.js:156-162`). **[VERIFIED-CODE]**
- Field encounter hexes enter a **3-round** refresh cooldown after a draw (`FIELD_HEX_COOLDOWN = 3`, `encounters.js:133`, applied at `:184`). **[VERIFIED-CODE]**
- `CONFIG.encounters.worldPerRound = 2` — how many world triggers fire per round-end, overridable per game via `state.rules.worldEncountersPerRound` (`config.js:282`, `triggers.js:24-26`). **[VERIFIED-CODE]**
- Trigger scoring: `score = strength × weight`, sorted descending, top-K fired, ties at the cutoff broken by the seeded RNG. `strength <= 0` or `score <= 0` disqualifies. Missing `triggerWeight` defaults to `1`. (`triggers.js:47-90`) **[VERIFIED-CODE]**

### 4.8 The condition DSL — implemented forms

`evalCond(state, cond, ctx)` at `dsl.js:64-248`. `null` cond ⇒ `true`. A non-object, non-boolean cond ⇒ `false`. Unrecognised object shape ⇒ `false` (`:247`). **[VERIFIED-CODE]**

| Form | Returns | Ref |
|---|---|---|
| `{all:[…]}` / `{any:[…]}` / `{not:…}` | bool | `dsl.js:71-73` |
| `{op, left, right}` — `op` ∈ `eq`/`ne`/`gt`/`gte`/`lt`/`lte` | bool | `:75-79`, `:51-62` |
| `{has_flag:{player, flag}}` — reads **`player.flags`**, i.e. `SET_PLAYER_FLAG`, not `SET_FLAG` | bool | `:81-84` |
| `{quest_active: questId}` or `{quest_active:{questId}}` | bool | `:86-92` |
| `{quest_completed:{player, questId}}` | bool | `:94-97` |
| `{controls_count:{player, strategicValue?}}` | int | `:100-110` |
| `{control_duration:{player, hex}}` | int (rounds) | `:128-137` |
| `{has_chip:{holder, chipId, player?, hex?}}` — **see the current shape in A8; the four-holder list above is superseded** | bool | `:145-187` |
| `{has_tech:{…}}` / `{count_tech:{…}}` / `{count_chips:{…}}` / `{count_flags:{…}}` — capability and ledger queries, added during the import build | bool / int | see A8 |
| `{unit_count:{player, unitType?}}` | int | `:191-202` |
| `{score:{kind, …}}` — `kind` ∈ `menace` \| `honor` \| `recognition` \| `standing` \| `tolerance` \| `trust_floor`; unknown kind ⇒ `0` | int | `:213-245` |
| `{zoc_contains:{faction?/player?, hex?}}` — **engine-only, not in the schema doc and not in the editor's `condForm`** (`editor/src/lib/dsl.js:41-58`), so the editor will reject it as an unknown DSL form | bool | `:116-126` |
| `true` / `false` literal | bool | `:66` |

**`Val` resolution** (`dsl.js:39-49`) has a trap worth stating plainly: a string value is treated as a **dot-path into state if and only if it contains a `.`**; otherwise it is a literal string. So `"players.versari.vp"` is a path but `"round"` is the literal string `"round"`. Unknown paths resolve to `null`, and `null` on either side of a comparison makes the predicate `false` (`:52`). **[VERIFIED-CODE]**

`evalStrength` (`dsl.js:252-265`) accepts a bare number or `{if: [Cond, Strength, …, fallback]}`. **A malformed strength expression returns `0`, and `score <= 0` disqualifies the trigger** (`triggers.js:57-59`) — so a broken strength expression means the encounter never fires, silently. The 1–5 range is authoring convention; the evaluator does not clamp. **[VERIFIED-CODE]**

### 4.9 HexFilter — implemented keys

`hexMatches` at `encounters.js:230-290`. Flat object, all keys AND-ed, `{}` matches everything. All twelve documented keys are implemented: `type`, `controlledBy`, `notControlledBy`, `withinHexesOf`, `outsideHexesOf`, `hasChip`, `notHasChip`, `factionAffiliation`, `strategicValue`, `hasAbility`, `terrain`, `hasRoad`. No OR / NOT compound operators. **[VERIFIED-CODE]**

Caveat the engine's own comment flags (`encounters.js:281-284`): `hex.terrain` is `null` and `hex.road` `undefined` until the terrain+roads work track lands, so a filter asking for a specific `terrain` or `hasRoad` currently matches **nothing** — degrading to a silent no-placement. **[VERIFIED-CODE]**

### 4.10 Text tokens and wiki markup

Player-facing strings support `{kind:selector}` tokens resolved by `resolveTokens` (`textTokens.js:78-92`) against `/\{(faction|location|unit):([a-z0-9-]+)\}/gi`. The **ten** implemented tokens are enumerated at `textTokens.js:61-72`. Unknown kind or selector falls back to `"someone"` / `"a place"` / `"a unit"` — never a visibly broken string. **[VERIFIED-CODE]**

`[[term]]` wiki markup is described in `docs/content-schema-v0.1.md` and has a `WIKI_ENTRIES` registry, but that registry is empty, so every `[[term]]` currently renders unresolved. **[VERIFIED-RUN]**

---

## 5. Extension points — the cost of adding one effect type

There is **no registry file, no switch statement, and no dispatch table to edit**. `EFFECTS` is a plain object literal and dispatch is a single property lookup at `effects.js:546`. Adding a type is genuinely additive. **[VERIFIED-CODE]**

### 5.1 Engine-side: one function

```js
// src/game/effects.js — inside const EFFECTS = { … }
MY_NEW_EFFECT(state, e, ctx) {
  for (const t of resolveTargets(state, e.target, ctx)) { /* … */ }
}
```

That is the whole engine change. Nothing registers it, nothing enumerates it, nothing needs to know it exists. `applyEffect` finds it by key. **[VERIFIED-CODE]**

If the handler needs to import a module that itself imports `effects.js`, use the **side-effect registration** pattern instead, which the codebase already uses twice to break exactly that cycle:

```js
// src/game/<module>.js
import { EFFECTS } from "./effects.js";
EFFECTS.MY_NEW_EFFECT = function (state, e, ctx) { … };
```

`encounters.js:298-323` and `quests.js:99-166` both do this, with the reason stated in their headers. The cost is that the module must be imported somewhere reachable or the handler will not exist — currently guaranteed because `turn.js` imports `triggers.js` (→ `encounters.js`) and `quests.js`. **[VERIFIED-CODE]**

Optional extras, none required: a new event name in `events.js:19-60` if the effect should show in the feed (that list is described as append-only), and a case in `EventFeed.jsx` / `gameLogExport.js` for display.

### 5.2 Editor-side: four files, mechanical

`editor/README.md` states the checklist under "Schema sync", and it matches the code **[VERIFIED-CODE]**:

| Step | File | What |
|---|---|---|
| 1 | `editor/src/lib/schema.js:4-31` | add the name to `EFFECT_TYPES` |
| 2 | `editor/src/lib/schema.js:202-241` | add a row to `DEFAULT_PARAMS_BY_TYPE` |
| 3 | `editor/src/lib/validation.js:60-186` | add a `case` to the `validateEffect` switch |
| 4 | `editor/src/components/EffectEditor.jsx` | add the params form (25 KB file, one form per type) |

Plus `docs/content-schema-v0.1.md` §2, per that document's own rule.

### 5.3 Honest cost estimate

| Scope | Effort | Confidence |
|---|---|---|
| Engine handler only (usable by hand-written content and the harness) | **~30 minutes.** One function, no wiring. | **[VERIFIED-CODE]** — the pattern is unambiguous and there are 42 worked examples |
| Engine + full editor/import support | **~1–2 hours per type**, dominated by the `EffectEditor.jsx` params form | **[INFERRED]** from file size and the existing per-type form pattern; I did not modify it |
| A type needing new *engine state* (a new pool, a new sweep, a new turn-loop phase) | Materially more — the additive story stops holding | **[INFERRED]** |

The 19 engine-only types in §2.5 are exactly the backlog of step 1 done without steps 2–4. Bringing `GRANT_CHIP` alone into the editor list is the cheapest way to unlock reward-chip quest content, since the engine half already exists. **[INFERRED]**

---

## 6. Silent-failure inventory

Consolidated, because it is what a content diff most needs. In each case content validates, imports, exports, and runs — and does nothing.

| # | Failure | Ref |
|---|---|---|
| 1 | Six recipient tokens (`random`, `most-raided`, `least-engaged`, `lowest-standing-with:`, `highest-standing-with:`, `controller-of:`) resolve to their own literal string ⇒ effect skipped | `targeting.js:70-72` **[VERIFIED-RUN]** |
| 2 | `SET_FLAG` writes `entity.flags`; nothing in the engine ever reads it | `effects.js:260-267` **[VERIFIED-CODE]** |
| 3 | `SURCHARGE` pushes to `state.surcharges`; nothing ever reads it | `effects.js:322-332` **[VERIFIED-CODE]** |
| 4 | `SPAWN` and `PEEK` are empty function bodies | `effects.js:303-310` **[VERIFIED-CODE]** |
| 5 | `TRANSFER` with `what: "card"` returns immediately | `effects.js:270` **[VERIFIED-CODE]** |
| 6 | `MOVE_CARD` `selector: "all_matching"` degrades to index 0; `filter` ignored | `effects.js:244-252` **[VERIFIED-CODE]** |
| 7 | `CONVERT` on any pool other than `Resource`/`VP` silently converts scrap to scrap | `effects.js:19`, `:292-293` **[VERIFIED-CODE]** |
| 8 | `ADJUST_STANDING` where `player` resolves to the same id as `faction` is a no-op | `effects.js:356` **[VERIFIED-CODE]** |
| 9 | Quest beat `deliverCondition` is never read — the engine looks for `beat.condition`, so conditional beats fire unconditionally | `quests.js:93` vs `snapshot.js:120` **[VERIFIED-CODE]** |
| 10 | `CANCEL.condition` is accepted by the validator and ignored by the handler | `effects.js:518-520` **[VERIFIED-CODE]** |
| 11 | A malformed `triggerStrength` evaluates to `0`, which disqualifies the trigger entirely | `dsl.js:264`, `triggers.js:57-59` **[VERIFIED-CODE]** |
| 12 | HexFilter `terrain` / `hasRoad` match nothing until the terrain work track lands ⇒ no placement | `encounters.js:281-287` **[VERIFIED-CODE]** |
| 13 | World encounters and quest beats auto-resolve to choice index 0 with no UI | `turn.js:412`, `encounters.js:39-41`, `:80-93` **[VERIFIED-CODE]** |
| 14 | `PLACE_ENCOUNTER` with no matching hex fizzles silently | `encounters.js:198-200` **[VERIFIED-CODE]** |
| 15 | `GRANT_CHIP` with no possible recipient unit fizzles silently | `effects.js:135` **[VERIFIED-CODE]** |
| 16 | A `Val` string without a `.` is a literal, not a path — a typo'd path becomes a string comparison that is simply false | `dsl.js:42-46` **[VERIFIED-CODE]** |

The one **loud** failure: an unknown effect `type` throws and takes down the turn (`effects.js:547`).

---

## 7. Where the repo's own documents are wrong

Flagged because the content side may have been authored against them.

| Doc | Claim | Reality |
|---|---|---|
| `docs/chip-system-dependencies.md`, row S4 | "No `GRANT_CHIP`-style effect type exists (verified: `effects.js` has none…)" | **Stale.** `GRANT_CHIP` is implemented at `effects.js:116-152`. **[VERIFIED-RUN]** |
| `docs/content-schema-v0.1.md` §2 | "Effect type names — **locked, 23 total**" | The engine implements **42**. The 23 are a subset. **[VERIFIED-RUN]** |
| `docs/content-schema-v0.1.md` §3 | Recipient vocabulary "**locked**" | 6 of 14 are unimplemented in `targeting.js`. **[VERIFIED-RUN]** |
| `docs/content-schema-v0.1.md` §2 | `ADJUST_RESOURCE` — "`Tech` becomes `Research` with the engine tech wheel; not yet" | The wheel **has** landed. `effects.js:52-58` already routes both `"Tech"` and `"Research"` into `permanentResearch` + `recomputeResearch`. **[VERIFIED-CODE]** |
| `docs/content-schema-v0.1.md` §5 | DSL form list | Omits `zoc_contains`, which the engine implements (`dsl.js:116`). The editor also omits it and will reject it. **[VERIFIED-CODE]** |
| `docs/content-schema-v0.1.md` §5 | Path `state.activeQuests.<questId>.beatIndex` | `beatIndex` does not exist. The real record is `{questId, claimant, completedBeats[], deliveredBeats[], startedAt}` (`quests.js:109-115`). **[VERIFIED-CODE]** |
| `docs/mechanical-spec-v0.1.md` §15.11 | `state.fieldEncounterDeck` (renamed from `encounterDeck`) | The rename never happened. The live field is `state.encounterDeck` (`setup.js:386`). **[VERIFIED-CODE]** |
| `docs/mechanical-spec-v0.1.md` §15.9 | Content pipeline as `content/encounters/<id>.js` etc. | Superseded. Content is one generated file per registry under `src/game/content/`, sourced from Supabase. **[VERIFIED-CODE]** |
| `editor/README.md` + `validation.js:56` | "the locked 22-name list" / "locked list of 22" | The array holds **23**. Cosmetic, but the number appears in user-facing error strings. **[VERIFIED-CODE]** |

---

## 8. What validates content today

**In CI: nothing.** The only workflow is `.github/workflows/pages.yml`, which runs `npm ci && npm run build` (a Vite build) and deploys. No content validation, no tests. **[VERIFIED-CODE]**

**In `package.json`: nothing content-related.** The `check:*` scripts are Playwright UI checks (pooling, layers, routes, settlement, blockade, upkeep, setup, audio). There is no `test` script. **[VERIFIED-CODE]**

**Manually available:**

- `node src/game/harness.js [seed]` — a 351 KB headless harness that exercises the engine layer by layer, including a "LAYER 5.1 EFFECTS (track / standing / player flag / deferred queue)" section (`harness.js:354`). Not automated, not run by CI. **[VERIFIED-CODE]**
- `findUnsupportedTypes` / `choiceIsRunnable` (`content-loader.js:74-99`) — defined, exported, **called by nothing** in the shipping app. **[VERIFIED-CODE]**
- The editor's validators (`editor/src/lib/validation.js`, `editor/src/lib/dsl.js`), which run only inside the editor UI on save/import. **[VERIFIED-CODE]**

**Net:** the only real gate on incoming content is the editor's own validator, and it validates against the 23-name subset — not against what the engine can do, and not against what the engine will silently ignore.

---

## 9. Summary for the diff

1. **The system exists and is wired.** Field encounters have run in real games. World encounters and quests have never run against real content — both registries are literally `{}`.
2. **42 effect types are implemented**, not 23. The extra 19 (chips, fog, diplomacy — including `GRANT_CHIP`) run fine in the engine but are rejected by the editor and the JSON importer.
3. **Expect the mismatch to run in both directions.** The engine is *richer* than the schema doc, and *poorer* than the schema doc, in different places.
4. **The recipient-token gap is the sharpest edge.** Six documented tokens validate and then do nothing.
5. **A JSON import path already exists** and is explicitly built for authoring-agent output — `editor/src/lib/import.js`, seven table-keyed arrays of camelCase DB rows. It has one known column gap (`triggerWeight`).
6. **Adding an effect type is cheap on the engine side** (one function in a plain object) and moderate on the editor side (four files, one of them a params form).
7. **Nothing validates content in CI.** Getting a diff clean is a human/agent responsibility, not a pipeline's.

---

*Compiled by the game-side agent, 2026-08-21, against `main @ d623ae0`. Read-only survey; no engine or content file was modified. Every `file:line` reference is checkable at that commit.*


---

# Read this first: `active` means "whose turn", not "whose card"

Five separate defects during this build reduced to one sentence, and anyone
adding a feature to this engine needs it before they write the code:

> **`active` answers *whose turn is it*. Authored content is almost always
> asking *whose card is this*. They coincide only during a player's own turn,
> and encounters are overwhelmingly delivered outside it.**

The round-end pipeline (`turn.js runRoundEnd`) runs *after* `endTurn` has
wrapped `activeIndex` back to seat 0. World encounters, conditional quest
beats, deferred packets and trigger evaluation all resolve there. A queued
encounter is answered later still, whenever the player gets to it. In every
one of those paths, "the active seat" is a bystander.

`ctx.asPlayer` is the answer: it names who an evaluation or application is
*on behalf of*, and takes precedence over whose turn it is. Where it is
absent — reactive cards, abilities, the action dispatcher, anything genuinely
about the current turn — `active` still correctly means the active seat.

The five instances, each found only when it bit:

| # | Where | Symptom |
|---|---|---|
| 1 | Condition gates (`dsl.js`) | Gates tested seat 0 whoever the quest belonged to |
| 2 | Effect targets (`targeting.js`) | Flags, rewards and costs landed on the wrong faction |
| 3 | Delivery recipients (`quests.js`) | A beat was answered by an AI not on the quest |
| 4 | Deferred queueing (`effects.js`) | All 30 `*_due` pacing flags could land on a bystander |
| 5 | Trigger evaluation (`triggers.js`) | **Every** world encounter always went to seat 0 |

Details of each are in A12, A16 and A18.

---

# Addendum — 2026-08-21, during the import build

Written while landing the reachability fixes. Everything above describes the
engine as surveyed; this records what changed, and three things that are easy
to get wrong and were each got wrong at least once today.

## A1. Vocabulary — say which of the three you mean

The word "encounter" is used loosely across this repo and it caused real
confusion. Three distinct things:

| Term | What it is | Where it lives | How it reaches a player |
|---|---|---|---|
| **Field encounter** | A single-shot card. One beat, 2–3 choices. | `FIELD_ENCOUNTERS`, shuffled into `state.encounterDeck` with `copies` entries each | Drawn when a unit ends a Move on an `encounter` hex |
| **World encounter** | A single-shot ambient event. One beat. Not a deck — scored and fired. | `WORLD_ENCOUNTERS`, doubling as the trigger registry | Top-N by `strength × weight` at round end |
| **Quest** | A multi-beat story. Beats are encounter-*shaped* but are not encounters. | `QUESTS`, beats in `quest_beats` | Beat by beat, gated by prereqs + `deliverCondition`, routed per choice |

**The rule that matters, stated so it is usable:**

> **The table a thing lives in does not tell you where it fires. The
> `deliver` mode does.**

Keying behaviour off the registry misclassifies 28 of 35 quests — 22 open by
`discovered` (a marker on the map, resolved by walking onto it) and the rest
by `conditional` or `auto` (delivered directly). Two beats in the same quest,
in the same table, reach the player by completely different routes and carry
completely different context. A beat delivered by marker has a `sourceHex`; a
`conditional` beat has none.

That distinction is precisely the marker bug: a quest **beat** looks like an
encounter, is delivered by the same code, and emits the same
`encounter_delivered` event — but it is not in either encounter registry, so
resolving one *by id* fails. And it is precisely the `encounter-hex` bug: an
ending beat says "here" while having no hex of its own. Ask what the deliver
mode is before assuming what context exists.

"Multi-beat encounter" is a fourth thing and it is neither: it is a chain of
world/field encounter rows linked by `DELIVER_ENCOUNTER`, with sub-beats
suppressed by sentinel (`copies: 0` / `triggerCondition: false`).

## A2. `techLevel` is not a gate — it is 1 for everybody from turn one

Verified on a fresh game: every player starts with `techLevel: 1`,
`research: 0`, `permanentResearch: 0`, `techWheel: []`.

So `players.<pid>.techLevel >= 1` is **true for all four players before
anyone has done anything.** It looks like a capability check and is not one.
Content authored against it gates nothing.

This is the shape to watch for generally: a gate that reads plausibly, resolves
cleanly, and is constant. It is worse than a broken gate because nothing
errors. For real capability questions use the predicates in A4 — and for "has
this player built a lab", the answer is a chip query, not a tech query.

## A3. What changed in the engine

**Val resolution (`dsl.js`)** — a string operand was a path only if it
contained a `.`, so `"round"` was the literal string `"round"`; and the
documented form `"state.round"` walked a `state.state` that does not exist.
**A round comparison was unwriteable in either form.** Now: a leading `state.`
is stripped, recipient tokens are substituted per path segment
(`players.active.vp` works), a bare word naming a top-level *numeric or
boolean* state key resolves, and `{ path: "round" }` is the explicit escape.
Bare faction/token operands resolve to player ids, so `{op:"ne", left:"active",
right:"versari"}` finally compares a pid to a pid — it was comparing two
literals and returning true for everyone, which made every faction exclusion
in the game inert.

**Unknown condition forms are loud (`dsl.js`)** — `evalCond` used to `return
false` for anything it did not recognise. That single line is the shape of
most silent failures in this document: an unknown form gates a choice, reads
false, the choice is filtered out of `eligible`, and the player never sees it.
Now it warns once per distinct form, records onto `state.__unknownCondForms`,
and `setConditionStrictness(true)` makes it throw for validation and tests.
Runtime still fails closed — one typo should not take down a turn — but it is
no longer silent.

**Capability predicates (`dsl.js`)** — `has_tech` / `count_tech` query the
wheel by path, branch or layer, so "has this player put anything into
Espionage" is expressible without naming leaf nodes; `count_chips` and a
generalised `has_chip` (which now accepts a list of chip ids, so content need
not know tier names) answer the buildings-and-upgrades half. `count_flags`
reads the moral ledger.

**Place scoping (`targeting.js`, `dsl.js`)** — a hex token vocabulary
(`encounter-hex`, `unit-hex`, `capital-hex`) resolved by `resolveHex`, shared
by conditions and effects. This is what makes "a lab **at this hex**" sayable:
a lab anywhere in your territory cannot study *this* ruin.

**Per-choice quest routing (`quests.js`)** — `ADVANCE_QUEST` naming a beat
other than the one being resolved is now a route ("this choice leads to that
beat") rather than an advance. It previously marked the destination complete
*without delivering it*, so a player was routed away from the branch they
chose and into one they did not.

**`deliverCondition` (`quests.js`)** — the exporter writes
`deliverCondition`, this module read only `condition`. Every editor-authored
gate was ignored, collapsing both branching and multi-round pacing.

**Beat-delivery re-entrancy (`quests.js`)** — the delivery loop iterated a
stale snapshot while recursive advances mutated it, re-delivering a beat after
its quest had completed and been removed from `state.activeQuests`.

**Quest offering (`quests.js`, `turn.js`)** — nothing populated
`state.activeQuests`, and nothing in the authored corpus emits `START_QUEST`,
so no quest could begin at all. Un-started quests whose opening beat's gate
passes are now offered at the start of a player's turn — inside their own
turn, so `active` in an opener gate means the player being offered it.

**Placement markers carry their definition (`encounters.js`)** — a marker
stored only an `encounterId`, resolved via `getEncounter`, which searches the
world and field registries. A quest beat is in neither. Every `discovered`
quest beat — 22 of 35 quests — dropped a marker that could never resolve.
Markers now carry the definition and the quest context.

**Range filters no longer throw (`encounters.js`, `board.js`)** — a
`withinHexesOf` anchored on an unresolvable hex walked an undefined adjacency
row and took down the turn.

**Flag expiry (`effects.js`, `turn.js`)** — `SET_PLAYER_FLAG` stored a
`duration` that nothing ever expired, so every "for a while" arrangement was
permanent. Flags with `durationRounds` now lapse on a round-end sweep, and
safe-passage grants written against a flag lapse with it.

## A4. Deliberately parked

- **Adverse field encounters.** The intent is on record: a skip/foresight
  ability is only worth taking if some draws are worth avoiding, and none of
  the current field encounters are inherently negative. This is content work,
  not engine work, and is explicitly deferred — noted here so it is not lost.
- **The redraw chip.** `recon-team` (Location) and `trailwise` (unit) carry
  `encounterRedraws` and genuinely work — engine, UI and harness coverage.
  Any decision to remove them is removing a working mechanic, not a dead one.
  They are **independent definitions** sharing only the schema field, which
  `encounterRedrawBudget` reads generically; neither removal touches the other.

## A5. Chip purchase paths — audited, and there is no orphan tier

Checked because a quest-reward tier of "chips with no way to buy them" was
believed to exist. **It does not.** All 41 chips are accounted for:

- **6 reward chips** — `cold-camp`, `night-march`, `war-banner`, `old-hands`,
  `safe-conduct`, `relay-kit`. Flagged `reward: true`, excluded from build
  menus at `economy.js:106`, obtainable only via `GRANT_CHIP`.
- **35 buildable** — every one has a `buildCost` and appears in
  `buildableChips()`, subject to the faction / tech / loyalty gates there.
- **Zero** chips with no purchase path. **Zero** upgrade-only chips.

`trailwise` specifically is **buildable** — unit kind, cost 3, techLevel 1,
loyaltyReq 0 — a standard purchasable chip, not part of the reward tier.

The reward tier is real, well-formed, and **already half-built**: the six
chips exist, `economy.js` excludes them from menus, and `GRANT_CHIP` is
implemented — but no authored content grants any of them, so all six are
currently unobtainable by any route. That is the actual gap, and it is one
content change (a `GRANT_CHIP` on a quest reward choice) rather than an
engine one.

## A6. Deferred intent, recorded so it is not re-derived

- **Adverse field encounters.** A skip/foresight ability is only worth taking
  if some draws are worth avoiding; none of the current field encounters are
  inherently negative. Content work, explicitly deferred.
- **Quest-granted chips.** The six reward chips above have no granting
  content. Deferred.
- **Terrain sub-types.** `hex.terrain` is null until the terrain+roads work
  track lands, so any `terrain:` or `hasRoad:` filter matches nothing. This
  is not a bug — `encounters.js:281-284` says so — but it currently blocks
  three quests from ever placing their opening beat (see A7).
- **Honour balance — the scale is asymmetric and nobody has checked whether
  that is intended.** Flagged by the user, recorded here rather than acted on.
  Details and the first real measurements are below.

### A6.1 Honour, measured — read this before quoting any earlier honour figure

**Every honour number taken before this one was measured in a game nobody was
playing.** Neither `scripts/find-beat-paths.mjs` nor `scripts/coverage-walk.mjs`
imported `src/game/ai.js`, so no seat ever ran `takeAITurn`: no economy, no
builds, no research, no diplomacy, no contests. Honour therefore sat at its
start value forever, which is why `qb_tem_1`'s `{score:{kind:"honor"}} <= 2`
gate read as unsatisfiable. It is not. Discard any prior figure.

**Configured scale** (`config.js:447-460`) **[VERIFIED-CODE]**:

```
honor: { start: 4, min: -12, max: 12,
         keepGain: 1, mediateGain: 2, denounceWarrantedGain: 1,
         breakLoss: 5, denounceLoss: 3, surpriseAttackLoss: 8,
         decayToward: 0, decayPerRound: 0 }
```

Neutral is **4**, the floor is **-12** and the ceiling is **+12** — 16 points of
room below the start and 8 above. The losses are also much larger than the
gains (a surprise attack is -8 and breaking your word -5, against +1 for
keeping a pact and +2 for mediating), and `decayPerRound: 0` means nothing
pulls a player back toward neutral. The slope runs one way.

**Measured distribution** — 6 seeds x 4 seats = 24 seat-campaigns, 80 game
rounds each, every seat driven by `takeAITurn`. **[VERIFIED-RUN]**

| | |
|---|---|
| Minimum reached, per seat-campaign | **-12: 13** · -10: 1 · -9: 1 · -5: 1 · -4: 1 · 0: 1 · 3: 2 · **never below 4: 4** |
| End-of-campaign value | +12: 6 · 4: 1 · 0: 2 · -3: 2 · -8: 2 · -10: 5 · -12: 6 |
| Reached <= 2 at some point | **18 / 24** |
| Reached <= 3 at some point | **20 / 24** |

So more than half of all seat-campaigns end up pinned at the floor, a quarter
never move off the start value at all, and the distribution is bimodal — the
middle of the range is nearly empty. A scale whose neutral point is 4 and whose
occupied values are mostly -12 or +12 is not obviously the scale the design
intended, and no one has looked at it.

**What this does NOT mean.** It is not a reachability problem. `q_tempest`'s
gate at `<= 2` is satisfiable and all five of its beats now reach on 6/6 boards
and 4/4 seats by round 9-16. A proposal to raise that gate to 3 was withdrawn
on these numbers: it would have bought two seat-campaigns and been a content
change made on the strength of a broken instrument. Content gates that read
honour are fine as authored. The open question is whether the *scale* is.

## A7. Why quests fail to reach their beats — the three real classes

Measured by driving all 35 quests through the engine, not by inspection.
None of the three is an engine defect.

1. **Terrain filters match nothing** — `{type:"terrain", terrain:"rubble"}`
   and `{... "wetland"}` find no hex, so the opener never places.
   Blocks `q_works`, `q_glass`, `q_ford` entirely. Waits on the terrain track.
2. **Correctly gated sequels** — eight quests open on a flag another quest
   writes (`rule_soft_petition_granted`, `steward_appointed`,
   `blamed_for_barons_war`, `mas_knows_location`, …). Unreachable in a
   single-quest walk *by design*; they need the prerequisite content played
   first. This is why a campaign-level walk is necessary and a per-quest one
   structurally cannot test the `count_flags` ledger.
3. **Faction and round openers** — `{op:"ne", left:"active", right:"versari"}`
   plus `round >= N`. Correct after the Val fix; a walk that always drives
   the same seat simply never satisfies them.


## A8. Capability and ledger predicates — literal parameter shapes

Normative. These are read off the implementation in `src/game/dsl.js`, not
paraphrased. Where A3 announced these forms, this is their specification.

### `has_chip` — bool. Buildings and installed upgrades.

```js
{ has_chip: {
    holder:  "active-player-units" | "active-player-locations"
           | "any-unit-on-hex" | "location-on-hex" | "any-location-on-hex",
    chipId:  "labs" | ["labs", "advanced-lab"],   // id OR array; matches ANY
    player?: "active",        // token or pid; on-hex scopes: adds ownership
    hex?:    "encounter-hex", // token, dot-path, or literal id
} }
```

- **The list key is `chipId`.** It accepts a string or an array. There is no
  `chipIds`. Content should not have to know tier names, so prefer the array.
- **`location-on-hex`** scopes to the location standing on one hex.
  `any-location-on-hex` is a retained alias for the same behaviour.
  `active-player-locations` is the territory-wide scope and is **too broad**
  for place-bound content — a lab anywhere in your land cannot study *this*
  ruin.
- **`hex` accepts `"encounter-hex"` directly** and defaults to it when
  omitted, so the common case needs no `hex` key at all. On an on-hex scope,
  adding `player` requires the location be controlled by that player.

**The lab chip ids are `labs` and `advanced-lab`.** Both are `kind:
"location"`, i.e. buildings. There are exactly two; no other chip grants
research.

### `has_tech` / `count_tech` — bool / int. Wheel investment.

```js
{ has_tech:   { path?, branch?, layer?, node?, minNodes?, player? } }  // bool
{ count_tech: { path?, branch?, layer?, player? } }                    // int
```

- **`path` and `branch` COMBINE** — `branch` narrows *within* `path`, it does
  not replace it. `{path:"intelligence", branch:"b"}` is the Espionage fork.
- **Espionage is `path: "intelligence", branch: "b"`.** The four paths are
  `military` | `logistics` | `economy` | `intelligence`; branches are `"a"`
  and `"b"`. Intelligence's `a` is Vision, `b` is Espionage.
- `branch` deliberately **excludes the entry node** — it belongs to no fork,
  so "invested in Espionage" means having gone down that fork, not merely
  having opened the path.
- `node` tests one specific node id (`"int-b1"`) and ignores the filters.
- `minNodes` defaults to 1, so `has_tech` is "any investment in".

### `count_flags` — int. The moral ledger.

```js
{ count_flags: { prefix: "rule_hard_", player?: "active" } }
```

Counts currently-set player flags whose name starts with `prefix`. Expired
flags are already gone (see the flag-expiry sweep), so this reads a live
tally. Permanent flags — which the ledger entries are — never lapse.

### `count_chips` — int.

```js
{ count_chips: { chipId?, holder?: "any" | "locations" | "units"
                          | "location-on-hex" | "at-hex",
                 hex?, player?, includeDisabled?: false } }
```

### Not yet settled: `recon`

`recon` in authored content is **not** resolved to a tech branch. It may mean
scouts possessed rather than research invested — `recon-team` is a Location
chip carrying `encounterRedraws`, and the two call sites read as possession
("your scouts put glasses on the hollow") more than as research depth. Left
open deliberately rather than guessed. `intrigue` has no such ambiguity and
maps to `{has_tech:{path:"intelligence", branch:"b"}}`.


## A9. Measured reachability — 96 / 14 / 21 of 131

Produced by `scripts/coverage-walk.mjs`, which plays whole games rather than
driving one quest: **48 campaigns × 70 rounds, all four seats taken as the
human, randomised choice policies.** Re-run it with

```
node scripts/coverage-walk.mjs <content.json> [--campaigns N] [--rounds R]
```

Three categories, because one number would be dishonest.

| | Count | Meaning |
|---|---:|---|
| **DELIVERED** | **96** | Shown to a player in at least one campaign. Proven. |
| **UNREACHABLE** | **14** | Proven blocked, cause named below. |
| **NOT REACHED** | **21** | This harness did not get there. Not a verdict either way. |

Also proven: **18 / 18 world encounters** fire, and the moral ledger reaches
**9 concurrent `rule_*` flags against a threshold of 2** — so the
`count_flags` gates are comfortably trippable, which was the one thing no
argument could settle. **Zero runtime errors** across the whole run.

### The 14 unreachable trace to exactly two root causes

**Terrain sub-types are unset** — 9 beats. `hex.terrain` is null until the
terrain+roads work track lands, so `{terrain:"rubble"}` and
`{terrain:"wetland"}` match nothing. Directly blocks `qb_fd_1`, `qb_fd_2`,
`qb_wks_1`, `qb_gls_1`, `qb_gls_2`; and because a quest whose opening beat
cannot be placed can never start, it blocks the five downstream beats of
`q_works` by consequence.

**One placement filter finds no hex** — 4 beats. `qb_mas_compound` asks for
`{type:"location", factionAffiliation:"plainers", withinHexesOf:{hex:
"encounter-hex", range:1}}` — a Plainers-affiliated Location within one hex
of where the encounter fired. No sampled board satisfies it. That also takes
`q_haulers` with it, which opens on `mas_knows_location`, a flag only
`qb_mas_compound` writes. **This one looks like a content tuning issue rather
than an engine gap** — a wider range or a different affiliation would likely
resolve it, and it is worth an author's eye.

### The 21 not-reached are branch depth, not blockage

Concentrated in seven quests: `q_signal` (4), `q_caravan` (4), `q_baron` (3),
`q_apprentice` (3), `q_debtbook` (3), `q_claim` (2), plus `q_croppers` and
`q_runner` (1 each). These sit behind specific choice combinations, specific
flag states, or long deferred timers that a randomised policy did not happen
to hit. Raising campaign count moves this number; it moved from 45 to 29 to
21 as the search widened. **None of them is proven broken and none is proven
fine.**

### What building this instrument found

Two engine defects that only whole-game play exposes:

1. **Conditional beat gates were always evaluated as seat 0.** `endTurn`
   wraps `activeIndex` to 0 *before* `runRoundEnd` fires, so every gate
   reading `active` tested the first seat regardless of whose quest it was.
   Two quests gated on `{op:"ne", left:"active", right:"versari"}` could
   never open. Fixed with `ctx.asPlayer`, which evaluates a condition on
   behalf of a named player; quest gates now evaluate as their claimant and
   choice conditions as their recipient. This alone took `q_notes` and
   `q_seasons` from partial to complete.
2. **World encounters were untestable, and therefore untested.**
   `triggers.js` closed over the imported `WORLD_ENCOUNTERS` constant, so
   injected content was invisible to trigger evaluation and the whole
   trigger pipeline had only ever run against an empty registry. Now read
   through a live accessor with `registerWorldEncounter` alongside the
   existing `registerQuest`. All 18 fire.


## A10. Placement-filter vocabulary — what a `discovered` beat can actually filter on

Measured off generated boards, not read off the schema. A default board is
**30 hexes: 10 `location`, 13 `encounter`, 7 `terrain`.** Counts below are
from seed 11; the shape holds across seeds.

**This is the input for re-siting the terrain-blocked quests.**

| Key | Status | Values that exist today |
|---|---|---|
| `type` | ✅ **works** | `"location"` (10) · `"encounter"` (13) · `"terrain"` (7) · `"any"` |
| `hasRoad` | ✅ **works** | `true` (15 hexes) · `false` (15). **Corrects an earlier claim in §4.9** that this was inert — `hex.road` *is* populated. |
| `factionAffiliation` | ✅ works | `versari` (2) · `goldgrass` (2) · `lakers` (2) · `plainers` (2) · `"unaffiliated"` (2) · `"any"` |
| `strategicValue` | ✅ works | `"high"` (5) · `"veryHigh"` (2) · `"medium"` (3). **No `"low"` location exists on a default board** — a filter asking for it matches nothing. |
| `controlledBy` | ✅ works | a pid · `"neutral"` (6 at setup) · `"any-player"` (4 at setup) · `"any"` |
| `notControlledBy` | ✅ works | a pid · `"any-player"` |
| `withinHexesOf` | ✅ works | `{hex, range}` — `hex` takes a hex id **or a token** (`"encounter-hex"`, `"unit-hex"`, `"capital-hex"`) |
| `outsideHexesOf` | ✅ works | as above |
| `hasChip` / `notHasChip` | ⚠️ works, but | matches only chips actually installed. At setup the sole location chip is `capital`; anything else requires the player to have built it. Safe for "has a capital", unreliable as an opener gate. |
| `hasAbility` | ❌ **dead** | no generated location carries an `abilityId`, so `"any"` matches nothing and a specific id never matches. |
| `terrain` | ❌ **dead** | `hex.terrain` is `null` on all 30 hexes. Per design ruling, `rubble` and `wetland` will not exist. Do not re-site onto any terrain sub-type. |

**Richest usable dimensions for re-siting:** `type` × `hasRoad` ×
`factionAffiliation` × `strategicValue`, optionally anchored with
`withinHexesOf`. That is a large space — e.g. `{type:"terrain",
hasRoad:false}` finds a hex on 12/12 sampled boards, and `{type:"encounter",
hasRoad:true}` on 12/12.

**On `qb_mas_compound` specifically** — its filter fails only because of the
range, not the shape. Measured across 12 boards:

| Filter | Hit rate |
|---|---|
| `{type:"location", factionAffiliation:"plainers", withinHexesOf:{hex:"encounter-hex", range:1}}` | **0 / 12** |
| same, `range: 2` | 7 / 12 |
| same, `range: 3` | **9 / 12** |

Widening to 3 recovers that beat and unblocks `q_haulers`, which opens on a
flag only `qb_mas_compound` writes. Still not universal — a placement that
must be satisfiable on *every* board wants a fallback clause or a wider
anchor.

## A11. Delivery-once is engine-held, with no content backstop

`scripts/check-delivery-once.mjs` — run it against the content JSON.

Measured: **35 opening beats, 20 of them self-guarded with
`not has_flag seen_X`. 96 non-opening beats, ZERO self-guarded.** Every gate
those 96 use reads a permanent flag that never stops being true.

So "each beat is shown once" rests entirely on
`activeQuests[q].deliveredBeats` / `completedBeats`. There is no second line
of defence, and the test proves it rather than asserting it: with the
prerequisite still satisfied and only the *already-shown* record lost, a
gated beat delivered once then delivers **twice**.

That is not theoretical — a re-entrancy bug in this exact loop was found and
fixed during this build, and it re-delivered a beat after its quest had
completed. There is no save/load yet; when there is, a round-trip that drops
or reorders these arrays breaks 96 of 131 beats, and it will present as
content repeating rather than as a serialisation fault.

The static half of the test is deliberately written to fail if content ever
*grows* a backstop, because that changes the risk profile and should be
noticed.


## A12. The `active` bug family — three defects, one root cause

Found by `scripts/find-beat-paths.mjs`, which constructs a route to a target
beat rather than waiting for one. Its value was not the routes; it was that
when a route failed it could say *why*, and the why turned out to be the same
sentence three times.

**Root cause.** `endTurn` wraps `activeIndex` back to seat 0 *before*
`runRoundEnd` fires. Every encounter delivered from the round-end pipeline —
which is all world encounters and all conditional quest beats — therefore
resolves while seat 0 is nominally active, whoever the card is actually for.
And `active` in this engine means *whose turn it is*, not *whose card this
is*. Those are different questions and the content only ever meant the second.

**Defect 1 — condition gates.** Fixed earlier: a gate reading
`{op:"ne", left:"active", right:"versari"}` tested seat 0 regardless of whose
quest it was.

**Defect 2 — effect targets.** `target: "active"` resolved to the active
*seat*. Isolated and demonstrated: an encounter delivered to `lakers` while
`versari` held the turn wrote its flag onto **versari**. `SET_PLAYER_FLAG` is
the most-used effect in the corpus (378 instances) and `target: "active"` is
its ordinary value, so **rewards, costs, standing changes and gate flags have
been landing on the wrong faction for every round-end delivery.** This is a
correctness bug well beyond reachability — a player could be charged for a
choice another faction made.

**Defect 3 — delivery recipients.** A quest beat whose recipient resolves
through `active` was handed to whichever seat was mid-turn, who then answered
it headlessly at choice 0 on the claimant's behalf. The claimant never saw
their own quest.

**The fix** is one idea applied consistently: `ctx.asPlayer` names who an
evaluation or application is *on behalf of*, and takes precedence over whose
turn it is. Conditions honour it (`dsl.js`), targets honour it
(`targeting.js`), quest beats set it to their claimant (`quests.js`), and a
queued encounter carries it so the effects still resolve as the recipient's
whenever they get round to answering (`encounters.js`).

Where `asPlayer` is absent — reactive cards, abilities, anything genuinely
about the current turn — `active` still means the active seat. Verified both
ways.

**Coverage moved 96 → 99**, but the coverage number badly understates this
one. Most of the mis-delivered effects were landing *somewhere*, so nothing
crashed and nothing looked wrong; they were simply landing on the wrong
player. That is the failure mode this whole document keeps circling: not an
error, just a quiet wrong answer.


## A13. Placement, measured — re-siting answers

### `"any"` is a wildcard, and it short-circuits

```js
if (f.terrain && f.terrain !== "any" && h.terrain !== f.terrain) return false;
```

The `!== "any"` guard skips the clause entirely — it never reaches the
comparison against `null`. So **`{terrain:"any"}` matches every hex: 12/12
boards.** `type` uses the identical pattern and behaves the same way.

This corrects §A10 by omission: `terrain` is dead **only for specific
sub-types**. A beat asking for `"any"` was never blocked, and the beats using
it place today.

### Measured hit rates, 12 generated boards

| Filter | Hit rate | Note |
|---|---|---|
| `{hasRoad:true}` | **12/12** | Works bare — no need to add a `type` |
| `{type:"terrain", hasRoad:false}` | **12/12** | |
| `{type:"encounter", hasRoad:true}` | 12/12 | Confirmed, but unnecessary |
| `{type:"terrain", hasRoad:true}` | **8/12** | ⚠️ Avoid — only 7 terrain hexes and roads don't always cross them |
| `{terrain:"any"}` | 12/12 | Wildcard, see above |
| `{type:"location", factionAffiliation:"plainers"}` | **12/12** | 2 such locations per board |
| same + `withinHexesOf` range 3 | 9/12 | |

### Ordered filter lists — the fallback clause now exists

`pickHexByFilter` accepts a **list** of filters, tried in order until one
matches. `hexMatches` ANDs every key and has no OR and no NOT, so "beside the
tracks if you can, anywhere in their land if you can't" previously had no way
to be written at all.

This is worth having generally, not just here. A filter that merely *usually*
matches is not a softer version of one that always does: a beat whose
placement misses is a beat nobody sees, and where a later quest gates on a
flag only that beat writes, one unlucky board silently costs two quests.

Measured on `qb_mas_compound`:

```json
[ { "type":"location", "factionAffiliation":"plainers",
    "withinHexesOf": { "hex":"encounter-hex", "range":3 } },
  { "type":"location", "factionAffiliation":"plainers" } ]
```

**12/12 placement, with the preferred adjacent placement used on 9/12.** The
fiction is kept wherever the board allows it and guaranteed everywhere else.

**Is the adjacency load-bearing?** Read the prose: *"The tracks end at a wall
built out of the old world… A man on the rampart watches your unit come the
last half mile."* The beat is following tracks to where they lead — a spatial
relationship is real, but "the last half mile" implies travel, not adjacency.
Range 1 is far tighter than the fiction asks. So: keep it as a preference,
never as a requirement.

### Blocked-opener reconciliation

Both counts were right, measuring different things:

- **14** = *beats*, including 8 attributed downstream to an upstream blocker.
- **6** of those are directly blocked by their own filter.
- **3** of those are *openers* blocked by their own placement filter:
  `qb_fd_1` (q_ford), `qb_gls_1` (q_glass), `qb_wks_1` (q_works).
- `qb_hau_1` (q_haulers) is a fourth blocked opener, but by *dependency* —
  it gates on a flag only `qb_mas_compound` writes — not by its own filter.

So "three openers blocked by placement" is correct, and the `terrain:"any"`
finding is why `q_croppers` and `q_road` were never in that set.


## A14. Gates were only ever honoured on `conditional` beats

The largest correctness defect found so far, and it was found by chasing one
beat that would not appear.

**`evaluateBeatDelivery` never checked `deliverCondition` at all.** It
filtered out `conditional` beats — those wait for the round-end pulse — and
then delivered any other ready beat outright. So a gate on an `auto` or
`discovered` beat was simply ignored.

That is not a rare shape. Of 131 beats:

| Deliver mode | Count | Gate honoured before? |
|---|---:|---|
| `conditional` + gate | 61 | ✅ yes |
| `discovered` + gate | 20 | ❌ **no** |
| `auto` + gate | 19 | ❌ **no** |
| `discovered` / `auto`, no gate | 31 | n/a |

**39 beats — 30% of the corpus — had their delivery condition ignored.**

The symptom was quests racing to the end. `q_runner` delivered beats 1, 2 and
3 back-to-back inside round 1 and then completed, while the deferred timer
its fourth beat waits on was still sitting in the queue. Nine of `q_signal`'s
ten beats are shaped this way.

**Fix:** a beat's gate applies whatever its deliver mode. `conditional` says
only *when* the gate is re-checked — on the round-end pulse, so it can see
deferred effects that landed this round — not that it is the only kind of
beat that has one. Gated `auto` / `discovered` beats are now also re-checked
on the pulse, so one that missed its moment is retried rather than lost.

**Measured coverage moved 99 → 97, and that is the fix working.** Beats that
were firing unconditionally now require their condition to actually hold. The
higher number was counting deliveries the content never intended.

## A15. `qb_run_4` — explained, and not a defect

The beat that exposed A14. It is reachable, behind exactly one choice.

`qb_run_3` offers three options:

| Choice | Effects |
|---|---|
| "Sell them the shell" | `ADJUST_RESOURCE`, `ADJUST_STANDING`, flag, **`COMPLETE_QUEST`** |
| "Say nothing about it" | flag, **`COMPLETE_QUEST`** |
| **"Trade it for the work"** | **`QUEUE_DEFERRED` 5 rounds → `run_season_due`**, flag, `ADJUST_STANDING`, `ADVANCE_QUEST` |

Two of the three deliberately end the story. Only the third arms the timer
that `qb_run_4` gates on and advances the quest. That is authored branching
working exactly as written — a random walk ends the quest two times in three
before the fourth beat can exist.

**This is the general shape of what remains unreached.** With 111 authored
`COMPLETE_QUEST` effects across the corpus, most deep beats sit behind a
specific choice whose siblings close the line. Random exploration is the
wrong instrument for them by construction; a directed search that reads the
gate and steers toward the choice that satisfies it is the right one, which
is why `scripts/find-beat-paths.mjs` exists.

**Status of the directed search:** it was reaching 7 of 21 before A14 landed.
The gate fix changed the scheduling semantics it was tuned against — beats it
used to reach in the same round now legitimately wait for a pulse — so it
needs retuning before its numbers mean anything again. Reported as unfinished
rather than quoted, because a stale figure here would be exactly the kind of
confident-but-wrong number this document keeps warning about.


## A16. `QUEUE_DEFERRED` snapshotted the wrong player — the fourth `active` defect

Found by tracing one beat that would not open. The route was correct, the
choice was correct, the quest stayed alive, the packet was queued with the
right due round, the sweep fired it on schedule — and the flag still never
appeared on the player who made the choice.

`QUEUE_DEFERRED` resolves `active` / `active_player` inside its payload at
**queue time** and stores the concrete pid, so the packet lands on the right
player N rounds later even though the turn order has moved on. Sound idea;
wrong player. It snapshotted `state.turnOrder[state.activeIndex]` — whoever
held the turn at that instant — rather than the recipient of the card whose
choice queued it.

A queued encounter is answered whenever the player reaches it, and the
round-end pipeline resolves with seat 0 nominally active, so that snapshot was
routinely a bystander. **Every deferred consequence in the game — 77
`QUEUE_DEFERRED` effects, which is how all 30 `*_due` pacing flags are
written — was liable to land on the wrong faction.** The beat waiting on the
flag then never opened for the player who had earned it.

Fixed: snapshot to `ctx.asPlayer ?? active`, and have the sweep resolve any
surviving tokens as the original queuer.

**Verified on the case that exposed it.** `q_runner` now runs
beat 1 → beat 2 → beat 3 ("Trade it for the work", arming a 5-round timer)
in round 1, and delivers **beat 4 in round 6** — exactly the authored pacing,
with `run_season_due` held by the player who chose it. That is the first time
a deferred timer has driven a beat correctly.

**Coverage 97 → 105.**

This is the fourth defect in the family, after condition gates, effect
targets and delivery recipients. The pattern is worth stating once more,
because it will recur anywhere new code asks "who is this for?": in this
engine `active` answers *whose turn is it*, and almost everything in authored
content is asking *whose card is this*. They coincide only during a player's
own turn, and encounters are overwhelmingly delivered outside it.

## A17. The paths artifact

`docs/encounter-import/beat-paths.md`, regenerated by
`node scripts/find-beat-paths.mjs <content.json> [--boards N] [--rounds R]`.

For every beat it records a constructed route — the ordered
(round, quest, beat, choice) steps that produced it — plus how many correct
picks the route demands and the odds a player choosing blindly survives them.

At 3 boards per beat: **34 reached on every board, 69 reached on some, 28 with
no route found.** 103 of 131 therefore have a demonstrated witness.

**Read the middle category carefully.** "Reached sometimes" is
board-count-sensitive: at 3 boards a beat that appears on 2 shows as
`2/3` whether it is genuinely map-dependent or merely unlucky. The number
separates *proven on every board tried* from *proven at least once*, which is
the honest distinction — but it is not yet a measure of how map-dependent a
beat really is. Raising `--boards` sharpens it.


## A18. Every world encounter always went to seat 0 — the fifth defect

Found by a deliberate audit of the `active` surface rather than by it biting,
which is the first one that was.

All 18 authored world encounters carry `recipient: "active"`. Triggers are
evaluated in `runRoundEnd`, which calls `evaluateTriggers(state)` with no
context at all — so both the trigger's *condition* and its *recipient*
resolved against seat 0, every round, forever.

**Measured before the fix: 108 world-encounter deliveries across six games,
every single one to `versari`. The other three factions received none, ever.**
A human player not holding seat 0 would never see a world encounter in their
entire game.

It also silently flattened the trigger conditions. `we_petition` gates on
`not has_flag seen_petition` and escalates with `world.raidCounts` — all
per-player questions, all answered for one seat.

**Fix:** evaluate every trigger once per player, with `asPlayer` set, and
carry the chosen recipient into delivery. One firing per trigger per round is
preserved, so the same encounter cannot land on two factions in the same
breath, and `CONFIG.encounters.worldPerRound` still throttles the total.

**After: 102 / 90 / 84 / 84 deliveries across the four seats, all 18 distinct
encounters firing.**

### Audit result

Every other site that resolves `active` was checked. All effect handlers and
all DSL forms route through `resolveTargets` / `resolvePlayer`, both of which
honour `asPlayer`, so they were fixed by defects 1 and 2. The remaining direct
readers of `turnOrder[activeIndex]` are `reactions.js` (a reaction window —
genuinely the current turn), `quests.js offerQuests` (runs inside the
player's own turn), the action dispatcher, and the AI. All correct as written.

**One latent case, not a defect today:** `textTokens.js` resolves
`{faction:active}` to the turn-holder while `{faction:recipient}` resolves to
the reader. For prose rendered on someone's card, `recipient` is the one that
means "you". No authored content currently uses either token, so nothing is
wrong now — but a writer reaching for `{faction:active}` in encounter text
would get the same class of bug. Worth knowing before that text is written.


## A19. Board convergence — and a flaw in my own instrument

The middle category ("reached on some boards") was supposed to measure
map-dependence. It was measuring nothing of the kind.

Raising the board count from 3 to 6 moved every frequency by exactly the same
proportion: `qb_rail_3` went 1/3 → 2/6, `qb_app_1` 2/3 → 4/6, the whole
`q_notes` and `q_seasons` chains 2/3 → 4/6. Identical ratios, not
convergence. The cause was in the harness: it cycled the **seat** with the
board index, so a beat gated on `{op:"ne", left:"active", right:"versari"}`
scored "3 of 4 factions qualify" and reported it as a board frequency.
Raising the board count could never converge a number that was never about
boards.

**Fixed by measuring seat and board as independent variables** — every seat
tried across every board — and splitting the result into three:

| Status | 6 boards × 4 seats | Meaning |
|---|---:|---|
| `REACHED` | **46** | every board, every faction |
| `REACHED_SEAT_LIMITED` | **54** | every board, but only some factions — authored faction gating, not a fault |
| `REACHED_SOMETIMES` | **2** | genuinely map-dependent |
| `NOT_FOUND` | **29** | no route constructed |

**Genuinely map-dependent collapsed from 55 to 2.** Almost nothing in this
corpus depends on the map; it depends on which faction you are playing, which
is exactly what the content intends and what the old figure was hiding.

### Settled board count: 6

**6 boards × 4 seats = 24 attempts per beat, ~27.9s** for all 131 at 80 rounds
(13s at 3 boards / 70 rounds — cost is linear in attempts).

Six is where the aggregate stops moving: the map-dependent category holds at
2 at both 3 and 6 boards. Its *membership* still flickers between runs
(`qb_asm_1` and `qb_ret_3` at 3; `qb_asm_1` and `qb_cro_relic` at 6), because
those specific beats sit at the edge of what the search constructs. So: the
size of the category is trustworthy, the per-beat frequencies inside it are
not yet, and I would not quote an individual figure from it as final.

A 12-board run exceeded my own tooling's per-call timeout, so I have not
measured it. That is a limitation of how I invoke the script, not of the
script — `--boards 12` runs fine directly.

## A20. Content notes for whoever picks this up

Not engine findings; recorded here because this is the document an engine
developer opens.

- **`q_caravan`'s two execution branches differ only in whether the garrison
  watched the hanging.** That distinction is exactly the sort a later chain
  would want to read, and exactly the sort that gets flattened by someone
  consolidating "duplicate" branches. It is not duplication.
- **`{faction:active}` in encounter prose resolves to the turn-holder, not the
  reader.** `{faction:recipient}` is the one that means "you". No content
  uses either token yet — but the first writer to reach for `active` in a
  card's text will land the fifth defect's twin. See the note in A18.

## A21. Two analysis defects, one lesson — reaching the data is not reading it

Both found on the same day, both in tooling rather than in the engine, and
both produced a confident wrong answer rather than an obvious failure. Recorded
together because the second is the first one's smarter twin.

### The corpus is deeply nested and a flat scan cannot see it

**158 of the 1147 authored effects live inside another effect's parameters** —
`effects` (the `QUEUE_DEFERRED` payload, 102 at depth 1 and 4 at depth 2),
`onSuccess` (18) and `onFail` (16) on `ROLL`, `onWin` (11) and `onLose` (7) on
`CONTEST`, plus `options[].effects` on `FORCE_CHOICE`. **96 of those 158 are
`SET_PLAYER_FLAG`** — most of what the corpus writes is written from inside a
branch. `DELIVER_ENCOUNTER` occurs *only* nested and never at the top level.

An ad-hoc writer scan that descended into `effects` and `options` but not into
the four outcome keys undercounted the writers of **16 flags**, and reported
**10 flags as having no writer at all** when they have between one and four:
`bunker_blew`, `sig_clean_extraction`, `car_truth_recovered`,
`car_agent_captured`, `mas_took_spoils`, `tempest_victory`, `hire_won_open`,
`hire_lost`, `hire_won_trap`, `hire_missed`. `technician_stayed` reads 2
instead of 5; `sig_extracted` 2 instead of 6.

That produced a **wrong proven-unreachable verdict**: `qb_sig_dead` was
declared dead on the grounds that the only writer of `technician_dead` also
completed the quest. It is not — `ch_sig_force_assault` writes it from inside
`ROLL.onFail` at 55% and completes nothing. Audited properly afterwards:
**no beat and no choice in the corpus is gated on a flag nobody writes.** The
"no writer exists" category is empty and should be assumed empty until proven
otherwise.

`scripts/find-beat-paths.mjs` was never affected — its `scan()` already walked
all four outcome keys. The broken scan was a throwaway written alongside it to
explain its output. **The counts were sound and the prose on top of them was
not**, which is the worse of the two failures: a count is quoted with its
method, a verdict is quoted alone.

### Reaching a nested write and believing it is a different bug

Descending is necessary and not sufficient. The path finder saw
`ch_cro_baron_fight`'s `cro_has_relic` write inside `ROLL.onSuccess` and scored
it identically to `ch_cro_baron_barter`'s certain write of the same flag. The
two tied, array order handed the pick to the **30%** option, its roll failed on
every sampled board, and `qb_cro_relic` was reported as having no route. It has
one — forcing the barter label reaches it on 6/6 boards.

Writes now carry the probability of the branch they sit in and the scorer
weights by it: `onSuccess` = the authored `chance`, `onFail` = its complement,
`onWin` / `onLose` = even money (a contest outcome is not statically knowable),
`options[0]` = 1 and every later option 0 (headless resolution always takes the
first). Fixing this alone moved NOT_FOUND from 8 to 3.

**The lesson, stated for the next instrument:** a scanner that cannot reach the
data fails loudly and gets fixed. A scanner that reaches it and mis-weights it
returns a plausible number, and the only thing that catches it is checking a
specific claim against the content by hand. Prefer instruments that can be
asked "why" about a single case, and check at least one.

### A third of the same family — a row consistent with itself and with nothing else

Fifteen choice rows were authored with `parentKind: "beat"` where the other 299
in the corpus use `"quest_beat"`. `assemble()` keys every choice
`<parentKind>:<parentId>` and each consumer looks its own kind up, so those
rows were filed under a key nobody reads: **nine `q_tempest` beats were built
with an empty `choices` array**, could never be answered, and therefore could
never be delivered. No error anywhere. The only symptom was those beats
quietly not appearing in a coverage walk.

Every validator on both sides missed it, and the reason is worth keeping. The
content side's checks all compared the file to *itself* — is this reference
resolved, is this required key present, is this gate satisfiable — and the row
was internally perfectly coherent. It was inconsistent only with **the rest of
the corpus**, which nothing was looking at. The general assertion that catches
it without knowing the word `parentKind` exists: *no row carries a key its own
kind does not use, and none is missing a key the majority of its kind carries.*

Engine-side, `assemble()` now throws on an unrecognised choice `parentKind` and
on any quest beat that assembles with zero choices, naming every offender in
one pass. A typo in a content row should stop the build, not delete a quest.

### And a fourth, by the author of the third

Adding `onMissed` to `QUEUE_DEFERRED` (the deadline branch, §A24) created a
sixth nesting key. `find-beat-paths.mjs` was not told about it. The next run
declared `qb_tem_4_paid` and `qb_tem_4_none` **IMPOSSIBLE** — "gate needs a
flag no choice ever writes" — when `tempest_siege_over` has three writers, all
inside `onMissed`.

That is the same defect as the first one in this section, committed by the
person who had just written the first one up, one engine feature later. The
lesson does not transfer by being understood; it has to be built into the tool.
So the scanner now **fails loudly** if the corpus nests effects under a key it
does not walk, rather than silently omitting whatever is in there. The list of
keys is still explicit — predictability is worth more than cleverness — but a
mismatch between the list and the content is now an error, not an undercount.

All four defects in this section are the same shape wearing different clothes:
**the tool ran, returned a number, and the number was wrong.** Nothing crashed
in any of them. That is the failure mode this project produces, and the only
reliable defence found so far is to take one specific claim the instrument
makes and check it against the content by hand — which is exactly how this
fourth one was caught, by reading the three `onMissed` blocks before passing a
proven-unreachable verdict to anyone.

## A22. The die is the defence — a garrison-only Location is a fixed threshold

Measured while siting a quest siege, and recorded here because anyone tuning
garrison numbers later will otherwise reach the wrong conclusion.

`previewLocationContest` (`contest.js:134-193`) sets
`defenderRollsDie = !!defender` — a Location with **no defending unit on its
hex does not roll a d6 at all**. Its total is the static
`garrison + chipGarrison`. So a garrison-only defence is not a weak contest; it
is a **threshold**. Once the attacker's total clears it, the result is not
likely, it is certain.

**Measured on a capital (garrison 10), attacker units at the three strength
bands the campaign actually produces:** **[VERIFIED-RUN]**

| attackers | S=4 | S=5 | S=7 |
|---|---:|---:|---:|
| 1 unit | 0% | 16.7% | 50% |
| **2 units** | **83.3%** | **100%** | **100%** |
| 3 units | 100% | 100% | 100% |

Two units take an undefended capital essentially automatically — two units at
strength 5 are 10 Strength plus 1 Concentration, and 11 > 10 with no die to
save it.

**One defending unit changes the whole picture**, because it switches the die
back on *and* adds its Strength: garrison 10 + one defender at 5 = 15 against
an attacker's 11, which is **2.8%**.

Two consequences worth stating plainly:

1. **For balance work — adding one cheap unit to a Location is worth far more
   than raising its garrison number.** The unit buys a d6 and 4-8 Strength;
   the garrison buys only its own points and leaves the threshold behaviour in
   place. A designer reading only the garrison figures will badly misjudge how
   defensible a Location is.
2. **For the AI — the rule is "never leave the capital hex with zero units",
   not "reinforce to a target".** The cliff is entirely at the first unit;
   everything after it is ordinary contest arithmetic. That is a one-line
   invariant on top of the existing `underThreatAtHome` / `tryRecruit`
   primitives, not a reinforcement scheduler.

### Allied stacks — a hole this measurement exposed

Every "who is on my side" test in `contest.js` was `u.owner === pid`, so a unit
belonging to any other faction standing on the contested hex was neither
attacker nor defender: it did not exist for combat purposes. **"Fight alongside
an ally" had no representation anywhere in the combat model.** It surfaced on a
quest where a third faction joins the player's siege, but the hole is general.

`stackStrength`, `stackChipStrength` and `concentration` now take a *set* of
factions; `previewAttackerStrength(state, hex, pid, { allies })` and
`runContest`'s `params.allies` thread one through. A bare pid still works, so
every existing call site is unchanged.

Deliberately **opt-in**. `pactedAllies(state, pid)` is exported and a caller may
pass it, but a pact does not silently start contributing an ally's units to
every attack — that would rebalance every existing fight and invalidate the
AI's own pre-commit odds estimate (`acceptableOdds` previews attacker strength
before it decides to fight). Whether pacts should fight together by default is
a design decision and should be made deliberately, not inherited from this fix.

**Both sides now.** Design ruling: allies and vassals fight together, on the
same-hex rule — a unit standing on the contested hex fights, whoever owns it,
if it is allied. Nobody marches to anybody's aid; that is deliberately left for
later.

Two edges are decided in `previewLocationContest` rather than left to emerge:

- **Who defends a Location: its controller, and the controller's allies.**
- **Nobody fights on both sides.** A third faction pacted with the attacker
  *and* the controller is removed from the defence — the attacker brought
  them, so the attacker keeps them. Without the rule its Strength is counted
  twice, once per side.
- **The lead defender is still the controller's own strongest unit.** Allies
  add Strength and Concentration; they do not take the casualty. Attrition,
  retreat and veterancy all key off the lead, and an ally's unit dying for a
  Location it does not hold would be a surprising consequence of a treaty.

**Vassals need no separate code.** `vassalize` pushes a `{vassal: true}` pact
alongside the vassal record (`diplomacy.js:2216`), so a vassal bond already
satisfies `arePacted` and already lands in the allies set. It is **symmetric**,
because the underlying record is one undirected pact: the lord fights for the
vassal exactly as the vassal fights for the lord. Whether that is intended is a
design question — a lord defending a vassal reads naturally, a vassal dragged
into every one of the lord's wars is the classic complaint — and it is flagged
here rather than decided.

**The AI counts what is standing there.** `acceptableOdds` gates every AI
attack on `previewAttackerStrength` + `previewLocationContest`, and the latter
is now called with the attacker named so it applies the same ally rule the
resolution will. Verified behaviourally, not just structurally: a hex the AI
attacks against a lone garrison, it declines once an allied stack is on the
wall (`scripts/check-allied-stack.mjs`).

## A23. Capitals — destroyed on capture, rebuildable once, and usually empty

Two findings and one rule change, all about the same chip.

**Rebuildable.** `captureLocation` destroys the `capital` chip
(`contest.js:401-402`), and `CAPITAL` is `special: true` and lives outside
`CHIPS` — which `buildableChips` iterates — so a destroyed capital used to be
gone permanently, with no path back for anyone. It is now offered in the build
menu under exactly one condition: **the faction still holds a Location and has
no capital chip anywhere.** That is a recovery from losing your seat, never a
way to relocate a seat you still hold. Priced at **12**, level with the most
expensive chips in the game, and deliberately *not* gated on tech or Loyalty —
a faction that has just lost its capital is the one least able to clear a tech
bar or hold a freshly-taken city at high Loyalty, and a recovery option only
the strong can take is not a recovery option.
`scripts/check-capital-rebuild.mjs` covers both directions.

**Losing a capital is not elimination.** `sweepEliminations` (`turn.js:198`)
requires a faction to hold **no Locations and no units**. Taking a capital
flips one Location and destroys one chip; it is a step toward elimination, not
the thing itself.

**Capitals sit empty in real play — this is the number to know.** Sampled
across 8 seeds at six round-marks (44 game-states), with every seat driven by
`takeAITurn`: the Lakers' capital hex held **zero Lakers units in 5-8 of every
8 samples**, at every mark from round 8 to round 30. Combined with A22's
garrison-only threshold rule, that means a typical AI capital is a static
defence of 10 that does not roll — takeable by two ordinary units, reliably.

The consequence for content: **a quest that wants a defended capital has to
garrison it itself.** "The Lakers have two units on that hex" is a staging
instruction, not a description of the board.

**And how often does an ally happen to be standing there?** Same sample: the
Lakers were pacted with someone in roughly half of all game-states, but an
allied unit was actually standing on their capital in **4 of 44 — about 9%**.
Under the same-hex rule the pact alone is irrelevant; only co-location counts.
When it does happen it is decisive: one allied unit adds about +5 to the
defence, which moves a siege from favourable to hopeless. Unlike a placement
filter that silently finds no hex, this is visible — the contest preview shows
the real number before the player commits — so it is a hard fight rather than
a hidden trap. Worth an author's eye all the same.

## A24. Fields the engine reads that this document did not list

Recorded because the content side has twice had to read `quests.js` and
`deferred.js` directly to find out what it may write. This document is the
interface between the two sides; a field the engine honours and the contract
omits is a defect in the contract.

### `subjectFaction` on a quest — who the story is ABOUT

```js
QUESTS[id] = { id, mode, subjectFaction?, beats, completion }
```

A faction quest exists so a player can engage with a faction that is **not**
theirs — "you meet a Versari caravan" is not a story the Versari can be told.
`offerQuests` (`quests.js`) therefore never offers a quest to the faction named
in `subjectFaction`, and offers it to everyone else. Omit the field and the
quest is offered to all four.

Optional and declarative. Two quests express the same rule as an authored
opener gate instead — `{op:"ne", left:"active", right:"lakers"}` — and both
forms work; the field states the fact about the quest rather than repeating it
per beat, and can be checked mechanically against the fiction.

**[VERIFIED-RUN]** `scripts/check-quest-access.mjs` asserts, across three seat
orders, that an unsubjected quest reaches all four seats and a subjected one
reaches exactly the complement.

### Quest runs are per player

`state.activeQuests` is keyed **`questId|claimantPid`**, not `questId`. Each
player has their own `completedBeats` / `deliveredBeats` / `originHex`, and
`activeQuestFor(state, questId, pid)` is the accessor. §15.7 exclusivity means
*a player cannot start the same quest twice* — it does **not** mean one player
takes a quest out of circulation.

It used to mean exactly that, and combined with `offerQuests` claiming on a
player's behalf at the start of their turn it made quest access a race decided
before anyone moved. Measured across three seat orders with the human at seat
2: **seat 0 claimed 25/30, 23/30 and 26/30 quests; the human claimed zero in
all three.** Coverage looked like faction gating and was positional.

Two consequences worth knowing when authoring:

- **A `discovered` beat's marker belongs to the run that placed it.** Each
  player who takes the quest drops their own; only that claimant can resolve
  it. A marker with no claimant — one placed by `PLACE_ENCOUNTER` — stays open
  to anyone, as before.
- `{quest_active: ...}` asks whether the quest is running **for that player**,
  not whether anyone anywhere is on it.

### A beat with no choices is a card, not a defect

A purely narrative beat — text, no options — is legitimate. `beatAsEncounter`
synthesises one unconditional acknowledgement (`label: "Continue"`, marked
`dismiss: true` so a UI can render it as a dismissal rather than a one-item
menu) and appends the usual `ADVANCE_QUEST`, so the beat is shown, dismissed,
and advances the quest like any other.

Note what this deliberately does **not** cover: a beat that HAS choices which
all filter out still presents nothing and is still skipped. "Authored with no
choices" and "every choice gated away" are indistinguishable at the eligibility
check and only the first is a card to show.

Before this, such a beat was skipped *and never marked complete*, so its quest
stalled forever at the prerequisite.

### `QUEUE_DEFERRED` — the four deadline fields

A deadline **is** a deferred packet that says so out loud. Keeping them one
mechanism is deliberate: a separate timer system would drift from the thing it
counts down to.

```js
{ type: "QUEUE_DEFERRED",
  delayRounds: 4,
  label: "The siege at the Laker capital",   // player-facing text
  visible: true,                             // show a countdown for the queuer
  satisfiedIfFlag: "tempest_reached_the_wall",
  effects:  [ … ],   // runs if the flag IS set when the packet comes due
  onMissed: [ … ] }  // runs if it is NOT
```

Omit all four and the packet behaves exactly as every existing one does: fires
`effects` on the due round, unconditionally. All four are optional and
independent of each other.

- `activeDeadlines(state, pid)` (exported from `deferred.js`, re-exported by
  `engineAdapter.js`) returns `{label, dueRound, roundsLeft, met}` for that
  player, soonest first. It reads the same `state.deferred` queue the sweep
  resolves — there is no second list to keep in step.
- **`roundsLeft` is in ROUNDS**, the unit the rest of the HUD already uses for
  durations. The countdown runs `delayRounds`…1 and then the deadline is gone:
  it never displays 0, because the sweep resolves a packet on the round it
  comes due and a timer reading zero that has not yet fired would be the wrong
  thing to show.
- Emits `deadline_met` / `deadline_expired` alongside `deferred_resolved`.
- The missed branch is the mechanic. A timer that fires the same effects
  whether or not the player acted is decoration.

**[VERIFIED-RUN]** `scripts/check-deadlines.mjs` (unit) and
`scripts/check-deadline-live.mjs` (a real campaign, AI seats playing, quests
delivering).

### `triggering-unit` — the unit that caused the delivery

A recipient token, alongside `active` / `claimant` / the rest in §3. It
resolves to the unit that stepped onto the marker and caused this beat to be
delivered — `resolveMarkerOnHex` already puts it on the context
(`encounters.js`), so nothing needed plumbing but a name.

Unit-scoped effects mean *this* unit, not "the player": all eleven authored
`ADJUST_BASE_STRENGTH` effects wrote `target: "active"`, which resolves to a
player id, so the handler's `state.units[pid]` lookup missed and skipped —
four of them were `-99` and none destroyed anything. `TAKE_UNIT`,
`SET_MOVEMENT` and `GRANT_CHIP` take the same handle.

Where a beat fires from the round-end pulse with nobody standing anywhere,
it falls back to the recipient's strongest available unit — matching what
`contestingStrength` already does for narrative contests, so the two agree
about who "your unit" is — and records every fallback on
`state.__triggeringUnitFallbacks`. A player with no units resolves to `[]`.

### `units-on-hex` — the whole force, not one column

The multi-unit form, for a consequence that should fall on everything the
player committed rather than on the unit that led. A failed storming costs the
columns; `triggering-unit` would spare the two standing beside the one that
walked in.

Resolves to every unit the recipient has on the beat's hex — the same place
`encounter-hex` names: `ctx.sourceHex`, else where the triggering unit stands.
Other factions' units on that hex are untouched, and so is anything the
recipient left elsewhere.

**Opted into, never inherited.** `triggering-unit` still means exactly one
unit, because every authored unit-scoped effect today means one and must keep
meaning one. Changing that token instead of adding this one would silently
multiply eleven existing consequences.

With no hex to anchor it — a `conditional` or `auto` beat firing from the
round-end pulse — it falls back to precisely what `triggering-unit` falls back
to: **one** unit, recorded on `state.__triggeringUnitFallbacks`. Resolving
"all of them" with no place to anchor it would turn a wounding effect into an
army-wide one on a technicality, which is the opposite of failing safe.

**[VERIFIED-RUN]** `scripts/check-units-on-hex.mjs`.
