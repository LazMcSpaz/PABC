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
  same routing model as `reinforcementRoute` (§16.5): blocked by
  enemy-controlled Locations and enemy ZoC; friendly + neutral + your
  own hexes pass freely. Computed on demand.
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

Mechanics unchanged from §18.7 Ultimatum. UI label is **Demand Tribute**
(more concrete to the player); engine action key changes from
`"ultimatum"` to `"demand-tribute"`.

A coerced deal: demand items backed by your military / Menace. The AI
weighs cave-vs-resist by power gap and Temperament. Accepting yields
tribute; refusing escalates to war or a Standing drop. Costs Menace.

**Engine status:** ✗ not present as a verb in `performDiplomacy`. New
case `"demand-tribute"` (engine semantics per §18.7 unchanged).

### 1.5 Sue for peace (deal-evaluated)

Replaces unconditional `make-peace`. Sue for peace is a **peace deal**:
the player proposes a deal with a `peace` promise as the give item,
optional side terms (extra scrap, a chip, a research grant…). The AI
evaluates with `wouldAccept`, weighing:
- War exhaustion (turns spent in war, units lost) — strong pull toward
  yes.
- Who's currently winning — the winning side resists peace until
  exhausted.
- Standing — higher Standing increases willingness.
- Relationship bias as elsewhere.

