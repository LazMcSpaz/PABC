# Findings: the opponent, measured

**Supersedes `docs/ai-robustness-brief-2026-08-27.md`** for anything about the
endgame, the win condition, or what the AI is failing to do. That brief's
instruments, method rules and traps still stand and are still the place to
start; four of its findings do not, and the corrections are marked below.

Answering `docs/ai-robustness-brief-2026-08-27.md`. Everything here was
measured on this branch; the baseline it is measured against is `main` at
`b33d1ee`, reproduced exactly on the build this work started from:

```
ending mix (submission + mixed)   21 of 45   band >= 11   PASS
median rounds to Dominion         45         baseline ±4  PASS
games unresolved                  16         band 0       FAIL
```

**Current state of the branch**, at n=45 (and n=90 in brackets):

```
ending mix (submission + mixed)   12 of 45 = 0.27  [0.32]   band >= 0.24   PASS
median rounds to Dominion         45              [45]      baseline ±4    PASS
games unresolved                  6 of 45         [13/90]   band 0         FAIL, from 16
```

**`unresolved` has gone 16 → 6 of 45, and 33 → 13 of 90.** Two things ship live
to get there, and they had to land in that order:

1. **The landless clock** (`victory.landlessGraceRounds: 8`) — a rules decision
   taken by the repo's owner. Third pass below.
2. **`ai.dominionWeight: 1`** — the win condition in `courtshipScore`, which
   measured *worse* on the old board and is the best thing measured on the new
   one. Fourth pass below.

Everything else ships behind a switch at its no-op, and with both of the above
switched off the build still reproduces `b33d1ee` seed-for-seed on all 45 seeds.

The brief said measuring worse was the expected outcome for some of this work.
It was the outcome for nine of the ten levers built — and the tenth only paid
once the rules underneath it changed, which is the single most useful thing in
this document.

---

## What shipped live

Only one thing changes behaviour, and it changes no game: the political pass is
now readable.

`manageDiplomacy` was eleven `if`s ending in `return`, in a fixed order that
nothing enforced, documented, or reported. It is now an ordered list of named
branches (`DIPLOMACY_CHAIN` in `ai.js`), each branch carrying the measurement
comment that put it where it is. Whichever branch spends the act emits
`ai_political_act` with its name, `sim-suite` reports the per-branch histogram,
and `harness.js` gained twelve checks: one per load-bearing adjacent pair, each
naming the reading that pinned it, plus a mechanism check that the pass really
does spend its act on the highest live branch.

Two corrections fell straight out of the instrument.

**`actsPerAITurn: 0.45` was never the act rate.** The suite counted a union of
verb events that leaves out opening a courtship — which emits `posture_changed`
and nothing else, is the most common political act in the game by a factor of
three, and is the only one that climbs the ladder Dominion is made of. The real
rate is **0.61**. The old row is kept, relabelled, next to the new one.

**`factionsWithEmptyWheelAtR15: 1.91` is not a tech bug.** The brief calls it "a
straightforward bug hunt in `maybeAssignTech`". Probing wheel state directly at
round 15: every faction with an empty wheel also held **zero Locations** and sat
at Tech Level 1 with 0–1 Research. There is nothing to allocate — no ground, no
production, no Research, no Ability Point, and by `baseActions: 0` no actions
either. The row measures how often a faction is driven off the board before
round 15. It belongs next to finding 5, not in the economy hunt. `sim-suite`
now splits it: the half that could possibly be an allocator bug measures **0**.

---

## The headline defect: what the sixteen unresolved games actually are

The brief's guess is that nobody is trying to win — they behave in character
until the round limit. Walking all eight unresolved seeds to round 81 and
reading the board says something quite different.

Those games are not milling about. **They have been fought almost to a finish.**
Every one is down to 2–4 survivors, and thirteen of twenty surviving
faction-games have exactly **one** faction outstanding. They are one handshake
from Dominion and cannot take it.

Of the 28 blocked outstanding pairs at the round limit:

