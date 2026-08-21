# The Rainmaker — what got built, and what was measured

*Companion to `rainmaker-questline-design.md` and `rainmaker-implementation-notes.md`.
Those two are the spec. This is the record of building it: where the code
lives, every place the implementation departs from the spec and why, and the
numbers behind each of those decisions.*

---

## 1. Where it lives

| Piece | File |
|---|---|
| State, lifecycle, every stage rule | `src/game/rainmaker.js` |
| How an AI plays it | `src/game/rainmakerAi.js` |
| Tuning | `src/game/config.js` → `CONFIG.rainmaker` |
| Site seeded at world creation | `src/game/setup.js` |
| Round pulse (myth, stages, search, site, install, specialist, claim, victory) | `src/game/turn.js` → `runRoundEnd` |
| One-hex convoy override | `src/game/movement.js` → `unitReach` |
| Device dragged with its carrier; the site found on entry | `src/game/actions.js` → `runMove` |
| Claim lock, capital storming, carrier reconciliation | `src/game/contest.js` |
| Output once switched on | `src/game/economy.js` |
| What a viewer may know | `src/prototype/engineAdapter.js` → `rainmakerView` |
| Device on the board | `src/prototype/RainmakerMark.jsx` |
| The narrowing, drawn | `src/prototype/RainmakerSearchArea.jsx` |
| The player's panel | `src/prototype/RainmakerPanel.jsx` |
| Second clock in the HUD | `src/prototype/HudChrome.jsx` → `RainmakerDial` |
| Feed lines | `src/prototype/EventFeed.jsx` |

**Verification.** `node src/game/harness.js` — phases 31–37 are the Rainmaker
(902 passing overall). `node scripts/check-rainmaker-ui.mjs` drives the real
app (25 checks): it fires all 25 rainmaker events with their real payloads and
fails on a raw event name or a feed line missing its faction, checks the device
draws in each state and does NOT draw where the viewer cannot see it, and clicks
every button in the panel.

It is **its own module**, not content in `quests.js`. The quest engine models a
chain of beats delivered to one claimant with progress stored on the quest;
every load-bearing rule here is the opposite — four factions at four different
stages of one line, an object that changes hands without its progress, and a
line that ends for everybody at once.

---

## 2. Departures from the spec, and the measurement behind each

Everything else is implemented as written. These six are not.

### 2.1 The site's distance floor scales with the board

**Spec** (notes §6): minimum 4 hexes from every capital; a board that cannot
seat one is "a map generation failure to surface loudly, not a constraint to
silently relax."

**Measured**, 12 boards per size, best min-distance any hex achieved:

| size | hexes | best achievable | hexes at ≥4 |
|---|---|---|---|
| small | 30 | 2 (3 on two boards of twelve) | **0 on every board** |
| medium | 61 | 4 on 11 of 12 | 0–5 |
| large | 91 | always ≥4 | 9–28 |
| huge | 127 | always ≥5, usually 6 | 36–58 |

On the small board it is not a generator bug, it is arithmetic: 30 hexes and
four capitals leaves nowhere 4 hexes from all of them. So 4 is a **target** the
board is asked for, the far corner is what it gets when the board cannot give
it, and the shortfall emits `rainmaker_site_cramped` with the numbers. Nobody
should have to infer from a two-hex haul that the constraint quietly gave way.

### 2.2 The site cannot be found before the myth surfaces

**Spec** (notes §6): entering the hex finds it, always, with no gate of any
kind — not fog, not unit type, not an action, not a progress threshold, not the
narrowing tier.

**Measured**: with no rule at all in front of the guarantee, **5 of 12 real
games had the site walked over by an ordinary patrol in round 3 or 4** — several
rounds before the line was offered — skipping the entire parallel phase and
handing the exclusive phase to whoever happened to be passing. Median find
round: 4.

So: before the myth is public, there is nothing to find. This is not a
per-faction gate and not a stage gate — once the myth is out, a faction that
declined it outright still finds the site by walking into it, and gets no lab
for it. **After: median find round 16**, which is the window the design predicted
for a round-8 trigger.

### 2.3 Roads and the convoy — no departure, but worth stating

`unitReach` returns a convoy's field built from the adjacency and nothing else,
rather than by subtracting known bonuses. Default-deny, per notes §2. Verified
by driving 30 real AI games and measuring **every** step the device took: 500
steps, none longer than one hex.

That measurement found the one real bug in the transport: the AI's units retreat
off lost contests, which moved a carrier without moving the device. Its hex went
stale and the next legitimate step teleported it across the gap. The device is
not cargo, so an escort that breaks and runs leaves it behind, exactly as a
destroyed escort does.

### 2.4 An AI can only finish the line if it can clear a slot for the lab

**Spec** (notes §10): the pursue disposition must be able to complete every
stage, including the lab.

**Measured**: 19 of 20 games found the site and 6 delivered the device home, but
**not one game ever accrued a single installation turn**. A capital developed
over twenty ordinary rounds is full — three chips in three slots — so the device
came home to a city with nowhere to put the thing the design requires.

