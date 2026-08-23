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

const A = import.meta.env.BASE_URL;
const LEADER_PORTRAIT = {
  versari:   `${A}assets/portraits/factions/versari/versari_leader_1.webp`,
  lakers:    `${A}assets/portraits/factions/lakers/laker_leader_1.webp`,
  goldgrass: `${A}assets/portraits/factions/goldgrass/goldgrass_leader_1.webp`,
  plainers:  `${A}assets/portraits/factions/plainers/plainer_leader_1.webp`,
};

// Draw a dotted route line between two location ids by
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
  // §5 — the overture. First in the list because it is now the only road to
  // an alliance for anybody, and a player who cannot find it cannot form a
  // pact at all.
  "court":                 { label: "Open a Courtship", body: "State what you want of them and work the relationship in the open. Costs political capacity every round it runs — and an alliance needs a courtship behind it." },
  "end-courtship":         { label: "Call It Off", body: "Stop courting them and free the capacity for somebody else.", destructive: true },
  "gift":                  { label: "Gift", body: "Spend political capacity to raise their regard for you. Diminishing returns if you lean on them too often.", isPane: "gift" },
  "propose-deal":          { label: "Custom Deal", body: "Scrap, streams, alliances, borders, non-aggression — build it and see what they say.", isPane: "deal" },
  "demand-tribute":        { label: "Demand Tribute", body: "Take, don't ask. Stains Honor if refused.", isPane: "tribute", destructive: true },
  "sue-for-peace":         { label: "Sue for Peace", body: "Offer terms alongside the peace promise.", isPane: "peace" },
  "propose-pact":          { label: "Propose Pact", body: "Mutual defence + Standing bonus on both sides." },
  "make-peace":            { label: "Ask for a Ceasefire", body: "Offer to end the war with nothing attached. They take it only if they want out." },
  "mediate":               { label: "Mediate", body: "Broker peace between two warring factions.", isPane: "mediate" },
  "pact-call":             { label: "Call to Pact", body: "Call your ally into one of your wars.", isPane: "pact-call" },
  "vassalize":             { label: "Vassalize", body: "Bind them under your banner.", destructive: true },
  "free-vassal":           { label: "Free Vassal", body: "Release them. Honor rises; tribute stops.", destructive: true },
  "denounce":              { label: "Denounce", body: "Name them publicly. Warranted, it pays; baseless, it costs — and the board can tell.", destructive: true },
  "issue-ultimatum":       { label: "Issue Ultimatum", body: "Name a demand and a deadline. Defiance makes your war just — backing down costs Honor.", isPane: "ultimatum", destructive: true },
  "declare-war":           { label: "Declare War", body: "Open hostilities. Menace rises immediately.", destructive: true },
  // §6 trade + passive toggles
  "trading-pact":          { label: "Open Trading Pact", body: "Any city of yours reaching any of theirs — per-round scrap each side + permanent Research floor." },
  "dissolve-trading-pact": { label: "Close Trading Pact", body: "Closes the trade route. Keeps the Research floor.", destructive: true },
  "set-open-borders":      { label: "Open Borders", body: "Let them transit your territory; they may grant the reverse." },
  "toggle-open-borders":   { label: "Toggle Open Borders", body: "Flip your half of the open-borders agreement on or off." },
  "toggle-allied-vision":  { label: "Toggle Allied Vision", body: "Share line-of-sight with the ally on or off." },
};

const DESTRUCTIVE_PROMPT = {
  "declare-war":            "Declare war? Standing collapses, and unless you have a grievance on record the declaration alone raises your Menace. Their allies may join in.",
  "issue-ultimatum":        "Put your name to a demand with a deadline? If they defy you and you then do nothing, the whole board sees you back down.",
  "denounce":               "Denounce publicly? The board judges the accusation, not the accused: with grounds it earns you Honor and allies, without them it marks you as the liar.",
  "vassalize":              "Take them under your banner? The cornered submit; a friendly minor may welcome a protector.",
  "free-vassal":            "Release this vassal? Your Honor rises, their tribute stops.",
  "end-courtship":          "Call off the courtship? The Standing you have been earning stops accruing, and drift starts pulling the relationship back toward its baseline.",
  "demand-tribute":         "Demand tribute? Refusal will damage your Honor and could trigger war.",
  "dissolve-trading-pact":  "Close the trading pact? The per-round scrap flow stops; the permanent Research floor stays.",
};

// Loose match — used to skip a verb's `outcome` tooltip when it's a
// near-paraphrase of the static body. Jaccard on long-enough word tokens;
// ≥0.55 overlap is the empirical threshold that catches "Opens a route
// between you — …" vs. "Route between you — …" without
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
          width: 340, maxWidth: "92vw", padding: 18,
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

// Where your Menace and Honor came from. Both were floats with no history:
// a player could watch the board turn on them with no way to learn which of
// their own acts had done it.
function Receipts({ receipts }) {
  const [open, setOpen] = useState(false);
  if (!receipts) return null;
  const rows = [
    ...receipts.menace.map((r) => ({ ...r, stat: "Menace", color: "#d2913c" })),
    ...receipts.honor.map((r) => ({ ...r, stat: "Honor", color: "#5fc27a" })),
  ].sort((a, b) => b.round - a.round);
  if (!rows.length) return null;
  return (
    <Card>
      <button
        className="hud-int"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: 0, cursor: "pointer", color: C.holoHi,
          fontFamily: C.font, fontSize: 10, fontWeight: 700,
          letterSpacing: 1.6, textTransform: "uppercase",
        }}
      >{open ? "▾" : "▸"} How you got here · {rows.length}</button>
      {open && (
        <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
          {rows.map((r, i) => (
            <div key={i} className="pc-prose" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
              <span style={{
                color: r.color, fontFamily: C.font, fontWeight: 700,
                fontSize: 10, letterSpacing: 0.8, marginRight: 6,
              }}>{r.stat}</span>
              <span style={{ color: r.delta > 0 ? "#e8b467" : "rgba(207,214,220,0.8)" }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// §6/§11 — political capacity, itemised, with a ledger.
//
// Scrap buys what a faction HAS; Sway buys what a faction THINKS, and nothing
// converts between them at any rate. That wall is the design: letting one
// fungible currency buy both production and political outcomes is the genre's
// most reliable way to make diplomacy feel bought, and it is the complaint
// Civ V's gold-for-city-states and Civ VI's Diplomatic Favor both earned.
//
// Itemised because the territorial term is otherwise invisible: dominance is a
// step function, so an extra point of Loyalty is worth zero hexes or twelve
// and nothing in between, and a player who cannot see the breakdown reads that
// as the game ignoring their investment.
function SwayCard({ sway }) {
  const [open, setOpen] = useState(false);
  if (!sway) return null;
  const p = sway.parts;
  const atCap = sway.pool >= sway.cap;
  const overspent = sway.net < 0;
  const row = (label, value, note) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5, lineHeight: 1.6 }}>
      <span style={{ color: "rgba(143,246,234,0.6)", minWidth: 96 }}>{label}</span>
      <span style={{ fontFamily: C.font, fontWeight: 700, color: C.holoHi, minWidth: 28, textAlign: "right" }}>
        {value >= 0 ? "+" : ""}{value}
      </span>
      {note && <span style={{ color: "rgba(207,214,220,0.6)", fontSize: 10.5 }}>{note}</span>}
    </div>
  );
  return (
    <Card accent={overspent ? "#d2453f" : atCap ? "#c9b24e" : C.holo}>
      <SectionLabel color={overspent ? "#ffb4ae" : C.holo}>Political Capacity</SectionLabel>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 4 }}>
        <div>
          <div style={{
            fontFamily: C.font, fontSize: 26, fontWeight: 700, lineHeight: 1,
            color: atCap ? "#c9b24e" : C.holoHi,
            textShadow: `0 0 10px ${atCap ? "#c9b24e" : C.holo}66`,
          }}>{sway.pool}<span style={{ fontSize: 13, color: C.textFaint }}>/{sway.cap}</span></div>
          <div style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.textFaint }}>
            Sway held
          </div>
        </div>
        <div>
          <div style={{ fontFamily: C.font, fontSize: 17, fontWeight: 700, lineHeight: 1, color: overspent ? "#d2453f" : "#5fc27a" }}>
            {sway.net >= 0 ? "+" : ""}{sway.net}
          </div>
          <div style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textFaint }}>
            net / round
          </div>
        </div>
      </div>
      {atCap && (
        <div style={{ fontFamily: C.font, fontSize: 9.5, letterSpacing: 0.5, color: "#c9b24e", marginTop: 6 }}>
          At the ceiling — income above this is being wasted. Sway is a flow, not a war chest.
        </div>
      )}
      {sway.courting.length > 0 && (
        <div className="pc-prose" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 7, color: "rgba(207,214,220,0.85)" }}>
          Courting <b style={{ color: C.holoHi }}>{sway.courting.map((c) => c.name).join(", ")}</b>
          {" "}— {sway.committed} Sway a round, every round it runs.
        </div>
      )}
      <button
        className="hud-int"
        onClick={() => setOpen((v) => !v)}
        style={{
          marginTop: 7, width: "100%", textAlign: "left", background: "none", border: "none",
          padding: 0, cursor: "pointer", color: C.holoHi,
          fontFamily: C.font, fontSize: 9, fontWeight: 700,
          letterSpacing: 1.6, textTransform: "uppercase",
        }}
      >{open ? "▾" : "▸"} Where it comes from</button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {row("Floor", p.floor, "every faction, every round — so nobody is locked out of politics")}
          {row("Territory", p.territory,
            `${p.hexes} hex${p.hexes === 1 ? "" : "es"} dominated${p.hexes > p.hexCap ? `, counted to ${p.hexCap}` : ""}`)}
          {row("Agreements", p.agreements,
            `${p.agreementCount} pact${p.agreementCount === 1 ? "" : "s"}, trade route${p.agreementCount === 1 ? "" : "s"} and vassal${p.agreementCount === 1 ? "" : "s"} — diplomacy funds diplomacy`)}
          {p.chips > 0 && row("Buildings", p.chips, null)}
          <div style={{ height: 1, background: "rgba(86,211,198,0.18)", margin: "4px 0" }} />
          {row("Income", sway.income, null)}
          {row("Courtships", -sway.committed, `${sway.costs.courtUpkeep} each, per round`)}
          <div style={{
            fontFamily: C.font, fontSize: 9.5, letterSpacing: 0.4, lineHeight: 1.5,
            color: "rgba(143,246,234,0.55)", marginTop: 6,
          }}>
            Scrap buys what a faction has. Sway buys what a faction thinks.
            Nothing converts between them — not at any rate, in either direction.
          </div>
        </div>
      )}
    </Card>
  );
}

