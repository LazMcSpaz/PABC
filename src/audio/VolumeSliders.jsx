/**
 * VolumeSliders.jsx — the two level controls, shared by every surface that
 * offers them: the corner audio widget and the in-game Settings window.
 *
 * One component rather than two copies, so the two places cannot drift into
 * disagreeing about what the sliders are called or what range they cover.
 */

import { C } from "../prototype/HudChrome.jsx";
import { useAudio } from "./AudioProvider.jsx";

const HOLO = "#56d3c6";

function Row({ label, value, onChange, compact }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : 5 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: C.font,
            fontSize: compact ? 9 : 10.5,
            letterSpacing: compact ? 1.7 : 2,
            textTransform: "uppercase",
            fontWeight: 600,
            color: C.holoHi,
            opacity: 0.85,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: C.font,
            fontSize: compact ? 10 : 11.5,
            color: C.textDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pct}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={`${label} volume`}
        style={{ width: "100%", accentColor: HOLO, cursor: "pointer", minWidth: 0 }}
      />
    </div>
  );
}

export default function VolumeSliders({ compact = false }) {
  const { music, sfx } = useAudio();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 11 : 15 }}>
      <Row label="Music" value={music.volume} onChange={music.setVolume} compact={compact} />
      <Row label="Sound Effects" value={sfx.volume} onChange={sfx.setVolume} compact={compact} />
    </div>
  );
}
