# Diplomacy — playtest findings and a documentation warning

Written 2026-08-23, as input to a forthcoming brief on diplomacy changes.

Two halves, and the second may matter more than the first:

1. **§1–2** — what the 2026-08-23 playtest actually showed, with the code
   paths that cause it. Evidence, not impressions.
2. **§3** — **where the repo's own documentation will mislead you.** Several
   diplomacy documents describe a game that no longer exists. Read §3 before
   trusting anything in `mechanical-spec-v0.1.md` §18.

Source log: `ashland-conquest-log-2026-08-23T13:48:45.589Z`, 7 rounds, 6
factions (4 majors + Clan Tempest and The Steel Traders as minors), human on
Versari Korad.

---

## 1. What the playtest showed

The player's report was: *alliance offers arrive unearned, wars are declared
almost immediately, the AI moves too fast, and nothing seems to have a motive
behind it.* All four hold up. Three have a specific, single cause.

### 1.1 Alliance offers are unearned — and the bar is human-specific

There are two different gates for forming a pact, and the one aimed at the
human is far looser:

| Path | Standing required |
|---|---|
| AI ↔ AI (`ai.js` `manageDiplomacy`, branch 3) | **≥ 6 both ways** (`CONFIG.diplomacy.pactStandingReq`) |
| AI → human (`ai.js` `proposeToHuman`, first branch) | **≥ −1** (`CONFIG.diplomacy.tiers.neutral`) |

`tiers.neutral` is `-1` — the *floor of the Neutral band*, not "a neutral
relationship". So the courtship branch fires for anyone who is not actively
Wary, and attaches a scrap sweetener to the offer.

Observed: Goldgrass tabled a pact at **event #80 — its first turn, Standing
0**. There is no seeded standing toward the human at all (the seed writes
goldgrass→lakers, goldgrass→plainers and so on; nothing toward versari), and
the two factions had not interacted. The re-roll is
`aiProposeChance (0.35) × (0.4 + sociability)` per turn — ~47% for Goldgrass,
so it lands almost immediately and retries every turn until it does.

