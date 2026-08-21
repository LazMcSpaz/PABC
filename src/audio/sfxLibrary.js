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
  /** The envoy audience — an AI opening a diplomatic warning on the player.
   *  It interrupts, so it gets to be the loudest thing here. */
  diplomacyAlert: { src: `${DIR}/diplomacy-alert.mp3`, gain: 1.0 },

  /** The diplomacy drawer sliding in. Player-initiated, so it announces
   *  rather than demands. */
  diplomacyOpen: { src: `${DIR}/diplomacy-open.mp3`, gain: 0.8 },

  /** A detail window sliding in — a selected unit, location, or blockade.
   *  Fires on nearly every click on the board, so it sits well back. */
  windowOpen: { src: `${DIR}/window-open.mp3`, gain: 0.45 },

  /** Held under the radial menu for as long as it is open with nothing
   *  picked. `loop: true` marks it for startLoop()/stopLoop() rather than
   *  play(); it is mastered ~6 dB below the one-shots because a bed that
   *  sits at cue level stops being a bed. The file is already crossfaded
   *  end-to-head so the wrap has no seam — see the audio README. */
  radialAmbience: { src: `${DIR}/radial-ambience.mp3`, gain: 0.85, loop: true },
};

/** Cues worth having in memory before the moment they're needed. */
export const PRELOAD = ["diplomacyAlert", "diplomacyOpen", "windowOpen", "radialAmbience"];
