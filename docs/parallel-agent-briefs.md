# Parallel Agent Briefs (off `main`)

How to split the next slice of work across 2–3 agents. Supersedes the
earlier round-1 briefs (which were mis-baselined on a stale branch and
assumed §17 was unbuilt). **Read with `docs/v0.2-implementation-roadmap.md`.**

Base everything on **`main`**; each agent on its own branch off `main`,
returning via PR. Guardrails from the roadmap apply (no direct `main`
pushes, never touch `content/` or `src/game/content/`, keep the demo
playable, verify before PR).

## The honest picture

§17 (Tech Wheel) is **already done on `main`**, so the critical path now
*starts at Loyalty* and is more of a chain than a fan-out. Realistic
parallelism right now:

- **Agent 1 — Loyalty (§18.2):** the engine critical path. Everything
  downstream waits on it.
- **Agent 2 — Economy / retire Market (§20):** ~90% is Loyalty-independent
  (build-system, Output slider, market removal); only the Loyalty *gate*
  and the Loyalty-drop chip rule wait on Agent 1 — defer those.
- **Agent 3 — Design tables (cold files):** fill the TBD tuning/faction
  tables as proposals. Zero engine contention.

The bigger parallel window (Influence ∥ Fog-prep) opens after 1+2 land.

## Coordination protocol (Agents 1 & 2 read this)

**1. The `turn.js` Upkeep order is pre-agreed.** Insert into your slot; do
not reorganize:

```
Upkeep:
  1. emit turn_started
  2. reset Actions
  3. recomputeStats
  4. recomputeResearch                  (already on main)
  5. Loyalty tick + Control peel          ← Agent 1 (replaces the foothold tick)
  6. Output + build slider                ← Agent 2 (REPLACES collectProduction)
  7. charge chip upkeep                    ← Agent 2
     (churnMarket is REMOVED by Agent 2)
  8. upkeep passives / triggers
```

**2. `contest.js` is not shared this round.** Agent 1 owns the capture path
(init Loyalty). Agent 2's capture-side rules (§20.8 newest-chip / Loyalty-
drop peel) are **deferred** until Loyalty lands — so Agent 2 does not touch
`contest.js` now.

**3. Append-only on shared additive files** — `setup.js`, `config.js`,
`events.js`, `engineAdapter.js`, and the radial-HUD components: add distinct
keys/blocks/exposures, never reorder. Agent 1 = Loyalty/location-loyalty;
Agent 2 = economy/Output state + market *removal*.

**4. Merge order:** **Agent 1 (Loyalty) lands first.** Then Agent 2 rebases
and wires its deferred Loyalty-coupled bits (the §20.6 gate rung + §20.8 chip
rule). Agent 3 (docs) merges anytime.

---

## Agent 1 — Loyalty (§18.2)

```
Implement Loyalty (spec §18.2) — replace foothold/decay with the 8-slice Loyalty pie — for the Ashland Conquest engine.

BASE: branch `claude/loyalty` off the current tip of `main`. PR back to main; do not push to main directly.

READ FIRST: docs/parallel-agent-briefs.md ("Coordination protocol" + this section), docs/mechanical-spec-v0.1.md §18.0 (canonical terms) and §18.2 (supersedes §6.3.2), docs/v0.2-implementation-roadmap.md (guardrails + P1).

SCOPE: replace the signed foothold F with loyalty (0–8, ceiling fixed at 8). Control flips ONLY on a lost contest or when loyalty hits 0 (then peel one Control section to neutral per Upkeep until neutral). Loyalty rises while held/integrated, decays when neglected, floors at 0. Capital is inert. Emit a danger warning BEFORE any peel.

FILES: contest.js (capture path → init Loyalty), turn.js (Upkeep slot 5 — Loyalty tick + peel, replacing the foothold tick; DO NOT reorganize the Upkeep order in the briefs), setup.js (location loyalty init — append), config.js (loyalty rates/threshold/peel cadence — append), events.js (loyalty_changed, loyalty_failing, control_peeled — append), the radial-HUD control meter (add the Loyalty pie), engineAdapter.js (expose loyalty — append).

HARD RULES: never touch content/ or src/game/content/. Keep loyalty clean and queryable (Economy and Influence will read it). Keep the demo playable.

VERIFY: harness test showing a neglected capture peeling to neutral via Loyalty 0, a garrisoned one holding, and the warning firing first; confirm the pie in a browser. YOU MERGE FIRST — report your turn.js/contest.js/setup.js changes for the Economy agent.
```

## Agent 2 — Economy & City Development / retire Market (§20)

