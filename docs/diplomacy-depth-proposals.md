# Diplomacy — where the depth still is

Written 2026-08-19, after the audit's tiers 1 and 2 landed and after the
denouncement redesign. Companion to
[`diplomacy-audit-2026-08-19.md`](diplomacy-audit-2026-08-19.md), which
covers what was *broken*. This one is about what is *missing*.

The denouncement change is the model for everything below. It wasn't new
machinery — Menace, Honor, grievances and per-observer tolerance all already
existed. What was missing was the engine **asking the question**: is there
anything to denounce? One predicate turned a flat toll into a political act
with two opposite outcomes, gave the pacifist faction a real lever, and made
the board start condemning the Grand Lakers unprompted.

Every proposal here is that shape: a question the engine has the data to
answer and currently never asks.

---

## The five gaps, ranked

### 1. A faction remembers exactly one thing about you

```js
gr[victim][offender] = { kind, round };   // ← overwritten every time
```

Betray a faction three times and there is one record, of the most recent
betrayal, with no severity. So:

- A denouncement cites "grounds" but can never name **which** act.
- A war is "justified" but the record cannot say what for.
- The AI's memory has a depth of one.
- There is nothing to show the player, which is why the relationship dossier
  (audit §3 item 16) has nothing to render.

**Make grievances a ledger.** Each entry: `{ kind, round, severity, at }` —
what happened, when, how bad, and *where*. Everything downstream becomes
concrete rather than boolean:

- Denounce cites the specific act: *"for the strike on Tin Town at round 7."*
- `warJustification` returns the entry, not a string.
- Severity accumulates: three small betrayals weigh like one large one.
- The dossier renders itself from the ledger with no new data.
- Grievances age out individually instead of the pair going clean at once.

**Then let grievances be settled.** Right now Honor only falls, and there is
no way to make amends for anything. **Reparations**: offer a wronged faction
scrap (or a Location — see §3) to clear a specific grievance. They can accept
or refuse, which makes it a real offer through the tier-2 machinery, and
gives the *victim* a decision — take the blood money, or keep the grudge and
the right to a just war it carries.

That closes the loop: grievances become the thing diplomacy is actually
about, rather than an invisible flag.

*Effort: medium. Touches `recordGrievance`, `warJustification`,
`denounceWarrant`, and adds one deal item + one verb. Every consumer already
exists.*

---

### 2. Nobody has to see what you did

`onAttack` charges Menace globally the instant you strike. §19 fog of war and
§18 diplomacy do not touch each other anywhere in the codebase — the only
mention of `visibility` in `diplomacy.js` is for handing over map data.

So a massacre in unexplored wasteland costs exactly what one on a rival's
doorstep does. Every faction on the board reacts to something none of them
could possibly know about.

**Gate reputation on witnesses.** When you attack, ask who could see the hex.
Menace is applied per-observer — the factions who saw it — rather than as one
global float. A strike nobody witnessed still creates a grievance in the
*victim* (they were there), but the board does not react.

This is the change I would most like to make, because of what it does to the
rest of the game:

- **Fog becomes a diplomatic instrument.** Striking where nobody is looking is
  now a real strategy, with a real cost: it takes longer to get there.
- **The Intelligence path gains a political payoff it completely lacks.**
  Vision means you *witness* things, which means you hold grievances other
  factions cannot, which means your denouncements have grounds theirs don't.
- **Listening posts become political sensors**, not just tactical ones.
- **The victim's testimony matters.** They know. If they are believed — the
  Honor/trust-floor machinery denounce now uses — they can tell the board.
  Which makes *silencing* a witness a coherent, dark strategy.

It also fixes something subtler: Menace is currently omniscient, which is why
it feels like a score rather than a reputation.

*Effort: small-to-medium, and disproportionate payoff. `canSee` already
exists; `menaceOf` becoming per-observer is the main refactor, and
`tolerance` is already per-observer so the shape is half-built.*

---

### 3. Diplomacy is a scrap market in a game about territory

Every faction in `content.js` carries `affiliatedLocations` — Versari's
`["korad", "dambar", "runaway"]`, Goldgrass's `["kansit", "omara", "witcha"]`.
It is used in exactly one place: **board generation**. Politically it does not
exist.

Meanwhile the only thing anyone can trade is scrap.

**Claims.** A faction's affiliated Locations are places it considers its own.
Holding one that isn't yours is a standing grievance — not an event, a
*condition*, one that persists as long as you hold it. Consequences fall out
immediately:

