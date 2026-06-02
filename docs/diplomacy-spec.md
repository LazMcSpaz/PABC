# Diplomacy — design + UI spec

The consolidated source-of-truth for the diplomacy system as it stands
**after** the design pass that introduced trading pacts, the surprise-
attack honor model, gift diminishing returns, and the redesigned
diplomacy screen.

**This doc supersedes `docs/mechanical-spec-v0.1.md` §18.7 where they
conflict.** Other §18 subsections (faction model, reputation, deals, AI
valuation, vassalage, recognition) are unchanged and remain the
underlying reference.

Status legend: ✓ engine has it · ⚠ engine partial / needs adjustment ·
✗ engine gap, needs implementation.

---

## Part 1 — Mechanical layer

The changes / additions layered on top of §18.

### 1.1 Honor model on war initiation

The headline change: **how you start hostilities is a major Honor
lever.** Treachery has a price.

- **Declare war → then attack.** The "proper" path:
  - No automatic Honor penalty for the declaration itself.
  - **Exception (unchanged from §18):** declaring war while you hold a
    pact or non-aggression promise with the target breaks that promise —
    `−CONFIG.diplomacy.honor.breakLoss` (currently 5).
- **Attack without declaring war first.** A "treacherous strike." On top
  of the Menace charge that fires per attack (§18.5):
  - **`−CONFIG.diplomacy.honor.surpriseAttackLoss = 8`** the moment the
    contest is declared. This is severe — about 1.6× the cost of breaking
    a regular promise. Honor is hard to recover; a single surprise attack
    can lock you out of any high-Standing relationship for many rounds.
  - Stacks with any pact-break the attack also represents.
  - **Fires once per war-initiation.** Subsequent attacks in the same war
    don't ding Honor further — you're already at war.

**Player-facing framing.** Declaring war first is the cleaner choice
*even if* you intend to immediately attack. The button is a one-tap
reputation hedge: pay nothing extra to declare openly, pay −8 Honor to
strike from the shadows. The rare case where a surprise strike is worth
it: when you'd lose the strategic initiative by declaring first
(important Location capture, ending the war the same round you started
it, etc.).

**Engine status:** ✗ gap. Today `onAttack` charges Menace but does not
differentiate declared vs. surprise. To wire: in `onAttack`, check
whether war-state with the target existed *prior to* the attack; if
not, deduct the surprise Honor loss before any other reputation hits.

### 1.2 Gift — diminishing returns

Gifts currently buy Standing at a flat
`CONFIG.diplomacy.ai.giftStandingPerScrap = 0.5` rate. This is
spammable — 20 scrap/turn can buy a tier-up every couple rounds.
Replace with a sliding-window diminishing rate.

**Mechanic.**
- `state.diplomacy.giftCounter[from][to] = n` tracks the number of gifts
  from `from` to `to` within the last
  `CONFIG.diplomacy.gift.windowRounds = 3` rounds.
- The **n-th gift** in the window grants
  `floor(baseGain / (n + 1))` Standing, where
  `baseGain = giftStandingPerScrap × amount`.
  - 1st gift in window: 100 % return.
  - 2nd: 50 %.
  - 3rd: 33 %.
  - 4th: 25 % — approaches zero quickly.
- The counter decays by 1 each round-end (so a brief gap fully refreshes
  the gain rate after 3 rounds of quiet).

**Engine status:** ✗ gap. Current code multiplies scrap by the flat
rate. Add `giftCounter` to `state.diplomacy`, modulate in `applyDeal`'s
gift handling, decay in `runDiplomacyRound`.

### 1.3 Trading Pact (replaces Trade Route)

Renamed and rescoped. The old `flow`-deal "trade route" is replaced by
a formal **Trading Pact** with a physical requirement: the route between
both capitals must be clear.

**Formation requirements:**
- Both parties have a Capital Location (a Location carrying the
  `capital` chip).
- A **clear path** exists between the two capitals on the hex graph —
  reuse `reinforcementRoute(state, proposerPid, otherCapitalHex)` from
  `board.js` exactly as the supply system does. The route is checked at
  formation time (gate the verb) **and** every round-end (§6.5
  step 2 — drives the suspend/dissolve cycle). Do not write a new path
  algorithm.
- Both parties Standing ≥ Neutral.
- Both parties not at war with each other.
- Standard rep gates apply (Menace < Tolerance, Honor ≥ floor).

**Effects (while pact runs):**
- **+2 scrap per Upkeep to each party**, paid by the engine — not a
  transfer between players' banks; the bump is the engine's
  representation of the economic activity.
- **+1 permanent Research granted to each party on formation**, treated
  as a Research floor (same model as encounter-grants in §17.2). The
  floor remains while the pact runs and is **removed when the pact
  dissolves** (subtract 1 from each party's `permanentResearch`,
  recompute Tech Level — may peel a wheel node per §17.3).
- Pact persists in `state.diplomacy.agreements` with `type:
  "trading-pact"`, owning fields `partyA`, `partyB`, `suspended`,
  `suspendedRounds`.

**Route validation during play.** Each round at round-end, the route is
re-validated:
- **Clear** → pact ticks normally.
- **Blocked** → pact **suspends**: no scrap that Upkeep; Research floor
  stays in place. Emit `trading_pact_suspended` (with reason).
- **Blocked for `CONFIG.diplomacy.tradingPact.suspendGraceRounds = 3`
  consecutive rounds** → pact **auto-dissolves**. No Honor penalty
  (force of circumstance). Research floor removed; emit
  `trading_pact_dissolved` with reason `route-severed`.
