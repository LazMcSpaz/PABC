// §18 Diplomacy screen — the human's outgoing diplomatic surface. Reads the
// public political state from the adapter (state.diplomacy) and issues the
// §18.7 verbs through `onAction` (→ performDiplomacy). Standing & reputation
// are public; this is read-legible courtship, not guesswork (§18.8).
import { theme } from "./data.js";

const TIER_COLOR = {
  allied: "#5fc27a", friendly: "#9cc861", neutral: "#c9b24e",
  wary: "#d2913c", hostile: "#d2453f",
};

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 86 }}>
      <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: theme.textFaint }}>{label}</span>
      <span style={{ fontFamily: theme.fontDisplay, fontSize: 22, fontWeight: 800, color: color || theme.text }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: theme.textFaint }}>{sub}</span>}
    </div>
  );
}

function Btn({ label, onClick, tone }) {
  const c = tone === "war" ? "#d2453f" : tone === "good" ? "#5fc27a" : theme.accent;
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: theme.fontDisplay, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
        color: "#11100c", background: c, border: "none", borderRadius: 4,
        padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function FactionRow({ f, onAction }) {
  const tierColor = TIER_COLOR[f.standingTier] || theme.text;
  const rel = f.lordOfYou ? "YOUR LORD" : f.vassalOfYou ? "YOUR VASSAL"
    : f.pacted ? "ALLIED" : f.atWar ? "AT WAR" : f.inCoalition ? "COALITION" : null;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: f.color, flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, color: theme.text }}>{f.name}</span>
          <span style={{ fontSize: 9, color: theme.textFaint, textTransform: "uppercase" }}>
            {f.tier}{f.scope === "local" ? " · local" : ""} · {f.temperament}
          </span>
          {rel && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: f.atWar || f.inCoalition ? "#d2453f" : "#5fc27a" }}>
              {rel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: theme.textFaint }}>
          stands <b style={{ color: tierColor }}>{f.standingTier}</b> ({f.standing >= 0 ? "+" : ""}{f.standing}) ·
          {" "}wants {f.wants} · tolerates Menace ≤ {f.tolerance}, needs Honor ≥ {f.trustFloor}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 230 }}>
        {!f.lordOfYou && !f.vassalOfYou && (
          <>
            <Btn label="Gift 5" tone="good" onClick={() => onAction("gift", { faction: f.id, amount: 5 })} />
            {!f.pacted && !f.atWar && <Btn label="Pact" tone="good" onClick={() => onAction("propose-pact", { faction: f.id })} />}
            {f.atWar
              ? <Btn label="Peace" onClick={() => onAction("make-peace", { faction: f.id })} />
              : <Btn label="War" tone="war" onClick={() => onAction("declare-war", { faction: f.id })} />}
            <Btn label="Vassalize" onClick={() => onAction("vassalize", { faction: f.id })} />
            <Btn label="Denounce" tone="war" onClick={() => onAction("denounce", { faction: f.id })} />
          </>
        )}
      </div>
    </div>
  );
}

export default function DiplomacyScreen({ dip, lastResult, onAction, onClose }) {
  if (!dip) return null;
  const rec = dip.recognition;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 65, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.74)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.plate, border: `2px solid ${theme.accent}`, borderRadius: 12,
          width: 720, maxWidth: "94vw", maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: theme.shadowDeep, overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontFamily: theme.fontDisplay, fontSize: 16, fontWeight: 800, letterSpacing: 1, color: theme.accent }}>DIPLOMACY</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: theme.textFaint, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* reputation + recognition readouts */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-around", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
          <Stat label="Menace" value={dip.menace} color="#d2913c" />
          <Stat label="Honor" value={dip.honor} color="#5fc27a" />
          <Stat label="Threat" value={dip.threat} sub="coalition risk" />
          <Stat
            label="Recognition"
            value={`${rec.score}/${rec.threshold}`}
            sub={rec.met ? "VICTORY!" : `${rec.contributors.length} backing`}
            color={rec.met ? "#5fc27a" : theme.text}
          />
        </div>

        {dip.coalitionAgainstYou && (
          <div style={{ padding: "8px 18px", background: "rgba(210,69,63,0.18)", color: "#ffb4ae", fontSize: 12, fontWeight: 700 }}>
            ⚠ A coalition has formed against you: {dip.coalitionAgainstYou.join(", ")}
          </div>
        )}
        {lastResult && (
          <div style={{ padding: "6px 18px", fontSize: 11, color: lastResult.ok && lastResult.accepted !== false ? "#5fc27a" : "#d2913c" }}>
            {lastResult.msg}
          </div>
        )}

        {/* faction rows */}
        <div style={{ overflowY: "auto" }}>
          {dip.factions.map((f) => <FactionRow key={f.id} f={f} onAction={onAction} />)}
        </div>

        <div style={{ padding: "8px 18px", fontSize: 10, color: theme.textFaint, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          Allied counts 1 toward Recognition, a Vassal counts 2. You win at {rec.threshold} while your Menace stays under
          each backer's Tolerance and your Honor stays above its floor. Bullying the peaceful or breaking your word closes the path.
        </div>
      </div>
    </div>
  );
}
