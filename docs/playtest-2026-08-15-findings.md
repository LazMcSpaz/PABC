# Playtest findings — 2026-08-15, medium map, 15 rounds

Read off the exported log (2594 events, 4 majors + 2 seeded minors, human =
Free Plainers). Nobody was near the 12-VP threshold when the session ended:
Dambarans 3, Plainers 2, Lakers 1, everyone else 0.

The session's headline: **the AI fought itself in one corner while the human
took the other corner unopposed.** Two separate causes, one of them a
deterministic generation bug.

## 1. Half the war happened on one hex

| | contests |
|---|---|
| h0-1 (Omara) | **26** |
| h2-6 (Dambar) | 10 |
| everywhere else | 21 |

57 contests in 15 rounds; **h0-1 alone took 46% of them**, and Omara changed
hands five times. Grand Lakers declared 24 of the 57 (42%) and opened seven
wars, six of them surprise attacks at −8 Honor each — on Goldgrass, Croppers,
Versari, Dambarans, Versari again, Free Plainers, Goldgrass again.

Meanwhile the human captured Concordan and Erport with the log recording both
as **`(unclaimed)`** — no contest, no rival claim.

## 2. The medium map is not symmetric, on every seed

`generateLayout` orders Locations as *capitals → unaffiliated → each faction's
second home*, and truncates to `CONFIG.mapSizes[size].locations`. Its own
comment claims truncating anywhere "leaves the factions equal to each other".
It does not: truncating **inside** the seconds group gives some factions a
second Location and others none.

Measured directly, 30 seeds per size, counting affiliated Locations placed:

| size | budget | versari | goldgrass | lakers | plainers | fair? |
|---|---|---|---|---|---|---|
| small | 6 | 1 | 1 | 1 | 1 | yes |
| **medium** | **8** | **2** | **2** | **1** | **1** | **no — all 30 seeds** |
| large | 10 | 2 | 2 | 2 | 2 | yes |
| huge | 10 | 2 | 2 | 2 | 2 | yes |

Medium is 4 capitals + 2 unaffiliated + the **first two** seconds (Dambar,
Omara). Versari and Goldgrass get a homeland pair; Lakers and Plainers get one
city each. That is not seed luck — it is the same every time.

It also explains the grinder: Omara is Goldgrass's second home, placed 1–2
hexes from its capital by design, and a seeded minor took it. So the one
faction that got a second city had it parked next door, contested by everyone,
while two factions had no second city to fight over at all.

### The fix, when you want it

Build the in-play set from **whole fairness groups** rather than a flat
truncation: capitals always, then add `seconds` (4) or `unaffiliated` (2) only
if the whole group fits. At budget 8 that yields 4 capitals + 4 seconds — still
eight Locations, every faction with a homeland pair, no free neutral prizes.
Small (6) and large/huge (10) come out exactly as they do now.

Not applied: it changes what every medium game looks like, and medium is the
board being playtested.

## 3. Things worth a second look

- **`captured Omara (from Grand Lakers)` — by Grand Lakers.** Checked: not a
  bug. `loc.controller` clears the moment full control is lost, so
  `captureLocation` falls back to `loyaltyOwner` for "captured from", and that
  still names the last full holder. Lakers really were re-consolidating a city
  they had partly lost. The *log line* is misleading though — a re-capture by
  the same faction would read better as "retook Omara" than as capturing it
  from itself.
- **Aggression 0.9 never learns.** Lakers paid −8 Honor six times for surprise
  attacks and kept doing it, ending on 36 scrap, Tech 1, no tech nodes and 1
  VP. Whatever the Honor penalty is meant to discourage, it does not.
- **Nobody teched.** After 15 rounds: Goldgrass, Lakers and Croppers had an
  empty tech wheel. The human was Tech 5 with four nodes. The AI does not
  appear to invest while it is at war.
- **VP is far too slow to threaten.** Best AI total was 3 in 15 rounds against
  a 12 threshold. Either the faucets are too thin or the AI never holds a
  high-value Location long enough to tick Dominion.