| wall | pairs | what it looks like |
|---|---|---|
| Standing below the pact bar | 18 | typically **-3 against a bar of 6** |
| at war | 4 | a stalemate neither side can finish |
| reputation gates | 4 | one pair at Menace 11 vs tolerance 9.6 **and** Honor -9.5 vs a trust floor of 3.1 |
| unreachable (§15) | 2 | |

The Standing cases are a **dead position with no legal move**. The two survivors
are not at war. They need each other's Standing at 6 and sit at -3.
`mayBeginCourtship` has a Neutral floor and they are below it. The pact branch
has the bar itself. And the gift — the only verb in the game that raises
Standing on demand — is dark board-wide via `giftAboveShareOfCap`. Every door
out of the position is shut.

That is the defect. It is not a motivation problem, it is a **reachability**
problem in the endgame.

### A mechanism finding that outlives all of this

`driftStanding` pulls every unpacted, un-warring, un-courted pair back toward
its baseline every round by `max(1, …)` — **always at least a full point**. And
`performDiplomacy("gift")` only warms the *baseline* when the gift lands two or
more (`gift.baselineWarmth`).

So **a one-point gift is a treadmill.** It is exactly cancelled by drift and
cannot move the thing drift is pulling toward. `branchGift` gifts one point.

This is worth re-reading the note on `giftAboveShareOfCap` against. That note
says "Sway spent on warmth is Sway not spent on the ladder, and the ladder is
what ends games." That is true, and it is not the only thing that was wrong
with the branch: as written, the gift also **buys nothing permanent**. Every
measurement that condemned the gift was taken on a gift that could not work.
Re-measuring it at two points is the obvious next experiment, and it is not one
I ran — I found this while building the close-out and spent the remaining
budget on the endgame instead.

---

## The three levers, and why all three are dark

### `ai.dominionWeight` — the win-condition term in `courtshipScore` (finding 2)

| weight | mix | median | unresolved |
|---|---|---|---|
| **0 (shipped)** | **21** | **45** | **16** |
| 0.5 | 17 | 42 | 18 |
| 1 | 16 | 46 | 19 |

The brief calls this "the single highest-value change in this brief". It is
correct about the code — `courtshipScore` really did read sociability × warmth
and nothing else, and a partner you are *already allied to* scored higher than
an outstanding rival, because being allied is what makes a pair warm — and
wrong about the consequence, because it aims one stage too late.

`courtshipScore` only **ranks** candidates that already passed
`mayBeginCourtship`, which has a Neutral Standing floor. At the point the win
condition matters, the factions standing between you and Dominion are *below*
that floor and are therefore not in the pool being ranked at all. Re-ranking the
pool just moves the AI off the partner it could have converted onto one it
cannot: `courtshipsOpenedPerGame` barely moves (61.6 → 62.1),
`minorsAlliedOrVassalisedAtEnd` barely moves (1.60 → 1.67), and `warsPerGame`
rises 45.5 → 48.4.

**The bottleneck is conversion, not selection.** That is the finding.

### `ai.closeOutWithin` — play for the win when you are one faction away

A new branch. When few enough factions are outstanding, form the pact with the
last one if it is available, and otherwise buy the distance with a **two**-point
gift (one point is the treadmill above). Not gated on `victoryLean` or
`sociability`, because wanting to win is not a character trait.

| within | mix | median | unresolved | fires |
|---|---|---|---|---|
| **0 (shipped)** | **21** | **45** | **16** | 0 |
| 1 | 17 | 44 | 18 | 525 |
| 2 | 19 | 51 | 18 | 864 |
| 5 | 16 | 49 | 17 | 1909 |

**It demonstrably works and still does not pay.** With it on, two of the eight
unresolved seeds resolve, and the endgame Standing gaps visibly close — seed
31337's last pair goes from -2 and -4 against a bar of 6 to **+3 and +2**. It
does exactly the thing it was built to do.

