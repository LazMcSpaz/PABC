# AI Overhaul — toward a content-agnostic opponent

Status: **plan, not yet implemented.** The demo is 1 human vs 3 AI, so the
AI is what makes the v0.2+ systems (combat, tech, loyalty, influence, fog,
economy, diplomacy) actually *function as a game*. This documents the
current AI's state and a plan to rebuild it so it (a) plays all systems
coherently toward a victory path, and (b) stays robust to content additions
— i.e. realizes the §2 content/engine split *in the AI itself*.

Current AI lives in **`src/game/ai.js`** (entry: `takeAITurn(state)`).

## Current state (assessed at commit `edaa749`)

A **hybrid** — generic in places, brittle in others.

**Already generic (keep):**
- Faction behavior reads the **dials**, not ids — `victoryLean`,
  `aggression`, `sociability`, `scope` (so new factions work).
- Diplomacy (`manageDiplomacy`) reasons via standing / power / rep-gates
  through `diplomacy.js` helpers.
- Fog-aware: plans on its own `state.visibility[pid]`, scouts the frontier,
  chases ghosts — no global-truth cheats (§19.10).
- The build scorer reads chip **fields**, not ids.

**Brittle / missing (the targets):**
1. **The build scorer enumerates a *fixed* field set** — `output·3 +
   research·3 + garrison + strength − upkeep` (`pickBuild`). A chip whose
   value is **movement, influence, vision, detection, loyalty-rate, or any
   new effect** scores **0** and is ignored. *This is the core
   content-robustness hole:* records using known fields are fine; anything
   else is invisible.
2. **`training-grounds` is hard-coded** in three places (`pickBuild` +5,
   `tryRecruit`, the `haveTG` check) — rename it or add an alternative and
   the AI misses it.
3. **The tech wheel is entirely unused** — there is no `assignTechNode`
   call anywhere; the AI never spends Ability Points. A whole system
   ignored.
4. **Contests are blind** — it attacks whenever a unit stands on a
   contestable hex, with no win-probability / attrition check and no use of
   the §16 levers (concentration, fortify, terrain).

## The plan

One **shared evaluation core** that every decision routes through, keyed to
the **effect vocabulary** rather than record ids:

1. **Goal-weight model** — `goalWeights(state, pid)` derives weights over a
   small goal set {VP, territory, military, tech/research, economy,
   recognition/standing, vision/influence} from the faction dials + game
   phase + position (ahead/behind, at war, under coalition threat). This is
   what makes a warlord and a diplomat value the *same option* differently.

2. **An effect→value table** (the robustness core) — `valueOf(effects,
   weights)` decomposes **any** record's declared effects / stat-deltas into
   goal contributions via a table keyed by the **effect & stat vocabulary**
   (Strength, Movement, research, scrap/output, contest-roll, influence,
   vision, detection, loyalty-rate, …), then weights and sums. Replaces the
   hard-coded scorer; works uniformly for chips, **tech nodes**, location
   abilities, and deal items.

3. **A state-utility function** — `stateUtility(state, pid)` scores a
   position, so high-stakes decisions (especially **contests**) are made by
   *projection*: apply the option, did utility rise — and for a fight, is the
   expected value positive given Strength + levers + the die? This alone
   makes combat smart and makes concentration / ambush matter.

4. **Route every decision through the core, and close the gaps:**
   - Build/upgrade: score all buildable chips *and upgrades* via `valueOf`
     (the `training-grounds` special-case dissolves — value it via a generic
     "enables-recruiting / unit-capacity" effect tag, not its id).
   - **Tech wheel (new):** each turn, if an Ability Point is free, assign the
     prereq-legal node whose effects best serve current goal weights.
   - Contest/move: EV-gated attacks; mass units for concentration when it
     tips a fight; fog-aware caution against likely ambush.
   - Diplomacy: extend to the full action vocabulary (deals / trade /
     denounce / mediate / ultimatum) via the existing deal valuation, with
     coalition-threat awareness, pursuing a coherent victory path.

## Robustness guarantee (the answer to "will it survive content updates?")

Because the scorer is keyed to the **effect vocabulary**, not record ids:
- **New records that compose existing effects** (chips, factions, locations,
  abilities) → scored automatically, **zero AI changes**.
- **A genuinely new effect *type*** (some of the 16 stubbed tech branch
  nodes will introduce these) → **one new entry in the effect→value table**,
  added **when you design that mechanic**, co-located with its
  implementation.

So: new content is free; new *mechanics* are a bounded one-entry-each cost.
That is the §2 promise realized in the AI.

## Scope & how to build it

- **One coherent pass, not split across agents.** The shared eval core is
  the whole point; fragmenting it recreates today's bolted-on heuristics.
- Rewrite/extend **`src/game/ai.js`** (optionally split the eval core into
  `src/game/ai/eval.js`). Reuse the engine's existing **option enumerators**
  rather than reinventing: `buildableChips` (`economy.js`), assignable nodes
  (`tech.js`), contest math (`contest.js`), deal valuation (`diplomacy.js`),
  visibility (`visibility.js`).
- **Never touch `content/` or `src/game/content/`.** Put any AI tunables in
  `config.js`.
- Verify with the harness (`node src/game/harness.js`) — add AI-quality
  checks (e.g. a full AI-vs-AI game completes and reaches a victory; the AI
  values a movement/influence/vision chip; the AI assigns tech nodes; it
  declines a losing contest) — and watch a full AI-vs-AI game.

## References

- **Current AI:** `src/game/ai.js`
- **Systems the AI must drive:** §16 combat (`contest.js`), §17 tech wheel
  (`tech.js`), §18.2 loyalty (`turn.js`), §18.3 influence (`influence.js`),
  §18.4–18.13 diplomacy (`diplomacy.js`, `standing.js`), §19 fog
  (`visibility.js`), §20 economy (`economy.js`)
- **Faction model + dials:** spec `docs/mechanical-spec-v0.1.md` §18.4
- **Content/engine split principle:** spec §2
- **Phase roadmap:** `docs/v0.2-implementation-roadmap.md`
