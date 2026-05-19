// A floating window that inspects the selected hex. Its content is split
// into tabs along the top, so the player sees at a glance which sections
// exist and never has to scroll to reach one. Opens on hex selection,
// closes via the header button (or re-clicking the hex).
import { useEffect, useState } from "react";
import {
  LOCATIONS,
  FACTIONS,
  fullController,
  ownerColor,
  garrisonStrength,
  unitEffective,
  theme,
} from "./data.js";
import { Label, IconBtn } from "./kit.jsx";
import LocationCard from "./LocationCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import ContestPanel from "./ContestPanel.jsx";

const WIN_W = 430;
const BODY_H = 430;
const PROSE = { fontSize: 11.5, color: theme.textDim, lineHeight: 1.5 };

function Swatch({ color }) {
  return (
    <span
      style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, display: "inline-block" }}
    />
  );
}

function SectionRow({ idx, owner }) {
  const name = owner === "neutral" ? "Neutral garrison" : FACTIONS[owner]?.name;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Swatch color={ownerColor(owner)} />
      <span style={{ fontSize: 11, color: theme.textDim }}>Section {idx + 1}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.text, marginLeft: "auto" }}>
        {name}
      </span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ marginTop: 5 }}>{children}</div>
    </div>
  );
}

function Big({ children }) {
  return (
    <span style={{ fontFamily: theme.fontDisplay, fontSize: 26, fontWeight: 700, color: theme.text }}>
      {children}
    </span>
  );
}

// --- per-hex tab models --------------------------------------------------

function locationModel(state, hex) {
  const loc = LOCATIONS[hex.locationId];
  const control = hex.control;
  const ctrl = fullController(control.sections);
  const hasCapital = control.chips.includes("capital");
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const yourUnitHere = unit && unit.owner === state.youId;
  const hasNeutral = control.sections.includes("neutral");
  const claimed = control.sections.some((s) => s !== "neutral");
  const contestable = yourUnitHere && ctrl !== state.youId;

  let footholdText;
  if (!ctrl) {
    footholdText = "Inactive — no player holds all three sections.";
  } else if (hasCapital) {
    footholdText = "Capital installed — this location cannot decay.";
  } else {
    footholdText = `+${control.foothold} of ${control.footholdCap}. Rises while the holder's unit garrisons here, falls when it leaves.`;
  }

  const tabs = [
    {
      id: "card",
      label: "Card",
      render: () => (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
          <LocationCard locationId={hex.locationId} control={control} width={250} />
        </div>
      ),
    },
    {
      id: "control",
      label: "Control",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <ControlMeter
              sections={control.sections}
              foothold={control.foothold}
              footholdCap={control.footholdCap}
              size={96}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              {control.sections.map((owner, i) => (
                <SectionRow key={i} idx={i} owner={owner} />
              ))}
            </div>
          </div>
          <Field label="Foothold">
            <div className="pc-prose" style={PROSE}>
              {footholdText}
            </div>
          </Field>
        </div>
      ),
    },
  ];

  if (unit) {
    const eff = unitEffective(unit);
    tabs.push({
      id: "unit",
      label: "Unit",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontFamily: theme.fontDisplay, fontSize: 18, fontWeight: 700, color: ownerColor(unit.owner) }}>
            {unit.name}
            <span style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>
              {" "}
              — {FACTIONS[unit.owner].name}
              {unit.owner === state.youId ? " (yours)" : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 26 }}>
            <Field label="Strength">
              <Big>{eff.strength}</Big>
            </Field>
            <Field label="Movement">
              <Big>{eff.movement}</Big>
            </Field>
            <Field label="Status">
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 14,
                  fontWeight: 700,
                  color: unit.immobilized ? theme.accent2 : theme.good,
                }}
              >
                {unit.immobilized ? "Immobilized" : "Ready"}
              </span>
            </Field>
          </div>
        </div>
      ),
    });
  }

  if (contestable) {
    tabs.push({
      id: "contest",
      label: "Contest",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="pc-prose" style={PROSE}>
            {hasNeutral
              ? "Neutral sections still stand — the contest is forced onto the garrison."
              : "Beat the holder to flip one of their sections to your control."}
          </div>
          <ContestPanel
            attacker={{ name: unit.name, strength: unitEffective(unit).strength }}
            defender={{
              name: hasNeutral ? "Garrison" : FACTIONS[ctrl]?.name || "Holder",
              value: garrisonStrength(hex.locationId, control),
            }}
          />
        </div>
      ),
    });
  }

  return {
    title: loc.name,
    subtitle: ctrl ? `Held — ${FACTIONS[ctrl].name}` : claimed ? "Contested" : "Uncontrolled",
    tabs,
  };
}

