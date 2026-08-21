# Research and tech — baseline before the encounter batch

*Measured 2026-08-21, immediately before a batch of authored encounters and
quests is wired in. Recorded because that batch will move these exact numbers,
and the question it raises — should research be something you invest in at all —
is deferred until after. This is the "before".*

## How it was measured

12 AI-only games (medium / large / huge, seeds `40000 + i·173`), run to round 40,
48 faction-seats. Script pattern: drive `takeAITurn` on the real engine, then
read `player.permanentResearch`, chip-derived research, `player.techLevel`, and
every `build_completed` in the log.

## What it found

**The tech ladder is already maxed out for free.**

| | |
|---|---|
| Research needed for max tech level | **8** (`CONFIG.tech.researchThresholds` = 2/4/6/8) |
| Permanent research per faction by round 40, from encounters | **median 11, max 19** |
| Research from buildings | **median 0, max 1** |
| Seats with *any* chip-derived research at all | **8 of 48** |
| Seats ending at max tech level (L5) | **33 of 48** |

Encounters alone carry every faction 1.4–2.4× past the top of the ladder. A
Lab's +1 research is a rounding error against that, which is why across those 12
games the AI built **1099 Recyclers and 15 Labs** — and why it was right to.

**Location chips actually completed, 12 games:**

| count | chip | tech | cost | what the AI's scorer sees |
|---|---|---|---|---|
| 1099 | Recyclers | L1 | 3 | output 1 |
| 108 | Training Grounds | L1 | 4 | unit-cap special case |
| 24 | Factory | L2 | 6 | output 2 |
| 15 | Labs | L1 | 3 | research 1 |
| 5 | Rainmaker Workshop | L1 | 8 | research 1 |

## Two AI bugs underneath, neither of which is the cause

Both are real and both are cheap to fix. Neither was fixed, because fixing the
first in isolation makes the game worse — the AI would build *more* worthless
Labs.

**1. The build tie-break is decided by source-file line order.** `pickBuild`
(`src/game/ai.js`) weights output and research identically (×3), so Recyclers
(+1 output) and Labs (+1 research) both score exactly 3. `Array.sort` is stable,
and `recyclers` sits at index 8 in `CHIPS` while `labs` sits at 11 — so Labs lose
**every** tie, on declaration order. Invisible, arbitrary, and it would silently
change if anyone reordered `content.js`.

**2. The scorer is blind to most of the catalogue.** It reads four fields —
`output`, `research`, `garrison`, `strength` — plus one special case for
`unitCapBonus`. Everything whose effect lives anywhere else scores **0**: Works,
Watchtower, Beacon, Broadcast, Civic Hall, Recon Team, Infirmary, Motor Pool,
Waystation, Guest House, Burning Glass, Logistics Hub. The AI's build brain is
effectively "Recyclers, or Recyclers".

## Not a bug

One city completed Recyclers 14 times in 40 rounds, which looks like churn. It
is not: that city changed hands **11 times**, and each capture destroys a chip.

## The consequence for the Rainmaker

Stage 1's retained benefit is "the lab and its ordinary function, permanently",
which the design sizes as part of a package worth 80–85% of ordinary
development (`rainmaker-questline-design.md` §3). In practice that item is worth
approximately **zero**, because research is free. The beat still works as a gate
— you must build a lab to advance — but it is not paying what the design thinks
it is.

## The question, for later

Three ways this can go, once the encounter batch is in and these numbers have
been re-measured:

1. **Make research scarce.** Cut permanent encounter research, or raise the
   thresholds so 8 is not reachable without buildings. Labs become real, Stage
   1's retained benefit becomes real, and fixing the tie-break starts to matter.
2. **Accept that research is free** and stop pretending otherwise: retire Labs
   as a build, let the ladder be encounter-driven, give Stage 1 a different
   retained benefit.
3. **Leave the economy alone**, fix only the two AI bugs, and let Labs stay a
   niche pick.

Re-run the measurement above after the encounters land before choosing — the
encounter batch is precisely what sets the `permanentResearch` median, so option
1 may already be half-done or considerably further out of reach.
