# Diplomacy audit — 2026-08-19

What's broken, what's shallow, and what would make the layer feel like a
negotiation instead of a vending machine.

Grounded by running the engine, not by reading it. Every claim in §1 is
reproduced by `node scripts/audit-diplomacy.mjs`, which is kept in the repo
so these can be re-checked after a fix rather than re-argued. Output quoted
inline below.

**The short version.** The machinery is genuinely deep — ~35 verbs, Standing
with baselines and grudges, Menace, Honor, just war, coalitions, vassalage,
trading pacts, war exhaustion, precursor warnings. What's missing is the
*conversation*. Every interaction is one click that resolves instantly and
unilaterally, the UI tells you the answer before you click, the AI never
once approaches you, and seven concrete things do not do what their own
button says they do.

---

## 1. Bugs — where the engine and its own UI disagree

### 1.1 Make Peace asks nobody (the one you spotted)

`performDiplomacy("make-peace")` calls `makePeace()` unconditionally. There
is no acceptance check, no cost, no gate.

```
the engine's own opinion — aiAcceptsPeace(lakers): false
result: {"ok":true} | still at war: false
>> peace happened anyway, and standing rose to -3
```

The Grand Lakers — a 0.9-aggression warlord, one round into a war it is
winning, refusing peace by the engine's own evaluation — end the war because
you pressed a button. The drawer's own tooltip says *"They will accept if
you've stopped pressing them."* Nothing checks that.

Worse than a no-op: peace grants **+3 Standing to both sides** and installs a
truce floor, so the exploit loop is *declare war → take what you want →
Make Peace → come out with better relations than you started*. War has no
exit cost at all.

Note this is duplicated work, not a missing feature: **`sue-for-peace`
already does it correctly** — `aiAcceptsPeace()` weighs war exhaustion, side
terms and Standing. `make-peace` is a second, unguarded door to the same room.

### 1.2 Denounce is free, uncapped, and does not do what it says

The verb tooltip says *"you take an Honor hit"*. `denounce()` never calls
`adjustHonor`.

```
Honor before: 4 after five denouncements: 4
war against lakers now reads as justified: true
```

No Honor cost, no scrap cost, no cooldown, no limit. And since a
denouncement is the formal first step of a just war, you can denounce every
faction every round, permanently hold an open just-war window against the
whole board (fight anyone with no Menace), and farm +2 Standing with every
third party that dislikes your target. It is the strongest verb in the game
and it is free.

### 1.3 The Custom Deal builder's non-scrap terms are inert

`DiplomacyDrawer`'s deal pane emits `{pact: true}`, `{openBorders: true}`,
`{peace: true}`. `valueOfItem` reads `{promise: {kind: …}}`. They are
different schemas, so the builder's terms are worth nothing and do nothing.

```
valueOfItem({pact:true}): 0
valueOfItem({openBorders:true}): 0
valueOfItem({promise:{kind:'openBorders'}}) — the schema the engine reads: 2.9
offering a pact + open borders for nothing: {"ok":true,"accepted":true}
>> pact formed: false | open borders: false
```

The AI cheerfully accepts "I offer you an alliance and open borders, for
nothing" because both items are worth zero to it, and then no alliance and
no open borders exist. **Custom Deal is a scrap-for-scrap trader wearing a
treaty interface.**

### 1.4 Demand Tribute always demands zero

The drawer sends `{faction, give: [], get: [...]}`. The verb reads
`params.terms`, and falls back to `amount: params.amount || 0`.

```
after the UI-shaped call, demander holds: 0 scrap
after an engine-shaped call (terms:), demander holds: 15 scrap
```

The player sets an amount, the target caves, and nothing changes hands. A
one-line parameter-name mismatch that silently voids the whole verb.

### 1.5 A per-turn flow is priced at three turns and paid forever

`valueOfItem` prices `flow` at `amountPerTurn * 3`. No agreement carries a
duration and nothing ever expires a `deal-promise`.

```
goldgrass values 4/turn forever at: 0 | accepts: true
>> paid 12 once, collected 80 over 20 rounds; agreement still live: true
```

Pay 12 scrap once, receive 4/turn until the end of the game. This is an
unbounded money printer against every AI, and it scales — nothing stops you
running it with all three.

