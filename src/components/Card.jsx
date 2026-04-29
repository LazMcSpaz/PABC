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
      {(() => {
        const costBits = [];
        if (card.scrapCost) costBits.push(`${card.scrapCost}🔩`);
        if (card.reqAtk) costBits.push(`req ⚔${card.reqAtk}`);
        if (card.reqDef) costBits.push(`req 🛡${card.reqDef}`);
        if (card.atkCost && !card.reqAtk) costBits.push(`req ⚔${card.atkCost}`);
        const rewardBits = [];
        if (card.scrapReward) rewardBits.push(`+${card.scrapReward}🔩`);
        if (card.atkReward) rewardBits.push(`+${card.atkReward}⚔`);
        if (card.defReward) rewardBits.push(`+${card.defReward}🛡`);
        if (card.actionReward) rewardBits.push(`+${card.actionReward}⚡`);
        if (rewardBits.length === 0 && card.vp) rewardBits.push(`+${card.vp}★`);
        if (costBits.length === 0 && rewardBits.length === 0) return null;
        return (
          <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>
            {costBits.length > 0 ? (
              <div>
                <strong style={{ opacity: 0.9 }}>Cost:</strong> {costBits.join(" · ")}
              </div>
            ) : null}
            {rewardBits.length > 0 ? (
              <div>
                <strong style={{ opacity: 0.9 }}>Reward:</strong> {rewardBits.join(" · ")}
              </div>
            ) : null}
          </div>
        );
      })()}
      {card.ability?.description ? (
        <div style={{ fontSize: 11, opacity: 0.85, fontStyle: "italic" }}>
          {card.ability.description}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </button>
  );
}
