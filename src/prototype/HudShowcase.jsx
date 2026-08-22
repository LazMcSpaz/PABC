// Static look-pass of the HUD at /#hud — drives the shared HudChrome
// components with mock data so the visuals can be reviewed without a
// running game. The live wiring lives in Prototype.jsx.
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import ControlMeter from "./ControlMeter.jsx";
import TechWheel from "./TechWheel.jsx";
import EncounterModal from "./EncounterModal.jsx";
import {
  C, ICON, TopBar, MenuOrb, RadialMenu, LocationWindow, TitledWindow,
} from "./HudChrome.jsx";

// Copied verbatim from the authored corpus (src/game/content/field-encounters.js)
// rather than invented. The previous mock was `fe_buried_cache`, an encounter
// that no longer exists in the content and whose "outcome text" was a list of
// resource deltas — so the look pass was reviewing a card whose prose read
// nothing like the writing it is built to carry.
const MOCK_ENCOUNTER = {
  id: "fe_the_silo",
  title: "The Silo",
  text: "You see it for half a day before you reach it — a grain elevator standing alone with nothing around it for miles. Empty inside, and swept. Someone repaints the ladder rungs. The inner wall is carved over with names going back four generations, packed close and overlapping, and one of your plains riders takes out a knife and adds his own without asking anyone or explaining why.",
  choices: [
    { id: "ch_silo_carve", label: "Add your own names", outcomeText: "Your people take turns at it and take it more seriously than any of them would admit to." },
    { id: "ch_silo_shade", label: "Rest in the shade", outcomeText: "An hour out of the sun in the coolest place for forty miles. Nobody says much." },
    { id: "ch_silo_on", label: "Ride on", outcomeText: "You leave it standing behind you and it takes most of the afternoon to go out of sight." },
  ],
};

// The quest beat this whole outcome face was built to repair: q_massacre's
// compound, the one that showed up titled with its own id, resolved a CONTEST
// nobody saw, and killed a unit without a word of explanation.
const MOCK_BEAT = {
  id: "quest:q_massacre:beat:qb_mas_compound",
  title: "What the Steel Traders Left",
  text: "The tracks end at a wall built out of the old world — haulers and freight vehicles dragged into a ring, cut down, welded and packed with earth until the whole thing became a fort. A man on the rampart watches your unit come the last half mile and lets you get close enough to hear him before he asks what you want.",
  choices: [
    { id: "ch_mas_challenge", label: "Challenge them for the spoils", outcomeText: "You tell him what they took and from whom and what you intend to do about it, and he does not bother denying any part of it." },
    { id: "ch_mas_threaten", label: "Threaten to tell the Goldgrass", outcomeText: "You tell him exactly how far this wall is from the nearest Goldgrass hall and how quickly that can be corrected." },
    { id: "ch_mas_note", label: "Leave — you know where they are", outcomeText: "You turn around in full view and ride out, and every man on that rampart understands that the location is now worth something to somebody." },
  ],
};

// Art is optional on every encounter and beat, so the modal has two layouts
// to look-pass, not one. A leader portrait stands in for encounter art here
// purely because it is already 2:3 — no encounter art is authored yet.
const MOCK_ENCOUNTER_ART = {
  ...MOCK_ENCOUNTER,
  imagePath: `${import.meta.env.BASE_URL}assets/portraits/factions/versari/versari_leader_1.webp`,
};

// The card's outcome face — the half a resolved choice turns over onto.
// Two variants, because the two things it has to carry are different jobs:
// a lost narrative contest (dice, verdict, a unit gone) and a plain
// consequence card with no roll behind it at all.
const MOCK_OUTCOME_CONTEST = {
  choiceLabel: "Challenge them for the spoils",
  outcomeText: "You tell him what they took and from whom and what you intend to do about it, and he does not bother denying any part of it.",
  contest: { own: 4, ally: 0, opponent: 5, die: 1, opponentDie: 6, sides: 6, total: 5, against: 11, won: false },
  roll: null,
  lines: [
    { tone: "bad", text: "Your unit was destroyed" },
    { tone: "flat", text: "Kit left behind at The Shelf" },
    { tone: "flat", text: "This is where it ends" },
  ],
};
const MOCK_OUTCOME_PLAIN = {
  choiceLabel: "Add your own names",
  outcomeText: "Your people take turns at it and take it more seriously than any of them would admit to.",
  contest: null,
  roll: null,
  lines: [
    { tone: "good", text: "+2 scrap" },
    { tone: "good", text: "+1 research" },
    { tone: "bad", text: "Standing with Goldgrass Coalition ▼ 1" },
  ],
};

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
  { key: "economy", icon: ICON.scrap, label: "Economy" },
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
          <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.textDim }}>Broker deals, pacts and coalitions with rival factions — manage reputation, and deal with every rival by treaty or by force.</p>
        </TitledWindow>}
        {(panel === "encounter" || panel === "encounterArt" || panel === "encounterEdit"
          || panel === "outcome" || panel === "outcomePlain") && (() => {
          const enc = (panel === "outcome" || panel === "encounterEdit") ? MOCK_BEAT
            : panel === "encounterArt" ? MOCK_ENCOUNTER_ART : MOCK_ENCOUNTER;
          const outcome = panel === "outcome" ? MOCK_OUTCOME_CONTEST
            : panel === "outcomePlain" ? MOCK_OUTCOME_PLAIN : null;
          return (
            <EncounterModal
              key={panel}
              encounter={enc}
              choices={enc.choices}
              eligibleIds={enc.choices.map((c) => c.id)}
              redrawsLeft={outcome ? 0 : 1}
              onRedraw={() => {}}
              onPick={() => setPanel(null)}
              outcome={outcome}
              onClose={() => setPanel(null)}
              // MOCK_BEAT carries the REAL beat id, so edit mode resolves the
              // real authored effects for it — this look pass is showing the
              // actual grants, not a fixture of them.
              editMode={panel === "encounterEdit"}
              onEdit={() => {}}
            />
          );
        })()}
      </AnimatePresence>
      <div style={{ position: "absolute", bottom: 18, left: 24, color: C.textFaint, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <div style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>HUD Look Pass · v2</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="hud-int" onClick={() => setPanel("encounter")} style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.holoHi, background: "rgba(86,211,198,0.08)", border: `1px solid ${C.holo}66`, borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Encounter · no art</button>
          <button className="hud-int" onClick={() => setPanel("encounterArt")} style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.holoHi, background: "rgba(86,211,198,0.08)", border: `1px solid ${C.holo}66`, borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Encounter · with art</button>
          <button className="hud-int" onClick={() => setPanel("outcome")} style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.holoHi, background: "rgba(86,211,198,0.08)", border: `1px solid ${C.holo}66`, borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Outcome · contest</button>
          <button className="hud-int" onClick={() => setPanel("outcomePlain")} style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.holoHi, background: "rgba(86,211,198,0.08)", border: `1px solid ${C.holo}66`, borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Outcome · no roll</button>
          <button className="hud-int" onClick={() => setPanel("encounterEdit")} style={{ fontFamily: C.font, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.holoHi, background: "rgba(86,211,198,0.08)", border: `1px solid ${C.holo}66`, borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Card · edit mode</button>
        </div>
        {onExit && <button className="hud-int" onClick={onExit} style={{ fontFamily: C.font, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.textDim, background: "transparent", border: `1px solid ${C.steelHi}`, borderRadius: 5, padding: "5px 14px", cursor: "pointer" }}>← Back to game</button>}
      </div>
    </div>
  );
}
