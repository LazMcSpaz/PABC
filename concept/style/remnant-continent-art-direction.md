# The Remnant Continent — Visual Art Direction Brief

*Reference document for image generation. Copy-paste into a new chat to bring an assistant up to speed on the setting's visual language and the prompting rules that produce usable output.*

---

## 1. The Setting in One Paragraph

A post-catastrophe future North America, roughly two hundred years into recovery from a pole shift. Civilizations are **rebuilding**, not scavenging. They have institutions, standardized manufacturing, trade networks, and pride. Pre-collapse technology exists but cannot be reproduced — it is harvested, mounted, and revered. The tech level is uneven: excellent metallurgy and optics, no chemistry, no miniaturization, no ammunition industry. Warfare is primarily melee.

---

## 2. The Central Problem

Two words will destroy any generation and must never appear in a prompt:

- **"Post-apocalyptic"** → the model produces rust, rags, decay, and improvised shanties. Wrong. This civilization builds new things well.
- **"Sci-fi" / "futuristic"** → the model produces glow, chrome, screens, and seamless molded plastic. Also wrong.

The setting sits in an uncomfortable middle ground with no genre shorthand. It must be built from **specific nouns and materials**, never from era labels or explanatory framing.

---

## 3. The Core Visual Rules

### Rule 1 — Repetition signals civilization
Identical windows, matching roof pitches, uniform courses of stone. Mismatch reads as improvised; standardization reads as a workshop that made a hundred of them. This is the fastest way to say "rebuilding" instead of "surviving."

### Rule 2 — Salvage vs. quarry
The old world is a **raw material**, not a set of found objects. They don't nail a car door to a wall; they melt it and re-mill it into new standardized stock. Think medieval Rome quarrying the Colosseum for building stone — the result looks like Rome, not like ruins.

### Rule 3 — Advanced tech is signaled by PRECISION, never by light
Sealed pre-collapse objects are:
- perfectly flat surfaces, mathematically exact curves
- seamless — no fasteners, no panels, no controls, no way to open them
- dull, matte, inert-looking; bare metal or composite
- **never glowing, never illuminated, never styled**

Everything handmade has sag, taper, tool marks, and honest wear. The contrast between a flawless sealed object and the handmade cradle holding it is the single most distinctive image in this world.

### Rule 4 — The cradle is the craft
Since sealed objects can't be opened or modified, the entire craft tradition is **interface work**: mounting yokes, clamping saddles, bus bars, conduit, adjustment screws. That's where the precision machining and the pride go. A cradle is this civilization's cathedral facade.

### Rule 5 — Power is architecture, not electronics
Electricity exists but cannot be miniaturized. It appears as **armored conduit thicker than an arm, exposed copper bus bars, ceramic insulator stacks, oil-filled contactors, analog dial gauges.** Sci-fi shrinks power until it vanishes; this world can't. Corollary: **soldiers are entirely unpowered.** Power lives on vehicles and in fixed installations.

### Rule 6 — Every faction gets ONE fabrication logic, applied consistently
Alienness comes from a single manufacturing logic applied everywhere, which no real historical period does. Consistency is what makes a fictional culture feel invented rather than borrowed.

---

## 4. Faction Fabrication Logic

The four factions are deliberately opposed at the level of *how they make things*. This reads at any scale — object, figure, building, or map tile.

### Versari Korad — **CUT AND BOLTED**
*A scholarly empire. Austere, precise, vain about severity. Small expensive armies.*
- Cannot forge or cast to shape. Everything is cut from flat stock and assembled.
- Straight cuts, single bends, **faceted planes meeting at hard chamfered edges, no compound curves.**
- Thickness built by **laminating plates** — stacked layer lines visible along edges.
- Bolts in deliberate regular rows at joints and load paths only. **Ration the rivets** — allover rivet texture tips into dieselpunk.
- Palette: dark grey-green, uneven bluing, ground bright at wear edges. Matte.
- **Icon: a continuous horizontal vision slot wrapping entirely around the helmet** — front, both sides, closing at the back. Divides crown from jaw. Lower face blank, no mouth or grille.
- **Rank = brow thickness.** Stacked plates above the vision slot; more layers = higher rank. Hierarchy rendered in steel, visible at distance.

