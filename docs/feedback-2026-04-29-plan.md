# Plan — Acting on Playtest Feedback (2026-04-29)

Source: `docs/feedback-2026-04-29.json` (5 entries, one carried over from 2026-04-24).

The five concerns split cleanly into **two engine/balance fixes** and **three UI/IA fixes**. They are largely independent; recommended order below batches the cheapest wins first and ends with the larger UI restructure.

---

## Concern 1 — First-turn raids are unfair (gate raiding early)

> *"The first player can immediately raid someone else on their first turn… Maybe defense starts at 3 or something."*

**Where it lives**
- `src/engine/calculations.js:6` — `BASE_DEFENSE = 1`
- `src/engine/actions.js:513` — `raid()` has no round-gating, only `raidedThisRound` and `globalFlags.raidsBlocked`
- `src/engine/gameState.js:86` — `round: 1`

**Recommended approach** — pick **one** of these, ideally A (cheapest, least balance disruption):

- **A. Round-gate raids.** Add a guard at the top of `raid()`: `if (state.round < RAID_UNLOCK_ROUND) return state;` with `RAID_UNLOCK_ROUND = 2` (or 3). Surface the gate in `RaidView.jsx` so the button is disabled with a "Raids unlock Round N" tooltip, and skip raid moves in the AI prompt while gated. Easy, reversible, and doesn't perturb late-game defense math.
- **B. Raise base defense.** Bump `BASE_DEFENSE` to 3. Simpler one-line change but ripples through every challenge requirement, raid math, and AI heuristics — likely needs cost rebalancing across many cards.
- **C. Hybrid.** `BASE_DEFENSE = 2` plus a Round-1 raid lock. Defensible "settling-in" feel but costliest to validate.

**Open question for the user:** Do we want raids permanently harder (B/C) or just delayed (A)? My recommendation is A — the feedback is about *first-turn* unfairness, not raids feeling too easy in general.

**Also touch:** `src/engine/ai.js` — strip raid actions from the available-action list while gated so the Warlord doesn't waste an action attempt.

---

## Concern 2 — Defense has no growth path outside boost-spend

> *"We introduced a defense score but didn't introduce ways to increase it other than spending scrap during a raid."*

**Where it lives**
- `src/engine/cards.js` — every Building / Upgrade / Leader / Challenge / Narrative beat with `passDef`, `defReward`
- `src/engine/cards_age1_rewards.js` — challenge/narrative reward tables

**Recommended approach** — content audit + small redesign pass, no engine changes needed:

1. **Audit pass.** Script (or grep) the Age 1 set to count how many cards contribute Defense vs. Attack per source (building / leader / challenge reward / narrative reward). Produce a table in a new section of `playtesting-log.md` so we can see the exact gap.
2. **Targeted edits.** Add `passDef` (typically +1) to ~3–4 mid-cost Buildings that thematically suit it (already-defensive flavor: bunkers, walls, watchtowers). Look for buildings currently doing nothing but `passiveScrap` and consider giving them `passDef: 1`. Add `defReward` to a couple of Challenges that currently only give `atkReward`.
3. **One new Defense-themed Building** if the audit shows we're still short — cheaper than rewriting existing balance-tested cards.
4. **Symmetry check.** Same audit for Attack to make sure we're not over-correcting; the feedback asks for "attack, defense, or both depending on context."

**Out of scope:** Touching Age 2/3 — those decks aren't built yet (per README "Current Status").

**Deliverable:** A short edit list in this doc (or a follow-up PR description) of *which* card IDs change and to what values, before any code edits.

---

## Concern 3 — Resources should be added at start of turn, not on-build

> *"Buying a building and immediately getting its resource effect is not right."*

**Where it lives** — needs interpretation; flag both readings:

**Reading A (likely): same-turn ability activation feels wrong.**
- `src/engine/actions.js:46` — `build()` adds the card to `settlement` mid-turn; the player can then immediately use any `activated` / `free_action` / `repeatable` ability on it via `AbilitiesView` (e.g., Trading Post, anything that grants Scrap on demand).
- **Fix:** introduce a per-card "summoning sickness" flag — set `b.builtThisTurn = true` in the `build()` updater, clear it in `endTurn()` for the player whose turn is starting (alongside `abilityUsedThisTurn`). Have `abilities.js` and any `canActivate`-style guard refuse to fire when `builtThisTurn` is true. Same gate should suppress passive triggers that fire mid-turn (e.g. `trigger: "owner_initiating_raid"` style — audit during implementation).