It does not pay because Standing is one wall of four, and it can only take that
one down. Pull it down and the pairs walk into war, the reputation gates, or
§15 distance.

### `ai.pactCall` — AI factions call their own allies to arms (finding 3)

| setting | mix | median | unresolved | calls |
|---|---|---|---|---|
| **0 (shipped)** | **21** | **45** | **16** | 0 |
| 1 | 17 | 46 | 16 | 217 |

The calls land — all 217 of them, because the branch consults
`evaluatePactCall` first and only calls where the answer is yes, so it cannot
bleed Standing on refusals. They buy nothing: `unresolved` does not move and the
ending mix costs four. The mechanism is not mysterious. A pact call is a machine
for **starting wars**, wars are what block Dominion, and the board is already at
45 declarations a game. `warsPerGame` goes 45.5 → 50.5.

**A correction to the brief here, and it is the half that matters.** The brief's
first row says an alliance with the AI is one-way — "the human can call them to
arms; they never call the human". That is not so, and has not been for some
time. `queueHumanPactCalls` runs inside `runDiplomacyRound` every round, drops a
call in the player's inbox for every AI ally at war, and the player answers it
with `respond-pact-call` from `DiplomacyDrawer.jsx`. The path is live end to
end. What has never happened is **AI→AI**, which is what this branch adds and
what the brief's own second sentence says. So the asymmetry a player would feel
is not there; the one that is there is between two AIs, where it makes the
alliance graph decorative but costs the player nothing directly.

---

## Re-measuring `attackPrice` (finding 4)

The brief asks for this and is right that the board it was condemned on no
longer exists. There is now also a *mechanism* argument the old readings did not
have: Honor is not only a defensive stat, `passesRepGates` **hard-gates the
alliance door** on it, and the endgame walk turns up survivors at Honor -9.5
against a trust floor of 3.1. An AI that surprise-attacks its way to -9.5 Honor
has disqualified itself from the win condition.

| `attackPrice.enabled` | mix | median | unresolved | undeclared |
|---|---|---|---|---|
| **0 (shipped)** | **21** | **45** | **16** | **22.04** |
| 0.6 | 16 | 48.5 | 17 | 20.80 |

It bites slightly harder than it used to (22.04 → 20.80, 5.6%) and the verdict
is unchanged: one unresolved game and five of the ending mix. The rep-gate
argument is real but small — only 4 of 28 blocked endgame pairs fail on
reputation, so fixing it perfectly could not have paid for the ending mix.
**Stays off.**

---

## Finding 1, demonstrated the hard way

The brief says the one-act chain has starved its own lower branches twice in two
months. It happened a third time, in the branch I added to fix the headline
defect, and this is the most useful thing in this document.

The close-out was first placed at the **top** of the chain, on the argument that
nothing is worth more than the act that wins the game. Sweeping how early it may
start:

| within | mix | median | unresolved |
|---|---|---|---|
| 1 | 20 | 48.5 | 17 |
| 3 | **12** | 43.5 | **23** |
| 5 | 14 | 52 | 22 |

Monotone in the wrong direction, and the new branch histogram named the cause in
one line: at `within: 3`, `amends` collapses 2009 → 1498, `vassalize` 909 → 746,
`warTalk` 98 → 72. **Vassalage is the other door to Dominion and `warTalk` is
the branch that ends wars** — a branch added to close games out was shutting
both of the roads that close games.

Moving it below every reply (its final position) removed the collapse entirely:
`amends` back to 2150, `vassalize` to 939, `warTalk` to 107, and the worst
reading goes 23 → 17.

The first two instances of this hazard were found weeks later by measuring an
unrelated number and noticing it had moved. **This one was found inside a single
run, from one line of output.** That is what the histogram is for, and it is the
argument for having done finding 1 first.

### On the two ways forward the brief offers

I took the smaller one — keep the chain, name every branch, emit which fired,
and assert the ordering — rather than the scored candidate list the brief leans
toward. Two reasons. The instrumentation is what makes the scored refactor
*safe* to attempt and had to come first regardless; and every one of the three
findings below it adds a branch, so the chain had to be able to survive
additions before anything was added to it. The measurement comments are all
still attached to their branches and would move onto scorers cleanly. The
scored version is now a smaller job than it was.

