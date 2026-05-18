// The Market Row — face-down upgrade chips on offer. Acquiring one
// costs 1 Action plus the chip's scrap cost.
import { ALL_UPGRADES, theme } from "./data.js";
import { Btn } from "./kit.jsx";
import Chip from "./Chip.jsx";

export default function MarketRow({ state }) {
  const you = state.players[state.youId];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
        {state.market.map((chipId, i) => {
          const chip = ALL_UPGRADES[chipId];
          const affordable = you.scrap >= chip.cost && you.actions.remaining >= 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
              <Chip chipId={chipId} width={92} dim={!affordable} />
              <Btn variant={affordable ? "primary" : "ghost"} size="sm" disabled={!affordable} full>
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
