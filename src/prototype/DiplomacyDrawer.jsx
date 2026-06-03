// §18 Diplomacy — side drawer redesign.
//
// Right-edge drawer (~420 px) that slides in over the board without
// blocking it. Three views, drilled in:
//   Landing → Faction Detail → Action Pane
// Esc / × / back-arrow / click-outside the drawer (i.e. on the map)
// closes back up the stack.
//
// The drawer reads the adapted diplomacy snapshot (state.diplomacy) and
// fires verbs through `onAction`. Verb buttons gate themselves
// (Hidden / Visible-disabled / Visible-enabled) from
// `factionEntry.verbs[]` per §4 — disabled verbs surface their reason on
// hover, enabled verbs surface their outcome hint.
//
// Map binding: when the drawer needs to pick a target on the map (Mediate,
// Pact-Call etc.) it calls `onMapPick({ kind, label, onPick })` and the
// host (Prototype) flips the board into a pick mode that routes hex
// clicks back to `onPick(hexId)`. Faction-detail open also calls
// `onHighlightFaction(factionId)` so the host can colour-glow that
// faction's locations.

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { C, CornerBrackets, useEscClose } from "./HudChrome.jsx";
import { FACTIONS as UI_FACTIONS } from "./data.js";

// Draw a dotted capital-to-capital line between two location ids by
// querying the DOM for hex cells tagged data-loc=<id>. Re-measures on
// resize/scroll so the line tracks pan/zoom.
function TradingPactRouteLayer({ fromLocId, toLocId, status }) {
  const [pts, setPts] = useState(null);
  useLayoutEffect(() => {
    function measure() {
      if (typeof document === "undefined") return null;
      const a = document.querySelector(`[data-loc="${CSS.escape(fromLocId)}"]`);
      const b = document.querySelector(`[data-loc="${CSS.escape(toLocId)}"]`);
      if (!a || !b) return null;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return {
        x1: ra.left + ra.width / 2, y1: ra.top + ra.height / 2,
        x2: rb.left + rb.width / 2, y2: rb.top + rb.height / 2,
      };
    }
    setPts(measure());
    const update = () => setPts(measure());
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [fromLocId, toLocId]);
  if (!pts) return null;
  const color = status === "suspended" ? "#d2913c" : "#5fc27a";
  return (
    <svg style={{
      position: "fixed", inset: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 6, overflow: "visible",
    }}>
      <motion.line
        x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
        stroke={color} strokeWidth="2.2"
        strokeDasharray="7 6" strokeLinecap="round"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -26 }}
        transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}
        style={{ filter: `drop-shadow(0 0 5px ${color})`, opacity: 0.78 }}
      />
      <circle cx={pts.x1} cy={pts.y1} r="5" fill="none" stroke={color} strokeWidth="1.6"
        style={{ filter: `drop-shadow(0 0 5px ${color})`, opacity: 0.8 }} />
      <circle cx={pts.x2} cy={pts.y2} r="5" fill="none" stroke={color} strokeWidth="1.6"
        style={{ filter: `drop-shadow(0 0 5px ${color})`, opacity: 0.8 }} />
    </svg>
  );
}

const TIER_LABEL = {
  allied: "Allied",
  friendly: "Friendly",
  neutral: "Neutral",
  wary: "Wary",
  hostile: "Hostile",
};
const TIER_COLOR = {
  allied: "#5fc27a",
  friendly: "#9cc861",
  neutral: "#c9b24e",
  wary: "#d2913c",
  hostile: "#d2453f",
};

// Verbs the drawer renders. Order = how they appear in the actions
// menu. Each carries label / description / destructive flag.
const VERB_META = {
  "gift":                  { label: "Gift", body: "Send scrap. Raises their Standing toward you." },
  "propose-deal":          { label: "Custom Deal", body: "Build a give/get offer. Opens the deal builder.", isPane: "deal" },
  "demand-tribute":        { label: "Demand Tribute", body: "Take, don't ask. Stains Honor if refused.", isPane: "tribute", destructive: true },
  "sue-for-peace":         { label: "Sue for Peace", body: "Offer terms alongside the peace promise.", isPane: "peace" },
  "propose-pact":          { label: "Propose Pact", body: "Mutual defence + Standing bonus on both sides." },
  "make-peace":            { label: "Make Peace", body: "End the war, no terms attached." },
  "mediate":               { label: "Mediate", body: "Broker peace between two warring factions.", isPane: "mediate" },
  "pact-call":             { label: "Call to Pact", body: "Call your ally into one of your wars.", isPane: "pact-call" },
  "vassalize":             { label: "Vassalize", body: "Bind them under your banner.", destructive: true },
  "free-vassal":           { label: "Free Vassal", body: "Release them. Honor rises; tribute stops.", destructive: true },
  "denounce":              { label: "Denounce", body: "Public condemnation. Standing falls on both sides.", destructive: true },
  "declare-war":           { label: "Declare War", body: "Open hostilities. Menace rises immediately.", destructive: true },
  // §6 trade + passive toggles
  "trading-pact":          { label: "Open Trading Pact", body: "Route between capitals — per-round scrap each side + permanent Research floor." },
  "dissolve-trading-pact": { label: "Close Trading Pact", body: "Closes the trade route. Keeps the Research floor.", destructive: true },
  "set-open-borders":      { label: "Open Borders", body: "Let them transit your territory; they may grant the reverse." },
  "toggle-open-borders":   { label: "Toggle Open Borders", body: "Flip your half of the open-borders agreement on or off." },
  "toggle-allied-vision":  { label: "Toggle Allied Vision", body: "Share line-of-sight with the ally on or off." },
};

