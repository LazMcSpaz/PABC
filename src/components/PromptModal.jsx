// Generic modal for any engine-emitted pendingPrompt whose playerId is
// a human. The AI driver auto-resolves its own prompts via heuristics
// registered in engine/prompts.js, so this component only renders when
// the current pendingPrompt belongs to a human player.

import { useEffect } from "react";
import ModalShell from "./ModalShell.jsx";

export default function PromptModal({ state, onResolve }) {
  const prompt = state?.pendingPrompt;
  const owner = prompt ? state.players.find((p) => p.id === prompt.playerId) : null;

  // Hide for AI prompts — the hook auto-resolves those.
  if (!prompt || owner?.kind !== "human") return null;
  // Peek-and-reorder has its own modal with a bespoke interaction.
  if (prompt.kind === "peek_reorder_choice") return null;

  return (
    <ModalShell
      zIndex={90}
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
        {owner?.name} — Decision required
      </div>
      {prompt.message ? (
        <div style={{ fontSize: 14, marginBottom: "0.75rem" }}>{prompt.message}</div>
      ) : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(prompt.options ?? []).map((opt) => (
          <OptionButton key={String(opt.value)} opt={opt} onResolve={onResolve} />
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: "0.75rem" }}>
        Prompt id: {prompt.kind}
      </div>
    </ModalShell>
  );
}

function OptionButton({ opt, onResolve }) {
  useEffect(() => () => {}, []);
  return (
    <button
      onClick={() => onResolve(opt.value)}
      title={opt.description ?? ""}
      style={{ padding: "6px 10px", fontSize: 13 }}
    >
      {opt.label}
    </button>
  );
}
