// The Market churns each turn — the rightmost face-up chip rotates
// to the bottom of its tier's deck and the top of the deck slides
// into the leftmost slot. Acquired chips don't return (they're
// installed elsewhere); the churn only shuffles the currently-offered
// catalogue so it never goes stale on a player who didn't get what
// they wanted last time.
import { emit } from "./events.js";

export function churnMarket(state) {
  if (state.winnerId) return;
  if (!state.market?.tiers) return;
  for (const [tierKey, tier] of Object.entries(state.market.tiers)) {
    if (!tier?.row || tier.row.length === 0) continue;
    if (!tier?.deck || tier.deck.length === 0) continue;
    const fallen = tier.row.pop();
    if (fallen != null) tier.deck.push(fallen);
    const drawn = tier.deck.shift();
    if (drawn != null) tier.row.unshift(drawn);
    emit(state, "market_churned", {
      tier: Number(tierKey),
      cycledOut: fallen,
      cycledIn: drawn,
    });
  }
}
