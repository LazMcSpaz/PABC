# Brief: make the opponent robust

> **SUPERSEDED, 2026-08-27, by `docs/ai-robustness-findings-2026-08-27.md`.**
> The instruments, the method rules and the traps in this brief are all still
> correct and still worth reading first. **Four of its findings are not**, and
> the findings doc has the measurements:
>
> | this brief says | the measurement says |
> |---|---|
> | §2 — the AI ignores the win condition and behaves in character until the clock runs out | The unresolved games are boards fought down to 2–4 survivors, most of them **one handshake** from Dominion and locked out of it. `courtshipScore` really did read warmth alone, and fixing it measured **worse** — it ranks a pool a Standing floor has already filtered. |
> | §3 — an alliance with the AI is one-way; they never call the human | **AI→human pact calls work and always have.** `queueHumanPactCalls` runs every round and the drawer answers it. The real gap is AI→AI, which measured worse when opened. |
> | §6 — `factionsWithEmptyWheelAtR15` is a bug hunt in `maybeAssignTech` | Not a tech bug. Every empty wheel belongs to a faction holding **zero Locations** at Tech 1. There is nothing to allocate. |
> | §1 — `actsPerAITurn` is 0.45 | 0.45 counts a union of verb events that omits opening a courtship, the most common political act. The real rate is **0.61**. |
>
> The headline defect has moved since this was written. `unresolved` was 16 of
> 45; the landless clock (`victory.landlessGraceRounds`) took it to 8, and the
> three governing numbers are now graded against `docs/sim-baseline.json` at
> n=45, not against the 21 / 45 / 16 quoted throughout below. **Every number in
> this brief is a reading of `b33d1ee` and should be treated as history.**

For the agent picking up `src/game/ai.js` after the diplomacy/economy rework.
Everything here was measured on `main` at `b33d1ee` on 2026-08-27. Where a
number appears, the command that produced it appears next to it.

`docs/ai-overhaul-plan.md` (2026-08-06) is still correct about the tech wheel
and the contest EV gate. It predates the entire political layer and says
nothing useful about it. This brief supersedes it for anything diplomatic.

---

## What "robust" means here

Not "harder to beat". The AI is already lethal in a straight fight — the
contest gate has it winning ~87% of the fights it picks. Robust means three
things it currently is not:

1. **It plays the win condition.** Right now it plays its personality dials.
2. **It uses the verbs it has.** Nine political verbs have no AI caller at all.
3. **Adding a behaviour cannot silently delete another one.** The one-act
   priority chain has starved its own lower branches twice in two months.

The third is the one that makes the first two safe to attempt, so it goes
first.

---

## Read before touching anything

This repo has a measurement discipline and it is not optional. Three rules
have each been broken once and cost a day:

**Every tunable ships with a no-op value.** A new term goes in `config.js` with
a switch that restores the previous behaviour exactly. No exceptions. The
comment on the switch records what was measured, including the readings that
argued against it.

**Assert the mechanism, not a count fitted to one observation.** A harness
check that says `earlyFear.length <= 1` passes at n=15 and fails at n=45 for a
rate that never changed. Write the check against the rule, and if you must
count, count a rate.

**Two builds are comparable only if the RNG stream is identical.** `rng.shuffle`
is Fisher–Yates and consumes draws proportional to length, so growing a deck by
ten cards changes every seed into a different game. A "regression" measured
across such a change is not a regression. The only clean comparison is one flag
on one build. If you cannot get that, say so in the report rather than quoting
the delta as if you could.

And one house rule about honesty: if a change makes a governing number worse,
report it and leave the switch off. Two of the switches in `config.js` are dark
for exactly that reason and both notes say so plainly. That is the expected
outcome for some of the work below, not a failure.

---

## The instruments

| command | what it answers | runtime |
|---|---|---|
| `node src/game/harness.js` | 934 checks. Must be 0 failed before any commit. | ~20s |
| `node scripts/sim-suite.mjs --n 45` | The three governing numbers + the §17 brief. Everybody plays `takeAITurn`. | ~6 min |
| `node scripts/probe-policies.mjs pacifist --assert` | What happens to a player who never attacks. CI gate. | ~45s |
| `node scripts/probe-policies.mjs spender` | What happens to a player who actually spends Sway. | ~45s |
| `node scripts/probe-economy.mjs` | Which ceiling binds per faction-round: money, slots, tech, none. | ~2 min |
| `node scripts/probe-invariants.mjs` | Rule violations across a sweep. Must stay at 0. | ~2 min |
| `node scripts/audit-diplomacy.mjs` | Narrative audit of the political layer. | ~1 min |

