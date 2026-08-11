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

Entry format, and the first intended anchor from §10 (uncomment once the file
is actually committed):

<!--
## versari-core-cradle-01.png
URL: https://raw.githubusercontent.com/LazMcSpaz/PABC/main/concept/anchors/remnant-continent/versari-core-cradle-01.png
Use for: laminated cut-plate yoke construction, bolted clamp detail, bus bar and insulator treatment
Do not use for: figure scale, environment lighting
Added: YYYY-MM-DD
-->

---

## Vessels

_None yet._

## Figures

_None yet._

## Objects

_None yet._

## Terrain

_None yet._
