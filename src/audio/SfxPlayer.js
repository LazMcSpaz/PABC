/**
 * SfxPlayer.js — one-shot sound effects.
 *
 * Cues are fetched once, decoded to an AudioBuffer, and replayed from memory
 * through a BufferSource. That matters for a UI cue: an <audio> element
 * restarted with currentTime = 0 has audible, variable latency and cannot
 * overlap with itself, so a stack of alerts either swallows cues or plays
 * them late. Buffers do neither.
 *
 * Level sits on its own gain node, separate from the music bus, so effects
 * can be balanced against the score. Mute is driven together with the music's
 * from the audio widget — one button, both buses (see AudioProvider.jsx).
 *
 * If Web Audio is missing (very old browsers), we fall back to cloning an
 * <audio> element per hit: worse latency, same behaviour.
 */

import { getAudioContext, resumeAudioContext } from "./audioContext.js";
import { SFX, PRELOAD } from "./sfxLibrary.js";

const STORAGE_KEY = "ashland.sfx.v1";
const DEFAULT_VOLUME = 0.7;
/** Ignore a repeat of the same cue inside this window. See play(). */
const RETRIGGER_MS = 60;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : undefined,
      muted: typeof p.muted === "boolean" ? p.muted : undefined,
    };
  } catch {
    return {};
  }
}

export class SfxPlayer {
  constructor() {
    const prefs = loadPrefs();
    this.volume = prefs.volume ?? DEFAULT_VOLUME;
    this.muted = prefs.muted ?? false;

    this._buffers = new Map();   // name -> AudioBuffer
    this._pending = new Map();   // name -> Promise (dedupes concurrent loads)
    this._lastPlayed = new Map();
    this._loops = new Map();     // name -> { src, gain } for sounds held open
    this._loopWanted = new Set();// what *should* be looping, load or no
    this._listeners = new Set();
    this._gain = null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    fn(this.getStatus());
    return () => this._listeners.delete(fn);
  }

  getStatus() {
    return { volume: this.volume, muted: this.muted };
  }

  _emit() {
    const s = this.getStatus();
    for (const fn of this._listeners) fn(s);
  }

