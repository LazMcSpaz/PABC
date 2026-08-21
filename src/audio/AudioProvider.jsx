/**
 * AudioProvider.jsx — the React face of the game's audio.
 *
 * Mount once, at the root (see main.jsx). It owns nothing itself: both players
 * are module singletons, so a hot reload or StrictMode's dev double-mount can
 * never leave two soundtracks running. Deliberately no teardown on unmount for
 * the same reason — the players outlive the tree.
 *
 * Usage:
 *   useMusicScene("game")                  // in whatever renders the match
 *   const sfx = useSfx(); sfx.play("...")  // fire a one-shot
 *   useSfxOn(key, "diplomacyAlert")        // fire once per new `key`
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getMusicPlayer } from "./MusicPlayer.js";
import { getSfxPlayer } from "./SfxPlayer.js";
import AudioWidget from "./AudioWidget.jsx";

const AudioCtx = createContext(null);

export function AudioProvider({ children, widget = true }) {
  const music = useMemo(() => getMusicPlayer(), []);
  const sfx = useMemo(() => getSfxPlayer(), []);

  const [musicStatus, setMusicStatus] = useState(() => music.getStatus());
  const [sfxStatus, setSfxStatus] = useState(() => sfx.getStatus());

  useEffect(() => music.subscribe(setMusicStatus), [music]);
  useEffect(() => sfx.subscribe(setSfxStatus), [sfx]);
  useEffect(() => { sfx.preloadAll(); }, [sfx]);

  // Every selection, toggle and button press clicks — delegated from the
  // document rather than wired into each of the ~70 interactive components,
  // which would be that many chances to forget one. `.hud-int` is the
  // project's own marker for "interactive HUD element", so it does most of
  // the work; `data-sfx="select"` covers the handful of clickables that are
  // neither buttons nor tagged (the radial menu's SVG sectors).
  //
  // Capture phase, so a component that stops propagation cannot silence it,
  // and pointerdown rather than click so the sound lands with the press.
  // Range inputs are excluded: dragging a slider is not a selection, and a
  // blip per pixel of travel is intolerable.
  useEffect(() => {
    const SELECTOR = [
      "button",
      '[role="button"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      "select",
      "a[href]",
      "label",
      ".hud-int",
      '[data-sfx="select"]',
    ].join(",");

    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(SELECTOR);
      if (!el) return;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return;
      if (el.matches('input[type="range"]')) return;
      // A subtree can opt out — the audio widget does, so setting a level
      // does not click at you while you do it.
      if (target.closest('[data-sfx="none"]')) return;
      sfx.play("uiSelect");
    };

    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [sfx]);

  // Dev handle for scripts/check-audio.mjs and for poking at the soundtrack
  // from the console. Dev only — nothing in the app reads it.
  useEffect(() => {
    if (import.meta.env?.DEV) window.__ashlandAudio = { music, sfx };
  }, [music, sfx]);

  const value = useMemo(() => {
    // One Mute button drives both buses. They keep separate volumes (and
    // separate stored prefs) so the balance survives a mute/unmute, but a
    // player who wants silence wants *silence*, not a hunt for two switches.
    const setMuted = (m) => { music.setMuted(m); sfx.setMuted(m); };
    return {
      music: {
        ...musicStatus,
        player: music,
        setVolume: (v) => music.setVolume(v),
        skip: () => music.skip(),
        playNow: () => music.playNow(),
        getGapRemainingMs: () => music.getGapRemainingMs(),
      },
      sfx: {
        ...sfxStatus,
        player: sfx,
        setVolume: (v) => sfx.setVolume(v),
        play: (name, opts) => sfx.play(name, opts),
        hold: (name, opts) => sfx.hold(name, opts),
        release: (name, opts) => sfx.release(name, opts),
      },
      muted: musicStatus.muted,
      setMuted,
      toggleMuted: () => setMuted(!musicStatus.muted),
    };
  }, [musicStatus, sfxStatus, music, sfx]);

  return (
    <AudioCtx.Provider value={value}>
      {children}
      {widget && <AudioWidget />}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio() needs an <AudioProvider> above it");
  return ctx;
}

export function useMusic() {
  return useAudio().music;
}

export function useSfx() {
  return useAudio().sfx;
}

/**
 * Declare which soundtrack scene the current screen belongs to.
 *   "menu" → the pinned title theme (title / setup / lore)
 *   "game" → the shuffled four-cut rotation
 * Idempotent: re-asserting the current scene does not restart anything, so
 * every screen in a scene can call this without coordinating.
 */
export function useMusicScene(scene) {
  const { player } = useMusic();
  useEffect(() => {
    player.setScene(scene);
  }, [player, scene]);
}

// Cues already announced, so a component that unmounts and remounts around
// the same game object (a modal hidden while the diplomacy drawer is open,
// StrictMode's dev remount) does not announce it twice. Bounded FIFO — the
// keys are game-object ids, and only the recent ones can still recur.
const announced = new Set();
const ANNOUNCED_MAX = 64;

/**
 * Fire a cue once for each new `key`.
 *
 * The key is the *identity of the thing being announced* (a warning id, an
 * encounter id), not a boolean "is it open" — so re-renders, a modal's own
 * state changes, and a remount all pass silently, while a second warning
 * queued behind the first still gets its cue.
 */
export function useSfxOn(key, name, opts) {
  const sfx = useSfx();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useEffect(() => {
    if (key == null) return;
    const k = `${name}::${key}`;
    if (announced.has(k)) return;
    announced.add(k);
    if (announced.size > ANNOUNCED_MAX) announced.delete(announced.values().next().value);
    sfx.play(name, optsRef.current);
  }, [key, name, sfx]);
}

/**
 * Sound a cue for as long as `active` is true, then fade it out.
 *
 * For the two kinds of sound that belong to a state rather than a moment: a
 * bed that repeats while some UI is up, and a long stinger that should be
 * allowed to play out but cut gracefully when the moment ends early. Which
 * one you get is the cue's `loop` flag, not the caller's business.
 *
 * Tied to the player singleton rather than to the context value, so a volume
 * drag (which changes the context object) cannot restart the sound mid-note.
 */
export function useSfxHold(active, name) {
  const { player } = useSfx();
  useEffect(() => {
    if (!active) return undefined;
    player.hold(name);
    return () => player.release(name);
  }, [active, name, player]);
}

/**
 * Fire a cue every time `key` becomes a new non-null value.
 *
 * The counterpart to useSfxOn: no memory across keys, so reselecting the same
 * unit after deselecting it whooshes again — which is what a UI cue should do,
 * and exactly what a once-ever announcement should not. Pass null while there
 * is nothing open. Two of these firing on the same tick collapse into one hit
 * in the player's retrigger guard.
 */
export function useSfxOnChange(key, name, opts) {
  const sfx = useSfx();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const lastRef = useRef(null);
  useEffect(() => {
    if (key == null) { lastRef.current = null; return; }
    if (key === lastRef.current) return;
    lastRef.current = key;
    sfx.play(name, optsRef.current);
  }, [key, name, sfx]);
}
