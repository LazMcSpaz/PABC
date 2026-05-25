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
import { Label, IconBtn, Btn } from "./kit.jsx";
import LocationCard from "./LocationCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import { previewLocationContest, previewAttackerStrength } from "./engineAdapter.js";

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

function locationModel(state, hex, actions) {
  const { isYourTurn, selectedUnitId, onSelectUnit, onContest, onActivate, onRecruit } = actions;
  const loc = LOCATIONS[hex.locationId];
  const control = hex.control;
  const ctrl = fullController(control.sections);
  const hasCapital = control.chips.includes("capital");
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const yourUnitHere = unit && unit.owner === state.youId;
  const hasNeutral = control.sections.includes("neutral");
  const claimed = control.sections.some((s) => s !== "neutral");
  const contestable = yourUnitHere && ctrl !== state.youId;
  const youControlHere = ctrl === state.youId;
  const hasTrainingGrounds = control.chips.includes("trainingGrounds");
  const yourUnitCount = Object.values(state.units).filter(
    (u) => u.owner === state.youId,
  ).length;
  const you = state.players[state.youId];

  let loyaltyText;
  if (!ctrl) {
    loyaltyText = "Inactive — no player holds all three sections.";
  } else if (hasCapital) {
    loyaltyText = "Capital installed — Loyalty is locked at full; this location cannot decay.";
  } else {
    const lv = control.loyalty ?? 0;
    const max = control.loyaltyMax ?? 8;
    loyaltyText = control.loyaltyDanger
      ? `Loyalty ${lv} of ${max} — failing. While garrisoned it climbs; left at 0 and neglected, one Control section peels to neutral each Upkeep.`
      : `Loyalty ${lv} of ${max}. Rises while the holder's unit garrisons here, falls when it leaves; Control only peels once Loyalty hits 0.`;
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
              loyalty={control.loyalty}
              danger={control.loyaltyDanger}
              size={96}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              {control.sections.map((owner, i) => (
                <SectionRow key={i} idx={i} owner={owner} />
              ))}
            </div>
          </div>
          <Field label="Loyalty">
            <div className="pc-prose" style={PROSE}>
              {loyaltyText}
            </div>
          </Field>
        </div>
      ),
    },
  ];

  // Unit details live in the floating UnitPanel (click the unit
  // token on the board) — the Inspector stays focused on the hex.

  if (contestable) {
    const preview = previewLocationContest(state.engineState, hex.id);
    const atkPreview = previewAttackerStrength(state.engineState, hex.id, unit.owner);
    const atkStr = atkPreview.total; // combined stack Strength + concentration
    const defVal = preview ? preview.value : garrisonStrength(hex.locationId, control);
    const defenderRolls = preview ? preview.defenderRollsDie : true;
    const enemyUnitHere = Object.values(state.units).find(
      (u) => u.node === hex.id && u.owner !== state.youId,
    );
    tabs.push({
      id: "contest",
      label: "Contest",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="pc-prose" style={PROSE}>
            {hasNeutral
              ? "Neutral sections still stand — the contest is forced onto the garrison. You must reduce it before you can raid any enemy unit here."
              : "Beat the holder to flip one of their sections to your control."}
          </div>
          <div style={{
            background: theme.panel2,
            border: `1px solid ${theme.border}`,
            borderRadius: 7,
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <Label>You (attacker)</Label>
              <div style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 14 }}>
                {unit.name}
                {atkPreview.units > 1 ? ` +${atkPreview.units - 1} stacked` : ""}
              </div>
              <div style={{ fontSize: 11, color: theme.textDim }}>{atkStr} + 1d6</div>
            </div>
            <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, color: theme.textFaint }}>VS</span>
            <div style={{ textAlign: "right" }}>
              <Label>Defender</Label>
              <div style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 14 }}>
                {preview && preview.defendingUnit
                  ? `${FACTIONS[ctrl]?.name || "Holder"} garrison + unit`
                  : "Garrison"}
              </div>
              <div style={{ fontSize: 11, color: theme.textDim }}>
                {defVal}{defenderRolls ? " + 1d6" : " (no roll)"}
              </div>
            </div>
          </div>
          <div className="pc-prose" style={{ ...PROSE, fontSize: 10.5 }}>
            {defenderRolls
              ? "Both sides add 1d6. Defender wins ties."
              : "A garrison with no defending unit adds no die — its total is fixed. Defender wins ties."}{" "}
            Clicking Contest rolls your d6 automatically and resolves at once.
            {hasNeutral && enemyUnitHere && (
              <> An enemy unit is also stationed here, but it only joins
              the defence once its faction fully controls the location.</>
            )}
          </div>
          {isYourTurn && (
            <Btn
              variant="primary"
              full
              onClick={() => onContest?.({ unit: unit.id })}
            >
              Contest (1 Action)
            </Btn>
          )}
        </div>
      ),
    });
  }

  if (youControlHere && (hex.abilityId || hasTrainingGrounds)) {
    tabs.push({
      id: "manage",
      label: "Manage",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {hex.abilityId && (
            <div>
              <Label>{control?.ability?.name || "Activate ability"}</Label>
              <div className="pc-prose" style={{ ...PROSE, marginBottom: 7 }}>
                {control?.ability?.text || `Invoke ${loc.name}'s ability.`}
              </div>
              <Btn
                variant="primary"
                full
                disabled={!isYourTurn || control?.abilityUsedThisTurn}
                onClick={() => onActivate?.(hex.id)}
              >
                {control?.abilityUsedThisTurn ? "Used this turn" : "Activate"}
              </Btn>
            </div>
          )}
          {hasTrainingGrounds && (
            <div>
              <Label>Recruit a unit</Label>
              <div className="pc-prose" style={{ ...PROSE, marginBottom: 7 }}>
                Costs 10 scrap + 1 Action. Cap {yourUnitCount + 1}.
              </div>
              <Btn
                variant="primary"
                full
                disabled={!isYourTurn || you.scrap < 10}
                onClick={() => onRecruit?.(hex.id)}
              >
                Recruit (10 scrap)
              </Btn>
            </div>
          )}
        </div>
      ),
    });
  }

  return {
    title: loc.name,
    subtitle: ctrl ? `Held — ${FACTIONS[ctrl]?.name || ctrl}` : claimed ? "Contested" : "Uncontrolled",
    tabs,
  };
}

