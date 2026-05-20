# Ashland Conquest — Content Editor

Standalone web tool for authoring quests and encounters against the
game's Supabase instance. Source of truth for data shapes is
[`../docs/content-schema-v0.1.md`](../docs/content-schema-v0.1.md).

## Stack

- React + Vite, Tailwind, [`reactflow`](https://reactflow.dev/) for the
  quest beat graph, `@supabase/supabase-js` for storage.
- Single-user tool, no auth.
- Deploys to Netlify; the root [`netlify.toml`](../netlify.toml) points
  the build at this folder.

## Supabase setup (run once)

The seven tables defined in
[`../docs/content-schema-v0.1.md §1`](../docs/content-schema-v0.1.md) need
to exist before the editor can talk to them. The schema, RLS policies,
and a PostgREST reload notification are bundled in
[`sql/0001_init.sql`](./sql/0001_init.sql).

To apply it:

1. Open the Supabase project → **SQL Editor → New query**.
2. Paste the contents of `editor/sql/0001_init.sql`.
3. Click **Run**.
4. Run any later migrations (e.g. `sql/0002_choice_outcome_text.sql`)
   the same way — they're additive and re-runnable.
5. Reload the editor tab — the `index load failed` banner should clear.

If PostgREST still serves a stale schema cache, force it via
**Settings → API → Reload schema cache**.

## Local dev

```bash
cd editor
cp .env.example .env.local      # then fill in real values
npm install
npm run dev                     # http://localhost:5174
```

Env vars:

| Var | Value |
|---|---|
| `VITE_SUPABASE_URL` | the project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key |
| `VITE_EDITOR_PIN` | optional. If set, shows a PIN entry screen before the editor. Unset = no gate (handy for local dev). |
| `VITE_GITHUB_TOKEN` | optional. Fine-grained PAT for the auto-commit pipeline (see below). |
| `VITE_GITHUB_REPO` | optional. `owner/name` of the repo to commit into. Defaults to `LazMcSpaz/PABC`. |
| `VITE_GITHUB_CONTENT_BRANCH` | optional. Destination branch for the snapshot. Defaults to `content/auto-snapshot`. |
| `VITE_GITHUB_BASE_BRANCH` | optional. Branch to fork from when creating the content branch. Defaults to `main`. |

The editor reads / writes the seven tables directly via the anon key.
Without the Supabase env vars the UI still loads but every load/save
call throws.

The PIN is bundled into the JS at build time — it gates casual access
from a deploy URL, not real security. The single trusted-user model
from the brief still applies.

## Auto-commit pipeline → engine

After every successful save / import / delete (and via a manual "sync"
button in the header), the editor:

1. Reads a full snapshot of all seven content tables from Supabase.
2. Reassembles the polymorphic relations — choices nested under their
   parent encounter / beat; effects nested under their parent choice or
   quest reward bucket — and parses every TEXT-of-JSON column back into
   a real object.
3. Renders four files (deterministic, sorted keys):
   - `src/game/content/world-encounters.js`
   - `src/game/content/field-encounters.js`
   - `src/game/content/quests.js`
   - `src/game/content/index.js`
4. Commits them in a single atomic commit (Git Data API) to
   `VITE_GITHUB_CONTENT_BRANCH`, creating the branch from
   `VITE_GITHUB_BASE_BRANCH` if needed.

The header shows a sync indicator: **synced** / **syncing…** /
**sync failed** with the last commit sha on hover. Clicking it triggers
a manual sync.

When you're ready for the engine to pick up new content, merge the
content branch into `main` manually. The engine imports from
`src/game/content/index.js`.

### Token scoping

The `VITE_GITHUB_TOKEN` ends up in the JS bundle just like the PIN. To
keep blast radius minimal, generate a **fine-grained personal access
token** scoped to this one repository, with only:

- **Contents: Read and write**
- **Metadata: Read-only** (required)

Nothing else. The token can write content files to your repo and
nothing else; the PIN gate keeps casual visitors out of the editor in
the first place.

### Output shape

Each generated file exports a single object keyed by id. Polymorphic
relations are reassembled inline, so the engine consumes a tree with no
further joins:

```js
// src/game/content/world-encounters.js
export const WORLD_ENCOUNTERS = {
  "we_xxx": {
    id: "we_xxx",
    mode: "private",
    recipient: "active",
    triggerCondition: { ... },   // parsed DSL
    triggerStrength: 3,
    triggerCooldown: 4,
    choices: [
      { id, label, condition, deferredDelay, effects: [{ id, type, params }] }
    ],
    ...
  },
  ...
};
```

For quests, each beat carries its `prerequisites: [beatId]` array
inline, and `completion: { rewardForClaimant, sharedSideEffects }`
holds the two reward buckets.

## Netlify deploy

A repo-root `netlify.toml` points Netlify at `editor/`:

```toml
[build]
  base = "editor"
  command = "npm install && npm run build"
  publish = "dist"
```

To set up a fresh Netlify site:

1. New site → Import from GitHub → pick the repo.
2. Leave the build settings empty — `netlify.toml` provides them.
3. Site → Settings → Environment variables → add `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_EDITOR_PIN`.
4. Trigger a redeploy so the env vars get baked in.

If you already created the site without the root `netlify.toml`,
either pull `main` (which now contains it) and redeploy, or set
**Base directory: `editor`** and **Publish directory: `editor/dist`**
under Site → Settings → Build & deploy.

## What the editor does

- Header navigator lists every world encounter, field encounter, and quest
  in three groups; selecting one loads it immediately.
- Quest editor renders the quest as a **decision tree** in React Flow:
  beats are rectangles; each beat's choices hang below as pills. Dragging
  a choice's bottom handle onto another beat's top handle wires the
  choice into that beat (the editor adds an `ADVANCE_QUEST` effect on
  the choice with the target beat id). Click a beat (or any of its
  choices) to edit the beat inline below. Prerequisites — the
  engine-level eligibility gates from §15.7 — are edited as a toggle
  chip list in the beat form rather than as graph edges, to keep the
  decision tree visually clean.
- Every encounter type — quest beats, world encounters, field encounters —
  uses the same authoring surface: **Encounter** (id, image, text, art
  notes) → **Choices** → type-specific delivery / trigger / copies
  metadata. The image and choice tools are identical wherever they
  appear; only the auxiliary metadata differs.
- Images can be attached to any encounter. Upload opens an in-browser
  cropper locked to 3:2 — drag the rectangle to position, pull corner
  handles to resize. The rightmost third is overlaid with the word
  "fade" during cropping to remind authors that the engine fades that
  band in-game. On confirm the image is JPEG-encoded (quality 0.85,
  max 1500×1000), committed to the content branch, and the encounter's
  `imagePath` is set. Files are auto-named after the encounter id:
  `src/game/content/images/{beats,world,field}/<id>.jpg`. Previews
  load through the authenticated contents API so private repos work.
- World / field encounter editors are structured forms. Trigger conditions
  and choice conditions use the DSL builder; placement hexes use the
  HexFilter form.
- Effect rows are a typed dropdown over the locked 22-name list, with a
  params form rendered for the selected type.
- Saving validates first (effect type ∈ 22, recipient grammar, HexFilter
  keys, DSL well-formedness, `encounterId` foreign keys) and writes the
  parent row plus child choices / effects / prereqs as one upsert pass.

## What it does **not** do

- No DSL evaluation, no effect application — that's the engine's job.
- No build trigger for the Supabase → JS export step.
- No multi-user coordination.

## Schema sync

Whenever `docs/content-schema-v0.1.md` changes:

1. Update `src/lib/schema.js` (effect list, recipient tokens, hex filter
   keys, DSL paths).
2. Update `src/lib/validation.js` for any new per-effect param shapes.
3. Update `src/components/EffectEditor.jsx` to render the new params form.
4. If a new DSL form is added, extend `src/lib/dsl.js` + `DslBuilder.jsx`.
