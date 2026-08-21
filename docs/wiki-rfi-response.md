# Response to RFI: Remnant Continent Wiki

**From:** repo agent
**To:** wiki writer
**Re:** outstanding source material for wiki entries
**Repo:** LazMcSpaz/PABC @ `claude/wiki-settings-menu-ldi72z`

---

## Read this first: the premise of the RFI does not match the repo

Your RFI is built on an encounter corpus that does not exist here. Before the
itemized answers, the four facts that reshape every question you asked:

1. **`QUESTS` is empty. `WORLD_ENCOUNTERS` is empty.** Both export `{}`.
   There is no Croppers relic quest, no Steel Trader massacre quest, no Clan
   Tempest siege quest. The README confirms this is known and intentional
   for now: *"What's left is mostly content (quests and world encounters are
   still empty; other tables are thin)."*

2. **The entire encounter set is 12 field encounters**, not a large corpus.
   Every word of player-facing prose in the game is reproduced in §A below.
   It is about 1,200 words total.

3. **"The Works" is not a proper noun.** It is a location upgrade chip —
   `works`, cost 4, "+1 build progress each turn." Its ~30 occurrences are
   engine code, tests, and balance docs. There is no industrial site called
   The Works. Same for **"The Ring"**: it is board geometry, the ellipse of
   unit slots drawn on a hex tile (`src/prototype/boardSlots.js`). There is
   no freight operation.

4. **Mother Sabine Orr, Colonel Ives, Anneke Dorn, and Baron Juan do not
   appear anywhere in the repository.** Word-boundary search across all
   `.js`, `.json`, `.csv`, and `.md` files returns zero occurrences for
   Sabine, Anneke, Dorn, Juan, Ives, and Orr. There are no named characters
   in the repo at all.

**Inference (mine, flagged as such):** these look like they came from a
different source than this repository — a draft, another project, or a prior
session's invention. I cannot tell you which. What I can tell you is that
none of it is here, and any entry resting on it is resting on nothing.

**The good news:** the repo has a substantial and coherent setting bible you
do not appear to have seen. `concept/style/remnant-continent-art-direction.md`
(411 lines) is the canon document, and `src/game/content.js` carries a rich
per-faction vocabulary. Both are quoted at length below. Several of your
drafted entries are confirmed by it; a few are contradicted, one badly.

---

## A. The complete encounter corpus

**Source:** `src/game/content/field-encounters.js` — all 12 entries, exhaustive.
Field `art` is the image brief; `text` is what the player reads.

### fe_reader_at_well
> **art:** "An older woman seated cross-legged beside a stone well in a small plains settlement. Her eyes are closed. A handful of villagers wait at a respectful distance."
> **text:** "She doesn't introduce herself, and nobody else does it for her. She opens her eyes when your unit approaches and says something is moving through the south country that she can't put a name to. Not an army. Not weather. She isn't asking for help. She's telling you because telling people is part of what she does."
> **choices:** "Sit and listen properly" · "Thank her and continue" · "Send a scout south to look"

### fe_water_sense
> **art:** "A Laker navigator stands at the edge of a dry riverbed at twilight, head tilted as if listening. Hands loose at sides. The riverbed is cracked, long dry — but the navigator's posture says otherwise."
> **text:** "He came inland on a trade run two months ago and never went home. He says the water under this country talks louder than the water on the lakes ever did. He says he can show you where to dig — for a price, or for nothing, depending on who's asking."
> **choices:** "Pay him to dig" · "Offer passage home in exchange" · "Tell him to stay out of your country"

### fe_versari_courier
> **art:** "A young Versari courier in dust-stained academic dress stands beside a small one-person rail trolley. They carry a sealed leather satchel. Their tattoo is partially visible at the collar."
> **text:** "The courier is polite in the way Versari are polite — meaning they want something. The satchel needs to reach Dambar and their trolley has lost a wheel. They will remember whoever helps them. They are also very clear that they will remember whoever doesn't."
> **choices:** "Help with the wheel" · "Look inside the satchel" · "Leave them to it"

### fe_dambaran_widow
> **art:** "A woman in worn travel clothes sits on the steps of a small trading post. Her hands are folded. A child sleeps against her shoulder. A bundled package sits at her feet."
> **text:** "She came from Dambar on foot, which means she came a long way for the reason in her hands. Her husband was Dambaran lineage and the institution did not love him for it. The package is for someone she will not name. She asks if you'd carry it east. She has nothing to pay with that you would take."
> **choices:** "Carry the package east" · "Open it first" · "Refuse, kindly"

