import { getActiveBeats } from "../engine/narrative.js";

export default function NarrativeView({ state }) {
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Narrative Chains</h3>
      {state.players.map((p) => {
        const beats = getActiveBeats(state, p.id);
        return (
          <div key={p.id} style={{ fontSize: 12, opacity: 0.85 }}>
            <span style={{ color: p.color }}>{p.name}:</span>{" "}
            {beats.length === 0
              ? "no chains in progress"
              : beats.map(({ chain, beat }) => `${chain.name} (Beat ${beat.beat})`).join(", ")}
          </div>
        );
      })}
    </section>
  );
}
