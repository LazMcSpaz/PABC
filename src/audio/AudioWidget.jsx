/**
 * AudioWidget.jsx — the always-there audio control.
 *
 * A small holo speaker button pinned bottom-left on every screen. Click it to
 * open a panel with mute, separate music and effects levels, what's playing,
 * and a skip. It is also the one place that tells the player when the
 * browser's autoplay policy has muzzled us, and offers the click that fixes it.
 *
 * Styling follows the HUD language in HudChrome.jsx (C palette, Oswald,
 * holo cyan) so it does not read as browser chrome bolted onto the game.
 */

import { useEffect, useRef, useState } from "react";
import { C } from "../prototype/HudChrome.jsx";
import { useAudio } from "./AudioProvider.jsx";

const HOLO = "#56d3c6";

function SpeakerIcon({ muted, level }) {
  // Wave arcs light up with the volume so the button reads as a level meter
  // at a glance, without needing a separate readout.
  const bars = muted ? 0 : level > 0.66 ? 3 : level > 0.33 ? 2 : level > 0 ? 1 : 0;
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor" />
      {muted ? (
        <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      ) : (
        <>
          {bars >= 1 && <path d="M15 10.1a2.7 2.7 0 010 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
          {bars >= 2 && <path d="M17.4 8.2a6 6 0 010 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
          {bars >= 3 && <path d="M19.8 6.2a9.2 9.2 0 010 11.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}

export default function AudioWidget() {
  const audio = useAudio();
  const { music } = audio;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dim = audio.muted || music.blocked;

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 400, // above the envoy modal (320) — mute must always be reachable
        fontFamily: C.font,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {open && <AudioPanel audio={audio} />}

      <button
        type="button"
        className="hud-int"
        onClick={() => setOpen((v) => !v)}
        title={music.blocked ? "Click to enable sound" : "Sound"}
        aria-label="Sound controls"
        style={{
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: 8,
          cursor: "pointer",
          color: dim ? "rgba(86,211,198,0.42)" : HOLO,
          background: "linear-gradient(158deg, rgba(16,28,29,0.86), rgba(8,15,16,0.92))",
          border: `1px solid rgba(86,211,198,${open ? 0.75 : 0.34})`,
          boxShadow: open
            ? `0 0 14px rgba(86,211,198,0.28), inset 0 0 12px rgba(86,211,198,0.10)`
            : `inset 0 0 12px rgba(86,211,198,0.06)`,
          transition: "border-color .16s ease, box-shadow .16s ease, color .16s ease",
          padding: 0,
          position: "relative", // anchors the autoplay-blocked pip below
        }}
      >
        <SpeakerIcon muted={audio.muted} level={music.volume} />
        {music.blocked && (
          // A quiet pip rather than a nag banner — the soundtrack starts on
          // the player's first click anyway.
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: C.gold,
              boxShadow: `0 0 6px ${C.gold}`,
            }}
          />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pop-up panel
// ---------------------------------------------------------------------------

function AudioPanel({ audio }) {
  const { music, sfx } = audio;
  const [gapLeft, setGapLeft] = useState(() => music.getGapRemainingMs());

  // Only tick while the panel is open — the player never emits position
  // updates, precisely so the rest of the app does not re-render at 4Hz.
  useEffect(() => {
    if (music.state !== "gap") { setGapLeft(0); return; }
    setGapLeft(music.getGapRemainingMs());
    const t = setInterval(() => setGapLeft(music.getGapRemainingMs()), 250);
    return () => clearInterval(t);
  }, [music.state, music]);

  let line;
  if (music.blocked) line = "Click anywhere to start the music";
  else if (music.state === "gap") line = gapLeft > 0 ? `Next cut in ${Math.ceil(gapLeft / 1000)}s` : "Next cut…";
  else if (music.state === "playing") line = music.trackTitle || "Playing";
  else line = "Standby";

  return (
    <div
      style={{
        minWidth: 214,
        padding: "12px 13px 13px",
        borderRadius: 9,
        background: "linear-gradient(158deg, rgba(16,28,29,0.95), rgba(7,13,14,0.97))",
        border: `1px solid rgba(86,211,198,0.55)`,
        boxShadow: `0 0 22px rgba(86,211,198,0.18), 0 12px 28px rgba(0,0,0,0.62), inset 0 0 24px rgba(86,211,198,0.05)`,
        color: C.text,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 2.6,
          textTransform: "uppercase",
          color: C.holoHi,
          opacity: 0.72,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        ▸ Sound
      </div>

      <div
        style={{
          fontSize: 11.5,
          letterSpacing: 0.7,
          color: music.blocked ? C.gold : "rgba(236,227,210,0.86)",
          minHeight: 15,
          marginBottom: 10,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {line}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <PanelBtn onClick={audio.toggleMuted} active={audio.muted} title={audio.muted ? "Unmute" : "Mute everything"}>
          {audio.muted ? "Unmute" : "Mute"}
        </PanelBtn>
        <PanelBtn onClick={music.state === "gap" ? music.playNow : music.skip} title="Next track">
          {music.state === "gap" ? "Play now" : "Skip"}
        </PanelBtn>
      </div>

      <Slider label="Music" value={music.volume} onChange={music.setVolume} />
      <Slider label="FX" value={sfx.volume} onChange={sfx.setVolume} />
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <span
        style={{
          fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase",
          color: C.textFaint, width: 30, flexShrink: 0,
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={`${label} volume`}
        style={{ flex: 1, accentColor: HOLO, cursor: "pointer", minWidth: 0 }}
      />
      <span style={{ fontSize: 10, color: C.textDim, width: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

function PanelBtn({ children, onClick, active, title }) {
  return (
    <button
      type="button"
      className="hud-int"
      onClick={onClick}
      title={title}
      style={{
        flex: 1,
        fontFamily: C.font,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        padding: "6px 8px",
        borderRadius: 5,
        cursor: "pointer",
        color: active ? "#06110f" : C.holoHi,
        background: active ? HOLO : "rgba(86,211,198,0.10)",
        border: `1px solid rgba(86,211,198,${active ? 0.9 : 0.35})`,
        transition: "background .14s ease, color .14s ease",
      }}
    >
      {children}
    </button>
  );
}