function encounterModel(state, hex) {
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const tabs = [
    {
      id: "encounter",
      label: "Encounter",
      render: () => (
        <div className="pc-prose" style={PROSE}>
          A unit that ends its Move here draws the top card of the encounter
          deck and resolves it — a challenge, a buff, or a setback. The tile is
          then spent.
        </div>
      ),
    },
  ];
  if (unit) {
    tabs.push({
      id: "unit",
      label: "Unit",
      render: () => (
        <div style={{ fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 700, color: ownerColor(unit.owner) }}>
          {unit.name}
          <span style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>
            {" "}
            — {FACTIONS[unit.owner].name}
          </span>
        </div>
      ),
    });
  }
  return { title: "Encounter", subtitle: "Unresolved", tabs };
}

function terrainModel() {
  return {
    title: "Wasteland",
    subtitle: "Open terrain",
    tabs: [
      {
        id: "terrain",
        label: "Terrain",
        render: () => (
          <div className="pc-prose" style={PROSE}>
            Open wasteland. Units move through freely; there is nothing to
            contest or garrison here.
          </div>
        ),
      },
    ],
  };
}

export default function Inspector({ state, selectedHexId, onClose }) {
  const [active, setActive] = useState(0);

  // Every fresh selection starts on the first tab.
  useEffect(() => {
    setActive(0);
  }, [selectedHexId]);

  const hex = selectedHexId ? state.hexes[selectedHexId] : null;
  if (!hex) return null;

  let model;
  if (hex.type === "location") model = locationModel(state, hex);
  else if (hex.type === "encounter") model = encounterModel(state, hex);
  else model = terrainModel();

  const { title, subtitle, tabs } = model;
  const safeActive = Math.min(active, tabs.length - 1);

  return (
    <div
      className="pc-pop"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: WIN_W,
        maxWidth: "94vw",
        maxHeight: "90vh",
        zIndex: 60,
        background: theme.plate,
        border: `1px solid ${theme.borderLit}`,
        borderRadius: 10,
        boxShadow: theme.shadowDeep,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* header — hex name + close */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "rgba(0,0,0,0.3)",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span style={{ width: 3, height: 26, background: theme.accent, borderRadius: 1, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: theme.text,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: theme.textFaint,
              fontWeight: 600,
            }}
          >
            {subtitle}
          </span>
        </div>
        <IconBtn title="Close" onClick={onClose}>
          ✕
        </IconBtn>
      </div>

      {/* tab strip — the window's navigation */}
      <div style={{ display: "flex", background: "rgba(0,0,0,0.22)", borderBottom: `1px solid ${theme.border}` }}>
        {tabs.map((t, i) => {
          const on = i === safeActive;
          return (
            <button
              key={t.id}
              className="pc-int"
              onClick={() => setActive(i)}
              style={{
                flex: 1,
                border: "none",
                borderTop: `2px solid ${on ? theme.accent : "transparent"}`,
                background: on
                  ? "linear-gradient(180deg, rgba(232,169,63,0.18), rgba(232,169,63,0.02))"
                  : "transparent",
                color: on ? theme.text : theme.textDim,
                fontFamily: theme.fontDisplay,
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "9px 6px",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* body — fixed height so a tab never scrolls */}
      <div style={{ height: BODY_H, padding: 16, overflow: "hidden" }}>
        {tabs[safeActive].render()}
      </div>
    </div>
  );
}
