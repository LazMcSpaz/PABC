# Art assets

Drop finished art into the folders below. Everything in `public/assets/`
is served as-is by Vite, so a file at
`public/assets/ui/icons/resources/scrap.png` is reachable at runtime as
`` `${import.meta.env.BASE_URL}assets/ui/icons/resources/scrap.png` ``
(that resolves to `/PABC/assets/...` on GitHub Pages and `/assets/...`
in local dev — always build the URL with `import.meta.env.BASE_URL`, never
a hard-coded `/PABC/`).

> **Wiring status:** these folders are the upload targets and the naming
> contract. Most components don't load these images *yet* — they draw
> CSS/gradient placeholders today. Hooking a slot up to its art is a
> quick follow-up per component once the file exists; ping me (or drop
> the file and ask) and I'll wire it.

## Conventions

- **Filename = the engine id**, kebab-case, no spaces. A chip whose engine
  id is `sharpened-blades` → `ui/chips/unit/sharpened-blades.png`. This
  lets the code resolve art purely from data (no per-asset mapping table).
  The id checklists below are the exact strings.
- **Formats**
  - Transparent art (icons, chips, tokens, emblems, cut-out portraits) →
    **PNG** (or **SVG** for flat icons — preferred, scales crisply).
  - Full-bleed art (backgrounds, location/character splashes) → **JPG**.
- **Pixel density:** author at **2×** the display size below so it stays
  sharp on hi-dpi screens. Square art unless noted.
- **One file per id.** Variants (hover/pressed, faction tints) use a
  `-suffix`, e.g. `buttons/primary.png`, `buttons/primary-hover.png`.

---

## Encounters — *already handled, don't put them here*

Encounter / quest-beat art is uploaded **through the content tool**, which
commits it to the content branch at:

```
src/game/content/images/field/<encounter-id>.jpg
src/game/content/images/world/<encounter-id>.jpg
src/game/content/images/beats/<beat-id>.jpg
```

That path is auto-derived from the record id and managed by the editor —
leave it alone. Use the editor's image upload + cropper for those.

---

## portraits/

People art.

- `portraits/factions/<faction>/` — unit / leader art for each playable
  faction. Factions (engine ids): **`versari`**, **`goldgrass`**,
  **`lakers`**, **`plainers`**. Suggested files per folder: `unit.png`
  (the standard trooper token art), `leader.png`, `banner.png`.
  Display ~64–96px tokens; author ≥256px.
- `portraits/characters/` — NPCs / encounter speakers, free-named
  (`the-fixer.png`, `scrap-baron.png`). Display ~120–200px.

## locations/

Per-Location establishing art (shown in the location card / inspector).
One JPG per location id, ~480×270 (16:9):

`korad` · `dambar` · `kansit` · `omara` · `chigan` · `droit` ·
`the-shelf` · `tin-town` · `concordan` · `erport`

---

## ui/

Broken out because there's a lot. Display sizes are guidance.

### ui/icons/  (flat icons — SVG preferred, else PNG ~48px@2×)

- `icons/resources/` — `scrap.svg`, `vp.svg`, `tech.svg`
- `icons/stats/` — `strength.svg`, `movement.svg`, `actions.svg`
- `icons/status/` — `veteran.svg`, `fortified.svg`, `immobilized.svg`,
  `loot.svg` (the dropped-chip pile marker)
- `icons/actions/` — one per player action: `move.svg`, `contest.svg`,
  `recruit.svg`, `acquire.svg`, `activate.svg`, `reinforce.svg`

### ui/chips/  (upgrade-chip face art; display ~84×100, author 2×)

Filename = chip engine id.
- `chips/unit/` — `drilled-troops`, `navigator`, `sharpened-blades`,
  `cannons`, `landship`
- `chips/location/` — `recyclers`, `town-hall`, `recon-team`,
  `training-grounds`, `labs`, `defense-turrets`, `factory`,
  `logistics-hub`, plus `capital` (the special faction chip)
- `chips/abilities/` — Location ability art: `rail-corridor`,
  `knowledge-cache`, `staging-ground`, `fortified-ruins`

### ui/board/  (the hex map)

- `board/terrain/` — hex tile textures by type: `wasteland.png`,
  `encounter.png`, `location.png`, `mountain.png` (mountain is the only
  special terrain so far). Hex art is pointy-top; ~150×173 cell.
- `board/tokens/` — unit tokens (per faction tint: `versari.png`, …) and
  any neutral/garrison token.
- `board/markers/` — overlays that sit on a hex: `loot.png` (chip pile),
  `reinforcement-arrow.png` (in-transit supply), `contest.png`.
- `board/control/` — control-meter pieces: `section-neutral.png`,
  `section-owned.png`, and the central `foothold.png`.

### ui/panels/  (window chrome)

- `panels/frames/` — 9-slice border frames for modals / floating windows.
- `panels/plates/` — solid/!textured backing plates (top bar, docks).
- `panels/dividers/` — horizontal/vertical rule art, corner brackets.

### ui/buttons/

Button skins + states: `primary.png`, `primary-hover.png`,
`ghost.png`, `disabled.png`, plus tab art if you want it.

### ui/dice/

d6 faces `d6-1.png` … `d6-6.png` (or one sprite `d6.png`) and an
optional `die-frame.png` for the contest overlay.

### ui/backgrounds/  (full-bleed JPG)

`board.jpg` (behind the hex map), `setup.jpg` (faction-select screen),
`modal.jpg` (overlay backdrop), `victory.jpg` (end screen).

### ui/logos/

- `logos/game/` — `wordmark.png`, `icon.png` (the "Ashland Conquest" mark).
- `logos/factions/` — faction crest/emblem per id: `versari.png`,
  `goldgrass.png`, `lakers.png`, `plainers.png`.

### ui/fx/

Reusable effect overlays: `glow.png`, `scanlines.png`, `vignette.png`,
particle sprites, etc.

---

## Quick checklist of named slots

| Set | ids |
|---|---|
| Factions | versari · goldgrass · lakers · plainers |
| Locations | korad · dambar · kansit · omara · chigan · droit · the-shelf · tin-town · concordan · erport |
| Unit chips | drilled-troops · navigator · sharpened-blades · cannons · landship |
| Location chips | recyclers · town-hall · recon-team · training-grounds · labs · defense-turrets · factory · logistics-hub · capital |
| Abilities | rail-corridor · knowledge-cache · staging-ground · fortified-ruins |
| Terrain | wasteland · encounter · location · mountain |

If you add art for a slot not listed here, just tell me the id and I'll
add it to the engine + this guide.
