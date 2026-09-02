/**
 * MusicPlayer.js — the soundtrack engine.
 *
 * Framework-agnostic on purpose: one long-lived instance owns a single
 * <audio> element and decides what plays, when, and how loud. React talks to
 * it through MusicProvider.jsx; nothing in here imports React.
 *
 * THE RULES IT IMPLEMENTS
 * -----------------------
 *   • Two scenes. "menu" (title / setup / lore) always plays the pinned title
 *     theme — see TITLE_TRACK_ID. "game" plays all four cuts on a shuffled
 *     rotation.
 *   • Ten seconds of quiet between songs (GAP_MS), including between repeats
 *     of the title theme. A scene change gets a shorter breath (SCENE_GAP_MS)
 *     so starting a match does not feel like the audio broke.
 *   • A fresh game rotation never opens with the track that just finished, so
 *     leaving the title screen never plays the theme twice in a row.
 *
 * WHY WEB AUDIO
 * -------------
 * iOS Safari treats HTMLMediaElement.volume as read-only — assigning to it is
 * silently ignored, which would leave the volume slider and every fade dead on
 * iPhone. So the element is routed through a GainNode and all level changes are
 * gain ramps. `audio.volume` is only the fallback path for the (now rare)
 * browser with no AudioContext.
 *
 * AUTOPLAY
 * --------
 * Browsers reject play() until the page has seen a user gesture. A rejected
 * start is not an error here: the player parks in `blocked`, arms one-shot
 * listeners for the next pointer/key/touch anywhere on the page, and starts
 * then. The UI surfaces `blocked` so the control widget can say so.
 */

import { getAudioContext, resumeAudioContext } from "./audioContext.js";
import { MUSIC_TRACKS, TITLE_TRACK_ID, trackById } from "./musicTracks.js";

// --- tuning ---------------------------------------------------------------

/** Quiet time between two songs in a playlist. The headline requirement. */
export const GAP_MS = 10_000;
/** Quiet time when the scene changes mid-song (menu → game, game → menu). */
export const SCENE_GAP_MS = 2_500;
/** Level ramps. Short — these smooth transitions, they are not an effect. */
const FADE_IN_MS = 900;
const FADE_OUT_MS = 1_300;
/** Ramp used for slider drags / mute, fast enough to feel instant, slow
 *  enough not to click. */
const LEVEL_MS = 70;

/** Pause while the tab is in the background, resume when it comes back.
 *  Music leaking out of a tab the player has walked away from is a bug. */
const PAUSE_WHEN_HIDDEN = true;

const STORAGE_KEY = "ashland.music.v1";
const DEFAULT_VOLUME = 0.55;

// --- helpers --------------------------------------------------------------

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return {
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : undefined,
      muted: typeof p.muted === "boolean" ? p.muted : undefined,
    };
  } catch {
    return {}; // private mode, disabled storage, corrupt value — defaults are fine
  }
}

// --- the player -----------------------------------------------------------

