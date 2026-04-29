import { RAID_UNLOCK_ROUND } from "../engine/actions.js";
import { INTRIGUE_EFFECTS } from "../engine/intrigue.js";

const MODES = ["build", "explore", "raid", "intrigue"];

const LABELS = {
  build: "Build",
  explore: "Explore",
  raid: "Raid",
  intrigue: "Play Intrigue",
};

const HINTS = {
  build:
    "Spend 🔩 + 1⚡ to add a building from the Building Row to your settlement.",
  explore: "Spend 1⚡ to draw the top of the Exploration deck.",
  raid:
    "Spend 1⚡ to attack another player. Your ⚔ vs their 🛡 — defender wins ties.",
  intrigue: "Spend 1⚡ to play a card from your Intrigue hand.",
};

function canDo(mode, state, activePlayer) {
  if (!activePlayer) return { ok: false, reason: "no active player" };
  if (activePlayer.actionsRemaining < 1) return { ok: false, reason: "0⚡ remaining" };

  switch (mode) {
    case "build":
      if (activePlayer.settlement.length >= 5)
        return { ok: false, reason: "settlement full (5/5)" };
      if (state.buildingRow.length === 0)
        return { ok: false, reason: "Building Row empty" };
      return { ok: true };
    case "explore":
      if (state.globalFlags?.explorationBlocked)
        return { ok: false, reason: "exploration blocked (Minefield)" };
      if (activePlayer.skipExploreThisTurn)
        return { ok: false, reason: "skipping explore this turn (Ash Storm)" };
      if (state.explorationDeck.length === 0)
        return { ok: false, reason: "Exploration deck empty" };
      return { ok: true };
    case "raid":
      if (state.round < RAID_UNLOCK_ROUND)
        return { ok: false, reason: `raids unlock on Round ${RAID_UNLOCK_ROUND}` };
      if (state.globalFlags?.raidsBlocked)
        return { ok: false, reason: "raids blocked this round" };
      if (state.players.length < 2)
        return { ok: false, reason: "no opponents" };
      return { ok: true };
    case "intrigue": {
      const hand = activePlayer.intrigueHand ?? [];
      if (hand.length === 0) return { ok: false, reason: "empty hand" };
      const playable = hand.some(
        (c) => !c.immediate && INTRIGUE_EFFECTS[c.id],
      );
      if (!playable)
        return { ok: false, reason: "no playable cards (immediate-only)" };
      return { ok: true };
    }
    default:
      return { ok: false };
  }
}

export default function ActionModePicker({ state, activePlayer, mode, onModeChange }) {
  return (
    <section>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MODES.map((m) => {
          const check = canDo(m, state, activePlayer);
          const selected = mode === m;
          return (
            <button
              key={m}
              onClick={() => onModeChange(selected ? null : m)}
              disabled={!check.ok && !selected}
              title={check.ok ? HINTS[m] : check.reason}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 600,
                border: selected ? "2px solid #cdb673" : "1px solid #444",
                background: selected ? "#3a3520" : "#1f1f1f",
                color: check.ok || selected ? "#f5f5f5" : "#777",
              }}
            >
              {LABELS[m]}
            </button>
          );
        })}
      </div>
      {!mode ? (
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
          Pick what you'd like to do this turn — each costs 1⚡ Action.
          Boost ⚔/🛡 from your player panel; check your Settlement above for
          activated abilities and upgrades.
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {HINTS[mode]}
        </div>
      )}
    </section>
  );
}
