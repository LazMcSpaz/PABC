# Anchor Registry — Remnant Continent

Approved reference images committed to this directory, indexed by raw URL.
Implements §15 of
[`../../style/remnant-continent-art-direction.md`](../../style/remnant-continent-art-direction.md);
generation settings are §14. Generated images are deleted by the provider one
hour after creation — if it is not committed here, it is gone.

**Paste the `URL` line straight into a prompt's `image_input`.** The model
fetches it by unauthenticated HTTP GET, so the file must be committed to `main`
before the URL resolves. Up to 14 inputs per generation; they are free (billing
is per output image). `raw.githubusercontent.com` is CDN-cached for a few
minutes, so curl a newly committed anchor once before relying on it in a
generation — and expect a deleted one to keep serving briefly after removal.

**Naming:** `<category>-<subject>-<nn>.<ext>` — lowercase and hyphens only, no
spaces, no underscores, no parentheses. Two-digit zero-padded sequence, never
reused: supersede by incrementing, never by overwriting, because old URLs may
already be cited here, in the art direction doc, or in a chat history. `.png`
for reference sheets and hard edges, `.jpg` for landscape and atmospheric work.

**Every entry needs its `Do not use for` line.** An anchor carries all of its
qualities into a generation, including the wrong ones; recording what an anchor
is bad at is what stops it being attached to a shot it will drag off-target.

> **Anchors marked TEXT carry English lettering, in violation of §13.** They
> are a third of the registry. Lettering in an anchor teaches the model that
> lettering belongs on the subject, which is the exact failure §13 exists to
> prevent. Note §13 does permit short numerals, and Laker cast marks are
> supposed to have them — it is the accompanying words that break canon.
> Attach them only for construction and material, always alongside §13's
> negative block, and never as the sole anchor on a shot with a labelable
> surface. Clean replacements are worth generating.
>
> **Anchors marked FRAMING** break §15's clean-sheet rule some other way —
> painted ground, studio lighting, a non-square crop. They are still usable for
> construction and material, but they carry their staging forward, so pair them
> with a clean anchor rather than letting one set the frame alone.
>
> **Anchors marked NOT CANON** are working references kept to generate the real
> object against, not approved designs. They carry a `wip-` prefix instead of a
> faction one so they cannot be mistaken for canon later. Attach them for the
> one mechanical idea they get right and say what that is; never let one stand
> alone on an approved shot.
>
> **Anchors marked VERSION N, NOT FINAL** are a legitimate design pass, usable
> as an anchor now, but the author has flagged it as provisional rather than
> settled. Unlike NOT CANON, these keep their faction prefix — they may well
> become canon once refined. Treat anything they establish as subject to
> change until a later-numbered version confirms or supersedes it.

Entry format:

<!--
## versari-core-cradle-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-core-cradle-01.png
Use for: laminated cut-plate yoke construction, bolted clamp detail, bus bar and insulator treatment
Do not use for: figure scale, environment lighting
Added: YYYY-MM-DD
-->

---

## Vessels

## landship-turnaround-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/landship-turnaround-01.png
Use for: the landship hull as geometry — eight views round the same form as `landship-base-01.jpg`, untextured, so bow taper, deck plan, flank slot and the open stern read without material getting in the way. This is the sheet to hand a Blender agent under §5.6, and the one to attach when a generation needs the hull from an angle the painted anchor does not show
Do not use for: **FRAMING** — a near-black ground, further from §15's clean grey than any other anchor, so it will darken and contaminate anything it leads. Also no material, finish or colour information whatsoever: it is form only, and each view is small in a 2538×266 strip, so there is little detail to take
Added: 2026-08-11

## landship-base-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/landship-base-01.jpg
Use for: the bare landship hull before anything is built on it — §5.4's form rule made explicit, one continuous armored form with plating unbroken from the rounded bow to the stern and no seam anywhere along it. The lift emitter row recessed into the flank rather than hung off it, the chamfered skirt, the deck left flat and empty with only its mounting hardpoints showing, and the dust plume that sells ground clearance. Attach this first when generating any vessel, then describe only the superstructure
Do not use for: **FRAMING** — this sits on painted ground under a hazy sky rather than §15's plain grey, so it carries an environment and its light into anything it anchors; pair it with a clean sheet. Also carries no faction: it is deliberately unmarked primer, so it will not supply Versari, Laker, Goldgrass or Plainer identity
Added: 2026-08-11

