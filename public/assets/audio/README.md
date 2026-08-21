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
| `sfx/ui-select.mp3` | `freesound_community-3rd-blip-95666` | Freesound |
| `sfx/contest-roll.mp3` | `freesound_community-angry-mob-loop-6847` | Freesound |
| `sfx/contest-roll.mp3` | `universfield-epic-war-combat-scream-352707` | UNIVERSFIELD |
| `sfx/contest-roll.mp3` | `dragon-studio-sword-fight-2-393846` | Dragon Studio |
| `sfx/contest-roll.mp3` | `dragon-studio-sword-fight-393849` | Dragon Studio |
| `sfx/window-open.mp3` | `suno-via-sci-fi-whoosh-289719` | Suno |
| `sfx/envoy-arrival.mp3` | `47313572-sci-fi-launch-3351238` | — |
| `music/*.mp3` | Replicate predictions (see below) | generated |

`contest-roll.mp3` is a mix of four sources; all four need clearing, not just
the Freesound one.

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

> **Cues shorter than 400 ms need padding to measure.** EBU R128's momentary
> loudness uses a 400 ms window, so a clip shorter than that never completes
> one and `ebur128` reports the −120.7 dB silence floor for the whole file —
> which, fed to the gain formula below, asks for +106 dB. `ui-select.mp3` is
> 0.1 s and hits this. Measure a padded copy (`apad=whole_dur=1.0`) and apply
> the resulting gain to the *unpadded* audio. The padding dilutes the reading,
> so a short click lands quieter than a sustained cue at the same nominal
> target — which is about right for how a click is heard.

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

### The contest stinger

`sfx/contest-roll.mp3` is four sources pre-mixed into one file rather than four
sources scheduled together at runtime: mixed, the war cry can never drift off
its one-second offset because a slow device stalled one `start()` call. It also
means one decode, one node, one thing to release.

Every stem is levelled to a common max-momentary **first**, so the blend
weights below mean what they say instead of inheriting whatever each source
happened to be mastered at:

```sh
# per stem: measure max-M, gain by (-14 - measured), force 44.1 kHz stereo
ffmpeg -i stem.mp3 -af "volume=${G}dB,aresample=44100,aformat=channel_layouts=stereo" stem.wav
```

Then blend — the crowd is a bed and sits under the action, the sword stems are
the impact, the war cry is the hero element and enters a second late:

```sh
ffmpeg -i mob.wav -i sword1.wav -i sword2.wav -i scream.wav -filter_complex "[0:a]volume=0.55[mob];[1:a]volume=0.90[s1];[2:a]volume=0.90[s2];[3:a]adelay=1000|1000,volume=1.0[scr];[mob][s1][s2][scr]amix=inputs=4:duration=longest:normalize=0[sum];[sum]afade=t=out:st=5.0:d=1.4,atrim=0:6.5,asetpts=N/SR/TB[out]" -map "[out]" raw.wav
```

`normalize=0` keeps the weights literal — `amix` otherwise divides by the input
count and the weights stop meaning anything.

The taper is also load-bearing, not just a length choice. The crowd source is a
**loop**: it runs 11.9 s and its raw end is a hard cut, not a decay, so leaving
it whole would end the cue on an audible chop whatever the length. Fading from
5.0 s puts the decay on the contest overlay's own arc — the dice lock at 5 s and
the cue is silent by 6.4 s, right as the winner banner lands. That fade catches
the tail of the longer sword stem (which runs to 6.1 s) as well as the bed; the
war cry has finished by 3.2 s and is untouched.

Finally normalise the sum to the −14 max-M cue target and limit, as above.

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
rotation, every cue firing on the interaction it belongs to (including a staged
envoy audience and a staged herald banner), the bed starting and stopping with
the radial menu, a staged contest sounding and releasing the battle stinger,
the click cue on buttons and radial sectors — and *not* on the audio widget's
own controls — the volume sliders in both places that offer them, and the
autoplay-blocked path.

Two of those checks exist because state can look perfect while the game is
silent, so they tap an `AnalyserNode` onto each bus and assert real signal at
two different levels. A third asserts the menu fetches its theme once: a
duplicate request for a 1.6 MB file, one of the pair left to be cancelled, is
what a stray warm-up looks like from the outside.