const DESTRUCTIVE_PROMPT = {
  "declare-war":            "Declare war? You'll lose Standing and gain Menace immediately. Their allies may join in.",
  "denounce":               "Denounce publicly? Standing falls on both sides and your Honor takes a hit.",
  "vassalize":              "Force vassalage? They'll resist unless they have no choice.",
  "free-vassal":            "Release this vassal? Your Honor rises, their tribute stops.",
  "demand-tribute":         "Demand tribute? Refusal will damage your Honor and could trigger war.",
  "dissolve-trading-pact":  "Close the trading pact? The per-round scrap flow stops; the permanent Research floor stays.",
};

// Loose match — used to skip a verb's `outcome` tooltip when it's a
// near-paraphrase of the static body. Jaccard on long-enough word tokens;
// ≥0.55 overlap is the empirical threshold that catches "Opens a route
// between your capitals — …" vs. "Route between capitals — …" without
// collapsing genuinely-different sentences like "Costs 5 scrap" vs.
// "Will likely accept".
function sameish(a, b) {
  const tokenize = (s) => new Set(
    (s || "").toLowerCase().replace(/[^a-z ]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2)
  );
  const A = tokenize(a), B = tokenize(b);
  if (A.size === 0 || B.size === 0) return false;
  let intersect = 0;
  for (const w of A) if (B.has(w)) intersect++;
  const union = A.size + B.size - intersect;
  return intersect / union >= 0.55;
}

// --- small holo primitives ----------------------------------------------

function Card({ children, accent = C.holo, style }) {
  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(158deg, rgba(16,28,29,0.7), rgba(8,15,16,0.78))",
      border: `1px solid ${accent}55`,
      borderRadius: 7,
      padding: 12,
      boxShadow: `inset 0 0 14px rgba(86,211,198,0.05)`,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, color = C.holoHi }) {
  return (
    <div style={{
      fontFamily: C.font, fontSize: 10, fontWeight: 600,
      letterSpacing: 2, textTransform: "uppercase", color,
      marginBottom: 6,
    }}>{children}</div>
  );
}

// Anonymised reputation bar — fills a track with a coloured zone and
// drops your marker without showing the raw number.
function RepBar({ marker, beyond, label, goodSide, color, dangerColor = "#d2453f" }) {
  // marker: 0..1 (and beyond) relative to the gate.
  // goodSide = "low" means the safe zone is the left; "high" means safe is right.
  const m = Math.max(0, Math.min(1.3, marker));
  const inZone = goodSide === "low" ? !beyond : !beyond;
  const stopFill = goodSide === "low" ? Math.min(1, m) : 1 - Math.min(1, m);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontFamily: C.font, fontSize: 9, letterSpacing: 1.4,
        textTransform: "uppercase",
        color: beyond ? dangerColor : "rgba(143,246,234,0.55)",
      }}>
        <span>{label}</span>
        <span>{beyond ? "Beyond gate" : "Within gate"}</span>
      </div>
      <div style={{
        position: "relative", height: 8, borderRadius: 4,
        background: "rgba(8,12,14,0.7)",
        border: `1px solid ${C.holo}33`,
        overflow: "hidden",
      }}>
        {/* zone fill */}
        <div style={{
          position: "absolute",
          top: 0, bottom: 0,
          left: goodSide === "low" ? 0 : `${(1 - stopFill) * 100}%`,
          width: `${stopFill * 100}%`,
          background: `linear-gradient(90deg, ${color}55, ${color}30)`,
        }} />
        {/* danger fill */}
        {beyond && (
          <div style={{
            position: "absolute",
            top: 0, bottom: 0,
            left: goodSide === "low" ? "100%" : 0,
            transform: goodSide === "low" ? "translateX(0)" : undefined,
            width: `${(Math.min(0.3, m - 1)) * 100}%`,
            background: `linear-gradient(90deg, ${dangerColor}88, ${dangerColor}55)`,
          }} />
        )}
        {/* gate line */}
        <div style={{
          position: "absolute",
          top: -1, bottom: -1,
          left: goodSide === "low" ? "100%" : "0",
          transform: goodSide === "low" ? "translateX(-1px)" : undefined,
          width: 1, background: C.holoHi,
        }} />
        {/* your marker */}
        <div style={{
          position: "absolute",
          top: -2, bottom: -2,
          left: `${Math.min(98, m * (goodSide === "low" ? 100 : 100))}%`,
          transform: "translateX(-50%)",
          width: 3, background: "#f4efe2", borderRadius: 2,
          boxShadow: `0 0 6px #f4efe2`,
        }} />
      </div>
    </div>
  );
}

