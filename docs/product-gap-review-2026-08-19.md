# Product gap review — 2026-08-19

A pass over systems as built, systems as designed-but-unbuilt, and the art/UI
as it actually renders. Grounded by running the thing: `node src/game/harness.js`
(**503/503 pass**), `npm run build` (clean, 833 kB bundle), and a Playwright
session driving the real app at 1440×900 and 390×844 — title → setup → board →
every radial panel → 7 rounds of play with AI turns.

This is a gap list, not a plan. Nothing here is a criticism of what's built:
the engine is genuinely finished. Everything below is what sits between
"the systems work" and "this is a product someone finishes and remembers".

---

## 1. The headline

**The engine is done. The game around it is not.**

Every mechanical system in the spec (§15–§20) plus the newer rail/blockade/
listening-post/economy-ledger work is implemented, harness-covered, and
reachable from the UI. What's missing is almost entirely the layer a *player*
touches: content in the containers, words on the events, art in the frames,
and the ordinary shell a finished game has (save, sound, difficulty, a first
five minutes that teaches).

Ranked by how much each one costs the finished feel, worst first:

1. Empty content containers shipped as visible features (Lore, quests, world
   encounters)
2. Raw engine identifiers leaking into player-facing text
3. No product shell — no save/load, no audio, no difficulty, no onboarding
4. Art placeholders in the highest-traffic surfaces
5. First-impression bugs (camera, legibility, clipping)
6. The AI overhaul, still the last real engineering item

---

## 2. Content — containers exist, contents don't

| Container | Built | Authored | Player-visible when empty? |
|---|---|---|---|
| `WIKI_ENTRIES` (Lore Archive) | ✅ full browser w/ search, categories, reader | **0** | **Yes — front-page menu item** |
| `QUESTS` | ✅ full graph engine | **0** | No |
| `WORLD_ENCOUNTERS` | ✅ ambient trigger system | **0** | No |
| `FIELD_ENCOUNTERS` | ✅ | **12** | Yes |
| `LOCATIONS` | ✅ | 19 | Yes |
| `CHIPS` | ✅ | 41 | Yes |
| `ABILITIES` | ✅ | 10 | Yes |
| `REACTIVES` | ✅ | 5 | Yes |

Three specifics:

- **The Lore Archive is the second item on the main menu and it is empty.**
  It renders "NO LORE ENTRIES YET — Entries are authored in the Encounter
  Builder", i.e. it explains the team's tooling to the player. Either author
  entries or hide the menu item until there are some. Right now the first
  thing a curious player clicks tells them the game is unfinished.
- **12 field encounters, not 115.** `docs/v0.3-roadmap.md` claims "115
  entries"; the exported module has twelve. At 12, a single medium-map
  session will exhaust and repeat the deck. This is the single biggest
  content lever on how varied a session feels.
