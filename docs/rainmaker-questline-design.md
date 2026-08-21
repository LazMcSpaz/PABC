# The Rainmaker — Contested Victory Quest Line

*Design draft, rev 2. All twelve open rulings from review are folded in and marked **[ruled]**. Remaining tuning values are marked **[tune]**. Placeholder names throughout: "the Rainmaker" for the device, "the specialist" for the individual at Stage 7.*

---

## 1. What this is

A quest line every faction can pursue, running the length of a game, that ends in an automatic victory if completed and held. Completing the final beat does not win — it starts a **three-turn hold clock**, matching how diplomatic victory resolves. Everyone else gets those three turns to stop it.

The device makes rain. Water and irrigation are the two hardest constraints in this setting, so possessing a working one is decisive. It produces **no benefit at all until activated** — see §6.

**The player can lose this way.** [ruled] An AI that completes the line and holds it for three turns wins the game. This drives two requirements: AI progress must be visible enough to react to (§7), and the AI's path must be a real path rather than a decorative one (§8).

---

## 2. The two-phase structure

This is the load-bearing idea. The quest line behaves as two different games.

**Stages 0–3 are PARALLEL.** Everyone can pursue simultaneously, nobody blocks anybody, progress is private, and it is a race. All guaranteed retained benefits live here.

**Stages 4–8 are EXCLUSIVE.** There is one device. When someone reaches Stage 4, everyone else's quest line terminates and converts to a hunt. They can no longer pursue the Rainmaker — they can only take it.

The transition is announced publicly. This is the design's best moment: it converts every non-leader from *behind* to *hunting*, which is a far better position to be in than trailing, and it gives sabotage its entire purpose.

**Critical rule: the device is transferable, the progress is not.** Take the convoy or storm the capital and you get the Rainmaker — and you begin from Stage 5 at zero, with your own lab requirement (§5.6) still to satisfy. Without this rule, whoever wins the search effectively wins the game, and everyone who invested twenty turns has nothing.

**The hold clock resets on capture.** [ruled] Seizing a settlement on turn 2 of someone's clock does not inherit a clock with one turn left. The captor restarts from Stage 5 like any other seizure.

---

## 3. Retained benefits

Every parallel-phase stage pays something kept regardless of outcome. This is what makes the line worth starting for a player with no intention of finishing it, and what makes a losing racer dangerous rather than pitiable.

Two rules:

1. **Retained benefits exist only in Stages 0–3.** The exclusive phase pays nothing but the device. If it also paid infrastructure, the leader would compound a lead nobody could catch.
2. **The retained package is worth slightly less than the same turns spent on a normal build.** Racing is a reasonable gamble, not free money. If it is worth more, racing becomes the mandatory opening and there is no decision to make.

**Deliberate consequence: the retained benefits are the interception kit.** Lab, salvaged vehicle, and survey data are all mobility, sight and reach — exactly what is needed to hunt a slow convoy. A player who raced and lost is a *better* vulture than one who never engaged, who arrives late, slow and blind. Tune toward this on purpose.

**Scarcity split:** infrastructure benefits (the lab) are unlimited — three players may each build one. *Found* benefits (the vehicle, site caches) are scarce and deplete; the third faction to search a region finds nothing worth hauling home.

**Starting magnitudes** [tune] — sized against the "slightly less than a normal build" rule:

| Stage | Benefit | Suggested value |
|---|---|---|
| 1 | Lab | Standard building, full cost, standard function. Value is that it is *kept*, not that it is discounted. |
| 2 | Survey data | +1 sight radius, permanent, non-stacking |
| 3 | Salvaged vehicle | +1 movement to one unit stack, permanent; **first two finders only**, third gets nothing |

Total package should land around 80–85% of the value of the same turns spent on ordinary development.

---

## 4. Universal beat rule

Factions are mechanically identical, so beats must not be designed against faction strengths. They must be designed against **player build**.

> **Every beat has at least two solution paths, drawing on different currencies.**

A beat solvable only by military strength locks out a tall economic player. One solvable only by payment locks out a wide aggressive one. Two paths minimum at every stage.

---

## 5. The beats

### Stage 0 — The Myth
**Trigger:** turn 8–12, or on first contact with a relevant ruin or settlement.
**Cost:** none. **Duration:** instant.

Delivered as a standard encounter. Establishes the story and offers the choice to commit.

**Declining is not permanent.** [ruled] Re-entry is allowed at any later point. The penalty is the turns already lost, which is sufficient.

**The myth does not expire.** [ruled] If no faction engages, AI progress continues in the background regardless, and the line eventually forces itself onto the board when someone reaches Stage 4 and the public announcement fires. An ignored line is not a dormant one.

**Retained:** none. This is the hook.

### Stage 1 — The Research
**Cost:** significant. **Duration:** 3 turns. **Requires:** building a **lab**.

The lab is the mechanism. Researching the myth means constructing a facility, which is why the benefit survives failure.

**Two paths:** build the lab, or acquire the research from a faction that already has it — purchase, treaty, or capture. The second is cheaper and tells the seller exactly what you are doing.