function VerbButton({ verbMeta, gate, onClick }) {
  const enabled = gate.state === "enabled";
  // Dedupe — skip the outcome when it just rephrases the body.
  const outcome = gate.outcome && !sameish(verbMeta.body, gate.outcome) ? gate.outcome : null;
  const tooltip = enabled
    ? [verbMeta.body, outcome].filter(Boolean).join(" ")
    : `Disabled — ${gate.reason || "not available now"}`;
  const color = verbMeta.destructive ? "#d2453f" : C.holo;
  return (
    <button
      className="hud-int"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={tooltip}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        textAlign: "left", width: "100%",
        padding: "8px 10px", borderRadius: 5,
        border: `1px solid ${enabled ? color : "rgba(86,211,198,0.18)"}`,
        background: enabled ? "rgba(86,211,198,0.08)" : "rgba(86,211,198,0.02)",
        cursor: enabled ? "pointer" : "not-allowed",
        color: enabled ? "#f4efe2" : "rgba(143,246,234,0.45)",
        fontFamily: C.font, fontSize: 11.5, fontWeight: 700,
        letterSpacing: 0.6, textTransform: "uppercase",
        boxShadow: enabled ? `0 0 8px ${color}33` : undefined,
      }}
    >
      <span style={{ flex: 1 }}>{verbMeta.label}</span>
      {gate.state === "disabled" && (
        <span style={{
          fontSize: 8, letterSpacing: 1, color: "rgba(143,246,234,0.45)",
        }}>⛔</span>
      )}
    </button>
  );
}

function ConfirmDialog({ title, body, accent = "#d2453f", onConfirm, onCancel }) {
  useEscClose(onCancel);
  return (
    <motion.div
      onClick={onCancel}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 92,
        background: "rgba(4,8,8,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, y: 8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        style={{
          position: "relative",
          width: 340, padding: 18,
          background: "linear-gradient(158deg, rgba(18,31,32,0.97), rgba(9,17,18,0.98))",
          border: `1px solid ${accent}aa`, borderRadius: 7,
          boxShadow: `0 0 22px ${accent}33, 0 12px 28px rgba(0,0,0,0.6)`,
          color: "#cfd6dc",
        }}
      >
        <CornerBrackets color={accent} len={10} inset={4} w={1.4} />
        <div style={{
          fontFamily: C.font, fontSize: 13, fontWeight: 700,
          letterSpacing: 1.4, textTransform: "uppercase",
          color: accent, textShadow: `0 0 8px ${accent}66`,
          marginBottom: 8,
        }}>{title}</div>
        <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="hud-int" style={btnGhostStyle()}>Cancel</button>
          <button onClick={onConfirm} className="hud-int" style={btnDangerStyle(accent)}>Confirm</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function btnGhostStyle() {
  return {
    fontFamily: C.font, fontSize: 11, fontWeight: 700,
    letterSpacing: 1.2, textTransform: "uppercase",
    padding: "7px 14px", borderRadius: 5,
    border: `1px solid ${C.holo}88`,
    background: "rgba(86,211,198,0.06)",
    color: C.holoHi, cursor: "pointer",
  };
}
function btnDangerStyle(accent) {
  return {
    fontFamily: C.font, fontSize: 11, fontWeight: 700,
    letterSpacing: 1.2, textTransform: "uppercase",
    padding: "7px 14px", borderRadius: 5,
    border: `1px solid ${accent}`,
    background: `linear-gradient(180deg, ${accent}, ${accent}cc)`,
    color: "#fff", cursor: "pointer",
    boxShadow: `0 0 10px ${accent}55`,
  };
}
function btnHoloStyle() {
  return {
    fontFamily: C.font, fontSize: 11, fontWeight: 700,
    letterSpacing: 1.2, textTransform: "uppercase",
    padding: "7px 14px", borderRadius: 5,
    color: "#08100f", border: `1px solid ${C.holo}`,
    background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
    cursor: "pointer", boxShadow: `0 0 10px ${C.holo}55`,
  };
}

// =======================================================================
// Landing view — §3.2
// =======================================================================

function LandingView({ dip, onSelectFaction, onClose }) {
  const rec = dip.recognition;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderBottom: "1px solid rgba(86,211,198,0.22)",
      }}>
        <div>
          <div style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600,
            letterSpacing: 3, textTransform: "uppercase",
            color: C.holoHi, opacity: 0.75,
          }}>Diplomacy</div>
          <div style={{
            fontFamily: C.font, fontSize: 18, fontWeight: 700,
            letterSpacing: 1.4, textTransform: "uppercase",
            color: C.holoHi, textShadow: `0 0 12px ${C.holo}88`,
            marginTop: 1,
          }}>Hall of Powers</div>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="hud-int"
          style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "rgba(6,14,15,0.85)",
            border: `1px solid ${C.holo}aa`,
            color: C.holoHi, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: C.font, fontSize: 14, fontWeight: 700, lineHeight: 1,
            padding: 0,
          }}
        >×</button>
      </div>

      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Reputation block — your aggregate scores. */}
        <Card>
          <SectionLabel>Your Standing in the Ashlands</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <RepStat label="Menace" value={dip.menace.toFixed(1)} color="#d2913c" sub="aggression weight" />
            <RepStat label="Honor" value={dip.honor.toFixed(1)} color="#5fc27a" sub="kept your word" />
            <RepStat label="Threat" value={dip.threat.toFixed(1)} color={dip.threat > 6 ? "#d2453f" : C.holoHi} sub="coalition risk" />
            <RepStat
              label="Recognition"
              value={`${rec.score}/${rec.threshold}`}
              color={rec.met ? "#5fc27a" : "#c9b24e"}
              sub={rec.met ? "Victory!" : `${rec.contributors?.length || 0} backing`}
            />
          </div>
        </Card>

        {dip.coalitionAgainstYou && (
          <Card accent="#d2453f">
            <SectionLabel color="#ffb4ae">Coalition against you</SectionLabel>
            <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {dip.coalitionAgainstYou.join(", ")} have aligned against your rise. Their walls are higher; your reach is shorter.
            </div>
          </Card>
        )}

        <SectionLabel>The Other Powers</SectionLabel>

        {/* Faction list */}
        {dip.factions.map((f) => (
          <FactionRow key={f.id} f={f} onClick={() => onSelectFaction(f.id)} />
        ))}
      </div>
    </div>
  );
}

