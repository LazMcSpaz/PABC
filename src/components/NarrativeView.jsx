export default function NarrativeView({ state }) {
  const progressed = Object.keys(state.narrativeState ?? {}).length;
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Narrative Chains</h3>
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {progressed === 0
          ? "No chains in progress yet."
          : `${progressed} player(s) have active beats.`}
      </div>
    </section>
  );
}