One caution for whoever does it. The generic "the act goes to the highest live
branch" check is **a tautology about priority**: it reads
`DIPLOMACY_BRANCH_ORDER` to test a chain built from `DIPLOMACY_BRANCH_ORDER`, so
moving a branch moves both and it still passes. It earns its place by proving
the chain runs in its declared order and that the name it emits is the branch
that acted — nothing more. The falsifiable part is `PRIORITY_RULES`, which names
each load-bearing pair explicitly with the reading behind it. Keep that list
when the chain becomes a score; it is the part that fails when somebody is
wrong.

---

## Loose ends after the first pass

**Finding 5 — neither kind of player can hold ground.** Investigated in the
second pass below, and it turned out to be the most productive thread here. The
first signal was that it is the same finding as `factionsWithEmptyWheelAtR15`,
and that two thirds of all courtships end with one of the pair **dead** — so
whatever is happening to ground is upstream of most of the political layer's
failure to compound.

**Finding 6 — the Sway sink.** Not solved. `swayRoundsAtCapShare` is still 0.29
at the shipped settings. The close-out drains it well (0.29 → 0.16 at
`within: 5`) but does not pay for itself, so the pool is still a currency
nothing can exhaust.

**Where courtships go**, though, is now answered — the brief says finding out is
cheap and probably informative, and it is both. Across ten games, 102 *distinct*
pairs are courted (the 61.56 per game is the same ~10 pairs re-opened about six
times each, which is where the Sway goes):

| fate of a courted pair | share |
|---|---|
| one of them is **dead** | **66.7%** |
| became a vassalage | 15.7% |
| became a pact | 5.9% |
| cooled off, both alive | 9.8% |
| still running at the end | 2.0% |
| became a war | 0.0% |

And one hypothesis killed: courtship is **not** starving the pact branch. Of 232
turns on which the courtship branch spent the act, a pact was simultaneously
available on **2** (0.9%). The pact branch fires rarely because it is rarely
eligible, not because something above it is eating its turn.

**The remaining seven verbs.** `mediate`, `demand-tribute`, `trading-pact`,
`declare-position`, `free-vassal` and the three grant toggles still have no AI
caller. On the evidence of the two I did wire up, I would want a mechanism
argument for each one before spending a suite run on it — "the verb exists and
the AI does not use it" turned out not to predict anything about the governing
numbers in either case I tested.

---

## Second pass: the three next steps, taken

The list above ("where I would go next") was worked through. All three produced
results; none produced a lever worth turning on, and the third produced the
best finding in this document.

### 1. The gift at two points — hypothesis disproved

| share / size | mix | median | unresolved |
|---|---|---|---|
| **1.0 / 1 (shipped)** | **21** | **45** | **16** |
| 0.8 / 1 | 18 | 44 | 20 |
| 0.6 / 1 | 16 | 44 | 18 |
| 0.8 / 2 | 21 | 45 | 16 · *branch never affords to fire* |
| 0.6 / 2 | 16 | 43.5 | 21 |

The mechanism claim stands — at one point the gift is exactly cancelled by
drift, never reaches the two points `gift.baselineWarmth` needs, and so buys
nothing permanent at any price. **The inference I drew from it was wrong.** A
two-point gift costs twice the Sway: at share 0.8 the branch can never afford
to fire at all, and at 0.6 it fires 484 times and lands three unresolved games
*worse* than the one-point version at the same share. Separating these matters,
because the true mechanism statement will otherwise get quoted as if it
predicted an improvement it does not.

### 2. Stalemate wars — a real bug, and fixing it measures worse

`warTalk`'s AI-to-AI path meant to skip the *winning* side's terms and tested
for it on the wrong side of the deal: `terms.give.some(location)` where the
winning branch puts its location in `get`. The accidental second condition that
imposes is that the **losing** side must be squatting on one of the winner's
cities before it can sue for peace at all.