function RepStat({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 70 }}>
      <span style={{
        fontFamily: C.font, fontSize: 9, letterSpacing: 1.6,
        textTransform: "uppercase", color: "rgba(143,246,234,0.55)",
      }}>{label}</span>
      <span style={{
        fontFamily: C.font, fontSize: 18, fontWeight: 700,
        color: color || "#f4efe2",
        textShadow: `0 0 8px ${color || C.holo}55`,
        lineHeight: 1.1,
      }}>{value}</span>
      {sub && <span style={{
        fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.7,
        color: "rgba(143,246,234,0.45)", marginTop: 2,
      }}>{sub}</span>}
    </div>
  );
}

function FactionRow({ f, onClick }) {
  const tierColor = TIER_COLOR[f.standingTier] || "#f4efe2";
  const rel = f.lordOfYou ? "YOUR LORD"
    : f.vassalOfYou ? "YOUR VASSAL"
    : f.pacted ? "PACTED"
    : f.atWar ? "AT WAR"
    : f.inCoalition ? "IN COALITION" : null;
  const warn = [];
  if (f.menaceBeyondTolerance) warn.push({ glyph: "⚠", title: "Your Menace is past their Tolerance" });
  if (f.honorBelowFloor) warn.push({ glyph: "💀", title: "Your Honor is below their floor" });
  return (
    <button
      onClick={onClick}
      className="hud-int"
      style={{
        textAlign: "left",
        position: "relative",
        background: "linear-gradient(158deg, rgba(16,28,29,0.78), rgba(8,15,16,0.85))",
        border: `1px solid ${f.color}55`,
        borderLeft: `3px solid ${f.color}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        boxShadow: `0 0 8px ${f.color}22`,
        color: "#f4efe2",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: f.color, boxShadow: `0 0 8px ${f.color}`,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: C.font, fontSize: 13.5, fontWeight: 700,
          letterSpacing: 0.6, textTransform: "uppercase",
          color: "#f4efe2", textShadow: `0 0 8px ${f.color}66`,
        }}>{f.name}</span>
        {f.scope === "local" && (
          <span style={{
            fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.2,
            textTransform: "uppercase", color: "rgba(143,246,234,0.55)",
            border: `1px solid rgba(143,246,234,0.4)`, borderRadius: 3,
            padding: "1px 5px",
          }}>Local</span>
        )}
        <div style={{ flex: 1 }} />
        {warn.map((w, i) => (
          <span key={i} title={w.title} style={{ fontSize: 13, color: "#d2913c" }}>{w.glyph}</span>
        ))}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 5,
        fontFamily: C.font, fontSize: 10, letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        <span style={{ color: tierColor, fontWeight: 700 }}>{TIER_LABEL[f.standingTier] || f.standingTier}</span>
        {rel && (
          <span style={{
            color: f.atWar || f.inCoalition ? "#d2453f" : "#5fc27a",
            fontWeight: 800, letterSpacing: 1.4,
          }}>{rel}</span>
        )}
      </div>
      <div className="pc-prose" style={{
        fontSize: 11.5, color: "rgba(207,214,220,0.86)", marginTop: 5, lineHeight: 1.4,
      }}>{f.sentenceShort}</div>
    </button>
  );
}

// =======================================================================
// Faction Detail view — §3.3
// =======================================================================

function FactionDetailView({ f, dip, onBack, onClose, onVerb, onOpenPane, onConfirmAndAct }) {
  const tierColor = TIER_COLOR[f.standingTier] || "#f4efe2";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <DetailHeader f={f} tierColor={tierColor} onBack={onBack} onClose={onClose} />

      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Sentiment panel */}
        <Card>
          <SectionLabel color={tierColor}>Their stance</SectionLabel>
          <div className="pc-prose" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{f.sentenceLong}</div>
        </Card>

        {/* Reputation gate panel — anonymised bars */}
        <Card>
          <SectionLabel>Reputation gates</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <RepBar
              marker={f.menaceMarker}
              beyond={f.menaceBeyondTolerance}
              label="Menace · their tolerance"
              goodSide="low"
              color="#5fc27a"
            />
            <RepBar
              marker={1 - Math.max(0, Math.min(1, f.honorMarker))}
              beyond={f.honorBelowFloor}
              label="Honor · their trust floor"
              goodSide="high"
              color="#5fc27a"
            />
          </div>
        </Card>

        {/* Relationship & obligations */}
        <Card>
          <SectionLabel>Relationship</SectionLabel>
          <ObligationsList f={f} dip={dip} />
        </Card>

        {/* What they want */}
        <Card>
          <SectionLabel>What they want</SectionLabel>
          <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4 }}>
              <strong style={{ color: C.holoHi, textTransform: "uppercase", letterSpacing: 1 }}>
                {f.temperament || "—"}
              </strong>
            </div>
            {f.wants}
          </div>
        </Card>

        {/* Tech wheel (B1 gated) */}
        {dip.spyRing ? (
          <Card>
            <SectionLabel>Tech wheel</SectionLabel>
            <TechReadout nodes={f.theirTechWheel || []} />
          </Card>
        ) : (
          <Card accent="rgba(86,211,198,0.2)">
            <SectionLabel>Tech wheel</SectionLabel>
            <div style={{
              fontFamily: C.font, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              color: "rgba(143,246,234,0.5)",
            }}>— Espionage required (Intelligence B1 Spy Ring)</div>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <SectionLabel>Actions</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(f.verbs || []).map((v) => {
              const meta = VERB_META[v.verb];
              if (!meta) return null;
              return (
                <VerbButton
                  key={v.verb}
                  verbMeta={meta}
                  gate={v}
                  onClick={() => {
                    if (meta.isPane) onOpenPane(meta.isPane);
                    else if (meta.destructive) onConfirmAndAct(v.verb, { faction: f.id });
                    else if (v.verb === "set-open-borders") onVerb(v.verb, { faction: f.id, on: true });
                    else if (v.verb === "toggle-open-borders") onVerb(v.verb, { faction: f.id, on: !f.openBordersFromYou });
                    else if (v.verb === "toggle-allied-vision") onVerb(v.verb, { faction: f.id, on: true });
                    else onVerb(v.verb, { faction: f.id });
                  }}
                />
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DetailHeader({ f, tierColor, onBack, onClose }) {
  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid rgba(86,211,198,0.22)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <button
        onClick={onBack}
        title="Back"
        className="hud-int"
        style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "rgba(6,14,15,0.85)",
          border: `1px solid ${C.holo}88`,
          color: C.holoHi, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: C.font, fontSize: 14, fontWeight: 700, lineHeight: 1,
          padding: 0, flexShrink: 0,
        }}
      >‹</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            background: f.color, boxShadow: `0 0 8px ${f.color}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: C.font, fontSize: 15, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase",
            color: "#f4efe2", textShadow: `0 0 10px ${f.color}77`,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{f.name}</span>
        </div>
        <div style={{
          fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.6,
          textTransform: "uppercase", color: tierColor, marginTop: 2,
        }}>
          {TIER_LABEL[f.standingTier] || f.standingTier} · {f.temperament || "—"}{f.scope === "local" ? " · local" : ""}
        </div>
      </div>
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="hud-int"
        style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "rgba(6,14,15,0.85)",
          border: `1px solid ${C.holo}88`,
          color: C.holoHi, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: C.font, fontSize: 13, fontWeight: 700, lineHeight: 1,
          padding: 0, flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}

function ObligationsList({ f, dip }) {
  const items = [];
  if (f.lordOfYou) items.push("You are sworn to them as their vassal.");
  if (f.vassalOfYou) items.push("They are your vassal — tribute flows to your bank each Upkeep.");
  if (f.pacted) items.push("You have a mutual-defence pact.");
  if (f.atWar) items.push("You are at war.");
  if (f.inCoalition) items.push("They have joined a coalition against you.");
  if (f.tradingPact) {
    items.push(f.tradingPact.suspended
      ? `Trading pact — suspended (round ${f.tradingPact.suspendedRounds} of grace).`
      : "Trading pact — open route between capitals.");
  }
  if (f.openBordersFromYou && f.openBordersFromThem) items.push("Open borders both ways.");
  else if (f.openBordersFromYou) items.push("You allow their units through your territory.");
  else if (f.openBordersFromThem) items.push("They allow your units through their territory.");
  if (items.length === 0) items.push("No formal agreements with this faction.");

  return (
    <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.55 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((t, i) => <div key={i}>· {t}</div>)}
      </div>
      {f.thirdParty ? (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.4,
            textTransform: "uppercase", color: C.holoHi, marginBottom: 4,
          }}>Third parties (Spy Ring)</div>
          {f.thirdParty.pacts.length > 0 && (
            <div>Pacted with: {f.thirdParty.pacts.join(", ")}</div>
          )}
          {f.thirdParty.wars.length > 0 && (
            <div>At war with: {f.thirdParty.wars.join(", ")}</div>
          )}
          {f.thirdParty.pacts.length === 0 && f.thirdParty.wars.length === 0 && (
            <div>— No third-party agreements.</div>
          )}
        </div>
      ) : (
        <div style={{
          marginTop: 10, fontSize: 11,
          color: "rgba(143,246,234,0.45)",
          fontFamily: C.font, letterSpacing: 1, textTransform: "uppercase",
        }}>Third parties · Espionage required</div>
      )}
    </div>
  );
}

