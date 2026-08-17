// Unit sprite build step — the art/ -> public/assets/ hop for unit sheets.
//
// Mirrors scripts/hex-tiles/build_tiles.py: image files are copied into
// `public/assets/units/<faction>/` where Vite can serve them, and the geometry
// the renderer needs is collapsed into one generated manifest at
// `src/prototype/unitSprites.json`. Nothing is resampled — the sheets are
// already at their final size, so this is a copy plus a validation pass.
//
// The validation is the point. Variants of the same unit have to agree on cell
// size, frame count, anchor and row order, because the renderer swaps between
// them as a unit promotes or picks up a chip, and a mismatch would make it jump.
// Rather than trust that, this asserts it and fails the build.
//
// What it does NOT assume is a full variant matrix. Infantry ships all four
// arrangements; the tier-1 vehicle has veteran but no strength variant, and the
// tier-2 vehicle has none at all. Whatever is present is recorded, and
// unitSprites.js falls back through what exists.
//
//   node scripts/build-units.mjs
//
// Run by `npm run dev` and `npm run build` via the predev/prebuild hooks.

import { readdir, readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "art", "units");
const OUT = path.join(ROOT, "public", "assets", "units");
const MANIFEST = path.join(ROOT, "src", "prototype", "unitSprites.json");

// Art directories are named for the faction in the singular; the game's faction
// ids are what the renderer looks up. Normalise here so there is exactly one
// place that knows about the discrepancy.
const FACTION_DIR_ALIAS = {
  laker: "lakers",
  plainer: "plainers",
};

// Recognised variant suffixes, longest first so `std_str` is not read as `std`.
// A file with none of these is the unit's only arrangement and is keyed `base`.
const VARIANTS = ["std_str", "vet_str", "std", "vet"];
const BASE_VARIANT = "base";

// Geometry every variant of one unit must agree on.
const SHARED_KEYS = [
  "frameWidth", "frameHeight", "frames", "fps", "loop",
  "sheetWidth", "sheetHeight", "pixelsPerMetre", "footprintMetres",
];

const problems = [];
function fail(msg) {
  problems.push(msg);
}

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

// `<faction>_<unit>[_<variant>]` -> { unit, variant }
function splitStem(stem, dirName) {
  const rest = stem.startsWith(`${dirName}_`) ? stem.slice(dirName.length + 1) : stem;
  for (const v of VARIANTS) {
    if (rest.endsWith(`_${v}`)) return { unit: rest.slice(0, -(v.length + 1)), variant: v };
  }
  return { unit: rest, variant: BASE_VARIANT };
}

