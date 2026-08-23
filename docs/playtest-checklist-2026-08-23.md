# What to check — the diplomacy and economy rework

Everything from the three 2026-08-23 briefs, phases 0 through 6. This is the
list to play against.

**Everything below is automated-green.** 849 harness checks, `audit-diplomacy`
(16 blocks, 0 pending), `audit-economy` (47 assertions, 10 of 10 blocks live,
0 pending), `check-legibility` (50), `check-spines` (45), seven Playwright UI
checks, and a clean `vite build`. So none of this is "does it work" — it is
**does it feel like anything**, which is the only question left and the only
one a machine cannot answer.

The scoreboard is `docs/scoreboard-2026-08-23.md`; every measurement quoted
here is from `node scripts/sim-suite.mjs`.

---

## 0. The three governing numbers, as they stand

| | baseline | now | band |
|---|---|---|---|
| Ending mix (submission + mixed) | 5 of 15 | **10** | ≥ 11 |
| Median rounds to Dominion | 62 | **54** | 58–66 |
| Games unresolved | 6 | **4** | 0 |

Two of the three are close and neither is where it should be. **Unresolved 4 is
the one to watch while you play**: if a game of yours stops being about
anything around round 50, that is this number, and the cause is in §8 below.

---

## 1. Round one — the thing most likely to be wrong

The round-1 dead turn was found and fixed once already (Sway paid at round end
meant an empty pool on turn 1, so every political verb was disabled while the
AI courted anyway). Check it did not come back:

- [ ] On your **very first turn**, is the Diplomacy drawer usable? Sway should
      be seeded, not zero.
- [ ] Is the **Court** button enabled on somebody, and does pressing it work?
- [ ] Does the AI open a courtship on *you* in the first handful of rounds, not
      only on each other?
- [ ] **Path to Dominion** card at the top of the drawer: does it name every
      faction you still have to deal with, including minors?

## 2. Sway — the third currency

The rule is a hard wall: **scrap buys what a faction HAS; Sway buys what a
faction THINKS.** Nothing converts, in either direction, for anybody.

- [ ] The Sway card itemises income (floor / hexes / agreements / chips). Does
      the breakdown add up to the total shown?
- [ ] Does a mountain of scrap ever buy Standing? It should not — and neither
      should the AI's, which was the last hole (it used to gift 3 scrap).
- [ ] **The floor buys exactly one courtship** (upkeep 6 = floor 6). Running a
      second should require ground or agreements. Does that feel like a real
      budget or an arbitrary wall?
- [ ] The pool sits at its ceiling ~30% of rounds in AI play. **Do you ever
      feel Sway-poor?** If not, the cap or the income wants lowering, and this
      is the single most likely tuning miss in the whole rework.
- [ ] Courtships lapse ~5 times a game in AI play. Does losing one feel like
      your fault, or like the game taking something?

## 3. Posture and the courtship ladder

- [ ] Each faction row shows a posture (Indifferent / Watching / Courting /
      Warning / Committed). Does it change for reasons you can name?
- [ ] A courtship states a **condition** drawn from their interests. Is the
      condition ever something you would actually do — or always something
      irrelevant?
