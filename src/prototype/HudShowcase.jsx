// Static look-pass of the HUD at /#hud — drives the shared HudChrome
// components with mock data so the visuals can be reviewed without a
// running game. The live wiring lives in Prototype.jsx.
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import ControlMeter from "./ControlMeter.jsx";
import TechWheel from "./TechWheel.jsx";
import {
  C, ICON, TopBar, MenuOrb, RadialMenu, LocationWindow, TitledWindow,
} from "./HudChrome.jsx";

// Mock tech-wheel state for the showcase: Doctrine + Vanguard already held
// (so Killing Blow / Turrets are now reachable), Industry held too. One
// point left to spend — assignable nodes pulse, locked nodes stay dim.
const MOCK_PLAYER = {
  techWheel: ["mil-entry", "mil-a1", "eco-entry"],
  abilityPointsAvailable: 1,
};

// §20.2 — the Market is retired; the radial menu drops its sector and chips
// are built per-Location in the Location window.
const MENU_ITEMS = [
  { key: "research", icon: ICON.research, label: "Research" },
  { key: "units", icon: ICON.units, label: "Units" },
  { key: "locations", icon: ICON.shield, label: "Locations" },
  { key: "diplomacy", icon: ICON.diplomacy, label: "Diplomacy" },
];

const MOCK_LOC = {
  hexId: "korad", name: "KORAD", valueLabel: "High Value", valueColor: C.copperHi, vp: 3,
  statusLabel: "Held — Versari Korad", sections: ["versari", "versari", "versari"],
  loyalty: 4, loyaltyMax: 8, loyaltyDanger: false, garrison: 6, production: 3, chipSlots: 2,
  // §20 economy showcase — Output, slider, an active build, and the build menu
  // (Loyalty-locked entries greyed per the §20.6 display contract).
  economy: {
    output: 4, slider: 0.5, progress: 2, slotCapacity: 2, slotsUsed: 1, scrap: 18, canManage: true,
    activeBuild: { kind: "build", name: "Labs", cost: 3, progress: 2, remaining: 1 },
    chips: [{ uid: "c1", name: "Recyclers", disabled: false, upgrade: { name: "Factory", cost: 5, desc: "+2 scrap Output", locked: true, reason: "needs Loyalty 3" } }],
    buildMenu: [
      { chipId: "labs", name: "Labs", kind: "location", cost: 3, desc: "+1 Research", locked: false, reason: null, buildable: true },
      { chipId: "factory", name: "Factory", kind: "location", cost: 5, desc: "+2 scrap Output", locked: true, reason: "needs Loyalty 3", buildable: false },
    ],
  },
  ability: { name: "Forge", text: "Once per turn, spend 2 scrap to give a unit here +1 Strength until your next turn.", usedThisTurn: false, canActivate: true },
  contest: { attackerName: "Vanguard", attackerTotal: 7, defenderLabel: "Garrison", defenderValue: 6, defenderRollsDie: false, hasNeutral: false, canContest: true, unitId: "u1" },
};

export default function HudShowcase({ onExit }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const open = (key) => { setPanel(key); setMenuOpen(false); };

  return (
    <div className="hud-root">
      <div className="hud-back" />
      <div className="hud-screen-scan" style={{ zIndex: 2 }} />
      <div style={{ position: "absolute", inset: 22, border: "1px solid rgba(86,211,198,0.14)", borderRadius: 18, pointerEvents: "none", zIndex: 2 }} />

      <button className="hud-int" onClick={() => setPanel("locations")} title="KORAD (click to inspect)"
        style={{ position: "absolute", left: "44%", top: "46%", transform: "translate(-50%,-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer" }}>
        <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>
          <ControlMeter sections={["versari", "versari", "versari"]} loyalty={4} size={64} />
        </div>
        <span style={{ fontFamily: C.font, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.textDim }}>Korad</span>
      </button>

      <TopBar scrap={18} units={{ n: 2, cap: 2 }} tech={{ level: 2, label: "Tech 55%" }}
        name="Versari Korad" color={C.red} vp={4} vpGoal={10} actions={{ remaining: 2, max: 2 }} round={3}
        onEndTurn={() => {}} onSettings={() => {}} />
      <MenuOrb onOpen={() => setMenuOpen(true)} />

      <AnimatePresence>
        {menuOpen && <RadialMenu key="radial-menu" items={MENU_ITEMS} onPick={open} onClose={() => setMenuOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {panel === "locations" && <LocationWindow key="locations" view={MOCK_LOC} onClose={() => setPanel(null)} onActivate={() => {}} onContest={() => {}} onRecruit={() => {}} onBuild={() => {}} onUpgrade={() => {}} onRush={() => {}} onSetSlider={() => {}} />}
        {panel === "research" && (
          <TechWheel key="research" player={MOCK_PLAYER} onAssign={() => {}} onClose={() => setPanel(null)} levelInfo={{ level: 2, maxLevel: 4, research: 12 }} />
        )}
        {panel === "units" && <TitledWindow key="units" title="Units" icon={ICON.units} onClose={() => setPanel(null)}>
          <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>Your fielded units, their strength and movement, installed chips, and reinforcement options.</p>
        </TitledWindow>}
        {panel === "diplomacy" && <TitledWindow key="diplomacy" title="Diplomacy" icon={ICON.diplomacy} onClose={() => setPanel(null)}>
          <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>Broker deals, pacts and coalitions with rival factions — manage reputation and pursue a Recognition victory.</p>
        </TitledWindow>}
      </AnimatePresence>
      <div style={{ position: "absolute", bottom: 18, left: 24, color: C.textFaint, zIndex: 20 }}>
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>HUD Look Pass · v2</div>
        {onExit && <button className="hud-int" onClick={onExit} style={{ marginTop: 8, fontFamily: C.font, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, background: "transparent", border: `1px solid ${C.steelHi}`, borderRadius: 5, padding: "5px 14px", cursor: "pointer" }}>← Back to game</button>}
      </div>
    </div>
  );
}
