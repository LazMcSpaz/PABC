# Task: Set Up the Concept Art Reference Pipeline

Instructions for the coding agent working in the PABC repo. This is a
one-session setup task plus an ongoing maintenance role described at the end.

## Background

We generate concept art for the Remnant Continent through an external image
model. Approved images get committed here and referenced by public URL as
inputs to later generations, which is what holds visual style steady across
sessions.

Two constraints drive the whole design:

1. **Generated images are deleted by the provider one hour after creation.**
   Anything not committed is permanently lost.
2. **The provider fetches reference images by plain HTTP GET with no
   credentials.** Every reusable image must sit at a publicly readable raw URL.
   This repo is public and already deploys via GitHub Pages, so
   `raw.githubusercontent.com` works with no additional setup.

These are reference images, not game assets. Do not wire them into any build.

## Step 1 — Locate the art direction document

`remnant-continent-art-direction.md` has been committed to `main`. Find it.

Move it to `concept/style/remnant-continent-art-direction.md` and update any
links pointing at its old location. If it is already somewhere sensible and
moving it would break references, leave it and note the actual path in
`concept/README.md` instead.

Read it before continuing. Section 15 describes the anchor registry this task
implements, and section 14 describes the generation settings. You are building
the storage layer those sections assume exists.

## Step 2 — Create the directory structure

```
concept/
  README.md
  style/
    remnant-continent-art-direction.md
  anchors/
    remnant-continent/
      ANCHORS.md
```

`concept/README.md` should be short — under twenty lines. It states what the
directory is for, points at the art direction doc as the authority, records the
GitHub Pages finding from step 3, and links to `ANCHORS.md`. Do not restate the
art rules; they live in one place.

Additional worlds, if any are added later, get their own `style/<world>.md` and
`anchors/<world>/` pair. Never mix worlds in one anchor folder.

## Step 3 — Check the GitHub Pages interaction

Determine how Pages is configured for this repo and record the answer in
`concept/README.md`:

- **Building from repo root with Jekyll** — `concept/` will be copied into the
  published site. Raw URLs still work, but the images count against the
  published site's 1 GB limit. Add `concept/` to `exclude:` in `_config.yml`.
  Confirm this does not break the raw URLs, which it should not, since raw
  URLs read from the git tree rather than from the Pages build.
- **Building from `/docs` or a `gh-pages` branch** — `concept/` on `main` is
  never published. Nothing to do; note it and move on.

Under no circumstance should adding `concept/` change the deployed game's
routes or break the existing Pages build. Verify the site still deploys before
finishing.

## Step 4 — Create ANCHORS.md

Seed it with the header and one commented-out example entry. Format per image:

```markdown
## versari-core-cradle-01.png
URL: https://raw.githubusercontent.com/<owner>/PABC/main/concept/anchors/remnant-continent/versari-core-cradle-01.png
Use for: laminated cut-plate yoke construction, bolted clamp detail, bus bar and insulator treatment
Do not use for: figure scale, environment lighting
Added: YYYY-MM-DD
```

The `Do not use for` line is not optional. An anchor passed into a generation
carries all of its qualities forward, including the wrong ones, and recording
what an anchor is bad at prevents it being attached to shots it will drag
off-target.

Keep entries in the file grouped by category — vessels, figures, objects,
terrain — with a `##` heading per group.

## Step 5 — Naming convention

`<category>-<subject>-<nn>.<ext>`

- `versari-core-cradle-01.png`
- `laker-heavy-cannon-01.png`
- `tile-coalition-prairie-01.png`
- `silhouette-versari-spire-01.png`

Rules:

- Lowercase and hyphens only. **No spaces, no underscores, no parentheses.**
  A space breaks the raw URL and is the single most common failure in this
  pipeline.
- Two-digit zero-padded sequence, never reused. If an image is superseded,
  increment rather than overwrite — old URLs may already be referenced in
  `ANCHORS.md`, in the art direction doc, or in a chat history.
- `.png` for reference sheets and anything with hard edges; `.jpg` for
  landscape and atmospheric work.

## Step 6 — Verify end to end

Commit a small placeholder image, then confirm its
`raw.githubusercontent.com` URL returns the file over plain HTTP with no auth.
This is the one thing that must actually be tested, because a 404 here fails
silently and only surfaces later as a broken generation. Delete the placeholder
once verified and note in `concept/README.md` that the path was confirmed.

---

## Ongoing role

After setup, you handle intake. When handed an approved image:

1. Confirm which world and category it belongs to.
2. Rename to the convention above.
3. Commit to the correct `anchors/<world>/` directory.
4. Append a full entry to `ANCHORS.md`, including the complete raw URL and both
   the `Use for` and `Do not use for` lines. Ask for these if they were not
   supplied — do not invent them.
5. Verify the URL resolves.
6. Return the raw URL in your response so it can be pasted into a prompt.

**Maintaining the art direction doc.** Sections 1 through 10 are the art
authority and are not yours to rewrite. You may:

- Append newly approved objects to section 10.
- Add entries to section 16, the known gaps list, and strike items once an
  approved anchor closes them.
- Add newly discovered failure modes to the section 7 table.

Preserve all existing section headings exactly. They are addressed by name
during prompt assembly, so renaming one silently breaks that.

## Done when

- [ ] Art direction doc located and its path recorded in `concept/README.md`
- [ ] Directory structure created
- [ ] Pages configuration checked, handled, and documented
- [ ] Existing game site still deploys correctly
- [ ] `ANCHORS.md` seeded with header and example
- [ ] A raw URL verified to resolve over unauthenticated HTTP
- [ ] Placeholder removed