`sim-suite` can only ever tell you what happens when everybody plays the way
the AI plays. That is its point and its limit. `probe-policies` exists because
of the limit: it runs one faction on a scripted policy and everybody else on
`takeAITurn`. When the two instruments disagree, that disagreement is the
finding — do not average them.

**The three governing numbers, on `main` at `b33d1ee`, n=45:**

```
ending mix (submission + mixed)   21 of 45   band >= 11   PASS
median rounds to Dominion         45         baseline ±4  PASS
games unresolved                  16         band 0       FAIL
```

Sixteen games in forty-five reach round 81 with nobody having won. That is the
headline defect and most of this brief is about why.

---

## Where the AI lives

`src/game/ai.js`, 1298 lines. One turn:

```
takeAITurn (ai.js:51)
  speakPosture          state your posture before acting on it
  maybeAssignTech       spend a free Ability Point
  while (actions left)  tryOneAction  (ai.js:235)  — contest, move, recruit, activate, post, sabotage
  manageEconomy         (ai.js:1091) — slider, build queue, rush, buy slots
  manageDiplomacy       (ai.js:632)  — ONE political act
  endTurn
```

`manageDiplomacy` is a linear chain of eleven branches, each ending in `return`:

```
0    open a courtship            courtSomebody       ai.js:530
0b   spend surplus on an op      tryIntrigue         ai.js:587
1    vassalize a cornered rival
2    settle with somebody you wronged
2b   say something about your war  warTalk           ai.js:906
3    propose a pact
3b2  follow through on your own ultimatum
3c   answer an ultimatum standing over you
4    denounce somebody who has earned it
4b   gift — warm somebody up
5    open a conversation with the human
```

Supporting files worth knowing: `posture.js` (postures, `courtshipScore`),
`interests.js` (what a faction wants), `chipValue.js` (the effect→value table
for builds), `choicePolicy.js` (how the AI answers encounters), `diplomacy.js`
(every verb, ~4200 lines).

---

## The findings, in the order I would do them

### 1. The one-act priority chain is structurally fragile

`manageDiplomacy` gets exactly one act per turn and branch order is priority.
Nothing enforces or documents the ordering, so adding a branch silently deletes
whatever sits below it. This has now happened twice:

- The gift branch once sat above `warTalk` and returned on every turn a
  sociable faction took, which made the branch that **ends wars** unreachable.
  The note at branch 2b records it.
- Reopening the gift branch in `b33d1ee` walked into it from the other side.
  With the gift at position 3 a pacifist's Honor fell 8.3 → 4.1, because the
  gift fired every turn and starved branch 4 — and branch 4 is a peaceful
  faction's only source of Honor, which is the stat that now prices its safety.
  It was buying warmth with its armour. Moving the gift to 4b fixed it.