On the stalemate seeds that condition is what keeps the war alive. Seed 4711 at
round 81: war exhaustion **73.5 and 108.5** against a losing gate of 4.8,
Standing -10 both ways, `warPeaceTerms` returning valid terms for both sides,
and `wouldAccept` returning **true** for both. A peace both parties would sign,
refused because neither occupies the other.

| `settleWithoutCession` | mix | median | unresolved | `warTalk` fires | wars/game |
|---|---|---|---|---|---|
| **0 (shipped)** | **21** | **45** | **16** | 98 | 45.5 |
| 1 | 13 | 50.5 | 17 | **362** | **55.4** |

The fix does exactly what it should — peace happens 3.7× as often — and the
board gets worse. Cheap peace makes war cheap: wars per game *rise* by ten, and
a faction that can always buy its way out is never cornered, which is what was
producing the submission endings the mix counts. **The inability to make peace
without a cession was load-bearing.** The bug is documented and switchable; what
it really measures is that the war rate is held down by friction rather than by
anybody deciding anything, which is finding 4 seen from the other side.

### 3. Finding 5 — the investigation, and what it found

The map has **eight Locations and eight factions**. Everyone starts with
exactly one. There is no spare ground; the opening is a zero-sum scramble.

`sweepEliminations` retires a faction only when it holds **no Locations *and* no
units**. And `baseActions: 0` means actions come from ground. So a faction
reduced to a few wandering units is:

- **alive**, indefinitely;
- **frozen** — no actions, no production, no Research, no Sway income, so it
  cannot fight, court, gift, or bring anything to a deal;
- **counted** — `dominionStanding` counts every survivor as outstanding.

And it is **invisible to the AI's targeting**. `knownGoalHexes` walks
`state.locations` and nothing else; `tryOneAction`'s raid branch only fires on an
enemy already standing on one of your own hexes. The AI navigates entirely by
Locations, so a faction that holds none can only be engaged by somebody who
happens to walk into it on the way to a town.

**Eight of the twenty-eight blocked outstanding factions at the round limit hold
zero Locations.** Seed 8123 is the pure case: plainers holds **seven of the
map's eight Locations**, croppers holds **none and five units**, and the game
cannot end. The board state by round shows it plainly — one game reaches `7/0`
at round 60 and is still unresolved at 80.

This is the deepest version of the headline defect, and note that no amount of
diplomacy can fix it: a landless faction has no Sway to reciprocate a gift with
and no actions to court with, so it cannot be brought over *even in principle*.

`ai.huntLandlessBlocker` makes those units move goals, gated on `wouldFight` and
on visibility (fog still applies — a unit you cannot see is not a goal).

| n | switch | mix | median | unresolved | wars/game |
|---|---|---|---|---|---|
| 45 | **0 (shipped)** | **21** | **45** | **16** | 45.49 |
| 45 | 1 | 16 | 48 | **12** | 45.40 |
| 90 | **0 (shipped)** | **36** | **43** | **33** | 51.26 |
| 90 | 1 | 25 | 46.5 | **28** | 49.72 |

**This is the only switch anywhere in this work that moves the headline
defect** — and it does not buy it with belligerence: wars per game go *down*.
All three bands hold at both sample sizes.

It still ships dark, for two reasons.

The house rule: the ending mix is a governing number and it gets worse, 36 → 25
of 90. That is the same standard that keeps `attackPrice` off.

And a design question that is not the AI author's to answer. The branch's
answer to a frozen faction is to **kill it**: `minorsKilledPerGame` rises
3.33 → 3.64 and `minorsAlliedOrVassalisedAtEnd` falls 1.59 → 1.48. §15 exists
precisely because "the only remaining answer was genocide" was judged the wrong
answer once already. Whether hunting a landless faction down is a legitimate
ending or the same mistake in a new place is a call about the game, not about
the opponent.

