/**
 * sfxLibrary.js — the one-shot sound manifest.
 *
 * Short cues only. Anything that runs longer than a couple of seconds belongs
 * in the music playlist, not here: these are decoded whole into memory at
 * load and held for the session.
 *
 * Files live in public/assets/audio/sfx/. See the README there for the encode
 * recipe. Every cue is peak-normalised to about −1 dBFS — peak rather than
 * loudness, so a short transient keeps its snap instead of being pushed up
 * into a smear — and then balanced against the others by `gain` here. Keeping
 * the mix in one table means re-levelling a cue is an edit to this line, not
 * a re-encode.
 */

const A = import.meta.env?.BASE_URL ?? "/";
const DIR = `${A}assets/audio/sfx`;

export const SFX = {
  /** The envoy audience — an AI's leader art filling the screen with a
   *  demand that has to be answered. It interrupts everything, so it gets to
   *  be the loudest thing here. */
  envoyArrival: { src: `${DIR}/envoy-arrival.mp3`, gain: 1.0 },

  /** A herald banner — the small, option-less callouts that slide in at the
   *  top when the powers move against each other. Informational and frequent,
   *  so it stays under the envoy's cue rather than matching it. */
  diplomacyAlert: { src: `${DIR}/diplomacy-alert.mp3`, gain: 0.7 },

  /** A detail window sliding in — a selected unit, location, or blockade.
   *  Fires on nearly every click on the board, so it sits well back. */
  windowOpen: { src: `${DIR}/window-open.mp3`, gain: 0.45 },

  /** Held under the radial menu for as long as it is open with nothing
   *  picked. `loop: true` repeats it until released; it is mastered ~6 dB
   *  below the one-shots because a bed that sits at cue level stops being a
   *  bed. The file is crossfaded end-to-head so the wrap has no seam — see
   *  the audio README. */
  radialAmbience: { src: `${DIR}/radial-ambience.mp3`, gain: 0.85, loop: true },

  /** The battle under a conflict roll: crowd, two sword stems, and a war cry
   *  a second behind them — pre-mixed into one file, so the four can never
   *  drift apart on a slow device the way four scheduled sources would.
   *  Held rather than fired: it runs 7.4 s, longer than a fast AI contest
   *  beat, so it is released with the roll it belongs to instead of trailing
   *  over the next one. `loop: false` — it plays out once, no repeat. */
  contestRoll: { src: `${DIR}/contest-roll.mp3`, gain: 0.9, loop: false },
};

/** Cues worth having in memory before the moment they're needed. */
export const PRELOAD = ["envoyArrival", "diplomacyAlert", "windowOpen", "radialAmbience", "contestRoll"];
