# The Rainmaker — Implementation Notes and Failure Modes

*Companion to `rainmaker-questline-design-rev2.md`. Read that first; this document assumes it.*

This is a list of places where a reasonable implementation produces a wrong result. It is deliberately not prescriptive about *how* — the codebase's own conventions should win every time. What it does specify is **observable behaviour**, and where two behaviours look identical in the common case but diverge in an edge case, it says which one is correct.

Where a rule below contradicts something that seems more natural in the code, the rule is not a preference. Each one exists because the alternative breaks a specific thing.

---

## 0. Art dependency

**A sprite for the device is in progress and will be supplied.** The Rainmaker must render on the map as a distinct object during Stage 5 transport, visible to every faction with sight of its hex — not as a unit flag, status icon, or modifier on the escorting stack.

Build the transport representation expecting a dedicated map object with its own sprite. Placeholder art is fine for now; do not architect it as "an escort unit with a buff," because it is not one — it persists through the destruction of every unit around it (§4), it changes hands, and it can sit unowned on a hex (§5).

---

## 1. The single most likely mistake: progress transferring with the device

**Correct behaviour:** capturing the device grants the object and nothing else. The captor begins at Stage 5 with zero progress, and must satisfy the Stage 6 lab prerequisite in their own capital even if the previous holder had one.

**Why it will go wrong:** the natural implementation stores quest progress on the quest and the device as a property of it. Then capture either transfers the whole quest state (captor inherits Stage 7 progress — catastrophic) or destroys it (captor gets an object they can never use — also wrong).

**Test:** seize the device from a faction at Stage 7 with an installed lab. The captor should be at Stage 5, holding the device, with no lab credit. The victim should retain their lab as a building, having lost all Rainmaker progress.

Related: **the hold clock resets on capture and does not partially carry.** Taking a capital on turn 2 of a 3-turn clock must not leave the captor needing one turn.

---

## 2. Movement modifier suppression must be total

**Correct behaviour:** the convoy moves exactly one hex per turn during Stage 5. Nothing modifies this — not roads, not rail, not the +1 movement retained benefit from Stage 3, not terrain, not any faction or tech effect, not any future modifier nobody has written yet.

**Why it will go wrong:** implemented as "ignore road bonus," which is what the ruling literally said, while leaving every other modifier live. The retained-benefit vehicle is the immediate offender — a player who raced, lost, then stole the convoy would haul it at 2 hexes per turn using the bonus they earned racing for it.

Prefer a hard override to a subtraction of known bonuses. **Default-deny is correct here:** an unrecognised future modifier must not apply.

**Test:** haul the convoy along a road, with the movement retained benefit active, downhill or whatever the local terrain bonus is. One hex per turn in all cases.

---

## 3. The claim lock: convoys only, and it gates engagement, not vulnerability

Three distinct things are easy to conflate:

- **Vulnerability** runs the entire transport, site to capital. There is no safe stretch.
- **Exclusivity** is the 2-turn window in which only the claiming faction may engage.
- **Settlements are exempt entirely.** Any number of factions may converge on a capital simultaneously, including during the Stage 8 siege.

**Why it will go wrong:** implementing the lock as "the convoy is only attackable during claim windows" inverts it — the convoy becomes safe by default and attackable only when someone has claimed it. The lock restricts *who else may join*, never whether the convoy can be attacked at all.

**Claim pass-on:** on expiry or on the claimant's failure, the next faction may claim. Define "failure" explicitly — a claimant who engages and is repulsed, and one who claims and never closes, must both release the claim. A claimant should not be able to hold the lock indefinitely by declining to attack; that converts a fairness mechanism into a griefing tool.

**Test:** three factions in range of a convoy. First engages and loses. Second may then claim. At no point may two engage simultaneously. Then move the convoy into a capital and have three factions attack at once — all three must be able to.

---

## 4. The device is not a unit

It survives the destruction of everything escorting it. If the convoy's escort is wiped out and the attacker does not or cannot take the device, it remains on its hex as an object.

**Why it will go wrong:** modelled as cargo on a unit, so destroying the unit destroys the device and silently ends the quest line for everyone with no announcement and no way to diagnose it.

**Test:** annihilate a convoy escort with an attacker who cannot occupy the hex that turn. The device must still exist and be visible.

---

## 5. Elimination mid-transport [new ruling]

If the holder is eliminated while transporting, **the device remains on its hex as an unowned map object**. The first faction to move a unit onto that hex chooses: **take it**, entering Stage 5 with zero progress per §1, or **destroy it**, ending the line permanently for everyone per §7.

Note this is *first to land on the hex*, not the faction that eliminated the holder. They are frequently the same and must not be assumed to be.

**Why it will go wrong:** auto-assigning the device to the eliminating faction. That is a different rule and produces a different game — it rewards the kill rather than the follow-up, and it can hand the device to a faction on the far side of the map.