**Reading B: passive-scrap visual jump confuses the player.**
- `PlayerPanel.jsx:21` shows `+🔩{calcPassiveScrap(player)}/turn` recomputed live from `settlement`, so the headline number jumps the moment a building is bought even though the actual scrap won't land until the start of the next turn. This is *technically* correct (passive scrap is collected in `endTurn`'s next-player block, see `actions.js:766`) but reads as "I got it now."
- **Fix:** label the headline as e.g. "Next turn: +🔩N" and show the *current-turn* gain as a separate "+🔩N this turn" pill that only changes at start-of-turn.

**Recommended:** Implement A (the rule fix) regardless — Reading B is a label tweak that should ride along on the same PR. Confirm with the playtester before shipping just in case they meant something more specific (e.g., a particular building they saw mis-fire).

---

## Concern 4 — Turn options aren't legible (carried from 2026-04-24 + reinforced)

> *"Having a clearer setup of what one can do on their turn… a few options (build, explore, raid, play intrigue) and you'd see the building row once you click build."*
> *"The unlockable deck taking up a majority of the display is not ideal."*
> *"Which leader and buildings are currently in my settlement should be very clear."*
> *"Upgrades should only really appear if you have the prerequisite building, and they should appear on the building card to show they are linked."*

These four notes describe **one** information architecture problem: `GameBoard.jsx` renders every panel (BuildingRow, Abilities, Upgrades, Explore, Intrigue, Raid, Narrative, Notifications, AILog, Feedback) as a flat vertical stack. New players can't see what an action *is*, and the long Upgrades panel pushes the actual settlement out of sight.

**Where it lives**
- `src/components/GameBoard.jsx:73-114` — flat stack of panels under one fieldset
- `src/components/SettlementView.jsx` — currently a thin chip list inside `PlayerPanel`
- `src/components/UpgradesView.jsx` — renders all upgrades + unique unlocks regardless of current settlement state (it does already filter via `getAvailableUpgradesFor`, but the "Unlockable Deck" section header and pending-unlock list still take vertical space when nothing is actionable)

**Recommended approach** — single restructure PR, four pieces:

1. **Promote Settlement to a primary panel.** Move settlement + leader out of the small `PlayerPanel` chip row into a full board section at the top of the right column. Each building/leader is a real Card with stats, ability text, and (when applicable) an inline "Upgrade →" affordance pulled from `getAvailableUpgradesFor`.
2. **Action-mode picker.** Replace the flat panel stack with a primary action bar: `[Build] [Explore] [Raid] [Play Intrigue] [End Turn]`. Selecting Build reveals BuildingRow; selecting Explore reveals ExploreView; etc. State this in `GameBoard` as `const [actionMode, setActionMode] = useState(null)`. Disabled buttons get tooltips explaining why (e.g. "0 Actions left", "Raids unlock Round 2" — ties into Concern 1).
3. **Inline upgrades onto parent buildings.** Delete the standalone `Unlockable Deck` section for upgrades. In the new Settlement panel, each building card that has an available upgrade for the current player shows a "Upgrade to {name} ({cost})" button right on the card. Use `getAvailableUpgradesFor` per building, not globally.
4. **Keep "Unique unlocks" section but collapse by default.** Narrative-chain rewards and progression unlocks (`UniqueRow`) don't have a parent building to attach to — keep them as a small section that only renders when at least one is buildable. Default collapsed.

**Out of scope** for this pass: visual polish, animations, true card art. We're solving discoverability, not aesthetics.

**Risk:** Touches the most-used component. Suggest landing it behind a small QA pass with the playtester — pre/post screenshots in `playtesting-log.md`.

---

## Suggested Order & Sizing

| # | Item | Type | Size | Depends on |
|---|------|------|------|------------|
| 1 | Round-gate raids (Concern 1, option A) | Engine + small UI | S | — |
| 2 | Same-turn-ability "summoning sickness" (Concern 3) | Engine | S | — |
| 3 | Defense-coverage card audit + edits (Concern 2) | Data | M | — |
| 4 | Action-mode picker + Settlement-first IA (Concern 4) | UI | L | benefits from 1 (disable tooltip) |

Items 1–3 can ship as small focused PRs. Item 4 should be its own PR with screenshots.

## Open questions to confirm before coding

1. Concern 1: gate raids by **round** (recommended A) or by **base defense** (B)? If round, which round unlocks?
2. Concern 3: confirm Reading A is what the playtester meant. Any specific building they saw mis-fire?
3. Concern 4: any feature panels (NarrativeView, NotificationFeed, AILog, FeedbackPanel) that should *not* move into the new mode picker — i.e., should remain always-visible?