## versari-land-vessel-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-land-vessel-01.jpg
Use for: the one continuous armored hull form §5.4 asks for — faceted plating carried unbroken bow to stern with no seam at the raised bow; the hover skirt and its dust plume; deck furniture recessed rather than hung; the human silhouette as a scale key
Do not use for: **TEXT** — the palette block is misspelled English ("BLUGT'ARED", "BLUINING", "BUST" for bus bar) and will propagate lettering; also not for close material detail, which is too small here to read, nor for the grey-ground framing, since this one carries a painted ground and sky
Added: 2026-08-11

## versari-hull-module-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-hull-module-01.jpg
Use for: a deckhouse or superstructure box as faceted chamfered plate; the stacked-plate slot band carried onto architecture rather than armor; bolt rows rationed to panel edges; conduit entering from underneath
Do not use for: scale, which is genuinely ambiguous in this image — nothing in frame fixes whether this is a metre or five metres across; also not for weathering, which is lighter here than the rest of the set
Added: 2026-08-11

---

## Figures

## base-figure-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/base-figure-01.png
Use for: proportion and pose only — a bare neutral base mesh, arms spread, no faction, no clothing, no armor. Attach this first on any figure generation the way `landship-base-01.jpg` anchors vessel hulls, then spend the prompt on what dresses it, not on the body underneath
Do not use for: **FRAMING** — the ground is dark charcoal rather than §15's pale flat grey, and it will darken anything it leads; pair with a clean anchor. Also carries no faction whatsoever, no clothing, no material, and the wide arms-out pose does not match how any figure in this registry is actually posed, so do not expect it to fix a stance, only a build
Added: 2026-08-30

## dambaran-son-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-son-01.png
Use for: a young Dambaran male, per the author — build and face only, arms spread for proportion the way `base-figure-01.png` works for a generic body. Bald/buzzed hair, lean rather than heavy build, unmarked skin
Do not use for: **FRAMING** — flat cel-shaded vector rendering, a different illustration style from every painted sheet in this registry; it will pull line and shading toward that style if it leads a generation. Also not for garment reference — the dark trunks are a modern real-world underwear silhouette with no in-world manufacture behind them, so take face and proportion from this and nothing from the waist covering. Not clothed or armored in any Dambaran material, so it establishes no fabrication logic on its own
Added: 2026-08-30

## plainer-figure-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/plainer-figure-01.jpg
Use for: §4's accretion logic proven on a body — a sound leather coat with three generations of mismatched panels patched and riveted onto it, salvaged plate bolted flat over a shirt with no attempt to fit it, one lone pauldron with no partner, chain-and-shackle hardware doing a belt's job. Competent and maintained, not ragged: this is the anchor that keeps the Plainers out of shantytown territory
Do not use for: matched or symmetrical kit of any kind — every element here is deliberately unpaired; also not for the Versari and Goldgrass palettes, since this figure is almost entirely browns
Added: 2026-08-11

## laker-laborer-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-laborer-01.jpg
Use for: §4's "armor is for the fearful" read — bare chest under an open filthy coat, foundry-labourer bulk, and §5.8's selective finish at its clearest: one lacquered shoulder cap kept bright against a figure that is otherwise grease, soot and canvas stain throughout
Do not use for: **TEXT** — garbled callouts ("DEEPIR LEATHER BELT", "SAUST, CAST HEAD"); also not for the Versari or Goldgrass silhouettes, which are covered and layered where this is deliberately exposed
Added: 2026-08-11

## laker-laborer-sheet-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-laborer-sheet-01.jpg
Use for: the harness worn on a body at full length, scorched shoulder pad and bronze buckle wear called out in detail crops, and the barbed steel harpoon as a Laker polearm
Do not use for: **TEXT** — the heaviest lettering in the set, including a detail crop whose entire subject is a lettered badge, plus corrupted headings ("Laborer–Sold:", "Heavy-bladd knife"). Anchor the figure or the harness instead and take the harpoon from here only by description
Added: 2026-08-11