Two ways forward. The smaller one: keep the chain, give every branch a named
`reason` and emit which branch fired, then add a harness check per adjacent
pair asserting the higher one wins when both are live. The `b33d1ee` commit has
one such check to copy ("with money to gift AND somebody worth naming, it names
them"). The larger one: replace the chain with a scored candidate list — each
branch proposes an act with a value, the highest wins — which makes ordering a
number rather than a line position, and makes "why did it do that" answerable.

I lean to the larger one, but it is a real refactor of the most heavily
commented function in the codebase and every one of those comments is a
measurement. Do not throw them away; they are the reason the numbers are where
they are. If you take the scored route, each branch's comment moves onto its
scorer.

`actsPerAITurn` is **0.45** — the AI takes a political act on fewer than half
its turns. Worth knowing whether that is "nothing to do" or "the chain fell
through". Instrument it before you refactor it.

### 2. The AI has never heard of the win condition

Dominion is the only way to win: every surviving faction is your ally, your
vassal, or gone, held three rounds. Minors count.

`checkDominion` appears twice in `ai.js` (lines 670 and 740) and both are
**detection after the fact** — called right after a vassalage or a pact to see
whether that happened to win the game. Nothing anywhere reads *distance* to
Dominion. There is no term for "who is left to deal with", no preference for
the last unaligned faction, no notion that a minor two hexes away is worth more
than a major across the map because it closes the same requirement more
cheaply.

The clearest instance is `courtshipScore` (`posture.js:366`):

```js
return (0.4 + (def.sociability ?? 0.5)) * (0.35 + warmth);
```

Sociability times how much it already likes them. **The AI courts whoever it
likes most, not whoever it still has to deal with.** That is close to the exact
inverse of what the win condition asks for, and it is my first suspect for the
sixteen unresolved games: nobody on the board is trying to win, they are
behaving in character until the round limit.

The probe agrees: a scripted pacifist ends with **1.9 rivals still to deal
with** and 0.3 allies. Board-wide, `minorsAlliedOrVassalisedAtEnd` is **1.6**
against `minorsKilledPerGame` **3.2** — twice as many minors are killed as are
brought in, under a win condition that accepts either but only counts them once
they are *dealt with*.

A Dominion term in `courtshipScore` and in the pact/vassalize branches is the
single highest-value change in this brief. Expect it to move `unresolved`. It
may cost ending-mix variety, and if it does, say so.

### 3. Nine verbs the AI cannot use

Every one of these is implemented, harnessed and reachable by the player. None
has an AI caller anywhere in `ai.js`:

| verb | what it costs the AI | notes |
|---|---|---|
| `pact-call` | **an alliance with the AI is one-way** | The human can call them to arms; they never call the human, and AI↔AI calls never happen. `pactCall` appears only in `harness.js` and `engineAdapter.js`. |
| `mediate` | `honor.mediateGain: 2` is unreachable for the AI | Nobody ever ends somebody else's war. |
| `demand-tribute` | the whole §1.4 subsystem | Only the human→AI direction exists (`ultimatumToHuman`). |
| `trading-pact` | `scrapPerUpkeep`, the Research floor | The AI never proposes one. |
| `declare-position` | §13 is player-only | The AI has private postures (`speakPosture`); it never makes a public standing declaration the board can hold it to. |
| `free-vassal` | `freeVassal.honorGain` | No AI ever releases a vassal. |
| `set-open-borders` / `set-rail-access` / `toggle-allied-vision` | passage, sight | Allies never grant each other anything. |

The AI's whole deal vocabulary is `pact`, `peace`, `nonAggression`, plus scrap
and one location (`ai.js:734, 869, 885, 892, 964, 973, 982`). The engine
understands `openBorders`, `tribute` and `joinWar` as promise kinds too
(`diplomacy.js:1191`), and `dealValue` will score them — the AI simply never
puts them on the table.

`forge` and `fabricate` are a deliberate exception and should stay one. The
comment above `tryIntrigue` explains the asymmetry: the AI publishes true
things (`expose`) and does not lie; lying is the player's lever, and the AI
answers it with the counter-intelligence machinery it already has. Do not
"fix" this.

Start with `pact-call`. It is the one whose absence a player will actually
feel — you sign an alliance and discover it only works in one direction.

### 4. The board is at war constantly and nobody notices

From the §17 brief at n=45:

```
warsPerGame                    45.49      about one declaration per round, board-wide
warsOpenedByUndeclaredAttack   22.04      48% of wars start with a surprise attack
coalitionsPerGame               2.82
```

A surprise attack costs `honor.surpriseAttackLoss: 8`. The AI is systematically
destroying its own Honor — the spender probe's subject ends on Honor **2.2**
against a start of 4 — and Honor now gates whether anybody will sign with it
and, since `b33d1ee`, how expensive it is to attack. The AI is paying a price
it does not model.

It *has* the model. `diplomaticPrice` (`diplomacy.js:886`) forecasts the whole
reputational bill of an attack, declared or not, and `attackPrice.enabled` is
**0**. The note on that switch is careful and honest: measured at n=45, turning
it on costs one to two unresolved games and barely reduces undeclared attacks
(24.4 → 23.0 at the strongest setting). So the gate is built, fixtured, correct
and not worth its price *as currently weighted*.

That is a statement about the weighting, not the mechanic. `perReputationPoint`
0.8 scaled by `(1 - aggression)` means a warlord at 0.9 feels a tenth of the
bill. Whether that is a character or a bug is a design call, and it is worth
re-asking now that Honor has teeth on the defensive side too. Re-measure the
switch before assuming its old verdict holds — the board it was measured on no
longer exists.

### 5. Neither kind of player can hold ground

```
                        pacifist    spender
mean Locations held        0.5        0.2
wars declared ON it       11.6        6.8
```

A faction that never attacks and a faction that spends heavily on politics both
end games holding **less than one Location**. Whatever the AI is doing with its
armies, it is not something a differently-played human can survive. This is the
finding I understand least and it is probably not in `ai.js` at all — it is in
how contests, ZoC and Loyalty interact. Treat it as an investigation, not a
task, and do the investigation before writing any code.

### 6. Idle capacity, in both currencies

```
swayRoundsAtCapShare            0.29     the political pool sits at its ceiling ~a third of all rounds
medianEndScrap                  21       …and games end with money unspent
maxEndScrap                     73
factionsWithEmptyWheelAtR15     1.91     two factions still have no tech at round 15
courtshipsOpenedPerGame        61.56
courtshipsLapsedPerGame         3.38
```

Sixty-one courtships opened per game and three lapse. Given
`posture.initiativesPerRound: 1`, that is close to every faction opening a
courtship almost every turn, against `minorsAlliedOrVassalisedAtEnd` of 1.6.
Courtships open constantly and almost never convert into anything. I do not
know where they go — pact, war, elimination — and finding out is cheap and
probably informative.

The Sway ceiling is a known hole with a known shape: a currency nothing can
exhaust prices nothing. `ai.giftAboveShareOfCap: 1` keeps the gift faucet shut
and the note on it now carries a measured reason rather than an inferred one —
every cause of the branch's death is fixed and it *still* measures worse open
(21/45/16 at share 1, against 18/44/20 at 0.8 and 16/44/18 at 0.6). Sway spent
on warmth is Sway not spent on the courtship ladder, and the ladder is what
ends games. So the surplus wants a *different* sink, not a wider gift. Ops
(`ai.intrigue: 1`, 2.13 per game) are live and are not absorbing it.

`factionsWithEmptyWheelAtR15: 1.91` is a straightforward bug hunt in
`maybeAssignTech` — two factions in every game reach round 15 with nothing
allocated. Cheap to chase, and an AI with no tech is an AI playing a different
game from the player.

---

## Traps

Things that look wrong and are not. Each cost somebody time.

- **`baseActions: 0` is correct.** Actions come from ground, one per Location.
  A faction with no Locations gets no actions, deliberately.
- **Capitals never peel and never drift.** They are locked at full Loyalty. A
  test that picks a controlled Location at round 1 has picked a Capital and
  will read correct behaviour as a failure.
- **`src/game/content/*.js` is generated** from a corpus outside this repo.
  Hand edits do not survive `build-content.mjs`. The repo-side seams are
  `wiki-repo.js`, `rules-glossary.js` and `field-encounters-repo.js`.
- **Scrap and Sway never convert, in either direction, for anybody.** Scrap
  buys what a faction *has*; Sway buys what a faction *thinks*. An AI gift paid
  in scrap has been written twice and reverted twice.
- **A dark switch is a result, not a to-do.** `attackPrice.enabled: 0` and
  `ai.giftAboveShareOfCap: 1` are off because they measured worse. Re-measuring
  them is welcome; flipping them because they look like unfinished work is not.
- **`forge` / `fabricate` are player-only on purpose.** See above.

---

## What done looks like

A change is finished when all of these hold:

- `node src/game/harness.js` → 0 failed, with new checks covering the new rule
  (mechanism, not a fitted count).
- `node scripts/probe-policies.mjs pacifist --assert` → all claims hold.
- `node scripts/probe-invariants.mjs` → 0 violations.
- `node scripts/sim-suite.mjs --n 45` reported honestly against the three
  governing numbers, including any that got worse.
- Every new tunable in `config.js` has a no-op value and a comment recording
  what was measured — the readings that argued against it included.
- `npx vite build` clean.

Target for the whole effort: **`unresolved` at 0 of 45**, without losing the
ending mix (≥11) or blowing the median (45 ±4). Finding 2 is where I would
spend the first day.

One last thing. If a piece of this turns out to be wrong — I have been wrong
twice in this codebase about what a filter did and once about what a regression
measured — the correction is more valuable than the work. Say so plainly and
move on.