One methodological note, because it is the third time this project has been
caught by it: the effect **shrank with the sample**. 16 → 12 at n=45 reads as a
9-point drop; 33 → 28 at n=90 reads as 5.6. The smaller sample was doing some
of the arguing.

---

## The scoreboard

Everything measured, against a baseline of 21 mix / 45 median / 16 unresolved
at n=45. All eight switches ship at their no-op.

| switch | best setting measured | mix | median | unresolved |
|---|---|---|---|---|
| `ai.huntLandlessBlocker` | 1 | 16 | 48 | **12** |
| `ai.closeOutWithin` | 5 | 16 | 49 | 17 |
| `ai.pactCall` | 1 | 17 | 46 | 16 |
| `ai.settleWithoutCession` | 1 | 13 | 50.5 | 17 |
| `ai.dominionWeight` | 0.5 | 17 | 42 | 18 |
| `ai.giftStanding` (at share 0.6) | 2 | 16 | 43.5 | 21 |
| `attackPrice.enabled` | 0.6 | 16 | 48.5 | 17 |

Seven levers, one of which improves the number the brief calls the headline
defect, and it costs a third of the ending mix to do it. That is the honest
shape of the result: **the endgame is not stuck for one reason, and no single
lever reaches more than one of the four walls.** Of 28 blocked pairs at the
round limit — 18 blocked on Standing, 8 of them held by a faction with no
ground at all, 4 at war, 4 on reputation, 2 on §15 distance.

---

## Third pass: the board, and the landless clock

Two things were asked for after the second pass: implement a collapse rule for
landless factions, and test whether the board is too small for the roster.

### The board is not too small. It is too big.

I recommended this experiment on the theory that every wall in the endgame was
a scarcity artifact of eight Locations shared between eight factions. **The
measurement refutes it, and does so decisively.** The AI is untouched between
these two columns; only the map differs.

| n=45, clock off | medium (8 Locations) | large (14 Locations) |
|---|---|---|
| ending mix | **21** | 10 · *below the band* |
| median rounds | **45** | 60.5 |
| games unresolved | **16** | **31** |
| wars per game | **45.5** | **68.2** |
| minors allied or sworn at end | 1.60 | **2.22** |
| minors killed per game | 3.20 | **3.11** |

More room does not calm the board. It makes the game a third longer, half again
as bloody, and **twice as unresolvable**.

The reachability half of my hypothesis was right — with room, minors really do
get brought in more (1.60 → 2.22) and killed less (3.20 → 3.11), which is
exactly what §15 wants. It just does not help, and the reason is the shape of
the win condition rather than the shape of the map. **Dominion requires dealing
with *every* surviving faction.** Room makes survivors cheap to be and
expensive to deal with, so every extra Location that keeps somebody alive is
another signature the winner has to collect. Scarcity was not causing the
unresolved games; it was the only thing ending them.

Worth stating as a caveat and a correction: a different Location budget is a
different `rng.shuffle` deck and therefore a different game per seed, so this is
two populations rather than one flag on one build. The gap is far too large to
be that, but it is not the clean comparison the rest of this document uses.
`sim-suite` now takes `--map` so the question can be re-asked cheaply.

### The landless clock

A faction whose last Location falls has **8 rounds** to take one back; on expiry
its surviving units are destroyed and the ordinary elimination sweep retires it.
The clock starts when the ground goes, **clears the moment any is retaken**, and
is announced both ways (`landless_clock_started` / `_cleared`) so the board can
see it running. `victory.landlessGraceRounds: 0` restores the old behaviour
exactly.

| grace | mix | median | unresolved | wars/game | minors killed |
|---|---|---|---|---|---|
| **0** (old) | 21 | 45 | 16 | 45.49 | 3.20 |
| 3 | 13 | 36.5 · *below band* | 9 | 35.02 | 3.71 |
| 5 | 10 · *below band* | 37 | 8 | 36.13 | 3.71 |
| **8 (shipped)** | **12** | **42** | **8** | **37.89** | 3.67 |
| 12 | 16 | 44 | 12 | 41.38 | 3.49 |
| 16 | 19 | 45 | 12 | 42.76 | 3.42 |

