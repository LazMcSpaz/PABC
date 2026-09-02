# Victory — one condition, three faces

Written 2026-08-21, replacing the VP threshold, the weighted Recognition
victory and the last-standing rule with a single condition.

## What was there, and why it had to go

Three win conditions existed in code: a **VP threshold** (12), a weighted
**Recognition** score (allied 1, vassal 2, reach 6), and **elimination**.

Across 20 AI-only games, **the VP threshold ended all twenty**. Recognition
never fired. Elimination never fired.

And the VP threshold was not a conquest condition, whatever its label said:

- The average winner held **29% of the board**.
- **57%** of the winning total was not territorial at all.
- Of that, **77% was the alliance trickle** — +1 VP per allied major, every
  round, forever, once pacted with a majority. Uncapped, permanent,
  unlosable.
- Seed 1, verified in isolation: **Versari won at round 17 holding zero
  Locations.** Twelve points, all banked, ten of them from five trickle
  payments. It won the "conquest" victory having conquered nothing.

The threshold also could not be tuned. A fixed 12 was 150% of a small board's
total and 38% of a huge one's; three reachable size/density combinations —
including **small at its default density** — could not be won by holding
literally every city on the map.

Worse, the VP check was implemented **three times with three different
rulesets**: `victory.js` honoured the setup toggle and filtered to majors,
while the copies in `contest.js` and `effects.js` honoured neither. A game
configured with conquest victory OFF still ended the moment the threshold was
crossed during a contest.

## The condition

**You win when every surviving faction is your ally, your vassal, or gone —
and you hold that for three consecutive rounds.**

One condition with three faces, and the mix is the interesting one:

| every rival… | reads as |
|---|---|
| eliminated | conquest |
| your ally or vassal | diplomacy |
| some of each | the hybrid no previous version could express |

Across 15 AI-only games the endings came out **mixed 7, submission 6,
diplomacy 1** — the hybrid is now the most common way a game ends.

### The hold

Three rounds, and it exists to make a bloodless win a position you *defend*
rather than a switch you flip. Complete the set and a clock starts; every
rival can see it and has that long to denounce you, break a partner away, or
simply attack. Losing anyone stops the clock, and retaking them **restarts it
from the top** rather than resuming.

The hold does not apply when nobody is left to break it. Kill everyone and
you have won — there is nothing to hold against.

### One lord per vassal

`state.diplomacy.vassals` is keyed by vassal, so the record could only ever
name one lord — but everything hanging off it was additive. A lord who took
another's vassal left the old lord's tribute flow and vassal pact in place,
and the vassal paid both. `vassalize` now releases the old bond first, which
is also what stops two factions counting the same vassal toward victory.

### Minors count

A seeded minor holds a Location and a unit like anyone else, so it is a
faction you have to deal with — and it can win. That is deliberate.

## VP is a score now

Nothing reads it as a win condition. It is the closing standing — "how did I
do" — and it is entirely **held**:

- **Territory** as before: full value while Loyalty is over half, half below,
  and it leaves you when the city does.
- **Diplomacy**, replacing the trickle: an ally is worth
  `CONFIG.victory.score.allied`, a vassal `…vassal`, once, and only while the
  relationship stands. An alliance you lose is a score you lose.

The recognition "summit dividend" (1 VP the first time each faction ever
backed you, banked permanently) went with the trickle for the same reason.

## What this deletes

- `CONFIG.vpThreshold` as a win condition (kept only as a label).
- `CONFIG.victory.allianceTrickle`.
- `CONFIG.diplomacy.recognition.summitVp` and the weighted threshold.
- The `conquest` / `recognition` / `elimination` setup toggles, collapsed into
  one `dominion` switch. Any of the old names still turns it off, so a saved
  setup keeps working.
- Two of the three VP win checks, and with them the toggle bug and the
  minors-can-win inconsistency between them.

## Still open

**The third road.** Conquest and diplomacy are two ways to resolve a faction;
a narrative road would be a third. The quest engine is already built and
`QUESTS` is empty — `mode: "global"` delivers beats to every faction, the
claimant locks in when the final beat completes (a race), and
`completion.rewardForClaimant` can award `VASSALIZE` or `FORM_PACT`, which
feeds the same condition rather than needing one of its own. What is missing
is a picker that starts one global quest per game, seeded off the game RNG,
and the content.

**One AI game in 15 does not resolve** (seed 1234). Games are longer than the
VP clock made them — median 29 rounds against 17 — which is the intended
trade, but the tail wants watching.
