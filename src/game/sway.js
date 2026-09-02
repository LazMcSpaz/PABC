// Sway — political capacity. Economy brief §6.
//
// THE FINDING THIS EXISTS FOR, which is the most decisive one in either brief:
// never let one fungible currency buy both economic output and political
// outcomes. Civ V's gold-for-city-states and Civ VI's Diplomatic Favor are the
// genre's two loudest "diplomacy feels bought" complaints, and players narrate
// the fix themselves — comparing envoys to gold, "I feel much rewarded and can
// pick which CSs match my objectives better than in V and it's not just about
// having huge piles of money laying around." Old World pays for diplomacy in
// Civics and Training specifically so that money cannot.
//
// The diplomacy brief has already closed the scrap->Standing pump. That leaves
// courtship unpriced, and the options are: leave it free (every faction courts
// everyone at once and the ladder is decorative), price it in scrap (reopening
// the hole just closed), or give political work its own currency.
//
// THE WALL HAS TO HOLD AT THE FAUCET, NOT ONLY THE SINKS. An earlier draft of
// the brief proposed a third slider channel converting Output into Sway at a
// published rate. That was wrong and the brief says so: Output becomes scrap
// through the same slider on the same turn, so a slider channel IS a
// scrap-to-Sway exchange rate set by the player, per city, every round —
// exactly the thing forbidden, dressed as a UI feature. Sway comes from the
// field, from a floor, and from the relationships you already hold. NOTHING
// CONVERTS. That wall is the point.
//
// WHY THE INCOME IS NOT PROPORTIONAL TO TERRITORY. The first draft made it
// `floor(dominated hexes / N)`. Measured across seven 29-round games that gave
// a typical faction 0-2 per round, the map leader 5-6, and the Croppers ONE
// SWAY ACROSS A WHOLE GAME. That is a rank-based INCOME, which is worse than a
// rank-based tax: the faction losing ground loses its only comeback
// instrument, a minor can never afford to be anyone's friend, and killing
// minors becomes mandatory. It was also a placement lottery — a capital seeded
// at the map edge dominates 4 hexes and floor(4/6) is zero, so a capital could
// produce no Sway at all — on top of the dominance cliff and a board-wide ZoC
// total that swings 50% round to round.
//
// So the income has three terms, counts in POINTS rather than floor-divided
// units, and caps the territorial share:
//
//   floor          every faction, always. The single change that keeps the
//                  diplomacy face open for minors and for the losing player.
//                  Not negotiable.
//   capped hexes   what makes the Influence field pay, and therefore what
//                  makes borders, Loyalty and the Beacon chain worth anything.
//                  Capped, so the leader's advantage is real but bounded.
//   agreements     diplomacy funds diplomacy — the comeback path and the
//                  anti-snowball. It also gives trading pacts a second reason
//                  to exist beyond `scrapPerUpkeep: 2`.
import { CONFIG } from "./config.js";
import { CHIPS, CAPITAL } from "./content.js";
import { emit } from "./events.js";

const S = () => CONFIG.sway;

let R = null;
export function registerSwayReaders(readers) { R = readers; }

// How many hexes `pid` currently dominates in the ZoC map.
export function dominatedHexes(state, pid) {
  const zoc = state.world?.zoc || {};
  let n = 0;
  for (const h in zoc) if (zoc[h] === pid) n += 1;
  return n;
}

// Chip `swayOutput`, summed over everything `pid` holds. The one new chip
// field this design adds; no chip sets it yet, and the reader is the schema of
// record the same way `INFLUENCE_CHIP_FIELDS` is.
function chipSway(state, pid) {
  let n = 0;
  for (const loc of Object.values(state.locations || {})) {
    if (loc.controller !== pid) continue;
    for (const c of loc.chips) {
      const inst = state.chips[c];
      if (!inst || inst.disabled) continue;
      const def = inst.chipId === "capital" ? CAPITAL : CHIPS[inst.chipId];
      n += def?.swayOutput || 0;
    }
  }
  return n;
}

/**
 * `pid`'s Sway income this round, itemised.
 *
 * Itemised rather than totalled because §11 asks for a Sway ledger with causes
 * always visible, the way the diplomacy brief asks for Standing — a political
 * income the player cannot break down is a number they cannot plan around, and
 * the territorial term in particular is invisible without it (the dominance
 * cliff means an extra point of Loyalty is worth 0 or 12 hexes and nothing in
 * between).
 */
export function swayIncome(state, pid) {
  const cfg = S();
  if (!cfg || !R) return { total: 0, floor: 0, hexes: 0, hexesCounted: 0, agreements: 0, chips: 0 };
  const hexes = dominatedHexes(state, pid);
  const counted = Math.min(hexes, cfg.hexCap);
  const agreements = R.agreementCount(state, pid);
  const chips = chipSway(state, pid);
  const parts = {
    floor: cfg.floor,
    hexes,
    hexesCounted: counted,
    hexTerm: counted * cfg.perHex,
    agreements,
    agreementTerm: agreements * cfg.perAgreement,
    chips,
  };
  parts.total = parts.floor + parts.hexTerm + parts.agreementTerm + parts.chips;
  return parts;
}

export function swayOf(state, pid) {
  return state.players[pid]?.sway || 0;
}