- **Restored mid-grace** → pact resumes the following Upkeep; emit
  `trading_pact_resumed`.

**Voluntary dissolution.** Either party may cancel via the UI:
- **After at least one full round of activity:** no Honor hit. Research
  floor removed from both.
- **Same round as formation:** prevented (no abuse loops).

**Engine status:** ⚠ partial. The current `flow` deal handles per-round
resource transfer; the trading-pact mechanic needs: capital-to-capital
route validation, the Research-floor grant/remove pattern, the
suspend/dissolve cycle, and a distinct agreement type.

### 1.4 Demand Tribute (renamed from Ultimatum)

UI label is **Demand Tribute** (more concrete to the player); engine
action key is `"demand-tribute"`. A coerced deal: demand items backed
by the threat of your military.

**Enable gate (UI + engine validation):**

```
canDemandTribute(state, demander, target) =
  powerOf(state, demander) >= powerOf(state, target)
    * CONFIG.diplomacy.demandTribute.minPowerRatio   // default 1.5
```

Below the threshold, the verb is *visible-disabled* with tooltip
"Disabled — not strong enough to coerce them."

**AI cave decision** (when target evaluates the demand):

```
caveScore = powerOf(state, demander) / max(1, powerOf(state, target))
            - CONFIG.diplomacy.demandTribute.caveBaseRatio          // default 2.0
            - (factionDef(target).aggression || 0.5)
              * CONFIG.diplomacy.demandTribute.braveryScale         // default 1.5

cave   if caveScore >= 0 AND tributeValue >= 0
        (deal-valuation `wouldAccept` still applies — they cave only if
        the demanded items are within what they can give)
refuse otherwise — and on refuse:
  - if state.diplomacy.demandTribute.escalateOnRefusal === "war"
    (default), immediately declareWar(demander, target, "tribute-refused")
  - target's Standing toward demander drops 2 tiers
```

Demander pays Menace per `CONFIG.diplomacy.menace.base` regardless of
outcome (the threat itself is the hostile act).

**Engine status:** ✗ new verb. Add the gate, cave-decision, and
escalation in `performDiplomacy`'s `"demand-tribute"` case + a small
helper `caveOnDemand(state, target, demander, terms)`.

### 1.5 Sue for peace (deal-evaluated)

Replaces unconditional `make-peace`. Sue for peace is a **peace deal**:
the player proposes a deal with a `peace` promise as the give item,
optional side terms (scrap, a chip, a research grant).

**War-exhaustion formula** (new — needs the state extension in §6.2):

```
warExhaustion(state, fid, opponent) =
  let war = findWar(state, fid, opponent);
  if (!war) return 0;
  let duration = state.round - war.since;
  let myUnitLoss      = war.unitsLost[fid]      || 0;
  let myLocationLoss  = war.locationsLost[fid]  || 0;
  let theirUnitLoss   = war.unitsLost[opponent] || 0;
  let theirLocLoss    = war.locationsLost[opponent] || 0;
  return duration
       + myUnitLoss     * CONFIG.diplomacy.war.unitLossWeight      // default 2
       + myLocationLoss * CONFIG.diplomacy.war.locationLossWeight  // default 4
       - theirUnitLoss  * 0.5
       - theirLocLoss   * 1.0;
```

Higher score = more eager for peace (I'm losing, and it's dragging on).

