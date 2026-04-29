export default function CardModal({ card, onClose }) {
  if (!card) return null;
  const rows = [
    ["Type", card.type],
    ["Age", card.age],
    ["Scrap cost", card.scrapCost],
    ["Attack cost / req", card.atkCost || card.reqAtk],
    ["Defense req", card.reqDef],
    ["Passive 🔩", card.passiveScrap],
    ["Passive ⚔", card.passiveAtk],
    ["Passive 🛡", card.passDef],
    ["Passive ⚡", card.passActions],
    ["VP", card.vp],
    ["Surprise", card.surprise ? "yes" : null],
    ["Immediate", card.immediate ? "yes" : null],
    ["Trigger", card.trigger],
    ["Progression track", card.progressionTrack],
  ].filter(([, v]) => v !== undefined && v !== null && v !== 0 && v !== "");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-shell"
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
          color: "#f5f5f5",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <h3 style={{ marginTop: 0 }}>{card.name}</h3>
        <table style={{ width: "100%", fontSize: 12 }}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ opacity: 0.65, paddingRight: 8 }}>{label}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {card.ability ? (
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.75 }}>Ability</div>
            <div>{card.ability.description}</div>
            <pre
              style={{
                fontSize: 10,
                opacity: 0.55,
                marginTop: 4,
                maxHeight: 160,
                overflow: "auto",
                background: "#1a1a1a",
                padding: 6,
                borderRadius: 4,
              }}
            >
              {JSON.stringify(card.ability, null, 2)}
            </pre>
          </div>
        ) : null}
        {card.flavor ? (
          <div style={{ marginTop: "0.75rem", fontStyle: "italic", opacity: 0.7 }}>
            {card.flavor}
          </div>
        ) : null}
        <button onClick={onClose} style={{ marginTop: "0.75rem" }}>
          Close
        </button>
      </div>
    </div>
  );
}
