import { useState } from "react";
import { abilityMeta, canActivate } from "../engine/abilities.js";
import { canUpgrade, getAvailableUpgradesFor } from "../engine/upgrades.js";
import Card from "./Card.jsx";

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
        className="modal-shell modal-shell--narrow"
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
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

function abilityReason(reason) {
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
    case "not-your-turn":
      return "wait for your turn";
    default:
      return null;
  }
}

function upgradeReason(reason) {
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

export default function MySettlementPanel({
  state,
  activePlayer,
  onInspect,
  onActivate,
  onUpgrade,
}) {
  const [partnerPrompt, setPartnerPrompt] = useState(null);

  if (!activePlayer) return null;

  const disabled = new Set(activePlayer.disabledBuildingUids ?? []);
  const builtThisTurn = new Set(activePlayer.builtThisTurnUids ?? []);
  const upgrades = getAvailableUpgradesFor(state, activePlayer.id);
  const upgradeFor = (building) =>
    upgrades.find((u) => u.requires === building.id);

  const renderEntry = (entry, opts = {}) => {
    const { isLeader = false } = opts;
    const meta = abilityMeta(entry.id);
    const isDisabled = disabled.has(entry.uid) || (isLeader && entry.disabled);
    const justBuilt = builtThisTurn.has(entry.uid);
    const upgrade = !isLeader ? upgradeFor(entry) : null;

    const actionButtons = [];
    if (meta) {
      const check = canActivate(state, activePlayer.id, entry);
      const cost =
        meta.actionCost > 0
          ? `${meta.actionCost}⚡`
          : meta.scrapCost > 0
            ? `${meta.scrapCost}🔩`
            : "free";
      actionButtons.push(
        <button
          key="use"
          onClick={(e) => {
            e.stopPropagation();
            if (meta.requires === "partner") setPartnerPrompt(entry);
            else onActivate(entry.uid, {});
          }}
          disabled={!check.ok}
          title={!check.ok ? abilityReason(check.reason) ?? "unavailable" : ""}
          style={{ fontSize: 11, padding: "3px 6px" }}
        >
          Use ({cost})
        </button>,
      );
    }
    if (upgrade) {
      const check = canUpgrade(state, activePlayer.id, upgrade);
      const tooltip = upgrade.ability?.description
        ? `${upgrade.ability.description} — Upgrade for ${upgrade.scrapCost ?? 0}🔩${upgrade.atkCost ? ` (req ⚔${upgrade.atkCost})` : ""}`
        : `Upgrade to ${upgrade.name} (${upgrade.scrapCost ?? 0}🔩)`;
      actionButtons.push(
        <button
          key="upgrade-info"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(upgrade);
          }}
          title={`Inspect ${upgrade.name}`}
          style={{ fontSize: 11, padding: "3px 6px" }}
        >
          ⓘ
        </button>,
      );
      actionButtons.push(
        <button
          key="upgrade"
          onClick={(e) => {
            e.stopPropagation();
            onUpgrade(upgrade.uid);
          }}
          disabled={!check.ok}
          title={!check.ok ? upgradeReason(check.reason) ?? "unavailable" : tooltip}
          style={{ fontSize: 11, padding: "3px 6px" }}
        >
          → {upgrade.name} ({upgrade.scrapCost ?? 0}🔩)
        </button>,
      );
    }

    const tag = isLeader ? "Leader" : "Building";
    const tagColor = isLeader ? "#cdb673" : "#7da";

    return (
      <div key={entry.uid} style={{ position: "relative" }}>
        <Card
          card={entry}
          onClick={() => onInspect(entry)}
          disabled={false}
          action={
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 4px",
                  border: `1px solid ${tagColor}`,
                  color: tagColor,
                  borderRadius: 2,
                }}
              >
                {tag}
              </span>
              {isDisabled ? (
                <span style={{ fontSize: 10, color: "#e88" }}>disabled</span>
              ) : null}
              {justBuilt ? (
                <span style={{ fontSize: 10, color: "#caa05a" }} title="Activated abilities lock this turn">
                  just built
                </span>
              ) : null}
              {actionButtons}
            </div>
          }
        />
      </div>
    );
  };

  const isEmpty = !activePlayer.leader && activePlayer.settlement.length === 0;

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>
        Your Settlement{" "}
        <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 400 }}>
          ({activePlayer.settlement.length}/5 buildings
          {activePlayer.leader ? " + leader" : ""})
        </span>
      </h3>
      {isEmpty ? (
        <div style={{ fontSize: 13, opacity: 0.6 }}>Empty settlement</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activePlayer.leader
            ? renderEntry(activePlayer.leader, { isLeader: true })
            : null}
          {activePlayer.settlement.map((b) => renderEntry(b))}
        </div>
      )}
      {partnerPrompt ? (
        <PartnerModal
          building={partnerPrompt}
          state={state}
          activePlayer={activePlayer}
          onCancel={() => setPartnerPrompt(null)}
          onConfirm={(opts) => {
            onActivate(partnerPrompt.uid, opts);
            setPartnerPrompt(null);
          }}
        />
      ) : null}
    </section>
  );
}