// §12.1 — the Standing receipt. Standing is the ONE number the win condition
// reads, and it was the only reputation measure with no receipt at all: a
// player could watch a faction cool on them with no way to tell which of their
// own acts did it.
//
// Causes only, ordered, unsigned. The magnitudes are deliberately withheld
// (§12.2): rendering signed deltas the way "How you got here" does for Menace
// and Honor would hand the player a derivable running total for the value the
// Spy Ring is supposed to sell. Which WAY it moved is free — a player must be
// able to tell a grievance from a courtesy without buying espionage.
// §6.3 — a gift, priced in political capacity. The old pane was the deal
// builder set to "scrap, one way", which is what a gift USED to be: scrap
// moving and Standing following. Scrap still moves goods — that is a deal with
// nothing asked in return — but it no longer moves opinions, so this pane asks
// the only question left: how much warmth, at the published rate.
function GiftPane({ f, dip, onBack, onSubmit }) {
  const sway = dip.sway || { pool: 0, costs: { perStanding: 8 } };
  const rate = sway.costs.perStanding;
  const affordable = Math.max(0, Math.floor(sway.pool / rate));
  const [want, setWant] = useState(() => Math.min(2, Math.max(1, affordable)));
  const cost = want * rate;
  const canSend = affordable >= 1 && cost <= sway.pool;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Send Word to {f.name}</SectionLabel>
      <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5, color: C.textDim }}>
        Envoys, favours, a hearing at the right table. Costs{" "}
        <b style={{ color: C.holoHi }}>{rate} Sway</b> per point of their regard —
        political capacity, not scrap. Lean on them too often and each gift
        buys less than the last.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="hud-int" onClick={() => setWant((v) => Math.max(1, v - 1))}
          style={{ ...paneBtn, opacity: want > 1 ? 1 : 0.4 }}>−</button>
        <div style={{ minWidth: 120, textAlign: "center" }}>
          <div style={{ fontFamily: C.font, fontSize: 22, fontWeight: 700, color: C.holoHi, lineHeight: 1 }}>
            +{want}
          </div>
          <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.textFaint }}>
            regard
          </div>
        </div>
        <button className="hud-int" onClick={() => setWant((v) => Math.min(Math.max(1, affordable), v + 1))}
          style={{ ...paneBtn, opacity: want < affordable ? 1 : 0.4 }}>+</button>
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontFamily: C.font, fontSize: 13, fontWeight: 700, color: cost > sway.pool ? "#d2453f" : C.holoHi }}>
            {cost} Sway
          </div>
          <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 0.8, color: C.textFaint }}>
            of {sway.pool} held
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="hud-int" onClick={onBack} style={{ ...paneBtn, flex: 1 }}>Back</button>
        <button className="hud-int" disabled={!canSend}
          onClick={canSend ? () => onSubmit(want) : undefined}
          style={{
            ...paneBtn, flex: 2,
            color: "#08100f",
            background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
            opacity: canSend ? 1 : 0.4,
            cursor: canSend ? "pointer" : "not-allowed",
          }}>Send</button>
      </div>
      {!canSend && (
        <div style={{ fontFamily: C.font, fontSize: 9.5, letterSpacing: 0.5, color: "#d2913c" }}>
          Not enough Sway. It comes from the floor every faction gets, the ground
          you dominate, and the agreements you already hold — not from your purse.
        </div>
      )}
    </div>
  );
}

const paneBtn = {
  fontFamily: C.font, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
  textTransform: "uppercase", padding: "7px 14px", borderRadius: 5,
  border: `1px solid ${C.holo}88`, background: "rgba(6,14,15,0.85)",
  color: C.holoHi, cursor: "pointer",
};

function StandingReceipt({ rows, name }) {
  const [open, setOpen] = useState(false);
  if (!rows || !rows.length) return null;
  const hasNumbers = rows.some((r) => r.delta != null);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        className="hud-int"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: 0, cursor: "pointer", color: C.holoHi,
          fontFamily: C.font, fontSize: 9, fontWeight: 700,
          letterSpacing: 1.6, textTransform: "uppercase",
        }}
      >{open ? "▾" : "▸"} Why they stand there · {rows.length}</button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {rows.map((r, i) => (
            <div key={i} className="pc-prose" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
              <span style={{
                fontFamily: C.font, fontWeight: 700, fontSize: 9, letterSpacing: 0.8,
                marginRight: 6, color: r.direction === "warmed" ? "#5fc27a" : "#d2913c",
              }}>{r.direction === "warmed" ? "WARMED" : "COOLED"}</span>
              <span style={{ color: "rgba(207,214,220,0.85)" }}>
                {r.text} · round {r.round}
              </span>
              {r.delta != null && (
                <span style={{ color: "#8fd8ce", marginLeft: 6, fontFamily: C.font, fontSize: 10 }}>
                  {r.delta > 0 ? "+" : ""}{r.delta} → {r.value}
                </span>
              )}
            </div>
          ))}
          {!hasNumbers && (
            <div style={{
              fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase",
              color: "rgba(210,145,60,0.8)", marginTop: 4,
            }}>By how much: Espionage required · Intelligence B1 Spy Ring</div>
          )}
        </div>
      )}
    </div>
  );
}