### Grand Lakers — **CAST AND POURED**
*Rust Belt industrial power. Foundries, restored pre-collapse automobiles, heavy cannon.*
- The direct inverse of Versari. Metal **flows** rather than folds.
- **Compound curves, swollen tapering forms, rounded shoulders.** No flat facets, no bolted flat stock.
- Casting seams, sprue scars, surface pitting left unground on backs and undersides.
- **Raised cast maker's marks and foundry numbers** proud of the surface, formed in the mold.
- Palette: deep hand-rubbed glossy lacquer — oxblood, dark green-black, midnight blue — worn through to bare metal at edges. **The only glossy faction.**
- **Critical: polish is selective, not uniform.** They lavish care on a few surfaces and let everything else stay rough, muddy, and soot-blackened. Uniform finish reads as a museum restoration, not a working machine.
- Armor is for the fearful. Bare torsos, heavy leather work harnesses, foundry-laborer physicality.
- Vehicles: **the body is the heirloom, everything else is field-replaced.** Preserved lacquered classic-car bodywork on visibly crude handmade running gear.

### Goldgrass Coalition — **WOVEN AND STITCHED**
*Agrarian trading coalition. Prosperous, practical, unmilitary.*
- Works no metal at all. Textile-first: woven, quilted, stitched, laced.
- Thickness built in **layers of cloth**, not plate. Soft bulky outline, no hard edges.
- **The only faction with color and pattern.** Warm ochre, gold, cream, madder red. Woven geometric bands at cuffs, hems, collars.
- **Their metal is somebody else's.** Salvaged Versari flat plate and Laker castings stitched side by side in the same garment — a trading nation wearing its trade routes. Mismatched *by origin*.
- Armor = small salvaged plates sandwiched inside quilting, visible only as rows of rivet heads and stitched outlines on the outside.
- Weapons: reforged agricultural tools, since they'd buy a head rather than a whole sword.

### Free Plainers — **ACCRETED AND BOLTED-ON**
*Frontier outlaws. Raiders and salvagers, no central state.*
- Same plains climate as Goldgrass, but the logic is **accretion**: a sound core with three generations of additions bolted to it.
- Heavy timber, mismatched reused brick, **plate steel cut from vehicle hulls and machinery housings**, riveted into flat panels.
- Rail sections as posts, lintels, bracing. Exposed oversized fasteners, cable-and-turnbuckle ties, visible unmatched repairs.
- Mixed roofs on one building. Nothing standardized, nothing matching.
- **Not a shantytown.** Everything is structurally sound, actively maintained, and worth defending. Competent and prosperous in an irregular way.

---

## 5. Prompting Rules (learned the hard way)

### 5.1 Structure
- **Front-load the concrete.** Nouns, materials, and finishes first. Negative exclusions last.
- **Short beats long.** Every added clause dilutes the detail budget on what matters.
- **One object per generation.** Squads of four produced four copies of one design at reduced fidelity.
- **Never explain the civilization.** Prose like "a society rebuilding after collapse" is reasoning for a human, not signal for an image model. It gets ignored while its stray words ("collapse," "salvage") pull toward the wrong genre.

### 5.2 Specify by MANUFACTURE, not by type
Naming an object type summons its most famous historical instance.
- "Close helm with vision slits" → sallet.
- "Riveted mail" → maille voiders.
- "Buckler" → medieval round shield.
- "Half-coat" → surcoat.
- **"Cut plates riveted to a frame" → spangenhelm** — a real historical construction method, so the model produced the real historical object.

Describing *how it was made* only avoids historical drift if the method has no historical precedent. When it does, add a **non-historical constraint** — e.g. "flat facets only, no curved panels, no dome" broke the spangenhelm convergence immediately.

### 5.3 Build components before assemblies
Generate a **kit of parts**, then reference the part images when generating the figure or vehicle.
- Only generate a piece if it is **novel to this world or load-bearing for faction identity.** Belts, boots, pouches stay in the prompt text.
- Component sheets get reused across dozens of downstream images. Parts first, assembly second.
- With reference images attached, spend the prompt's words on everything *except* the referenced parts.

### 5.4 Large objects need a FORM RULE, not a parts list
Parts-listing works for a helmet and fails for a hundred-foot vessel — it produces "a box, with another box on it, and things hung underneath." Large objects need:
- an explicit **proportion rule** ("six times longer than it is tall")
- **continuity language** ("the hull is one continuous armored form"; "the raised bow and main hull share unbroken plating with no seam between them")
- **integration instead of attachment** — recess hardware into skirts and hull rather than hanging it on pylons, or it reads as bolted-on trash.

