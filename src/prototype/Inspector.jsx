// The hex-detail drawer. Slides in from the right when a tile is
// selected; closes via the header button.
import {
  LOCATIONS,
  FACTIONS,
  fullController,
  ownerColor,
  garrisonStrength,
  unitEffective,
  theme,
} from "./data.js";
import { Panel, Label, Divider, IconBtn } from "./kit.jsx";
import LocationCard from "./LocationCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import ContestPanel from "./ContestPanel.jsx";

function CloseBtn({ onClose }) {
  return (
    <IconBtn onClick={onClose} title="Close">
      ✕
    </IconBtn>
  );
}

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
    <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
      Select a tile on the board to inspect it.
    </div>
  );
}

function locationBody(state, hex) {
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
    footholdText = "Capital installed — this location cannot decay.";
  } else {
    footholdText = `+${control.foothold} of ${control.footholdCap}. Rises while the holder's unit garrisons here, falls when it leaves.`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <LocationCard locationId={hex.locationId} control={control} width={250} />
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
  );
}

export default function Inspector({ state, selectedHexId, onClose }) {
  const hex = selectedHexId ? state.hexes[selectedHexId] : null;
  const close = <CloseBtn onClose={onClose} />;

  let title = "Inspector";
  let body = <Legend />;

  if (hex && hex.type === "terrain") {
    title = "Terrain Tile";
    body = (
      <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
        Open terrain. Units move through freely; nothing to contest here.
      </div>
    );
  } else if (hex && hex.type === "encounter") {
    title = "Encounter Tile";
    const unit = hex.unitId ? state.units[hex.unitId] : null;
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.5 }}>
          A unit that ends its Move here draws the top card of the encounter deck and
          resolves it — a challenge, a buff, or a setback. The tile is then spent.
        </div>
        {unit && (
          <div>
            <Label>Unit present</Label>
            <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: ownerColor(unit.owner) }}>
              {unit.name} — {FACTIONS[unit.owner].name}
            </div>
          </div>
        )}
      </div>
    );
  } else if (hex && hex.type === "location") {
    title = `Location — ${LOCATIONS[hex.locationId].name}`;
    body = locationBody(state, hex);
  }

  return (
    <Panel title={title} right={close} scroll style={{ height: "100%", width: "100%" }}>
      {body}
    </Panel>
  );
}