A clean monotone trade: the shorter the rope, the fewer games run out the clock
and the fewer end in submission. **8 is the only setting that clears both bands
at the best available `unresolved`** — 5 ties it on games but drops the mix to
10 against a band of 11, and 3 pulls the median to 36.5 against a band of 41–49.

Confirmed at n=90, because the last two things measured here shrank when the
sample grew:

| n=90 | clock off | clock on (8) |
|---|---|---|
| ending mix | 36 | 30 |
| median rounds | 43 | 41.5 |
| **games unresolved** | **33** | **22** |
| wars per game | 51.26 | 43.74 |

It holds. Unresolved games fall by a third, and the ending mix costs *less* than
the n=45 reading suggested (40% → 33% of games, against 47% → 27% at n=45).

**Two second-order effects, both good and neither aimed at.** The war rate falls
51.3 → 43.7, because a faction that can be finished stops being a permanent open
front. And the scripted pacifist — the instrument that exists precisely because
the suite cannot see a player who does not play like the AI — **holds more
ground, not less**: mean Locations held **0.5 → 1.2**, wars declared on it
11.6 → 8.4, all four claims still passing. A rule that reads like it punishes
the weak measures the opposite way, because what it removes is the permanently
unfinishable opponent. That is also the first movement anyone has got on
finding 5's headline number.

**The cost, stated plainly.** The unresolved games become *conquests* (4 → 15 at
n=45). Minors are killed slightly more (3.20 → 3.67) and brought in slightly
less (1.60 → 1.33). This is the §15 tension — "the only remaining answer was
genocide" — priced rather than avoided. Raising the grace to 12 or 16 buys the
mix back at four games.

Note also that this makes `ai.huntLandlessBlocker` largely redundant: the rule
removes the blocker the switch existed to chase. It stays dark and stays
documented.

---

## Fourth pass: fixing the yardstick, and one verdict that flipped

### The instrument was broken in two places

**`docs/sim-baseline.json` was stale.** It was taken 2026-08-23 at **n=15**,
reading 5 / 62 / 6, and predates `b33d1ee` entirely — while
`docs/scoreboard-2026-08-23.md` told people to run `--baseline
docs/sim-baseline.json` to get "the delta". That delta was meaningless.
Regenerated on the shipped build at n=45, and `sim-suite` now refuses to
pretend: it prints a loud warning when the baseline's sample size and the
current run's disagree, because half the rows are counts per suite and
comparing across sizes reports the sample size as if it were a result.

**The ending-mix band was a count, not a rate.** `sim-suite` hardcoded
`band: ">= 11"` and compared it against however many seeds happened to be
running. One name, three tests: 11 of 15 is 73% of games, 11 of 45 is 24%, 11
of 90 is 12%. The band was authored at n=45, so 24% is what it always meant.

Two consequences, and the second is a correction to this document's own earlier
reporting:

- The committed n=15 baseline read 5 against a band of 11 — **it failed its own
  band**, and nobody noticed because nothing read it. At 33% it passes.
- **Anything reported here as "passing the mix band" at n=90 was not really
  being tested.** The third pass above said the clock's mix cost "still passes
  the band at 30 of 90". At n=90 that band was nearly free. The honest statement
  is the share: the clock moves the mix from 0.40 to 0.33 of games, and the
  0.24 band is a real test of that.

The band is now graded on the share, with the count still printed because every
note in `config.js` quotes counts.

### One verdict flipped, and it is the brief's own headline proposal

Every dark switch was condemned against 21 / 45 / 16, on a board where landless
factions were immortal and wars ran at 45 a game. That board is gone. Re-run
against the current baseline (12 / **0.27** / 42 / 8):

