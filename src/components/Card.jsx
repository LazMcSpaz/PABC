const cardStyle = {
  padding: "0.6rem",
  minWidth: 160,
  maxWidth: 220,
  background: "#2a2a2a",
  border: "1px solid #444",
  borderRadius: 6,
  textAlign: "left",
  color: "#f5f5f5",
  fontSize: 13,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

function Stat({ label, value }) {
  if (!value) return null;
  return <span>{label} {value}</span>;
}

export default function Card({ card, onClick, disabled, action }) {
  const stats = [
    <Stat key="s" label="🔩" value={card.scrapCost || card.passiveScrap} />,
    <Stat key="a" label="⚔" value={card.passiveAtk} />,
    <Stat key="d" label="🛡" value={card.passDef} />,
    <Stat key="act" label="⚡" value={card.passActions} />,
    <Stat key="vp" label="★" value={card.vp} />,
  ].filter(Boolean);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...cardStyle,
        opacity: disabled ? 0.5 : 1,
        borderColor: card.type === "Event" ? "#b33" : card.surprise ? "#c60" : "#444",
      }}
    >
      <div style={{ fontWeight: 600 }}>{card.name}</div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>
        {card.type}
        {card.age ? ` · Age ${card.age}` : ""}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>{stats}</div>
      {(card.reqAtk || card.reqDef || card.scrapReward || card.atkReward || card.defReward) ? (
        <div style={{ fontSize: 11, opacity: 0.75 }}>
          {card.reqAtk ? `req ⚔${card.reqAtk} ` : ""}
          {card.reqDef ? `req 🛡${card.reqDef} ` : ""}
          {card.scrapReward ? `+🔩${card.scrapReward} ` : ""}
          {card.atkReward ? `+⚔${card.atkReward} ` : ""}
          {card.defReward ? `+🛡${card.defReward} ` : ""}
          {card.actionReward ? `+⚡${card.actionReward} ` : ""}
        </div>
      ) : null}
      {card.ability?.description ? (
        <div style={{ fontSize: 11, opacity: 0.85, fontStyle: "italic" }}>
          {card.ability.description}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </button>
  );
}