### 5.5 Watch the wording of cut-throughs
"Divides it into an upper section and a lower section, bridged by piers" produced two separate boxes floating apart. Say instead: **"a narrow slot cut through the wall of a single solid box; the structure above and below is continuous plate."**

### 5.6 Landscape scale is an OUTPUT, not an input
Image models cannot compose a city. The workflow is:
1. Close-range material studies (a wall corner, a mounted component, a doorway)
2. Individual building sheets, one type at a time
3. A two-or-three-building block study for spacing
4. **Blender assembles the city from the kit** using a written placement doc
5. Optional low-denoise paintover of the Blender render for atmosphere

A Blender agent needs **proportions, floor counts, footprint ratios, roof pitches, and placement rules** — not a hero painting.

The one thing worth generating as a pure image and never modeling: a **silhouette study** per city. Black shapes on a horizon line, no detail. Cheapest possible test of whether a city reads at distance.

### 5.7 What makes a city read as ALIVE
At landscape zoom, the fastest signal is **the working edge**: where cargo enters, what's staged, what's under construction. Scaffolding, kilns smoking, newer material at the perimeter than at the core. **A dying city has no cranes.** Image models drop this first unless asked explicitly.

### 5.8 Selective finish beats uniform finish
The single biggest quality lever on Laker objects, and useful everywhere: name **exactly which surfaces are bright and polished** and let everything else be rough, chipped, muddy, and soot-stained. Uniform care reads as a display piece.

---

## 6. Standard Prompt Skeleton

```
[Format] Concept art of [single object], three-quarter view, plain grey
background, flat even lighting, reference sheet.

[Material and construction — the faction's fabrication logic, concrete nouns]

[Component breakdown by named part: what it's made of, how it's joined,
what finish it carries]

[Wear and use: where it's polished, where it's rough, what's caked in it]

[Scale anchor if needed: figures beside it]

[Negatives — name the specific wrong genres and their signature objects]
```

