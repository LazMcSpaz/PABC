// Unit sprite build step — the art/ -> public/assets/ hop for unit sheets.
//
// Mirrors scripts/hex-tiles/build_tiles.py: image files are copied into
// `public/assets/units/<faction>/` where Vite can serve them, and the geometry
// the renderer needs is collapsed into one generated manifest at
// `src/prototype/unitSprites.json`. Nothing is resampled — the sheets are
// already at their final size, so this is a copy plus a validation pass.
//
// The validation is the point. Four arrangements of the same unit have to
// agree on cell size, frame count, anchor and row order, because the renderer
// picks a variant per unit per frame and a mismatch would make units jump when
// they promote or gain a chip. Rather than trust that, we assert it here and
// fail the build if the sheets ever drift apart.
//
//   node scripts/build-units.mjs
//
// Run by `npm run build` via the `prebuild` hook.

import { readdir, readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "art", "units");
const OUT = path.join(ROOT, "public", "assets", "units");
const MANIFEST = path.join(ROOT, "src", "prototype", "unitSprites.json");

// `<faction>_<unit>[_variant]` — the variant suffix is everything after the
// unit name, and is what §8.1's `[_tier]` slot turned into once units grew a
// veteran flag and a strength flag instead of a single tier number.
const VARIANTS = ["std", "vet", "std_str", "vet_str"];

// Geometry every variant of one unit must agree on.
const SHARED_KEYS = [
  "frameWidth", "frameHeight", "frames", "fps", "loop",
  "sheetWidth", "sheetHeight", "pixelsPerMetre", "footprintMetres",
];

function fail(msg) {
  console.error(`build-units: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

async function buildFaction(faction) {
  const dir = path.join(SRC, faction);
  const files = await readdir(dir);
  const jsons = files.filter((f) => f.endsWith(".json"));

  // Group `<faction>_<unit>_<variant>.json` by unit. Longest variant suffix
  // wins so `std_str` is not mistaken for `std`.
  const units = {};
  for (const f of jsons) {
    const stem = f.replace(/\.json$/, "");
    const variant = VARIANTS
      .filter((v) => stem.endsWith(`_${v}`))
      .sort((a, b) => b.length - a.length)[0];
    if (!variant) fail(`${f} has no recognised variant suffix (${VARIANTS.join(", ")})`);
    const unit = stem.slice(`${faction}_`.length, -`_${variant}`.length);
    (units[unit] ||= {})[variant] = stem;
  }

  const out = {};
  for (const [unit, byVariant] of Object.entries(units)) {
    const missing = VARIANTS.filter((v) => !byVariant[v]);
    if (missing.length) fail(`${faction}/${unit} is missing variant(s): ${missing.join(", ")}`);

    let shared = null;
    const variants = {};
    for (const v of VARIANTS) {
      const stem = byVariant[v];
      const meta = await readJson(path.join(dir, `${stem}.json`));

      // Geometry must match across variants, or units shift on promotion.
      const geom = Object.fromEntries(SHARED_KEYS.map((k) => [k, meta[k]]));
      const anchor = meta.anchor;
      const rows = meta.rows;
      if (shared === null) {
        shared = { geom, anchor, rows };
      } else {
        for (const k of SHARED_KEYS) {
          if (shared.geom[k] !== geom[k]) {
            fail(`${faction}/${unit}: ${v} has ${k}=${geom[k]}, expected ${shared.geom[k]}`);
          }
        }
        if (anchor[0] !== shared.anchor[0] || anchor[1] !== shared.anchor[1]) {
          fail(`${faction}/${unit}: ${v} anchor [${anchor}] != [${shared.anchor}]`);
        }
        if (rows.join() !== shared.rows.join()) {
          fail(`${faction}/${unit}: ${v} row order differs from ${VARIANTS[0]}`);
        }
      }

      // The sheet must actually hold frames x rows cells at the declared size.
      const wantW = geom.frameWidth * geom.frames;
      const wantH = geom.frameHeight * rows.length;
      if (geom.sheetWidth !== wantW || geom.sheetHeight !== wantH) {
        fail(
          `${faction}/${unit}/${v}: sheet is ${geom.sheetWidth}x${geom.sheetHeight}, ` +
          `but ${geom.frames} frames x ${rows.length} rows at ${geom.frameWidth}x${geom.frameHeight} needs ${wantW}x${wantH}`
        );
      }
      // The anchor has to sit inside the cell, with the near half of the
      // footprint below it (see docs/unit-model-pipeline.md §5).
      if (anchor[0] < 0 || anchor[0] >= geom.frameWidth || anchor[1] < 0 || anchor[1] >= geom.frameHeight) {
        fail(`${faction}/${unit}/${v}: anchor [${anchor}] is outside the ${geom.frameWidth}x${geom.frameHeight} cell`);
      }

      const sheet = `${stem}_sheet.webp`;
      const mask = `${stem}_mask.webp`;
      for (const f of [sheet, mask]) {
        if (!existsSync(path.join(dir, f))) fail(`${faction}/${unit}/${v}: missing ${f}`);
        await copyFile(path.join(dir, f), path.join(OUT, faction, f));
      }
      variants[v] = { sheet: `${faction}/${sheet}`, mask: `${faction}/${mask}` };
    }

    out[unit] = { ...shared.geom, anchor: shared.anchor, rows: shared.rows, variants };
    console.log(`build-units: ${faction}/${unit} — ${VARIANTS.length} variants, ${shared.geom.frames} frames x ${shared.rows.length} rows`);
  }
  return out;
}

async function main() {
  if (!existsSync(SRC)) {
    console.log("build-units: no art/units/ — nothing to do");
    return;
  }
  const factions = (await readdir(SRC, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const units = {};
  for (const faction of factions) {
    await mkdir(path.join(OUT, faction), { recursive: true });
    units[faction] = await buildFaction(faction);
  }

  const manifest = {
    _comment: "Generated by scripts/build-units.mjs -- do not hand-edit.",
    baseDir: "assets/units",
    units,
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`build-units: wrote ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
  if (!process.exitCode) process.exitCode = 1;
  console.error(e.message);
});