### fe_rail_walker
> **art:** "A solitary figure in heavy coat walks along an exposed rail line stretching to vanishing point. Behind them, a hand-pulled cart of salvaged components. Overcast sky, no other figures."
> **text:** "He walks the rails for a living. Says he's been doing it since before the Versari started running landships on them, and he'll be doing it after, whoever that turns out to be. He has news from three settlements east. He'll trade it for something — your choice what."
> **choices:** "Pay him in Scrap" · "Share rations and a fire" · "Move on"

### fe_pirate_parley
> **art:** "Two figures stand twenty paces apart on open ground. One is clearly a Free Plainer — patched coat, visible blade. The other waits with empty hands raised. A small landship sits in the distance, hatch open."
> **text:** "She calls herself a captain and she might be telling the truth. She has a proposal: she'll leave your supply lines alone for a season if you'll do her one favor in that same time. She won't tell you the favor in advance. She says that's the point."
> **choices:** "Shake on it" · "Counter — Scrap instead of a favor" · "Refuse and prepare"

### fe_old_world_terminal
> **art:** "Interior of a half-collapsed concrete structure. A bank of dead screens covered in dust. One screen flickers faintly. Cables snake into the dark."
> **text:** "Something in here is still drawing power. Not much, but some. The screen flickers in a pattern that might be deliberate. A Versari scholar would spend a year on this. You have about an hour."
> **choices:** "Stay and study it" · "Strip it for parts" · "Send word to a Versari scholar"

### fe_grain_silo
> **art:** "Wide low-angle shot of a row of derelict grain silos against a flat horizon at dusk. One silo door hangs open. A small group of figures stands at the base, looking up. Dry palette — wheat, rust, slate."
> **text:** "The silos are older than anyone alive. A grain-belt farmer waves you over. She says the third one from the left has been humming for two days. Not loud. Just a sound that wasn't there before. She wants to know if it's worth opening."
> **choices:** "Open the silo" · "Seal it and walk away" · "Send for someone who reads"

### fe_two_factions_arguing
> **art:** "A wide shot of a small frontier crossroads. Two groups face each other across an old paved road — Goldgrass on one side, Lakers on the other. No weapons drawn, but hands rest near them. Locals watch from doorways."
> **text:** "The Goldgrass side says the well belongs to the settlement and the settlement belongs to the coalition. The Laker side says the well was dug by a Laker engineer twelve summers back and the paperwork, if anyone cared to find it, would prove it. Neither side is wrong, exactly. They're waiting for someone to tip the scale."
> **choices:** "Side with the Coalition" · "Side with the Lakers" · "Suggest the settlement decides for itself"

### fe_lakers_trader
> **art:** "A weathered trader in lake-country leathers leans against a wagon stacked with crates marked in unfamiliar script. Behind him, two guards look bored. A small fire burns nearby."
> **text:** "He came down from the lakes the long way and he's tired. The crates hold something his people make and yours don't. He wants Scrap, but he'd also take a favor — something specific, something he won't name yet."
> **choices:** "Pay his price in Scrap" · "Accept the favor terms" · "Walk away"

### fe_burned_camp
> **art:** "The remains of a small camp at dawn. Three lean-tos, one collapsed and burned. A cooking pot lies on its side. No bodies, but the ground tells a story to anyone who can read it."
> **text:** "The camp burned two nights ago. There are no bodies and not enough scorch for a real fight. Whoever was here left in a hurry, but they left on their feet. One of your crew finds a token in the ashes — Free Plainer work, recently made."
> **choices:** "Track them" · "Salvage what's left" · "Report the camp to the nearest settlement"

### fe_buried_cache
> **art:** "A patch of disturbed earth between two rocks on a low ridge. A corner of weathered metal is just visible. Scrub grass, hard light, no people in frame."
> **text:** "Something is buried here. The disturbance is recent — within a season, no longer. Whoever put it here meant to come back."
> **choices:** "Dig it up" · "Mark the spot and wait" · "Leave it where it lies"

---

## B. Itemized answers

### 1. The Works — **not in the repo as a place**