**Standard negative block** (trim to what's relevant):
> Not medieval: no chainmail, no surcoat, no tabard, no heraldry, no plume, no crest, no rounded forged armor, no engraving.
> Not modern: no camouflage, no ballistic vests, no firearms, no tactical webbing.
> Not sci-fi: nothing glowing, no screens, no chrome, no seamless molded plastic, no hover effects.
> Not steampunk: no boiler, no smokestack, no exposed gears, no brass ornament, no goggles.
> Not a ruin, not a scavenger camp, not clean, not new.

---

## 7. Known Failure Modes and Their Fixes

| Symptom | Cause | Fix |
|---|---|---|
| Output reads medieval | Named an object type with a famous historical instance | Specify by manufacture; add a non-historical constraint (e.g. "no curved surfaces at all") |
| Output reads dieselpunk | Rivets used as allover surface texture; riveted box + copper + insulators is a well-worn combination | Ration bolts to joints and load paths; add a sealed precision object to the frame |
| Output reads Age of Sail / pirate | Timber carriage, round shot, muzzle loading, rope tackle, brass | Cast iron/steel carriage, leaf springs, rubber tires, cylindrical shells, screw breech, recoil cylinders |
| Vehicle looks hodgepodge, parts bolted on | Parts list with no form rule | Proportion rule + continuity language + recess hardware into hull/skirt |
| Two masses instead of one object | "Divided into upper and lower, bridged by piers" | "A slot cut through the wall of one solid box; plating continuous above and below" |
| Figure looks like a display piece | Uniform finish quality across all surfaces | Name exactly which surfaces are bright; everything else rough and dirty |
| Squad figures lack detail | Multiple figures in one generation | One figure per generation |
| Output covered in English callout labels and a title block | Asked for an "annotated reference sheet" or "design sheet" — the words summon the whole diagram convention, labels included | Ask for orthographic views only, never for annotation. Labels belong in `ANCHORS.md`, not in the image |
| Output contains the prompt's own placeholder text, e.g. "ref. &lt;Image 1&gt;" | Referred to an attached anchor inside the prompt body, so the model drew the reference token as a caption | Never name the attachments in the prompt. Describe what to take from them, or say nothing — §5.3 already spends words on everything *except* the referenced parts |
| Gauge faces and palette swatches come back with misspelled English | Any labelable flat surface invites lettering, and a misspelling is still a §13 violation | Keep §13's negative block on every prompt, and prefer numerals-only gauges. A garbled word is not "close enough" — it is canon-breaking |
| Laker cast marks come back reading "FOUNDRY 14 MAKER 02" | Asking for a foundry mark or maker's mark gets the *words* along with the numbers, since that is what the real convention looks like | Ask for **raised cast numerals only**, one to four digits, and say no maker word. The numerals are wanted (§13); only the words break canon |
| A real-world manufacturer's badge appears on a vehicle | Naming a real make or model in the prompt, or anchoring on a photo-derived image of one | Specify the vehicle by era, body form and fabrication, never by make. Check grilles, hubs and tailgates in the output — the badge is small and easy to miss |

---

## 8. Terrain Reference

**Dambaran mountains (Dambaran ground; the Versari are established at Dambar and Korad):** high-altitude semi-arid foothills, broken benches and hogback ridges toward snow-streaked peaks. Thin pale buff/grey/rust soil, exposed bedrock, talus. Silver-grey scrub, dry bunchgrass with bare ground between, stunted conifers on north faces. Dry watercourses. Thin clear air, hard-edged shadows. Land slopes consistently east.

**Dambaran plains:** high semi-arid shortgrass in rain shadow. Nearly flat, tilting gently east, shallow dry drainages, low pale sediment bluffs. Short sparse pale buff and blue-grey grass, low scrub and yucca. Mountains as a low blue silhouette on the western horizon. Dust haze.

**Coalition prairie:** deep-soil tallgrass, gently rolling, no rock outcrops. Dark rich soil. Continuous tall grass in green, gold, tan. Trees only in deliberate straight planted windbreak rows. Rectangular field grid. Horizon low in frame, sky dominant. **No mountains on any horizon.**

**Coalition river valley (where the cities sit):** broad valley cut 50–100 ft below the prairie, grass-and-timber bluffs rising to a flat rim. Wide brown slow river with sandbars and cut banks. Cottonwood, willow, sycamore along the water. Two or three distinct terraces stepping up from the water. Dark alluvial silt. Humid and enclosed compared to the plain above.

> **Compositional spine of every plains city:** settlement on the upper terrace, working waterfront below it, grain country above. That three-band stack is what makes a wide shot read as a river city.

> **Dambar vs. plains at a glance:** Dambar is pale, dry, thin-grassed, mountains always west, city cut *into* rising ground. The plains are dark-soiled, green-gold, humid, nothing on any horizon, city sitting *in* a valley below the general land level.

---

## 9. Map-Scale Faction Identifiers

For orthographic / 3-4 isometric strategy-map views. Each faction needs **one tall thing with a distinct silhouette plus one ground pattern.** The four verticals are deliberately different shapes so they separate at small tile size before color does any work.

- **Versari — the Reading Spire.** A slender faceted tower of stacked steel plates on a stepped octagonal base, one horizontal slot band cut around it near the top. Unornamented. *Silhouette: a thin dark needle.* Ground: exact radial causeways and converging rail.
- **Goldgrass — the Elevator Range.** A row of tall pale grain silos with a headhouse spanning their tops and conveyor gantries angling down; alongside it a skeletal splayed-leg water tower. *Silhouette: a row of fat cylinders plus one spindly-legged tank.* Ground: rectangular field grid, straight tree-row windbreaks.
- **Grand Lakers — the Pillar of Engines.** A tall cast-iron column with restored pre-collapse automobiles mounted around it at intervals, spiraling upward, each polished and lacquered. Part trophy, part shrine. *Silhouette: a column studded with car shapes.* Ground: paved apron, foundry stacks trailing smoke.
- **Free Plainers — the Hull Post.** The hull of a captured landship stood upright on end, cable-braced, with more taken plating bolted on over the years. *Silhouette: a ragged vertical slab, leaning.* Ground: irregular perimeter wall, vehicle scars fanning across open grass.

---

## 10. Established Canon Objects

Generated and approved — treat as convention when producing anything adjacent.

- **Versari core cradle** — a sealed matte-grey cylinder, seamless and inert, held in a laminated cut-plate yoke with bolted clamps, copper bus bars, ceramic insulators, analog gauges. The keystone image of the entire setting; judge new work against it.
- **Versari lift emitter** — a sealed truncated cone with a flat dull-black aperture, in a machined saddle housing, with radiating heat scorch around the aperture. Scorch is what makes hover read as expensive rather than magical.
- **Versari helmet** — faceted, no curves, wraparound horizontal vision slot, layered brow, blank jaw, single right-side hinged cheek plate (a Dambaran lineage holdover).
- **Versari sword** — blade cut from flat plate: constant thickness, hard-edged bevels, machined channel with square shoulders, cut-angle tip, bolted hardwood scales on an exposed flat tang, one unused bolt hole from the plate's previous life.
- **Laker heavy cannon** — dark soot-blackened cast barrel with raised foundry numerals and an unground casting seam; polished steel recoil cylinders; cast steel carriage on leaf springs and rubber tires; chipped glossy dark green lacquer; cylindrical shells with copper bands.
- **Laker work harness** — heavy oil-tanned leather shoulder yoke over a bare torso, crossing straps, deep belt, rounded cast bronze hardware, scorched shoulder pad, coiled tarred rope.
- **Laker vehicles** — preserved lacquered classic-car bodywork, roof and doors cut away, crude welded roll bar and plate, lifted leaf-spring suspension, knobby tires on cast steel wheels.

---

## 11. Time Period and Scope (PABC)

PABC is the era section 1 dates: roughly two hundred years after the pole
shift. The factions exist but are still working out who they are. Boundaries
are unsettled, the Goldgrass Coalition and the Free Plainers are still
separate peoples, the Dambarans are a distinct people rather than a lineage
inside Versari society, and the consolidations that define the later era have
not happened yet. Where this document refers to a "later era," it means a
period after the one PABC plays in, not a different reading of section 1.

> **Revised.** This section previously placed PABC *earlier* than sections
> 1–10 because section 1 read "roughly a century." The author has since ruled
> the era at approximately two hundred years and section 1 now says so, which
> removes the offset. The downstream facts below were never dependent on the
> offset and are unchanged.

Downstream facts that matter for art:

- **Goldgrass and Free Plainers are distinct.** Their opposed fabrication
  logics (woven-and-stitched vs. accreted-and-bolted-on) are the correct
  read for this period. The later absorption of the Free Plainers into the
  Goldgrass has not occurred.
- **Landships are not yet Versari.** In this era they are recovered from
  the old world by whoever finds one, and all four factions operate them. The
  Versari consolidation of the fleet is a later development.
- The city-states of the later era — Omara, Kansit, Moyne, Linkor, Dambar, and
  the Shelf — remain canon. They simply have not driven any art yet.

**Game format: hex-tile strategy.** This raises the priority of section 9's
map-scale faction identifiers and of section 8's terrain reference, since both
translate directly into tile art. Reference sheets remain the format for
objects and figures, but map-scale work is the near-term need.

---

## 12. Landships

Landships **hover**. They are recovered pre-collapse objects, not
manufactured ones, which places them under Rule 3 rather than under any
faction's fabrication logic.

*The following is inferred from Rules 3 and 4 and is unconfirmed — treat as a
working proposal until an approved vessel image exists.*

- **The hull is old-world.** Seamless, matte, inert. Mathematically exact
  curves, perfectly flat planes, no fasteners, no panel lines, no visible way
  in. It carries none of a faction's manufacturing signature because no faction
  made it.
- **Faction identity lives in what is mounted to it.** Everything added is
  cradle work per Rule 4: yokes, saddles, clamps, bus bars, conduit, gun
  mounts, deck structure, crew shelter. A Versari vessel and a Laker vessel
  share an identical hull and are told apart entirely by the hardware bolted
  around it — laminated cut plate versus cast compound curves.
- **The mounting interface is the whole craft tradition.** Because the hull
  cannot be modified, every attachment is a clamping problem solved with
  precision and pride. This is the most distinctive image the vessels offer.
- **Hover is signaled by cost, not by light.** Per the lift emitter
  convention: scorch, heat discoloration, and heavy armored feed conduit
  running to the emitters. Nothing glows. No visible thrust, no dust plume
  effect, no floating-with-nothing-underneath.
- Section 5.4 applies in full — vessels need a proportion rule and continuity
  language, not a parts list.

**Open:** whether all recovered hulls share one design or fall into a small
number of recognizable classes. This should be decided before the first vessel
is generated, because the answer is baked into every subsequent image.

---

## 13. Text in Images

**Numerals only.** No words, letters, or script of any kind.

The generation model renders legible text well and will invent English
lettering wherever it sees an excuse — foundry marks, dial gauges, hull
markings, crates, signage. The world's own script has not been designed, so
any word it produces is canon-breaking and has to be regenerated.

Numerals are permitted and desirable where the doc already calls for them:
raised cast foundry numbers on Laker work, gauge faces, stenciled unit and
hull numbers. Keep them short — one to four digits.

Add to every prompt's negative block:

> No words, no letters, no lettering, no text, no writing, no signage, no
> labels. Numerals only.

---

## 14. Generation Settings

**Model:** `google/nano-banana-2` on Replicate. Not Nano Banana Pro — Pro's
advantage is text rendering and complex instruction-following, and text is
forbidden here.

**Resolution ladder.** Price is per output image and scales with resolution,
so resolution is the primary cost lever:

| Tier | Price | Use for |
|---|---|---|
| 1K | $0.067 | Exploration. Silhouette tests, composition checks, does-this-read-at-all. |
| 2K | $0.101 | Locking a design once composition and material are right. Default for anything that may become an anchor. |
| 4K | $0.151 | Approved work only, where the detail will actually be seen. |

Silhouette studies (section 5.6) always run at 1K — they are black shapes on a
horizon line and gain nothing from resolution.

**Aspect ratios:**
- Object and figure reference sheets — `1:1` or `4:3`
- Map-scale and hex-tile studies — `1:1`
- Landscape and city silhouettes — `16:9` or `21:9`
- Full-figure studies — `3:4`

**Other inputs:**
- `allow_fallback_model`: **off**. When enabled, requests that hit capacity are
  routed to a different model entirely, which silently breaks style continuity
  mid-session.
- `output_format`: `png` for reference sheets and anything with hard edges,
  `jpg` for landscape and atmospheric work.
- `image_input`: accepts up to 14 URLs. Free — cost is per output image only.

**One object per generation** (section 5.1) means a four-variant sweep is four
billed images. Budget accordingly: roughly fifteen exploration images per
dollar.

All outputs carry an invisible SynthID watermark. It does not affect
appearance but it is present in every file committed to the repo.

---

## 15. Anchor Registry

Generated files are deleted from the provider one hour after creation. Any
image intended for reuse must be saved and committed, or it is gone.

This matters most for section 5.3's kit-of-parts workflow: referencing a part
image in a later generation requires that part to be fetchable at a public URL
at generation time. Approved components live at:

```
concept/anchors/remnant-continent/
```

with an `ANCHORS.md` index recording, per image, its raw URL, what it is good
for, and what it should not be used for. That last field matters — an anchor
carries all of its qualities into a generation, including the wrong ones.

**Anchors should be shot clean.** The standard reference-sheet framing from
section 6 — plain grey background, flat even lighting — is what makes an image
usable as an anchor. Baked environmental lighting or a dramatic background
contaminates everything generated against it.

Section 10's canon objects are the intended first anchors. Any of them whose
source files no longer exist must be regenerated and re-approved before they
can be referenced.

---

## 16. Known Gaps

Tracked so they are not silently resolved by whatever gets generated first.

- ~~**No Goldgrass canon object.**~~ Closed 2026-08-11 by
  `goldgrass-quilted-cuirass-03.jpg` and `goldgrass-sunhood-01.jpg`. The
  woven-and-stitched logic is now proven against output, including the
  concealed-plate rule — a salvaged panel inside the quilting, read from
  outside only as a stitched outline and rows of rivet heads.
- ~~**No Free Plainers canon object.**~~ Closed 2026-08-11 by
  `plainer-figure-01.jpg` — accretion proven on a body: a sound coat carrying
  mismatched riveted patches, salvaged plate bolted flat without fitting, one
  unpaired pauldron. Maintained rather than ragged, which is the distinction
  that keeps it out of shantytown territory.
- ~~**No landship canon object.**~~ Closed 2026-08-11 by
  `versari-land-vessel-01.jpg` — a Versari hull with the continuous-plating
  form rule and hover skirt. Section 12 is no longer pure inference, though the
  vessel class question below is still open, and the anchor carries §13 text in
  its palette block.
- **No hex-tile terrain studies.** Section 8 describes four terrain types in
  prose; none has been generated as a tile.
- ~~**No figure canon outside Versari and Laker.**~~ Closed 2026-08-11 by
  `goldgrass-levyman-02.jpg`, `goldgrass-commander-01.jpg` and
  `plainer-figure-01.jpg`. All four factions now have at least one figure,
  though the Plainers have one only.
- **Vessel class question** — one hull design or several (section 12).
