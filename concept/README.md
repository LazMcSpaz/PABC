# concept/

Reference images for concept work, not game assets — nothing here is wired into
the build (runtime art lives in `public/assets/`). One `style/<world>.md` and one
`anchors/<world>/` per world; never mix worlds.

The authority on how images are made is
[`style/remnant-continent-art-direction.md`](style/remnant-continent-art-direction.md),
moved here from the repo root — §14 generation settings, §15 anchor registry.
Approved anchors: [`anchors/remnant-continent/ANCHORS.md`](anchors/remnant-continent/ANCHORS.md).

**Pages.** `.github/workflows/pages.yml` publishes only the Vite `dist/`
artifact — no Jekyll, no `_config.yml` — so `concept/` is never copied into the
published site and needs no `exclude`.

**Raw URLs verified.** `https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/<file>`
serves committed files over unauthenticated plain HTTP — confirmed 2026-08-11 by
fetching a placeholder from this path with no credentials (200, `image/png`,
bytes identical), against this branch's ref pre-merge; placeholder since removed.