function TechReadout({ nodes }) {
  if (!nodes || nodes.length === 0) {
    return <div className="pc-prose" style={{ fontSize: 12, color: "rgba(207,214,220,0.6)" }}>
      No tech nodes assigned yet.
    </div>;
  }
  const byPath = { military: [], logistics: [], economy: [], intelligence: [] };
  for (const id of nodes) {
    const p = id.startsWith("mil") ? "military" : id.startsWith("log") ? "logistics" : id.startsWith("eco") ? "economy" : id.startsWith("int") ? "intelligence" : null;
    if (p) byPath[p].push(id.slice(-2).toUpperCase());
  }
  return (
    <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {Object.entries(byPath).map(([path, ids]) =>
        ids.length > 0 ? (
          <div key={path}>
            <strong style={{ textTransform: "uppercase", color: C.holoHi, letterSpacing: 1 }}>
              {path}
            </strong> · {ids.join(", ")}
          </div>
        ) : null
      )}
    </div>
  );
}

// =======================================================================
// Action panes — §3.4
// =======================================================================

function DealPane({ f, dip, kind = "custom", onBack, onSubmit }) {
  const [scrapGive, setScrapGive] = useState(0);
  const [scrapGet, setScrapGet] = useState(0);
  const [pactOffer, setPactOffer] = useState(false);
  const [openBorders, setOpenBorders] = useState(false);
  const isPeace = kind === "peace";
  const isTribute = kind === "tribute";

  const deal = useMemo(() => {
    const give = [];
    const get = [];
    if (scrapGive > 0) give.push({ resource: { resource: "scrap", amount: scrapGive } });
    if (scrapGet > 0) get.push({ resource: { resource: "scrap", amount: scrapGet } });
    if (pactOffer && !isTribute) give.push({ pact: true });
    if (openBorders) give.push({ openBorders: true });
    if (isPeace) give.push({ peace: true });
    return { proposer: dip.youId, recipient: f.id, give, get };
  }, [scrapGive, scrapGet, pactOffer, openBorders, dip.youId, f.id, isPeace, isTribute]);

  const title = isPeace ? "Sue for peace" : isTribute ? "Demand tribute" : "Custom deal";
  const subtitle = isPeace
    ? "The peace promise is fixed; everything else is yours to shape."
    : isTribute
    ? "Make them an offer they can refuse. Then live with the cost."
    : "Build a give/get. They accept where the offer outweighs the ask.";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PaneHeader title={title} f={f} onBack={onBack} />
      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{
          fontFamily: C.font, fontSize: 11, letterSpacing: 1, lineHeight: 1.5,
          color: "rgba(207,214,220,0.7)",
        }}>{subtitle}</div>

        {/* Two-column give / get */}
        <div style={{ display: "flex", gap: 10 }}>
          {!isTribute && (
            <Card style={{ flex: 1 }}>
              <SectionLabel>You give</SectionLabel>
              <NumberRow label="Scrap" value={scrapGive} onChange={setScrapGive} max={50} disabled={isTribute} />
              {!isPeace && (
                <Toggle label="Offer pact" value={pactOffer} onChange={setPactOffer} />
              )}
              <Toggle label="Open borders" value={openBorders} onChange={setOpenBorders} />
              {isPeace && (
                <div style={{
                  fontFamily: C.font, fontSize: 10, letterSpacing: 1.2,
                  textTransform: "uppercase", color: C.holoHi, marginTop: 8,
                  padding: "4px 6px", border: `1px dashed ${C.holo}66`, borderRadius: 4,
                  background: "rgba(86,211,198,0.06)",
                }}>+ Peace (locked)</div>
              )}
            </Card>
          )}
          <Card style={{ flex: 1 }}>
            <SectionLabel>You get</SectionLabel>
            <NumberRow label="Scrap" value={scrapGet} onChange={setScrapGet} max={50} />
          </Card>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onBack} className="hud-int" style={btnGhostStyle()}>Back</button>
          <button
            onClick={() => onSubmit(deal, kind)}
            className="hud-int"
            style={btnHoloStyle()}
          >{isTribute ? "Demand" : isPeace ? "Sue for peace" : "Propose"}</button>
        </div>
      </div>
    </div>
  );
}