**AI acceptance** (when target evaluates the player's peace proposal):

```
aiAcceptsPeace(state, ai, suer, sideTerms) =
  let exhaustion = warExhaustion(state, ai, suer);
  let sideValue  = dealValue(state, ai, sideTerms);            // existing
  let standing   = getStanding(state, ai, suer);
  let standingBoost = standing >= D().tiers.neutral
                    ? CONFIG.diplomacy.suePeace.standingBoost   // default 3
                    : 0;
  return (exhaustion + sideValue + standingBoost)
         >= CONFIG.diplomacy.suePeace.acceptThreshold;          // default 8
```

A refused peace breaks nothing — the war continues, no Honor hit, no
Standing change.

**Engine status:** ⚠ unconditional `make-peace` exists. Add a new verb
`"sue-for-peace"` that calls `aiAcceptsPeace`; apply the peace + side
terms atomically on acceptance. Old `make-peace` remains as the
internal call for AI-to-AI peace settlement (via `mediate`).

### 1.6 Open borders — cross-system contract

`openBorders` is a tracked agreement state in its own right. Its direct
gameplay effect is delivered by the **movement / blockade system**
(separate work track): a faction with an active openBorders agreement
toward you may move its units through hexes you control and adjacent
to your units without triggering the blockade stop the movement system
will introduce.

**The diplomacy agent implements:**
- The agreement state (`type: "open-borders"` standalone, or
  `openBorders: true` flag on a pact agreement).
- The `set-open-borders` verb — start/stop a standalone agreement.
  Requires Friendly+ Standing; both rep gates clear; not at war.
- The `toggle-open-borders` verb — flip the pact-default share without
  dissolving the pact; −`CONFIG.diplomacy.pact.toggleBordersStandingHit`
  (default 1) Standing per toggle-off; restored on toggle-on.
- The `defaults true between pacted parties` rule, applied automatically
  on pact formation.
- An exported helper **`hasOpenBorders(state, transitingFid, ownerFid)
  → boolean`** that the movement-blockade system calls. Returns true if
  any active agreement grants transitingFid passage through ownerFid's
  territory.

**Boundary:** the movement-blockade system reads `hasOpenBorders`. If
that system hasn't landed, the helper is still callable and accurate;
openBorders simply has no observable effect until movement consumes it.
**This is not a stub** — the diplomacy side is complete, with a
contracted helper exposed for the consumer.

**Engine status:** ⚠ promise item accepted in deals; agreement state
not distinguished, no toggle verbs, no `hasOpenBorders` helper.

### 1.7 Free vassal (new)

Voluntarily release a vassal. The clemency move.

- **+5 Honor** to the lord (clemency reputation).
- Standing of the freed faction toward the (former) lord **rises to
  Friendly** (relief at autonomy).
- Standing of factions hostile to the freed party **cools toward the
  former lord** by 1 tier (you didn't crush them — no one needs to fear
  you next).
- The tribute flow stops; the freed faction's autonomy/resentment
  resets to 0; the relationship reverts to a normal pacted state.
- Emit `vassal_freed`.

**Engine status:** ✗ not implemented. New verb `"free-vassal"`.

### 1.8 Player-initiated pact call

The engine already has `pactCall(state, caller, ally, target)` — used
internally — but the ally currently always honors (placeholder). Both
the player surface AND the AI evaluation are gaps.

**Player surface:** add a `performDiplomacy` case
`"pact-call" { ally, target }`. Requires the caller (the active player)
is pacted with `ally` AND already at war with `target`. Calls a new
shared helper `evaluatePactCall(state, ally, caller, target)` that
returns `honor: boolean`.

**AI pact-call evaluation** (replaces today's placeholder):

```
evaluatePactCall(state, ally, caller, target) =
  // Hard refuses
  if (arePacted(state, ally, target))               return { honor: false, reason: "pacted with target" };
  if (vassalLord(state, target) === ally)           return { honor: false, reason: "target is my vassal" };
  if (!mayEngage(state, ally, target))              return { honor: false, reason: "out of scope" };

  // Soft score
  let hostilityToTarget   = -getStanding(state, ally, target);     // higher = more hostile
  let loyaltyToCaller     =  getStanding(state, ally, caller);     // higher = more loyal
  let targetPowerRatio    = powerOf(state, target) / max(1, powerOf(state, ally));

  let score = hostilityToTarget * CONFIG.diplomacy.pactCall.hostilityWeight   // default 0.3
            + loyaltyToCaller   * CONFIG.diplomacy.pactCall.loyaltyWeight     // default 0.3
            - targetPowerRatio  * CONFIG.diplomacy.pactCall.targetPowerWeight; // default 2.0

  return { honor: score >= CONFIG.diplomacy.pactCall.acceptScoreThreshold };  // default 1
```

Aggressive factions (high `aggression` dial) add a flat +1 to score so
warlords more readily honor calls; pacifists subtract 1. Both apply
**after** the score sum.

**Honor path:** `declareWar(ally, target, "pact-call")`; ally's Standing
toward caller +2 (alliance strengthens).

**Decline path:** caller's Standing toward ally −4; global Honor on ally
−`CONFIG.diplomacy.honor.breakLoss` (default 5).

**Engine status:** ⚠ partial — verb exists with placeholder
acceptance. Replace the placeholder with `evaluatePactCall`; add the
`performDiplomacy` case for player initiation.

### 1.9 Allied vision (auto + toggle)

A passive perk + an explicit override.

**Auto-share:** while two factions are pacted, each faction's visible
set extends to include the other's visible set (mutual). Implemented
as a **post-process union step in `recomputeVisibilityFor`**: after
each faction's per-faction recompute, walk
`state.diplomacy.agreements` and, for any agreement where
`type === "pact"` AND `visionShare === true`, union the two parties'
`visible` sets in-place. Concealment is NOT shared (sharing visible
hexes shares positions of detected enemies; concealed-but-undetected
units stay concealed to the borrowing faction).

**Toggle off:** `performDiplomacy("toggle-allied-vision", { ally,
on: false })` flips `visionShare` to false on the pact agreement.
Standing of the toggling party's view of the ally drops by
`CONFIG.diplomacy.pact.toggleVisionStandingHit` (default 1) the same
round; emit `allied_vision_toggled { agreement, on: false }`.

**Toggle on:** flips back; restores Standing by the same amount.

**Pact formation:** `formPact` initializes `visionShare:
CONFIG.diplomacy.vision.sharedPactDefault` (default true) on the
agreement.

**Engine status:** ✗ allied auto-share is not wired today (intel-deal
revealRegion is one-shot, not ongoing). Implement per above.

### 1.10 Open borders auto-share (allies)

Mirror of §1.9 for openBorders. `formPact` initializes `openBorders:
CONFIG.diplomacy.borders.pactDefault` (default true) on the agreement.
`toggle-open-borders` flips it, costing
`CONFIG.diplomacy.pact.toggleBordersStandingHit` (default 1) Standing
per toggle-off, restored on toggle-on. Emit `open_borders_toggled
{ agreement, on }`. (Standalone open-borders agreements outside a pact
are the `set-open-borders` verb from §1.6, not §1.10.)

**Engine status:** ✗ new (paired with §1.6).

---

## Part 2 — The full action catalog

Nineteen surfaceable actions across four axes (plus inbox items).
**Gating model** for each: hidden / visible-disabled / visible-enabled
(see Part 4 for the model).

### 2.1 Conflict axis

| Verb | Status | Hidden when | Disabled when | Enabled when | Tooltip |
|---|---|---|---|---|---|
| **Declare war** | ✓ | at war / vassal / lord | — | otherwise | "Formal declaration. Breaks pact (−5 Honor) if one is active." |
| **Sue for peace** | ⚠ | not at war | their war exhaustion too low (still winning, too fresh) | otherwise | "Propose peace. They weigh exhaustion + who's winning." |
| **Demand Tribute** | ✗ | at war / vassal / lord | power gap too small (no leverage) | otherwise | "Coerce items. Refusal escalates. Costs Menace." |
| **Denounce** | ✓ | vassal / lord | — | otherwise | "Public condemnation. Lowers Standing here, raises with their enemies." |

### 2.2 Exchange axis

| Verb | Status | Hidden when | Disabled when | Enabled when | Tooltip |
|---|---|---|---|---|---|
| **Gift** | ✓ | vassal / lord | no scrap to give | otherwise | "Gives scrap. Standing gain drops with each gift in the last 3 rounds." |
| **Propose deal** | ✓ | vassal / lord | at war | otherwise | "Open deal-builder. Pick give/get; they evaluate." |
| **Trading Pact** | ⚠ | at war / vassal / lord / either capital missing / no clear route | Standing < Neutral or rep gates fail | otherwise | "+2 scrap/turn each, +1 permanent Research each. Needs clear capital route." |
| **Open borders** | ⚠ | at war / vassal / lord / already pacted (auto-on) | Standing < Friendly | otherwise | "Mutual passage without Menace charge for transit." |

### 2.3 Information axis

| Verb | Status | Hidden when | Disabled when | Enabled when | Tooltip |
|---|---|---|---|---|---|
| **Share map** | ✓ | at war | Standing < Neutral | otherwise | "One-time reveal of your explored hexes." |
| **Share vision** | ✓ | at war | Standing < Friendly | otherwise | "Ongoing shared sight. Auto-on between pact allies." |
| **Toggle allied vision** | ✗ | not pacted | — | always while pacted | "Withhold vision-share. −1 Standing with this ally." |

### 2.4 Bloc axis

| Verb | Status | Hidden when | Disabled when | Enabled when | Tooltip |
|---|---|---|---|---|---|
| **Propose pact** | ✓ | pacted / vassal / lord / at war | gate fails (Standing/Menace/Honor/conflict) | otherwise | "Alliance. Couples your Standing to theirs." |
| **Pact call (you initiate)** | ⚠ | not pacted with them / no active war | — | otherwise | "Call them into a war you're fighting." |
| **Mediate** | ✓ | no two factions warring with each other | Honor too low (no credibility) | otherwise | "Broker peace between two factions. +Honor + Standing." |
| **Vassalize** | ✓ | already vassal of you / your lord | power ratio too high or not cornered | otherwise | "Offer subordination. Accepted when desperate." |
| **Free vassal** | ✗ | not your vassal | — | always while your vassal | "Release vassal. +5 Honor; Standing rises." |
| **Toggle open borders** | ✗ | not pacted | — | always while pacted | "Withhold passage. −1 Standing with this ally." |

### 2.5 Passive / inbox

| Item | Status | UI surface |
|---|---|---|
| **Pact call (incoming)** | ⚠ | Inbox badge → modal "Ally X went to war with Y. Honor the pact?" Honor / Decline buttons with consequences. |
| **Demand Tribute (incoming)** | ✗ | Inbox badge → modal "X demands tribute under threat of war." Accept / Refuse buttons. |
| **Trading pact suspension warning** | ✗ | Banner on diplomacy screen + map dotted-line marker. "Route to {ally} blocked — {n} rounds until dissolution." |
| **Coalition formed** | ✓ | Banner on diplomacy screen, list of contributors. |
| **Standing tier change** | ✓ | Inline toast in event feed; tier label on faction row updates. |

---

## Part 3 — UI structure

### 3.1 Top-level: side drawer

The diplomacy surface is a **right-edge side drawer**, ~420 px wide,
sliding in from the right with the map remaining visible (~60 % of
viewport) behind it. The map stays fully interactive — pan, zoom,
click — so the player can read a faction's row while seeing where their
units are, and pick map targets (Mediate, Demand Tribute, Pact call)
without leaving the drawer.

The drawer has three nested levels:

1. **Landing** — your reputation summary + list of all known factions.
2. **Faction detail** — selected faction's state + actions menu.
3. **Action pane** — for verbs that need parameters (custom deal,
   mediate, demand-tribute, sue-for-peace, pact-call).

Back arrow on each non-landing view. Esc closes the drawer entirely.

### 3.2 Landing view

**Top bar:** your faction color + name. Optional standing-tier filter
chips (All / Pacted / At War / Vassals).

**Your reputation block:**
- **Menace bar** — your current Menace, color-graded. Markers along the
  bar show *each known faction's Tolerance threshold* (small tick at
  each faction's color); markers right of your value mean you are over
  that faction's Tolerance.
- **Honor bar** — your current Honor. Markers show each faction's trust
  floor.
- **Threat score** with the coalition-trigger marker.
- **Recognition score** — `X / Y` plus a one-line gloss on what you
  need (or have won).

**Coalition banner** — when active: "A coalition has formed against
you: X, Y." Red strip across the top of the list.

**Pact call inbox** — when pending: clickable banner "Ally X calls you
to war against Y" jumping straight to the response modal.

**Faction list** — scrollable. Each row is an **at-a-glance row**:

#### At-a-glance row contents

- Color dot + faction name + scope tag ("major" / "local").
- Standing tier label only — **Allied / Friendly / Neutral / Wary /
  Hostile.** No numeric value.
- One-line plain-English sentiment of how they see you:
  - **Allied** — "Sees you as a partner."
  - **Friendly** — "Generally favorable."
  - **Neutral** — "Indifferent."
  - **Wary** — "Watching warily."
  - **Hostile** — "Despises you."
- Sentiment is modulated by Menace / Honor when extreme:
  - Menace > Tolerance → append "and considers you a tyrant."
  - Honor < trust floor → append "and distrusts your word."
  - At war → "and is at war with you."
- Relationship tag if any: **PACTED / AT WAR / YOUR VASSAL / YOUR LORD
  / IN COALITION.**
- Up to two warning glyphs:
  - 📞 — pact call pending **from** this faction.
  - ⚠ — they're at war with one of your allies (drag risk).
  - 💀 — your Menace > their Tolerance OR Honor < their floor (a
    Recognition blocker).
  - ⏳ — Trading Pact suspended, grace clock ticking.

Clicking the row opens **Faction detail**.

### 3.3 Faction detail (drawer view 2)

Header: back arrow, color dot, faction name, tier, temperament
keyword, scope tag.

#### Sentiment panel
Plain-English summary, expanded to 2–4 sentences:
- Their sentiment tier (same line as the landing row).
- What they admire / dislike about you, drawn from temperament + wants
  vs. your behavior. "Values open trade. Resents your high Menace."
  "Welcomes your reliability. Worries you are growing too strong."
- **Hidden by design** (your call): raw Standing number, raw Menace
  value, raw Honor value, raw Tolerance, raw trust floor.

#### Reputation gate panel
Visual: two horizontal bars showing whether your reputation passes
their gates **without exposing raw numbers**:

- **Menace bar** — colored green up to their Tolerance, red beyond.
  Your current Menace position appears as a marker. Quick read: marker
  in green = you're within Tolerance; marker in red = you're a tyrant
  to this faction.
- **Honor bar** — colored red up to their trust floor, green above.
  Your Honor marker shows position.

Both bars are anonymized (no axis labels with numbers). The player
reads green-marker / red-marker pass/fail at a glance.

#### Relationship & obligations panel
- **We have:** list of active obligations between you (pact / non-
  aggression / open borders / trading pact / tribute flow / promises).
  Each item shows duration if applicable.
- **They have with:** list of *their* third-party agreements — "Allied
  with Y", "At war with Z", "Vassal of W."
  - **Gated by Intelligence B1 Spy Ring** (§17.5). Shows "—
    Espionage required" without B1.
- **Trading Pact route status** when applicable: "Route clear"
  (green) / "Route suspended, X rounds until dissolution" (amber).

#### What they want
Drawn from temperament + current goals:
- "Wants: routes, open borders, your Honor." (trader)
- "Wants: joint wars and targets." (warlord)
- "Wants: tribute and respect." (opportunist)

Used as courtship guidance — "if you want them to like you, offer
this."

#### Actions menu
The 18 verbs as a vertical button list (the 19th, Toggle allied vision,
sits inline on the obligations panel under the active vision share),
filtered through the gating model:

- **Hidden** verbs do not appear.
- **Disabled** verbs are shown greyed with a tooltip on hover stating
  the failing gate.
- **Enabled** verbs are active.

Verbs that need parameters (Custom Deal, Mediate, Demand Tribute, Sue
for Peace, Pact Call) open the Action pane on click. Verbs without
parameters (Declare war, Gift X, Denounce, Vassalize, Free vassal,
Propose pact, Toggle allied vision, Toggle open borders, Share map
one-tap) fire immediately with a confirmation toast.

#### Tech-wheel info (Spy Ring B1 gated)
A small panel:
- Their assigned tech nodes (icons, hoverable for names).
- Their pairwise Standing matrix with all other factions (small grid).

Without B1: "Espionage required to read."

### 3.4 Action panes (drawer view 3)

Back arrow returns to the faction detail.

#### Custom Deal pane
Two columns:

**You give:**
- Scrap (slider, 0 — your balance)
- Research one-time grant (small, ≤ 2)
- Chip dropdown (installed chips you can spare)
- Map data (one-time, toggle)
- Vision share start (toggle — adds an ongoing flow)
- Promise: peace / non-aggression / open borders / join-war(target
  picker) / don't-ally(target picker) / tribute (toggle + sub-params)

**You get:** same item set, mirrored.

Below: live preview "They will likely **accept** / **decline**." with
reason: "They lack scrap" / "They want a chip you offered" / "They
won't promise non-aggression at Wary."

Submit: **"Propose."** AI evaluates atomically.

#### Mediate pane
List of pairs of factions currently at war with each other. Player
picks a pair. Optional one-line summary of each war ("War round 4 —
Korad winning"). Submit calls `mediate`. On success, both factions
accept; you bank Standing with each + Honor.

#### Demand Tribute pane
Similar to Custom Deal but only the **You get** column is enabled. The
implicit give is a peace-keeping promise: "in exchange for not making
your life worse." Live preview shows: "They will likely **cave** /
**refuse and escalate** / **refuse and turn hostile**."

#### Sue for peace pane
Like Custom Deal, **pre-loaded** with a peace promise in your give
column (immutable). Optional side terms (sweeteners — scrap, research,
chip). Live preview shows acceptance with war-exhaustion + winning-side
factors stated.

#### Pact call (incoming) — modal
Triggered by the inbox badge.

> **{Caller}** is at war with **{target}.**
> Will you honor the pact?

Buttons:
- **Honor** — declares war on {target}. Standing with {caller} rises.
- **Decline** — Standing with {caller} drops sharply. Honor −5
  globally.

Each button shows consequences in plain English on hover.

#### Pact call (outgoing) — pane
Two pickers: (1) which pacted ally to call, (2) which of your active
wars to call them into. Submit fires `pact-call`. AI evaluates with
the standard logic.

---

## Part 4 — Gating model

### 4.1 Three states per (verb × faction)

- **Hidden** — the verb makes no sense (would be a no-op or
  contradiction). Don't render. Examples: Vassalize your lord, Free
  vassal of a non-vassal, Pact call without an active war, Trading Pact
  when neither party has a capital.
- **Visible, disabled** — the verb applies in principle but cannot
  succeed now. Render greyed with an explicit tooltip explaining the
  failing gate. This is what makes courtship legible: the player learns
  the system by reading the gates instead of trial-and-error.
- **Visible, enabled** — green-lit. Tooltip shows likely outcome (AI
  accept-probability hint where computable, else generic intent).

### 4.2 Tooltip patterns

- **Disabled verbs:** *"Disabled — {reason}."* — e.g. "Disabled —
  Standing needs Friendly+ (currently Wary)." "Disabled — your Menace
  exceeds their Tolerance." "Disabled — no clear route between
  capitals." "Disabled — you have no scrap to gift."
- **Enabled verbs:** *"What it does. {Likely outcome}."* — e.g.
  "Propose alliance. They will likely accept." "Demand tribute. They
  will likely refuse — escalates to war."

Acceptance hints come from `wouldAccept` evaluation, presented as one
of: "will likely accept" / "is plausible" / "will likely decline."

### 4.3 Standing-tier baseline (per verb)

The minimum Standing tier each verb requires from the target:

- **Anytime / war-only:** Declare war, Denounce, Demand Tribute, Sue
  for peace (war-only), Gift, Mediate (subject to own gates).
- **Neutral+:** Trading Pact, Share map, Propose deal, custom deal
  items, Vassalize (when also cornered).
- **Friendly+:** Open borders, Share vision, Propose pact.
- **Allied-only:** Pact call (initiate + receive), Toggle allied
  vision, Toggle open borders, Free vassal (vassal-only).

### 4.4 Hard rep gates (apply universally)

Independent of Standing, two reputation gates can block any pact-tier
or higher verb:

- **Menace > target's Tolerance** → blocks Pact, Trading Pact, Open
  borders, Vassalize (acceptance side).
- **Honor < target's trust floor** → same.

Visible in the faction detail's reputation panel. The player can see
*at a glance* whether these gates are passing.

---

## Part 5 — Interaction details

### 5.1 Opening the drawer

- HUD button "Diplomacy" — permanent way in to the landing view.
- Pact-call inbox badge — jumps straight to the response modal.
- Right-click a faction's unit / Location on the map → context-menu
  "View diplomacy with {Faction}" → opens drawer directly to that
  faction's detail.

### 5.2 Closing

- Esc key.
- Click outside the drawer (on the map area).
- "×" in the drawer header.
- Back arrow on the landing view closes the drawer.

### 5.3 Map binding while drawer is open

The map remains fully interactive. Two affordances tie drawer state to
map presentation:

- **Faction detail open** → that faction's Locations on the map
  highlight in their faction color (subtle inner glow).
- **Trading Pact panel open** → the route between capitals draws as a
  dotted line on the map — green when clear, amber when suspended.
- **Mediate / Demand-tribute / Pact-call panes** that need a faction
  target → clicking a faction's Location on the map selects it as the
  target.

### 5.4 Animation budget

- Drawer slide-in: 240 ms ease-out.
- View transitions inside the drawer: 180 ms cross-fade.
- Faction highlight on map: 200 ms fade-in.

### 5.5 Confirmations

Verbs with **permanent or near-permanent consequences** require a
confirm step:

- Declare war (without an existing war-state).
- Surprise attack (this is handled by the attack action, not diplomacy
  — but the action layer should also confirm before firing the −8
  Honor hit).
- Denounce.
- Free vassal.
- Vassalize.

All others fire immediately on click.

---

## Part 6 — Implementation surface

### 6.1 New / modified `performDiplomacy` verbs

```
performDiplomacy(state, pid, action, params)

action ∈ {
  "declare-war"              ✓
  "sue-for-peace"            ⚠ (new — supersedes unconditional make-peace)
  "demand-tribute"           ✗ (new; renamed Ultimatum)
  "denounce"                 ✓
  "gift"                     ✓ (modulated by giftCounter)
  "propose-deal"             ✓
  "trading-pact"             ⚠ (new flavor — replaces old trade route)
  "set-open-borders"         ✗ (new — start/stop standalone openBorders)
  "share-map"                ✓ (already an intel item; one-tap surface)
  "share-vision"             ✓ (already an intel item; one-tap surface)
  "toggle-allied-vision"     ✗ (new — on/off the auto-share)
  "toggle-open-borders"      ✗ (new — on/off allied auto-borders)
  "propose-pact"             ✓
  "pact-call"                ⚠ (verb exists internally; player surface)
  "mediate"                  ✓
  "vassalize"                ✓
  "free-vassal"              ✗ (new)
}
```

### 6.2 State extensions

```js
// §1.2 — { fromPid: { toPid: count-of-gifts-in-window } }
state.diplomacy.giftCounter = {};

// §1.3, §1.6, §1.9, §1.10 — agreement records gain a type tag and
// extra fields. EVERY agreement created by the new verbs sets `type`;
// legacy records without a `type` default to "deal-promise" on read.
state.diplomacy.agreements[i] = {
  id, a, b, give, get, promises,                         // existing
  type: "pact" | "trading-pact" | "non-aggression" |
        "open-borders" | "tribute-flow" | "vision-share" |
        "deal-promise",                                  // NEW — required
  suspended: false,           // trading-pact only — set by route check
  suspendedRounds: 0,         // trading-pact only — incremented while suspended
  visionShare: true,          // pact only — toggled by §1.9
  openBorders: true,          // pact only — toggled by §1.10
};

// §1.5 — extend `state.diplomacy.wars[i]` (today: { a, b, since })
state.diplomacy.wars[i] = {
  a, b, since,                                           // existing
  unitsLost: { [pid]: count },                           // NEW
  locationsLost: { [pid]: count },                       // NEW
  contestsWon: { [pid]: count },                         // NEW
};
```

**State maintenance** (the agent wires these listeners):
- `declareWar(a, b, ...)` initializes `unitsLost: {}`, `locationsLost:
  {}`, `contestsWon: {}` on the new war record.
- `unit_destroyed` event handler: if either the killer's owner and the
  victim's owner are at war, increment `war.unitsLost[victimOwner]`.
- `location_captured` event handler (existing event in `events.js`):
  increment `war.locationsLost[priorController]`.
- `contest_won` event handler: increment `war.contestsWon[winner]`.

Helper `findWar(state, a, b) → war | null` — looks up the active war
record between two factions; returns `null` if not at war.

### 6.3 New / modified CONFIG entries

Complete block (append to the `diplomacy` section of `CONFIG`):

```js
diplomacy: {
  ...,
  honor: {
    ...,
    surpriseAttackLoss: 8,        // §1.1
  },
  gift: {
    windowRounds: 3,              // §1.2
  },
  tradingPact: {                  // §1.3
    scrapPerUpkeep: 2,
    permanentResearchOnFormation: 1,
    suspendGraceRounds: 3,
  },
  demandTribute: {                // §1.4
    minPowerRatio: 1.5,
    caveBaseRatio: 2.0,
    braveryScale: 1.5,
    escalateOnRefusal: "war",     // "war" | "standing-drop"
    refuseStandingDropTiers: 2,
  },
  suePeace: {                     // §1.5
    acceptThreshold: 8,
    standingBoost: 3,
  },
  war: {                          // §1.5
    unitLossWeight: 2,
    locationLossWeight: 4,
  },
  freeVassal: {                   // §1.7
    honorGain: 5,
    standingToFriendly: 5,        // Standing value to set freed-vassal toward you
    rivalCoolingTiers: 1,         // tiers their natural rivals cool toward you
  },
  pactCall: {                     // §1.8
    hostilityWeight: 0.3,
    loyaltyWeight: 0.3,
    targetPowerWeight: 2.0,
    acceptScoreThreshold: 1,
    aggressionScoreBias: 1,       // ±1 to score from caller's aggression dial
    honorGainOnHonor: 2,          // Standing gain to caller from ally
    declineStandingHit: 4,        // Standing hit to caller from ally
  },
  vision: {                       // §1.9
    sharedPactDefault: true,
  },
  borders: {                      // §1.10
    pactDefault: true,
  },
  pact: {                         // §1.9, §1.10
    toggleVisionStandingHit: 1,
    toggleBordersStandingHit: 1,
  },
},
```

### 6.4 New events

Add to `EVENT_NAMES` in `events.js`:

- `surprise_attack_honor_lost { attacker, target, amount }`
- `trading_pact_formed { partyA, partyB }`
- `trading_pact_suspended { agreement, reason }`
- `trading_pact_resumed { agreement }`
- `trading_pact_dissolved { agreement, reason }`
- `vassal_freed { lord, vassal }`
- `pact_call_requested { caller, ally, target }`
- `pact_call_honored { caller, ally, target }`
- `pact_call_declined { caller, ally, target }`
- `tribute_demanded { demander, target, terms }`
- `tribute_caved { demander, target, terms }`
- `tribute_refused { demander, target, escalation }`
- `allied_vision_toggled { agreement, on }`
- `open_borders_toggled { agreement, on }`
- `gift_counter_decayed { fromPid, toPid, value }`

### 6.5 Round-end pipeline additions (in `runDiplomacyRound`)

Insert in this order, **before** the existing AI-to-AI politics step:

1. **Gift counter decay** — for each `fromPid`, for each `toPid`,
   `giftCounter[fromPid][toPid] = max(0, giftCounter[fromPid][toPid] − 1)`.
   Drop the entry when it hits 0. Emit `gift_counter_decayed` only at
   transitions to 0 (avoids event spam).
2. **Trading pact route check** — for each agreement of type
   `"trading-pact"`:
   - Find each party's Capital Location.
   - Call `reinforcementRoute(state, partyA, partyB_capital_hex)` —
     **use the existing helper exactly as the supply system does.**
   - If the route returns null OR `agreement.openBorders === false`
     across the path, set `suspended = true` and increment
     `suspendedRounds`. Emit `trading_pact_suspended` if this is the
     transition.
   - If the route returns a path and was previously suspended, set
     `suspended = false`, reset `suspendedRounds = 0`. Emit
     `trading_pact_resumed`.
   - If `suspendedRounds >= suspendGraceRounds`, dissolve the
     agreement: subtract `permanentResearchOnFormation` from each
     party's `permanentResearch`, call `recomputeResearch`, remove the
     agreement from the array. Emit `trading_pact_dissolved` with
     `reason: "route-severed"`.

### 6.6 Allied vision union (visibility)

Add a new function `applySharedVision(state)` in `visibility.js`:

```js
export function applySharedVision(state) {
  if (!state.diplomacy?.agreements) return;
  for (const agr of state.diplomacy.agreements) {
    if (agr.type !== "pact" || !agr.visionShare) continue;
    const va = state.visibility[agr.a]; const vb = state.visibility[agr.b];
    if (!va || !vb) continue;
    const union = new Set([...va.visible, ...vb.visible]);
    va.visible = new Set(union); vb.visible = new Set(union);
    // explored is monotonic — extend both with the union too
    for (const h of union) { va.explored.add(h); vb.explored.add(h); }
  }
}
```

Call `applySharedVision(state)` **after** `recomputeVisibilityFor` in:
- `recomputeVisibilityFor` itself (the multi-faction wrapper) at the
  end.
- Any call site that does a single-faction `recomputeVisibility` for a
  faction in an active pact (cheaper alternative: always call after the
  pact formation / dissolution / toggle events).

**Concealment is NOT shared** — the union is over `visible` hex sets
only. A concealed-but-undetected unit on a shared hex is invisible to
the borrowing faction unless it has its own Detection in range. The
existing `canSee` concealment check already handles this per faction.

### 6.7 Open borders — system boundary

The diplomacy agent wires the agreement state (§6.2) and the helper
**`hasOpenBorders(state, transitingFid, ownerFid) → boolean`** in
`diplomacy.js`:

```js
export function hasOpenBorders(state, transitingFid, ownerFid) {
  for (const agr of state.diplomacy?.agreements || []) {
    const matches =
      (agr.a === transitingFid && agr.b === ownerFid) ||
      (agr.a === ownerFid && agr.b === transitingFid);
    if (!matches) continue;
    if (agr.type === "open-borders") return true;
    if (agr.type === "pact" && agr.openBorders) return true;
  }
  return false;
}
```

The movement-blockade system (separate work track) imports and calls
this helper to short-circuit blockade rules. **No further diplomacy-
side work is required.** Until the movement system consumes the
helper, openBorders has no observable in-game effect — but the
diplomacy implementation is complete in itself.

### 6.8 Surprise-attack Honor (§1.1) — wire location

In `onAttack(state, attacker, target)` in `diplomacy.js` (existing
function), **before** the existing Menace charge:

```js
const wasAtWar = atWar(state, attacker, target);
if (!wasAtWar) {
  // Surprise strike — pay the Honor toll once per war-initiation.
  state.players[attacker].honor = Math.max(
    D().honor.min,
    state.players[attacker].honor - D().honor.surpriseAttackLoss,
  );
  emit(state, "surprise_attack_honor_lost", {
    attacker, target, amount: D().honor.surpriseAttackLoss,
  });
}
// declareWar (called downstream) initializes the war record; the
// surprise check above must run BEFORE that, so the war record check
// at the top of this function reads "not yet at war."
```

### 6.9 Gift diminishing returns (§1.2) — wire location

In `applyDeal` (`src/game/diplomacy.js`), inside the resource-transfer
branch — when the deal is a one-side gift and the transferred resource
is scrap, replace the existing `adjustStanding(... giftStandingPerScrap
* amount ...)` call with:

```js
const n = (state.diplomacy.giftCounter[fromPid]?.[toPid] || 0);
const baseGain = scrapAmount * D().ai.giftStandingPerScrap;
const actualGain = Math.floor(baseGain / (n + 1));
adjustStanding(state, toPid, fromPid, actualGain, "gift");
state.diplomacy.giftCounter[fromPid] =
  state.diplomacy.giftCounter[fromPid] || {};
state.diplomacy.giftCounter[fromPid][toPid] = n + 1;
```

### 6.10 Free vassal (§1.7) — wire location

New verb in `performDiplomacy`'s switch:

```js
case "free-vassal": {
  const vassal = params.faction;
  if (vassalLord(state, vassal) !== pid) return { ok: false, reason: "not your vassal" };
  // Stop tribute flow
  state.diplomacy.agreements = state.diplomacy.agreements.filter(
    (agr) => agr.vassalTribute !== vassal,
  );
  // Clear vassalage
  delete state.diplomacy.vassals[vassal];
  // Honor + Standing effects
  state.players[pid].honor = Math.min(
    D().honor.max,
    state.players[pid].honor + D().freeVassal.honorGain,
  );
  setStanding(state, vassal, pid, D().freeVassal.standingToFriendly, "freed");
  // Cool standing of rivals (factions hostile to the freed party) toward you
  for (const f of factionIds(state)) {
    if (f === pid || f === vassal) continue;
    if (getStanding(state, f, vassal) <= D().tiers.wary) {
      adjustStanding(state, f, pid,
        -D().freeVassal.rivalCoolingTiers * 3, "freed-clemency");
    }
  }
  emit(state, "vassal_freed", { lord: pid, vassal });
  return r();
}
```

---

## References

- `docs/mechanical-spec-v0.1.md` §18.4–§18.13 — diplomacy mechanics
  baseline. This doc supersedes §18.7 specifically.
- `docs/mechanical-spec-v0.1.md` §16.5 — `reinforcementRoute` model
  reused for Trading Pact route validation.
- `docs/mechanical-spec-v0.1.md` §17.5 — Intelligence B1 Spy Ring
  (gates the third-party-Standing + rival-tech-wheel display).
- `docs/mechanical-spec-v0.1.md` §19 — fog, used for vision-share
  semantics.
- `docs/ai-overhaul-plan.md` — explains why the AI valuation for new
  verbs (sue-for-peace exhaustion, demand-tribute leverage) lives in
  the overhaul, not in the gap-fill agent.