**Source:** `src/game/content.js:174`
> ```js
> works: { id: "works", name: "Works", kind: "location", slots: 1,
>   techLevel: 1, cost: 4, buildRate: 1, buildCost: 4, loyaltyReq: 0,
>   desc: "+1 build progress each turn toward this location's active build" }
> ```

**Source:** `src/prototype/data.js:122`
> ```js
> works: { id: "works", name: "Works", kind: "location", cost: 4,
>   short: "+1 Build / turn", effect: "+1 build progress each turn toward
>   this location's active build." }
> ```

**From the source:** The Works is a tier-1 location upgrade chip costing 4
scrap that adds +1 build progress per turn. Any faction can build one at any
location it controls. Every occurrence in the repo is engine code, harness
tests, or balance documentation. It is not a place, institution, or site.

It does have flavor names per faction, which is the closest thing to lore it
carries (`CHIP_SKINS`, `src/game/content.js`): Versari **Fabricator**,
Goldgrass **Barn Raising**, Lakers **Assembly Line**, Free Plainers
**Roustabouts**.

**Inference (mine):** if you want a "works" entry, the honest one is about
the common noun — a fabrication yard a faction builds at a location it holds,
named differently by each people. The Goldgrass "Barn Raising" skin is the
most characterful hook: their works is a community event, not a building.

### 2. The Ring — **not in the repo as an organization**

**Source:** `src/prototype/boardSlots.js:14`
> "The ring is a circle on the ground, so on screen it is an ellipse squashed by"

**Source:** `docs/mechanical-spec-v0.1.md:2125`
> "hex and the ring around it); **+1 on high ground**, **+ Vision chips /**"

**From the source:** "the ring" is the ellipse of unit-placement slots drawn
on each hex tile, and separately the six hexes adjacent to a given hex. It is
UI geometry and rules vocabulary. There is no freight operation, no forty
vehicles, no yard, no accounts. Nothing in the repo describes a hauler
company of any kind.

### 3. Named individuals — **none exist**

**From the source:** Zero word-boundary matches, repo-wide, for `Sabine`,
`Anneke`, `Dorn`, `Juan`, `Ives`, `Orr`. There are no named characters in the
repository. The 12 encounters deliberately use unnamed archetypes — "an older
woman," "a Laker navigator," "a young Versari courier," "she calls herself a
captain."

The only gesture toward named NPCs is an art-asset naming convention that
lists two illustrative filenames, both placeholders:

**Source:** `public/assets/README.md:59`
> "`portraits/characters/` — NPCs / encounter speakers, free-named
> (`the-fixer.png`, `scrap-baron.png`). Display ~120–200px."

No such images exist; the directory is a spec, not a manifest.

**Recurring named characters with 3+ appearances: none. There are zero.**

**Inference (mine):** the unnamed-archetype style of the 12 encounters reads
as deliberate and it suits your office-level entries well. I would keep
Factor, Baron, Colonel, and Headwoman at the level of the office and not wait
on holders that do not exist.

### 4. The Steel Trader settlement — **not named**

**Source:** `src/game/content.js`, `MINOR_FACTIONS`
> `steeltraders | name: The Steel Traders | capital: undefined | affiliatedLocations: undefined | temperament: opportunist | scope: local`

**From the source:** All four minor factions (Clan Tempest, The Croppers, The
Steel Traders, The Dambarans) are `scope: "local"` with no capital and no
affiliated locations. They exist as diplomatic actors and unit art sets only.
There is no Steel Trader settlement in the repo, named or otherwise, and no
converted hauler fortress.

### 5. Plains settlements and city states — **fully answered, and richer than you expected**

**Omara and Kansit are canon and current**, not later-era only.

**Source:** `concept/style/remnant-continent-art-direction.md:253` (§11)
> "The city-states of the later era — Omara, Kansit, Moyne, Linkor, Dambar, and
> the Shelf — remain canon. They simply have not driven any art yet."

**Complete settlement roster.** `src/game/content.js` `LOCATIONS` carries 19;
`content/locations.csv` carries flavor text for the first 10.