// A demand with a deadline. Complying costs you the thing; defying costs you
// nothing yet, and hands them the right to take it.
function UltimatumCard({ u, dip, onAction }) {
  const f = dip.factions.find((x) => x.id === u.from);
  return (
    <Card accent="#d2453f">
      <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 7 }}>
        <b style={{ color: f?.color || "#d2453f" }}>{u.fromName}</b> demands{" "}
        <b style={{ color: C.holoHi }}>{u.demandText}</b>
        {u.defied ? " — and you have refused." : "."}
      </div>
      {!u.defied && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="hud-int"
            disabled={!u.canComply}
            onClick={() => onAction("answer-ultimatum", { ultimatumId: u.id, comply: true })}
            style={{
              flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase", color: "#f4efe2",
              padding: "6px 8px", borderRadius: 4, border: "1px solid rgba(86,211,198,0.35)",
              background: "rgba(86,211,198,0.06)",
              cursor: u.canComply ? "pointer" : "not-allowed", opacity: u.canComply ? 1 : 0.45,
            }}
          >{u.canComply ? "Give in" : (u.kind === "tribute" ? "Can't afford" : "Units still there")}</button>
          <button
            className="hud-int"
            onClick={() => onAction("answer-ultimatum", { ultimatumId: u.id, comply: false })}
            title={u.ifDefy}
            style={{
              flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase", color: "#fff",
              padding: "6px 8px", borderRadius: 4, border: "1px solid #6e1f12",
              background: "linear-gradient(180deg, #d8553f, #a5331f)", cursor: "pointer",
            }}
          >Let it stand</button>
        </div>
      )}
      <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 0.5, color: "rgba(255,180,174,0.75)", marginTop: 6 }}>
        {u.defied
          ? "They may now take it by force, righteously."
          : `${u.roundsLeft} round${u.roundsLeft === 1 ? "" : "s"} left. ${u.ifDefy}`}
      </div>
    </Card>
  );
}

// One offer awaiting an answer. Deliberately plain: two term lists and two
// buttons. The interesting part is that it EXISTS — before this, a proposal
// resolved the instant it was made and there was no state in which anything
// was pending.
function OfferCard({ offer: o, dip, onAction }) {
  const f = dip.factions.find((x) => x.id === o.from);
  const accent = o.isCounter ? "#c9b24e" : (f?.color || C.holoHi);
  const Terms = ({ label, items, empty }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionLabel>{label}</SectionLabel>
      <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
        {items.length ? items.join(" · ") : <span style={{ opacity: 0.55 }}>{empty}</span>}
      </div>
    </div>
  );
  return (
    <Card accent={accent}>
      {/* Phrased around the faction name rather than after it: half the
          names are plural ("Free Plainers"), half singular ("Clan Tempest"),
          and no verb agrees with both. */}
      <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
        {o.isCounter ? "Counter-terms from " : "An offer from "}
        <b style={{ color: f?.color || C.holoHi }}>{o.fromName}</b>.
        {o.note && <span style={{ opacity: 0.75 }}> {o.note}</span>}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <Terms label="You get" items={o.youGet} empty="nothing" />
        <Terms label="You give" items={o.youGive} empty="nothing" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="hud-int"
          disabled={!o.affordable}
          onClick={() => onAction("answer-offer", { offerId: o.id, accept: true })}
          style={{
            flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase", color: "#08100f",
            padding: "6px 8px", borderRadius: 4, border: "1px solid #5fc27a",
            background: "linear-gradient(180deg, #7bd496, #4faf6e)",
            cursor: o.affordable ? "pointer" : "not-allowed", opacity: o.affordable ? 1 : 0.45,
          }}
        >{o.affordable ? "Accept" : "Can't afford"}</button>
        <button
          className="hud-int"
          onClick={() => onAction("answer-offer", { offerId: o.id, accept: false })}
          style={{
            flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase", color: "#f4efe2",
            padding: "6px 8px", borderRadius: 4, border: "1px solid rgba(86,211,198,0.35)",
            background: "rgba(86,211,198,0.06)", cursor: "pointer",
          }}
        >Decline</button>
      </div>
      <div style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.4, color: "rgba(143,246,234,0.5)", marginTop: 6 }}>
        {o.roundsLeft > 0
          ? `Lapses in ${o.roundsLeft} round${o.roundsLeft === 1 ? "" : "s"} — letting it lapse costs nothing.`
          : "Lapses at the end of this round."}
      </div>
    </Card>
  );
}

function LandingView({ dip, onSelectFaction, onAction, onClose }) {
  const dom = dip.dominion;
  const inbox = dip.pendingCalls || [];
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
        {/* §13.4 — the win condition is the most-read thing on this screen,
            so it is the first card. It used to sit third, under two blocks of
            reputation numbers that decide nothing on their own. */}
        <PathToDominionCard dom={dom} />

        {/* Reputation block — your aggregate scores. */}
        <Card>
          <SectionLabel>Your Standing on the Continent</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <RepStat label="Menace" value={dip.menace.toFixed(1)} color="#d2913c" sub="aggression weight" />
            <RepStat label="Honor" value={dip.honor.toFixed(1)} color="#5fc27a" sub="kept your word" />
            <RepStat label="Threat" value={dip.threat.toFixed(1)} color={dip.threat > 6 ? "#d2453f" : C.holoHi} sub="coalition risk" />
            <RepStat
              label="Dominion"
              value={`${dom.score}/${dom.threshold}`}
              color={dom.met ? "#5fc27a" : "#c9b24e"}
              sub={dom.roundsLeft != null
                ? `${dom.roundsLeft} to victory`
                : `${dom.outstanding?.length || 0} still to deal with`}
            />
          </div>
        </Card>

        <SwayCard sway={dip.sway} />

        <Receipts receipts={dip.receipts} />

        {dip.coalitionAgainstYou && (
          <Card accent="#d2453f">
            <SectionLabel color="#ffb4ae">Coalition against you</SectionLabel>
            <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {dip.coalitionAgainstYou.join(", ")} have aligned against your rise. Their walls are higher; your reach is shorter.
            </div>
          </Card>
        )}

        {/* §6.10 — offers on the table. Either a faction opened a
            conversation with you, or one came back with terms of its own
            after refusing yours. Sits above Calls to Arms because an offer
            expires quietly and a call does not. */}
        {(dip.offers || []).length > 0 && (
          <>
            <SectionLabel color={C.holoHi}>On the Table</SectionLabel>
            {dip.offers.map((o) => (
              <OfferCard key={o.id} offer={o} dip={dip} onAction={onAction} />
            ))}
          </>
        )}

        {/* §6.11 — threats standing over you, and your own clock running. */}
        {(dip.ultimatums || []).length > 0 && (
          <>
            <SectionLabel color="#d2453f">Or Else</SectionLabel>
            {dip.ultimatums.map((u) => (
              <UltimatumCard key={u.id} u={u} dip={dip} onAction={onAction} />
            ))}
          </>
        )}
        {(dip.ultimatumsIssued || []).length > 0 && (
          <>
            <SectionLabel color="#c9b24e">Your Word</SectionLabel>
            {dip.ultimatumsIssued.map((u) => (
              <Card key={u.id} accent="#c9b24e">
                <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  You have demanded <b style={{ color: C.holoHi }}>{u.demandText}</b> of{" "}
                  <b>{u.toName}</b>.
                </div>
                <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 0.5, color: u.defied ? "#ffb4ae" : "rgba(143,246,234,0.6)", marginTop: 5 }}>
                  {u.defied
                    ? `THEY REFUSED. ${u.roundsLeft} round${u.roundsLeft === 1 ? "" : "s"} to make good on it, or the board watches you back down.`
                    : `${u.roundsLeft} round${u.roundsLeft === 1 ? "" : "s"} to answer.`}
                </div>
              </Card>
            ))}
          </>
        )}

        {/* §1.8 — pact-call inbox: allies calling you into their wars. */}
        {inbox.length > 0 && (
          <>
            <SectionLabel color="#c9b24e">Calls to Arms</SectionLabel>
            {inbox.map((c) => (
              <Card key={c.id} accent="#c9b24e">
                <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                  <b style={{ color: C.holoHi }}>{c.fromName}</b> calls you to war against{" "}
                  <b style={{ color: "#d2453f" }}>{c.targetName}</b>.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="hud-int"
                    onClick={() => onAction("respond-pact-call", { callId: c.id, accept: true })}
                    title={c.ifAccept}
                    style={{
                      flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
                      letterSpacing: 1, textTransform: "uppercase", color: "#08100f",
                      padding: "6px 8px", borderRadius: 4, border: `1px solid #5fc27a`,
                      background: "linear-gradient(180deg, #7bd496, #4faf6e)", cursor: "pointer",
                    }}
                  >Answer ({c.ifAccept})</button>
                  <button
                    className="hud-int"
                    onClick={() => onAction("respond-pact-call", { callId: c.id, accept: false })}
                    title={c.ifRefuse}
                    style={{
                      flex: 1, fontFamily: C.font, fontSize: 10, fontWeight: 700,
                      letterSpacing: 1, textTransform: "uppercase", color: "#fff",
                      padding: "6px 8px", borderRadius: 4, border: `1px solid #6e1f12`,
                      background: "linear-gradient(180deg, #d8553f, #a5331f)", cursor: "pointer",
                    }}
                  >Refuse</button>
                </div>
                <div style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.4, color: "rgba(143,246,234,0.5)", marginTop: 6 }}>
                  Refusing: {c.ifRefuse}
                </div>
              </Card>
            ))}
          </>
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