export class MusicPlayer {
  constructor() {
    const prefs = loadPrefs();
    this.volume = prefs.volume ?? DEFAULT_VOLUME;
    this.muted = prefs.muted ?? false;

    /** "menu" | "game" | null (nothing has claimed a scene yet) */
    this.scene = null;
    /** "idle" | "playing" | "gap" | "blocked" */
    this.state = "idle";
    this.blocked = false;

    this.queue = [];          // track ids still to play in this rotation
    this.currentId = null;
    this.lastPlayedId = null;

    this._listeners = new Set();
    this._gapTimer = null;
    this._fadeTimer = null;
    this._gapEndsAt = 0;
    this._gapPending = 0;     // gap remaining, stashed while the tab is hidden
    this._pausedByHidden = false;
    this._gestureBound = false;
    this._playGen = 0;        // invalidates start attempts that lost their race
    this._preloadedId = null; // what the warm-up element already holds
    this._preloadingId = null; // what it is fetching right now, if anything
    this._env = 0;            // fade envelope, 0..1 — multiplied by volume
    this._destroyed = false;

    if (typeof window === "undefined") return; // SSR / test import guard

    this.audio = new window.Audio();
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.addEventListener("ended", this._onEnded);
    this.audio.addEventListener("error", this._onError);

    // Warms the HTTP cache for the next cut. Never routed through the graph
    // and never played.
    this._preloader = new window.Audio();
    this._preloader.preload = "auto";
    // Assigning src to a media element aborts whatever it was already
    // fetching, so a warm-up must be allowed to finish before another starts
    // — see _preloadNext. These events are how we learn it has.
    const settle = (ok) => () => {
      if (ok && this._preloadingId) this._preloadedId = this._preloadingId;
      this._preloadingId = null;
    };
    // `suspend` counts as done: it is the browser saying it has stopped
    // fetching of its own accord, which is the end of the warm-up either way.
    this._preloader.addEventListener("canplaythrough", settle(true));
    this._preloader.addEventListener("suspend", settle(true));
    this._preloader.addEventListener("error", settle(false));
    this._preloader.addEventListener("abort", settle(false));

    this._onVisibility = this._onVisibility.bind(this);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  // ---- subscription -------------------------------------------------------

  /** @returns {() => void} unsubscribe */
  subscribe(fn) {
    this._listeners.add(fn);
    fn(this.getStatus());
    return () => this._listeners.delete(fn);
  }

  getStatus() {
    const track = trackById(this.currentId);
    return {
      scene: this.scene,
      state: this.state,
      blocked: this.blocked,
      muted: this.muted,
      volume: this.volume,
      trackId: this.currentId,
      trackTitle: track?.title ?? null,
    };
  }

  _emit() {
    const s = this.getStatus();
    for (const fn of this._listeners) fn(s);
  }

  /** Milliseconds of quiet left before the next song. 0 when not in a gap. */
  getGapRemainingMs() {
    if (this.state !== "gap") return 0;
    if (this._gapPending) return this._gapPending;
    return Math.max(0, this._gapEndsAt - Date.now());
  }

  // ---- public control -----------------------------------------------------

  /**
   * Declare what the player is looking at. Idempotent — calling with the
   * current scene does nothing, so components can re-assert it freely.
   * @param {"menu"|"game"} scene
   */
  setScene(scene) {
    if (this._destroyed || scene === this.scene) return;
    const first = this.scene === null;
    this.scene = scene;
    this.queue = this._buildQueue(scene);

    if (first) {
      this._advance({ immediate: true });
      return;
    }
    // Mid-session change: let the current cut bow out, then a short breath.
    this._cancelFade();
    this._clearGap();
    if (this.state === "playing") {
      this._fadeOutAndStop(() => this._beginGap(SCENE_GAP_MS));
    } else {
      this._beginGap(SCENE_GAP_MS);
    }
    this._emit();
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    this._applyLevel(LEVEL_MS);
    this._savePrefs();
    this._emit();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyLevel(LEVEL_MS);
    this._savePrefs();
    this._emit();
    // Unmuting is a user gesture, so it is also a chance to escape autoplay jail.
    if (!this.muted && this.blocked) this._tryStart();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  /** Skip the rest of the current cut and take the normal 10s gap. */
  skip() {
    if (this._destroyed) return;
    this._cancelFade();
    this._clearGap();
    if (this.state === "playing") this._fadeOutAndStop(() => this._beginGap(GAP_MS));
    else this._advance({ immediate: true });
  }

  /** Cut the gap short and start the next cut now. */
  playNow() {
    if (this._destroyed) return;
    this._cancelFade();
    this._clearGap();
    this._advance({ immediate: true });
  }

  destroy() {
    this._destroyed = true;
    this._cancelFade();
    this._clearGap();
    this._listeners.clear();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._onVisibility);
    }
    if (this.audio) {
      this.audio.removeEventListener("ended", this._onEnded);
      this.audio.removeEventListener("error", this._onError);
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
    if (this._preloader) {
      this._preloader.removeAttribute("src");
      this._preloadedId = null;
      this._preloadingId = null;
    }
  }

  // ---- playlist -----------------------------------------------------------

  _buildQueue(scene, avoid = this.currentId || this.lastPlayedId) {
    if (scene !== "game") return [TITLE_TRACK_ID];
    const order = shuffled(MUSIC_TRACKS.map((t) => t.id));
    // Never open a rotation with whatever just finished — otherwise leaving
    // the title screen can play the theme twice back to back.
    if (order.length > 1 && order[0] === avoid) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    return order;
  }

  _nextId() {
    if (!this.queue.length) this.queue = this._buildQueue(this.scene);
    let id = this.queue.shift() ?? TITLE_TRACK_ID;
    // Guard against a back-to-back repeat *here*, not only when the queue is
    // built: a queue is drained over several minutes, and what played last can
    // change in between. If the head collides, swap it with the one behind it
    // rather than dropping it — every cut still gets its turn. A single-entry
    // queue is left alone, which is what makes the menu repeat its theme.
    const prev = this.currentId || this.lastPlayedId;
    if (id === prev && this.queue.length) {
      const next = this.queue.shift();
      this.queue.unshift(id);
      id = next;
    }
    // Commit the next rotation now rather than when it is needed, so what
    // comes after this cut is a decided fact. _preloadNext can only warm the
    // right file if there is a real answer to "what is next" — guessing with
    // a throwaway shuffle warms a track we probably will not play, and then
    // fetches the real one anyway.
    if (!this.queue.length) this.queue = this._buildQueue(this.scene, id);
    return id;
  }

  _advance({ immediate = false } = {}) {
    if (this._destroyed || !this.audio) return;
    this._cancelFade();
    if (!immediate) {
      this._beginGap(GAP_MS);
      return;
    }
    const id = this._nextId();
    const track = trackById(id);
    if (!track) return;
    this.currentId = id;
    // Assigning src is enough to rewind — setting currentTime here would poke
    // at a media element whose readyState is still HAVE_NOTHING.
    this.audio.src = track.src;
    this._env = 0;
    this._applyLevel(0);
    this._preloadNext();
    this._tryStart();
  }

  /**
   * Warm the next cut's HTTP cache during the gap.
   *
   * Never the cut already playing: the menu pins a single theme, so there
   * "next" *is* "current", and starting a second fetch for the file the
   * element is already streaming doubles a 1.6 MB download and leaves one of
   * the two to be aborted by the browser.
   *
   * Tracked by id rather than by comparing `_preloader.src` — that property
   * reads back as an absolute URL while the manifest holds a root-relative
   * one, so the comparison never matched and every call reassigned it.
   */
  _preloadNext() {
    const id = this.queue[0];
    if (!id || id === this.currentId) return;
    if (id === this._preloadedId || id === this._preloadingId) return;
    // One warm-up at a time. Reassigning src would abort the download already
    // in flight, throwing away the bandwidth spent on it and logging a
    // cancelled request — which is what a player skipping quickly through
    // tracks used to produce. Warming is an optimisation: skipping one costs
    // nothing, and the next advance warms whatever is next by then.
    if (this._preloadingId) return;
    const t = trackById(id);
    if (!t || !this._preloader) return;
    this._preloadingId = id;
    this._preloader.src = t.src;
  }

  // ---- gaps ---------------------------------------------------------------

  _beginGap(ms) {
    this._clearGap();
    // Any start attempt still in flight belongs to the cut we are leaving.
    // Without this, a play() promise that resolves a beat after the track
    // ended flips us back to "playing" while a gap timer is already armed —
    // and ten seconds later that orphan timer cuts the next cut off mid-bar.
    this._playGen++;
    // During a gap, nothing sounds. Normally the element has already ended or
    // been faded out; this makes that an invariant rather than an assumption.
    if (this.audio && !this.audio.paused) this.audio.pause();
    this.state = "gap";
    this._gapEndsAt = Date.now() + ms;
    if (document.hidden && PAUSE_WHEN_HIDDEN) {
      // Don't burn the gap while nobody is listening — freeze it instead.
      this._gapPending = ms;
      this._emit();
      return;
    }
    this._gapTimer = setTimeout(() => {
      this._gapTimer = null;
      this._advance({ immediate: true });
    }, ms);
    this._emit();
  }

  _clearGap() {
    if (this._gapTimer) clearTimeout(this._gapTimer);
    this._gapTimer = null;
    this._gapPending = 0;
  }

  // ---- transport ----------------------------------------------------------

  _tryStart() {
    if (!this.audio) return;
    this._ensureGraph();
    const gen = ++this._playGen;
    const p = this.audio.play();
    if (!p || !p.then) {
      this._onStarted(gen);
      return;
    }
    p.then(
      () => this._onStarted(gen),
      (err) => {
        if (gen !== this._playGen) return; // we already moved on
        // NotAllowedError = autoplay policy. Anything else (a decode failure,
        // a 404) is a real problem, but the recovery is the same: wait for a
        // gesture and try again rather than silently going quiet forever.
        if (err && err.name === "AbortError") return; // superseded by a newer src
        this.blocked = true;
        this.state = "blocked";
        this._bindGesture();
        this._emit();
      },
    );
  }

  _onStarted(gen) {
    if (gen !== undefined && gen !== this._playGen) return; // stale attempt
    this.blocked = false;
    this.state = "playing";
    this.lastPlayedId = this.currentId;
    this._rampEnv(1, FADE_IN_MS);
    this._emit();
  }

  _onEnded = () => {
    if (this._destroyed) return;
    this._env = 0;
    this._advance({ immediate: false }); // → the 10-second quiet
  };

  _onError = () => {
    if (this._destroyed || !this.currentId) return;
    // A cut that will not load must not stall the soundtrack. Drop it and let
    // the gap carry us to the next one.
    this._advance({ immediate: false });
  };

  /**
   * Ease the current cut out, then stop it and hand off.
   *
   * The timer is cancellable and every path that starts something new cancels
   * it first. Without that, a player who hits "play now" during the 1.3s
   * hand-off out of the menu gets their new track paused a second later by a
   * fade that belongs to a track already gone — and the playlist advances
   * twice, which is exactly how a cut ends up repeating itself.
   */
  _fadeOutAndStop(then) {
    this._cancelFade();
    this._playGen++;
    this._rampEnv(0, FADE_OUT_MS);
    this._fadeTimer = setTimeout(() => {
      this._fadeTimer = null;
      if (this._destroyed) return;
      this.audio?.pause();
      this.currentId = null;
      then?.();
    }, FADE_OUT_MS);
  }

  _cancelFade() {
    if (this._fadeTimer) clearTimeout(this._fadeTimer);
    this._fadeTimer = null;
  }

  // ---- gesture unlock -----------------------------------------------------

  _bindGesture() {
    if (this._gestureBound || typeof window === "undefined") return;
    this._gestureBound = true;
    const go = () => {
      this._unbindGesture();
      if (this._destroyed) return;
      resumeAudioContext();
      if (this.state === "blocked") this._tryStart();
    };
    this._gestureHandler = go;
    for (const ev of ["pointerdown", "keydown", "touchstart"]) {
      window.addEventListener(ev, go, { once: true, passive: true });
    }
  }

  _unbindGesture() {
    if (!this._gestureBound) return;
    this._gestureBound = false;
    for (const ev of ["pointerdown", "keydown", "touchstart"]) {
      window.removeEventListener(ev, this._gestureHandler);
    }
    this._gestureHandler = null;
  }

  // ---- visibility ---------------------------------------------------------

  _onVisibility() {
    if (!PAUSE_WHEN_HIDDEN || this._destroyed) return;
    if (document.hidden) {
      if (this.state === "playing") {
        this.audio?.pause();
        this._pausedByHidden = true;
      } else if (this.state === "gap") {
        this._gapPending = this.getGapRemainingMs();
        if (this._gapTimer) clearTimeout(this._gapTimer);
        this._gapTimer = null;
      }
      return;
    }
    if (this._pausedByHidden) {
      this._pausedByHidden = false;
      this._tryStart();
    } else if (this.state === "gap" && this._gapPending) {
      const left = this._gapPending;
      this._gapPending = 0;
      this._beginGap(left);
    }
  }

  // ---- level --------------------------------------------------------------

  /** Lazily build source → gain → destination on the shared context.
   *  Safe to call repeatedly. */
  _ensureGraph() {
    if (this.gain || !this.audio) return;
    const ctx = getAudioContext();
    if (!ctx) return; // no Web Audio at all — fall back to audio.volume
    try {
      // createMediaElementSource may only be called once per element — hence
      // the single reused <audio>.
      this.ctx = ctx;
      this.source = ctx.createMediaElementSource(this.audio);
      this.gain = ctx.createGain();
      this.gain.gain.value = this._target();
      this.source.connect(this.gain);
      this.gain.connect(ctx.destination);
    } catch {
      this.ctx = null;
      this.gain = null;
      return;
    }
    // Routed through the graph the element is a *source*, not an output: its
    // own volume has to sit at unity or it attenuates everything downstream,
    // gain node or no gain node. This also repairs the element if the
    // fallback path in _applyLevel got to it first.
    this.audio.volume = 1;
    this.audio.muted = false;
    resumeAudioContext();
  }

  _target() {
    return this.muted ? 0 : this._env * this.volume;
  }

  _rampEnv(env, ms) {
    this._env = env;
    this._applyLevel(ms);
  }

  _applyLevel(ms) {
    // Build the graph before choosing which knob is the real one. Without
    // this, the first level change of the session lands on the element
    // fallback below and pins audio.volume to 0 (the fade envelope starts
    // closed) — and once the graph is up, every later change goes to the gain
    // node instead, so nothing ever re-opens the element. The result is a
    // player that reports "playing" with a gain of 0.55 and emits silence,
    // which is exactly as undebuggable as it sounds.
    this._ensureGraph();
    const target = this._target();
    if (this.gain && this.ctx) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(this.gain.gain.value, t);
      if (ms > 0) this.gain.gain.linearRampToValueAtTime(target, t + ms / 1000);
      else this.gain.gain.setValueAtTime(target, t);
      return;
    }
    if (this.audio) {
      // No Web Audio: no ramps, just the level. (Ignored on iOS, but iOS has
      // Web Audio, so this path is desktop-legacy only.)
      this.audio.volume = target;
      this.audio.muted = this.muted;
    }
  }

  _savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* storage unavailable — preference just won't survive a reload */
    }
  }
}

// One player per document. Module-level so React StrictMode's double-mount in
// dev cannot end up with two soundtracks running at once.
let singleton = null;
export function getMusicPlayer() {
  if (!singleton) singleton = new MusicPlayer();
  return singleton;
}
