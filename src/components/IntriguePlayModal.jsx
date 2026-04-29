import { useState } from "react";
import { INTRIGUE_EFFECTS } from "../engine/intrigue.js";

function modalShell(onClose, children) {
  return (
    <div
      onClick={onClose}
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
        className="modal-shell"
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
          color: "#f5f5f5",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function IntriguePlayModal({ card, state, activePlayer, onConfirm, onCancel }) {
  const [targetId, setTargetId] = useState(null);
  const [secondTargetId, setSecondTargetId] = useState(null);
  const [buildingUid, setBuildingUid] = useState(null);

  if (!card) return null;
  const entry = INTRIGUE_EFFECTS[card.id];
  if (!entry) {
    return modalShell(onCancel, (
      <>
        <h3>{card.name}</h3>
        <div style={{ opacity: 0.8, marginBottom: "0.5rem" }}>
          No engine handler wired yet. You can still discard it.
        </div>
        <button onClick={onCancel}>Close</button>
      </>
    ));
  }

  const opponents = state.players.filter((p) => p.id !== activePlayer.id);

  const canConfirm = (() => {
    switch (entry.requires) {
      case "target":
        return targetId != null;
      case "twoTargets":
        return targetId != null && secondTargetId != null && targetId !== secondTargetId;
      case "buildingTarget":
        return targetId != null && !!buildingUid;
      default:
        return true;
    }
  })();

  const buildOpts = () => {
    switch (entry.requires) {
      case "target":
        return { targetId };
      case "twoTargets":
        return { targetIds: [targetId, secondTargetId] };
      case "buildingTarget":
        return { targetId, buildingUid };
      default:
        return {};
    }
  };

  const target = opponents.find((p) => p.id === targetId);

  return modalShell(onCancel, (
    <>
      <h3 style={{ marginTop: 0 }}>Play {card.name}</h3>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: "0.75rem" }}>
        {card.ability?.description}
      </div>

      {entry.requires === "target" || entry.requires === "buildingTarget" ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Target player</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {opponents.map((p) => (
              <button
                key={p.id}
                onClick={() => setTargetId(p.id)}
                style={{
                  padding: "4px 8px",
                  border: targetId === p.id ? `2px solid ${p.color}` : "1px solid #444",
                  background: "#1f1f1f",
                  color: p.color,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {entry.requires === "twoTargets" ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Choose two distinct targets</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {opponents.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  if (targetId == null) setTargetId(p.id);
                  else if (secondTargetId == null && p.id !== targetId) setSecondTargetId(p.id);
                  else {
                    setTargetId(p.id);
                    setSecondTargetId(null);
                  }
                }}
                style={{
                  padding: "4px 8px",
                  border:
                    targetId === p.id || secondTargetId === p.id
                      ? `2px solid ${p.color}`
                      : "1px solid #444",
                  background: "#1f1f1f",
                  color: p.color,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            Selected: {[targetId, secondTargetId]
              .filter((x) => x != null)
              .map((id) => opponents.find((o) => o.id === id)?.name)
              .join(", ") || "none"}
          </div>
        </div>
      ) : null}

      {entry.requires === "buildingTarget" && target ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Which building?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {target.settlement.length === 0 ? (
              <span style={{ opacity: 0.6, fontSize: 12 }}>Target has no buildings</span>
            ) : (
              target.settlement.map((b) => (
                <button
                  key={b.uid}
                  onClick={() => setBuildingUid(b.uid)}
                  style={{
                    padding: "4px 8px",
                    border: buildingUid === b.uid ? "2px solid #e88" : "1px solid #444",
                    background: "#1f1f1f",
                    color: "#f5f5f5",
                  }}
                >
                  {b.name}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 6, marginTop: "0.75rem" }}>
        <button onClick={() => onConfirm(buildOpts())} disabled={!canConfirm}>
          Play
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </>
  ));
}
