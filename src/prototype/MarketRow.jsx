// The Market Row — face-down upgrade chips on offer. Acquiring one
// costs 1 Action plus the chip's scrap cost. The Acquire button picks
// the install target automatically (strongest legal unit / first
// controlled location with room); a future iteration could surface a
// chooser.
import { ALL_UPGRADES, theme } from "./data.js";
import { Btn } from "./kit.jsx";
import Chip from "./Chip.jsx";

export default function MarketRow({ state, isYourTurn, onAcquire }) {
  const you = state.players[state.youId];
  const items = state.marketChips || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
        {items.map((item, i) => {
          const chip = ALL_UPGRADES[item.chipId];
          if (!chip) return null;
          const affordable =
            you.scrap >= (chip.cost || 0) &&
            you.actions.remaining >= 1 &&
            isYourTurn;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
              <Chip chipId={item.chipId} width={92} dim={!affordable} />
              <Btn
                variant={affordable ? "primary" : "ghost"}
                size="sm"
                disabled={!affordable}
                full
                onClick={() => onAcquire?.(item)}
              >
                Acquire
              </Btn>
            </div>
          );
        })}
      </div>
      <div className="pc-prose" style={{ fontSize: 10.5, color: theme.textFaint, lineHeight: 1.45 }}>
        Acquiring a chip costs 1 Action plus its scrap cost, then installs it on one of
        your units or a location you hold. Hover a chip to reveal its effect.
      </div>
    </div>
  );
}