  // ---- level --------------------------------------------------------------

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    this._applyLevel();
    this._save();
    this._emit();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyLevel();
    this._save();
    this._emit();
  }

  _level() {
    return this.muted ? 0 : this.volume;
  }

  _applyLevel() {
    const ctx = getAudioContext();
    if (this._gain && ctx) {
      const t = ctx.currentTime;
      this._gain.gain.cancelScheduledValues(t);
      this._gain.gain.setValueAtTime(this._gain.gain.value, t);
      this._gain.gain.linearRampToValueAtTime(this._level(), t + 0.04);
    }
  }

  _bus() {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!this._gain) {
      this._gain = ctx.createGain();
      this._gain.gain.value = this._level();
      this._gain.connect(ctx.destination);
    }
    return this._gain;
  }

  // ---- loading ------------------------------------------------------------

  /** Fetch + decode a cue. Idempotent and concurrent-safe. */
  load(name) {
    const url = SFX[name]?.src;
    if (!url) return Promise.resolve(null);
    if (this._buffers.has(name)) return Promise.resolve(this._buffers.get(name));
    if (this._pending.has(name)) return this._pending.get(name);

    const ctx = getAudioContext();
    if (!ctx) return Promise.resolve(null); // fallback path needs no preload

    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        return r.arrayBuffer();
      })
      // Callback form as well as promise form: Safari only grew the promise
      // overload late, and this file has to work on the version before that.
      .then((buf) => new Promise((res, rej) => {
        const out = ctx.decodeAudioData(buf, res, rej);
        if (out && out.then) out.then(res, rej);
      }))
      .then((decoded) => {
        this._buffers.set(name, decoded);
        this._pending.delete(name);
        return decoded;
      })
      .catch(() => {
        // A cue that will not load must never break the thing it accompanies.
        this._pending.delete(name);
        return null;
      });

    this._pending.set(name, p);
    return p;
  }

  preloadAll() {
    for (const name of PRELOAD) this.load(name);
  }

  // ---- playback -----------------------------------------------------------

  /**
   * Fire a cue.
   * @param {string} name key into SFX
   * @param {{gain?: number}} [opts] extra per-hit multiplier on top of the
   *        cue's own mix level from sfxLibrary.js
   */
  play(name, opts = {}) {
    if (this.muted || this.volume <= 0) return;
    const cue = SFX[name];
    if (!cue) return;
    const gain = (cue.gain ?? 1) * (opts.gain ?? 1);

    // Two systems reacting to one game event should not double-trigger into
    // a flam — and neither should StrictMode's double-invoked effects.
    const now = Date.now();
    if (now - (this._lastPlayed.get(name) || 0) < RETRIGGER_MS) return;
    this._lastPlayed.set(name, now);

    const ctx = resumeAudioContext();
    if (!ctx) {
      this._playFallback(cue.src, gain);
      return;
    }

    const buffer = this._buffers.get(name);
    if (!buffer) {
      // Not decoded yet — load, then fire once, as long as the moment has not
      // already passed (a cue arriving a second late is worse than none).
      this.load(name).then((b) => {
        if (b && Date.now() - now < 400) this._fire(b, gain);
      });
      return;
    }
    this._fire(buffer, gain);
  }

  _fire(buffer, gain) {
    const ctx = getAudioContext();
    const bus = this._bus();
    if (!ctx || !bus) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (gain === 1) {
      src.connect(bus);
    } else {
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(bus);
    }
    src.start(0);
  }

  // ---- held loops ---------------------------------------------------------

  /**
   * Hold a sound open until stopLoop(). Used for beds tied to a UI state —
   * the radial menu's ambience — rather than to a moment.
   *
   * Safe to call repeatedly: a loop already running (or already loading) is
   * left alone rather than restarted, so a re-render cannot retrigger it.
   * Nothing here checks `muted`: loops run through the same bus as one-shots,
   * so mute silences them and unmute brings them straight back, with no
   * bookkeeping about what was playing when the player hit the button.
   */
  startLoop(name, { fadeMs = 260 } = {}) {
    const cue = SFX[name];
    if (!cue) return;
    this._loopWanted.add(name);
    if (this._loops.has(name)) return;
    if (!resumeAudioContext()) return; // no Web Audio: skip the bed entirely

    const buffer = this._buffers.get(name);
    if (!buffer) {
      this.load(name).then((b) => {
        // The state may have moved on while we were fetching.
        if (b && this._loopWanted.has(name) && !this._loops.has(name)) {
          this._startLoop(name, b, fadeMs);
        }
      });
      return;
    }
    this._startLoop(name, buffer, fadeMs);
  }

  stopLoop(name, { fadeMs = 320 } = {}) {
    this._loopWanted.delete(name);
    const node = this._loops.get(name);
    if (!node) return;
    this._loops.delete(name);
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const end = t + fadeMs / 1000;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setValueAtTime(node.gain.gain.value, t);
    node.gain.gain.linearRampToValueAtTime(0, end);
    node.src.onended = () => {
      try { node.src.disconnect(); node.gain.disconnect(); } catch { /* already gone */ }
    };
    try { node.src.stop(end + 0.02); } catch { /* never started */ }
  }

  _startLoop(name, buffer, fadeMs) {
    const ctx = getAudioContext();
    const bus = this._bus();
    if (!ctx || !bus) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Keep the wrap point clear of MP3 encoder delay and padding. Browsers
    // mostly strip those, but not all of them do, and a 25 ms hole punched
    // into a bed every fifteen seconds is exactly the kind of artefact that
    // sounds like a bug in the game rather than in the file.
    const guard = Math.min(0.05, buffer.duration / 20);
    src.loopStart = guard;
    src.loopEnd = Math.max(guard + 0.1, buffer.duration - guard);

    const g = ctx.createGain();
    const peak = SFX[name].gain ?? 1;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + fadeMs / 1000);
    src.connect(g);
    g.connect(bus);
    src.start(0, guard);
    this._loops.set(name, { src, gain: g });
  }

  _playFallback(url, gain) {
    try {
      const a = new window.Audio(url);
      a.volume = Math.min(1, this._level() * gain);
      a.play().catch(() => {});
    } catch {
      /* nothing to be done — the cue is cosmetic */
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* storage unavailable */
    }
  }
}

let singleton = null;
export function getSfxPlayer() {
  if (!singleton) singleton = new SfxPlayer();
  return singleton;
}
