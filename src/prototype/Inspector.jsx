// The right-hand detail panel — contextual to the selected hex.
import {
  LOCATIONS,
  FACTIONS,
  fullController,
  ownerColor,
  garrisonStrength,
  unitEffective,
  theme,
} from "./data.js";
import { Panel, Label, Divider } from "./kit.jsx";
import LocationCard from "./LocationCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import ContestPanel from "./ContestPanel.jsx";

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

function Legend() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
        Select a tile on the board to inspect it. Locations show their control
        meter, garrison and chips; encounter tiles trigger a draw when a unit
        ends its Move there.
      </div>
      <div>
        <Label>Tile types</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 7 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Swatch color="#2c2a24" />
            <span style={{ fontSize: 11, color: theme.textDim }}>Location — contestable, ownable</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Swatch color="#1f2d33" />
            <span style={{ fontSize: 11, color: theme.textDim }}>Encounter — draw on arrival</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Swatch color="#262922" />
            <span style={{ fontSize: 11, color: theme.textDim }}>Terrain — passable filler</span>
          </div>
        </div>
      </div>
      <div>
        <Label>Control meter</Label>
        <div style={{ display: "flex", gap: 10, marginTop: 7, alignItems: "center" }}>
          <ControlMeter sections={["versari", "neutral", "lakers"]} foothold={null} footholdCap={3} size={48} />
          <span style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.45 }}>
            Three sections; flip all three to hold the location. The centre is
            the foothold score.
          </span>
        </div>
      </div>
      <div>
        <Label>Factions</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
          {Object.values(FACTIONS).map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Swatch color={f.color} />
              <span style={{ fontSize: 11, color: theme.textDim }}>{f.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Inspector({ state, selectedHexId }) {
  const hex = selectedHexId ? state.hexes[selectedHexId] : null;

  if (!hex) {
    return (
      <Panel title="Inspector" scroll style={{ height: "100%" }}>
        <Legend />
      </Panel>
    );
  }

  if (hex.type === "terrain") {
    return (
      <Panel title="Terrain Tile" scroll style={{ height: "100%" }}>
        <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
          Open terrain. Units move through freely; nothing to contest here.
        </div>
      </Panel>
    );
  }

  if (hex.type === "encounter") {
    const unit = hex.unitId ? state.units[hex.unitId] : null;
    return (
      <Panel title="Encounter Tile" scroll style={{ height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
            A unit that ends its Move here draws the top card of the encounter
            deck and resolves it — a challenge, a buff, or a setback. The tile
            is then spent.
          </div>
          {unit && (
            <div style={{ fontSize: 11, color: theme.text }}>
              <Label>Unit present</Label>
              <div style={{ marginTop: 4, fontWeight: 700, color: ownerColor(unit.owner) }}>
                {unit.name} — {FACTIONS[unit.owner].name}
              </div>
            </div>
          )}
        </div>
      </Panel>
    );
  }

  // location
  const loc = LOCATIONS[hex.locationId];
  const control = hex.control;
  const ctrl = fullController(control.sections);
  const hasCapital = control.chips.includes("capital");
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const yourUnitHere = unit && unit.owner === state.youId;
  const hasNeutral = control.sections.includes("neutral");
  const contestable = yourUnitHere && ctrl !== state.youId;

  let footholdText;
  if (!ctrl) {
    footholdText = "Inactive — no player holds all three sections.";
  } else if (hasCapital) {
    footholdText = `Capital installed — this location cannot decay.`;
  } else {
    footholdText = `+${control.foothold} of ${control.footholdCap}. Rises while the holder's unit garrisons here, falls when it leaves.`;
  }

  return (
    <Panel title={`Location — ${loc.name}`} scroll style={{ height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <LocationCard locationId={hex.locationId} control={control} width={242} />
        </div>

        <Divider />

        <div>
          <Label>Control</Label>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <ControlMeter
              sections={control.sections}
              foothold={control.foothold}
              footholdCap={control.footholdCap}
              size={84}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              {control.sections.map((owner, i) => (
                <SectionRow key={i} idx={i} owner={owner} />
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label>Foothold</Label>
          <div style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.45, marginTop: 4 }}>
            {footholdText}
          </div>
        </div>

        {unit && (
          <div>
            <Label>Unit on tile</Label>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: ownerColor(unit.owner),
                marginTop: 4,
              }}
            >
              {unit.name} — Strength {unitEffective(unit).strength}
              {unit.owner === state.youId ? " (yours)" : ""}
            </div>
          </div>
        )}

        {contestable && (
          <div>
            <Divider style={{ marginBottom: 12 }} />
            <Label style={{ marginBottom: 8 }}>
              Contest {hasNeutral ? "— attack the garrison" : "— capture a section"}
            </Label>
            <ContestPanel
              attacker={{ name: unit.name, strength: unitEffective(unit).strength }}
              defender={{
                name: hasNeutral ? "Garrison" : FACTIONS[ctrl]?.name || "Holder",
                value: garrisonStrength(hex.locationId, control),
              }}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}
