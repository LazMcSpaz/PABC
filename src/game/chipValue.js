// The effect→value table (economy brief §10; v0.3-roadmap item 1, open since
// 2026-08-06).
//
// THE PROBLEM THIS EXISTS FOR. `pickBuild` scored six of forty-two authored
// chip fields: output, research, garrison, strength, unitCapBonus, upkeep.
// Everything else — every movement chip, every vision chip, the whole
// blockade kit, the influence chips, the Loyalty chips — was worth exactly
// zero to an AI deciding what to build. The measured consequence is in the
// playtest log: three of six factions ended a 15-round game with an empty tech
// wheel, and the Lakers sat on 36 unspent scrap.
//
// So this table is not a tuning pass. It is the difference between an AI that
// has opinions about content and one that can only see two columns of it.
//
// HOW TO ADD A FIELD. Author it in `content.js`, then add a row here. The
// economy audit's block 8 reads `VALUED_FIELDS` from this module and fails if
// any authored field is missing from it, so a new field cannot quietly ship
// invisible — which is exactly how the six-of-forty-two state was reached.
//
// WHAT THE NUMBERS MEAN. One point is one point of `output`. That is the only
// anchor, and it is enough: `pickBuild` compares chips against each other, not
// against an external scale, so what has to be right is the ORDER and roughly
// the ratios. A chip worth 3 should beat a chip worth 2 about as often as two
// output beats one.
import { CONFIG } from "./config.js";

// Fields that are structure, not effect — the audit skips these too.
export const NON_EFFECT_FIELDS = [
  "id", "name", "kind", "faction", "desc", "slots", "cost", "buildCost",
  "techLevel", "loyaltyReq", "upgradesTo", "upgradeFrom", "tags", "requires",
];

// A flat weight per point, for the fields whose value does not depend on the
// board. Anything whose worth DOES depend on where you are is in `contextual`
// below, and gets a reader instead of a number.
//
// The groupings, and why each is priced where it is:
//
//   ECONOMY (3/pt)      output and research are the compounding ones. They
//                       were already the top of the old table and they stay
//                       there; everything below is calibrated against them.
//   FIGHTING (1-2/pt)   strength and garrison buy one fight. Real, but they
//                       do not compound, and the old table's flat 1 for
//                       garrison undersold a chip that defends a city forever.
//   TEMPO (1.5-2/pt)    movement, actions and build rate buy TIME, which in a
//                       game decided on round 48 is worth about as much as a
//                       point of production. `turnStartMovement` is worth more
//                       than plain `movement` because it refreshes.
//   INFORMATION (1/pt)  vision and detection. Cheap per point, but this is the
//                       only category the AI had literally no term for, and
//                       fog is why half its blunders happen.
//   BOOLEANS            priced as a lump. A capability either exists or does
//                       not, so `true` is worth what having it is worth.
// Fields that pay EVERY ROUND, FOREVER, against fields that pay once. A flat
// points-per-point scale cannot tell those apart, and the first draft of this
// table did not try — with the result that a city would build a siege chip
// (2.5, once per fight) over a factory (2 output, every round for the rest of
// the game). Measured across the 15-seed suite: unresolved games went 3 -> 8
// with the table on and upgrades off, because the AI stopped compounding.
//
// So the per-round rows are multiplied by a horizon. It is NOT the number of
// rounds left — 60x would swamp every other consideration and build nothing
// but factories — it is "how many one-off effects is a permanent one worth",
// which is a judgement, and it lives in config so it can be swept.
const PER_ROUND = new Set(["output", "research", "buildRate", "upkeep", "standingDrift"]);

const FLAT = {
  // Economy
  output: 3,
  research: 3,
  buildRate: 2,
  recruitDiscount: 1.2,   // per point of discount, amortised over recruits
  reward: 1.5,            // an encounter chip that pays out at all
  // Fighting. DELIBERATELY BELOW `output` PER POINT, and the reason is worth
  // recording because getting it wrong cost a full evening. Garrison shipped
  // at 1.6 in the first draft, which put `defense-turrets` (garrison 2, 3.20)
  // one fifth of a point above `recyclers` (output 1, 3.00) — and that fifth
  // of a point rewrote the whole game. Measured on seed 1234 to round 25: the
  // AI built 23 turrets and 0 recyclers where it had built 39 recyclers, and
  // captures fell from 22 to 8. A defensive chip holds what you have; an
  // economic one buys what you do not. Price them in that order.
  strength: 1.6,
  garrison: 1,
  concentrationBonus: 1.2,
  concentrationCapBonus: 1,
  fortifyBonus: 0.9,
  retreatBonus: 0.6,
  siege: 2.5,
  veteranEquiv: 2,
  routSpillImmune: 1,
  healBonus: 1,
  healAnywhere: 1.5,
  // Tempo
  movement: 1.5,
  turnStartMovement: 2,   // refreshes; plain movement is a one-off pool
  actionBonus: 3,         // an extra Action is the scarcest thing in the game
  ignoresTerrain: 2,
  passThroughUnits: 1,
  safeConduct: 1.5,
  cheapReinforce: 1.5,
  // Information
  vision: 1,
  detection: 1,
  encounterRedraws: 1,
  blockadeVision: 1,
  blockadeDetection: 1,
  blockadeDefense: 1.2,
  postsWithoutTech: 2,
  // Politics
  standingDrift: 2.5,     // Standing has no other passive faucet; this is rare
  // Capacity. Priced flat here and given its FIRST-one-matters bonus in
  // `pickBuild`, where the reader knows whether the faction can recruit yet —
  // a second Training Grounds is worth a fraction of the first.
  unitCapBonus: 2,
  // Costs
  upkeep: -2,             // per point, per round, forever — the old -1 was light
  railIncompatible: -1,   // gives up the rail network
  techLevelReq: 0,        // a gate, not an effect; `buildableChips` enforces it
  statType: 0,            // names which stat a unit chip raises; the stat is
                          // already scored by `strength`/`movement`/`vision`
};