- [ ] Watch for a faction wanting **redress** after you wrong it (this was a
      units bug: a live betrayal weighed 0.25 of a want against a missing trade
      route's 1.0 — a betrayed faction would open a courtship asking for a road).
- [ ] Does the AI ever **say** its posture out loud before acting on it?

## 4. Territory that costs something

- [ ] **Influence heatmap**: can you see your own field, with a hard amber ring
      at the dominance threshold? Walking that ring should tell you "one more
      point of Loyalty and this row joins my zone".
- [ ] Dominance is a step function with a wide dead zone (under 6 → 1 hex, 6–12
      → 7, 12+ → 19). **Does the overlay make that legible, or does investment
      still feel ignored?**
- [ ] **ZoC movement cost**: moving through a rival's zone costs 0.5 extra
      against a base movement of 2. Does that read as friction or as a tax you
      cannot see? (At 1.0 it halved invasion speed and unresolved games went
      4 → 6.)
- [ ] **Supply delay**: 358 purchases per suite are delayed, **0 are refused**.
      A rush or recruit far from your holdings should arrive *late*, never be
      denied. Does the delay tell you it is happening?
- [ ] **Occupation charges** — holding a surviving faction's homeland costs 6
      Sway/round. ~1500 per suite. Is the trade between conquest and courtship
      one you feel making, or a surprise on the ledger?
- [ ] **Blockade drain**: a blockade pays the owner nothing and bites the
      victim harder with a toll booth fitted. Does that read?
- [ ] **Listening posts** now have an icon (hollow when dormant/unpaid). Can
      you find your own?

## 5. Coalitions — the Attila test

- [ ] Play a clean, spotless leading game. **Does the board rise against you
      for leading alone?** It must not — a rising needs *menace you earned*, *a
      grievance somebody can name*, or a lead past `fearThreshold` (26, well
      above the coalition threshold of 16).
- [ ] Now play a nasty one. Does the rising arrive, and does it say *why*?
- [ ] Does a faction that **likes** you refuse to join one against you?
- [ ] **The murmur**: do you hear about a coalition forming against *somebody
      else*? That is your window, and it was invisible before.

## 6. What you can now say and do (all new, all player-facing)

- [ ] **Counter** on an offer: a scrap stepper, then "Put it to them". They
      answer at once. Positive = scrap you pay.
- [ ] Does the counter ever get *taken*? Does a refusal name a price?
- [ ] **Positions** — "What you stand for". Declare one (no war on X / hands
      off X's ground / no vassals). Keeping it is free.
- [ ] **Break one deliberately.** Do they name it back at you, in the words you
      used, within three rounds? That citation is the entire point of the
      feature — if it does not land, the feature does not exist.
- [ ] Standing down honestly costs 2 Honor; being caught costs 6. Does that gap
      feel like it is worth the honesty?
- [ ] **Quiet work** (intrigue). Expose is true and cannot rebound; Forge and
      Fabricate are lies with a stated percentage chance of being seen through.
      **Is that percentage on the button before you press it?**
- [ ] Get caught deliberately. Is the fallout legible?
- [ ] **Swords** in the Custom Deal pane: hire somebody into your war, or offer
      your sword to theirs. It should never be offered against their own ally.
- [ ] **Standing receipts**: does every Standing movement have a stated cause?

## 7. The economy — yes, this is very much an economy rework

Answering the question directly: **10 of the 11 economy stages shipped.**
Legibility, the Standing pump, supply delay, ZoC cost, occupation, the blockade
drain, the Sway wall, the chip value table, the chip count sink and
scrap-between-factions. What did not ship is nothing — the economy audit has
**zero pending blocks** for the first time.

- [ ] **The AI now builds like it has opinions.** It scored 6 of 42 authored
      chip fields; it now scores all 42, ranks by **value per scrap**, and
      **upgrades** (0 → 329 per suite). Does its board look considered?
- [ ] **The chip sink**: past 6 chips, each one costs 1/round. Does the build
      menu quote the surcharge *before* you commit? (An upgrade replaces a chip
      in its slot and is correctly not surcharged.)
- [ ] Can you not pay? Chips go **dormant and come back**; none is ever
      destroyed. Verify that.
- [ ] Median end scrap fell 49 → 35. **Do you still finish games rich?** If
      yes, the sinks are still too small.
- [ ] Empty tech wheels at round 15: 2.87 of 8 factions, barely moved from
      3.13. **That one is not fixed** — see §8.

## 8. The known-open findings — what to look for and confirm

Four things are recorded, not fixed, and your play is the tiebreaker.

1. **Unresolved games: 4 of 15, band is 0.** If a game of yours goes quiet
   around round 50 with nobody able to finish anybody, note *which faces were
   still open* when it happened.
2. **The AI cannot convert political capacity into progress toward winning.**
   This showed up three separate times — §8's attack price, the AI gift, and
   the intrigue ops — and each made the suite *worse*, so all three ship
   switched off for the AI while live for you (`attackPrice.enabled: 0`,
   `ai.giftAboveShareOfCap: 1`, `ai.intrigue: 0`). **Does the AI feel
   politically passive to you?** If it does, that is this, and it is one policy
   problem rather than three missing features.
3. **Sway sits at its ceiling 30% of rounds.** The sink now exists (ops); the
   AI does not use it. See §2's question.
4. **`influence.hexCap: 20` never binds** — the best faction on this board
   dominates 11. Inert, harmless, but the bounded-advantage argument is
   currently carried by the floor alone.

## 9. Things that should NOT have changed

Regression targets. If any of these moved, something leaked.

- [ ] Combat maths, contest odds, retreat, veterancy, salvage.
- [ ] Research, Tech Level bands, the wheel's own allocation policy.
- [ ] Encounters, quests and the wiki, apart from `trust` now moving Honor.
- [ ] The one win condition. **Dominion is still the only one** — there are no
      victory switches on the setup screen and there is no Recognition score.
- [ ] Fog, vision, concealment, ambush.

## 10. If you want to run the numbers yourself

```
npm run harness           # 849 checks
npm run audit:diplomacy   # 16 blocks, the findings behind the brief
npm run audit:economy     # 47 assertions, exits non-zero on a failure
npm run check:legibility  # 50 — can the player SEE it
npm run check:spines      # 45 — posture / interests / Sway
npm run sim:suite         # the three governing numbers, 15 pinned seeds
```

Every rule added in this rework has a **no-op value in config**, with the
reasoning in the comment beside it, so anything that plays badly is a config
revert rather than a branch revert. `scripts/sim-suite.mjs --set <path>=<value>`
runs the suite with any of them flipped — that is how each stage was isolated,
and it is how to check a hunch without touching code.

The switches most worth flipping if something feels wrong:

| feels like | try |
|---|---|
| the AI never fights for its reputation | `--set diplomacy.attackPrice.enabled=1` |
| the AI is politically passive | `--set ai.intrigue=1` or `ai.giftAboveShareOfCap=0.7` |
| coalitions gang up unfairly | `--set diplomacy.coalition.groundsGate=0` to see the old behaviour |
| the AI builds badly | `--set ai.valueTable=0,ai.upgrades=0` |
| movement friction is wrong | `--set influence.zocMoveCost=0` |
| chips feel over-taxed | `--set economy.perExtraChip=0` |
| quest choices hurt too much | `--set diplomacy.honor.trustToHonor=0` |
