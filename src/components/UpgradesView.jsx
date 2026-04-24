import {
  canBuildUnique,
  canUpgrade,
  getAvailableUniqueBuildingsFor,
  getAvailableUpgradesFor,
} from "../engine/upgrades.js";

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

function UpgradeRow({ u, state, activePlayer, onInspect, onUpgrade }) {
  const check = canUpgrade(state, activePlayer.id, u);
  const parent = activePlayer.settlement.find((b) => b.id === u.requires);
  return (
    <div
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
        <button onClick={() => onInspect(u)} style={{ fontSize: 11, padding: "2px 6px" }}>
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

export default function UpgradesView({
  state,
  activePlayer,
  onUpgrade,
  onPurchaseUnique,
  onInspect,
}) {
  const upgrades = getAvailableUpgradesFor(state, activePlayer.id);
  const uniques = getAvailableUniqueBuildingsFor(state, activePlayer.id);
  const pending = state.unlocksPending ?? [];
  if (upgrades.length === 0 && uniques.length === 0 && pending.length === 0) return null;

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Unlockable Deck</h3>
      <div style={{ display: "grid", gap: 6 }}>
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
        {upgrades.map((u) => (
          <UpgradeRow
            key={u.uid}
            u={u}
            state={state}
            activePlayer={activePlayer}
            onInspect={onInspect}
            onUpgrade={onUpgrade}
          />
        ))}
        {pending.length > 0 ? (
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            Pending unlocks: {pending.join(", ")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
