# Plan — Acting on Playtest Feedback (2026-04-29 round 2)

Source: `docs/feedback-2026-04-29 (2).json` (6 entries from a single live session).

The six concerns split into **four engine bugs** (Scrap Yard math, Scavenge Ruins repeat, Vanguard Armory on-resolve, leader recovery timing), **one UI-render bug** (opponent settlement not visibly updating), **one UI clarity item** (exploration cost/reward tooltips), and **one new feature** (richer game log + export). Recommended order below batches the cheapest engine fixes first, then the UI items, ending with the log feature.

---

## Concern 1 — Opponent settlement doesn't appear to update when AI builds

> *"Looks like enemy buildings are not updated on their card when purchased."*

**Where it lives**
- `src/components/PlayerPanel.jsx:80` — passes `player.settlement` to `SettlementView`, which renders chips
- `src/components/SettlementView.jsx` — pure chip-row renderer
- `src/engine/ai.js:executeAIAction("build")` — calls `actions.build(state, playerId, card.uid)`

**Diagnosis path** (this one needs investigation before a fix lands):
1. Add a temporary `console.log` in `useGameEngine.build` to confirm the AI's build call returns a state where `players[ai].settlement.length` actually grew.
2. Compare against `state.log` — every successful build appends a `{ type: "build", playerId, cardId }` entry. If logs show the build but the panel doesn't update, it's a render-staleness problem.
3. Check whether the chip row is just *too compact* to notice — on phone screens, chips wrap below the boost buttons and a new chip can blend in.

**Two likely root causes:**
- **A. Silent no-op.** If the AI's plan eats actions before "build" (e.g., explores twice, then tries to build with 0⚡), `actions.build` returns state unchanged with no error. The AI Log tab would still show the planned action. Fix: in `executeAIAction`, log a warning if a non-`end_turn` action returned identical state.
- **B. Visual subtlety.** The chip-row in `PlayerPanel` shows building names in 12px text, easy to miss. Fix: bump opponent settlement to a more visible row — small versions of the same `Card` used in `MySettlementPanel`, or at least chips with a distinct color when added in the last round (briefly highlighted).

**Recommended:** instrument first (10 min), confirm which one it is, then ship the fix. Default to **A** as the more likely bug (AI plans frequently overshoot action budgets).

---

## Concern 2 — Scrap Yard not producing the expected +2/turn

> *"Scrap Yard should be producing +2 scrap per turn... +1 scrap on its own, then +1 scrap per scrap producing building (which includes the Scrap Yard itself)."*

**Where it lives**
- `src/engine/cards.js:Scrap Yard` — currently `passiveScrap: 0`
- `src/engine/calculations.js:scalingBonus` — counts buildings with `passiveScrap > 0`

**Root cause:** Scrap Yard's `passiveScrap` is 0, so it doesn't even count itself for its own scaling bonus. The user's intuition (Scrap Yard contributes its own +1 base) matches the card's flavor better than the current data.

**Fix (one-line data edit):**
- `passiveScrap: 0 → 1` on `scrap_yard` in `cards.js`.
- Update its ability description from "+1 Scrap per Scrap-producing building (cap +4)" to "+1 Scrap base, plus +1 per Scrap-producing building (cap +4 from scaling)" so the math is legible to players.

**Math check:**
- Scrap Yard alone: passiveScrap=1 + scalingBonus=1 (Scrap Yard counts itself) = **2/turn** ✓ matches user expectation.
- Scrap Yard + Salvage Depot: 1+1 base + scalingBonus=2 = **4/turn**. Still under the +4 cap.
- Scrap Yard + 5 scrap producers: 6 base + scalingBonus capped at 4 = 10/turn. Reasonable late-game ceiling.

No engine-logic change needed; the existing `scalingBonus` logic already handles "include itself" once Scrap Yard's `passiveScrap` is non-zero.

---

## Concern 3 — Repeatable challenges (Scavenge Ruins) don't actually repeat

> *"Scavenge Ruins exploration card did not prompt me to pay up to 3 times the cost for up to 3 times the reward."*

**Where it lives**
- `src/engine/cards.js:scavenge_ruins` — has `ability.type: "repeatable", maxRepeat: 3`, but
- `src/engine/actions.js:resolveCard` — generic challenge resolver pays cost once and grants rewards once, ignoring `ability.type === "repeatable"`.

