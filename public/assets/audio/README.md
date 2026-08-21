# Audio assets

Everything the game plays. Two families, mastered to different rules because
they do different jobs.

```
music/   four score cuts, looped through play  → src/audio/musicTracks.js
sfx/     one-shot cues and one held loop       → src/audio/sfxLibrary.js
```

The players that consume them live in `src/audio/` — see `MusicPlayer.js` for
the playlist rules (pinned title theme, ten-second gaps) and `SfxPlayer.js`
for cue playback.

---

## Attribution — read before shipping

Two cues came from Freesound, whose uploads carry per-sound licences (many are
CC-BY and **require credit**). The original filenames are recorded in the
mapping tables below so the sources can be traced. Confirm each licence and
add the required credits to the game's about/credits screen before any public
release.

| File | Original name | Source |
|---|---|---|
| `sfx/diplomacy-alert.mp3` | `freesound_community-sci-fi-door-14782` | Freesound |
| `sfx/radial-ambience.mp3` | `freesound_community-mysterious-electricity-73307` | Freesound |
| `sfx/window-open.mp3` | `suno-via-sci-fi-whoosh-289719` | Suno |
| `sfx/diplomacy-open.mp3` | `47313572-sci-fi-launch-3351238` | — |
| `music/*.mp3` | Replicate predictions (see below) | generated |

---

## Format

MP3 throughout, 44.1 kHz stereo. MP3 because it is the one lossy format every
browser we target decodes natively, so nothing needs a per-browser `<source>`
fallback. Music is VBR ~130 kbps (`-q:a 5`), cues are ~165 kbps (`-q:a 4`) —
short files, so the extra bitrate costs kilobytes and protects transients.

## Music — loudness-matched

All four cuts are trimmed of head/tail digital silence and normalised to
**−16 LUFS integrated** (two-pass `loudnorm`, linear gain — every cut's LRA is
under 11, so nothing is dynamically compressed). Matching them means the
playlist never jumps in level when it rolls over.

| File | Source prediction | Length |
|---|---|---|
| `music/main-theme.mp3` | `…rnmqk5ehrxrmy0d047kr6ywtv4` | 117.2 s |
| `music/track-02.mp3` | `…pqt22t8bd1rmt0d047h9eaz48g` | 116.1 s |
| `music/track-03.mp3` | `…vwemkfdq6drmw0d047hra367b0` | 118.8 s |
| `music/track-04.mp3` | `…g37w3pqmc1rmy0d047ns9dm8gr` | 119.8 s |

`main-theme` is the pinned title theme (`TITLE_TRACK_ID` in
`src/audio/musicTracks.js`). It also takes its turn in the in-game rotation.

Recipe, per file:

```sh
# 1. measure
ffmpeg -ss $START -t $LEN -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
# 2. apply, with the measurements from step 1
ffmpeg -ss $START -t $LEN -i in.wav \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=…:measured_TP=…:measured_LRA=…:measured_thresh=…:offset=…:linear=true,aresample=44100" \
  -c:a libmp3lame -q:a 5 -ar 44100 -ac 2 out.mp3
```

`$START`/`$LEN` come from a `silencedetect=noise=-60dB:d=0.5` pass, padded by
0.2 s at the head and 0.4 s at the tail so no fade gets clipped.

## Effects — peak-loudness-matched

Cues are too short for an integrated loudness read, so they are matched on
**maximum momentary loudness (LUFS-M)** instead: one-shots at −14, the ambience
bed at −20. Relative mix (which cue is "louder" in play) is *not* baked in — it
lives in the `gain` field of `src/audio/sfxLibrary.js`, so re-levelling a cue is
a one-line edit rather than a re-encode.

```sh
TRIM="silenceremove=start_periods=1:start_threshold=-66dB:start_silence=0.01:detection=peak,\
areverse,silenceremove=start_periods=1:start_threshold=-66dB:start_silence=0.04:detection=peak,areverse"

# measure max momentary loudness
ffmpeg -i in.mp3 -af "$TRIM,ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-" -f null - \
  | grep -oE '=-?[0-9.]+' | tr -d '=' | sort -g | tail -1
# then gain by (target - measured) and limit
ffmpeg -i in.mp3 -af "$TRIM,volume=${GAIN}dB,alimiter=limit=0.891,aresample=44100" \
  -c:a libmp3lame -q:a 4 -ar 44100 -ac 2 out.mp3
```

### The looping bed

`sfx/radial-ambience.mp3` is held open for as long as the radial menu is, so
its wrap point has to be inaudible. The tail is crossfaded back over the head
before normalising, which removes the seam:

```sh
ffmpeg -i src.mp3 -c:a pcm_s16le -ar 44100 -ac 2 amb.wav      # decode first
BODY=$(python3 -c 'print(DURATION - 2.0)')
ffmpeg -t $BODY      -i amb.wav -c:a pcm_s16le a.wav          # everything but the last 2s
ffmpeg -ss $BODY     -i amb.wav -c:a pcm_s16le b.wav          # the last 2s
ffmpeg -i b.wav -i a.wav -filter_complex "[0:a][1:a]acrossfade=d=2:c1=tri:c2=tri" loop.wav
```

Two temp files rather than one `asplit` graph: feeding both `acrossfade` inputs
from one split deadlocks, because the filter will not pull from the second
branch until the first has ended.

`SfxPlayer._startLoop` additionally trims 50 ms off each end via
`loopStart`/`loopEnd`, so MP3 encoder delay and padding can never punch a hole
in the wrap on a browser that does not strip them.

---

## Checking it

`npm run check:audio` (with `npm run dev` running) drives the real players in a
real browser: the pinned title theme, the ten-second gaps, the four-cut
rotation, every cue firing on the interaction it belongs to, the held loop
starting and stopping with the radial menu, and the autoplay-blocked path.