### 1.6 The AI can impose a pact on you

`ai.js manageDiplomacy` calls `formPact()` directly, with no check that the
other party is the human and no offer.

```
>> pacted with the human after its turn: true — no offer, no prompt, no refusal possible
```

You wake up allied. You did not agree, you were not asked, and you now carry
a pact's obligations (pact calls, the Honor hit for breaking it). This is the
mirror of 1.1 pointed at the player.

### 1.7 Declare War's Menace cost is fiction

The confirm dialog says *"Menace rises immediately."* `declareWar()` never
calls `adjustMenace` — Menace comes only from `onAttack`. Declaring is free;
only fighting costs. That may well be the right rule (it makes the
declaration a warning rather than a crime), but the copy should say so.

---

## 2. Why it doesn't feel real

The bugs above are a day's work. This section is the actual answer to your
question, and it is all one thing: **there is no round trip.**

### 2.1 Every verb is a vending machine

Click → instant, final, unilateral resolution. Nothing is ever *pending*.
There is no state in which you have made an offer and are waiting. No
counter-offer, no haggling, no "not for that, but for this". The engine has
a full deal-valuation model (`dealValue`, `wouldAccept`) and it is used only
as a turnstile: yes or no, once, forever.

The single richest thing you could add to this layer is a **pending-offer
queue with counter-offers** — the machinery is 80% there.

### 2.2 The UI tells you the answer before you ask

`engineAdapter` runs `aiAcceptsPact()` / `aiAcceptsVassalage()` to render
outcome hints — *"Will likely accept."*, *"They will accept submission."*
There is no risk in proposing, so there is no decision in proposing. You are
not negotiating, you are reading a solution and confirming it.

This is also a missed hook: the Intelligence path already gates *exact*
Tolerance and Trust numbers behind Spy Ring. Acceptance predictions should
work the same way — a vague read by default (*"they seem open to it"*), a
wrong read when you are misinformed, and a precise one only with espionage.
That gives the Intelligence branch a diplomatic payoff it currently lacks.

### 2.3 The AI never approaches you

```
>> 30 rounds of AI turns, AI-originated approaches to the human: (none)
```

`manageDiplomacy` explicitly skips the human for vassalage (`if (f === human)
continue`) and for gifts (`&& f !== human`). It never proposes a deal, never
demands tribute of you, never denounces you, never sues you for peace, never
offers to buy you off. The only two AI→human channels in the whole layer are
**pact calls** (only if you are already allied) and **precursor warnings**
(a one-way notice).

So diplomacy is something you do *to* a world that never does anything back.
The one exception is 1.6, where it acts on you without asking — exactly the
wrong half to have implemented.

### 2.4 Nothing costs anything to attempt

No proposal cost, no cooldown, no patience budget, no reputation cost for
being refused, no memory of pestering. You can propose the same deal thirty
times in one turn. Actions without downside are not decisions.

### 2.5 Agreements are permanent and unconditional

There are no durations, no renewal, no renegotiation, no termination clause.
A trading pact, an open-borders grant, a flow — once made, made forever (or
until someone attacks). Nothing ages, so nothing has to be *maintained*, so
no relationship ever needs tending.

### 2.6 Promises are mostly decorative

Six promise kinds are valued (`peace`, `nonAggression`, `openBorders`,
`joinWar`, `dontAlly`, `tribute`). Exactly two are enforced —
`breakPromiseIfAny(…, ["nonAggression", "peace"])` on attack. `joinWar`,
`dontAlly`, `openBorders` and `tribute` can be sold, priced and paid for, and
then simply do not bind anyone.

### 2.7 The valuation engine has no personality

```js
dealValue = Σ(get) − Σ(give) + standing × relationshipBiasPerStanding
```

A linear sum, identical for every faction. The temperament dials (`grudge`,
`trust`, `sociability`, `victoryLean`, `expansion`) gate *whether* a faction
will talk, but barely touch *what it pays*. A pacifist coalition and a
0.9-aggression warlord value 10 scrap identically, value peace identically,
and value a non-aggression pact within 1.5 points of each other. Four
factions with four written personalities haggle like one spreadsheet.