## goldgrass-commander-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-commander-01.jpg
Use for: §4's "their metal is somebody else's" rule at its clearest — an angular faceted cut-plate pauldron and a rounded cast hip plate worn on the same body, mismatched by origin and rope-lashed on rather than strapped or bolted; patchwork quilting in ochre, cream and madder as blocks of differing cloth; rank read through accumulated salvage rather than through insignia; an older, weathered face
Do not use for: fitted armour — every plate here is tied on and sits proud of the body, which is the point and will fight any close-fitted design; the levy silhouette, which is softer and unplated
Added: 2026-08-11

## goldgrass-saddle-horse-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-saddle-horse-01.jpg
Use for: textile-first tack — a quilted saddle pad with braided cord edging and woven madder-and-gold banding, plaited rope bridle and reins, and metal admitted only where it cannot be avoided, at the stirrup and bit; full side profile against a clean grey ground
Do not use for: the horse's own build or colour as breed canon, which has not been decided; ridden poses, since this is a standing profile with no rider
Added: 2026-08-11

## goldgrass-levyman-02.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-levyman-02.jpg
Use for: the full Goldgrass silhouette — soft bulky outline with no hard edge, quilted cuirass and sunhood worn on a body, woven madder-and-gold banding at collar, hem and sash, loose cream trousers and soft shoes; a farmer levied rather than a soldier, unarmoured at the arms; the reforged scythe carried at rest as a scale key
Do not use for: plate armour of any kind; the head covering here is simplified against goldgrass-sunhood-01 and should not override it
Added: 2026-08-11

## versari-soldier-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-soldier-01.jpg
Use for: the full Versari silhouette — plate over a green wool greatcoat, skirted below the belt; how cuirass, pauldron and vambrace sit on a body; strap-and-buckle attachment; the muted green-and-steel palette at figure scale
Do not use for: face or head detail at close range; the helmet here is simplified against versari-helmet-01 and should not override it
Added: 2026-08-11

## versari-soldier-sheet-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-soldier-sheet-01.jpg
Use for: the shorter tunic loadout as distinct from the greatcoat; two-view figure pairing on one sheet; polearm proportion against a standing figure
Do not use for: **TEXT** — this sheet is entirely annotated, and the model rendered its own prompt placeholders ("ref. <Image 1>") into the image; it will drag callout lines and labels into anything it anchors. Also not for §5.1's one-subject rule, since two figures share the frame and both lose fidelity
Added: 2026-08-11

---

## Objects

## laker-drop-hammer-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-drop-hammer-01.jpg
Use for: the Drop Hammer, and §10's heavy cannon — soot-blackened cast barrel with the casting seam left unground, polished steel recoil cylinders, an interrupted-screw breech, riveted cast carriage on rubber tires, chipped dark green lacquer with rust weeping from the fasteners, and cylindrical shells with copper driving bands. §7's Age-of-Sail trap avoided on every count
Do not use for: **TEXT** — faint raised lettering on the barrel alongside the numerals. Also not for §5.1's one-subject rule, since crew share the frame, and note the crew are cropped, so this is not a scale reference
Added: 2026-08-11

## laker-shoulder-cap-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-shoulder-cap-01.jpg
Use for: cast-and-poured logic on a small object — a swollen compound curve with no facet anywhere, deep oxblood lacquer rubbed through to bright metal along the rolled edge, and an interior left raw with casting pits and a sprue scar, which is §4's rule that the back and underside stay unground. Outside and inside on one sheet
Do not use for: **TEXT** — the cast mark reads "MAKER 5072" where §13 permits the numerals only, and the sheet carries a title label. Also not for Versari work, which it will round off
Added: 2026-08-11

## laker-work-harness-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-work-harness-01.jpg
Use for: §10's work harness in isolation — heavy oil-tanned leather shoulder yoke over a bare torso, crossing straps, deep belt, rounded cast bronze hardware, coiled tarred rope; the neutral mannequin makes it readable as a kit part rather than as a character
Do not use for: **TEXT** — the chest badge reads "FOUNDRY 14 MAKER 02". Also **FRAMING** — this is a clean 3D render with studio lighting and an untextured grey figure, so it will pull output toward CG surfacing and away from the painted sheets
Added: 2026-08-11