// Spend. Returns false and moves nothing when the pool is short — every caller
// has to decide what to do about that, because "the act silently did not
// happen" is how a currency becomes invisible.
export function spendSway(state, pid, amount, cause) {
  const p = state.players[pid];
  if (!p || amount <= 0) return true;
  if ((p.sway || 0) < amount) return false;
  p.sway -= amount;
  recordSway(state, pid, -amount, cause);
  emit(state, "sway_spent", { player: pid, amount, cause, left: p.sway });
  return true;
}

export function canAffordSway(state, pid, amount) {
  return (state.players[pid]?.sway || 0) >= amount;
}

/**
 * Could `pid` keep paying for `additional` more courtships?
 *
 * ONE RULE FOR BOTH SIDES, and that is the point of it being here rather than
 * in the AI and in the adapter separately. The first cut had the AI budgeting
 * against INCOME and the human's button gating on the POOL, which is a
 * different test wearing the same name: on round one the AI opened a courtship
 * while the human's Court button read "not enough Sway", because income had
 * not been paid yet. An asymmetric bar is exactly what the diplomacy brief
 * rejects, and the fact that this one arrived by accident rather than by
 * design is not a defence.
 *
 * A courtship is a RUNNING cost, so the question is not "can I pay once" but
 * "can I keep paying". Income is what a faction sustains indefinitely; the
 * pool is a buffer that lets it reach a little past its means for a while.
 * Half the FREE pool is that reach, and it is deliberately less than all of
 * it — a faction that spends its whole buffer on a second courtship drops both
 * the moment its income dips, which is a wasted act and a broken promise.
 */
export function canSustainCourtship(state, pid, additional = 1) {
  const cfg = S();
  if (!cfg || !R) return true;
  const running = R.courtingCount(state, pid);
  const committed = running * cfg.courtUpkeep;
  const need = committed + additional * cfg.courtUpkeep;
  const buffer = Math.max(0, swayOf(state, pid) - committed) * 0.5;
  return need <= swayIncome(state, pid).total + buffer;
}

/**
 * Seed the opening pool, at setup.
 *
 * Without this the game begins with every faction on zero and EVERY political
 * verb disabled for its whole first turn — income is paid at round end, so the
 * first Sway a player holds arrives on round 2. A dead first turn across a
 * whole layer reads as broken rather than as a rule, and it is not one: the
 * game starts at the beginning of round 1, so a faction should open it holding
 * a round's worth of political capacity, exactly as it holds its opening
 * scrap.
 *
 * Deliberately the same computation the round tick uses rather than a separate
 * starting constant, so the opening position cannot drift away from the income
 * rule the rest of the game runs on.
 */
export function seedSway(state) {
  const cfg = S();
  if (!cfg || !R) return;
  for (const pid of R.factionIds(state)) {
    const p = state.players[pid];
    if (!p) continue;
    const inc = swayIncome(state, pid);
    p.swayIncome = inc.total;
    p.sway = Math.min(cfg.cap, inc.total);
    recordSway(state, pid, p.sway, "opening position");
  }
}

// The ledger. Causes always visible, the way §11 asks — bounded like `repLog`.
const SWAY_LOG_MAX = 14;
function recordSway(state, pid, delta, cause) {
  const p = state.players[pid];
  if (!p || !delta) return;
  p.swayLog = p.swayLog || [];
  p.swayLog.push({ delta, cause: cause || null, round: state.round, value: p.sway });
  if (p.swayLog.length > SWAY_LOG_MAX) p.swayLog.splice(0, p.swayLog.length - SWAY_LOG_MAX);
}

export function swayLedger(state, pid) {
  return (state.players[pid]?.swayLog || []).slice().reverse();
}

/**
 * The round tick: pay income, then charge the standing costs, then cap.
 *
 * ORDER MATTERS. Income first so a faction can always pay for at least one
 * courtship out of the floor; the cap last so a faction sitting at the ceiling
 * is genuinely wasting income rather than being quietly refunded.
 *
 * The cap is a FLOW ceiling, not a war chest: Sway that has nowhere to go is
 * Sway you should have spent, and a pool that banks forever would recreate the
 * exact problem scrap has (§2.3 — a currency that never runs out stops being a
 * game system).
 */
export function tickSway(state) {
  const cfg = S();
  if (!cfg || !R) return;
  for (const pid of R.factionIds(state)) {
    const p = state.players[pid];
    if (!p || p.eliminated) continue;
    const inc = swayIncome(state, pid);
    p.swayIncome = inc.total;                 // surfaced for the ledger and the suite
    p.sway = (p.sway || 0) + inc.total;
    recordSway(state, pid, inc.total, "income");

    const spent = R.chargeSwayUpkeep(state, pid);
    if (spent) recordSway(state, pid, 0, "upkeep"); // the charge logs its own line

    const before = p.sway;
    p.sway = Math.min(p.sway, cfg.cap);
    if (p.sway !== before) {
      recordSway(state, pid, p.sway - before, "over the ceiling");
      emit(state, "sway_capped", { player: pid, wasted: before - p.sway, cap: cfg.cap });
    }
    emit(state, "sway_changed", { player: pid, value: p.sway, income: inc.total });
  }
}

export { recordSway };