The first fix was for an AI one beat from winning to knock down the cheapest
thing it owned. **After: an AI won the game outright via the Rainmaker in 3 of
20** — the requirement itself untouched.

That fix is superseded by §2.6, which measured the same squeeze from the
player's side and found it universal rather than occasional. Nothing demolishes
anything now.

### 2.5 Denial is decided by position, not by price

**Spec** (design §6): destruction "priced very high — a deliberate, expensive
commitment, not a spite button."

**Measured**, three times:

| rule | games ending in denial | Rainmaker wins |
|---|---|---|
| free | 10 / 30 | 3 |
| priced 25 / 60 / 120 scrap | 7 / 18 at every price | 1 / 18 |
| gated on affording a lab | 0 / 30 | — |
| gated on the haul (shipped) | 9 / 30 | 4 |

The price does not move an AI: they sit on a **median 734 scrap** by the late
game, so any "very high" number is noise. Gating on affording a lab swings it to
never, for the same reason. The price stays — it is a real cost to a *player*,
who spends constantly — but what makes an AI think twice is whether it could win
instead, measured as the haul: from where the device is lying, how much further
is your capital than the nearest rival's. Carrying a one-hex-per-turn convoy
home past somebody closer than you are is not a plan.

### 2.6 The lab that cannot gate you: the Rainmaker Workshop

**Spec** (design §5.6): a lab in the destination capital, at full cost and
duration, whatever route you took — "the vulture toll. It does not forbid the
strategy; it prices it."

**Measured**, 12 games, capitals sampled at rounds 15, 25 and 35:

> **Every capital still standing had zero free slots by round 15, and not one of
> them had a lab in it.**

So the requirement as written did not price the vulture strategy — it taxed
*everybody* identically. 100% of holders arrive home to a full capital and have
to demolish a working building at the worst possible moment. And the
Stage-1-to-Stage-6 continuity the design imagines ("you built one already, so
you skip this") essentially never fires, because Stage 1's lab gets built
wherever there is room and capitals fill with economy and military chips.

The fix is a distinct chip, the **Rainmaker Workshop**: a lab in every respect
that matters — it satisfies the installation and it does research like one — but
it takes **no chip slot**, and it can only be raised in the capital the device is
sitting in, by the faction holding it. The toll is still paid, in scrap (dearer
than an ordinary Lab) and in four turns of standing still while the whole board
walks toward you. It is simply no longer paid in a slot the city needed for
something else. A capital that already has a lab has no use for one, so the
player who did plan ahead still skips the beat.

This needed one contained engine change: `def.slots || 1` read a genuine 0 as
"unset" and charged a slot anyway, so a zero-slot chip was not expressible.

**After**, over 20 AI games: no game terminates at Stage 6 any more. Games that
reach the installation now run through to Stage 8, and the median winning round
across 30 games fell from 46 to 35.

### 2.7 Rulings taken during the build

Three questions the spec left open, answered by the designer:

- **The specialist is abstract** — no map position. Pay to outbid whoever has
  them, or take them with military weight.
- **The siege floor is a new faction**, not neutral units: a splinter of an
  existing house (Versari's Korad Schism, or the Plainers' Free Baronies if the
  player *is* Versari, so the game never invents a grievance inside the player's
  own house). It cannot be dealt with diplomatically. This needed two engine
  capabilities that did not exist — a runtime faction registry and runtime unit
  spawning.
- **Stage durations stay as authored.** The line is the long game.

---

## 3. Where it currently lands

30 AI games, mixed board sizes, 70-round cap:

- won by Rainmaker **4**, by Dominion **5**, unresolved **21**
- device destroyed outright in **9**
- median winning round **46**, range 13–66
- splinters raised **0** — the floor is rare by design; it needs every rival
  allied or dead

The spread across games is the design working rather than failing: games stall
at a contested site (two factions on the hex means progress for neither), at a
one-hex-per-turn haul that gets intercepted, and at a blocker who would rather
nobody had it.

---

## 4. Known gaps

- ~~**Art.**~~ Landed. `RainmakerMark.jsx` draws the Oldworld weather machine
  from the shared sprite machinery (`art/units/neutral/`), facing the bearing of
  its last step, over a faction-coloured contact ellipse — the asset carries no
  owner colour by ruling, so the holder is marked on the ground rather than
  painted onto the machine. See `docs/weather-machine-pipeline-asks.md` for the
  three pipeline changes it needed, and a fourth that document did not catch.
- **The unresolved-game rate is high** (20 of 30 at round 70). That is largely
  inherited: before the Rainmaker existed, 11 of 24 games ran past round 60. The
  Rainmaker resolves some of them without dominating, but it is not a fix for
  whatever else makes late games stall.
- **Stage 0 is engine-side.** The myth surfaces as an event and the player
  commits from the panel. It is not yet authored as an encounter with art and
  branching text, which is where it will read best.
- **The two-path rule is unaudited against tuning drift** (notes §11). Every
  beat has two paths today; nothing checks that both stay affordable as numbers
  move.
