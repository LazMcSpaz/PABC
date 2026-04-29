import { useState } from "react";
import { abilityMeta, canActivate } from "../engine/abilities.js";

function PartnerModal({ building, state, activePlayer, onConfirm, onCancel }) {
  const [partnerId, setPartnerId] = useState(null);
  const opponents = state.players.filter((p) => p.id !== activePlayer.id);
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
          minWidth: 300,
          color: "#f5f5f5",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{building.name}</h3>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: "0.5rem" }}>
          Choose a trading partner — they gain +1 Scrap.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opponents.map((p) => (
            <button
              key={p.id}
              onClick={() => setPartnerId(p.id)}
              style={{
                padding: "4px 8px",
                border: partnerId === p.id ? `2px solid ${p.color}` : "1px solid #444",
                background: "#1f1f1f",
                color: p.color,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: "0.75rem" }}>
          <button onClick={() => onConfirm({ partnerId })} disabled={partnerId == null}>
            Use
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function reasonText(reason) {
  switch (reason) {
    case "disabled":
      return "disabled";
    case "used-this-turn":
      return "used this turn";
    case "built-this-turn":
      return "just built — wait until next turn";
    case "actions":
      return "needs action";
    case "scrap":
      return "needs scrap";
    default:
      return null;
  }
}

export default function AbilitiesView({ state, activePlayer, onActivate }) {
  const [prompt, setPrompt] = useState(null);
  const activatable = activePlayer.settlement.filter((b) => abilityMeta(b.id));

  if (activatable.length === 0) return null;

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Activated Abilities</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {activatable.map((b) => {
          const meta = abilityMeta(b.id);
          const check = canActivate(state, activePlayer.id, b);
          const cost =
            meta.actionCost > 0
              ? `${meta.actionCost}⚡`
              : meta.scrapCost > 0
                ? `${meta.scrapCost}🔩`
                : "free";
          return (
            <div
              key={b.uid}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                border: "1px solid #333",
                borderRadius: 4,
                background: "#1f1f1f",
              }}
            >
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div style={{ opacity: 0.75 }}>{b.ability?.description}</div>
              </div>
              <button
                onClick={() => {
                  if (meta.requires === "partner") setPrompt(b);
                  else onActivate(b.uid, {});
                }}
                disabled={!check.ok}
                title={!check.ok ? reasonText(check.reason) ?? "unavailable" : ""}
                style={{ fontSize: 12, padding: "4px 8px" }}
              >
                Use ({cost})
              </button>
            </div>
          );
        })}
      </div>
      {prompt ? (
        <PartnerModal
          building={prompt}
          state={state}
          activePlayer={activePlayer}
          onCancel={() => setPrompt(null)}
          onConfirm={(opts) => {
            onActivate(prompt.uid, opts);
            setPrompt(null);
          }}
        />
      ) : null}
    </section>
  );
}