**Note for the brief:** this is not an old bug. It is the direct result of
fixing finding 7 of `diplomacy-audit-2026-08-19.md` ("The AI never proposes
anything to the human" — previously zero approaches in 30 rounds). The fix
overshot. Whatever replaces it should keep the AI approaching and make the
approach mean something.

### 1.2 "Wars declared immediately" is not a diplomacy decision

The round-1 Lakers–Tempest war was a *consequence of an attack*:

```
#98  Grand Lakers declares a raid contest
#102 Grand Lakers lost 8 Honor for a surprise attack (no declared war)
#105 Grand Lakers standing toward Clan Tempest → -6 (Δset, cause: attack)
#107 Grand Lakers declared WAR on Clan Tempest
```

The war followed the raid. `wouldFight` (`ai.js`) — the gate on that raid —
checks pacts, existing war, truce, standing and aggression. It does **not**
price the 8 Honor, the recorded grievance, or the standing collapse. So a
warlord surprise-attacks a neutral on turn one and pays a reputation cost it
never weighed.

This is the same shape as a contest bug fixed on 2026-08-22: the AI now
prices *military* force correctly (`planContest`), but the *diplomatic* price
of attacking remains invisible to it.

### 1.3 The pace, measured

**27 diplomatic acts across 36 AI turns** — roughly three turns in four, per
faction. **10 of the 27 are denouncements**, the cheapest verb available
(gated only by a warrant and a cooldown).

Cause: `manageDiplomacy` walks a priority list and returns on the first branch
that fires. There is no "nothing worth doing this turn" exit, and with five
branches plus a fallback something almost always fires.

### 1.4 "No motives" — coalitions, and this is the structural one

`recomputeCoalitions` (`diplomacy.js`) runs every round. When a faction's
threat score crosses the threshold it **conscripts every eligible faction
automatically**:

```js
for (const m of members) {
  adjustStanding(state, m, pid, -c.standingHit, "coalition");
  declareWar(state, m, pid, "coalition");   // nobody is asked
}
```

No member weighs it. Temperament, standing, history, existing agreements —
none consulted. And:

```
threatScore = wM(1) × Menace + wP(2) × max(0, powerLead)
```

**Goldgrass's Menace never moved once all game — zero events.** It is the
pacifist (aggression 0.1). It had two wars declared on it in R7 purely for
leading on power.

What that does to a friendly relationship, from the log:

```
The Steel Traders standing toward Goldgrass →  1   (Δ-4, cause: coalition)   from +5
The Steel Traders standing toward Goldgrass → -6   (Δset, cause: coalition)  ← declareWar overwrites
The Steel Traders declared WAR on Goldgrass Coalition
```

+5 to at-war in one step, no deliberation. And the whiplash the player felt:
**Grand Lakers stood beside Goldgrass in the R6 coalition against Free
Plainers, then declared war on Goldgrass in R7.** Both automatic.

---

## 2. Where the levers are

Constants: `CONFIG.diplomacy` in `src/game/config.js` (from line 425).
Logic: `src/game/diplomacy.js` (verbs, coalitions, standing) and
`src/game/ai.js` (`manageDiplomacy`, `proposeToHuman`, `wouldFight`).

Relevant values as they stand today:

| Constant | Value |
|---|---|
| `tiers` | `hostile -6, wary -3, neutral -1, friendly 5, allied 8` |
| `pactStandingReq` | 6 |
| `offers.aiProposeChance` | 0.35 |
| `offers.freeAsksPerRound` | 2 |
| `coalition` | `wM 1, wP 2, threshold 16, dissolve 11, standingHit 4, minRounds 4, reformCooldownRounds 5` |

**`scripts/audit-diplomacy.mjs` is current and runs clean.** It reproduces
eight named behaviours against a live engine rather than describing them. Run
it before and after any change — it is the best regression net this layer has.

---

## 3. Documentation shortcomings — read this before trusting the docs

The brief will be drafted by reading the repo. Several diplomacy documents
describe mechanics that have been replaced, and one describes the whole layer
as unbuilt. Each of these would send a brief in the wrong direction.

### 3.1 `mechanical-spec-v0.1.md` §18.10 describes a retired victory condition

§18.10 presents **Recognition** (Allied = 1, Vassal = 2, cross a threshold)
as *the* diplomacy victory, and states "**Conquest (VP 12) remains** the
parallel, always-available path".

**Both were removed on 2026-08-21.** `victory-redesign-2026-08-21.md` replaced
the VP threshold, weighted Recognition and last-standing with a single
condition: *every surviving faction is your ally, your vassal, or gone, held
for three rounds*. That document records that across 20 AI-only games the VP
threshold ended all twenty and Recognition never fired once.

The spec file was itself last modified 2026-08-21 — so it was edited on the
same day and §18.10 was left describing the retired design. It carries no
superseded marker. **A brief that optimises the diplomacy layer toward
"Recognition" is optimising toward something that no longer decides a game.**

§18.8's closing paragraph inherits the error, telling a diplomacy player that
"sprinting toward Recognition makes you threatening… This is the diplomacy
victory's built-in tension (§18.10)".

### 3.2 The code still says "Recognition" everywhere and means "Dominion"

Worse for anyone grepping rather than reading:

- `checkRecognitionVictory()` is now a one-line alias for `checkDominion()`.
- `recognitionScore()` and `recognitionMet()` still exist and are exported.
- `CONFIG.diplomacy.recognition = { alliedWeight: 1, vassalWeight: 2,
  threshold: 6, summitVp: 1 }` is still present, with a comment block
  explaining the retired rule as if live.
- The UI field is still named `recognition`, but is populated from
  `dominionStanding`.
- **`dsl.js` exposes `score: recognition` to authored content**, so a quest
  gate can still be written against a vestigial track.

All of it reads as live. None of it decides anything. Renaming this is
arguably the single highest-value cleanup before a brief is written, because
every subsequent reader will hit it.

### 3.3 §18 declares its own numbers TBD, and does not say where they live

§18's header states: "**Numeric values throughout are deliberately left as
TBD** — the tables get filled and tuned in a later pass; this section fixes
the *model*, not the constants." §18.8 likewise gives the coalition formula
as `wM·Menace + wP·powerLead` *(weights TBD)*, and §18.13 is titled "Open
questions / tables to fill".

Those tables **have** been filled — `CONFIG.diplomacy` holds **146 numeric
constants**, many with playtest rationale in the comments beside them — but no
document points at them. A brief author reading §18 end to end will conclude
the layer is unparameterised and may propose numbers for things that already
have tuned values and a history behind them.

### 3.4 §18.12 is titled "design only, not yet built" — it is built

The heading reads: *"### 18.12 Engine mapping (for implementers — design
only, not yet built)"*. The entire layer has shipped: standing baselines,
grudges, Menace, Honor, just war, coalitions, vassalage, trading pacts, war
exhaustion, ultimatums, offers with expiry. A reader taking the heading at
face value would think they were writing a greenfield brief.

