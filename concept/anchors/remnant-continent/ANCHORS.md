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

> **Four anchors carry English lettering, in violation of §13.** They are
> marked **TEXT** below. Lettering in an anchor teaches the model that lettering
> belongs on the subject, which is the exact failure §13 exists to prevent.
> Attach them only for construction and material, always alongside §13's
> negative block, and never as the sole anchor on a shot with a labelable
> surface. Clean replacements are worth generating.
>
> **Anchors marked FRAMING** break §15's clean-sheet rule some other way —
> painted ground, studio lighting, a non-square crop. They are still usable for
> construction and material, but they carry their staging forward, so pair them
> with a clean anchor rather than letting one set the frame alone.

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

## Terrain

_None yet._