**Root cause:** the mechanic is declared in card data but never implemented in the resolver. Same shape as the unimplemented effects in concern 4.

**Fix:** in `resolveCard`'s challenge branch, before the standard reward block:
1. Check if `card.ability?.type === "repeatable"` and the player can afford another resolution (atk requirement is fixed, scrap is the limiting factor).
2. If so and no `decisions.repeats` is supplied, `pauseWithPrompt` asking "Resolve N times? (1 / 2 / 3)" with options gated by player's remaining scrap.
3. Apply rewards × N and pay cost × N.
4. Register an AI heuristic that picks the max affordable count (greedy = always optimal for this mechanic).

~30-line addition to `actions.js`, plus a `registerResumer("scavenge_ruins_choice", ...)` and a `registerAIHeuristic`.

---

## Concern 4 — Rebuild Vanguard Armory doesn't add itself to settlement

> *"Looks like Rebuild Vanguard Armory did not add it to my settlement (could be because it was full already). Also, the tooltip was hard to understand."*

**Where it lives**
- `src/engine/cards.js:rebuild_vanguard_armory` — has `ability.type: "on_resolve", effect: "add_to_settlement", noSlotRequired: true`, but
- `src/engine/actions.js:resolveCard` — generic challenge resolver doesn't dispatch on `effect: "add_to_settlement"`.

**Two fixes in one commit:**

**A. Implement `add_to_settlement`.** In the challenge branch, after standard rewards, check `card.ability?.effect === "add_to_settlement"`. If true, push a copy of the card (with a fresh uid like `${card.id}_resolve_p${playerId}`) into `player.settlement`. Respect `noSlotRequired: true` by *not* counting it against the 5-slot cap (i.e., bypass the `settlement.length >= 5` check for this one). Also set `ability.discardIfDisabled` semantics: when a disable would land on this building's uid, remove it from settlement entirely instead of marking disabled.

**B. Cleaner exploration tooltips.** The card text in `ExploreView` already shows ability description, but cost/reward live in tiny "req ⚔3 · +🔩0 · +⚔2 · +★4" text. Two small UI changes:
- In `Card.jsx`, separate "Cost" and "Reward" rows with bold labels:
  ```
  Cost: 3🔩, ⚔3 required
  Reward: +2⚔, +4★
  ```
- In `ExploreView`'s in-play list, prepend a one-line cost/reward summary above the per-card chip-row so it's visible without inspecting.

This addresses the "hard to understand" half of the feedback without changing the card data shape.

---

## Concern 5 — Disabled leader re-enables one turn too early

> *"After a raid, the leader who was disabled is re-enabled automatically at the START of the enemy turn. It should be at the end."*

**Where it lives**
- `src/engine/actions.js:executeRaidOutcome("Disable Leader")` — sets `leaderDisabledUntilOwnerTurnStart: true`
- `src/engine/actions.js:endTurn` — in the *next-player* update block: `leaderRecovered = !!p.leaderDisabledUntilOwnerTurnStart` → leader recovers immediately on the defender's next turn start.

**Why this is wrong:** the raid happens on the attacker's turn; "next player turn start" = the defender's *immediate* next turn. Recovery there means the disable never actually costs the defender a turn. The user wants: defender plays one full turn without their leader, then it recovers.

**Fix:** rename the flag to `leaderDisabledUntilOwnerTurnEnd` and move recovery into the *outgoing-player* update block in `endTurn` — i.e., when the defender is *finishing* their turn, recover the leader for next time.

```diff
// outgoing-player update (currently only resets skipExploreThisTurn)
let next = updatePlayer(state, state.activePlayerId, (p) => ({
  ...p,
  skipExploreThisTurn: false,
+ leader:
+   p.leaderDisabledUntilOwnerTurnEnd && p.leader
+     ? { ...p.leader, disabled: false }
+     : p.leader,
+ leaderDisabledUntilOwnerTurnEnd: false,
}));
// next-player update — drop the leader recovery and the flag reset
```

