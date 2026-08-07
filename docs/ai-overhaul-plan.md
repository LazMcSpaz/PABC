# AI Overhaul — toward a content-agnostic opponent

> **STATUS (2026-08-06):** partially implemented, updated further today.
> Items 2, 3, and 4 below are now **closed**: the tech wheel is used
> (`maybeAssignTech`), `training-grounds` is no longer hardcoded (chips now
> carry a generic `unitCapBonus` field — see `content.js`, `actions.js`
> `recruitCapBonus`), and contests are no longer blind — `ai.js` now
> EV-gates every contest through `previewAttackerStrength`/
> `previewLocationContest` (moved into `contest.js` so both the engine-side
> AI and the UI's odds preview share one implementation) and a
> `winProbability`/`acceptableOdds` check tuned by the faction's aggression
> dial (`config.js` `CONFIG.ai`). Measured effect on the seed-42 harness
> AI-vs-AI smoke test: contest win rate went from 51/245 (~21%) to
> 230/264 (~87%), captures roughly doubled (15 → 29), and the game no
> longer produces one faction's army being wiped out to near-zero units.
>
> **Update (2026-08-07):** `maybeAssignTech`'s allocation policy is fixed
> too (see item 3, updated below) — it now scores every currently-legal
> node instead of locking a faction into one path for the whole game. This
> also corrects a separate, unrelated mistake this doc and `v0.3-roadmap.md`
> both made: the 16 tech-wheel **branch** nodes were never actually
> `noop`/undesigned — their real effects are implemented at each consumer
> site (`contest.js`, `stats.js`, `board.js`, `turn.js`, `actions.js`,
> `economy.js`, `visibility.js`, `intel.js`) and pass the harness's
> `[Tech Wheel §17.5]` tests. The `noop` in `TECH_NODES` is just an unused
> leftover field. §"Robustness guarantee" below repeats that mistake too —
> corrected there.
>
> **Still open:** item 1, the fixed-field **chip/build** scorer only (the
> tech-node side of item 1 is now closed too — see item 3). The
> `unitCapBonus` fix generalizes recruiting specifically; a chip with a
> genuinely new effect type (influence, vision, detection, loyalty-rate)
> still scores 0 in `pickBuild`'s heuristic. The full effect→value table
> described below is the fix for that — a larger, separable lift, and now
> scoped specifically to chips since tech nodes have their own bounded
> fix. See `docs/v0.3-roadmap.md` §1.

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
2. ~~**`training-grounds` is hard-coded**~~ — **CLOSED (2026-08-06).**
   The chip now carries a generic `unitCapBonus` field; `actions.js`
   exports `recruitCapBonus(state, pid)` summing it across owned chips
   (also fixed a latent bug: recruiting is a player-wide check, not
   per-location, so the AI was skipping eligible locations). `pickBuild`
   and `tryRecruit` in `ai.js` now read that instead of the id. A new
   content chip with the same field, any id, works with zero AI changes.
3. ~~**The tech wheel is entirely unused**~~ — **CLOSED (2026-08-06, then
   properly fixed 2026-08-07).** `ai.js` has `maybeAssignTech`, which spends
   a free Ability Point every turn. The 2026-08-06 version was a bare
   heuristic with two real bugs: it picked a path via a hardcoded if/else
   that could **never** produce `"logistics"` (dead code — present in the
   lookup map, unreachable through the conditional), and once its chosen
   path's 3 nodes were assigned, every later call found them all already
   taken and did nothing — Ability Points earned past that point (a
   faction can reach 4) were silently wasted forever. Replaced with
   `TECH_NODE_SCORE`, a table of 20 small situational scoring functions
   (one per node id, reading things like "are owned units below Strength
   cap," "is a hostile unit standing on my territory," "what fraction of
   the map is still unexplored") plus an additive `techIdentityWeight` that
   tilts scores by the faction dial instead of hard-excluding 3 of 4 paths.
   This is hand-written per-id rather than the generic effect→value model
   below **on purpose** — the tech wheel is a fixed, engine-owned set of
   exactly 20 nodes that content authors never extend, so there's no
   open-ended-content risk to generalize against; a bespoke table is the
   right size for a closed set. Confirmed in a real AI-vs-AI game (seed
   777): a faction maxed one path's second branch, then correctly spent its
   4th point on a different path's entry instead of losing it.
4. ~~**Contests are blind**~~ — **CLOSED (2026-08-06).** `ai.js` now
   estimates win probability (via `previewAttackerStrength(state, hex,
   pid)` and `previewLocationContest(state, hex)` from `contest.js`, which
   already fold in concentration/fortify/mountain/veteran) before
   committing to a fight, and declines contests below a threshold set by
   the faction's aggression dial. It's an exact-odds check on the *current*
   totals, not a deeper minimax/attrition projection — still a reasonable
   next step if AI quality needs another pass.

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
     "enables-recruiting / unit-capacity" effect tag, not its id — done,
     via the `unitCapBonus` schema field).
   - ~~**Tech wheel (new):** each turn, if an Ability Point is free, assign
     the prereq-legal node whose effects best serve current goal
     weights.~~ **Done, in bounded form** — `maybeAssignTech`'s
     `TECH_NODE_SCORE` table (item 3 above) is this same idea, hand-written
     per node instead of routed through the generic `valueOf`, since the
     wheel's 20 nodes are a closed set that doesn't need the general
     machinery.
   - Contest/move: EV-gated attacks — done (win-probability check, item 4
     above); mass units for concentration when it tips a fight; fog-aware
     caution against likely ambush — still open.
   - Diplomacy: extend to the full action vocabulary (deals / trade /
     denounce / mediate / ultimatum) via the existing deal valuation, with
     coalition-threat awareness, pursuing a coherent victory path.

## Robustness guarantee (the answer to "will it survive content updates?")

Because the scorer is keyed to the **effect vocabulary**, not record ids:
- **New records that compose existing effects** (chips, factions, locations,
  abilities) → scored automatically, **zero AI changes**.
- **A genuinely new effect *type*** (a chip design introducing one — this
  no longer applies to tech branch nodes, which are a closed, already-fully-
  designed set handled by their own bounded fix, item 3 above) → **one new
  entry in the effect→value table**, added **when you design that
  mechanic**, co-located with its implementation.

So: new content is free; new *mechanics* are a bounded one-entry-each cost.
That is the §2 promise realized in the AI. This section now applies to
**chip/build scoring only** — the tech-wheel side of the AI is done via
its own hand-written per-node table (item 3), which is the correct-sized
solution for a fixed 20-node set rather than a mismatch to fix later.

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
  values a movement/influence/vision chip; it declines a losing contest —
  done, item 4) — and watch a full AI-vs-AI game. (The AI assigning tech
  nodes, and doing so without stranding points or excluding a path, is
  now covered by the `[Tech Wheel AI]` harness block.)

## References

- **Current AI:** `src/game/ai.js`
- **Systems the AI must drive:** §16 combat (`contest.js`), §17 tech wheel
  (`tech.js`), §18.2 loyalty (`turn.js`), §18.3 influence (`influence.js`),
  §18.4–18.13 diplomacy (`diplomacy.js`, `standing.js`), §19 fog
  (`visibility.js`), §20 economy (`economy.js`)
- **Faction model + dials:** spec `docs/mechanical-spec-v0.1.md` §18.4
- **Content/engine split principle:** spec §2
- **Phase roadmap:** `docs/v0.2-implementation-roadmap.md`