**Retained:** the lab and its ordinary function, permanently.

### Stage 2 — The Region
**Cost:** none. **Duration:** 1–2 turns.

An interval beat. The research resolves to "somewhere on this landmass." Deliberately anticlimactic — it paces the transition from a build task into an open-ended one.

**Retained:** +1 sight radius, permanent.

### Stage 3 — The Search
**Duration:** open, with a floor and a hard ceiling.

**Player side — deterministic.** A hex is chosen at spawn and fixed. If the player's unit enters it, they find it, guaranteed, that turn. No per-hex roll. A player must never stand on the right hex, find nothing, and have it appear on a later visit.

**Narrowing.** Searching accumulates progress that shrinks the *revealed candidate area* toward the fixed hex: landmass → quadrant → region → a handful of candidate hexes. The player is never told "not here" about a hex they are standing on; they are told the area is smaller than it was. This is one system serving both the fairness requirement and the duration requirement.

**AI side — probabilistic.** Each AI accrues the same hidden counter as a per-turn percentage, weighted by temperament, below the player's effective rate. No unit pathing required.

**Ceiling: 6 turns of searching from Stage 3 opening.** [ruled] At that point whoever has accumulated the most search progress finds it automatically. With a Stage 0 trigger of turn 8–12, the guarantee lands around **turn 17–20**. The quest can never stall the game.

**On discovery, the site is revealed to everyone.** The finder gets one free Stage 4 progress step and roughly two turns of uncontested access, but the location goes public immediately. This preserves the background-dice abstraction without a player ever losing to something they could not see coming.

**Minimum spawn distance: 4 hexes from any capital.** [ruled] Below this a lucky spawn collapses the exclusive phase into a trivial haul. See §6 on the residual spawn-luck exposure.

**Retained:** salvaged vehicle, +1 movement. First two finders only.

### Stage 4 — The Site *(exclusive phase begins)*
**Duration:** 3 turns on site. **Cost:** moderate.

The device must be understood before it can be moved. Requires holding the hex with units present for the full duration — which makes the holder a stationary, publicly known target for the first time.

**Public announcement fires here.** All other factions' quest lines convert to hunt state.

**Two paths:** hold and research fully, or take a faster partial extraction that damages the device and adds turns at Stage 6.

### Stage 5 — The Transport
**Speed:** strictly 1 hex per turn. **Destination: the holder's capital.**

**Road and rail bonuses do not apply to the haul.** [ruled] No movement modifier of any kind applies. The convoy moves one hex per turn from the site to the capital, and existing infrastructure gives no advantage whatsoever.

The best beat in the design and worth the most investment. A slow, visible, vulnerable convoy crossing open board is the most legible sabotage window available — everyone sees it, everyone knows what it means, and intercepting it is a real decision with a real cost.

**Interception runs the entire length of the transport.** [ruled] There is no safe stretch. The convoy is huntable from the moment it leaves the site until it is inside the capital.

**The claim lock governs exclusivity, not vulnerability.** The first faction to engage holds a **2-turn exclusive window** [ruled] during which no other faction may engage. On expiry or failure, the claim passes to the next claimant. This produces sequential duels rather than a six-turn scrum around a stalled convoy, and reads diegetically — nobody wants to be the second army in a fight whose winner still faces a third.

**Consequence: claiming early is a commitment.** Strike too soon with too little and you have burned your window and cleared the road for someone stronger waiting behind you.

**A successful interceptor inherits the same exposure.** They now hold the device and must haul it to *their* capital at 1 hex per turn, huntable the whole way. A late interception near one's own capital is therefore genuinely valuable — it is a short haul.

**Two paths:** heavy escort, or a fast light route with a decoy convoy.

### Stage 6 — The Installation
**Duration:** 4 turns. **Cost:** high.
**Hard prerequisite: a lab in the destination capital.**

The lab did the foundational work of understanding the device. Any faction that skipped Stage 1 — a pure vulture, or anyone who seized the device — **must build one now**, at full cost and duration, before installation begins.

This is the vulture toll. It does not forbid the strategy; it prices it, and prices it at the worst possible moment, when the holder is publicly known and stationary.

### Stage 7 — The Specialist
**Duration:** variable.

Installation stalls on a problem requiring a named individual who belongs to no faction.

**The specialist is poachable, not findable** — hired, out-bid, or taken, and can change hands *after* being secured. This is the cheapest non-military sabotage lever in the design; it gives a trailing player without an army a real way to stall the leader.

**One primary, one backup.** [ruled] The backup is not mentioned, hinted at, or visible in any UI until the primary is permanently unavailable — poached beyond recovery, or dead. A rival who removes the primary gets the full satisfaction of having landed a decisive blow, and then a second name surfaces. Sabotage stays meaningful without becoming a hard stop.

The backup should be **worse**: harder to reach, more expensive, or slower to deliver. Losing the primary must cost something real.

**Two paths:** pay, or take.

### Stage 8 — Activation, the Siege, and the Hold
**Duration:** 3 turns.