async function buildFaction(dirName) {
  const faction = FACTION_DIR_ALIAS[dirName] || dirName;
  const dir = path.join(SRC, dirName);
  const files = await readdir(dir);

  const units = {};
  for (const f of files.filter((n) => n.endsWith(".json"))) {
    const stem = f.slice(0, -5);
    const { unit, variant } = splitStem(stem, dirName);
    if (!unit) { fail(`${dirName}/${f}: cannot parse a unit name out of it`); continue; }
    (units[unit] ||= {})[variant] = stem;
  }

  const out = {};
  for (const [unit, byVariant] of Object.entries(units)) {
    let shared = null;
    const variants = {};
    // Sort so the manifest and any error message are in a stable order.
    for (const v of Object.keys(byVariant).sort()) {
      const stem = byVariant[v];
      const meta = await readJson(path.join(dir, `${stem}.json`));
      const geom = Object.fromEntries(SHARED_KEYS.map((k) => [k, meta[k]]));
      const { anchor, rows } = meta;

      if (!Array.isArray(anchor) || anchor.length !== 2 || !Array.isArray(rows) || !rows.length) {
        fail(`${faction}/${unit}/${v}: needs an [x, y] anchor and a non-empty rows list`);
        continue;
      }

      if (shared === null) {
        shared = { geom, anchor, rows, from: v };
      } else {
        // A variant that disagrees on geometry would make the unit jump the
        // moment it promotes or picks up a chip.
        for (const k of SHARED_KEYS) {
          if (shared.geom[k] !== geom[k]) {
            fail(`${faction}/${unit}: ${v} has ${k}=${geom[k]}, but ${shared.from} has ${shared.geom[k]}`);
          }
        }
        if (anchor[0] !== shared.anchor[0] || anchor[1] !== shared.anchor[1]) {
          fail(`${faction}/${unit}: ${v} anchor [${anchor}] != ${shared.from}'s [${shared.anchor}]`);
        }
        if (rows.join() !== shared.rows.join()) {
          fail(`${faction}/${unit}: ${v} row order differs from ${shared.from}`);
        }
      }

      // The declared grid must actually fill the sheet.
      const wantW = geom.frameWidth * geom.frames;
      const wantH = geom.frameHeight * rows.length;
      if (geom.sheetWidth !== wantW || geom.sheetHeight !== wantH) {
        fail(
          `${faction}/${unit}/${v}: sheet is ${geom.sheetWidth}x${geom.sheetHeight}, but ` +
          `${geom.frames} frames x ${rows.length} rows at ${geom.frameWidth}x${geom.frameHeight} needs ${wantW}x${wantH}`,
        );
      }
      // The anchor has to sit inside the cell (docs/unit-model-pipeline.md §5).
      if (anchor[0] < 0 || anchor[0] >= geom.frameWidth || anchor[1] < 0 || anchor[1] >= geom.frameHeight) {
        fail(`${faction}/${unit}/${v}: anchor [${anchor}] is outside the ${geom.frameWidth}x${geom.frameHeight} cell`);
      }
      // The near half of the footprint projects below the anchor; if the cell
      // does not leave room for it the front of the base is clipped (§5).
      const below = (geom.footprintMetres / 2) * Math.sin((34.18 * Math.PI) / 180) * geom.pixelsPerMetre;
      const room = geom.frameHeight - anchor[1];
      if (room < below) {
        fail(
          `${faction}/${unit}/${v}: only ${room}px below the anchor but a ` +
          `${geom.footprintMetres}m footprint projects ${below.toFixed(1)}px — the base will clip`,
        );
      }

      const sheet = `${stem}_sheet.webp`;
      const mask = `${stem}_mask.webp`;
      for (const img of [sheet, mask]) {
        if (!existsSync(path.join(dir, img))) { fail(`${faction}/${unit}/${v}: missing ${img}`); continue; }
        await copyFile(path.join(dir, img), path.join(OUT, faction, img));
      }
      variants[v] = { sheet: `${faction}/${sheet}`, mask: `${faction}/${mask}` };
    }

    if (!shared) continue;
    out[unit] = { ...shared.geom, anchor: shared.anchor, rows: shared.rows, variants };
    console.log(
      `build-units: ${faction}/${unit} — ${Object.keys(variants).sort().join(", ")} ` +
      `(${shared.geom.frames}x${shared.rows.length} @ ${shared.geom.frameWidth}x${shared.geom.frameHeight})`,
    );
  }
  return { faction, units: out };
}

async function main() {
  if (!existsSync(SRC)) {
    console.log("build-units: no art/units/ — nothing to do");
    return;
  }
  const dirs = (await readdir(SRC, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const units = {};
  for (const dirName of dirs) {
    await mkdir(path.join(OUT, FACTION_DIR_ALIAS[dirName] || dirName), { recursive: true });
    const { faction, units: built } = await buildFaction(dirName);
    if (units[faction]) fail(`two art directories map to faction "${faction}"`);
    units[faction] = built;
  }

  if (problems.length) {
    console.error(`\nbuild-units: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  const manifest = {
    _comment: "Generated by scripts/build-units.mjs -- do not hand-edit.",
    baseDir: "assets/units",
    units,
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const n = Object.values(units).reduce((s, f) => s + Object.keys(f).length, 0);
  console.log(`build-units: ${n} unit(s) across ${Object.keys(units).length} faction(s) -> ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
  process.exitCode = 1;
  console.error(e.message);
});