A refused peace doesn't break anything; the war just continues. No
Honor hit on refusal by either side (the offer wasn't a promise).

**Engine status:** ⚠ `make-peace` is unconditional. New verb
`"sue-for-peace"` calls `wouldAccept` on a peace-promise deal and
applies it only on acceptance. Old `"make-peace"` may remain as an
alias for AI-to-AI bookkeeping.

### 1.6 Open borders — Menace suppression

`openBorders` is a valid promise item but the engine does not currently
suppress Menace for transit through the receiver's territory while
active. Fix:

- When the per-attack Menace charge is computed, check whether the
  attacker holds an **active openBorders promise with the target.** If
  yes, this is a transit through friendly territory — the Menace
  component for **mere transit / ZoC pressure** is suppressed.
- **Actual attacks against the target still charge full Menace.**
  openBorders only blesses passage, not aggression.
- Active by default between pact allies (formed automatically with the
  pact, unless one side explicitly toggles it off — §1.10 below).

**Engine status:** ⚠ the promise is accepted but unused. Wire the
suppression in `onAttack` / Menace path.

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
internally for AI-to-AI politics. The player should be able to call
their own pact ally into a war the player is currently fighting.

UI: in the faction detail of a pacted ally, if you have any active
wars, a "Call into war" option appears with a target picker (your
active wars). AI evaluates with the standard pact-call logic. On honor:
the ally declares war on the target. On decline: the ally takes a
Standing hit with you + Honor ding (existing rule).

**Engine status:** ⚠ verb exists internally; needs a `performDiplomacy`
case `"pact-call"` taking `{ ally, target }` for the player to reach.

### 1.9 Allied vision (auto + toggle)

A passive perk + an explicit override.

- **Auto-share:** while two factions are pacted, each faction's visible
  set extends to include the other's visible set (mutual). Implemented
  as a per-pact flag `vision_share: true` checked in `recomputeVisibility`
  (or as a post-process union).
- **Toggle off:** either party may explicitly withhold by calling
  `toggle-allied-vision { ally, on: false }`. Suspends the auto-share
  without breaking the pact. Costs a small Standing hit (the ally
  notices: −1 Standing).
- **Toggle on:** reverses the suspension; restores Standing.

**Engine status:** ✗ allied auto-share is not wired today (intel-deal
revealRegion is one-shot). New: pact agreements gain `visionShare:
boolean` (default true); visibility recompute unions across active
true-shares.

### 1.10 Open borders (auto + toggle, between allies)

Mirror of §1.9 for openBorders. Default `true` between pacted parties;
either party may toggle off, costing a 1-tier Standing hit; toggling
back on restores.

**Engine status:** ✗. New verb `"toggle-open-borders"`.

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
state.diplomacy.giftCounter = {};        // §1.2 — { fromPid: { toPid: n } }
state.diplomacy.agreements[i].type =     // discriminate live agreements
  "pact" | "trading-pact" | "non-aggression" | "open-borders" |
  "tribute-flow" | "vision-share" | "deal-promise";
state.diplomacy.agreements[i].suspended = false;       // trading-pact only
state.diplomacy.agreements[i].suspendedRounds = 0;     // trading-pact only
state.diplomacy.agreements[i].visionShare = true;      // pact-flag, toggleable
state.diplomacy.agreements[i].openBorders = true;      // pact-flag, toggleable
```

### 6.3 New / modified CONFIG entries

```js
diplomacy: {
  ...,
  honor: {
    ...,
    surpriseAttackLoss: 8,  // §1.1
  },
  gift: {
    windowRounds: 3,        // §1.2
  },
  tradingPact: {            // §1.3
    scrapPerUpkeep: 2,
    permanentResearchOnFormation: 1,
    suspendGraceRounds: 3,
  },
  vision: {
    sharedPactDefault: true,    // §1.9
  },
  borders: {
    pactDefault: true,          // §1.10
  },
},
```

### 6.4 New events

- `surprise_attack_honor_lost { attacker, target, amount }`
- `trading_pact_formed { partyA, partyB }`
- `trading_pact_suspended { agreement, reason }`
- `trading_pact_resumed { agreement }`
- `trading_pact_dissolved { agreement, reason }`
- `vassal_freed { lord, vassal }`
- `pact_call_requested { caller, ally, target }` — outgoing from player
- `tribute_demanded { demander, target, terms }` — inbox arrival
- `allied_vision_toggled { agreement, on }`
- `open_borders_toggled { agreement, on }`

### 6.5 Round-end pipeline additions

In `runDiplomacyRound`:

1. **Gift counter decay** — for each `fromPid`, for each `toPid`,
   `giftCounter[fromPid][toPid] = max(0, giftCounter[fromPid][toPid] − 1)`.
2. **Trading pact route check** — for each agreement of type
   `trading-pact`, recompute the capital-to-capital route; flip
   `suspended` and increment `suspendedRounds` accordingly. If
   `suspendedRounds >= suspendGraceRounds`, dissolve (remove the
   Research floor + agreement).

### 6.6 Allied vision union (visibility)

In `recomputeVisibility` (or as a post-process step over all factions),
union each faction's `visible` set with every pact-ally's `visible` set
where `agreement.visionShare === true`. **Concealment is still per
faction** — sharing visible hexes does NOT share Detection. (Concealed
enemies remain concealed to the borrowing faction unless they have
their own Detection.)

### 6.7 Open borders Menace suppression

In `onAttack` / wherever per-attack Menace is computed, the existing
charge stands. New: a **transit-Menace** charge that previously implicit
in proximity / ZoC reads is gated to zero while an active openBorders
agreement exists between the parties. (If no transit-Menace is
currently charged anywhere, this is a no-op forward-compat hook —
document and leave for the system that introduces it.)

---

## Part 7 — Open items / decisions deferred

- **Pact-call AI evaluation factors.** Spec says "the AI evaluates";
  the existing `pactCall` function honors automatically (placeholder).
  Needs a proper evaluation: target hostility to ally, war exhaustion,
  power gap. Out of scope here; the verb surface lands first.
- **War-exhaustion modeling.** Sue-for-peace relies on it; needs a
  concrete state machine (turn counter per war, attrition counter, who-
  controls-more-territory snapshot).
- **Demand-tribute power-gap formula.** Spec calls it qualitative;
  needs a numeric threshold ("at least 1.5× power") for the
  enable/disable gate.
- **Trading Pact suspension feedback to the AI.** Should an AI-side
  partner take a Standing hit when their human partner's route is
  blocked by *their* fault (one of their own units / ZoC blocking the
  route)? Probably not — but worth confirming during play test.

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