## laker-droit-iron-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-droit-iron-01.jpg
Use for: the Droit Iron, and §4's vehicle rule — the body is the heirloom and everything else is field-replaced. Preserved deep oxblood lacquer on the panels the owner cares about, roof and doors cut away, crude welded roll bar and riveted plate patching where the lacquer is gone, lifted suspension on knobby tires and plain steel wheels. Chrome kept bright at the bumper while the rear quarters go to mud and rust
Do not use for: figure scale. One of the few anchors in the set with no lettering at all, so it is safe to pair with the text-bearing Laker sheets
Added: 2026-08-11

## laker-chrome-hauler-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/laker-chrome-hauler-01.jpg
Use for: the Chrome Hauler — a heirloom cab in hand-rubbed green lacquer married to a rough-welded fabricated steel bed, the same selective-care logic as the Droit Iron at working-truck scale; integrated front winch, racked cans and toolboxes, canvas tilt on bent stanchions
Do not use for: **TEXT** — a full callout layer, and worse, a real-world manufacturer's name rendered on the grille badge. That name has to go before this is used for anything, and it should not be named in a prompt. Also not for §5.1's one-subject rule, given the detail crops
Added: 2026-08-11

## plainer-crossbow-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/plainer-crossbow-01.jpg
Use for: the canon replacement for `wip-crossbow-01.jpg`, and a worked example of accretion applied to a weapon — a heavy split-timber prod and stock with steel straps bolted along the limbs to take the load, wire cable string, turnbuckles for tension, a bare bent-steel trigger lever and no guard. Every part is doing structural work and nothing is decorative
Do not use for: fine machining or fitted joinery, which this deliberately lacks; figure scale
Added: 2026-08-11

## plainer-cart-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/plainer-cart-01.jpg
Use for: accretion at object scale — a timber frame with steel corner straps and oversized bolts, body panels riveted up from mismatched salvaged sheet in different metals and paint states, leather panniers patched from unmatched hides, and two wheels that do not match each other. Sound and in service, not derelict
Do not use for: symmetry or matched sets of any kind; also not for Versari or Laker construction, which it will scruff up on contact
Added: 2026-08-11

## wip-weather-machine-active-04.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/wip-weather-machine-active-04.jpg
Use for: **NOT CANON, TEMPORARY** — the same object as `oldworld-weather-machine-01.jpg`, stood on end, installed and running. Kept as a working reference while the design changes; the number follows the author's own iteration, so a later pass lands as `-05`. What holds up: the seamless cone against a hand-built cradle of copper bus bars and ceramic insulators, the scale figures at the base, and the storm answering overhead
Do not use for: **§3 RULE 3** — glowing apertures and visible electrical arcing are exactly what the doc forbids, which says advanced tech reads as precision and never as light. This is the anchor most likely to teach the model the wrong lesson about old-world power, so do not attach it to anything approved. Also **FRAMING**: dramatic dark interior lighting, the opposite of §15's clean flat grey
Added: 2026-08-11

## wip-crossbow-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/wip-crossbow-01.jpg
Use for: **NOT CANON, SUPERSEDED** — the stepping stone that produced `plainer-crossbow-01.jpg`, which carried its strap-reinforced limbs, cable string and turnbuckles forward and dropped the stock. Kept only as a record of that step; reach for the Plainer one instead
Do not use for: anything final, and never as the sole anchor on an approved shot. It carries no faction fabrication logic — the sporting-rifle stock and trigger guard in particular belong to no one in §4 — so it will drag output toward a generic modern crossbow, which is the exact §5.2 trap of naming an object type with a famous instance
Added: 2026-08-11