### 2.8 Everything is public, so nothing is a secret worth keeping

Standing, Menace, Honor, wars, pacts, vassalage — all fully visible to
everyone (Spy Ring only reveals exact tolerance *numbers* and rival tech).
There are no secret deals, no deniability, no leaks, no way to be caught
doing something. Betrayal is mechanically identical whether the board is
watching or not, which removes most of what makes betrayal interesting.

### 2.9 The relationship has no narrative

Standing is a number that drifts back to a baseline. The engine *does* keep
grievances, trespass records, denouncements, rebellion cooldowns and pact
tenure — real memory — but none of it is ever shown to the player as a
history. There is no "they have not forgotten Omara". The drawer shows a
tier and a one-line temperament blurb; the actual accumulated relationship
is invisible.

---

## 3. Proposed upgrades, in the order I'd do them

### Tier 1 — fix what's broken (small, contained, no design risk)

1. **Make Peace routes through consent.** Delete the unguarded verb and let
   the button open the sue-for-peace pane, or keep it as a bare ceasefire
   offer that runs `aiAcceptsPeace()` and can be refused. Either way, refusal
   must be possible.
2. **Charge Denounce.** The Honor cost the UI already promises, plus a
   per-target cooldown so a permanent just-war window has to be re-earned.
3. **One deal-item schema.** Make the drawer emit `{promise:{kind}}`, and
   make `applyDeal` actually form the pact / open the borders when one is
   struck. This alone turns Custom Deal into the real treaty table.
4. **`terms` vs `get` in Demand Tribute.** One-line fix.
5. **Duration on flows.** A `flow` carries `rounds`; `valueOfItem` prices it
   at `amountPerTurn × rounds`; `runFlows` expires it. Kills the money
   printer and makes term length a negotiable lever.
6. **The AI proposes a pact instead of forming one.** Route it into the same
   pending-offer inbox that already carries pact calls.
7. **Fix the Declare War copy** (or add the Menace charge, whichever you
   intend).

### Tier 2 — the round trip (this is the one that changes the feel)

8. **Pending offers.** An offer becomes an object with a proposer, terms, and
   an expiry, sitting in both sides' inboxes until answered. The pact-call
   inbox and the Envoy modal are both already this shape — generalise them.
9. **Counter-offers.** When the AI refuses, it returns the nearest deal it
   *would* take (`dealValue` already gives you the gap — walk it). "Not for
   8. For 14, or for 8 and passage through the Shelf." That single change
   converts every refusal from a wall into a conversation.
10. **A cost to asking.** Proposals cost a small Standing tick when refused,
    or a per-round diplomatic-attention budget. Make asking a choice.

### Tier 3 — texture

11. **Personality in the price.** Route `grudge`, `trust` and `victoryLean`
    into `dealValue`, not just the gates: a grudge-holder prices peace with
    its betrayer at a premium; a trader discounts flows; a warlord values
    `joinWar` promises far above scrap.
12. **Fuzzy acceptance reads.** Replace the certain "Will likely accept" with
    a confidence band that tightens with Intelligence tech and can be wrong.
13. **Term-limited treaties.** Everything renewable: trading pacts, open
    borders, rail access. Expiry creates recurring diplomatic events for free
    and gives the layer a heartbeat.
14. **Enforce the four dead promise kinds** — or drop them from the schema so
    they can't be sold.
15. **Secret deals and leaks.** A deal can be public or private; private ones
    carry a leak chance scaled by the other party's Honor and by rival
    Intelligence tech. Being *caught* is what makes betrayal a gamble.
16. **A relationship dossier.** Surface the memory the engine already keeps —
    grievances, trespasses, broken pacts, tenure — as a readable history on
    the faction detail page. Cheapest possible route to "this feels like a
    relationship", because the data already exists and is simply never shown.

### Dependencies worth knowing

Tier 1 is independent and can land now. Tier 2 items 8–9 want the AI
overhaul's evaluation core to be nearby but do not need it — `dealValue` is
sufficient to generate counter-offers today. Tier 3 item 11 is genuinely
part of the AI overhaul and should wait for it. Item 16 needs no engine work
at all and would be a good companion to the content pass.