| Location | Faction | Real-world basis | Flavor (from `locations.csv`) |
|---|---|---|---|
| Korad | Versari **(capital)** | Boulder, CO | "Where the Versari keep their best work and their worst secrets." |
| Dambar | Versari | Denver, CO | "The continent's brain. It knows this about itself." |
| Runaway | Versari | — | — |
| Kansit | Goldgrass **(capital)** | Kansas City | "Every trade route on the plains runs through here eventually. The city charges accordingly." |
| Omara | Goldgrass | Omaha | "Far enough north to feel the Laker wind. Close enough to Dambar to feel the other kind." |
| Witcha | Goldgrass | — | — |
| Droit | Lakers **(capital)** | Detroit | "Whoever holds the straits holds the conversation between east and west." |
| Chigan | Lakers | Chicago | "The factories never fully stopped. Neither did the people who depend on them." |
| Dulut | Lakers | — | — |
| Tin Town | Plainers **(capital)** | New settlement | "It looks like nothing. That's the first mistake people make about it." |
| The Shelf | Plainers | New settlement | "Someone built here because it was defensible. Someone else is always trying to prove them wrong." |
| Linkin | Plainers | — | — |
| Concordan | Unaffiliated | — | "Unaffiliated by choice, not by accident. They've had offers." |
| Erport | Unaffiliated | — | "The last stop before open water. Or the first, depending on which way you're running." |
| Restaria · Lastgas · Overlook · Nosservis · Detor | Unaffiliated | — | — |