## oldworld-weather-machine-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/oldworld-weather-machine-01.jpg
Use for: pre-collapse manufacture at large scale, and §3's rule that advanced tech reads as PRECISION and never as light — a seamless swept hull with no fastener, no panel line and no visible method of assembly anywhere, a single machined slot, plain circular apertures, and a surface that gives away nothing about how it was made. The scale figure is the point: it fixes this at roughly ten times a person, which is what makes it read as inherited rather than built. Two views, including the open end showing the hull is a shell
Do not use for: any faction's fabrication logic — it is deliberately outside all four, so it will erase Versari faceting and Laker casting alike if allowed to lead; also not for weathering, since the only aging here is the rust bleed at the band joints
Added: 2026-08-11

## oldworld-lockpick-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/oldworld-lockpick-01.png
Use for: pre-collapse precision at hand scale, the small-object counterpart to `oldworld-weather-machine-01.jpg` — a seamless machined cylinder, a counterbore socket at one end, a single milled slot, and plain grip bands with no maker's mark or fastener anywhere. Factionless per the author; nothing about it should be read as belonging to any of the four
Do not use for: large-scale or architectural work, and not for anything that needs visible wear beyond the light scoring already on the surface — it reads closer to maintained than salvaged
Added: 2026-08-30

## goldgrass-quilted-cuirass-03.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-quilted-cuirass-03.jpg
Use for: the core Goldgrass statement in §4 — thickness built in layers of quilted cloth rather than plate, soft bulky outline, no hard edge anywhere; the concealed-plate rule read exactly right, a salvaged panel sandwiched inside the quilting and betrayed only by its stitched outline and two rows of rivet heads; madder-and-gold woven geometric banding at collar, armscye and hem; the warm ochre-to-cream palette that makes Goldgrass the only faction with color; front and side pairing
Do not use for: anything Versari or Laker — it will soften faceted plate and flatten cast curvature on contact; figure scale. Note this is the only 2K anchor in the set, so it carries more surface detail than its neighbours
Added: 2026-08-11

## goldgrass-tilt-wagon-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-tilt-wagon-01.jpg
Use for: the trading-nation vehicle — a quilted tilt stretched over hoops and laced down to the body rail, carrying the same diamond quilting and woven banding as the armour, so the cloth logic reads at vehicle scale; plain timber body with no metal skin; full side elevation
Do not use for: the running gear, which is conventional wooden wheels and will pull output pre-industrial; also not for §5.1's one-subject rule, since the draught pair shares the frame
Added: 2026-08-11

## goldgrass-scythe-02.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-scythe-02.jpg
Use for: §4's weapon rule made literal — a reforged agricultural head bought on its own and bolted to a locally made haft, the join left as a plain strap collar on two rivets; cord lash wrapping in bands with madder accents; the worn tool blade with its unground back and cutout, somebody else's metal on Goldgrass work
Do not use for: **FRAMING** — the ground here is painted, with brushwork and bare canvas weave showing at the edges, not §15's plain flat-lit grey; it will carry canvas texture and painterly facture into anything it anchors. This is also the only anchor in the set that is not square (896×1200), so it will bias composition toward a portrait crop
Added: 2026-08-11

## goldgrass-sunhood-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/goldgrass-sunhood-01.jpg
Use for: quilted crown-and-brim construction with a loose neck drape; the woven band applied at both brim edge and drape hem; sun-bleached cream-to-ochre gradient with dust soiling worked up from the hem; front and three-quarter pairing
Do not use for: any structural or load-bearing read — this is entirely soft goods with no plate at all, and as an anchor it will suppress the concealed-plate rule the cuirass establishes; head shape or face
Added: 2026-08-11

## versari-core-cradle-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-core-cradle-01.jpg
Use for: §10's keystone object — the sealed seamless matte-grey cylinder, inert and featureless, in a laminated cut-plate yoke with bolted clamps, copper bus bars, ceramic insulators and analog gauges. Judge new Versari work against this one
Do not use for: **TEXT** — the gauge panel reads "FLUX LEVEL / TEMP / CONTACTOR STATUS"; crop or counter-prompt it. Also not for figure scale or for exterior lighting, since this is an interior installation shot
Added: 2026-08-11