function MediatePane({ dip, onBack, onSubmit }) {
  const [picked, setPicked] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PaneHeader title="Mediate" onBack={onBack} />
      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          fontFamily: C.font, fontSize: 11, letterSpacing: 1, lineHeight: 1.5,
          color: "rgba(207,214,220,0.7)",
        }}>Pick two warring factions you'll broker peace between.</div>
        {dip.warringPairs.length === 0 ? (
          <Card>
            <div className="pc-prose" style={{ fontSize: 12, color: "rgba(207,214,220,0.6)" }}>
              There are no third-party wars right now.
            </div>
          </Card>
        ) : (
          dip.warringPairs.map((p, i) => {
            const fa = dip.factions.find((x) => x.id === p.a);
            const fb = dip.factions.find((x) => x.id === p.b);
            if (!fa || !fb) return null;
            const sel = picked && picked.a === p.a && picked.b === p.b;
            return (
              <button
                key={i}
                onClick={() => setPicked(p)}
                className="hud-int"
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: `1px solid ${sel ? C.holoHi : "rgba(86,211,198,0.3)"}`,
                  background: sel ? "rgba(86,211,198,0.12)" : "rgba(86,211,198,0.04)",
                  cursor: "pointer",
                  color: "#f4efe2",
                }}
              >
                <div style={{
                  fontFamily: C.font, fontSize: 12, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: "uppercase",
                }}>
                  <span style={{ color: fa.color }}>{fa.name}</span>
                  <span style={{ color: C.holoHi }}> ⚔ </span>
                  <span style={{ color: fb.color }}>{fb.name}</span>
                </div>
              </button>
            );
          })
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onBack} className="hud-int" style={btnGhostStyle()}>Back</button>
          <button
            onClick={() => picked && onSubmit({ a: picked.a, b: picked.b })}
            className="hud-int"
            disabled={!picked}
            style={{ ...btnHoloStyle(), opacity: picked ? 1 : 0.4, cursor: picked ? "pointer" : "not-allowed" }}
          >Mediate</button>
        </div>
      </div>
    </div>
  );
}