// Path to Recognition — one row per faction with a coarse backing status
// (public), and the exact gate numbers when the Spy Ring is researched.
const BACKING_COLOR = {
  backs: "#5fc27a", warming: "#c9b24e", cold: "rgba(143,246,234,0.45)",
  blocked: "#d2913c", coalition: "#d2453f",
};
// "BACKS YOU" was the language of a Recognition score somebody could lend you
// weight toward. The question now is simply whether this faction is dealt
// with — allied, sworn, or gone.
const BACKING_LABEL = {
  backs: "DEALT WITH", warming: "WARMING", cold: "OUTSTANDING",
  blocked: "DISTRUSTS", coalition: "COALITION",
};
function PathToDominionCard({ dom }) {
  const backing = dom.backing || [];
  if (!backing.length) return null;
  const hasSpy = backing.some((b) => b.detail);
  return (
    <Card>
      <SectionLabel>Path to Dominion</SectionLabel>
      <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(143,246,234,0.6)", marginBottom: 8 }}>
        You win when every faction still standing is your ally, your vassal, or
        gone — by conquest, by diplomacy, or any mix of the two. Then hold it
        for <b style={{ color: C.holoHi }}>{dom.holdRounds}</b> rounds.
        {" "}<b style={{ color: dom.met ? "#5fc27a" : C.holoHi }}>{dom.score}</b> of{" "}
        <b style={{ color: C.holoHi }}>{dom.threshold}</b> dealt with.
      </div>
      {dom.roundsLeft != null && (
        <div style={{
          fontFamily: C.font, fontSize: 11, letterSpacing: 1, marginBottom: 8,
          padding: "6px 8px", borderRadius: 5,
          color: "#08100f", fontWeight: 700,
          background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
        }}>
          {dom.roundsLeft > 0
            ? `Hold it — ${dom.roundsLeft} round${dom.roundsLeft === 1 ? "" : "s"} to victory`
            : "The board is yours"}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {backing.map((b) => (
          <div key={b.id} style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "6px 8px", borderRadius: 5,
            background: "rgba(0,0,0,0.22)",
            border: `1px solid ${BACKING_COLOR[b.status]}44`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: C.font, fontSize: 11.5, fontWeight: 700, flex: 1, color: "#f4efe2" }}>
                {b.name}
              </span>
              <span style={{
                fontFamily: C.font, fontSize: 8.5, fontWeight: 700, letterSpacing: 1,
                color: BACKING_COLOR[b.status],
              }}>{BACKING_LABEL[b.status]}</span>
            </div>
            <div style={{ fontFamily: C.font, fontSize: 9.5, letterSpacing: 0.3, color: "rgba(143,246,234,0.55)", lineHeight: 1.4 }}>
              {b.hint}
            </div>
            {b.detail && (
              <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 0.4, color: "#8fd8ce", lineHeight: 1.5 }}>
                Their regard {b.detail.standing >= 0 ? "+" : ""}{b.detail.standing} (Allied at +{b.detail.needStanding})
                {" · "}your Menace {b.detail.yourMenace} vs tolerance {b.detail.theirTolerance}
                {" · "}your Honor {b.detail.yourHonor} vs floor {b.detail.theirFloor}
              </div>
            )}
          </div>
        ))}
      </div>
      {!hasSpy && (
        <div style={{
          fontFamily: C.font, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase",
          color: "rgba(210,145,60,0.8)", marginTop: 8,
        }}>Exact figures: Espionage required · Intelligence B1 Spy Ring</div>
      )}
    </Card>
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
  // A destroyed faction keeps its row — what passed between you is still
  // worth reading — but every live reading on it is stale. Its last Standing
  // rendered as "NEUTRAL · tolerates you with caution", which invited the
  // player to court a faction that no longer has a unit or a town.
  const tierColor = f.eliminated ? C.textFaint : (TIER_COLOR[f.standingTier] || "#f4efe2");
  const rel = f.eliminated ? "DESTROYED"
    : f.lordOfYou ? "YOUR LORD"
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
        {f.vp != null && (
          <span title="Victory Points" style={{
            fontFamily: C.font, fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
            color: "#e8c95a", border: "1px solid rgba(232,201,90,0.45)",
            borderRadius: 4, padding: "1px 7px", background: "rgba(232,201,90,0.08)",
            flexShrink: 0,
          }}>★ {f.vp}</span>
        )}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 5,
        fontFamily: C.font, fontSize: 10, letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        <span style={{ color: tierColor, fontWeight: 700 }}>
          {f.eliminated ? "GONE" : (TIER_LABEL[f.standingTier] || f.standingTier)}
        </span>
        {rel && (
          <span style={{
            color: f.eliminated ? C.textFaint
              : f.atWar || f.inCoalition ? "#d2453f" : "#5fc27a",
            fontWeight: 800, letterSpacing: 1.4,
          }}>{rel}</span>
        )}
      </div>
      {/* §13.4 — POSTURE AND CONDITION, next to the tier word. This one line
          is the legibility fix the whole brief turns on: "Courting — wants you
          clear of Omara" tells a player what the tier word never could, and it
          is the difference between an AI whose behaviour you can reconstruct
          and one that reads as arbitrary. The posture and the condition are
          public; how close you are to the threshold behind them is not. */}
      {!f.eliminated && f.posture && f.posture.kind !== "Watching" && f.posture.kind !== "Indifferent" && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: C.font, fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4,
            textTransform: "uppercase", color: POSTURE_COLOR[f.posture.kind] || C.holoHi,
          }}>{f.posture.kind}</span>
          {f.posture.condition && (
            <span className="pc-prose" style={{
              fontSize: 11.5, lineHeight: 1.4, color: "rgba(207,214,220,0.9)", fontStyle: "italic",
            }}>“{f.posture.condition}”</span>
          )}
          {!f.posture.stated && (
            <span title="They have not said this out loud yet — and a faction does not act on a posture it has not stated."
              style={{ fontFamily: C.font, fontSize: 8.5, letterSpacing: 1, color: C.textFaint }}>
              UNSPOKEN
            </span>
          )}
        </div>
      )}
      {!f.eliminated && f.posture?.youAreCourting && (
        <div style={{
          fontFamily: C.font, fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase",
          color: "#5fc27a", marginTop: 3,
        }}>You are courting them · round {f.posture.yourCourtRounds}</div>
      )}
      <div className="pc-prose" style={{
        fontSize: 11.5, color: "rgba(207,214,220,0.86)", marginTop: 5, lineHeight: 1.4,
      }}>{f.eliminated ? "Driven from the board. Nothing left to deal with."
          : f.sentenceShort}</div>
    </button>
  );
}

// Posture reads as a stance, so it takes the temperature of one: a courtship
// is warm, a warning is not, and a commitment is simply a fact.
const POSTURE_COLOR = {
  Courting: "#5fc27a",
  Warning: "#d2913c",
  Committed: "#8fd8ce",
  Watching: "#a89d87",
  Indifferent: "#6b6355",
};

// =======================================================================
// Faction Detail view — §3.3
// =======================================================================