## versari-lift-emitter-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-lift-emitter-01.jpg
Use for: §10's lift emitter — sealed truncated cone, flat dull-black featureless aperture, machined saddle ring, and the radiating heat scorch that makes hover read as expensive rather than magical; two-view orthographic pairing
Do not use for: **TEXT** — a full callout layer with a title block, the heaviest lettering in the set. Also not for the painted-sheet rendering style, since the annotation flattens it
Added: 2026-08-11

## versari-emitter-glove-02.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-emitter-glove-02.png
Use for: cut-and-bolted logic on a small powered device — flat faceted plates bolted in regular rows onto the back of a worn leather work glove, a machined mechanism block, and an armored hose and braided cable tethering it to an off-body power source. Wrist strap-and-buckle mounting matches the rest of the Versari kit
Do not use for: settled canon on powered wearables — §5 Rule 5 states soldiers are entirely unpowered and power lives on vehicles or fixed installations, so this glove sits right at that boundary. Treat it as provisional until the art direction doc confirms whether a tethered hand tool is meant to be an exception. Numbered 02 — an 01 exists on the author's side but is not yet in this registry
Added: 2026-08-30

## versari-sword-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-sword-01.jpg
Use for: §10's sword — blade cut from flat plate at constant thickness, hard-edged bevels, machined channel with square shoulders, cut-angle tip, bolted hardwood scales on an exposed flat tang, and the single unused bolt hole from the plate's previous life. The clearest statement of cut-and-bolted in the set
Do not use for: figure scale; and note the render is cleaner than the painted sheets, so it will pull toward CG surfacing
Added: 2026-08-11

## versari-bolt-thrower-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-bolt-thrower-01.jpg
Use for: crew-served weapon staging — two figures working one machine at consistent scale; armored conduit and cable runs as a visual element; the wheeled plate carriage; ammunition crates as set dressing
Do not use for: the §7 medieval trap — the bow-limb form is the one object here that risks reading as a siege engine, and it should not be anchored to anything that could tip that way; also not for §5.1's one-subject rule
Added: 2026-08-11

## dambaran-helm-02.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-helm-02.png
Use for: the source of the lineage detail §10 calls out on the Versari helmet — this is the Dambaran original the single right-side hinged cheek plate was inherited from. Full horned brow flanges, mottled hammered surface rather than laminated flat plate, hinged cheek, horizontal vision slot, leather chin strap
Do not use for: interchangeably with `versari-helmet-01.jpg` or `-02.jpg` — the silhouettes read close enough at a glance that a prompt or a viewer could mix them up, so name the faction explicitly whenever this one is in play. Numbered 02 — an 01 exists on the author's side but is not yet in this registry
Added: 2026-08-30

## dambaran-armor-pair-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-armor-pair-01.png
Use for: Dambaran metalwork on the body — a rounded dome pauldron and a chamfered-block vambrace, both in the same mottled hammered finish as `dambaran-helm-02.png`, strap-and-buckle mounting throughout. Establishes that Dambaran fabrication tolerates compound curves the way Versari's cut-and-bolted logic does not, despite the two sharing the cheek-hinge lineage detail
Do not use for: a single generation — two objects share this sheet against §5.1's one-per-generation rule, so treat the pauldron and vambrace as separate subjects when prompting from it
Added: 2026-08-30

## dambaran-carbon-shield-03.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-carbon-shield-03.png
Use for: a salvaged rusted plate, riveted at its edges, mounted on a black herringbone-woven backing with the fabric fraying and torn at the edges — reuse of what the name implies is an old-world composite material as a shield backing
Do not use for: settled canon on Rule 2 — salvage-vs-quarry says the old world is milled into new stock, not nailed on as a found object, and this piece reads as the found-object version. Confirm with the author whether the Dambarans get an exception to that rule before treating this as settled rather than provisional. Numbered 03 — 01 and 02 exist on the author's side but are not yet in this registry
Added: 2026-08-30

## dambaran-machete-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-machete-01.png
Use for: a Dambaran edged weapon — thick flat blade with a squared cleaver-like tip, a fuller cut down each face, the same mottled hammered finish as `dambaran-helm-02.png` and `dambaran-armor-pair-01.png`, a cord-wrapped grip, and an integrated squared pommel in one piece with the blade. A small numeral marking near the ricasso is the good version of §13 — numerals only, no words
Do not use for: a bladesmithing tradition distinct from Versari's — compare against `versari-sword-01.jpg` to keep the two apart: that one is cut from flat plate with bolted hardwood scales on an exposed tang, this one reads as a single forged and finished piece with no visible fastener at the grip
Added: 2026-08-30