Switching the device on is a single action that simultaneously:

1. Begins producing water and food
2. Starts the **three-turn victory clock**
3. Triggers the **siege**

These are the same event. The siege is not a separate hurdle — it is the timer wearing a coat. The device does nothing before this moment, which prevents the holder from snowballing to a conventional victory during Stages 4–7 and rendering the line redundant.

**The siege is made of rivals.** [ruled] Live factions redirect toward the holder. A neutral spawn exists only as a floor, so that a runaway leader with no surviving neighbours still gets tested rather than winning uncontested.

**The claim lock does not apply to settlements.** [ruled] Everyone may converge on the capital at once. The lock exists because a stalled convoy in open field is dull; a final siege with three factions arriving together is the ending the design is built toward.

Survive three turns holding the settlement and the game ends.

---

## 6. Destruction, and other pressure valves

**The device can be destroyed rather than taken.** [ruled] Priced very high — a deliberate, expensive commitment, not a spite button. Destruction **ends the line permanently for every faction**; nobody wins this way afterward. A faction that cannot win it may rationally prefer that nobody does, and that should be a real decision with a real cost.

**Residual spawn-luck exposure.** With no road bonus and a capital-only destination, the difference between a 4-hex and a 14-hex haul is large and entirely map-driven. Flagged for playtest. If it bites, the cheapest fix is to let the **first finder** establish a staging holding, rather than loosening the capital-only destination rule.

**Anti-runaway measures:**

- The device pays nothing until Stage 8. The single most important balance rule in the design.
- Progress is public at coarse resolution. Everyone knows the holder is at Stage 6 of 8. Nobody knows their garrison, their route, or their remaining strength.
- Later stages may cost more when ahead — optional, if playtesting shows the leader compounding.
- Retained benefits favour the chasers, per §3.

---

## 7. Information and warnings

**To non-participants during the parallel phase:** coarse and late. *Someone is researching* → *someone has found it* → *the convoy is moving*. Specific routes stay unknown until within sight range. Enough to decide whether to commit; not enough to intercept without effort.

**The amassing-forces warning.** [ruled] Because the player can lose to an AI completing this, the final siege must be foreseeable rather than a gotcha. Activation fires a public declaration, and from that moment:

- Rival factions redirecting toward the holder become visible **as intent** — a turn-by-turn readout of who is committing and roughly what weight — before their units arrive.
- The holder gets at least **one full turn of warning** to redeploy.
- Incoming factions see the same information **about each other**, which makes converging on a defended capital a decision rather than a reflex.

The information is symmetrical on purpose. The holder knows what is coming; the attackers know they are not alone.

---

## 8. AI behaviour

Scripted, not modelled. Each AI carries a disposition — **pursue / block / ignore** — assigned by faction temperament and re-rolled at progress thresholds. AI progress accrues as background percentages per §5.3; no unit pathing is required until they commit to an interception or a siege.

Four legible behaviours, no utility model:

- pursues aggressively and defends its own attempt
- blocks whoever leads, does not pursue
- ignores entirely, will opportunistically vulture
- sells its position — assists whoever pays

Because an AI can win outright, the pursue disposition must be able to complete every stage, including the lab prerequisite and the specialist.

---

## 9. Systems required

| System | Notes |
|---|---|
| **Contested quest mode** | Every existing quest is `mode: "single-player"` and every encounter targets `recipient: "active"`. Nothing in the current data model expresses shared state. Largest engine ask in the design; blocks everything else. |
| **Per-player progress on a shared object** | With a public/private visibility split. |
| **Interception claim lock** | 2-turn exclusive engagement window with claim pass-on. Applies to convoys only, never settlements. |
| **Movement modifier suppression** | Convoy ignores roads, rail, and all other movement bonuses. |
| **Accumulating search counter** | One system, two resolutions — deterministic hex entry for the player, background percentage for AI. Plus a 6-turn hard ceiling. |
| **Hold clock** | Three-turn victory timer, resets on capture. Presumed to exist from diplomatic victory; reuse rather than duplicate. |
| **Transferable object with non-transferable progress** | Seizure grants the device and resets stage progress to Stage 5. |
| **Building prerequisite gate** | Lab required at Stage 6 regardless of path taken. |
| **Intent telegraphing** | Faction commitment visible before unit arrival, symmetrically. |
| **Hidden successor entity** | Backup specialist invisible until the primary is permanently unavailable. |

---

## 10. Remaining open items

All twelve review questions are ruled. What is left is playtest tuning and two genuine unknowns:

- **Retained benefit magnitudes** — starting values in §3, to be tuned against the 80–85% target.
- **Spawn-luck exposure** — §6. Watch the 4-hex versus 14-hex haul spread.
- **What happens if the holder is eliminated entirely mid-transport?** Does the device sit on the board as a claimable object, revert to the site, or pass to the eliminating faction? Not yet ruled.
- **Can a faction be barred from re-entering after destroying the device?** Destruction ends the line for everyone, so the question is whether the destroyer takes any additional penalty. Not yet ruled.