// Leader-transmission viewscreen — a landscape "video feed" with bezel,
// corner brackets, scanlines, and broadcast-HUD strips. Replays the
// encounter modal's image-frame chrome so the diplomacy detail view
// reads as a recorded transmission rather than a flat info panel. Falls
// back to a NO-SIGNAL pattern when there is no portrait for the faction
// (minor factions etc).
function LeaderTransmission({ f, tierColor }) {
  const portrait = LEADER_PORTRAIT[f.id];
  return (
    <div style={{
      position: "relative",
      width: "100%",
      padding: 6,
      borderRadius: 7,
      background: "linear-gradient(160deg, rgba(28,46,48,0.86) 0%, rgba(10,20,22,0.92) 100%)",
      border: `1px solid ${C.holo}cc`,
      boxShadow: `
        0 0 18px rgba(86,211,198,0.22),
        inset 0 1px 0 rgba(143,246,234,0.18),
        inset 0 -1px 0 rgba(0,0,0,0.55),
        inset 0 0 14px rgba(86,211,198,0.06)
      `,
    }}>
      <CornerBrackets color={C.holoHi} len={11} inset={3} w={1.4} />
      <div style={{
        position: "relative",
        width: "100%",
        height: 168,
        background: "linear-gradient(170deg, rgba(8,16,17,0.97), rgba(3,7,8,0.99))",
        border: `1px solid rgba(86,211,198,0.55)`,
        borderRadius: 3,
        boxShadow: `
          inset 0 0 22px rgba(0,0,0,0.85),
          inset 0 2px 4px rgba(0,0,0,0.7),
          inset 0 0 8px rgba(86,211,198,0.16)
        `,
        overflow: "hidden",
      }}>
        {portrait ? (
          <img src={portrait} alt={f.name} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 22%",
            filter: "brightness(0.92) saturate(0.95)",
          }} />
        ) : (
          <>
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: `linear-gradient(rgba(86,211,198,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(86,211,198,0.06) 1px, transparent 1px)`,
              backgroundSize: "20px 20px", pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8, pointerEvents: "none",
            }}>
              <motion.svg
                width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke={C.holoHi} strokeWidth="1"
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4.5" />
                <path d="M2 12h4M18 12h4M12 2v4M12 18v4" strokeLinecap="round" />
              </motion.svg>
              <span style={{
                fontFamily: C.font, fontSize: 9, letterSpacing: 2.8,
                textTransform: "uppercase", color: "rgba(143,246,234,0.42)",
              }}>No Visual</span>
            </div>
          </>
        )}
        <div className="hud-scanlines" style={{ position: "absolute", inset: 0 }} />

        {/* Top broadcast strip */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 17,
          background: "linear-gradient(180deg, rgba(86,211,198,0.16), transparent)",
          borderBottom: "1px solid rgba(86,211,198,0.22)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 8px",
          fontFamily: C.font, fontSize: 8, letterSpacing: 1.6,
          textTransform: "uppercase", color: "rgba(143,246,234,0.78)",
          pointerEvents: "none",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: f.color, fontWeight: 700, textShadow: `0 0 5px ${f.color}` }}>◆</span>
            Transmission · {f.short || f.name}
          </span>
          <span style={{ color: "rgba(143,246,234,0.55)" }}>Ch. {String(((f.id || "").length * 7) % 64).padStart(2, "0")}</span>
        </div>

        {/* Bottom broadcast strip */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 18,
          background: "linear-gradient(0deg, rgba(0,0,0,0.55), transparent)",
          borderTop: "1px solid rgba(86,211,198,0.22)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 8px",
          fontFamily: C.font, fontSize: 8, letterSpacing: 1.6,
          textTransform: "uppercase", color: "rgba(143,246,234,0.78)",
          pointerEvents: "none",
        }}>
          <span style={{ color: tierColor, fontWeight: 700, textShadow: `0 0 5px ${tierColor}aa` }}>
            ◢ {TIER_LABEL[f.standingTier] || f.standingTier}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                background: "#e0654a", boxShadow: "0 0 5px #e0654a",
              }}
            />
            Live
          </span>
        </div>
      </div>
    </div>
  );
}

// Small holo pill — used as a tag row below the leader transmission to
// surface relationship state at a glance (Pacted, At War, Vassal, etc).
function StatusPill({ color, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99,
      border: `1px solid ${color}99`,
      background: `${color}18`,
      boxShadow: `0 0 6px ${color}33`,
      fontFamily: C.font, fontSize: 8.5, fontWeight: 700,
      letterSpacing: 1.4, textTransform: "uppercase",
      color, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function StatusRow({ f, tierColor }) {
  const pills = [];
  pills.push({ color: tierColor, label: TIER_LABEL[f.standingTier] || f.standingTier });
  if (f.vp != null) pills.push({ color: "#e8c95a", label: `★ ${f.vp} VP` });
  if (f.temperament) pills.push({ color: C.holo, label: f.temperament });
  if (f.atWar)        pills.push({ color: "#d2453f", label: "◤ At War" });
  if (f.pacted)       pills.push({ color: "#5fc27a", label: "◆ Pacted" });
  if (f.vassalOfYou)  pills.push({ color: C.gold,    label: "◇ Your Vassal" });
  if (f.lordOfYou)    pills.push({ color: C.gold,    label: "◆ Sworn To" });
  if (f.inCoalition)  pills.push({ color: "#d2453f", label: "⚠ Coalition" });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {pills.map((p, i) => <StatusPill key={i} color={p.color}>{p.label}</StatusPill>)}
    </div>
  );
}

// A thin gradient rule with an inline numeric marker — used to separate
// sections in the scrolling detail body without piling Cards on Cards.
function SectionRule({ index, label, color = C.holo }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      margin: "2px 0 -2px",
    }}>
      <span style={{
        fontFamily: C.font, fontSize: 8.5, fontWeight: 700,
        letterSpacing: 2, color, opacity: 0.85,
        textShadow: `0 0 6px ${color}66`,
      }}>{String(index).padStart(2, "0")}</span>
      <span style={{
        fontFamily: C.font, fontSize: 9, fontWeight: 700,
        letterSpacing: 2.4, textTransform: "uppercase", color,
        opacity: 0.9,
      }}>▸ {label}</span>
      <span style={{
        flex: 1, height: 1,
        background: `linear-gradient(90deg, ${color}99, ${color}10 80%, transparent)`,
        opacity: 0.75,
      }} />
    </div>
  );
}