- **Every encounter has authored `art:` prompt text and zero images.** All 12
  carry a written art brief ("A patch of disturbed earth between two rocks on
  a low ridge…"). The modal renders a `NO SIGNAL / CAM_01 / ●REC` plate
  instead. The in-fiction placeholder is a nice touch, but it is on 100% of
  encounters — the briefs are written, the generation pass hasn't been run.

Also stale: `content/*.csv` no longer matches the live game (`factions.csv`
lists 4 factions and gives Versari `#3a7d44` green; the game runs 4 majors +
4 minors and draws Versari red). The README already says the CSVs are
superseded — they should be deleted or regenerated, because right now they
are a trap for anyone who reads them as source.

---

## 3. Raw engine identifiers leaking to the player

**58 of the engine's 121 event types have no formatter in `EventFeed.jsx`**
and fall through to `default: return { text: ev.name }` — the raw snake_case
id. Observed live in round 7 of an ordinary game, in the visible feed:

```
peace_made
honor_changed
mediated
vassal_rebelled
war_declared
tribute_paid
diplomatic_warning
```

The unformatted set includes essentially the whole diplomacy layer plus
`faction_eliminated`, `coalition_formed`, `unit_spotted`, `pact_broken`,
`surprise_attack_honor_lost`, `blockade_paid`, `post_revealed`. So the game's
deepest system — the one with 1,830 lines of engine and a 1,889-line drawer —
narrates itself to the player as debug output.

`gameLogExport.js` already has ~85 careful formatters with correct field
names. The fix is mostly harvesting them into the live feed.

Two smaller leaks in the same family:

- The Economy ledger lists a unit's position as `h2-0` — a raw hex id.
- Turn income reads `Versari +5 resource (output)`. The currency is called
  Scrap everywhere else in the game.
- Every unit is named **"Versari Korad unit"**. `content/unit-names.csv`
  exists with a name table and is not wired to anything.
- Round 1's feed opens with **twelve consecutive** `X standing w/ Y → -3`
  lines — the diplomacy matrix initialising. The first thing a new player
  ever reads is a dump of pairwise integers between factions they haven't met.

---

## 4. The product shell is missing

These are the things a player expects from a finished game and would not
think to ask for.

- **No save/load, and no continue.** `TitleScreen` renders Continue and Load
  Game permanently greyed out because `App.jsx` passes no handlers — the
  comment says "no backing systems yet". Games run 16–42 rounds AI-vs-AI;
  a human game is longer. There is currently no way to stop playing and come
  back. This is the single largest missing feature in the product.
- **No audio at all.** Zero `Audio`, `.mp3`, `.ogg` or mixer code anywhere in
  `src/`. No music, no UI clicks, no dice, no contest impact. A strategy game
  with dice rolls and sieges playing in total silence reads as a prototype no
  matter how good the art gets.
- **No difficulty setting.** Setup exposes map size, settlement density,
  faction count, victory conditions, encounter frequency, minor-faction
  spawn and fog — but nothing about the AI. Factions have aggression dials
  internally; nothing surfaces them.
- **No onboarding of any kind.** No tutorial, no first-run hints, no rules
  reference in game (the `WikiModal` that would serve as one is empty, §2).
  The mechanical spec is 20 sections; a player arrives at a hex board with a
  control meter, a loyalty pie, a tech wheel, ZoC, fog, standing, menace,
  honor and recognition and is told none of it.
- **No settings from the title screen** — the item is greyed out; settings
  only exist once you are inside a match.
- **The end screen is a box.** It says "Victory / <faction name>" and lists
  VP, with no defeat framing (you lose to the same screen that says
  "Victory"), no statement of *how* it was won (conquest? recognition?
  elimination?), no run summary, no art. The one moment the game has the
  player's full attention is the least designed screen in it.

---

## 5. Art — where it stands and what's missing

**Strong, and further along than the README's "Art assets — faction emblems,
terrain tiles, icons" checkbox suggests.** What exists:

- **Unit sprites**: a real pipeline. 3 model tiers × 4 factions, 8-direction
  10-frame animated sheets with masks, anchors and a validating build step
  (`scripts/build-units.mjs`), promoted by installed movement chips.
- **Hex tiles**: 16 painted masters → base/core/holo triplets, with a
  holographic tint system and LOD.
- **Faction portraits**: leader + diplomacy portraits for all four majors.
  The envoy portrait art is excellent.
- **Art direction is documented and anchored**: `concept/style/` plus 30+
  approved anchor images.

The gaps:

- **Title splash — a dashed box reading "TITLE SPLASH — ART PENDING".** This
  is the literal first frame of the game.
- **Location art — none.** `public/assets/locations/` holds only `.gitkeep`.
  The Location window (the most-clicked surface in the game) has a stat
  block and no image of the place.
- **Encounter art — none** (§2), on the modal that is the game's main
  storytelling surface.
- **Unit cards carry no unit art.** The sprite sheets exist and render on the
  board; the UNITS window draws flat coloured rectangles.
- **No faction emblems.** `assets/ui/logos/factions/` is empty; factions are
  identified by a coloured dot everywhere except the setup screen.
- **Icons are generic line art.** The radial menu's flask/sword/crate/
  handshake are competent but off-world — they don't read as Ashland. Also
  a sword icon currently labels "CHIP SLOTS" in the Location window.
- **Two visual languages.** Everything is holographic-HUD (cyan, brackets,
  scanlines, Oswald caps) — except the Envoy modal, which is a painterly
  card with square corners, solid green/red buttons and body serif-ish prose.
  The envoy screen is the best-looking thing in the game and it does not
  belong to the same game as the screen behind it. That's a direction call
  worth making deliberately in one direction or the other.

---

## 6. UI/UX gaps and bugs found while playing

Verified live, not read off the code.

**First-impression class (fix these first — they hit every single session):**

1. **The camera never centres on you.** `BoardViewport.fitToView()` fits the
   *whole map* on mount. With fog on, your two hexes end up in a corner of a
   screen that is otherwise 85% unexplored darkness. On phone it is worse —
   your territory is a thumbnail at the left edge with 80% of the screen
   empty. A `cameraTarget` pan already exists (the AI replay uses it); point
   it at the player's capital on game start.
2. **Unexplored fog draws full hex outlines.** The result is a large, evenly
   lit empty grid rather than an unknown. Fog reads as "nothing here", not
   "you can't see yet".
3. **"ROUND 1" in the top bar is illegible** — 8.5px, `textFaint`, over a
   faction-coloured gradient divider. It is unreadable in every screenshot
   taken at every width.

**Layout / clipping:**

4. **"MOVEMENT" is clipped** on unit cards in the UNITS window (renders as
   `MOVEMEN`), both cards, desktop width.
5. **Setup screen: the selected faction card's tagline collides with its
   SELECTED badge** ("GARRISON-ORIENTED" runs under the badge).
6. **Two orphan gold corner brackets float over the board.** They're the
   board frame's `pc-bracket` decorations, but they live on the *content*
   layer that pans and zooms, so two corners drift on-screen and the other
   two are off it. They should be on the viewport frame.
7. **The End Turn button overlaps the Event Log panel** at 1440 wide.

**Legibility / information:**

8. **The Tech Wheel labels its 16 branch nodes `A1 A2 B1 B2`.** Real names
   ("Vanguard", "Killing Blow", "Field Hospital", "Saboteurs"…) and full
   tooltip text exist in `tech.js` and `nodeName()` resolves them correctly —
   the renderer just prints `seg.id.slice(-2)`. The game's entire
   progression screen currently reads as unlabelled placeholders.
9. **The Location window shows no flavour text, no abilities, no chip slots
   as slots** — a 19-location roster with authored flavour prose, none of it
   surfaced. And no art (§5).
10. **Escape does not close the confirm dialogs** (it closes the panel
    windows, so the inconsistency is learnable-the-hard-way).
11. **The action budget is still a single aggregate dial** (`3/3 ACTIONS`)
    even though per-entity actions shipped. Per `vp-and-actions-design.md`
    §4 the HUD is meant to show per-entity pips. Today a player cannot see
    *which* unit or location still has an action without clicking each one —
    the confirm dialog on End Turn ("2 units and 1 location still have an
    action") is doing the job the HUD should.

**Still deferred from earlier passes (unchanged, flagging as still open):**

12. `SalvageModal`'s chip pickup uses HTML5 drag-and-drop — **non-functional
    on iOS touch**. Post-kill salvage cannot be done on an iPad.
13. `DiplomacyDrawer`'s inner panes (deal builder, tribute, peace) have
    overflow-safety caps but no real phone layout.

---

## 7. Systems designed but not built

Read across the design docs, the built column is much longer than the unbuilt
one. What's actually outstanding:

| Item | Where | State |
|---|---|---|
| **AI overhaul against the per-entity model** | `vp-and-actions-design.md` §3 item 6, `ai-overhaul-plan.md` | **The last real engineering item.** Per-entity actions shipped as "Stage A — interim AI"; the AI still loops over an aggregate budget instead of running per-asset policies. |
| Chip/build scoring → generic effect→value table | `v0.3-roadmap.md` §1 | Open. Movement/influence/vision/detection/loyalty-rate chips score 0 in `pickBuild`, so new chip content is invisible to the AI. |
| Deliberate tuning-table pass | `v0.3-roadmap.md` | Never done. Every constant in `config.js` is an engineering default. |
| VP threshold recalibration per map size | `vp-and-actions-design.md` §10.2 | Deferred by design call. **Total board VP is 10 on small against a threshold of 12 — a small board cannot be won by conquest at all.** That is a shipped, reachable dead end in the setup screen. |
| Rail per-hex movement cost | `rail-road-blockade-design.md` open questions | The one number nobody has ruled on. |
| Which settlement pairs get rail / whether holding both endpoints is right | same | Open. Also: rail is a spanning tree over *capitals* and you start holding one, so **production pooling is unreachable until you capture a second capital** — a built feature no player will see in a normal game. |
| Treaty types (protection contract, non-aggression, territorial) | `vp-and-actions-design.md` §5 | Explicitly deferred. |
| Blockade upgrade chips (+defense, +vision, Toll Booth) | `rail-road-blockade-design.md` §3.2 | Toll Booth is priced; the chip set is content work. |

Known behavioural debts worth a look, from the playtest findings:

- **AI aggression 0.9 never learns** — took the −8 Honor surprise-attack
  penalty six times in one session and finished last.
- **AI at war never techs** — three factions ended a 15-round session with an
  empty wheel.
- **Post-self-contest-fix the AI is more stalemate-prone** (seed 42 now
  4-way deadlocks) — it doesn't prioritise consolidating a partially-lost
  location over opening a new front.

---

## 8. Housekeeping

- **`npm run shots` is broken.** Every shot but one fails — the harness
  predates the title screen and goes straight to the setup screen. The
  project's own visual feedback loop doesn't run.
- **`docs/v0.3-roadmap.md` is out of date.** It doesn't mention rail,
  blockades, listening posts, the economy ledger, per-entity actions, the
  held-VP rework or the board sliders, and it states the field-encounter
  count as 115 (it's 12).
- The bundle is a single 833 kB chunk. Not urgent, but it's the first thing
  a player on a phone waits for.

---

## 9. If it were mine to sequence

**Cheap, high-visibility, no design risk — do first:**
event-feed formatters (§3) · tech node names (§6.8) · camera-on-capital
(§6.1) · round-label contrast (§6.3) · MOVEMENT clip (§6.4) · faction-card
badge collision (§6.5) · board brackets (§6.6) · unit names from
`unit-names.csv` (§3) · hide or fill the Lore menu item (§2) · fix
`npm run shots` (§8).

**The product shell — the difference between prototype and game:**
save/load + continue · an audio pass · a real end-of-game screen · a
difficulty setting · a first-session onboarding path.

**Content volume — most hours, least risk, parallelisable:**
field encounters 12 → 60+ · the first quest chains · world encounters ·
lore entries · location flavour surfaced in the Location window.

**Art — the four placeholders players actually stare at:**
title splash · location images · encounter images · faction emblems. Plus
one decision: does the game look like the holo HUD or like the envoy card?

**Engineering — one item:**
the AI overhaul against the per-entity model, with the chip effect→value
table folded in.

**Design calls someone has to make:**
VP threshold per map size (small is unwinnable by conquest) · rail per-hex
cost · whether pooling should be reachable before a second capital.
