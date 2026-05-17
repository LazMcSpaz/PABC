// The Market Row — face-down upgrade chips on offer. Acquiring one
// costs 1 Action plus the chip's scrap cost.
import { ALL_UPGRADES, theme } from "./data.js";
import Chip from "./Chip.jsx";

export default function MarketRow({ state }) {
  const you = state.players[state.youId];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {state.market.map((chipId, i) => {
          const chip = ALL_UPGRADES[chipId];
          const affordable = you.scrap >= chip.cost && you.actions.remaining >= 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              <Chip chipId={chipId} width={92} dim={!affordable} />
              <button
                className="pc-int"
                disabled={!affordable}
                style={{
                  width: 92,
                  padding: "5px 0",
                  borderRadius: 6,
                  border: `1px solid ${affordable ? theme.borderLit : theme.border}`,
                  background: affordable ? theme.panel3 : theme.panel,
                  color: affordable ? theme.text : theme.textFaint,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: affordable ? "pointer" : "not-allowed",
                }}
              >
                Acquire
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: theme.textFaint, lineHeight: 1.4 }}>
        Acquiring a chip costs 1 Action plus its scrap cost, then installs it on one of
        your units or a location you hold. Hover a chip to reveal its effect.
      </div>
    </div>
  );
}
