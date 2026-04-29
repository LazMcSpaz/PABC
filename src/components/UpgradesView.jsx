import { useState } from "react";
import {
  canBuildUnique,
  getAvailableUniqueBuildingsFor,
} from "../engine/upgrades.js";

function reasonText(reason) {
  switch (reason) {
    case "actions":
      return "needs action";
    case "scrap":
      return "needs scrap";
    case "attack":
      return "needs attack";
    case "out-of-scope":
      return "not yours";
    default:
      return null;
  }
}

function UniqueRow({ u, state, activePlayer, onInspect, onPurchase }) {
  const check = canBuildUnique(state, activePlayer.id, u);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 8px",
        border: "1px solid #8a6a2e",
        borderRadius: 4,
        background: "#241a10",
      }}
    >
      <div style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>
          {u.name}{" "}
          <span style={{ opacity: 0.6, fontWeight: 400 }}>
            ({u.source === "narrative_chain" ? "narrative reward" : "progression unlock"})
          </span>
        </div>
        <div style={{ opacity: 0.75 }}>{u.ability?.description ?? ""}</div>
        <div style={{ opacity: 0.6, marginTop: 2 }}>
          Cost: {u.scrapCost}🔩 {u.atkCost ? `· req ⚔${u.atkCost}` : ""} · +{u.vp}★
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button onClick={() => onInspect(u)} style={{ fontSize: 11, padding: "2px 6px" }}>
          Info
        </button>
        <button
          onClick={() => onPurchase(u.uid)}
          disabled={!check.ok}
          title={!check.ok ? reasonText(check.reason) ?? "unavailable" : ""}
          style={{ fontSize: 12, padding: "4px 8px" }}
        >
          Build Unique
        </button>
      </div>
    </div>
  );
}

// Only unique buildings (narrative / progression unlocks) live here now.
// Standard upgrades render inline on parent buildings in MySettlementPanel.
export default function UpgradesView({
  state,
  activePlayer,
  onPurchaseUnique,
  onInspect,
}) {
  const [open, setOpen] = useState(false);
  const uniques = getAvailableUniqueBuildingsFor(state, activePlayer.id);
  const pending = state.unlocksPending ?? [];
  if (uniques.length === 0 && pending.length === 0) return null;

  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 13,
          padding: "4px 8px",
          background: "transparent",
          border: "1px solid #444",
          color: "#f5f5f5",
        }}
      >
        {open ? "▾" : "▸"} Unique Unlocks ({uniques.length})
      </button>
      {open ? (
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          {uniques.map((u) => (
            <UniqueRow
              key={u.uid}
              u={u}
              state={state}
              activePlayer={activePlayer}
              onInspect={onInspect}
              onPurchase={onPurchaseUnique}
            />
          ))}
          {pending.length > 0 ? (
            <div style={{ fontSize: 11, opacity: 0.55 }}>
              Pending unlocks: {pending.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