## versari-helmet-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-helmet-01.jpg
Use for: faceted crown planes meeting at hard chamfers with no compound curve anywhere; the laminated stacked-plate brow above the vision slot (§4's rank marker); bolt rows rationed to vertical strap joints only; the single hinged cheek plate; matte uneven bluing ground bright at wear edges
Do not use for: rendering style — this is a 3D render and will push output toward clean CG surfacing rather than the painted sheets; figure scale; the rear closure of the vision slot, which this angle does not show
Added: 2026-08-11

## versari-helmet-02.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-helmet-02.jpg
Use for: metal-over-soft-goods mounting — faceplate and jaw plate bolted to a leather cap; brow lamination read from two angles on one sheet; chin strap and buckle hardware; the front/three-quarter view pairing itself
Do not use for: full-helm silhouette, since the crown here is leather rather than plate; the §4 wrap-around slot icon, which terminates at the faceplate edge on this design; rank reading, since the brow layers belong to the faceplate rather than a stacked crown
Added: 2026-08-11

## versari-pauldron-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-pauldron-01.jpg
Use for: overlapping faceted lames on a shoulder; laminated stacked-plate edge trim matching the helmet brow; leather strap-and-buckle mounting to the body; outboard/inboard view pairing
Do not use for: bolt density — this piece is nearly bolt-free and will suppress the rationed-bolt language §4 wants elsewhere; head hardware; figure scale
Added: 2026-08-11

## versari-sunrunner-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-sunrunner-01.jpg
Use for: the Sunrunner — light open-frame chassis in cut and welded flat stock with triangulated members; the tilting panel canopy and its clamp mounts; wire-spoke wheels; stowed canvas and battery-bank detail
Do not use for: the anchor framing standard — this is a studio product render with a gradient ground and a soft cast shadow, not §15's plain flat-lit grey, so it will bake studio lighting into anything it anchors
Added: 2026-08-11

## versari-sunhauler-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-sunhauler-01.jpg
Use for: the Sunhauler — the heavy four-wheel plate-body counterpart to the Sunrunner; exposed battery bank with copper bus bars and ceramic insulators at vehicle scale; telescoping canopy stanchions; heavy spoked wheels
Do not use for: the running gear, which is closer to a horse-drawn wagon than the Sunrunner's engineered frame and will pull output pre-industrial; figure scale
Added: 2026-08-11

---

## Architecture

Korad building work is its own vocabulary, distinct from both Versari object
fabrication and Dambaran terrain: cast rubble-aggregate block in grey-buff,
flat roofs behind parapets, plain string courses at floor lines, small
repeated openings, and rough timber with hand-rolled steel for lintels and
canopies. §3's Rule 1 does the heavy lifting — identical windows and uniform
courses are what make it read as a workshop that made a hundred of them
rather than as improvisation. Salvaged pre-collapse steel appears only as
Rule 2 wants it, re-milled into standard stock rather than nailed on as
found objects.

## dambaran-entryway-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-entryway-01.png
Use for: a Dambaran wall opening, distinct from Korad per the user — coursed pale stone in irregular blocks rather than cast rubble-aggregate, a single massive lintel, iron ring-bolts along the top course, and door and jamb protection built as riveted flat steel straps rather than cast or cut plate. First Dambaran anchor in the registry; note it predates PABC's timeline, where §11 has the Dambarans as a people distinct from the Versari, so treat this as their own architectural language rather than early Versari work
Do not use for: roof, massing or overall building form, which this crop does not show; also not for Korad work, which the user has drawn as a separate vocabulary from this
Added: 2026-08-28

## dambaran-hall-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-hall-01.png
Use for: **VERSION 1, NOT FINAL** — per the user, this is a first pass, expect it to be superseded by `dambaran-hall-02.png` or later. Until then it is the only Dambaran anchor at hall scale: a colonnaded open interior in the same pale coursed stone as the entryway and tower, plain square piers with the vocabulary's iron ring-bolts repeated down each one, a stepped sunken floor area, and a single framed door of pierced ironwork facing into the room. Boulder base at the near corner ties it to the same construction as the tower
Do not use for: settled Dambaran canon — treat anything decided here as provisional until a later version confirms or changes it. Also not for exterior massing, since this is an interior cutaway with the near long wall removed
Added: 2026-08-28

## dambaran-tower-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/dambaran-tower-01.png
Use for: the Dambaran vertical type, matching `dambaran-entryway-01.png`'s vocabulary at building scale — coursed pale stone giving way to massive uncoursed boulder at the base, iron ring-bolts along the roof parapet, a barred iron gate with riveted steel jamb straps identical to the entryway's, small punched window openings, and a corbelled wooden lookout box jettied off the upper wall. The base-to-ashlar transition is the clearest single cue that separates this from Korad's uniform cast block
Do not use for: a freestanding design on its own — treat it as the taller companion to the entryway rather than a separate structure. Compare against `korad-tower-01.jpg` when the two need to be told apart in a prompt
Added: 2026-08-28

## korad-terrace-row-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/korad-terrace-row-01.jpg
Use for: repetition as the civilization signal — a row of identical two-storey units stepping down a slope, every window and door the same size and spacing, one parapet profile carried across all of them, external downpipes to a shared line. The cleanest statement of §3 Rule 1 in the set, and free of lettering
Do not use for: monumental or civic scale, since this is ordinary housing; also not for interiors
Added: 2026-08-11

## korad-courtyard-block-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/korad-courtyard-block-01.jpg
Use for: the courtyard plan — a solid defensible block turned inward around an open court, one heavy timber cart gate as the only wide opening, roofs pitched inward, clerestory strips under the eaves, small barred windows outside. Cutaway from above so the plan reads. Also free of lettering
Do not use for: street frontage or facade design, since the point of this building is that it presents a blank wall outward
Added: 2026-08-11

## korad-column-block-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/korad-column-block-01.jpg
Use for: the one piece showing salvaged pre-collapse structure in a building — three storeys of cast block carried on a colonnade of re-milled steel columns with seamless joints and no visible fastener, sitting on plain block pads. §3 Rules 2 and 3 at architectural scale, and a taller massing than the rest
Do not use for: **TEXT** — a full callout layer, much of it corrupted into non-words ("neve-buff tones", "No nein of, handi screos"). Anchor the massing and the colonnade, never the sheet
Added: 2026-08-11

## korad-tower-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/korad-tower-01.jpg
Use for: the vertical type — a battered square tower in banded courses with a string course per floor, a rooftop parapet, an access hatch, and a hand-rolled steel mast. Useful as a landmark silhouette against open country
Do not use for: **TEXT** — callouts plus a title block, and the title has invented a garbled proper noun for the building type. That name is not canon and should not be adopted from this image
Added: 2026-08-11

## korad-water-catchment-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/korad-water-catchment-01.jpg
Use for: infrastructure rather than a building — stepped hillside catchment aprons in the same block, channels and stairs between terraces, small valve houses, and a covered cistern structure at the foot. Shows the civil-engineering side of the vocabulary, which nothing else in the registry covers
Do not use for: **TEXT** — a title and a garbled descriptive paragraph across the top, plus lettered ELEVATION and SECTION insets. Also a grey panel ground rather than §15's clean sheet
Added: 2026-08-11

## plainer-building-01.jpg
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/plainer-building-01.jpg
Use for: Plainer construction at building scale — board siding against corrugated sheet on the same structure, a canvas awning on lashed timber poles as a bolted-on later addition, plain strap hinges and shuttered openings. Maintained and weathertight, which is the §4 distinction that keeps it out of shantytown territory
Do not use for: the accretion depth §4 asks for — this is a single tidy structure without the three-generations-of-additions read, so it understates the logic and should be paired with `plainer-cart-01.jpg` rather than anchoring a settlement alone
Added: 2026-08-11

---

## Terrain

_None yet._