function PactCallPane({ f, dip, onBack, onSubmit }) {
  // Outgoing pact-call: your pacted ally `f`, choose one of your wars to call them into.
  const myWars = useMemo(() => {
    const out = [];
    for (const other of dip.factions) {
      if (other.id === f.id) continue;
      if (other.atWar) out.push(other);
    }
    return out;
  }, [dip, f.id]);
  const [target, setTarget] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PaneHeader title={`Call ${f.name}`} onBack={onBack} f={f} />
      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          fontFamily: C.font, fontSize: 11, letterSpacing: 1, lineHeight: 1.5,
          color: "rgba(207,214,220,0.7)",
        }}>Pick the war you're asking them to join. Refusal will cost them Honor; honouring it pulls them into your fight.</div>
        {myWars.length === 0 ? (
          <Card>
            <div className="pc-prose" style={{ fontSize: 12, color: "rgba(207,214,220,0.6)" }}>
              You have no active wars to call them into.
            </div>
          </Card>
        ) : (
          myWars.map((t) => {
            const sel = target === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                className="hud-int"
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: `1px solid ${sel ? C.holoHi : "rgba(86,211,198,0.3)"}`,
                  background: sel ? "rgba(86,211,198,0.12)" : "rgba(86,211,198,0.04)",
                  cursor: "pointer",
                  color: "#f4efe2",
                }}
              >
                <div style={{
                  fontFamily: C.font, fontSize: 12, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: "uppercase",
                }}>
                  <span style={{ color: t.color }}>{t.name}</span>
                </div>
              </button>
            );
          })
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onBack} className="hud-int" style={btnGhostStyle()}>Back</button>
          <button
            onClick={() => target && onSubmit({ caller: dip.youId, ally: f.id, target })}
            className="hud-int"
            disabled={!target}
            style={{ ...btnHoloStyle(), opacity: target ? 1 : 0.4, cursor: target ? "pointer" : "not-allowed" }}
          >Send the call</button>
        </div>
      </div>
    </div>
  );
}

function PaneHeader({ title, f, onBack }) {
  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid rgba(86,211,198,0.22)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <button
        onClick={onBack}
        title="Back"
        className="hud-int"
        style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "rgba(6,14,15,0.85)",
          border: `1px solid ${C.holo}88`,
          color: C.holoHi, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: C.font, fontSize: 14, fontWeight: 700, lineHeight: 1,
          padding: 0, flexShrink: 0,
        }}
      >‹</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: C.font, fontSize: 14, fontWeight: 700,
          letterSpacing: 1.2, textTransform: "uppercase", color: C.holoHi,
          textShadow: `0 0 8px ${C.holo}66`,
        }}>{title}</div>
        {f && (
          <div style={{
            fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.4,
            textTransform: "uppercase", color: f.color, marginTop: 2,
          }}>{f.name}</div>
        )}
      </div>
    </div>
  );
}

function NumberRow({ label, value, onChange, max = 99, disabled }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
      <span style={{
        flex: 1,
        fontFamily: C.font, fontSize: 11.5,
        letterSpacing: 0.6, color: "#cfd6dc",
      }}>{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        className="hud-int"
        style={smallBtnStyle()}
      >−</button>
      <span style={{
        width: 28, textAlign: "center",
        fontFamily: C.font, fontWeight: 700, fontSize: 14,
        color: "#f4efe2",
      }}>{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className="hud-int"
        style={smallBtnStyle()}
      >+</button>
    </div>
  );
}
function smallBtnStyle() {
  return {
    width: 22, height: 22, borderRadius: 4,
    border: `1px solid ${C.holo}88`,
    background: "rgba(86,211,198,0.08)",
    color: C.holoHi, cursor: "pointer",
    fontFamily: C.font, fontSize: 13, fontWeight: 700, lineHeight: 1,
    padding: 0,
  };
}
function Toggle({ label, value, onChange }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8, marginTop: 8,
      cursor: "pointer", userSelect: "none",
    }} onClick={() => onChange(!value)}>
      <span style={{
        width: 12, height: 12,
        border: `1px solid ${C.holo}aa`, borderRadius: 2,
        background: value ? C.holo : "rgba(86,211,198,0.08)",
        boxShadow: value ? `0 0 5px ${C.holo}88` : undefined,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {value && <span style={{ fontFamily: C.font, fontSize: 9, color: "#08100f", fontWeight: 800 }}>✓</span>}
      </span>
      <span style={{
        fontFamily: C.font, fontSize: 11.5,
        letterSpacing: 0.6, color: "#cfd6dc",
      }}>{label}</span>
    </label>
  );
}

// =======================================================================
// Drawer root
// =======================================================================