// Fields whose worth depends on the board, and a one-line reason each. A flat
// number for any of these would be wrong in both directions — a Loyalty chip
// on a city already at the ceiling is worth nothing, and the same chip on a
// contested border is worth more than a point of output.
const CONTEXTUAL = {
  // THE FIELD-AWARE INFLUENCE TERM. Dominance is a step function with a wide
  // dead zone: source under 6 dominates 1 hex, 6 to <12 dominates 7, 12+
  // dominates 19. So an influence chip is worth nothing at all in the middle
  // of a band and a great deal one point below a bar — and a flat weight
  // would price it at the average of those, which is a number that is never
  // right anywhere.
  localInfluence: (def, ctx) => {
    const gain = def.localInfluence || 0;
    if (!gain || !ctx?.loc) return gain * 0.5;
    const src = influenceSourceAt(ctx.state, ctx.loc);
    return gain * (crossesABar(src, src + gain) ? 3 : 0.4);
  },
  influenceRange: (def, ctx) => {
    // Range only pays where there is something to reach. On an interior city
    // it projects further into ground you already dominate.
    const gain = def.influenceRange || 0;
    return gain * (ctx?.contested ? 2.5 : 0.5);
  },
  // Loyalty: worth a lot below the Control line, nothing at the ceiling.
  loyaltyRise: (def, ctx) => valueOfLoyalty(def.loyaltyRise || 0, ctx),
  noLoyaltyDecay: (def, ctx) => valueOfLoyalty(1.5, ctx),
  garrisonErosion: (def, ctx) => (def.garrisonErosion || 0) * (ctx?.contested ? 2 : 0.6),
  // An activatable ability is worth what it grants, less what running it costs.
  activatable: (def) => Math.max(0.5, 2 - (def.activatable?.cost || 0) * 0.5),
};

// Every field this table has an opinion about, flat or contextual. The audit
// reads THIS, so the table and the assertion can never drift apart.
export const VALUED_FIELDS = [...Object.keys(FLAT), ...Object.keys(CONTEXTUAL)];

// --- the contextual readers ------------------------------------------

// Loyalty is worth the most where it is short. Above the Control line a
// further point buys nothing the city does not already have.
function valueOfLoyalty(gain, ctx) {
  const loy = ctx?.loc?.loyalty;
  if (loy == null) return gain * 1.2;
  const full = CONFIG.loyalty?.max ?? 10;
  if (loy >= full) return 0;
  // Steeper the further below the ceiling, and steeper again if the ground is
  // contested, because that is where Loyalty is also holding the border.
  return gain * (1 + (full - loy) / full * 1.5) * (ctx?.contested ? 1.4 : 1);
}

// What this Location currently projects. Read from the influence field if it
// has been computed, and from Loyalty otherwise — the AI is allowed to know
// its own city's Loyalty.
function influenceSourceAt(state, loc) {
  const v = state?.world?.influence?.[loc.hexId];
  if (typeof v === "number") return v;
  return loc.loyalty ?? 0;
}

// Does moving from `a` to `b` cross one of the dominance bars? The bars are
// the thresholds the step function turns on, which is where an extra point
// stops being decoration.
function crossesABar(a, b) {
  for (const bar of [6, 12]) if (a < bar && b >= bar) return true;
  return false;
}

// --- the table itself -------------------------------------------------

/**
 * What one chip is worth, in points of `output`.
 *
 * @param {object} def   the chip definition from content.js
 * @param {object} [ctx] board context: { state, loc, contested }
 */
export function chipValue(def, ctx = null) {
  if (!def) return 0;
  let total = 0;
  const horizon = CONFIG.ai?.compoundingWeight ?? 1;
  for (const [field, weight] of Object.entries(FLAT)) {
    const v = def[field];
    if (v == null || v === false) continue;
    const scale = PER_ROUND.has(field) ? horizon : 1;
    total += weight * scale * (v === true ? 1 : (typeof v === "number" ? v : 1));
  }
  for (const [field, reader] of Object.entries(CONTEXTUAL)) {
    if (def[field] == null || def[field] === false) continue;
    total += reader(def, ctx) || 0;
  }
  return total;
}

// What an UPGRADE is worth: the difference, not the destination. An AI that
// scored upgrades on the new chip's absolute value would rate every upgrade
// above every fresh build, because an upgrade target is by construction the
// better chip — and it would be paying full price for the delta.
export function upgradeValue(fromDef, toDef, ctx = null) {
  return chipValue(toDef, ctx) - chipValue(fromDef, ctx);
}
