# Oldworld weather machine — what the asset needs from the pipeline

> **Answered, 2026-08-21.** All three asks are implemented and the asset is on
> the board. The shape landed on: the source json declares `"livery": "none"`,
> and what the manifest carries is the *consequence* — no `mask` key at all —
> so every reader downstream needs no notion of livery, only "is there a mask".
> `build-units.mjs` skips the existence check and the copy (and now fails loudly
> if an asset declares `livery: "none"` and ships a mask anyway);
> `check-unit-art.py` skips the load and the livery computation, printing
> `ownerless — no livery` instead of `0.0%`; `weather_machine` is in
> `NON_UNIT_KEYS`. The all-black placeholder mask is deleted.
>
> **A fourth site this document did not catch:** `check-unit-sprites.mjs` also
> walks `[sheet, mask]` per variant and reported `mask: will not decode` for the
> missing file. Same fix, same rule.
>
> **On §3's open question** — `neutral` pseudo-faction, kept. Nothing enumerates
> `manifest.units`; every read is `manifest.units?.[faction]` with a known id, so
> the placement costs nothing, where a section beside `units` would put a branch
> in every reader for one asset. `NON_UNIT_KEYS` is what stops it being
> selectable, which is the half that actually mattered.
>
> **§4 needed no action** — 14.4 stands, and `build-units.mjs`'s below-anchor
> check passes it with 10px of margin rather than 0.7.
>
> Where it is drawn: `src/prototype/RainmakerMark.jsx`. Because the asset carries
> no owner colour, whose it is is said on the GROUND — a faction-coloured contact
> ellipse sized off `footprintMetres`, absent entirely when nobody holds it.
> Facing comes from the bearing of the convoy's last step, recorded on the device
> as `fromHex` rather than derived from the carrier, because once the machine is
> put down there is no carrier left to ask.

Written for the game side. Nothing here is a defect report: `check-unit-art.py`,
`build-units.mjs` and `unitSprites.js` were written for a world where every drawn thing
belongs to a faction, and that was true of everything that had shipped. The weather
machine is the first asset with no owner at all, so it falls outside assumptions that
were correct when they were made.

**What the asset is.** A unique Oldworld quest item transported across the map on carts.
One sheet, eight rows, on the `vehicle_t2` grid (320x256, anchor 160,176), filed under a
new `neutral` art directory. Neutral livery by ruling: pale hull, wood cradle, black
wheels, rope lashing. No faction variants, no std/vet/str variants, and **no owner colour
anywhere** — so there is no mask to author.

---

## 1. The mask cannot simply be omitted — it is a build failure, not just a lint one

This is worse than it first looks. `build-units.mjs` requires the file to exist:

```js
for (const img of [sheet, mask]) {
  if (!existsSync(path.join(dir, img))) { fail(`${faction}/${unit}/${v}: missing ${img}`); continue; }
```

and `fail()` short-circuits `main()` before the manifest is written:

```js
if (problems.length) { ...; process.exitCode = 1; return; }
```

`build-units.mjs` runs on `predev` and `prebuild`. A missing mask therefore breaks
`npm run dev` and `npm run build` for everyone and leaves `unitSprites.json` stale — it
does not merely produce a red line. Separately, `check-unit-art.py` opens the mask
unconditionally, so it would raise rather than report.

**What shipped in the meantime.** An all-black mask: 3200x2048, zero pixels above the
threshold. That is not livery invented to pass a check — it is the honest encoding of
"this asset has no owner region" in a schema with no way to say so, and it makes the
validator report `livery is 0.0%` loudly rather than crashing. It should be deleted once
item 2 lands.

**Ask:** let the manifest declare that an asset has no mask, and have both
`build-units.mjs` and `check-unit-art.py` honour that — skip the existence check, the
copy, the load, and the `livery` computation.

## 2. `LIVERY_FLOOR` needs a no-owner path, keyed off the manifest

```python
LIVERY_FLOOR = 25.0   # §8: masked area wants to be a quarter of the silhouette or more
...
if livery < LIVERY_FLOOR:
    problems.append(f"{name}: livery is {livery:.1f}% of the silhouette, under the ...")
```

The floor is right for anything a player must identify as *theirs*. It cannot apply to an
asset nobody owns. Derive the exemption from the manifest — an entry-level
`livery: "none"`, or the absence of a `mask` key — rather than a hardcoded name list. A
name list needs editing again for the next ownerless asset; a manifest flag does not.

## 3. `NON_UNIT_KEYS` is not precedent for an ownerless asset

`unitSprites.js` already has a notion of *not a unit*:

```js
const NON_UNIT_KEYS = new Set(["tollbooth"]);

export function structureFor(faction, key) {
  return (NON_UNIT_KEYS.has(key) && manifest.units?.[faction]?.[key]) || null;
}
```

But `structureFor` still indexes `manifest.units[faction][key]`, and the tollbooth ships
as four faction tints — it has an owner, it just isn't chip-selectable.

**What shipped in the meantime.** A `neutral` art directory, so the entry lands at
`manifest.units.neutral.weather_machine`. Nothing enumerates `manifest.units` — every
read is `manifest.units?.[faction]` with a known id — so this is inert, and
`check-unit-variants.mjs` passes unchanged. It is a placement, not a design.

**Ask:** decide whether ownerless art belongs under a `neutral` pseudo-faction or in a
section beside `units`, and add `"weather_machine"` to `NON_UNIT_KEYS` so no chip
combination can select it. The second half is wanted either way.

## 4. `footprintMetres` is 14.4, and that is deliberate

Measured plan radius is **7.21 m**, so the honest footprint diameter is **14.42 m**;
14.4 is what shipped.

| declared | below-anchor allowance | measured reach | margin |
|---|---|---|---|
| 12.6 m (the other t2 art) | 65.7 px | 65 px | **0.7 px** |
| 14.4 m (shipped) | 75.0 px | 65 px | 10.0 px |

At 12.6 it would pass by less than a pixel, which is a coincidence rather than a margin.
The larger figure also sizes the slot chooser and hit target correctly — per §10.1 the
hex ring adapts to the widest unit present, and this asset is wider than a landship by
ruling.

---

## Measured state as shipped (all eight rows, t2 grid)

| check | tolerance / band | measured | verdict |
|---|---|---|---|
| clipping | 0 cells | 0 of 80 | pass |
| row 0 offset | 4.0 px | -0.5 px | pass |
| drift | 12.0 px | 6.5 px | pass |
| straight alpha | RGB > A somewhere | true, 8.92% partial | pass |
| see-through | 0.124 - 0.348 | 0.157 - 0.303 | pass |
| stdL | 0.0999 - 0.1284 | 0.1093 - 0.1655 | 6 of 8 in band |
| area spread | (no stated limit) | 1.39x | — |
| livery | >= 25% | 0.0% by ruling | **needs items 1 and 2** |

Envelope use: 133 px of 159 across, 117 px of 176 above, 65 px of 79 below.

The two rows outside the stdL band are `s` (0.1359) and `n` (0.1655), both above the top
rather than below — end-on facings where the open hollow rear and the dark tie posts sit
against the pale hull. That is the features working. Nothing falls under the floor.

`check-unit-art.py` reports exactly one problem for this asset — the 0.0% livery above.
The other twelve in that run are pre-existing and belong to croppers, plainers and
tempest (§11.2, §11.14).