### 3.5 §18.8 describes coalition behaviour that was deliberately changed

The spec says coalition members are "pushed to war the player and to ally
**each other**". The engine explicitly does **not** do the second half —
`diplomacy.js` comments it as *"members bury their quarrels for the duration
— no pacts minted"*, a change made after the 2026-08-13 playtest because
force-pacting the bloc minted free summit VP and left a permanent alliance
web behind. The reasoning exists only as a code comment; the spec still
states the old rule.

The same comment says *"a coalition must never CONSCRIPT"* — but the code
only spares the **human**. Every AI member is still conscripted with an
unasked `declareWar`. The principle in the comment and the behaviour in the
function do not match, and the mismatch is the direct cause of §1.4.

### 3.6 §18.8's "faction wants" is a caption, not a model

§18.8 promises: *"Each faction exposes, from its Temperament/goals, what it
values… The diplomacy screen surfaces these as hints so courtship is
legible, not guesswork."*

What exists is `factionWants(def)` in `engineAdapter.js` — a six-case switch
on `temperament` returning a fixed English string ("joint wars & targets",
"intel, leverage, useful allies"). It is display copy. Nothing reads it, no
goal derives from it, and it does not vary with the board, the faction's
position, or its relationship to the viewer.

That is fine as a caption, and it is genuinely useful to a player. But a
brief must not treat "factions expose what they value" as an existing
foundation to build negotiation on — the model behind the sentence was never
built. Note also that `choicePolicy.js` (added 2026-08-22) *does* derive real
per-temperament weights for encounter choices; if faction-legible motives are
wanted, that is the closer precedent.

### 3.7 What the docs are good for

Not everything is stale, and the brief should lean on these:

- **`diplomacy-audit-2026-08-19.md`** — well maintained, carries an explicit
  status header saying which tiers shipped, and keeps its findings in the
  past tense as a record rather than a to-do. Its §3 tier 3 is still open and
  is legitimate input.
- **`victory-redesign-2026-08-21.md`** — current, and the authority on the
  win condition. Where it conflicts with §18.10, it wins.
- **`scripts/audit-diplomacy.mjs`** — runnable, current, grounded in a live
  engine.
- **`CONFIG.diplomacy`** — the real numbers, with playtest rationale in the
  comments. Treat it as the source of truth over §18's TBDs.

### 3.8 Suggested reading order for the brief author

1. `victory-redesign-2026-08-21.md` — what winning means now.
2. `docs/diplomacy-audit-2026-08-19.md` — what was broken and what shipped.
3. Run `node scripts/audit-diplomacy.mjs` — what the engine does today.
4. `CONFIG.diplomacy` in `src/game/config.js` — the tuned constants.
5. `mechanical-spec-v0.1.md` §18 — **for the model only**, with §18.10,
   §18.12 and the TBD claims treated as out of date per §3 above.

---

## 4. Open design questions this raises

Not recommendations — the decisions a brief would have to make.

1. **Should being courted mean something?** Raising the courtship floor from
   −1 toward Friendly is one line, but it partly undoes audit finding 7. What
   should the AI do with a faction it likes but cannot yet ally?
2. **Should a coalition be chosen or triggered?** Today it is a threshold
   crossing that conscripts. Deliberation per member would make it legible,
   at the cost of the anti-snowball guarantee.
3. **Should a coalition punish conduct or position?** With `wP: 2` and Menace
   at 0, a clean leader is indistinguishable from a tyrant. §18.8 argues the
   power half is intentional; the playtest shows what it feels like from the
   receiving end.
4. **Should a war declaration overwrite standing?** Setting a +5 relationship
   to −6 in one step is what makes the board read as motiveless.
5. **Should the AI be able to do nothing?** A cadence, or a "nothing worth
   doing" threshold, would make each act read as deliberate.
6. **Should attacking carry a diplomatic price the AI can see?** `wouldFight`
   currently cannot see the Honor cost it is about to pay.
