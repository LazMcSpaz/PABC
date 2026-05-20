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

The editor reads / writes the seven tables directly via the anon key.
Without the Supabase env vars the UI still loads but every load/save
call throws.

The PIN is bundled into the JS at build time — it gates casual access
from a deploy URL, not real security. The single trusted-user model
from the brief still applies.

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
- Quest editor renders the beat graph in React Flow. Drag from one beat's
  bottom handle to another's top to add a prereq edge; select an edge and
  press Backspace to remove it; click a beat to edit it inline below.
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