function encounterModel(state, hex, actions) {
  const { isYourTurn, selectedUnitId, onSelectUnit } = actions;
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const cooldownUntil = state.engineState?.world?.encounterHexCooldowns?.[hex.id] || 0;
  const onCooldown = cooldownUntil > state.engineState.round;
  const tabs = [
    {
      id: "encounter",
      label: "Encounter",
      render: () => (
        <div className="pc-prose" style={PROSE}>
          {onCooldown ? (
            <>
              This encounter site is in cooldown — already drawn this run. It
              will refresh and deliver a new card starting on round{" "}
              <strong style={{ color: theme.accent }}>{cooldownUntil}</strong>.
            </>
          ) : (
            <>
              A unit that ends its Move here draws the top card of the
              encounter deck and resolves it — a challenge, a buff, or a
              setback. The site then enters a short cooldown before another
              card can be drawn.
            </>
          )}
        </div>
      ),
    },
  ];
  // Unit details live in the floating UnitPanel.
  return {
    title: "Encounter",
    subtitle: onCooldown ? `Cooldown — refreshes round ${cooldownUntil}` : "Unresolved",
    tabs,
  };
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

export default function Inspector({
  state,
  selectedHexId,
  selectedUnitId,
  isYourTurn,
  onClose,
  onSelectUnit,
  onContest,
  onActivate,
  onRecruit,
}) {
  const [active, setActive] = useState(0);

  // Every fresh selection starts on the first tab.
  useEffect(() => {
    setActive(0);
  }, [selectedHexId]);

  const hex = selectedHexId ? state.hexes[selectedHexId] : null;
  if (!hex) return null;

  const actions = { isYourTurn, selectedUnitId, onSelectUnit, onContest, onActivate, onRecruit };

  let model;
  if (hex.type === "location") model = locationModel(state, hex, actions);
  else if (hex.type === "encounter") model = encounterModel(state, hex, actions);
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