// Intel Brief — qualitative read of the relationship dressed up as an
// intelligence dispatch. The player never sees raw Menace/Honor numbers
// or the words "tolerance" / "floor"; the underlying engine truth is
// folded into the prose from `sentenceLong` plus a couple of extra
// "field reads" we synthesize from the gate flags.
function IntelBrief({ f, tierColor }) {
  const extras = [];
  if (f.menaceBeyondTolerance) {
    extras.push("Your war record has crossed what they can stomach — overtures will fall on closed ears until you ease off.");
  } else if (f.menaceMarker > 0.7) {
    extras.push("Their watchers flag your campaigns; another move and they may pull back from the table.");
  }
  if (f.honorBelowFloor) {
    extras.push("Their councils name you oath-breaker; no pact or deal of weight will hold your name on it.");
  } else if (f.honorMarker < 0.4) {
    extras.push("There are murmurings about whether your word is worth the breath it takes.");
  }
  return (
    <div style={{
      position: "relative",
      padding: 7,
      borderRadius: 7,
      background: "linear-gradient(160deg, rgba(28,46,48,0.8), rgba(10,20,22,0.88))",
      border: `1px solid ${C.holo}aa`,
      borderLeft: `3px solid ${tierColor}`,
      boxShadow: `
        inset 0 1px 0 rgba(143,246,234,0.15),
        inset 0 -1px 0 rgba(0,0,0,0.5),
        inset 0 0 12px rgba(86,211,198,0.05),
        0 0 12px rgba(86,211,198,0.15)
      `,
    }}>
      <CornerBrackets color={C.holoHi} len={8} inset={3} w={1.2} />
      {/* recessed inner panel — the "screen" where the text lives */}
      <div style={{
        position: "relative",
        padding: "11px 12px 12px",
        borderRadius: 3,
        background: "linear-gradient(172deg, rgba(8,16,17,0.96), rgba(3,7,8,0.99))",
        border: `1px solid rgba(86,211,198,0.45)`,
        boxShadow: `
          inset 0 0 20px rgba(0,0,0,0.75),
          inset 0 0 8px rgba(86,211,198,0.10)
        `,
        overflow: "hidden",
      }}>
        {/* faint grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(86,211,198,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(86,211,198,0.04) 1px, transparent 1px)`,
          backgroundSize: "18px 18px", pointerEvents: "none",
        }} />
        <div className="hud-scanlines" style={{ position: "absolute", inset: 0 }} />

        <div style={{
          position: "relative",
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: "1px dashed rgba(86,211,198,0.22)",
        }}>
          <span style={{
            fontFamily: C.font, fontSize: 9, fontWeight: 700,
            letterSpacing: 2.4, textTransform: "uppercase",
            color: C.holoHi, textShadow: `0 0 6px ${C.holo}66`,
          }}>▸ Intel Brief</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: C.font, fontSize: 8, fontWeight: 600,
            letterSpacing: 1.8, textTransform: "uppercase",
            color: "rgba(143,246,234,0.55)",
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: tierColor, boxShadow: `0 0 5px ${tierColor}`,
            }} />
            Field Report
          </span>
        </div>
        <div className="pc-prose" style={{
          position: "relative",
          fontSize: 12.5, lineHeight: 1.55, color: "#dbe8e3",
          fontStyle: "italic",
          textShadow: "0 0 8px rgba(86,211,198,0.18)",
        }}>
          {f.sentenceLong}
          {extras.length > 0 && (
            <>
              {" "}{extras.join(" ")}
            </>
          )}
        </div>
        <StandingReceipt rows={f.standingReceipt} name={f.name} />
      </div>
    </div>
  );
}

// Verb → category lookup. Keeps the actions panel from being a flat
// wall of buttons.
const VERB_CATEGORY = {
  // Diplomacy — overtures, custom deals, mediation.
  "court":                 "diplomacy",
  "end-courtship":         "diplomacy",
  "gift":                  "diplomacy",
  "propose-deal":          "diplomacy",
  "propose-pact":          "diplomacy",
  "mediate":               "diplomacy",
  // Trade & borders — passive economic / movement agreements.
  "trading-pact":          "trade",
  "dissolve-trading-pact": "trade",
  "set-open-borders":      "trade",
  "toggle-open-borders":   "trade",
  "toggle-allied-vision":  "trade",
  // War & peace — opening, ending, calling allies into wars.
  "declare-war":           "war",
  "make-peace":            "war",
  "sue-for-peace":         "war",
  "pact-call":             "war",
  // Coercion — destructive Standing/Honor moves.
  "demand-tribute":        "coercion",
  "denounce":              "coercion",
  "vassalize":             "coercion",
  "free-vassal":           "coercion",
};

const CATEGORY_META = [
  { key: "diplomacy", label: "Diplomacy",     accent: C.holo,      defaultOpen: true },
  { key: "trade",     label: "Trade & Borders", accent: C.gold,    defaultOpen: true },
  { key: "war",       label: "War & Peace",   accent: "#d2453f",   defaultOpen: true },
  { key: "coercion",  label: "Coercion",      accent: "#d2453f",   defaultOpen: false },
];

function ActionGroups({ f, onVerb, onOpenPane, onConfirmAndAct }) {
  // Strip the redundant open-borders verb: when borders are already open
  // from your side, only show the toggle (which we'll relabel "Close").
  // When they're closed, only show the "Open" variant. This prevents the
  // duplicate "Open Borders" + "Toggle Open Borders" button pair.
  const verbs = (f.verbs || []).filter((v) => {
    if (v.verb === "set-open-borders" && f.openBordersFromYou) return false;
    if (v.verb === "toggle-open-borders" && !f.openBordersFromYou) return false;
    return true;
  });

  function dispatch(verb, meta) {
    if (meta.isPane) onOpenPane(meta.isPane);
    else if (meta.destructive) onConfirmAndAct(verb, { faction: f.id });
    else if (verb === "set-open-borders") onVerb(verb, { faction: f.id, on: true });
    else if (verb === "toggle-open-borders") onVerb(verb, { faction: f.id, on: !f.openBordersFromYou });
    else if (verb === "toggle-allied-vision") onVerb(verb, { faction: f.id, on: true });
    else onVerb(verb, { faction: f.id });
  }

  // Override the displayed label/body for context-dependent verbs so the
  // button text matches what it'll actually do right now.
  function metaFor(verb) {
    const base = VERB_META[verb];
    if (!base) return null;
    if (verb === "toggle-open-borders") {
      return { ...base, label: "Close Borders", body: "Close your half of the open-borders agreement." };
    }
    return base;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {CATEGORY_META.map((cat) => {
        const groupVerbs = verbs.filter((v) => VERB_CATEGORY[v.verb] === cat.key);
        if (groupVerbs.length === 0) return null;
        return (
          <ActionGroup key={cat.key} label={cat.label} accent={cat.accent} defaultOpen={cat.defaultOpen}>
            {groupVerbs.map((v) => {
              const meta = metaFor(v.verb);
              if (!meta) return null;
              return (
                <VerbButton
                  key={v.verb}
                  verbMeta={meta}
                  gate={v}
                  onClick={() => dispatch(v.verb, meta)}
                />
              );
            })}
          </ActionGroup>
        );
      })}
    </div>
  );
}

// A collapsible subsection inside the Actions block. The header is
// styled as a holo tab — clipped left edge in the accent colour, a
// trailing gradient rule, and a small chevron that rotates when open.
function ActionGroup({ label, accent, defaultOpen, count, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const childCount = Array.isArray(children) ? children.length : (children ? 1 : 0);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hud-int"
        style={{
          position: "relative",
          width: "100%", textAlign: "left", padding: "6px 9px 6px 12px",
          background: open
            ? `linear-gradient(90deg, ${accent}22, ${accent}05 65%, transparent)`
            : "rgba(86,211,198,0.03)",
          border: `1px solid ${accent}55`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: "0 4px 4px 0",
          cursor: "pointer",
          fontFamily: C.font, fontSize: 10, fontWeight: 700,
          letterSpacing: 1.8, textTransform: "uppercase",
          color: accent,
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: open ? 6 : 0,
          boxShadow: open ? `0 0 8px ${accent}33, inset 0 0 6px ${accent}10` : "none",
          transition: "background .12s ease, box-shadow .12s ease, margin-bottom .12s ease",
        }}
      >
        <span style={{
          display: "inline-block", width: 6, height: 6,
          background: accent,
          clipPath: "polygon(0 0, 100% 50%, 0 100%)",
          boxShadow: `0 0 5px ${accent}`,
          transition: "transform .15s ease",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          flexShrink: 0,
        }} />
        <span style={{ flex: 1, textShadow: `0 0 6px ${accent}55` }}>{label}</span>
        <span style={{
          fontSize: 8.5, color: accent, opacity: 0.6, fontWeight: 600,
          letterSpacing: 1.4,
        }}>
          {childCount}
        </span>
        <span style={{
          height: 1, width: 18,
          background: `linear-gradient(90deg, ${accent}99, transparent)`,
          opacity: 0.55,
        }} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{ display: "flex", flexDirection: "column", gap: 5 }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

function FactionDetailView({ f, dip, onBack, onClose, onVerb, onOpenPane, onConfirmAndAct }) {
  const tierColor = TIER_COLOR[f.standingTier] || "#f4efe2";
  // Anything THIS faction has put to you, shown here as well as in the
  // landing inbox. A counter-offer is generated by proposing from this very
  // screen, so telling the player to go and look somewhere else for the
  // reply would be a strange way to hold a conversation.
  const theirOffers = (dip.offers || []).filter((o) => o.from === f.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <DetailHeader f={f} tierColor={tierColor} onBack={onBack} onClose={onClose} />

      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 14px 14px",
        display: "flex", flexDirection: "column", gap: 11,
      }}>
        {theirOffers.length > 0 && (
          <>
            <SectionRule index={0} label={theirOffers[0].isCounter ? "Their Terms" : "On the Table"} color={C.holoHi} />
            {theirOffers.map((o) => (
              <OfferCard key={o.id} offer={o} dip={dip} onAction={onVerb} />
            ))}
          </>
        )}
        {/* Recorded transmission — leader portrait in a viewscreen with
            broadcast HUD strips. Top of the detail view; scrolls away. */}
        <LeaderTransmission f={f} tierColor={tierColor} />
        <StatusRow f={f} tierColor={tierColor} />

        <SectionRule index={1} label="Intel Brief" color={tierColor} />
        <IntelBrief f={f} tierColor={tierColor} />

        <SectionRule index={2} label="Relationship" color={C.holo} />
        <Card>
          <ObligationsList f={f} dip={dip} />
        </Card>
        <GrievanceLedger f={f} />

        <SectionRule index={3} label="What They Want" color={C.holo} />
        <Card>
          <div className="pc-prose" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4 }}>
              <strong style={{ color: C.holoHi, textTransform: "uppercase", letterSpacing: 1 }}>
                {f.temperament || "—"}
              </strong>
            </div>
            {f.wants}
          </div>
        </Card>

        <SectionRule index={4} label="Tech Wheel" color={C.holo} />
        {dip.spyRing ? (
          <Card>
            <TechReadout nodes={f.theirTechWheel || []} />
          </Card>
        ) : (
          <Card accent="rgba(86,211,198,0.2)">
            <div style={{
              fontFamily: C.font, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              color: "rgba(143,246,234,0.5)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ color: C.holoHi, opacity: 0.5 }}>◇</span>
              Espionage required · Intelligence B1 Spy Ring
            </div>
          </Card>
        )}

        <SectionRule index={5} label="Actions" color={C.holoHi} />
        <ActionGroups
          f={f}
          onVerb={onVerb}
          onOpenPane={onOpenPane}
          onConfirmAndAct={onConfirmAndAct}
        />
      </div>
    </div>
  );
}