- Goldgrass will not warm to you while you sit on Omara, whatever you pay.
- Taking a claimed city is diplomatically different from taking a neutral one,
  which gives the map political texture it currently has none of.
- "Give it back" becomes a thing a faction can *want*, and therefore a thing
  it can offer for.

**And Locations become deal items.** `{ location: "omara" }` alongside
`{ resource }` and `{ promise }`. Then the sentences the game cannot currently
say become sayable:

- *"Cede Omara and we have peace."*
- *"Support my war and Chigan is yours."*
- *"Reparations for Tin Town: take Erport."*

This is the biggest single change to how the layer *feels*, because it moves
diplomacy from a side-market into the same currency as the war.

*Effort: medium-large. Needs a deal item type, transfer, valuation (a
Location's worth = its VP + output + whether it is claimed by the valuer),
and UI. The claims half alone is small and worth doing first.*

---

### 4. There is no verb between "ask" and "attack"

You can request. You can trade. You can declare war. There is nothing in
between — no way to say *"stop, or else"*, which is the single most common
act in real pre-war diplomacy and the one that generates all the tension.

**Ultimatums.** A demand with a deadline and a named consequence:

> *Withdraw from Omara within 3 rounds, or we take it.*

- **Public.** Every faction sees it, which puts the issuer's credibility on
  the line — an ultimatum you don't follow through on should cost Honor, hard.
- **Complying is cheap and humiliating.** You lose the thing, not face with
  the board. That is what makes it a genuine dilemma rather than a bluff.
- **Refusing hands the issuer a casus belli** — a *warranted* one, under the
  denouncement model, so the war that follows is clean.
- The AI gets a way to threaten the player that isn't the one-way envoy notice.

An ultimatum is the pact-call inbox with a timer and teeth: almost all of the
machinery shipped in tier 2 already.

*Effort: small-medium. Rides the offer system directly.*

---

### 5. The numbers have no receipts

Menace 9. Honor −2. Where from? The player cannot tell, and neither can a
reader of the code without a `grep`.

Every one of those changes already carries a `cause` and is already emitted.
**Keep the last N per faction and render them:**

> **Menace 9** — surprise attack on Goldgrass (r4) · broke truce with Lakers
> (r7) · pressuring Omara (r9–11)

Cheapest item on this list, and it is the difference between a stat and a
story. It also makes every other proposal here legible: witnessed Menace,
grievance severity and ultimatum breaches all need somewhere to show up.

*Effort: small. The data is already flowing through `emit`.*

---

---

## Status

**§1 grievance ledger + reparations — BUILT (2026-08-19).** Grievances are a
list with severity and place, bounded per pair, ageing out one entry at a
time. `worstGrievance` is what a denouncement cites and what a war is
declared over, so the UI can say *"they attacked you undeclared at Korad,
round 1"* instead of *"you have grounds"*. A `{ settlement: true }` deal item
buys the slate clean — priced from the holder's side, so an apology is never
free and never refusable for nothing — and clears both ledgers at once,
pays Honor to both parties, and pulls the grounds out from under any
denouncement resting on it. The AI settles its debts before it goes courting
(a diplomacy-lean faction gifted a stranger every single turn, which made
everything below that branch unreachable), and asks the human rather than
assuming, because taking compensation means giving up the righteous war the
grievance entitles you to. The relationship dossier — audit §3 item 16 —
renders itself off the same ledger the engine acts on. 17 harness checks
(Phase 25).

**§2, §3, §4, §5 — still open.**

## What I'd build, in order

1. ~~**Grievance ledger + reparations** (§1)~~ — **done**, see Status above.
2. **Witnessed reputation** (§2) — the highest ratio of payoff to effort, and
   the one that makes two existing systems talk to each other.
3. **Receipts** (§5) — small, and makes 1 and 2 visible instead of invisible.
4. **Claims** (§3, first half) — small, high flavour, no new item type needed.
5. **Ultimatums** (§4) — rides tier 2's offer machinery.
6. **Ceding Locations** (§3, second half) — the big one, best done once claims
   and the ledger exist to give it meaning.

Deliberately still parked: audit §3 tier 3's *personality in the price* (wants
the AI overhaul) and *fuzzy acceptance reads* (wants a decision about how much
the UI should tell you, which is a bigger question than it looks).
