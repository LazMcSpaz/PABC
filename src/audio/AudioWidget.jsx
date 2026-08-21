/**
 * AudioWidget.jsx — the always-there audio control.
 *
 * A small holo speaker button pinned bottom-left on every screen, opening a
 * panel with the two level sliders and nothing else. The same sliders appear
 * in the in-game Settings window; this is the copy that is reachable from the
 * title screen, where there is no Settings to open.
 *
 * The one thing it says beyond the levels is when the browser's autoplay
 * policy has muzzled us — that is a state the player cannot otherwise explain,
 * so it earns its line. Nothing else does: a now-playing readout is a detail
 * nobody came here for.
 *
 * Styling follows the HUD language in HudChrome.jsx (C palette, Oswald,
 * holo cyan) so it does not read as browser chrome bolted onto the game.
 */

import { useEffect, useRef, useState } from "react";
import { C } from "../prototype/HudChrome.jsx";
import { useAudio } from "./AudioProvider.jsx";
import VolumeSliders from "./VolumeSliders.jsx";

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
      // Opts this whole corner out of the global click cue — a volume control
      // that blips every time you touch it is unusable for setting a level.
      data-sfx="none"
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
  return (
    <div
      style={{
        minWidth: 214,
        padding: "12px 13px 14px",
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
          marginBottom: 11,
        }}
      >
        ▸ Sound
      </div>

      {audio.music.blocked && (
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: 0.7,
            lineHeight: 1.4,
            color: C.gold,
            marginBottom: 11,
          }}
        >
          Click anywhere to start the music.
        </div>
      )}

      <VolumeSliders compact />
    </div>
  );
}
