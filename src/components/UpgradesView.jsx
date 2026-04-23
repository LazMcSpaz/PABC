import { canUpgrade, getAvailableUpgradesFor } from "../engine/upgrades.js";

function reasonText(reason) {
  switch (reason) {
    case "parent":
      return "need parent building";
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

export default function UpgradesView({ state, activePlayer, onUpgrade, onInspect }) {
  const available = getAvailableUpgradesFor(state, activePlayer.id);
  if (available.length === 0 && (state.unlocksPending ?? []).length === 0) return null;

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Upgrades (Unlockable Deck)</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {available.map((u) => {
          const check = canUpgrade(state, activePlayer.id, u);
          const parent = activePlayer.settlement.find((b) => b.id === u.requires);
          return (
            <div
              key={u.uid}
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
                <div style={{ fontWeight: 600 }}>
                  {u.name}{" "}
                  <span style={{ opacity: 0.6, fontWeight: 400 }}>
                    (replaces {u.requires.replace(/_/g, " ")})
                  </span>
                </div>
                <div style={{ opacity: 0.75 }}>{u.ability?.description ?? ""}</div>
                <div style={{ opacity: 0.6, marginTop: 2 }}>
                  Cost: {u.scrapCost}🔩 {u.atkCost ? `· req ⚔${u.atkCost}` : ""} · +{u.vp}★
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button
                  onClick={() => onInspect(u)}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                >
                  Info
                </button>
                <button
                  onClick={() => onUpgrade(u.uid)}
                  disabled={!check.ok}
                  title={!check.ok ? reasonText(check.reason) ?? "unavailable" : ""}
                  style={{ fontSize: 12, padding: "4px 8px" }}
                >
                  Upgrade {parent ? `(${parent.name})` : ""}
                </button>
              </div>
            </div>
          );
        })}
        {(state.unlocksPending ?? []).length > 0 ? (
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            Unlocked but pending card data: {(state.unlocksPending ?? []).join(", ")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