**Test:** eliminate a transporting faction with a unit that cannot reach the convoy hex. The device must sit unowned and claimable until someone physically arrives.

---

## 6. Search: two resolutions of one system, and the fairness guarantee

**Player side is deterministic.** The target hex is fixed at spawn. Entering it finds the device, that turn, always. There is no roll on the player side at any point.

**This is a hard guarantee, and it is the rule most likely to be quietly violated.** Any implementation where a player can occupy the target hex and not find the device is wrong, regardless of cause — fog state, a unit type that "cannot search," an ongoing action, a search-progress threshold not yet met, or the narrowing not having reached that region. If the unit enters the hex, it is found.

**Narrowing shrinks the revealed candidate area toward the fixed hex.** It never relocates the hex, never rules out a hex the player has visited, and must never produce a message amounting to "not here" about a hex under the player's unit.

**AI side is a background counter** accruing per turn at a rate below the player's effective rate, weighted by temperament. No pathing.

**Ceiling: 6 turns of searching from Stage 3 opening**, at which point the highest accumulated progress finds it automatically. This applies to the player too — a player who has searched most must be able to win the ceiling.

**Spawn constraint: minimum 4 hexes from every capital**, not just the nearest one. If the map cannot satisfy this, that is a map generation failure to surface loudly, not a constraint to silently relax.

**Test:** walk a unit onto the target hex on the first turn of Stage 3, before any narrowing has occurred. It must be found.

---

## 7. Destruction is global and permanent

Destroying the device ends the line for **every faction**, permanently. No re-spawn, no second device, no continued AI background progress. Every faction's quest line terminates and every faction is notified.

**Why it will go wrong:** implemented as removing the object, leaving AI background progress counters running toward a device that no longer exists — producing either a silent stall or an AI completing a quest line with nothing at the end of it.

The destroyer takes no additional penalty beyond the cost. **Open:** whether they should. Currently no.

---

## 8. Stage 8 fires three things as one atomic event

Activation simultaneously begins production, starts the three-turn clock, and triggers the siege. If these can desynchronise — production starting a turn before the clock, or the siege arriving late — the balance breaks in the holder's favour, because the entire anti-runaway design rests on the device paying nothing until the moment it is contested.

**The device produces nothing before activation.** Not reduced output, not partial irrigation, nothing. This is the single most important balance rule in the design and the most tempting to soften during playtesting when Stages 4–7 feel unrewarding. They are supposed to feel unrewarding.

**Warning timing:** the holder must receive at least one full turn of warning before attacking units arrive, and rival commitment must be visible as intent to everyone, including to the other attackers. Symmetrical on purpose.

---

## 9. The backup specialist must stay genuinely hidden

Not merely absent from the UI — absent from anything a player can observe or infer. No entry in a roster, no reserved slot, no diplomatic option referencing them, no cost preview, no achievement or log line hinting a second exists. The reveal only fires when the primary is **permanently** unavailable.

Define "permanently" carefully. A primary who has been poached by a rival is unavailable to you but may become available again; that must not trigger the reveal. Only a genuinely terminal state does.

The backup must be **worse** — harder to reach, more expensive, or slower. If the two are equivalent, removing the primary costs a rival real resources for no effect.

---

## 10. Re-entry, dormancy, and the AI-can-win requirement

**Declining Stage 0 is never permanent.** A faction may enter the line at any later point, from Stage 0, having lost only the elapsed turns. There is no lockout flag.

**The myth never expires.** AI background progress continues whether or not any human engages. An ignored line must still reach Stage 4 and force the public announcement.

**An AI can win the game this way**, which means the pursue disposition must be able to complete *every* stage — including building a lab, hauling at one hex per turn, and securing the specialist. Stages 6 and 7 cannot be abstracted into a percentage the way Stage 3 can, because they have hard prerequisites and a contestable actor. An AI that abstracts past the lab requirement is not playing the same game as the player.

---

## 11. Two-path integrity

Every beat must retain at least two solution paths drawing on different currencies. Factions are mechanically identical, so this is the only thing preventing a specific *build* from being locked out.

The risk is not in initial implementation, it is in tuning. If one path is quietly priced out of viability, the beat silently becomes single-path and a build that cannot afford that path can no longer pursue victory at all. Worth an explicit check per stage rather than trusting it to survive balance passes.

---

## 12. Suggested implementation order

1. Contested quest mode and per-player progress on a shared object. Everything else blocks on this.
2. The device as a first-class map object — existence, ownership, transfer, unowned state. Sprite arriving separately.
3. Stage 5 transport with total modifier suppression.
4. The claim lock.
5. Search, both resolutions, with the ceiling.
6. Stages 6–8, prerequisites, clock, siege.
7. AI dispositions.

Stages 1–4 can be authored as ordinary content once contested mode exists; they are close to existing quest structure. Stages 5–8 are where the genuinely new systems are, and where this document's failure modes concentrate.
