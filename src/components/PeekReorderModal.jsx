import { useState } from "react";
import ModalShell from "./ModalShell.jsx";

// Renders only when the pending prompt is a peek_reorder_choice for a
// human player. Presents the peeked cards in top-to-bottom order with
// move-up / move-down buttons and (if mayDiscard) a per-card discard
// toggle. Submitting emits { order: [uid...], discardedUid? } to the
// engine's resumer.

export default function PeekReorderModal({ state, onResolve }) {
  const prompt = state?.pendingPrompt;
  const owner = prompt ? state.players.find((p) => p.id === prompt.playerId) : null;
  const isMine =
    prompt?.kind === "peek_reorder_choice" && owner?.kind === "human";

  const initial = prompt?.context?.peeked?.map((c) => c.uid) ?? [];
  const [order, setOrder] = useState(initial);
  const [discardedUid, setDiscardedUid] = useState(null);

  // Reset local state when the prompt changes identity.
  const currentId = prompt?.id ?? null;
  const [seenId, setSeenId] = useState(currentId);
  if (currentId !== seenId) {
    setOrder(initial);
    setDiscardedUid(null);
    setSeenId(currentId);
  }

  if (!prompt || !isMine) return null;

  const ctx = prompt.context;
  const cardById = new Map((ctx.peeked ?? []).map((c) => [c.uid, c]));

  const move = (idx, delta) => {
    const copy = [...order];
    const target = idx + delta;
    if (target < 0 || target >= copy.length) return;
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setOrder(copy);
  };

  const visibleOrder = ctx.mayDiscard
    ? order.filter((uid) => uid !== discardedUid)
    : order;

  return (
    <ModalShell
      zIndex={95}
      variant="wide"
      overlayAlpha={0.72}
      ownerColor={owner?.color ?? "#666"}
    >
        <div
          style={{
            fontSize: 12,
            opacity: 0.65,
            marginBottom: 4,
            color: owner?.color,
          }}
        >
          {owner?.name} — Peek &amp; reorder
        </div>
        <div style={{ fontSize: 13, marginBottom: "0.75rem" }}>{prompt.message}</div>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 6 }}>
          Top of the deck is at the top of this list.
        </div>

        <div style={{ display: "grid", gap: 4, marginBottom: "0.75rem" }}>
          {visibleOrder.map((uid, idx) => {
            const card = cardById.get(uid);
            if (!card) return null;
            return (
              <div
                key={uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  border: "1px solid #444",
                  borderRadius: 4,
                  background: "#1f1f1f",
                }}
              >
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>
                    {idx + 1}. {card.name}
                  </div>
                  <div style={{ opacity: 0.7 }}>{card.type}{card.description ? ` — ${card.description}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === visibleOrder.length - 1}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  {ctx.mayDiscard ? (
                    <button
                      onClick={() =>
                        setDiscardedUid(discardedUid === uid ? null : uid)
                      }
                      style={{ fontSize: 11, padding: "2px 6px" }}
                    >
                      {discardedUid === uid ? "Keep" : "Discard"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {ctx.mayDiscard && discardedUid ? (
          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: "0.5rem" }}>
            Marked for discard: {cardById.get(discardedUid)?.name}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onResolve({ order, discardedUid })}
            style={{ padding: "6px 10px", fontSize: 13 }}
          >
            Confirm
          </button>
        </div>
    </ModalShell>
  );
}