// What is actually between you — the books, both ways. The engine has always
// kept this (it is what makes a war "justified") and never shown a line of
// it, so a player could be denounced, invaded and coalitioned against with
// no way to read why.
function GrievanceLedger({ f }) {
  const l = f.ledger;
  if (!l || (!l.theyHold.length && !l.youHold.length)) return null;
  const Side = ({ label, entries, weight, color }) => {
    if (!entries.length) return null;
    return (
      <div style={{ marginTop: 6 }}>
        <SectionLabel color={color}>{label} · weight {weight}</SectionLabel>
        {entries.map((e, i) => (
          <div key={i} className="pc-prose" style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(207,214,220,0.85)" }}>
            <span style={{ color, fontWeight: 700 }}>▪</span> {e.text}
          </div>
        ))}
      </div>
    );
  };
  return (
    <Card accent="#d2913c">
      <SectionLabel color="#e8b467">The books</SectionLabel>
      <Side label="They hold against you" entries={l.theyHold} weight={l.theirWeight} color="#d2453f" />
      <Side label="You hold against them" entries={l.youHold} weight={l.yourWeight} color="#c9b24e" />
      {(l.theyHold.some((e) => e.kind === "occupation") || l.youHold.some((e) => e.kind === "occupation")) && (
        <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: "#e8b467", marginTop: 6 }}>
          Ground held is not a thing that happened — no settlement clears it.
          It ends when the place changes hands.
        </div>
      )}
      <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(207,214,220,0.55)", marginTop: 7 }}>
        A live grievance makes a war righteous for the side that holds it, and
        gives them grounds to denounce — which is how something nobody
        witnessed still reaches the board. Offer a settlement in a deal to
        clear the slate: both ways at once, for a price that tracks the weight.
      </div>
    </Card>
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
      : "Trading pact — a clear route from your ground to theirs.");
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

// The term, in rounds, that a stream or a standing promise runs for.
// Mirrors CONFIG.diplomacy.flow — kept here rather than imported so the pane
// stays a pure view; the engine clamps anything out of range regardless.
const TERM_DEFAULT = 5;
const TERM_MAX = 20;

function DealPane({ f, dip, kind = "custom", onBack, onSubmit }) {
  const [scrapGive, setScrapGive] = useState(0);
  const [scrapGet, setScrapGet] = useState(0);
  const [flowGive, setFlowGive] = useState(0);
  const [flowGet, setFlowGet] = useState(0);
  const [pactOffer, setPactOffer] = useState(false);
  const [openBorders, setOpenBorders] = useState(false);
  const [nonAggression, setNonAggression] = useState(false);
  // …and the same three the other way round. A treaty table where you can
  // only ever OFFER is a donation form; asking for their borders is half of
  // what anyone actually wants out of one.
  const [wantPact, setWantPact] = useState(false);
  const [wantBorders, setWantBorders] = useState(false);
  const [settle, setSettle] = useState(false);
  // §3.2 — cities on the table, by hexId. The map is what the war is about,
  // and until now the only thing this pane could move was scrap.
  const [cedeGive, setCedeGive] = useState(() => new Set());
  const [cedeGet, setCedeGet] = useState(() => new Set());
  const yoursToGive = dip.youCouldCede || [];
  const theirsToAsk = f.theyCouldCede || [];
  // Only worth offering when there is something a settlement can clear. An
  // occupation is not in the past, so scrap does not touch it.
  const owed = f.ledger?.settleable || 0;
  const [term, setTerm] = useState(TERM_DEFAULT);
  const isPeace = kind === "peace";
  const isTribute = kind === "tribute";
  const isGift = kind === "gift";
  // A term only means anything when something on the table actually runs for
  // one; a lump sum and an alliance are both settled the moment it's struck.
  const termMatters = flowGive > 0 || flowGet > 0 || nonAggression;

  // Everything here speaks the engine's item schema
  // ({resource} / {flow} / {promise:{kind}}). It used to emit its own
  // shorthand — {pact:true}, {openBorders:true} — which valueOfItem does not
  // read, so those terms were worth nothing to the other side and created
  // nothing when the deal was struck. An offer of "an alliance for free" was
  // accepted and produced no alliance.
  const deal = useMemo(() => {
    const give = [];
    const get = [];
    if (scrapGive > 0) give.push({ resource: { resource: "scrap", amount: scrapGive } });
    if (scrapGet > 0) get.push({ resource: { resource: "scrap", amount: scrapGet } });
    if (flowGive > 0) give.push({ flow: { resource: "scrap", amountPerTurn: flowGive, rounds: term } });
    if (flowGet > 0) get.push({ flow: { resource: "scrap", amountPerTurn: flowGet, rounds: term } });
    if (pactOffer && !isTribute) give.push({ promise: { kind: "pact" } });
    if (openBorders) give.push({ promise: { kind: "openBorders" } });
    if (nonAggression) {
      // Non-aggression is mutual by nature — a one-sided one is just a
      // promise not to hit somebody who may still hit you.
      give.push({ promise: { kind: "nonAggression", rounds: term } });
      get.push({ promise: { kind: "nonAggression", rounds: term } });
    }
    if (wantPact && !isTribute) get.push({ promise: { kind: "pact" } });
    if (wantBorders) get.push({ promise: { kind: "openBorders" } });
    // Asked for, not given: the party holding the grievances is the one being
    // asked to give something up, and they price it accordingly.
    if (settle) get.push({ settlement: true });
    for (const hex of cedeGive) give.push({ location: { hexId: hex } });
    for (const hex of cedeGet) get.push({ location: { hexId: hex } });
    if (isPeace) give.push({ promise: { kind: "peace" } });
    return { proposer: dip.youId, recipient: f.id, give, get };
  }, [scrapGive, scrapGet, flowGive, flowGet, pactOffer, openBorders, nonAggression,
      wantPact, wantBorders, settle, cedeGive, cedeGet, term, dip.youId, f.id, isPeace, isTribute]);

  const title = isGift ? "Send a gift" : isPeace ? "Sue for peace" : isTribute ? "Demand tribute" : "Custom deal";
  const subtitle = isGift
    ? "No strings attached — scrap for goodwill. Standing rises with the size of the gift."
    : isPeace
    ? "The peace promise is fixed; everything else is yours to shape."
    : isTribute
    ? "Make them an offer they can refuse. Then live with the cost."
    : "Build a give/get. If the ask outweighs the offer they will say so — and name the price they would take.";

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
              {!isGift && (
                <NumberRow label="Scrap / turn" value={flowGive} onChange={setFlowGive} max={12} />
              )}
              {!isPeace && !isGift && (
                <Toggle label="Offer pact" value={pactOffer} onChange={setPactOffer} />
              )}
              {!isGift && (
                <Toggle label="Open my borders" value={openBorders} onChange={setOpenBorders} />
              )}
              {!isGift && (
                <Toggle label="Non-aggression" value={nonAggression} onChange={setNonAggression} />
              )}
              {!isGift && yoursToGive.length > 0 && (
                <CityPicker
                  label="Cede a city"
                  cities={yoursToGive}
                  chosen={cedeGive}
                  onChange={setCedeGive}
                  claimantOf={f.id}
                />
              )}
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
          {!isGift && (
            <Card style={{ flex: 1 }}>
              <SectionLabel>You get</SectionLabel>
              <NumberRow label="Scrap" value={scrapGet} onChange={setScrapGet} max={50} />
              <NumberRow label="Scrap / turn" value={flowGet} onChange={setFlowGet} max={12} />
              {!isPeace && !isTribute && (
                <Toggle label="Their alliance" value={wantPact} onChange={setWantPact} />
              )}
              <Toggle label="Their borders" value={wantBorders} onChange={setWantBorders} />
              {owed > 0 && (
                <Toggle label={`Call it settled (weight ${owed})`} value={settle} onChange={setSettle} />
              )}
              {theirsToAsk.length > 0 && (
                <CityPicker
                  label="Ask for a city"
                  cities={theirsToAsk}
                  chosen={cedeGet}
                  onChange={setCedeGet}
                  claimantOf={dip.youId}
                />
              )}
            </Card>
          )}
        </div>

        {/* Term — only shown once something on the table actually runs for
            one. A stream priced without a term is how the old builder let a
            player buy four scrap a turn forever for twelve scrap. */}
        {termMatters && (
          <Card>
            <SectionLabel>Term</SectionLabel>
            <NumberRow label="Rounds" value={term} onChange={(v) => setTerm(Math.max(1, v))} max={TERM_MAX} />
            <div className="pc-prose" style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(207,214,220,0.6)", marginTop: 4 }}>
              Streams and standing promises run for this long, then lapse —
              honourably, on both sides. They price it accordingly: a longer
              term is worth more, but not proportionally more.
            </div>
          </Card>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onBack} className="hud-int" style={btnGhostStyle()}>Back</button>
          <button
            onClick={() => onSubmit(deal, kind)}
            disabled={isGift && scrapGive <= 0}
            className="hud-int"
            style={{ ...btnHoloStyle(), opacity: isGift && scrapGive <= 0 ? 0.5 : 1 }}
          >{isGift ? "Send gift" : isTribute ? "Demand" : isPeace ? "Sue for peace" : "Propose"}</button>
        </div>
      </div>
    </div>
  );
}

