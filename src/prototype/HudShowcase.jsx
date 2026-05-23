// Static look-pass of the HUD at /#hud — drives the shared HudChrome
// components with mock data so the visuals can be reviewed without a
// running game. The live wiring lives in Prototype.jsx.
import { useState } from "react";
import ControlMeter from "./ControlMeter.jsx";
import {
  C, ICON, ResourceWheel, FactionReadout, MenuOrb, RadialMenu, LocationWindow, TitledWindow, MarketBand,
} from "./HudChrome.jsx";

const MOCK_MARKET = {
  tiers: [
    { tier: 1, unlocked: true, unlockLevel: 1, items: [
      { uid: "m1", chipId: "drilledTroops" }, { uid: "m2", chipId: "recyclers" },
      { uid: "m3", chipId: "townHall" }, { uid: "m4", chipId: "navigator" }, { uid: "m5", chipId: "sharpenedBlades" },
    ] },
    { tier: 2, unlocked: false, unlockLevel: 3, items: [] },
    { tier: 3, unlocked: false, unlockLevel: 5, items: [] },
  ],
  resale: [{ uid: "r1", chipId: "cannons", isResale: true }],
};

const MENU_ITEMS = [
  { key: "research", icon: ICON.research, label: "Research" },
  { key: "units", icon: ICON.units, label: "Units" },
  { key: "locations", icon: ICON.shield, label: "Locations" },
  { key: "market", icon: ICON.scrap, label: "Market" },
];

const MOCK_LOC = {
  hexId: "korad", name: "KORAD", valueLabel: "High Value", valueColor: C.copperHi, vp: 3,
  statusLabel: "Held — Versari Korad", sections: ["versari", "versari", "neutral"],
  foothold: 2, footholdCap: 3, garrison: 6, production: 3, chipSlots: 2,
  ability: { name: "Forge", text: "Once per turn, spend 2 scrap to give a unit here +1 Strength until your next turn.", usedThisTurn: false, canActivate: true },
  contest: { attackerName: "Vanguard", attackerTotal: 7, defenderLabel: "Garrison", defenderValue: 6, defenderRollsDie: false, hasNeutral: true, canContest: true, unitId: "u1" },
};

export default function HudShowcase({ onExit }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const open = (key) => { setPanel(key); setMenuOpen(false); };

  return (
    <div className="hud-root">
      <div className="hud-back" />
      <div style={{ position: "absolute", inset: 22, border: "1px solid rgba(192,124,56,0.12)", borderRadius: 18, pointerEvents: "none" }} />

      <button className="hud-int" onClick={() => setPanel("locations")} title="KORAD (click to inspect)"
        style={{ position: "absolute", left: "44%", top: "46%", transform: "translate(-50%,-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer" }}>
        <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>
          <ControlMeter sections={["versari", "versari", "neutral"]} foothold={2} footholdCap={3} size={64} />
        </div>
        <span style={{ fontFamily: C.font, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.textDim }}>Korad</span>
      </button>

      <ResourceWheel scrap={18} units={{ n: 2, cap: 2 }} tech={{ level: 2, label: "Tech 55%" }} onSettings={() => {}} />
      <FactionReadout name="Versari Korad" color={C.red} vp={4} vpGoal={10} actions={{ remaining: 2, max: 2 }} round={3} onEndTurn={() => {}} />
      <MenuOrb onOpen={() => setMenuOpen(true)} />

      {menuOpen && <RadialMenu items={MENU_ITEMS} onPick={open} onClose={() => setMenuOpen(false)} />}
      {panel === "locations" && <LocationWindow view={MOCK_LOC} onClose={() => setPanel(null)} onActivate={() => {}} onContest={() => {}} onRecruit={() => {}} />}
      {panel === "research" && <TitledWindow title="Research" icon={ICON.research} onClose={() => setPanel(null)}>
        <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>Advance your tech level to earn ability points on the Tech Wheel — Military, Industry, Logistics and Intelligence branches.</p>
      </TitledWindow>}
      {panel === "units" && <TitledWindow title="Units" icon={ICON.units} onClose={() => setPanel(null)}>
        <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>Your fielded units, their strength and movement, installed chips, and reinforcement options.</p>
      </TitledWindow>}
      {panel === "market" && (
        <MarketBand
          tiers={MOCK_MARKET.tiers}
          resale={MOCK_MARKET.resale}
          scrap={18}
          actions={{ remaining: 2, max: 2 }}
          isYourTurn
          onAcquire={() => {}}
          onClose={() => setPanel(null)}
        />
      )}

      <div style={{ position: "absolute", bottom: 18, left: 24, color: C.textFaint, zIndex: 20 }}>
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>HUD Look Pass · v2</div>
        {onExit && <button className="hud-int" onClick={onExit} style={{ marginTop: 8, fontFamily: C.font, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, background: "transparent", border: `1px solid ${C.steelHi}`, borderRadius: 5, padding: "5px 14px", cursor: "pointer" }}>← Back to game</button>}
      </div>
    </div>
  );
}