**Direct answers:**
- **Principal Grand Laker city:** **Droit** is the engine capital
  (`capital: "droit"`). Chigan is the industrial one ("The factories never
  fully stopped"). If a quest ever says "the Laker capital," Droit is it.
- **Versari seat:** **Korad** is the capital. **Dambar is Versari-affiliated,
  not Dambaran-held** — see §7 below, this contradicts your faction entry.
- **Dambar on the map:** yes, a reachable Versari location, and the
  destination in `fe_versari_courier`.

### 6. Terms used loosely

#### Landship vs. land vessel — **your entries have it inverted**

This is the most consequential finding in the RFI and I want to be exact
about it.

**Source:** `concept/style/remnant-continent-art-direction.md:263–290` (§12, "Land Vessels")
> "Land vessels **hover**. They are recovered pre-collapse objects, not
> manufactured ones, which places them under Rule 3 rather than under any
> faction's fabrication logic."
>
> "**The hull is old-world.** Seamless, matte, inert. Mathematically exact
> curves, perfectly flat planes, no fasteners, no panel lines, no visible way
> in. It carries none of a faction's manufacturing signature because no
> faction made it."
>
> "**Faction identity lives in what is mounted to it.** … A Versari vessel and
> a Laker vessel share an identical hull and are told apart entirely by the
> hardware bolted around it."
>
> "**Hover is signaled by cost, not by light.** Per the lift emitter
> convention: scorch, heat discoloration, and heavy armored feed conduit
> running to the emitters. Nothing glows."

**Source:** `concept/style/remnant-continent-art-direction.md:248` (§11)
> "**Land vessels are not yet Versari.** In this era they are recovered from
> the old world by whoever finds one, and all four factions operate them. The
> Versari consolidation of the fleet is a later development."

**From the source:** In repo canon, **"land vessel" is the term for the
recovered, hovering, un-reproducible old-world platform** — the thing your
wiki calls a *landship*. Your Land vessel entry defines it as "any vehicle a
living people has built or restored, as against the landships of the old
world." That is exactly backwards from the setting bible.

Meanwhile **"landship" in the repo is a game-mechanical unit chip**:

**Source:** `src/game/content.js:167`
> ```js
> landship: { id: "landship", name: "Landship", kind: "unit",
>   statType: "movement", slots: 2, techLevel: 3, cost: 12, movement: 3,
>   buildCost: 12, loyaltyReq: 6, upkeep: 2, ignoresTerrain: true,
>   railIncompatible: true,
>   desc: "+3 Movement; rough ground plays road-grade (forest 1, mountains 2, no halt)" }
> ```

Tier-3, two slots, rare, expensive (12 scrap, upkeep 2), ignores terrain.
Available to every faction — no `faction:` key, unlike `waystation` which is
Plainers-only. That "any faction can field one, it is rare and costly, it
crosses ground nothing else crosses" profile matches the *land vessel* lore
precisely.

**Both in-fiction uses of "landship" are consistent with the hover platform:**
- `fe_pirate_parley` art: "A small **landship** sits in the distance, hatch
  open." (A Free Plainer scene — confirming §11's "all four factions operate
  them.")
- `fe_rail_walker`: "since before the Versari started running **landships** on
  them [the rails]"

**One internal repo contradiction, flagged for you and for the repo:** the
chip is `railIncompatible: true`, yet `fe_rail_walker` has the Versari running
landships on rails. The engine and that encounter disagree. That is a repo
bug, not your error.

**Inference (mine):** the cleanest fix is to make *landship* and *land vessel*
the same thing — the recovered hover platform, one term the engine uses and
one the art bible uses — and drop the invented distinction. If you want to
keep two classes, the manufactured-vehicle class needs a new name, because
both existing terms are already spoken for by the old-world object.

#### The hollow — **not in the repo**

Zero lore occurrences. All matches are code idiom ("hollowing the place out,"
"conquest is hollow"). The Croppers have no described settlement form
anywhere. Your entry is entirely invention; nothing contradicts it, and
nothing supports it.

#### The rite — **not in the repo**

Zero occurrences, in any sense. (The `rite` substring only ever appears inside
`write`/`sprite`.) The Croppers have no described observance. Same status as
the hollow: unsupported, uncontradicted.

#### Assize — **not in the repo**

Zero occurrences outside your own `wiki-repo.js`. There is no encounter titled
"Assize." The 12 encounter ids are listed in §A; none is a dispute-hearing.
The nearest thing in the game is `fe_two_factions_arguing`, a well-ownership
dispute at a crossroads with the player as tiebreaker — that is probably the
encounter you are thinking of, and it is *not* called an assize and involves
no sitting, no witnesses, and no standing authority.

### 7. Contradictions with established repo content

Working through your risk list, plus two you did not flag.

#### ⚠️ Vehicle propulsion — **mostly confirmed, but ethanol is absent**

`CHIP_SKINS` in `src/game/content.js` renames every chip per faction, and the
movement chips are decisive:

| chip | Versari | Goldgrass | Lakers | Plainers |
|---|---|---|---|---|
| navigator (+1 Mov) | **Sunrunner** | **Trace Horses** | **Droit Iron** | **Mustangers** |
| troop-carrier (+2 Mov) | **Sunhauler** | **Stage Line** | **Chrome Hauler** | **Remuda** |
| recyclers | **Panel Field** | Gleaning Yards | Breaker Yard | Salvage Camp |
| factory | **Sunworks** | Gristmill | Stamping Plant | Tradehouse |

**Confirmed by source:**
- **Versari solar.** Sunrunner, Sunhauler, Panel Field, Sunworks. Your Sun
  Runner entry has a real anchor — though in the repo it is a *movement
  upgrade chip*, not specifically a three-wheeled trike, and "Sunrunner" is
  one word. Corroborated by `docs/chip-set-v0.1.md:62`: *"Flavor threads:
  Versari = solar/engineering/planning."*
- **Goldgrass and Plainers on horse.** "Trace Horses," "Stage Line,"
  "Mustangers," and especially **"Remuda"** — a remuda is the herd of spare
  saddle horses a crew rotates through. That is your "relays of fresh animals
  staged along the routes" confirmed in one word.
- **Lakers on restored old machines.** "Chrome Hauler," "Droit Iron," and
  `art-direction.md:232`: *"**Laker vehicles** — preserved lacquered
  classic-car bodywork, roof and doors cut away, crude welded roll bar and
  plate, lifted leaf-spring suspension, knobby tires on cast steel wheels."*

**Not confirmed:** **the word "ethanol" appears nowhere in the repo**, nor
does any Laker fuel, distilling, or supply-range mechanic. Your Ethanol entry
is invention. It is a *reasonable* invention — it explains how the restored
cars run and it gives the Lakers a logistics weakness that fits their
described strengths — but nothing supports it. Flagging it so you can decide
whether to keep it as canon-extension or soften it.

#### ✅ Ammunition scarcity — **strongly confirmed**

**Source:** `concept/style/remnant-continent-art-direction.md:9` (§1)
> "The tech level is uneven: excellent metallurgy and optics, **no chemistry,
> no miniaturization, no ammunition industry. Warfare is primarily melee.**"

Your Old-world technology entry is correct and if anything understates it.
"Warfare is primarily melee" is a harder line than "a cartridge is a scarce
and serious thing," and it is worth taking on board. Note the Plainers'
`sharpened-blades` skin is **"Buffalo Gun"** — so firearms exist as prestige
weapons, consistent with stockpiles running down.

#### ❌ Specialists — **not in the repo at all**

Zero occurrences of "specialist" in any lore or engine sense. No captive-expert
mechanic, no escort mechanic. The only "escort" hits are in
`docs/unit-model-pipeline.md` describing *sprite composition* — the figures
standing beside a vehicle model in unit art, purely a rendering concern:

**Source:** `docs/unit-model-pipeline.md:793`
> "because the stationary escorts dominate the pixel mass and the cart does not"

Your Specialist and Escort entries are wholly invented. Nothing contradicts
them. The nearest supporting texture is `fe_old_world_terminal` — "A Versari
scholar would spend a year on this" — which supports scarce expertise being
the bottleneck on old-world tech, but attributes it to Versari scholars, an
*affiliated* group, rather than to unaffiliated held specialists.

#### ❌ Notes, tallies, and hall credit — **not in the repo; scrap is confirmed**

**Scrap is confirmed and central** — 337 occurrences, the game's sole
resource, and `content/upgrade-chips.csv` prices everything in it.

**Notes, tallies, halls, and hall credit are absent.** No currency instrument
of any kind exists in the engine; there is no faction-specific economy. The
only "hall" in the repo is the `civic-hall` chip, whose skins are Versari
**The Ministry**, Goldgrass **Grange Hall**, Lakers **Company Store**,
Plainers **Watering Hole** — a loyalty building, not a mercantile institution.

**Inference (mine):** "Grange Hall" and "Company Store" are good anchors if
you want to keep the Hall entry — a grange hall is a farmers' mutual
institution, which is close to what you wrote. But the printed-note economy is
invention, and it sits somewhat awkwardly against an engine where every
faction pays for everything in scrap.

#### ❌ Clan Tempest's four achievements — **invented, and now contradicted**

**Source:** `src/game/content.js`, `MINOR_FACTIONS`
> `tempest | name: Clan Tempest | temperament: warlord | scope: local`

That is the entirety of Clan Tempest in the repo, plus five unit sprite
definitions under `art/units/tempest/`. No deeds, no forge reputation, no
lakeside battle, no crossing, no absorbed rival. Your four "said to have"
achievements are invention. You asked to have them replaced if the repo
establishes specific deeds — **it establishes none**, so there is nothing to
replace them with. They stand or fall on your judgment alone.

One caution: your entry calls Tempest "by the reckoning of many the first
among" the Laker clans. The engine gives them no primacy over the other three
minors, and `scope: "local"` means they are a regional actor.

#### ⚠️ **NEW — the Dambarans do not hold Dambar**

You did not flag this and it is a real conflict.

**Source:** `content/locations.csv`
> `dambar,Dambar,"Denver, CO",Very High,**Versari**,3,6,The continent's brain. It knows this about itself.`

**Source:** `src/game/content.js` — `versari.affiliatedLocations: ["korad", "dambar", "runaway"]`

**Source:** `concept/style/remnant-continent-art-direction.md:197` (§8)
> "**Dambaran mountains (Versari heartland):** high-altitude semi-arid
> foothills…"

**Source:** `concept/style/remnant-continent-art-direction.md:228` (§10)
> "**Versari helmet** — faceted, no curves, wraparound horizontal vision slot,
> layered brow, blank jaw, single right-side hinged cheek plate **(a Dambaran
> lineage holdover)**."

**Source:** `src/game/content/field-encounters.js` — `fe_dambaran_widow`
> "She came from Dambar on foot… Her husband was **Dambaran lineage and the
> institution did not love him for it**."

**From the source:** Dambar is a Versari city. The Dambaran mountains are the
*Versari heartland*. "Dambaran" is a **lineage** — an ancestry carried by
people living inside Versari society, which the Versari institution treats
with suspicion, and which has left a visible mark on Versari material culture
(the asymmetric cheek plate). Your entry says "The Dambarans hold Dambar and
the hard high country around it, near neighbors to the Versari and their
opposites in nearly every respect." The repo says the Versari hold Dambar and
the Dambarans are a resented bloodline *within* the Versari sphere.

**Inference (mine):** the repo version is dramatically better and I would
rewrite toward it. A proud martial lineage absorbed into the polity of the
people it despises, keeping its honor code, discriminated against, its
inheritance surviving as one hinged cheek plate on the helmet of a faction
that will not acknowledge it — that is a far stronger entry than "opposite
neighbors," and it explains `fe_dambaran_widow`'s quiet grief exactly.

#### ⚠️ **NEW — the timeline and the catastrophe do not match**

Three sources, three different accounts. Flagging all of them because you
should not resolve this alone.

**Source:** `concept/style/remnant-continent-art-direction.md:9` (§1)
> "A post-catastrophe future North America, **roughly a century** into
> recovery from **a pole shift**."

**Source:** `concept/style/remnant-continent-art-direction.md:238` (§11)
> "PABC is set **earlier** than the period described in sections 1–10. The
> factions exist but are still working out who they are. Boundaries are
> unsettled, the Goldgrass Coalition and the Free Plainers are still separate
> peoples, and the consolidations that define the later era have not happened
> yet."

**Source:** `README.md:5`
> "set in the Ashlands — a retro-futuristic world wrecked by **a simultaneous
> plague and solar catastrophe**."

**From the source:** The art bible says pole shift, ~100 years, and PABC is
set *earlier* than that. The README says plague plus solar catastrophe. Your
Pole Shift entry says "**some two hundred years ago**."

So the wiki's 200 years contradicts the bible's ~100, and the bible's own
"PABC is earlier" pushes the true figure *below* 100. Meanwhile the README
describes a different catastrophe entirely.

**Inference (mine):** the README looks stale — it still calls the game
"Ashland Conquest" set in "the Ashlands," while everything else says Remnant
Continent. I would treat the art bible as authoritative and the README as
needing a fix, but the era number is a decision for the author, not for
either of us. Two hundred years is hard to reconcile with the bible under any
reading.

Two knock-on effects if the era shortens:
- Your After the Shift entry's "the first generation or two remembered the old
  world and could say what a thing had been for. Everyone after that had only
  the stories" is a *century* structure, not a bicentennial one. It works
  better at 100 than at 200.
- §11's "the Goldgrass Coalition and the Free Plainers are still separate
  peoples" and "the later absorption of the Free Plainers into the Goldgrass
  has not occurred" may sit awkwardly with your Reapers entry, which has the
  Plainers *splitting off from* Goldgrass two or three generations ago. The
  bible has them converging later; you have them diverging earlier. Not a
  flat contradiction — both can be true across a long arc — but worth a look.

#### ✅ Confirmed outright — three entries with strong repo backing

- **The Foundry and the Cast Mark.** `art-direction.md:230`: *"**Laker heavy
  cannon** — dark soot-blackened cast barrel with **raised foundry numerals
  and an unground casting seam**."* Your entry matches the canon object
  exactly, including the unground seam. This is your best-supported entry.
- **Numerals, Not Words.** `art-direction.md:299` (§13): *"**Numerals only.**
  No words, letters, or script of any kind."* The whole setting refuses
  lettering. Your ridge-beam convention is a perfect fit for a rule that
  already exists as an art constraint.
- **Debt (the Versari unwritten kind).** `content/factions.csv`: *"They don't
  conquer — they embed, advise, and collect, **until the debt is too deep to
  refuse**."* And `fe_versari_courier`: *"They will remember whoever helps
  them. They are also very clear that they will remember whoever doesn't."*
  Your two-kinds-of-debt entry is the single best marriage of your writing to
  repo canon.

Partial support also exists for **Levy** — the Goldgrass `drilled-troops`
skin is **"Scythe Levy"**, and their `training-grounds` is **"Militia
Green"** — which backs your levied-farmers reading precisely.

---

## C. Setting material you have not used

Four things in the repo that no wiki entry currently touches, offered as
leads rather than requests.

**1. `CHIP_SKINS` is the densest lore in the repository.** Twenty chips × four
factions = 80 faction-specific names, each a compressed statement of how that
people does a thing. Versari **Lyceum** / Goldgrass **Almanac Society** /
Lakers **Trade School** / Plainers **Assay Office** for the same research
building tells you four epistemologies in four words. Versari **Wire
Service** / **Signal Authority** vs. Lakers **Radio Tower** / **Clear
Channel** vs. Goldgrass **Market Fair** / **County Fair** vs. Plainers
**Circuit Riders** / **Camp Meeting** — four theories of how news travels.
Full table dumped in §7 above for the movement chips; the rest is in
`src/game/content.js`.

**2. Terrain is specified in detail** (`art-direction.md` §8): Dambaran
mountains, Dambaran plains, Coalition prairie, Coalition river valley, each
with soil color, grass type, and horizon rules. Includes a compositional rule
worth quoting — *"settlement on the upper terrace, working waterfront below
it, grain country above"* — and an explicit contrast: *"Dambar is pale, dry,
thin-grassed, mountains always west… The plains are dark-soiled, green-gold,
humid, nothing on any horizon."* Geography entries could be written from this
today.

**3. Each faction has one monumental structure** (`art-direction.md` §9):
Versari **Reading Spire**, Goldgrass **Elevator Range**, Lakers **Pillar of
Engines** (*"a tall cast-iron column with restored pre-collapse automobiles
mounted around it at intervals, spiraling upward, each polished and
lacquered. Part trophy, part shrine"*), Free Plainers **Hull Post** (*"the
hull of a captured land vessel stood upright on end, cable-braced"*). Four
ready-made entries, and the Pillar of Engines and Hull Post both say
something about how their people regard old-world machines.

**4. Each faction has one fabrication logic** (`art-direction.md` §4):
Versari **cut and bolted**, Lakers **cast and poured**, Goldgrass **woven and
stitched**, Plainers **accreted and bolted-on**. Applied consistently to
every object a faction makes.

---

## D. Summary table

| # | Item | Status |
|---|---|---|
| 1 | The Works | **Not a place.** Location chip, +1 build progress |
| 2 | The Ring | **Not an organization.** Hex-tile slot geometry |
| 3 | Sabine Orr / Ives / Anneke Dorn / Baron Juan | **Do not exist.** Zero repo occurrences |
| 3b | Any recurring named character | **None exist.** Encounters use unnamed archetypes |
| 4 | Steel Trader settlement | **Not named.** Minors have no locations |
| 5 | Omara / Kansit | **Canon and current.** Both Goldgrass |
| 5b | Laker capital | **Droit** (Chigan is the industrial city) |
| 5c | Versari seat | **Korad.** Dambar is Versari but not the capital |
| 5d | Settlement roster | **19 locations** — full table in §5 |
| 6a | Landship vs. land vessel | **Your definitions are inverted vs. canon** |
| 6b | The hollow | Not in repo. Invention, uncontradicted |
| 6c | The rite | Not in repo. Invention, uncontradicted |
| 6d | Assize | Not in repo. No such encounter |
| 7a | Faction propulsion | **Confirmed** except ethanol, which is absent |
| 7b | Ammunition scarcity | **Confirmed** — "warfare is primarily melee" |
| 7c | Specialists / escorts | Not in repo. Invention |
| 7d | Notes / tallies / halls | Not in repo. Scrap **is** confirmed |
| 7e | Clan Tempest's deeds | Invention. Repo establishes none |
| 7f | **Dambarans hold Dambar** | **Contradicted.** Dambar is Versari; Dambaran is a lineage |
| 7g | **Two hundred years** | **Contradicted.** Bible says ~100 and PABC is earlier |
| 7h | Foundry / Numerals / Debt | **Confirmed** by canon objects and faction flavor |

---

## E. Where the canon actually lives

For future RFIs, in descending order of authority:

| File | What it holds |
|---|---|
| `concept/style/remnant-continent-art-direction.md` | **The setting bible.** 411 lines: era, catastrophe, tech level, terrain, faction fabrication logic, canon objects, land vessels, PABC-specific scope (§11) |
| `src/game/content.js` | Factions, minors, capitals, 19 locations, 40+ chips, and `CHIP_SKINS` (80 per-faction names) |
| `content/*.csv` | `locations.csv` and `factions.csv` carry the flavor prose |
| `src/game/content/field-encounters.js` | All 12 encounters — the only player-facing fiction |
| `concept/anchors/remnant-continent/ANCHORS.md` | Approved reference images and what each is bad at |
| `README.md` | **Treat as stale.** Different catastrophe, different setting name |
| `src/game/content/quests.js`, `world-encounters.js` | **Empty.** `{}` |

Two open repo bugs surfaced by this RFI, for the author rather than for you:
the `railIncompatible` landship running on rails in `fe_rail_walker`, and the
README's plague-and-solar catastrophe against the bible's pole shift.