// Naming a demand and a deadline. Two kinds, because these are the two the
// engine can check without ambiguity: scrap paid, and units gone.
function UltimatumPane({ f, dip, onBack, onSubmit }) {
  const [kind, setKind] = useState("tribute");
  const [amount, setAmount] = useState(8);
  const intruders = f.unitsInYourTerritory ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PaneHeader title="Issue an ultimatum" f={f} onBack={onBack} />
      <div className="pc-scroll" style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 1, lineHeight: 1.5, color: "rgba(207,214,220,0.7)" }}>
          Say it out loud, with a date on it. If they defy you, your war on
          them is righteous — and if you then do nothing, everyone saw.
        </div>
        <Card>
          <SectionLabel>The demand</SectionLabel>
          <Toggle label="Pay us" value={kind === "tribute"} onChange={() => setKind("tribute")} />
          {kind === "tribute" && (
            <NumberRow label="Scrap" value={amount} onChange={setAmount} max={30} />
          )}
          <Toggle
            label="Get your units out of our territory"
            value={kind === "withdraw"}
            onChange={() => setKind("withdraw")}
          />
          {kind === "withdraw" && intruders === 0 && (
            <div className="pc-prose" style={{ fontSize: 11, color: "#ffb4ae", marginTop: 5 }}>
              They have nothing inside your borders to withdraw.
            </div>
          )}
        </Card>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onBack} className="hud-int" style={btnGhostStyle()}>Back</button>
          <button
            className="hud-int"
            disabled={kind === "tribute" && amount < 1}
            onClick={() => onSubmit(kind === "tribute" ? { kind, amount } : { kind })}
            style={btnHoloStyle()}
          >Deliver it</button>
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
// §3.2 — the cities each side can put on the table. Multi-select, because
// "both Omara and Kansit and we have peace" is a sentence somebody will want
// to say, and each row carries the two facts that decide the price: what the
// place is worth, and whose homeland it is. `claimantOf` is the party on the
// OTHER side of this column — a city they call theirs is the one they will
// pay far over the odds for, and the row says so rather than leaving the
// player to discover it from a refusal.
function CityPicker({ label, cities, chosen, onChange, claimantOf }) {
  const toggle = (hex) => {
    const next = new Set(chosen);
    if (next.has(hex)) next.delete(hex); else next.add(hex);
    onChange(next);
  };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontFamily: C.font, fontSize: 9.5, letterSpacing: 1.4,
        textTransform: "uppercase", color: "rgba(207,214,220,0.5)", marginBottom: 4,
      }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {cities.map((c) => {
          const on = chosen.has(c.hexId);
          const theirHomeland = c.affiliation && c.affiliation === claimantOf;
          return (
            <button
              key={c.hexId}
              onClick={() => toggle(c.hexId)}
              className="hud-int"
              style={{
                display: "flex", alignItems: "baseline", gap: 6, width: "100%",
                textAlign: "left", cursor: "pointer",
                padding: "4px 6px", borderRadius: 3,
                border: `1px solid ${on ? C.holo : "rgba(207,214,220,0.18)"}`,
                background: on ? "rgba(86,211,198,0.14)" : "rgba(255,255,255,0.02)",
                boxShadow: on ? `0 0 6px ${C.holo}55` : undefined,
              }}
            >
              <span style={{
                fontFamily: C.font, fontSize: 11.5, letterSpacing: 0.6,
                color: on ? "#f4efe2" : "#cfd6dc", flex: 1,
              }}>{c.name}</span>
              {theirHomeland && (
                <span
                  title="Their homeland — they will pay well past its output to have it back"
                  style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 1, color: C.holoHi }}
                >CLAIMED</span>
              )}
              <span style={{
                fontFamily: C.font, fontSize: 10, letterSpacing: 0.6,
                color: "rgba(207,214,220,0.55)",
              }}>{c.vp} VP · {c.output}/turn</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  dip, lastResult, onAction, onClose, onDismissResult,
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

  // §5.3 — when the faction-detail view is showing a faction with an active
  // trading pact, paint the dotted route line on the map (green if clear,
  // amber if suspended). The endpoints are the two cities the ENGINE found the
  // route between, not the two capitals: a pact is no longer a statement about
  // anybody's seat, and drawing capital-to-capital would trace a line the
  // trade is not travelling. Falls back to the capitals when the route is
  // severed, so a suspended pact still shows what it was.
  const tradeFor = selectedFaction?.tradingPact || null;
  const route = selectedFaction?.tradeRoute || null;
  const fromLoc = route?.fromLocId || dip.youCapital || null;
  const toLoc = route?.toLocId || selectedFaction?.capital || null;
  const showRoute = tradeFor && fromLoc && toLoc && view === "detail";

  return (
    <>
      {showRoute && (
        <TradingPactRouteLayer
          fromLocId={fromLoc}
          toLocId={toLoc}
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
          width: 420, maxWidth: "100vw",
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

        {/* Last-action toast — auto-clears (host timer); also click to
            dismiss so it never sits on top of text you're trying to read. */}
        <AnimatePresence>
          {lastResult?.msg && (
            <motion.div
              key={lastResult.msg}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              onClick={onDismissResult}
              title="Dismiss"
              style={{
                position: "absolute", left: 16, right: 16, top: 56,
                zIndex: 5,
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px",
                background: "rgba(8,16,17,0.92)",
                border: `1px solid ${lastResult.ok && lastResult.accepted !== false ? "#5fc27a" : "#d2913c"}88`,
                borderRadius: 4,
                color: lastResult.ok && lastResult.accepted !== false ? "#5fc27a" : "#d2913c",
                fontFamily: C.font, fontSize: 10.5, letterSpacing: 0.6,
                boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
                cursor: onDismissResult ? "pointer" : "default",
              }}
            >
              <span style={{ flex: 1 }}>{lastResult.msg}</span>
              {onDismissResult && (
                <span style={{ opacity: 0.7, fontWeight: 700, flexShrink: 0 }}>×</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
                onAction={onAction}
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
              {pane === "gift" && (
                <GiftPane
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(standing) => runFromPane("gift", {
                    faction: selectedFaction.id, standing,
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
                    // `terms` is what the verb reads. It used to be sent as
                    // `get`, which the verb ignored, so every demand made
                    // from here asked for nothing and "succeeded".
                    terms: deal.get,
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
              {pane === "ultimatum" && (
                <UltimatumPane
                  f={selectedFaction}
                  dip={dip}
                  onBack={() => setPane(null)}
                  onSubmit={(demand) => runFromPane("issue-ultimatum", {
                    faction: selectedFaction.id, demand,
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