**Symmetric concern (worth fixing in the same pass):** the same shape exists for `buildingsDisabledUntilOwnerTurnStart` (raid Destroy outcomes don't disable; but Intrigue cards that disable buildings on opponents use the same flag). Likely the same bug. Suggest renaming to `…UntilOwnerTurnEnd` and moving recovery to outgoing-player block as well — small diff, consistent semantics.

`temporaryDebuffs.expiresOn === "owner_turn_start"` may also be affected; audit during the fix.

---

## Concern 6 — Richer game log + export for balance analysis

> *"Let's create a way to export the game log so we can refine balancing... a snapshot of every player's settlement, resources, VP, and what happened on their turn."*

**Where it lives**
- `state.log` — currently terse `{ round, type, playerId, cardId, ... }` entries
- `src/components/FeedbackPanel.jsx` — already exports player-authored notes; can host the new export button alongside

**Recommended approach** — two-part change:

**A. Add per-turn snapshots to the log.** In `endTurn`, before switching active player, append a snapshot entry:
```js
{
  round: state.round,
  turn: <activePlayerId>,
  type: "turn_end",
  snapshot: state.players.map(p => ({
    id: p.id,
    name: p.name,
    scrap: p.scrap,
    vp: calcVP(p),
    atk: calcAttack(p),
    def: calcDefense(p),
    actionsRemaining: p.actionsRemaining,
    settlement: p.settlement.map(b => b.id),
    leader: p.leader?.id ?? null,
    intrigueHand: p.intrigueHand.map(c => c.id),
  })),
  thisTurnEntries: <count of log entries since previous turn_end>,
}
```
This makes log replay possible offline — given any two consecutive snapshots you can reconstruct the deltas. ~25 lines in `actions.js`.

**B. Add a "Export game log" button to FeedbackPanel.** Mirrors the existing `exportJson` for feedback notes; downloads `gamelog-YYYY-MM-DD-HHMM.json` containing `state.log` plus a small header with player names, round, age. ~15 lines in `FeedbackPanel.jsx`.

Optional polish: a separate `gamelog-summary.csv` export that flattens snapshots into a per-turn table for spreadsheet analysis. Recommend skipping for now — the JSON is enough for any one-off pivot.

**Out of scope for this round:** turning the live AI Log into a richer turn-history viewer. The export is the priority; in-game viewing can wait.

---

## Suggested Order & Sizing

| # | Item | Type | Size | Notes |
|---|------|------|------|-------|
| 1 | Scrap Yard `passiveScrap: 0 → 1` (Concern 2) | Data | XS | One-line edit + ability description |
| 2 | Leader recovery timing (Concern 5) + symmetric building-disable timing | Engine | S | Rename flag, move recovery to outgoing-player block |
| 3 | Implement `add_to_settlement` for Vanguard Armory (Concern 4A) | Engine | S | New branch in challenge resolver |
| 4 | Repeatable challenge prompt + AI heuristic (Concern 3) | Engine + UI | M | New prompt kind, generic across all `repeatable` cards |
| 5 | Cleaner cost/reward labels in `Card.jsx` (Concern 4B) | UI | S | Bold "Cost"/"Reward" rows |
| 6 | Investigate + fix opponent settlement display (Concern 1) | UI / engine diag | S–M | Instrument first, then fix |
| 7 | Per-turn snapshot logging + game log export (Concern 6) | Engine + UI | M | Push to last since it depends on stable log shape |

Items 1–3 are very small and could ship as one focused PR. Items 4–6 each warrant their own commit; Item 7 should land last so the snapshot shape is informed by anything else we change.

## Open questions to confirm before coding

1. **Concern 2 — cap behavior:** Should the scaling cap (+4) include the Scrap Yard's own +1 base? My read of the user's note says "yes" (the cap is on the scaling component, base is separate). Want to double-check before shipping.
2. **Concern 4 — slot accounting:** When `add_to_settlement, noSlotRequired: true` triggers, does the resolved Armory occupy a "phantom slot" (so destroy raids can target it) or is it permanent unless an Intrigue disable hits? The card says `discardIfDisabled: true`, so I'd treat it as a normal raid target that gets *removed* (not just disabled) on destroy/disable. Confirm or override.
3. **Concern 6 — granularity:** Per-turn snapshots are recommended; do you want per-action snapshots too (e.g. before/after every build, raid)? Per-action would balloon log size for long games but enables move-by-move replay.
