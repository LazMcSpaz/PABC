import Card from "./Card.jsx";

export default function IntrigueView({ activePlayer, onInspect }) {
  const hand = activePlayer?.intrigueHand ?? [];
  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Intrigue Hand (max 3)</h3>
      {hand.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.6 }}>Empty hand</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hand.map((c) => (
            <Card key={c.uid} card={c} onClick={() => onInspect(c)} />
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
        Play effects pending — see src/engine/intrigue.js INTRIGUE_EFFECTS.
      </div>
    </section>
  );
}
