import { NARRATIVE_CHAINS } from "../engine/cards.js";
import { getActiveBeats } from "../engine/narrative.js";

export default function NarrativeView({ state }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Narrative Chains</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {state.players.map((p) => {
          const active = getActiveBeats(state, p.id);
          const completed = (p.completedChains ?? []).map(
            (id) => NARRATIVE_CHAINS.find((c) => c.id === id)?.name ?? id,
          );
          return (
            <div key={p.id} style={{ fontSize: 12 }}>
              <span style={{ color: p.color, fontWeight: 600 }}>{p.name}:</span>{" "}
              {active.length === 0 && completed.length === 0 ? (
                <span style={{ opacity: 0.55 }}>no chains in progress</span>
              ) : (
                <>
                  {active.map(({ chain, beat }) => (
                    <span
                      key={chain.id}
                      style={{
                        marginRight: 8,
                        padding: "1px 6px",
                        border: "1px solid #444",
                        borderRadius: 3,
                        background: "#1f1f1f",
                      }}
                    >
                      {chain.name} · Beat {beat.beat} ({beat.name})
                    </span>
                  ))}
                  {completed.length > 0 ? (
                    <span style={{ opacity: 0.65 }}>
                      · completed: {completed.join(", ")}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