export default function DiplomacyDrawer({
  dip, lastResult, onAction, onClose,
  onHighlightFaction, // (factionId | null) — host glows that faction's locations on the map
}) {
  useEscClose(() => {
    // Esc unwinds the stack one level; at the landing view it closes.
    if (pane) setPane(null);
    else if (selFid) setSelFid(null);
    else onClose();
  });

  const [selFid, setSelFid] = useState(null);
  const [pane, setPane] = useState(null);  // "deal" | "tribute" | "peace" | "mediate" | "pact-call"
  const [confirm, setConfirm] = useState(null); // { verb, params, title, body }

  const selectedFaction = useMemo(() =>
    selFid ? dip?.factions.find((f) => f.id === selFid) : null,
  [dip, selFid]);

  // Highlight the open faction's locations on the map (whenever we're
  // looking at a faction's detail page).
  useEffect(() => {
    onHighlightFaction?.(selFid && !pane ? selFid : null);
    return () => onHighlightFaction?.(null);
  }, [selFid, pane, onHighlightFaction]);

  if (!dip) return null;

  const view = pane ? "pane" : selFid ? "detail" : "landing";

  // Destructive verbs route through a confirm modal.
  function confirmAndAct(verb, params) {
    const prompt = DESTRUCTIVE_PROMPT[verb];
    if (!prompt) {
      onAction(verb, params);
      return;
    }
    const meta = VERB_META[verb];
    setConfirm({
      verb,
      params,
      title: meta?.label || "Confirm",
      body: prompt,
    });
  }

  function runFromPane(verb, params) {
    onAction(verb, params);
    setPane(null);
  }

  // §5.3 — when the faction-detail view is showing a faction with an
  // active trading pact, paint the capital-to-capital dotted route line
  // on the map (green if clear, amber if suspended). Endpoints come from
  // FACTIONS.{capital} — the viewer's own capital is read from data.js.
  const tradeFor = selectedFaction?.tradingPact || null;
  const myCapital = UI_FACTIONS[dip.youId]?.capital || null;
  const theirCapital = selectedFaction?.capital || null;
  const showRoute = tradeFor && myCapital && theirCapital && view === "detail";

  return (
    <>
      {showRoute && (
        <TradingPactRouteLayer
          fromLocId={myCapital}
          toLocId={theirCapital}
          status={tradeFor.suspended ? "suspended" : "clear"}
        />
      )}
      <motion.div
        initial={{ x: 440, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 440, opacity: 0 }}
        transition={{ type: "tween", duration: 0.24, ease: [0.22, 0.94, 0.3, 1] }}
        className="hud-scratch"
        style={{
          position: "fixed",
          top: 0, right: 0, bottom: 44, // sit above the bottom tab dock
          width: 420,
          zIndex: 70,
          display: "flex", flexDirection: "column",
          background: "linear-gradient(168deg, rgba(18,31,32,0.96), rgba(8,15,16,0.97))",
          borderLeft: `1px solid ${C.holo}`,
          boxShadow: `inset 1px 0 0 rgba(86,211,198,0.18), -10px 0 30px rgba(0,0,0,0.55)`,
          color: "#cfd6dc",
        }}
      >
        {/* Top + bottom accent strips */}
        <div style={{
          position: "absolute", top: 0, left: 16, right: 16, height: 2,
          background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`,
          opacity: 0.6, pointerEvents: "none",
        }} />
        <CornerBrackets color={C.holo} len={12} inset={5} w={1.4} />

        {/* Last-action toast */}
        {lastResult?.msg && (
          <div style={{
            position: "absolute", left: 16, right: 16, top: 56,
            zIndex: 5,
            padding: "6px 10px",
            background: "rgba(8,16,17,0.92)",
            border: `1px solid ${lastResult.ok && lastResult.accepted !== false ? "#5fc27a" : "#d2913c"}88`,
            borderRadius: 4,
            color: lastResult.ok && lastResult.accepted !== false ? "#5fc27a" : "#d2913c",
            fontFamily: C.font, fontSize: 10.5, letterSpacing: 0.6,
            boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
          }}>{lastResult.msg}</div>
        )}

        {/* View switching */}
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              <LandingView
                dip={dip}
                onSelectFaction={setSelFid}
                onClose={onClose}
              />
            </motion.div>
          )}

          {view === "detail" && selectedFaction && (
            <motion.div
              key={`detail-${selFid}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              <FactionDetailView
                f={selectedFaction}
                dip={dip}
                onBack={() => setSelFid(null)}
                onClose={onClose}
                onVerb={(verb, params) => onAction(verb, params)}
                onOpenPane={(p) => setPane(p)}
                onConfirmAndAct={confirmAndAct}
              />
            </motion.div>
          )}

          {view === "pane" && selectedFaction && (
            <motion.div
              key={`pane-${pane}-${selFid}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              {pane === "deal" && (
                <DealPane
                  kind="custom"
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(deal) => runFromPane("propose-deal", {
                    faction: selectedFaction.id,
                    give: deal.give, get: deal.get,
                  })}
                />
              )}
              {pane === "tribute" && (
                <DealPane
                  kind="tribute"
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(deal) => runFromPane("demand-tribute", {
                    faction: selectedFaction.id,
                    give: [], get: deal.get,
                  })}
                />
              )}
              {pane === "peace" && (
                <DealPane
                  kind="peace"
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(deal) => runFromPane("sue-for-peace", {
                    faction: selectedFaction.id,
                    give: deal.give, get: deal.get,
                  })}
                />
              )}
              {pane === "mediate" && (
                <MediatePane
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(pair) => runFromPane("mediate", pair)}
                />
              )}
              {pane === "pact-call" && (
                <PactCallPane
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(p) => runFromPane("pact-call", p)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            onAction(c.verb, c.params);
          }}
        />
      )}
    </>
  );
}
