# Round 1 — Parallel Agent Briefs

Three agents can run simultaneously with minimal conflict. **A** and **B**
are the two startable engine phases (Tech, Loyalty); **C** is cold-file UI
work that never touches engine logic. This doc is the coordination
contract — each agent reads its own brief **plus** the shared protocol.

Base everything on the current tip of **`claude/ashland-conquest-demo-BViiz`**.
Guardrails from `docs/v0.2-implementation-roadmap.md` apply (no PRs, never
touch `content/` or `src/game/content/`, keep the demo playable, verify
before push).

## Why these three are safe together

- **A (Tech §17)** and **B (Loyalty §18.2)** are the only phases with no
  upstream dependency. They co-edit just **`turn.js`** and **`contest.js`**,
  in **separate functions**, plus a few **append-only** files.
- **C** edits only **new** `src/prototype/` files, so it can't conflict with
  anyone.

## Coordination protocol (read this, all agents)

**1. The `turn.js` Upkeep order is pre-agreed.** Both A and B insert into
this fixed sequence — do not reorganize it, only fill your slot:

```
startTurn / Upkeep:
  1. emit turn_started
  2. reset Actions to base
  3. recomputeStats (Strength/Movement)
  4. recomputeResearch                      ← Agent A (renamed from recomputeTech)
  5. resolve Loyalty tick + Control peel     ← Agent B (replaces the old foothold step)
  6. collectProduction (+ Economy node effect) ← Agent A adds the eco effect here
  7. churnMarket                              (unchanged this round; removed in Phase 3)
  8. upkeep passives / triggers
```

**2. `contest.js` is split by function.** A edits only the roll-total
computation (adds the Military +1); B edits only the capture path (init
Loyalty instead of foothold `F`). Stay in your function.

**3. Append-only on shared additive files** — `config.js`, `events.js`,
`setup.js`, `engineAdapter.js`: add new keys/blocks/exposures, never reorder
or rewrite existing ones. A and B touch *different* keys (Tech vs Loyalty,
player-object vs location-object), so additive edits merge trivially.

**4. Merge order:** **B (Loyalty) lands first** (Phase 3 depends on it), then
**A rebases** the small `turn.js`/`contest.js` deltas, then **C merges
anytime** (cold files, no rebase needed).

**5. The adapter is the UI seam.** A and B add their exposures to
`engineAdapter.js`; C consumes the prop contracts below. C does **not** edit
the adapter — A/B wire C's components in.

---

## Agent A — Phase 1: Tech Wheel (§17)

**Mission:** implement the Research → Tech Level → Ability Points wheel.

- **Primary instructions:** `docs/tech-wheel-plan.md` (granular). Rationale:
  spec **§17**.
- **Files you OWN (edit freely):** new **`src/game/tech.js`** (node
  registry), `stats.js` (`recomputeTech` → `recomputeResearch`),
  `actions.js` (`unlockedTier` → reads `techLevel`; **keep the
  `{techLevel ≥ 1/3/5}` map factored out** — Phase 3 reuses it),
  `encounters.js` (Intelligence redraw, stacks with `recon-team`),
  `content.js` (`labs` → `research:1`; add `advanced-lab` `research:2`),
  wiring `TechWheel.jsx` into `Prototype.jsx`.
- **Files you SHARE (protocol above):** `turn.js` (slot 4 + the eco effect in
  slot 6), `contest.js` (Military +1 in the roll-total function), `setup.js`
  (replace `player.tech` with `research`/`permanentResearch`/`techLevel`/
  `techWheel` — player object only), `config.js` (add `tech:
  {researchThresholds, maxLevel, marketTierByLevel}`, remove old
  `start/tier2/tier3`), `events.js` (append `research_changed`,
  `tech_level_changed`, `tech_node_assigned`, `tech_node_lost`),
  `engineAdapter.js` (expose `research`/`techLevel`/`abilityPointsAvailable`/
  `techWheel`).
- **Consume from C:** `TechWheel.jsx` (props contract below) — you supply real
  data + the `onAssign` handler.
- **Note:** market-tier gating is interim (Phase 3 retires the Market); don't
  polish it. The eco effect you add in `collectProduction` gets re-homed in
  Phase 3 — keep it isolated.
- **Done when:** §17's "Verify" harness passes and the wheel assigns
  in-browser with entry effects firing.

## Agent B — Phase 2: Loyalty (§18.2)

**Mission:** replace foothold/decay with the 8-slice Loyalty pie.

- **Spec:** §18.0 (canonical terms) + §18.2; supersedes §6.3.2.
- **Files you OWN:** the Loyalty mechanic wherever foothold `F` lived in
  `stats.js`/`turn.js` logic, the `ControlMeter` component (integrate C's
  `LoyaltyPie`), and the loyalty-failing alert path in `EventFeed.jsx`.
- **Files you SHARE (protocol above):** `turn.js` (slot 5 — replace the
  foothold tick with the Loyalty tick + Control peel at `loyalty == 0`),
  `contest.js` (capture path only — init Loyalty instead of foothold `F`;
  leave the roll-total function for A), `setup.js` (replace location foothold
  init with `loyalty` init — location object only), `config.js` (add Loyalty
  rise/decay rates, danger threshold, peel cadence), `events.js` (append
  `loyalty_changed`, `loyalty_failing`, `control_peeled`),
  `engineAdapter.js` (expose `loyalty`).
- **Consume from C:** `LoyaltyPie.jsx` (props contract below).
- **Rules:** Control flips only on a lost contest or `loyalty == 0`; ceiling
  fixed at 8; Capital inert; warn before any peel.
- **Done when:** harness shows a neglected capture peeling to neutral via
  Loyalty 0, a garrisoned one holding, and the warning firing first.

## Agent C — UI radial components (cold files)

**Mission:** build presentational (props-only) radial components against the
contracts below, so A/B can wire real data with a thin step. **New files
only — no engine edits, no adapter edits.**

- **Build `src/prototype/TechWheel.jsx`** — radial, 4 spokes (reuse the
  `ControlMeter`/`ContestOverlay` drawing style). Props:
  ```
  { paths: [{ id, label,
      nodes: [{ id, layer, prereqMet, state: "assigned"|"assignable"|"locked",
                label, effectText }] }],
    abilityPointsAvailable: number,
    onAssign: (nodeId) => void }
  ```
  Render nodes by state; branch nodes show "TBD". Spec **§17.4–17.5**.
- **Build `src/prototype/LoyaltyPie.jsx`** — an 8-slice center pie matching
  the `ControlMeter` ring style. Props: `{ value: 0..8, danger: boolean }`.
  Spec **§18.2**. (B integrates this *into* `ControlMeter`; you only build
  the standalone component.)
- **Work against mock data** (a small fixture) so the components are
  demonstrable standalone.
- **Done when:** both components render all states from mock props in the
  browser, and match the radial visual language.

---

## After Round 1 (for planning)

Once A+B merge, the next clean parallel pair is **Phase 3 (Economy §20) ∥
Phase 4 (Influence §18.3)** — Phase 4 is almost entirely a new module
(`influence.js` + overlay), so it barely touches Phase 3's hot files. Phase 5
(Fog) then runs mostly solo (the AI-under-fog refactor is the cost), and
Phase 6 (Diplomacy) is the solo capstone. Agent C's UI/contract track stays
useful across all rounds. See `docs/v0.2-implementation-roadmap.md`.
