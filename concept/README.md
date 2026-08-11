# concept/

Reference images for concept work, not game assets. Nothing here is wired
into the build; runtime art lives in `public/assets/`.

The authority on how images are made is
[`style/remnant-continent-art-direction.md`](style/remnant-continent-art-direction.md)
(moved here from the repo root). Read §14 for generation settings, §15 for the
anchor registry this directory implements. Approved anchors and their usage
notes are indexed in
[`anchors/remnant-continent/ANCHORS.md`](anchors/remnant-continent/ANCHORS.md).

**Pages.** GitHub Pages is built by `.github/workflows/pages.yml`, which
publishes only the Vite `dist/` artifact — there is no Jekyll build and no
`_config.yml`, so `concept/` is never copied into the published site and
counts against no site limit. No exclusion needed.

**Raw URLs verified.** `https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/<file>`
returns committed files over unauthenticated plain HTTP (confirmed 2026-08-11
with a placeholder, since removed). Filenames must be lowercase-hyphen only —
a space breaks the URL.

One `style/<world>.md` and one `anchors/<world>/` per world. Never mix worlds.