```
Implement the Economy (spec §20): chips become the output of the economy and the Market is retired, for the Ashland Conquest engine.

BASE: branch `claude/economy-§20` off the current tip of `main`. PR back to main; do not push directly.

READ FIRST: docs/parallel-agent-briefs.md ("Coordination protocol" + this section), docs/mechanical-spec-v0.1.md §20 (all; §20.6 gating display contract and §20.11 engine map are exact), docs/v0.2-implementation-roadmap.md (P2).

SCOPE: remove the Market (market.js/churnMarket, the Acquire action, market seeding, marketRow/marketDeck zones, and the Market HUD — we ARE dropping the market, including its recent radial-band UI). Add per-Location Output + the guns/butter build slider (bank scrap vs. construction); build chips into slots and upgrade in place; unit-chips require a stationed unit; rush-building; selective per-chip upkeep (dormant via the disabled flag if unpaid). Rework Upkeep so the slider REPLACES collectProduction. Add the slot-click build menu + chip-click upgrade view to the radial HUD (the §20.6 display rule is a contract — implement exactly).

DEFER until the Loyalty branch lands (you'll wire these at integration, after rebasing): the §20.6 Loyalty-gating RUNG (which chips a city can build by Loyalty rung + the +1 slot) and the §20.8 Loyalty-drop chip rule. Until then, gate builds on Tech Level only (reuse the existing {techLevel ≥ 1/3/5} map) and stub the Loyalty rung as "always unlocked".

FILES: remove from market.js/turn.js(churnMarket)/actions.js(Acquire)/setup.js(seeding)/effects.js(market zones)/HUD; add Output/slider/activeBuild to Location state, the §20.11 effects/events, chip schema fields in content.js (buildCost/upgradesTo/loyaltyReq/upkeep + stub upgrade chains like labs→advanced-lab). Upkeep slots 6–7 per the briefs; DO NOT touch contest.js this round (deferred). DO NOT reorganize the Upkeep order.

HARD RULES: keep the demo PLAYABLE — the build-system must replace the Market in the SAME branch (never a market-less, build-less state). Route all scrap income through Output. The AI must set sliders and pick builds. Never touch content/ or src/game/content/.

VERIFY: a full game with no Market — build/upgrade off Output, rush works, an unpaid-upkeep chip goes dormant, the §20.6 display rule behaves in-browser. You merge AFTER Loyalty; rebase and wire the deferred bits.
```

## Agent 3 — Design tables (cold files, docs only)

```
Author concrete PROPOSED values for the TBD tuning/faction tables the v0.2+ spec defers, for the Ashland Conquest game. Docs only — no engine code, zero file contention.

BASE: branch `claude/tuning-tables` off `main`. PR back to main.

READ FIRST: docs/mechanical-spec-v0.1.md §18 (esp. §18.4 faction model, §18.13 open questions), §19.12, §20.12, §18.2; docs/v0.2-implementation-roadmap.md.

DELIVER a new doc (e.g. docs/tuning-tables-proposals.md) with proposed values + brief rationale for:
- The 3 starter factions (§18.4): temperament, trustworthiness, grudge/forgiveness, sociability, victory lean, expansion appetite, coveted targets — give them distinct identities (e.g. a warlord, a trader, an opportunist) — plus the full faction↔faction starting Standing matrix.
- Loyalty constants (§18.2): start value, rise/decay rates, danger threshold, peel cadence.
- Economy constants (§20.12): Output base + any Loyalty multiplier, per-chip buildCost ranges, loyaltyReq rungs + which rung grants the +1 slot, rush rate, which chips carry upkeep + values.
- Influence (§18.3 / §19): range, falloff, ZoC dominance threshold, vision radii, detection ranges, ambush magnitude, ghost aging.
- Diplomacy (§18.13): menace/honor change magnitudes + decay, tolerance & trust-floor curve shapes, coalition wM/wP weights + threat threshold, Recognition weights + win threshold, vassal tribute/resentment/rebellion.

These are PROPOSALS for the team to ratify, not final — the implementing agents may use sensible defaults if these aren't ready, so you are not a blocker. Never touch content/ or src/game/content/.
```

---

## After 1+2 land

The next clean parallel pair is **P3 Influence (§18.3) ∥ P4 Fog-prep (§19)**.
Influence is almost entirely a new module (`influence.js` + a HUD overlay),
so it barely touches the hot files — the lowest-conflict phase in the whole
plan. Fog (P4) then runs mostly solo (the `ai.js` fog refactor is the cost),
and Diplomacy (P5) is the solo capstone. Agent 3's tables feed all of them.
See `docs/v0.2-implementation-roadmap.md`.