| switch | mix | share | median | unresolved | wars | verdict |
|---|---|---|---|---|---|---|
| **baseline** | 12 | 0.27 | 42 | **8** | 37.9 | |
| **`ai.dominionWeight` 1** | 12 | **0.27** | 45 | **6** | 40.5 | **flipped — ships on** |
| `ai.dominionWeight` 0.5 | 10 | 0.22 · *fails* | 44 | 10 | 41.3 | worse |
| `attackPrice.enabled` 0.6 | 13 | 0.29 | 40.5 | 9 | 40.1 | ~free, still buys nothing |
| `ai.huntLandlessBlocker` 1 | **19** | **0.42** | 42 | 10 | 41.9 | both readings reversed sign |
| `ai.closeOutWithin` 2 | 10 | 0.22 · *fails* | 45.5 | 7 | 38.1 | worse |
| `ai.pactCall` 1 | 13 | 0.29 | 45 | 10 | 43.8 | worse |
| `ai.settleWithoutCession` 1 | 13 | 0.29 | 44 | 10 | 43.2 | worse |
| `ai.giftAboveShareOfCap` 0.8 | 11 | 0.24 | 42 | 11 | 38.2 | worse |

Confirmed at n=90, because everything else measured here shrank when the sample
grew:

| n=90 | baseline | `dominionWeight: 1` |
|---|---|---|
| ending mix | 30 (0.33) | 29 (0.32) |
| median rounds | 41.5 | 45 |
| **games unresolved** | **22** | **13** |
| wars per game | 43.74 | 43.10 |

**Unresolved games fall 41% for essentially nothing** — the mix moves one
hundredth, the war rate is flat, the median lands inside the band. It holds at
the larger sample.

**Why the old reading was right and the old reason was wrong.** The second pass
concluded that the bottleneck is *conversion*, not selection: `courtshipScore`
only ranks candidates a Standing floor has already filtered, so re-ranking them
moves the AI off the partner it could convert and onto one it cannot. That was
true. What it did not say is *why* the pool was full of unconvertible partners
— and the answer is the landless factions: frozen out of the political layer by
construction, unreachable by any verb, and counted by the win condition anyway.
Remove them and the pool becomes worth ranking.

So the brief was right about its own headline proposal and wrong about the
order of operations. `courtshipScore` really did read warmth alone, and fixing
it really was the highest-value change available — but only after the rules
underneath it stopped manufacturing partners nobody could convert. Two changes
that each measure worse alone can compound; the discipline of one flag on one
build finds that, and only if you re-ask the old questions after the board
moves.

Note 0.5 is not a safe middle — it fails the mix band where 1 clears it. The
blend is not monotone in the weight.

And `ai.huntLandlessBlocker` is the mirror image: **both** its readings reversed
sign. The mix it used to cost a third of is now the best of anything measured
(0.42), and the `unresolved` it used to be the only thing to improve gets two
games worse. That is what redundancy looks like — the clock removed the blocker
the switch existed to chase, so all that is left is the marching.

---

## Where I would go next, in order

1. **Re-ask the questions this pass could not.** Two verdicts flipped when the
   board moved, so the others are not safe either — but re-measuring everything
   after every change is not a method. The rule that would have caught both:
   **a dark switch's verdict expires when a rule it was condemned against
   changes.** `attackPrice` is the live candidate — four readings, and the
   latest is very nearly free (a point of mix for a game) on a board where the
   war rate is still falling.
2. **Ask why a bigger board is worse.** Still the most surprising reading here
   and still unexplained beyond a shape: Dominion asks you to deal with every
   survivor, and room makes survivors cheap. `--map` makes it cheap to chase,
   and it now matters more, because the clock and `dominionWeight` both work by
   reducing the number of parties left to deal with — which is exactly what a
   bigger board undoes.
3. **Decide whether 8 is the grace you want.** The sweep is in the third pass
   and the trade is legible; this is a taste question about how the game should
   feel, and the numbers are there to answer it with.

I would not spend another run on the political verbs. Six of the ten levers
built here were political and one paid, and it paid only because a rules change
went in first.
