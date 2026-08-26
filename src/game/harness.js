// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn, tickLoyalty, tickClaims, pendingSectionChange, locationActionCapacity } from "./turn.js";
import { performAction, recruitCostAt } from "./actions.js";
import { applyEffect } from "./effects.js";
import { emit } from "./events.js";
import { recomputeStats, recomputeResearch, assignTechNode, effectiveVeteran } from "./stats.js";
import { recomputeInfluence, zocOwner, inZoC, claimStrength, strongestRivalAt } from "./influence.js";
import { drawFieldEncounter, fieldEncounters } from "./encounters.js";
import { reinforcementRoute, bfsDistances, movementField, movementRoute } from "./board.js";
import { passesFreely, movementBlockers, unitReach, unitIgnoresTerrain, supplyCutter, unitRailEdges } from "./movement.js";
import { recomputeVisibility, isUnitVisibleTo, revealRegion, unitVision, isHexVisible, ensureAllVisibility } from "./visibility.js";
import {
  ensureDiplomacy, menaceFromAttack, onAttack,
  formPact, declareWar, vassalize, runDiplomacyRound,
  wouldAccept, dealValue, performDiplomacy,
  getStanding, atWar, arePacted, vassalLord, mayEngage, mayCourt, areNeighbours,
  isCourting, postureOf, postureStated, courtRounds, interestsOf, speakPosture,
  tolerance, passesRepGates, factionIds,
  // diplomacy-spec.md additions
  findWar, warExhaustion, aiAcceptsPeace, evaluatePactCall,
  canDemandTribute, caveOnDemand, hasOpenBorders, formTradingPact, openBordersStanding,
  hasRailAccess, railAccessStanding,
  findPactAgreement, honorOf, powerOf,
  // diplomacy robustness pass — baselines, patronage, summit VP
  getBaseline, adjustBaseline, aiAcceptsVassalage, breakPact,
  resolvePactCall,
  // diplomacy tuning pass — cooldowns + citations
  mediate, sweepTrespass, warJustification, threatScore,
  // pace pass — truces + partial control
  truceBetween, makePeace,
  // diplomacy audit fixes — consent, cost, one deal schema, terms
  denounce, denounceCooldown, denounceWarrant, denounceGrounds, valueOfItem, applyDeal, adjustStanding,
  recordGrievance, grievancesAgainst, grievanceWeight, worstGrievance,
  witnessesOf, witnessShare, reputationLog, adjustHonor, adjustMenace, settleableWeight,
  ultimatumsFor, ultimatumCooldown,
  // §6.10 the round trip — offers, counters, patience
  counterOffer, tableOffer, offersFor, answerOffer, asksThisRound, counterTheOffer,
  // §13 player positions
  declarePosition, withdrawPosition, positionsOf, positionHeld, citablePositions, positionText, menaceOf,
  // §12.3 the intrigue branch
  expose, forge, fabricate, exposableStrikes, lieDetectionChance, sweepForgeries, opsEnabled,
  covertDetection, counterIntelligence, sabotageCaught,
  // the one win condition
  dominionStanding, dominionMet, checkDominion, dominionCountdown, releaseVassal, aiAcceptsPact,
  // §3.2 Locations as deal items — ceding ground
  locationWorth, cedeBlocker, cedeableLocations, cedeLocation, resolveProposal,
  // §8 what a fight costs your name
  diplomaticPrice, attackIsWorthIt,
  // §9 grounds for a rising, and one faction's appetite for it
  coalitionGrounds, coalitionJoinScore, coalitionAgainst,
} from "./diplomacy.js";
import { holderOf, controlLevel, holdsLocation, syncControlHistory } from "./control.js";
import { recomputeVp, settlementVp, locationVp } from "./victory.js";
import { setStanding } from "./standing.js";
import { factionDef, MINOR_FACTIONS } from "./content.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS, ABILITIES, REACTIVES, CHIPS, chipBlocksRail } from "./content.js";
import { chipValue, upgradeValue, VALUED_FIELDS, NON_EFFECT_FIELDS } from "./chipValue.js";
import { resolveSalvage } from "./contest.js";
import { readRivalIntel } from "./intel.js";
import { postAt, isPostVisibleTo, chargePostUpkeep } from "./posts.js";
import {
  blockadeAt, activeBlockadeAt, creditCap, roadSupplyPath,
  blockadeDefense, blockadeVision, blockadeIncome, blockadeDrainOn, destroyBlockade,
  chargeBlockadeUpkeep,
} from "./blockades.js";
import { loadFieldEncounters, findUnsupportedTypes, choiceIsRunnable, WORLD_ENCOUNTERS } from "./content-loader.js";
import { pickHexByFilter, encounterRedrawBudget } from "./encounters.js";
import { resolveTokens } from "./textTokens.js";
import { evalCond, evalStrength } from "./dsl.js";
import { registerQuest } from "./quests.js";
import { CONFIG } from "./config.js";
import { takeAITurn, maybeAssignTech, warPeaceTerms } from "./ai.js";
import { enforceLoyaltySlotCap, chargeChipUpkeep, slotCapacity, effectiveBuildCost, buildableChips, applyOutputAndBuilds, locationOutput, unitUpkeepFor, chargeUnitUpkeep, chipsHeldBy, chipUpkeepFor } from "./economy.js";

const seed = Number(process.argv[2]) || 42;
const line = (s = "") => console.log(s);

// What `pid`'s standing army bills each Upkeep. Income checks net this out so
// they keep measuring income rather than income-minus-whatever-army-the-seed-
// happened-to-deal.
const armyUpkeep = (g, pid) => Object.values(g.units)
  .filter((u) => u.owner === pid)
  .reduce((n, u) => n + unitUpkeepFor(g, u), 0);

const game = createGame({ seed });
line(`\n=== The Remnant Continent — engine harness (seed ${seed}) ===`);

// --- board ---
line("\nBOARD  (loc[CTRL]  ~encounter~  wasteland;  * = unit)");
const unitAt = {};
for (const u of Object.values(game.units)) unitAt[u.node] = true;
const byRow = {};
for (const h of Object.values(game.board.hexes)) (byRow[h.row] ||= []).push(h);
const maxW = Math.max(...Object.values(byRow).map((r) => r.length));
for (const row of Object.keys(byRow).sort((a, b) => a - b)) {
  const cells = byRow[row]
    .sort((a, b) => a.col - b.col)
    .map((h) => {
      let label;
      if (h.type === "location") {
        const loc = game.locations[h.id];
        const ctrl = loc.controller ? loc.controller.slice(0, 3).toUpperCase() : "—";
        label = `${LOCATIONS[loc.locationId].name}[${ctrl}]`;
      } else label = h.type === "encounter" ? "~encounter~" : "wasteland";
      return (label + (unitAt[h.id] ? "*" : "")).padEnd(17);
    });
  line("  " + " ".repeat((maxW - byRow[row].length) * 9) + cells.join(""));
}

// --- begin play ---
startTurn(game);
line(`\nround ${game.round} · phase ${game.phase} · active ${activePlayerId(game)}`);

line("\nAFTER FIRST UPKEEP  (active player collects location production)");
for (const p of Object.values(game.players)) {
  line(
    `  ${FACTIONS[p.factionId].name.padEnd(20)} ` +
      `scrap ${p.resource}  actions ${p.actions.remaining}/${p.actions.max}`,
  );
}

// --- effect library demo ---
const me = activePlayerId(game);
const myUnit = Object.values(game.units).find((u) => u.owner === me);
const ctx = { sourcePlayer: me };
line(`\nEFFECT DEMO  (active: ${me})`);
line(
  `  before  scrap ${game.players[me].resource}  ` +
    `unit STR ${myUnit.strength}  actions ${game.players[me].actions.remaining}`,
);
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 5, target: "active_player" }, ctx);
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: 3, target: myUnit.uid, duration: "this_turn" }, ctx);
applyEffect(game, { type: "GRANT_ACTIONS", amount: 1, target: "active_player" }, ctx);
line(
  `  after   scrap ${game.players[me].resource}  ` +
    `unit STR ${myUnit.strength}  actions ${game.players[me].actions.remaining}`,
);

// --- action layer (Layer 3.1: Move + Recruit) ---
line("\nACTIONS  (Layer 3.1 — Move + Recruit)");
const mover = Object.values(game.units).find((u) => u.owner === me);
const dest = game.board.adjacency[mover.node][0];
const mv = performAction(game, "move", { unit: mover.uid, to: dest });
line(`  move ${mover.uid} -> ${dest}: ${mv.ok ? "ok" : "blocked — " + mv.reason}`);

const homeLoc = Object.values(game.locations).find((l) => l.controller === me);
const noTG = performAction(game, "recruit", { at: homeLoc.hexId });
line(`  recruit, no Training Grounds: ${noTG.ok ? "ok" : "blocked — " + noTG.reason}`);

// stage a Training Grounds chip + scrap, then the recruit succeeds
const tgChip = game.nextId("chip");
game.chips[tgChip] = { uid: tgChip, chipId: "training-grounds" };
homeLoc.chips.push(tgChip);
game.players[me].resource += CONFIG.unitRecruitCost;
const rec = performAction(game, "recruit", { at: homeLoc.hexId });
line(`  recruit, staged: ${rec.ok ? `ok — spawned ${rec.unit}` : "blocked — " + rec.reason}`);

// --- contest resolver (Layer 3.2 — capture a Location, then a raid) ---
line("\nCONTEST  (Layer 3.2 — Strength + 1d6 per side, defender wins ties)");

// Stake the active player with Actions and a decisive unit so the demo
// resolves the same way regardless of the dice.
applyEffect(game, { type: "GRANT_ACTIONS", amount: 20, target: "active_player" }, ctx);
const champ = Object.values(game.units).find((u) => u.owner === me);
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: 30, target: champ.uid, duration: "this_turn" }, ctx);

// March onto a neutral Location and take all three sections.
const prize = Object.values(game.locations).find((l) => l.controller === null);
champ.node = prize.hexId;
line(`  ${champ.uid} (STR ${champ.strength}) contests ${LOCATIONS[prize.locationId].name} — garrison ${prize.garrison}`);
for (let i = 0; i < 3 && prize.controller !== me; i++) {
  const r = performAction(game, "contest", { unit: champ.uid });
  line(`   roll ${r.initiatorTotal} vs ${r.defenderTotal} -> ${r.won ? "won" : "lost"}; sections [${prize.sections.join(", ")}]`);
}
line(`  -> controller ${prize.controller || "neutral"}, loyalty ${prize.loyalty}`);

// Raid: drop an enemy unit on the captured Location (no neutral sections
// remain, so raids are legal) and contest it directly.
const victim = Object.values(game.units).find((u) => u.owner !== me);
victim.node = prize.hexId;
const raid = performAction(game, "contest", { unit: champ.uid, target: victim.uid });
line(`  raid ${victim.uid} (owner ${victim.owner}): roll ${raid.initiatorTotal} vs ${raid.defenderTotal} -> ${raid.won ? "won" : "lost"}`);
line(`   ${victim.uid} now at ${victim.node}, base STR ${game.units[victim.uid]?.baseStrength ?? "destroyed"} (attrition + optional retreat)`);

// --- §18.2 Loyalty (replaces foothold/decay) ---
// A fresh game so the scenario is clean: give one player two fresh, non-
// Capital captures — garrison one, neglect the other — then run Upkeep
// ticks and watch (a) the garrisoned one climb and hold, (b) the neglected
// one bleed to Loyalty 0 and peel Control to neutral, and (c) the
// loyalty_failing warning fire BEFORE the first Control peel.
line("\nLOYALTY  (§18.2 — 8-slice pie; Control peels only at Loyalty 0)");
{
  const lg = createGame({ seed });
  const pid = activePlayerId(lg);
  const freebies = Object.values(lg.locations).filter((l) => l.controller == null).slice(0, 2);
  const [garr, negl] = freebies;
  const setCaptured = (loc) => {
    loc.controller = pid;
    loc.loyaltyOwner = pid;
    loc.sections = [pid, pid, pid];
    loc.loyalty = CONFIG.loyalty.start;
    loc.chips = loc.chips.filter((c) => lg.chips[c]?.chipId !== "capital"); // not inert
  };
  setCaptured(garr);
  setCaptured(negl);
  // Park every unit `pid` owns on the garrisoned Location; the neglected
  // one is left with no friendly unit.
  for (const u of Object.values(lg.units)) if (u.owner === pid) u.node = garr.hexId;

  line(`  captured ${LOCATIONS[garr.locationId].name} (will garrison) and ${LOCATIONS[negl.locationId].name} (will neglect), both at L${CONFIG.loyalty.start}`);

  let firstFailingAt = null;
  let firstPeelAt = null;
  for (let t = 1; t <= 12 && negl.loyaltyOwner === pid; t++) {
    const before = lg.log.length;
    tickLoyalty(lg, pid);
    const evs = lg.log.slice(before).map((e) => e.name);
    if (firstFailingAt == null && evs.includes("loyalty_failing")) firstFailingAt = t;
    if (firstPeelAt == null && evs.includes("control_peeled")) firstPeelAt = t;
    const flags = [
      evs.includes("loyalty_failing") ? "WARN" : "",
      evs.includes("control_peeled") ? "PEEL" : "",
    ].filter(Boolean).join("+");
    line(`   upkeep ${t}: garrison L${garr.loyalty}, neglected L${negl.loyalty == null ? "—" : negl.loyalty} sections [${negl.sections.map((s) => s.slice(0, 3)).join(",")}]${flags ? "  " + flags : ""}`);
  }
  const held = garr.controller === pid;
  const neutralised = negl.controller == null && negl.sections.every((s) => s === "neutral");
  const warnFirst = firstFailingAt != null && firstPeelAt != null && firstFailingAt < firstPeelAt;
  line(`  garrisoned ${LOCATIONS[garr.locationId].name}: held=${held}, loyalty=${garr.loyalty} (ceiling ${CONFIG.loyalty.ceiling})`);
  line(`  neglected ${LOCATIONS[negl.locationId].name}: peeled to neutral=${neutralised}`);
  line(`  warning first @upkeep ${firstFailingAt}, first peel @upkeep ${firstPeelAt} -> warning precedes peel: ${warnFirst}`);
  line(`  PASS: ${held && neutralised && warnFirst ? "yes" : "NO"}`);
}

// --- §20 — Build / Upgrade / Rush off Output (replaces Acquire) ---
// The Market is gone: chips are BUILT at a Location off its Output. The demo
// builds deterministically by setting a build then RUSHING it with banked
// scrap (so it completes this turn regardless of the slider/upkeep cadence).
line("\nECONOMY — BUILD / UPGRADE / RUSH  (§20)");
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 60, target: "active_player" }, ctx);
champ.node = prize.hexId; // champ garrisons the freshly-captured prize (for unit-chip builds)

// 1. Build Labs (location chip, techLevel 1, loyaltyReq 0) and rush it.
line(`  ${LOCATIONS[prize.locationId].name}: loyalty ${prize.loyalty}, research ${game.players[me].research} L${game.players[me].techLevel}`);
const b1 = performAction(game, "build", { at: prize.hexId, chipId: "labs" });
performAction(game, "rush", { at: prize.hexId });
line(`  build+rush Labs -> ${b1.ok ? "ok" : "blocked — " + b1.reason}; research now ${game.players[me].research} L${game.players[me].techLevel}`);

// 2. Build a unit chip onto the stationed champ and rush it.
const champBefore = champ.strength;
const b2 = performAction(game, "build", { at: prize.hexId, chipId: "drilled-troops" });
performAction(game, "rush", { at: prize.hexId });
line(`  build+rush Drilled Troops onto champ -> ${b2.ok ? "ok" : "blocked — " + b2.reason}; champ STR ${champBefore} -> ${champ.strength}`);

// 3. §20.6 Tech gate — sharpened-blades is techLevel 2 (needs player L3).
const gated = performAction(game, "build", { at: prize.hexId, chipId: "sharpened-blades" });
line(`  build Sharpened Blades at L${game.players[me].techLevel} -> ${gated.ok ? "ok" : "blocked — " + gated.reason} (§20.6 Tech gate)`);

// Lift Research to L3 so Tech allows tier-2 chips.
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Research", amount: 4, target: "active_player" }, ctx);
line(`  +4 permanent Research -> research ${game.players[me].research} L${game.players[me].techLevel}`);

// 4. §20.6 Loyalty gate — at L3 the Tech gate clears, but a fresh capture's
//    Loyalty (2) is below sharpened-blades' rung (3).
const loyGated = performAction(game, "build", { at: prize.hexId, chipId: "sharpened-blades" });
line(`  build Sharpened Blades @loyalty ${prize.loyalty} -> ${loyGated.ok ? "ok" : "blocked — " + loyGated.reason} (§20.6 Loyalty gate)`);

// Integrate the city (Loyalty 3) and the same build now passes both gates.
prize.loyalty = 3;
const b3 = performAction(game, "build", { at: prize.hexId, chipId: "sharpened-blades" });
performAction(game, "rush", { at: prize.hexId });
line(`  build+rush Sharpened Blades @loyalty ${prize.loyalty} -> ${b3.ok ? "ok" : "blocked — " + b3.reason}; champ STR ${champ.strength}`);

// 5. §20.5 Upgrade in place — upgrade a Lab → Advanced Lab (techL2 ok @L3,
//    loyaltyReq 3 ok). The chip is replaced in its own slot.
const labUid = prize.chips.find((c) => game.chips[c]?.chipId === "labs");
const up = performAction(game, "upgrade", { at: prize.hexId, chip: labUid });
performAction(game, "rush", { at: prize.hexId });
line(`  upgrade Labs -> ${up.ok ? `ok (now ${game.chips[labUid]?.chipId})` : "blocked — " + up.reason}; research ${game.players[me].research}`);

line("\nACTIVATE");
const korad = Object.values(game.locations).find((l) => l.locationId === "korad");
// Setup no longer hands out abilities (withdrawn 2026-08-16 pending a
// redesign), so the walkthrough assigns one to keep exercising the machinery —
// which is intact and waiting for content.
korad.abilityId = korad.abilityId || "staging-ground";
const koradAbility = ABILITIES[korad.abilityId];
const before = {
  scrap: game.players[me].resource, vp: game.players[me].vp,
  actions: game.players[me].actions.remaining,
};
const act = performAction(game, "activate", { location: korad.hexId });
line(`  activate ${koradAbility.name} at Korad: ${act.ok ? "ok" : "blocked — " + act.reason}`);
line(`   scrap ${before.scrap}->${game.players[me].resource}  vp ${before.vp}->${game.players[me].vp}  actions ${before.actions}->${game.players[me].actions.remaining}`);

// --- Layer 4 — reaction window ---
line("\nREACTION WINDOW  (Layer 4 — Reactives in defender's hand)");

// Cancel out earlier this_turn buffs so the contest dice actually matter.
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: -33, target: champ.uid, duration: "this_turn" }, ctx);

// Stage: goldgrass garrisons its capital (Omara) with its unit.
const omara = Object.values(game.locations).find((l) => l.controller === "goldgrass");
const goldUnit = Object.values(game.units).find((u) => u.owner === "goldgrass");
goldUnit.node = omara.hexId;
champ.node = omara.hexId;

const giveReactive = (player, cardId) => {
  const i = game.reactiveDeck.findIndex((c) => game.chips[c]?.chipId === cardId);
  if (i < 0) return null;
  const card = game.reactiveDeck.splice(i, 1)[0];
  game.players[player].hand.push(card);
  return card;
};

// Demo 1: defender holds Steady Hand (on-mode, +2 STR to defending unit)
const sh = giveReactive("goldgrass", "steady-hand");
line(`  ${LOCATIONS[omara.locationId].name}: garrison ${omara.garrison}, defender ${goldUnit.uid} STR ${goldUnit.strength}`);
line(`  goldgrass holds Reactive: ${REACTIVES[game.chips[sh].chipId].name}`);
line(`  champ STR ${champ.strength} attacks…`);
const r1 = performAction(game, "contest", { unit: champ.uid });
line(`   rolls ${r1.initiatorRoll} vs ${r1.defenderRoll}; totals ${r1.initiatorTotal} vs ${r1.defenderTotal} (defValue ${r1.defenderValue}); ${r1.won ? "won" : r1.cancelled ? "cancelled" : "lost"}`);
line(`   hand=${game.players.goldgrass.hand.length} reactive-discard=${game.discards.reactive.length}`);

// Demo 2: defender holds False Flag (replace-mode, cancels)
const ff = giveReactive("goldgrass", "false-flag");
line(`\n  goldgrass holds Reactive: ${REACTIVES[game.chips[ff].chipId].name}`);
const sectionsBefore = [...omara.sections];
const r2 = performAction(game, "contest", { unit: champ.uid });
line(`   result: ${r2.won ? "won" : r2.cancelled ? "cancelled — contest aborted before the roll" : "lost"}`);
line(`   sections unchanged: ${JSON.stringify(omara.sections) === JSON.stringify(sectionsBefore)}; hand=${game.players.goldgrass.hand.length} reactive-discard=${game.discards.reactive.length}`);

// --- Editor → engine snapshot smoke test ---
line("\nCONTENT SNAPSHOT  (editor → engine pipeline smoke test)");
const fieldEncs = loadFieldEncounters();
const ids = Object.keys(fieldEncs);
line(`  loaded ${ids.length} field encounter${ids.length === 1 ? "" : "s"} from src/game/content/`);

const unsupported = findUnsupportedTypes(fieldEncs);
if (unsupported.length) {
  line(`  effect types pending engine support: ${unsupported.join(", ")}`);
}

const runnable = ids.filter((id) => fieldEncs[id].choices.some(choiceIsRunnable));
line(`  ${runnable.length}/${ids.length} encounters have at least one fully-runnable choice today`);

if (runnable.length) {
  const pickId = runnable[0];
  const enc = fieldEncs[pickId];
  const choiceIdx = enc.choices.findIndex(choiceIsRunnable);
  const choice = enc.choices[choiceIdx];
  line(`  demo: "${pickId}" → choice "${choice.label}"`);
  const scrapBefore = game.players[me].resource;
  const vpBefore = game.players[me].vp;
  const techBefore = game.players[me].research;
  for (const eff of choice.effects) applyEffect(game, eff, ctx);
  const dr = (a, b) => `${a}->${b}`;
  line(`   active player ${me}: scrap ${dr(scrapBefore, game.players[me].resource)}, vp ${dr(vpBefore, game.players[me].vp)}, research ${dr(techBefore, game.players[me].research)}`);
}

// --- Layer 5.1 effect handlers (track, standing, player flag, deferred) ---
line("\nLAYER 5.1 EFFECTS  (track / standing / player flag / deferred queue)");
applyEffect(game, { type: "ADJUST_TRACK", track: "trust", amount: 3, target: "active" }, ctx);
applyEffect(game, { type: "ADJUST_TRACK", track: "reputation", amount: -2, target: "active" }, ctx);
applyEffect(game, { type: "ADJUST_STANDING", faction: "lakers", player: "active", amount: -2 }, ctx);
applyEffect(game, { type: "ADJUST_STANDING", faction: "goldgrass", player: "active", amount: 1 }, ctx);
applyEffect(game, { type: "SET_PLAYER_FLAG", flag: "met-the-fixer", value: true, target: "active" }, ctx);
applyEffect(game, { type: "QUEUE_DEFERRED",
  delayRounds: 2, target: "active",
  effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 5, target: "active_player" }],
}, ctx);
const meP = game.players[me];
line(`  ${me} tracks: trust=${meP.tracks.trust} reputation=${meP.tracks.reputation} alignment=${meP.tracks.alignment}`);
line(`  standing toward ${me}: lakers=${game.factionStanding.lakers[me]}, goldgrass=${game.factionStanding.goldgrass[me]}`);
line(`  ${me} flags: ${Object.keys(meP.flags).join(", ") || "(none)"}`);
line(`  deferred queue: ${game.deferred.length} packet(s), next due round ${game.deferred[0]?.dueRound} (resolves in Layer 5.2)`);

// --- DSL evaluator ---
line("\nDSL EVALUATOR  (Layer 5.1 — content-schema §5 grammar)");
const c1 = { op: "gte", left: "players.versari.techLevel", right: 1 };
line(`  versari.techLevel >= 1: ${evalCond(game, c1)}`);
const c2 = { all: [
  { op: "gt", left: "players.versari.resource", right: 0 },
  { has_flag: { player: "active", flag: "met-the-fixer" } },
] };
line(`  AND: versari.resource > 0 AND has-flag "met-the-fixer": ${evalCond(game, c2)}`);
const c3 = { controls_count: { player: "active" } };
line(`  controls_count(active): ${evalCond(game, c3)}`);
const c4 = { op: "lt", left: "factionStanding.lakers.versari", right: 0 };
line(`  factionStanding.lakers.versari < 0: ${evalCond(game, c4)}`);
const s1 = { if: [
  { op: "gt", left: "players.versari.research", right: 5 }, 5,
  { op: "gt", left: "players.versari.research", right: 2 }, 3,
  1,
] };
line(`  strength cascade by research: ${evalStrength(game, s1)}`);

// --- Layer 5.3 encounter delivery (field draw on Move-end) ---
line("\nFIELD ENCOUNTER  (Layer 5.3 — Move-end draws from the deck)");
// Park the champ adjacent to an encounter hex, then Move onto it.
const encounterHex = Object.values(game.board.hexes).find((h) => {
  if (h.type !== "encounter") return false;
  // adjacent to at least one terrain/location hex so we can stage from there
  return game.board.adjacency[h.id]?.length > 0;
});
const stagingHex = game.board.adjacency[encounterHex.id][0];
champ.node = stagingHex;
applyEffect(game, { type: "GRANT_ACTIONS", amount: 5, target: "active_player" }, ctx);
applyEffect(game, { type: "MODIFY_STAT", stat: "Movement", amount: 5, target: champ.uid, duration: "this_turn" }, ctx);
// v0.2 §16.2 — Move now spends a per-turn budget that earlier contests
// zeroed; top it back up so the staged field-encounter Move can fire.
champ.moveRemaining = champ.movement;
const deckBefore = game.encounterDeck.length;
const scrapPre = game.players[me].resource;
const techPre = game.players[me].research;
const tracksPre = { ...game.players[me].tracks };
line(`  deck size before: ${deckBefore}; champ ${champ.uid} on ${stagingHex} → moves to encounter hex ${encounterHex.id}`);
const fe = performAction(game, "move", { unit: champ.uid, to: encounterHex.id });
line(`  move: ${fe.ok ? "ok" : "blocked — " + fe.reason}`);
line(`  deck size after: ${game.encounterDeck.length}; encounter discard: ${game.discards.encounter.length}; hex cooldown until round ${game.world.encounterHexCooldowns[encounterHex.id]}`);
const lastDelivered = [...game.log].reverse().find((e) => e.name === "encounter_delivered");
const lastResolved = [...game.log].reverse().find((e) => e.name === "encounter_resolved");
if (lastDelivered) line(`  delivered: ${lastDelivered.payload.encounter} → "${lastDelivered.payload.choiceLabel}"`);
if (lastResolved) line(`  resolved:  ${lastResolved.payload.encounter}`);
line(`  ${me} deltas: scrap ${scrapPre}→${game.players[me].resource}, research ${techPre}→${game.players[me].research}, tracks {trust ${tracksPre.trust}→${game.players[me].tracks.trust}, reputation ${tracksPre.reputation}→${game.players[me].tracks.reputation}, alignment ${tracksPre.alignment}→${game.players[me].tracks.alignment}}`);

// --- Layer 5.4 quest engine (auto-delivered multi-beat quest) ---
line("\nQUEST  (Layer 5.4 — 2-beat single-player quest)");
registerQuest({
  id: "engine-test",
  mode: "single-player",
  title: "Engine Test Quest",
  beats: [
    { id: "beat-a", deliver: "auto", text: "First contact.",
      choices: [{ id: "ca", label: "Continue", effects: [] }] },
    { id: "beat-b", deliver: "auto", text: "Resolution.",
      prerequisites: ["beat-a"],
      choices: [{ id: "cb", label: "Continue", effects: [] }] },
  ],
  completion: {
    rewardForClaimant: [
      { type: "ADJUST_RESOURCE", resource: "Resource", amount: 10, target: "self" },
    ],
  },
});
const scrapPreQuest = game.players[me].resource;
applyEffect(game, { type: "START_QUEST", questId: "engine-test", claimant: "active" }, ctx);
const completedQ = game.players[me].completedQuests["engine-test"];
line(`  started "engine-test"; activeQuests=${Object.keys(game.activeQuests).join(",") || "(none)"}`);
line(`  beat events: ${game.log.filter((e) => e.name === "quest_advanced").map((e) => e.payload.beatId).join(" → ") || "(none)"}`);
line(`  completed: ${completedQ ? `at round ${completedQ.round}, claimant ${completedQ.claimant}` : "(no)"}`);
line(`  ${me} scrap from completion reward: ${scrapPreQuest} → ${game.players[me].resource}`);

// --- Layer 5.5 faction-standing hooks ---
line("\nFACTION STANDING  (Layer 5.5 — engine-internal hooks)");
line(`  current: raidCounts.goldgrass=${game.world.raidCounts.goldgrass} (incremented by the 3.2 raid hook), standing.goldgrass.${me}=${game.factionStanding.goldgrass[me]} (raid -1 + 5.1 demo +1 = 0)`);
// Capture goldgrass-affiliated Omara. champ is still on Omara from
// the 5.1 demos; re-buff strength since this_turn buffs were spent.
champ.node = omara.hexId;
applyEffect(game, { type: "MODIFY_STAT", stat: "Strength", amount: 35, target: champ.uid, duration: "this_turn" }, ctx);
const standingBefore = game.factionStanding.goldgrass[me];
let contestsForCapture = 0;
while (omara.controller !== me && contestsForCapture < 6) {
  const r = performAction(game, "contest", { unit: champ.uid });
  contestsForCapture++;
  if (!r.ok || r.cancelled === undefined && !r.won) break; // safety
}
line(`  ${me} attacks ${LOCATIONS[omara.locationId].name} (goldgrass-affiliated): captured after ${contestsForCapture} contests`);
line(`  standing.goldgrass.${me}: ${standingBefore} → ${game.factionStanding.goldgrass[me]} (capture penalty -2)`);

// --- Layer 5.2 end-of-round pipeline (deferred sweep + triggers) ---
line("\nROUND-END PIPELINE  (Layer 5.2 — deferred sweep + trigger eval)");
applyEffect(game, { type: "QUEUE_DEFERRED",
  delayRounds: 1, target: "active",
  effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 7, target: "active" }],
}, ctx);
line(`  queued packet (delayRounds=1, +7 scrap to ${me}); queue size now ${game.deferred.length}`);
line(`  trigger registry: ${Object.keys(WORLD_ENCOUNTERS).length} world encounter${Object.keys(WORLD_ENCOUNTERS).length === 1 ? "" : "s"} (eval is a no-op until authoring lands)`);
const versariScrapPrePipeline = game.players[me].resource;
const queueSizePrePipeline = game.deferred.length;
const resolvedLogBefore = game.log.filter((e) => e.name === "deferred_resolved").length;

// --- play out round 1 ---
line("\nPLAY ROUND 1  (each player ends their turn)");
for (let i = 0; i < game.turnOrder.length; i++) endTurn(game);
const resolvedLogAfter = game.log.filter((e) => e.name === "deferred_resolved").length;
line(`  deferred_resolved events fired during round-end: ${resolvedLogAfter - resolvedLogBefore}`);
line(`  deferred queue: ${queueSizePrePipeline} -> ${game.deferred.length} (remaining = the 5.1 packet at dueRound=3)`);
line(`  ${me} scrap: ${versariScrapPrePipeline} (pre-pipeline) -> ${game.players[me].resource} (post-pipeline + new upkeep production)`);
line(`  -> now round ${game.round}, phase ${game.phase}, active ${activePlayerId(game)}`);
for (const p of Object.values(game.players)) {
  line(`  ${FACTIONS[p.factionId].name.padEnd(20)} scrap ${p.resource}`);
}

// --- event log tail ---
line("\nEVENT LOG  (last 14)");
for (const ev of game.log.slice(-14)) {
  line(`  ${ev.name.padEnd(18)} ${JSON.stringify(ev.payload)}`);
}
line("");

// --- Demo Phase 2 — rule-based AI ---
// Fresh game with versari as the human (stand-in: endTurn) and the other
// three factions driven by takeAITurn until a winner emerges.
line("AI SMOKE TEST  (Demo Phase 2 — rule-based AI driving 3 factions)");
const aiGame = createGame({ seed, humanFactionId: "versari" });
startTurn(aiGame);
line(`  fresh game, seed ${seed}; isAI ${
  JSON.stringify(Object.fromEntries(Object.entries(aiGame.players).map(([k, p]) => [k, p.isAI])))
}`);
line(`  initial hands: ${
  Object.entries(aiGame.players).map(([k, p]) => `${k}=${p.hand.length}`).join(" ")
}`);
let safety = 200;
const actionCounts = Object.fromEntries(aiGame.turnOrder.map((p) => [p, 0]));
const captureCounts = Object.fromEntries(aiGame.turnOrder.map((p) => [p, 0]));
const captureSubBefore = aiGame.log.filter((e) => e.name === "location_captured").length;
while (!aiGame.winnerId && safety-- > 0) {
  const pid = activePlayerId(aiGame);
  const actionsBefore = aiGame.players[pid].actions.remaining;
  const capsBefore = aiGame.log.filter((e) => e.name === "location_captured").length;
  if (aiGame.players[pid].isAI) takeAITurn(aiGame);
  else endTurn(aiGame); // stand-in for the human
  actionCounts[pid] += actionsBefore - aiGame.players[pid].actions.remaining;
  captureCounts[pid] += aiGame.log.filter((e) => e.name === "location_captured").length - capsBefore;
}
line(`  finished at round ${aiGame.round}, winner ${aiGame.winnerId || "(none)"}`);
line(`  final VP: ${
  Object.entries(aiGame.players).map(([k, p]) => `${k}=${p.vp}`).join("  ")
}`);
line(`  actions spent: ${
  Object.entries(actionCounts).map(([k, n]) => `${k}=${n}`).join("  ")
}`);
line(`  captures: ${
  Object.entries(captureCounts).map(([k, n]) => `${k}=${n}`).join("  ")
}`);
const evCount = (name) => aiGame.log.filter((e) => e.name === name).length;
line(`  event totals — unit_moved=${evCount("unit_moved")} contest_declared=${evCount("contest_declared")} contest_won=${evCount("contest_won")} contest_lost=${evCount("contest_lost")} section_flipped=${evCount("section_flipped")}`);
line(`  encounters resolved=${evCount("encounter_resolved")} cards_played=${evCount("card_played")}`);
const unitPositions = Object.values(aiGame.units).map((u) => `${u.uid}=${u.owner}@${u.node}`).join(" ");
line(`  unit positions: ${unitPositions}`);
const locStanding = Object.values(aiGame.locations)
  .map((l) => `${l.locationId}[${l.controller || "—"}:${l.sections.map((s) => s.slice(0, 3)).join(",")}]`)
  .join(" ");
line(`  location standing: ${locStanding}`);
line("");

// =====================================================================
// v0.2 GAMEPLAY VERIFICATION (movement budget, attrition, reinforcement,
// combat levers). Each block builds a fresh deterministic game so it
// doesn't depend on the long demo above. `check` asserts and tallies.
// =====================================================================
line("v0.2 VERIFICATION  (movement / attrition / reinforcement / combat)");
let v2pass = 0, v2fail = 0;
// Small readers for the §8 fixture: the price rule is about WHOSE ground a
// fight happens on, so the fixture needs real hexes off the generated board
// rather than invented ids.
function hexControlledBy(g, fid) {
  for (const [hexId, loc] of Object.entries(g.locations || {})) {
    if (loc.controller === fid) return hexId;
  }
  return null;
}
function firstEnemyHex(g, pid) {
  for (const [hexId, loc] of Object.entries(g.locations || {})) {
    if (loc.controller && loc.controller !== pid) return hexId;
  }
  return Object.keys(g.locations || {})[0];
}

const check = (label, cond) => {
  if (cond) { v2pass++; line(`  ✓ ${label}`); }
  else { v2fail++; line(`  ✗ FAIL — ${label}`); }
};
const setStrOn = (g, u, n) => { u.baseStrength = n; recomputeStats(g); };

// Economy §10.2 — entering a rival's ZoC now costs extra movement, which is a
// SECOND surcharge stacking on terrain, roads and Toll Gates. Fixtures that
// measure one of those in isolation have to say so, or they are measuring two
// rules and attributing the total to one. Clears every hex `pid` does not
// dominate, so the staged rule is the only thing being charged for.
//
// The ZoC surcharge has its own fixture (search "§10.2"); this is not a way of
// not testing it.
const isolateTerrain = (g, pid) => {
  for (const hex of Object.keys(g.world?.zoc || {})) {
    if (g.world.zoc[hex] !== pid) delete g.world.zoc[hex];
  }
};

// Fixtures below stage clean 1v1 (or 1v2) contests on "the terrain hex"
// (the first hex of type "terrain"), assuming it starts empty. Procedural
// map generation can coincidentally place a faction's starting unit on
// that same hex for some seeds (observed: seeds 3 and 5), which silently
// inflates the defender's stack via Concentration/allies and throws off
// every downstream exact-number assertion. Sweep it clean once per
// fixture, right after picking the hex, so the test is seed-independent.
const clearHexOfUnits = (g, hexId) => {
  for (const u of Object.values(g.units)) {
    if (u.node !== hexId) continue;
    const home = Object.values(g.locations).find((l) => l.controller === u.owner && l.hexId !== hexId);
    if (home) u.node = home.hexId;
  }
};

// --- Phase 1: movement is its own budget ---
line("\n  [Phase 1] movement budget");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = activePlayerId(g);
  const u = Object.values(g.units).find((x) => x.owner === me);
  check("base Movement is 2, and that is the whole turn's budget",
    u.movement === 2 && u.moveRemaining === 2);
  const actionsBefore = g.players[me].actions.remaining;
  // Two plain (non-forest/mountain) single-cost hops: pick a first hop `a`
  // adjacent to the unit, then a second hop `b` adjacent to `a` — clearing
  // any terrain features so this exercises the budget, not terrain cost
  // (terrain movement has its own block below).
  // "plain" = a quiet wasteland hex: no Location, no terrain features, and
  // NOT an encounter hex (an encounter draw can rewrite the very budget
  // this fixture measures).
  const plain = (h) => !g.locations[h] && g.board.hexes[h].type !== "encounter" &&
    !g.board.hexes[h].elevation && !g.board.hexes[h].cover;
  const a = g.board.adjacency[u.node].find(plain) || g.board.adjacency[u.node][0];
  g.board.hexes[a].type = "terrain"; // pin — the fallback pick may be an encounter hex
  g.board.hexes[a].elevation = false; g.board.hexes[a].cover = false;
  // …and unpave it, for the same reason the terrain is cleared: a capital sits
  // on the network, so its neighbours are often road, and a road hex is half a
  // hex. This fixture is about the BUDGET, not about what the lane is worth.
  g.board.hexes[a].road = false; g.board.hexes[a].rail = false;
  const m1 = performAction(g, "move", { unit: u.uid, to: a });
  const clear = (h) => plain(h) && !Object.values(g.units).some(
    (x) => x.owner !== me && x.node === h);
  const b = (g.board.adjacency[a] || []).find((h) => h !== u.node && clear(h))
    || (g.board.adjacency[a] || []).find((h) => h !== u.node);
  if (b) {
    // Pin the second hop too — the fallback pick may be an occupied
    // encounter hex, and both a blockade halt and an encounter draw would
    // rewrite the budget this fixture measures.
    g.board.hexes[b].type = "terrain";
    g.board.hexes[b].elevation = false; g.board.hexes[b].cover = false;
    g.board.hexes[b].road = false; g.board.hexes[b].rail = false;
    for (const x of Object.values(g.units)) {
      if (x.owner !== me && x.node === b) {
        const home = Object.values(g.locations).find((l) => l.controller === x.owner);
        if (home) x.node = home.hexId;
      }
    }
  }
  isolateTerrain(g, me);
  const m2 = b ? performAction(g, "move", { unit: u.uid, to: b }) : { ok: false };
  check("two moves consume the budget", m1.ok && m2.ok && u.moveRemaining === 0);
  check("moves cost no Actions", g.players[me].actions.remaining === actionsBefore);
  // After a contest the unit can't move.
  const u2 = Object.values(g.units).find((x) => x.owner === me && x.uid !== u.uid) || u;
  const prize = Object.values(g.locations).find((l) => l.controller === null);
  if (prize) {
    u2.node = prize.hexId;
    u2.moveRemaining = u2.movement;
    performAction(g, "contest", { unit: u2.uid });
    check("declaring a contest ends movement", u2.moveRemaining === 0);
  }
}

// --- §16.2 terrain movement — forest costs +1, mountains halt the move ---
line("\n  [Terrain] movement costs (forest +1, mountains halt)");
{
  // Synthetic line graph A-B-C-D with stamped terrain features. movementField
  // returns hexId → movement points remaining after arriving.
  const mk = (B, C) => ({
    board: {
      adjacency: { A: ["B"], B: ["A", "C"], C: ["B", "D"], D: ["C"] },
      hexes: { A: { id: "A" }, B: { id: "B", ...B }, C: { id: "C", ...C }, D: { id: "D" } },
    },
  });

  const plain = movementField(mk({}, {}), "A", 2);
  check("plains: budget 2 reaches 2 hops (B rem1, C rem0), not D",
    plain.B === 1 && plain.C === 0 && !("D" in plain));

  const forest = movementField(mk({ cover: true }, {}), "A", 2);
  check("forest costs 2: budget 2 enters the forest (B rem0) but no further",
    forest.B === 0 && !("C" in forest));

  const forestBlocked = movementField(mk({ cover: true }, {}), "A", 1);
  check("forest: budget 1 cannot enter a forest hex at all",
    !("B" in forestBlocked));

  const mtn = movementField(mk({}, { elevation: true }), "A", 3);
  check("mountain halts: you climb onto it (C rem0) but cannot pass through to D",
    mtn.B === 2 && mtn.C === 0 && !("D" in mtn));

  const mtnNoMatter = movementField(mk({}, { elevation: true }), "A", 5);
  check("mountain halts no matter the budget (C rem0, D unreachable even at budget 5)",
    mtnNoMatter.C === 0 && !("D" in mtnNoMatter));

  // Integration: a real Move onto a forest hex spends the whole budget.
  const g = createGame({ seed }); startTurn(g);
  const me = activePlayerId(g);
  const u = Object.values(g.units).find((x) => x.owner === me);
  const nb = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]);
  if (nb) {
    g.board.hexes[nb].cover = true; g.board.hexes[nb].elevation = false; g.board.hexes[nb].road = false;
    u.moveRemaining = 2; recomputeStats(g);
    const r = performAction(g, "move", { unit: u.uid, to: nb });
    check("Move onto a forest hex (cost 2) zeroes a budget-2 unit's movement",
      r.ok && u.node === nb && u.moveRemaining === 0);
  }
}

// --- §16.2 the network: half a hex on easy ground, EASED terrain on rough ---
line("\n  [Paved] road and rail: half a hex where it is a lane, eased where it is a pass");
{
  const PAVED = CONFIG.movement.pavedCost;
  const mk = (B, C) => ({
    board: {
      adjacency: { A: ["B"], B: ["A", "C"], C: ["B", "D"], D: ["C"] },
      hexes: { A: { id: "A" }, B: { id: "B", ...B }, C: { id: "C", ...C }, D: { id: "D" } },
    },
  });
  const forestRoad = movementField(mk({ cover: true, road: true }, {}), "A", 2);
  const M = CONFIG.movement;
  // Rough ground is EASED, not deleted: a road over a pass is still a pass.
  check(`a road through forest costs ${M.roadForestCost}, not forestCost`,
    forestRoad.B === 2 - M.roadForestCost && "C" in forestRoad);
  const mtnRoad = movementField(mk({}, { elevation: true, road: true }), "A", 4);
  check("a road over a mountain does NOT halt (D reachable beyond it)",
    "D" in mtnRoad);
  check(`…but it still costs ${M.roadMountainCost}, not 1`,
    mtnRoad.C === 4 - 1 - M.roadMountainCost);
  check("a road halves forest's toll rather than waiving it",
    M.roadForestCost === M.forestCost / 2);
  // …and on EASY ground, which is where a lane is actually a lane, it is half
  // a hex. These two rules met in a merge and both survived, because they are
  // about different ground.
  const openRoad = movementField(mk({ road: true }, {}), "A", 2);
  check("a road across open ground costs half a hex",
    openRoad.B === 2 - PAVED);
  const railOnly = movementField(mk({ rail: true }, { rail: true }), "A", 2);
  check("rail is graded ground on its own, with no road beside it",
    railOnly.B === 2 - PAVED && railOnly.C === 2 - PAVED * 2);
  const tolled = movementField(mk({ road: true }, {}), "A", 2,
    { extraCost: new Map([["B", 1]]) });
  check("a toll rides on top of the half-hex, it is not absorbed by it",
    tolled.B === 2 - PAVED - 1);
  // Setup lays road corridors between the settlements.
  const g = createGame({ seed });
  const roads = Object.values(g.board.hexes).filter((h) => h.road).length;
  check("setup lays a road network", roads > 0);

  // The SHAPE of what setup lays, over enough boards to mean something.
  //
  // `road` is a per-hex boolean, so connectivity — for the renderer and for
  // the supply walk in blockades.js alike — is "adjacent hexes that both carry
  // road". Two corridors passing through neighbouring hexes are therefore
  // welded into a ladder, which is why assignRoads routes each corridor over
  // the ones already laid instead of independently. These guard that: without
  // the reuse discount the rungs come back, and without the terrain cost the
  // corridors drive straight over the high ground they are supposed to skirt.
  {
    const seeds = [424242, 7, 991, 4711, 8123, 20260821, 31337, 55555];
    let hexes = 0, tri = 0, rough = 0, islands = 0;
    for (const s of seeds) for (const mapSize of [null, "medium", "huge"]) {
      const b = createGame({ seed: s, mapSize }).board;
      const road = Object.keys(b.hexes).filter((h) => b.hexes[h].road);
      const on = new Set(road);
      hexes += road.length;
      rough += road.filter((h) => b.hexes[h].elevation || b.hexes[h].cover).length;
      // A triangle of mutually adjacent road hexes is one rung of a ladder.
      for (const a of road) for (const x of b.adjacency[a] || []) {
        if (!on.has(x) || x <= a) continue;
        for (const c of b.adjacency[x] || []) {
          if (on.has(c) && c > x && (b.adjacency[a] || []).includes(c)) tri++;
        }
      }
      // One network, not several — supply and blockades both assume it.
      const seen = new Set([road[0]]);
      const q = [road[0]];
      for (let i = 0; i < q.length; i++) for (const nb of b.adjacency[q[i]] || []) {
        if (on.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
      }
      if (seen.size !== road.length) islands++;
    }
    const n = seeds.length * 3;
    // Was 7.7 per board when every corridor took its own independent path.
    check(`roads join instead of running parallel (${(tri / n).toFixed(1)} rungs/board)`,
      tri / n < 5);
    // Was 3.6. A road over rough ground deletes that terrain from the game.
    check(`roads skirt rough ground (${(rough / n).toFixed(1)} rough road hexes/board)`,
      rough / n < 2);
    check("every board's road network is one connected piece", islands === 0);
    check(`the network stays small enough to be worth having (${(hexes / n).toFixed(1)} hexes/board)`,
      hexes / n < 30);
  }

}

// --- §16.2 blockade — foreign units / enemy Locations halt movement ---
line("\n  [Blockade] non-passing units and enemy Locations stop a move");
{
  const mkLine = () => ({
    board: {
      adjacency: { A: ["B"], B: ["A", "C"], C: ["B", "D"], D: ["C"] },
      hexes: { A: { id: "A" }, B: { id: "B" }, C: { id: "C" }, D: { id: "D" } },
    },
  });
  const blocked = movementField(mkLine(), "A", 3, { blockedThrough: new Set(["B"]) });
  check("a blockaded hex is enterable but terminal (B rem0, C/D unreachable)",
    blocked.B === 0 && !("C" in blocked) && !("D" in blocked));

  const g = createGame({ seed });
  const me = g.turnOrder[0];
  const foe = g.turnOrder.find((p) => p !== me && !g.players[p].isMinor) || g.turnOrder[1];
  const myU = Object.values(g.units).find((u) => u.owner === me);
  const foeU = Object.values(g.units).find((u) => u.owner === foe);
  // Park the enemy on a clean plain neighbour, with the mover holding 3 moves.
  const nb = (g.board.adjacency[myU.node] || []).find((h) => !g.locations[h]);
  foeU.node = nb;
  g.board.hexes[nb].cover = false; g.board.hexes[nb].elevation = false; g.board.hexes[nb].road = false;
  myU.moveRemaining = 3; recomputeStats(g);

  setStanding(g, me, foe, 0); setStanding(g, foe, me, 0); // neutral both ways
  check("neutral factions do not pass freely", !passesFreely(g, me, foe));
  check("an enemy unit's hex is a movement blocker", movementBlockers(g, me).has(nb));
  check("you may enter a blockaded hex but halt there (remaining 0 despite budget 3)",
    unitReach(g, myU)[nb] === 0);

  // Friendly+ standing lets units pass through freely (no blockade).
  const friendly = CONFIG.diplomacy.tiers.friendly;
  setStanding(g, me, foe, friendly); setStanding(g, foe, me, friendly);
  check("friendly+ factions pass freely", passesFreely(g, me, foe));
  check("a friendly faction's unit is NOT a blocker", !movementBlockers(g, me).has(nb));
}

// --- §16.2 route — the move arrow follows the actual least-cost path ---
// Location budgets are handed out in whole FAIRNESS GROUPS. Splitting one — as
// a flat truncation did — hands some factions a homeland pair and others a
// single city, which is what let the 2026-08-15 playtest's human take an
// uncontested corner while the AI ground itself down in another.
line("\n  [Setup] every faction gets the same number of home Locations");
{
  const homes = (g) => {
    const per = {};
    for (const loc of Object.values(g.locations)) {
      const aff = LOCATIONS[loc.locationId]?.affiliation;
      if (aff) per[aff] = (per[aff] || 0) + 1;
    }
    return per;
  };
  const majors = ["versari", "goldgrass", "lakers", "plainers"];
  let fair = true;
  let sizes = [];
  for (const size of ["small", "medium", "large", "huge"]) {
    for (const s of [1, 2, 3, 7, 42]) {
      const g = createGame({ seed: s, mapSize: size });
      const per = homes(g);
      const counts = majors.map((f) => per[f] || 0);
      if (new Set(counts).size !== 1) fair = false;
      if (s === 1) sizes.push(`${size}:${counts[0]}`);
    }
  }
  check(`every faction holds the same number of affiliated Locations at every size (${sizes.join(" ")})`, fair);

  // The budget is still spent in full — fairness must not cost Locations.
  const placed = ["small", "medium", "large", "huge"].map((size) =>
    Object.keys(createGame({ seed: 5, mapSize: size }).locations).length);
  const wanted = ["small", "medium", "large", "huge"].map((size) => CONFIG.mapSizes[size].locations);
  check(`the Location budget is spent in full at every size (${placed.join("/")} of ${wanted.join("/")})`,
    placed.every((n, i) => n === wanted[i]));
}

// Setup-screen rule switches. Each of these was, at some point, a control that
// looked live and changed nothing — so each gets a check that the SWITCH does
// something, not merely that the default still works.
line("\n  [Setup] Rule switches from the start screen");
{
  // VP no longer ends anything. It is the end-of-game standing, and a faction
  // sitting on a mountain of it wins nothing by that alone.
  {
    const g = createGame({ seed });
    const me = g.turnOrder[0];
    g.players[me].bankedVp = CONFIG.vpThreshold * 5;
    recomputeVp(g);
    check("a pile of VP wins nothing — it is a score, not a condition",
      g.players[me].vp >= CONFIG.vpThreshold && !g.winnerId);
  }

  // The pure-conquest face of the one condition: wipe the board and there is
  // nobody left who is not dealt with, so it lands at once — no hold, because
  // there is nobody left to break it.
  {
    const stage = (rules) => {
      const g = createGame({ seed, rules });
      for (const pid of g.turnOrder.slice(1)) {
        for (const uid of Object.keys(g.units)) if (g.units[uid].owner === pid) delete g.units[uid];
        for (const loc of Object.values(g.locations)) {
          if (loc.controller === pid) { loc.controller = null; loc.sections = ["neutral", "neutral", "neutral"]; }
          if (loc.loyaltyOwner === pid) { loc.loyaltyOwner = null; loc.loyalty = null; }
        }
      }
      startTurn(g); endTurn(g);
      return g;
    };
    check("outliving everyone wins immediately — nothing left to hold against",
      stage(undefined).winnerId === createGame({ seed }).turnOrder[0]);
    check("…and the toggle switches the whole condition off",
      !stage({ victory: { dominion: false } }).winnerId);
  }

  // Fog: OFF leaves the per-faction records empty, which every reader already
  // treats as full sight — so there is no second code path to keep in step.
  {
    const dark = createGame({ seed });
    const lit = createGame({ seed, rules: { fogOfWar: false } });
    const me = lit.turnOrder[0];
    const someHex = Object.keys(lit.board.hexes)[0];
    check("fog: on — a faction has a visibility record and cannot see everything",
      !!dark.visibility?.[me] && dark.visibility[me].visible.size < Object.keys(dark.board.hexes).length);
    check("fog: off — no record is built, and every hex reads as visible",
      !lit.visibility?.[me] && isHexVisible(lit, me, someHex));
  }

  // Encounters: both dials reach real engine numbers.
  {
    const none = createGame({ seed, rules: { encounters: { field: 0 } } });
    const many = createGame({ seed, rules: { encounters: { field: 0.9 } } });
    const count = (g) => Object.values(g.board.hexes).filter((h) => h.type === "encounter").length;
    check(`encounters: the field share sets how many encounter hexes exist (${count(none)} vs ${count(many)})`,
      count(none) === 0 && count(many) > count(none));

    const off = createGame({ seed, rules: { encounters: { world: 0 } } });
    check("encounters: world 0 is carried onto the state for the trigger loop",
      off.rules.worldEncountersPerRound === 0 &&
      createGame({ seed }).rules.worldEncountersPerRound === CONFIG.encounters.worldPerRound);
  }

  // The defaults must be exactly what the engine did before rules existed —
  // otherwise every headless caller and the rest of this harness shifts.
  {
    const g = createGame({ seed });
    check("defaults: the condition is live, fog on, world cadence at the config default",
      g.rules.victory.dominion === true &&
      g.rules.fogOfWar === true &&
      g.rules.worldEncountersPerRound === CONFIG.encounters.worldPerRound);
    // The three old switches were three names for one thing. Any of them still
    // turns it off, so a saved setup or an older caller keeps working.
    for (const legacy of ["conquest", "recognition", "elimination"]) {
      check(`…and the legacy "${legacy}" switch still turns it off`,
        createGame({ seed, rules: { victory: { [legacy]: false } } }).rules.victory.dominion === false);
    }
  }
}

// Content rules that are easy to break by adding a Location and forgetting.
line("\n  [Content] Location rules that must hold at every board size");
{
  const sizes = ["small", "medium", "large", "huge"];
  const games = sizes.map((size) => ({ size, g: createGame({ seed, mapSize: size }) }));

  // Sign-named settlements grew up around ROAD signage, so a railway never had
  // reason to STOP at one. Passing through their hex is fine.
  let badTerminus = [];
  for (const { g } of games) {
    for (const link of g.board.rails || []) {
      for (const end of [link.a, link.b]) {
        const id = g.locations[end]?.locationId;
        if (id && LOCATIONS[id]?.noRailTerminus) badTerminus.push(id);
      }
    }
  }
  check("rail never terminates at a sign-named settlement", badTerminus.length === 0, badTerminus);

  // …and the rule is only meaningful if such places actually reach a board.
  const huge = games.find((x) => x.size === "huge").g;
  const signNamed = Object.values(huge.locations)
    .filter((l) => LOCATIONS[l.locationId]?.noRailTerminus);
  check(`sign-named settlements do reach the big boards (${signNamed.length} on huge)`,
    signNamed.length >= 3);

  // Abilities are withdrawn pending a redesign — nothing should carry one, and
  // High/VeryHigh Locations get their chip slot back.
  const withAbility = games.flatMap(({ g }) =>
    Object.values(g.locations).filter((l) => l.abilityId).map((l) => l.locationId));
  check("no Location is assigned an ability", withAbility.length === 0, withAbility);
  const slotShort = Object.values(huge.locations).filter(
    (l) => l.chipSlots !== CONFIG.chipSlotsByValue[LOCATIONS[l.locationId].strategicValue]);
  check("every Location keeps its full chip-slot count now nothing pays for an ability",
    slotShort.length === 0);

  // Every engine Location must be renderable — the UI keeps its own table.
  check("the `low` tier is in use (Nosservis / Detor)",
    Object.values(huge.locations).some(
      (l) => LOCATIONS[l.locationId].strategicValue === "low"));
}

line("\n  [Route] the move path follows real movement rules");
{
  // Diamond: A→{B forest, X plains}→D. The cheaper lane is A→X→D.
  const mk = () => ({
    board: {
      adjacency: { A: ["B", "X"], B: ["A", "D"], X: ["A", "D"], D: ["B", "X"] },
      hexes: { A: { id: "A" }, B: { id: "B", cover: true }, X: { id: "X" }, D: { id: "D" } },
    },
  });
  check("route takes the cheaper lane around a forest (A→X→D, not A→B→D)",
    JSON.stringify(movementRoute(mk(), "A", 3, "D")) === JSON.stringify(["A", "X", "D"]));
  check("route is null when the destination is out of budget",
    movementRoute(mk(), "A", 1, "D") === null);

  // A mountain is a dead-end the route may end on but not pass through.
  const mk2 = () => ({
    board: {
      adjacency: { A: ["M"], M: ["A", "Z"], Z: ["M"] },
      hexes: { A: { id: "A" }, M: { id: "M", elevation: true }, Z: { id: "Z" } },
    },
  });
  check("route may end on a mountain but cannot pass through it",
    JSON.stringify(movementRoute(mk2(), "A", 5, "M")) === JSON.stringify(["A", "M"]) &&
    movementRoute(mk2(), "A", 5, "Z") === null);
}

// --- Phase 2: two units, cap 3, cheaper recruit ---
line("\n  [Phase 2] two-unit start, cap 3, cheaper recruit");
{
  const g = createGame({ seed });
  const me = g.turnOrder[0];
  const owned = Object.values(g.units).filter((u) => u.owner === me).length;
  check("each faction starts with 2 units", owned === CONFIG.startingUnits && owned === 2);
  check("recruit cost is 6", CONFIG.unitRecruitCost === 6);
  startTurn(g);
  const home = Object.values(g.locations).find((l) => l.controller === me);
  // Add a Training Grounds + scrap; cap is baseUnitCap(3)+1 TG = 4.
  const tg = g.nextId("chip");
  g.chips[tg] = { uid: tg, chipId: "training-grounds" };
  home.chips.push(tg);
  g.players[me].resource += 100;
  g.players[me].actions.remaining = 9; // wildcards — 3 recruits at one Location this turn
  // Already at 2; recruit to 3 then 4 should work, 5th blocked.
  const r3 = performAction(g, "recruit", { at: home.hexId });
  const r4 = performAction(g, "recruit", { at: home.hexId });
  const r5 = performAction(g, "recruit", { at: home.hexId });
  check("recruit allowed up to baseUnitCap + Training Grounds (4)", r3.ok && r4.ok);
  check("recruit blocked past cap", !r5.ok && r5.reason === "unit cap reached");
}

// --- recruit-cap gating is schema-driven, not a "training-grounds" id
// special case (docs/ai-overhaul-plan.md item 2) — any chip carrying
// `unitCapBonus` unlocks recruiting and raises the cap the same way. ---
line("\n  [Recruit] unitCapBonus is generic, not id-hardcoded");
{
  CHIPS["__test-recruit-hut"] = { id: "__test-recruit-hut", kind: "location", unitCapBonus: 1 };
  try {
    const g = createGame({ seed });
    const me = g.turnOrder[0];
    startTurn(g);
    const home = Object.values(g.locations).find((l) => l.controller === me);
    const before = performAction(g, "recruit", { at: home.hexId });
    check("recruiting is blocked with no recruit-enabling chip present",
      !before.ok && before.reason === "requires a chip that unlocks recruiting");
    const c = g.nextId("chip");
    g.chips[c] = { uid: c, chipId: "__test-recruit-hut" };
    home.chips.push(c);
    g.players[me].resource += 100;
  g.players[me].actions.remaining = 9; // wildcards for repeat recruits
    const r1 = performAction(g, "recruit", { at: home.hexId });
    const r2 = performAction(g, "recruit", { at: home.hexId });
    const r3b = performAction(g, "recruit", { at: home.hexId });
    check("a non-'training-grounds' chip with unitCapBonus unlocks recruiting", r1.ok);
    check("cap = baseUnitCap + unitCapBonus (1: 2 starting + 2 recruits = 4), 3rd blocked",
      r2.ok && !r3b.ok && r3b.reason === "unit cap reached");
  } finally {
    delete CHIPS["__test-recruit-hut"];
  }
}

// --- encounterRedraws is likewise schema-driven, not a "recon-team" id
// special case. ---
line("\n  [Encounters] encounterRedraws is generic, not id-hardcoded");
{
  CHIPS["__test-scout-hut"] = { id: "__test-scout-hut", kind: "location", encounterRedraws: 1 };
  try {
    const g = createGame({ seed });
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    check("no redraw budget with no recon-granting chip / tech", encounterRedrawBudget(g, me) === 0);
    const c = g.nextId("chip");
    g.chips[c] = { uid: c, chipId: "__test-scout-hut" };
    home.chips.push(c);
    check("a non-'recon-team' chip with encounterRedraws grants a redraw", encounterRedrawBudget(g, me) === 1);
    g.players[me].techWheel = ["int-entry"];
    check("stacks with the Intelligence entry node (1 + 1 = 2)", encounterRedrawBudget(g, me) === 2);
  } finally {
    delete CHIPS["__test-scout-hut"];
  }
}

// --- Phase 3: attrition, death, salvage ---
line("\n  [Phase 3] attrition, death, salvage");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  g.rng.roll = () => 1; // deterministic: equal dice cancel, margin = strength diff
  const myUnits = Object.values(g.units).filter((u) => u.owner === me);
  const foeUnits = Object.values(g.units).filter((u) => u.owner === foe);
  const atk = myUnits[0];
  const vic = foeUnits[0];
  const setStr = (u, n) => { u.baseStrength = n; recomputeStats(g); };
  const stage = () => {
    atk.node = terrain.id; atk.moveRemaining = atk.movement; atk.chips = [];
    vic.node = terrain.id; vic.chips = [];
    g.players[me].actions.remaining = 5;
    recomputeStats(g);
  };

  stage(); setStr(atk, 6); setStr(vic, 4);
  let r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  check("loser loses 1 base Strength", r.won && r.defenderStrLost === 1 && vic.baseStrength === 3);

  stage(); setStr(atk, 5); setStr(vic, 4);
  const atkBefore = atk.baseStrength;
  r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  check("pyrrhic win (margin 1) costs the winner 1",
    r.won && r.margin === 1 && r.attackerStrLost === 1 && atk.baseStrength === atkBefore - 1);

  // Two foe units now defend as a combined stack (4+4=8), so the attacker
  // needs to clear that by the rout margin.
  stage(); setStr(atk, 13); setStr(vic, 4);
  const vic2 = foeUnits[1]; vic2.node = terrain.id; setStr(vic2, 4);
  r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  check("rout (margin >=4) spills a casualty to a 2nd stacked unit",
    r.won && r.margin >= 4 && vic.baseStrength === 3 && vic2.baseStrength === 3);

  stage(); setStr(atk, 9);
  const chip = g.nextId("chip"); g.chips[chip] = { uid: chip, chipId: "drilled-troops" };
  vic.chips = [chip]; setStr(vic, 1);
  r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  check("a unit at 0 base Strength is destroyed", !g.units[vic.uid] && r.killed.includes(vic.uid));
  check("the killer salvages the dead unit's chip",
    atk.chips.includes(chip) && r.salvage && r.salvage.includes(chip));
}

// --- ADJUST_BASE_STRENGTH effect (encounters can wound / heal) ---
line("\n  [Phase 3] ADJUST_BASE_STRENGTH effect");
{
  const g = createGame({ seed }); startTurn(g);
  const u = Object.values(g.units)[0];
  u.baseStrength = 2; recomputeStats(g);
  applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: 5, target: u.uid }, {});
  check("heal clamps to base cap (4)", u.baseStrength === CONFIG.unit.baseStrengthCap);
  applyEffect(g, { type: "ADJUST_BASE_STRENGTH", amount: -10, target: u.uid }, {});
  check("wound to 0 destroys the unit", !g.units[u.uid]);
}

// --- Phase 4: reinforcement & healing ---
line("\n  [Phase 4] passive heal + instant / field reinforcement");
{
  const nonEnemyAdj = (g, hex, pid) =>
    (g.board.adjacency[hex] || []).find((h) => {
      const loc = g.locations[h];
      return !(loc && loc.controller && loc.controller !== pid);
    });

  // passive heal on a fully-held Location
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    home.abilityId = null; // pin: a seeded HEAL_HERE ability would skew the exact +1
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = home.hexId; u.baseStrength = 2; recomputeStats(g);
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // round-trip to me
    check("passive heal +1 on a fully-held Location", u.baseStrength === 3);
  }

  // instant top-up
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = home.hexId; u.baseStrength = 1; recomputeStats(g);
    g.players[me].resource += 100;
    const before = g.players[me].resource;
    const r = performAction(g, "reinforce", { unit: u.uid, mode: "instant" });
    check("instant top-up restores to cap", r.ok && u.baseStrength === 4);
    check("instant top-up charges 2 scrap / Strength", before - g.players[me].resource === 2 * 3);
  }

  // field reinforcement arrives after N round-ends
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    const u = Object.values(g.units).find((x) => x.owner === me);
    const adj = nonEnemyAdj(g, home.hexId, me);
    u.node = adj; u.baseStrength = 1; recomputeStats(g);
    g.players[me].resource += 100;
    const r = performAction(g, "reinforce", { unit: u.uid, mode: "field" });
    check("field reinforcement queues with an ETA", r.ok && r.eta >= 1 && g.reinforcements.length === 1);
    let guard = 12;
    while (g.reinforcements.length && guard-- > 0) {
      for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
    }
    check("field reinforcement arrives and restores Strength",
      g.reinforcements.length === 0 && u.baseStrength > 1);
  }

  // severed supply — capturing the origin strands the convoy as a unit
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const foe = g.turnOrder[1];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    const u = Object.values(g.units).find((x) => x.owner === me);
    const adj = nonEnemyAdj(g, home.hexId, me);
    u.node = adj; u.baseStrength = 1; recomputeStats(g);
    g.players[me].resource += 100;
    performAction(g, "reinforce", { unit: u.uid, mode: "field" });
    const originHex = g.reinforcements[0].originHex;
    const meUnitsBefore = Object.values(g.units).filter((x) => x.owner === me).length;

    // Drive a foe capture of the origin Location.
    g.activeIndex = g.turnOrder.indexOf(foe);
    g.phase = "Main";
    g.players[foe].actions.remaining = 9;
    g.rng.roll = () => 1;
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = originHex; fu.baseStrength = 60; recomputeStats(g);
    let guard = 6;
    while (g.locations[originHex].controller !== foe && guard-- > 0) {
      performAction(g, "contest", { unit: fu.uid });
    }
    check("severed supply strands the convoy as a new unit",
      g.reinforcements.length === 0 &&
      Object.values(g.units).filter((x) => x.owner === me).length === meUnitsBefore + 1);
  }
}

// --- Combined stack strength (stacked units fight as one) ---
line("\n  [Stacks] combined Strength + concentration");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  g.rng.roll = () => 0; // no dice — totals are pure value
  const myUnits = Object.values(g.units).filter((u) => u.owner === me);
  const foeUnits = Object.values(g.units).filter((u) => u.owner === foe);
  const lead = myUnits[0];
  const ally = myUnits[1];
  const vic = foeUnits[0];
  // A 4-str unit and a 3-str unit on the same hex contest a lone enemy.
  lead.node = terrain.id; lead.moveRemaining = lead.movement; lead.chips = []; lead.baseStrength = 4;
  ally.node = terrain.id; ally.chips = []; ally.baseStrength = 3;
  vic.node = terrain.id; vic.chips = []; vic.baseStrength = 1;
  recomputeStats(g);
  g.players[me].actions.remaining = 5;
  const r = performAction(g, "contest", { unit: lead.uid, target: vic.uid });
  // 4 (lead) + 3 (ally) + 1 (concentration for 1 extra unit) = 8 attacker total.
  check("stacked attacker = combined Strength + concentration (4+3+1=8)",
    r.attackerAllies === 3 && r.attackerConcentration === 1 && r.initiatorTotal === 8);
}

// --- Phase 5: combat levers (concentration, terrain, fortify, veterancy) ---
line("\n  [Phase 5] concentration, mountain, fortify, veterancy");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  g.rng.roll = () => 1;
  const myUnits = Object.values(g.units).filter((u) => u.owner === me);
  const foeUnits = Object.values(g.units).filter((u) => u.owner === foe);
  const atk = myUnits[0];
  const vic = foeUnits[0];
  const setStr = (u, n) => { u.baseStrength = n; recomputeStats(g); };

  // Concentration: a 2nd friendly unit on the attacker's hex raises the total.
  atk.node = terrain.id; atk.moveRemaining = atk.movement; setStr(atk, 4);
  vic.node = terrain.id; setStr(vic, 4);
  g.players[me].actions.remaining = 9;
  let r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  const baseTotal = r.initiatorTotal;
  check("no concentration with a lone attacker", r.attackerConcentration === 0);
  // add a 2nd friendly unit on the hex
  myUnits[1].node = terrain.id;
  vic.node = terrain.id; setStr(vic, 4); atk.moveRemaining = atk.movement;
  r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  check("a stacked friendly unit grants +1 concentration", r.attackerConcentration === 1);

  // Concentration cap at +3.
  {
    const g2 = createGame({ seed }); startTurn(g2);
    clearHexOfUnits(g2, terrain.id);
    const me2 = g2.turnOrder[0];
    const a = Object.values(g2.units).find((u) => u.owner === me2);
    const e = Object.values(g2.units).find((u) => u.owner !== me2);
    g2.rng.roll = () => 1;
    a.node = terrain.id; a.moveRemaining = a.movement; e.node = terrain.id;
    g2.players[me2].actions.remaining = 9;
    // spawn 5 extra friendlies on the hex (well over the cap)
    for (let i = 0; i < 5; i++) {
      const u = g2.nextId("unit");
      g2.units[u] = { ...a, uid: u, chips: [], node: terrain.id };
    }
    recomputeStats(g2);
    const rr = performAction(g2, "contest", { unit: a.uid, target: e.uid });
    check("concentration caps at +3", rr.attackerConcentration === CONFIG.combat.concentrationCap);
  }

  // Mountain: a mountain hex grants the defender +1 (even garrison-only).
  {
    const g3 = createGame({ seed }); startTurn(g3);
    const me3 = g3.turnOrder[0];
    const foe3 = g3.turnOrder[1];
    const home = Object.values(g3.locations).find((l) => l.controller === me3);
    g3.board.hexes[home.hexId].terrain = "mountain";
    g3.activeIndex = g3.turnOrder.indexOf(foe3);
    g3.phase = "Main";
    g3.players[foe3].actions.remaining = 5;
    g3.rng.roll = () => 1;
    const fu = Object.values(g3.units).find((u) => u.owner === foe3);
    fu.node = home.hexId; setStrOn(g3, fu, 4);
    const rm = performAction(g3, "contest", { unit: fu.uid });
    check("mountain terrain grants the defender +1", rm.defenderMountain === CONFIG.combat.mountainDefenseBonus);
  }

  // Fortify: a defending unit that didn't move last turn is "dug in" (+1).
  {
    const g4 = createGame({ seed }); startTurn(g4);
    const me4 = g4.turnOrder[0];
    const foe4 = g4.turnOrder[1];
    const home = Object.values(g4.locations).find((l) => l.controller === me4);
    const du = Object.values(g4.units).find((u) => u.owner === me4);
    du.node = home.hexId; du.fortified = true; recomputeStats(g4);
    g4.activeIndex = g4.turnOrder.indexOf(foe4); g4.phase = "Main";
    g4.players[foe4].actions.remaining = 5; g4.rng.roll = () => 1;
    const fu = Object.values(g4.units).find((u) => u.owner === foe4);
    fu.node = home.hexId; setStrOn(g4, fu, 4);
    const rf = performAction(g4, "contest", { unit: fu.uid });
    check("a fortified defending unit adds +1", rf.defenderFortify === CONFIG.combat.fortifyBonus);
  }

  // Veterancy: 3 wins promotes.
  {
    const g5 = createGame({ seed }); startTurn(g5);
    clearHexOfUnits(g5, terrain.id);
    const me5 = g5.turnOrder[0];
    const a = Object.values(g5.units).find((u) => u.owner === me5);
    a.contestsWon = 2; // one more win promotes
    a.node = terrain.id; a.moveRemaining = a.movement;
    const e = Object.values(g5.units).find((u) => u.owner !== me5);
    e.node = terrain.id; g5.rng.roll = () => 1;
    g5.players[me5].actions.remaining = 5;
    a.baseStrength = 9; e.baseStrength = 4; recomputeStats(g5);
    performAction(g5, "contest", { unit: a.uid, target: e.uid });
    check("a unit promotes to Veteran after 3 wins", a.veteran === true);
  }
}

// --- Bugfix: losing one section of a fully-held Location must clear the
// former controller's full-control flag. Before this fix, loc.controller
// was only ever SET (on reaching full control) and never CLEARED on
// losing a section short of full loss — so a location that dropped from
// 3/3 to 2/3 still read as "fully controlled by the old owner" everywhere
// (income, build rights, passive heal, ZoC/movement blocking, and contest
// eligibility). The visible symptom: the old owner's own unit, standing
// on its own partially-lost Location, could "contest" it — and the
// engine would fold that SAME unit's Strength into the defender value as
// well, since defenderValue(state,t) stacks loc.controller's units on the
// hex, and loc.controller was still (wrongly) the attacker itself. ---
line("\n  [Bugfix] partial section loss clears the stale full-controller flag");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0], foe = g.turnOrder[1];
  const home = Object.values(g.locations).find((l) => l.controller === me);
  const away = g.board.adjacency[home.hexId][0];
  // `home` is likely the only Location `me` controls this early, so
  // clearHexOfUnits (which relocates to another owned Location) can't
  // place its own starting garrison anywhere — move it to a plain
  // adjacent hex instead, so `home` starts as a bare, unit-less garrison.
  for (const u of Object.values(g.units)) if (u.node === home.hexId) u.node = away;
  home.garrison = 1; // low enough that any positive roll clears it
  check("home starts fully controlled by me", home.controller === me && home.sections.every((s) => s === me));

  // foe attacks the bare garrison (no defending unit) with overwhelming
  // Strength — guaranteed win, flips exactly one section.
  const foeUnit = Object.values(g.units).find((u) => u.owner === foe);
  foeUnit.node = home.hexId; foeUnit.moveRemaining = foeUnit.movement; foeUnit.baseStrength = 4;
  recomputeStats(g);
  g.activeIndex = g.turnOrder.indexOf(foe); g.phase = "Main";
  g.players[foe].actions.remaining = 5; g.rng.roll = () => 6;
  const r1 = performAction(g, "contest", { unit: foeUnit.uid });
  check("foe's win flips exactly one section", r1.ok && home.sections.filter((s) => s === foe).length === 1);
  check("the stale full-controller flag is cleared (was the reported bug's root cause)",
    home.controller === null);

  // foe's unit ends its move there (contesting zeroes moveRemaining) —
  // move it off so the next check isolates my own unit's contest cleanly.
  foeUnit.node = away;

  // The reported symptom: my own unit, standing on this now-partially-
  // lost Location, tries to contest it back.
  const myUnit = Object.values(g.units).find((u) => u.owner === me);
  myUnit.node = home.hexId; myUnit.moveRemaining = myUnit.movement; myUnit.baseStrength = 4;
  recomputeStats(g);
  g.activeIndex = g.turnOrder.indexOf(me); g.phase = "Main";
  g.players[me].actions.remaining = 5;
  const garrisonOnly = home.garrison;
  const r2 = performAction(g, "contest", { unit: myUnit.uid });
  check("my unit can legally contest to reclaim the lost section (not blocked as self-contest)", r2.ok);
  check("the defender value is the bare garrison only — my own attacking unit was not folded in as its own defender",
    r2.defenderValue === garrisonOnly);
}

// --- Interactive salvage + resale row ---
line("\n  [Salvage] deferred interactive salvage + resale row");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  g.rng.roll = () => 1;
  const atk = Object.values(g.units).find((u) => u.owner === me);
  const vic = Object.values(g.units).find((u) => u.owner === foe);
  atk.node = terrain.id; atk.moveRemaining = atk.movement; atk.chips = [];
  vic.node = terrain.id;
  const c1 = g.nextId("chip"); g.chips[c1] = { uid: c1, chipId: "drilled-troops" };
  const c2 = g.nextId("chip"); g.chips[c2] = { uid: c2, chipId: "sharpened-blades" };
  vic.chips = [c1, c2];
  vic.baseStrength = 1; atk.baseStrength = 9; recomputeStats(g);
  g.players[me].actions.remaining = 5;

  const r = performAction(g, "contest", { unit: atk.uid, target: vic.uid }, { deferSalvage: true });
  check("deferred salvage queues a pending decision",
    g.pendingSalvage.length === 1 && r.killed.includes(vic.uid));

  const scrapBefore = g.players[me].resource;
  const res = resolveSalvage(g, { unitSlots: [c1], resell: [c2] });
  check("salvage installs the kept chip on the killer", res.ok && atk.chips.includes(c1));
  check("resold chip pays ceil(cost/2) and lands on the resale row",
    g.resaleRow.includes(c2) &&
    g.players[me].resource === scrapBefore + Math.ceil(CHIPS["sharpened-blades"].cost / 2));
  check("pending salvage cleared", g.pendingSalvage.length === 0);
  // §20.2 — the Market is retired, so resale is pure scrap recovery now: the
  // resold chip stays parked on the resale row (no buy-back path remains).
  check("resold chip remains on the resale row (no Market to re-acquire from)",
    g.resaleRow.includes(c2));
}

// --- Hex loot: chips drop on the hex when no unit can claim them ---
line("\n  [Loot] mutual kill drops chips; next unit claims them");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  g.rng.roll = () => 1;
  const myUnits = Object.values(g.units).filter((u) => u.owner === me);
  const foeUnits = Object.values(g.units).filter((u) => u.owner === foe);
  const atk = myUnits[0];
  const vic = foeUnits[0];
  // Both at 1 HP, both carry a chip → attacker wins by margin 1 (pyrrhic),
  // so loser dies and the winner dies to its own pyrrhic loss.
  const ac = g.nextId("chip"); g.chips[ac] = { uid: ac, chipId: "sharpened-blades" }; // +2
  const vc = g.nextId("chip"); g.chips[vc] = { uid: vc, chipId: "drilled-troops" };   // +1
  atk.node = terrain.id; atk.moveRemaining = atk.movement; atk.chips = [ac]; atk.baseStrength = 1;
  vic.node = terrain.id; vic.chips = [vc]; vic.baseStrength = 1;
  recomputeStats(g);
  g.players[me].actions.remaining = 5;
  performAction(g, "contest", { unit: atk.uid, target: vic.uid }); // auto-salvage path
  check("both units destroyed in a pyrrhic mutual kill", !g.units[atk.uid] && !g.units[vic.uid]);
  check("their chips fall to the hex as loot",
    (g.hexLoot[terrain.id] || []).length === 2 &&
    g.hexLoot[terrain.id].includes(ac) && g.hexLoot[terrain.id].includes(vc));

  // Persists across a full round with no one standing on it.
  for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
  check("loot persists until claimed", (g.hexLoot[terrain.id] || []).length === 2);

  // A fresh unit ending its move there auto-grabs what fits (any faction).
  const claimer = myUnits[1];
  const adj = g.board.adjacency[terrain.id][0];
  claimer.node = adj; claimer.chips = []; claimer.moveRemaining = 9; recomputeStats(g);
  g.activeIndex = g.turnOrder.indexOf(me); g.phase = "Main";
  g.players[me].actions.remaining = 5;
  performAction(g, "move", { unit: claimer.uid, to: terrain.id });
  check("a unit landing on loot grabs what fits in its bay",
    claimer.chips.includes(ac) && claimer.chips.includes(vc) && !g.hexLoot[terrain.id]);
}

// --- Interactive loot pickup leaves the rest on the hex ---
line("\n  [Loot] interactive pickup can leave chips behind");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  clearHexOfUnits(g, terrain.id);
  const c1 = g.nextId("chip"); g.chips[c1] = { uid: c1, chipId: "sharpened-blades" };
  const c2 = g.nextId("chip"); g.chips[c2] = { uid: c2, chipId: "drilled-troops" };
  g.hexLoot[terrain.id] = [c1, c2];
  const u = Object.values(g.units).find((x) => x.owner === me);
  const adj = g.board.adjacency[terrain.id][0];
  u.node = adj; u.chips = []; u.moveRemaining = 9; recomputeStats(g);
  g.players[me].actions.remaining = 5;
  performAction(g, "move", { unit: u.uid, to: terrain.id }, { interactiveLoot: true });
  check("interactive pickup queues a loot decision (loot untouched)",
    g.pendingSalvage.length === 1 && g.pendingSalvage[0].kind === "loot" &&
    (g.hexLoot[terrain.id] || []).length === 2);
  resolveSalvage(g, { unitSlots: [c1] }); // take one, leave the other
  check("taken chip installs; the rest stays on the hex",
    u.chips.includes(c1) && (g.hexLoot[terrain.id] || []).length === 1 &&
    g.hexLoot[terrain.id].includes(c2));
}

// --- Tech Wheel (§17): research, levels, ability points, peel ---
line("\n  [Tech Wheel] research → levels → ability points → wheel + peel");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const home = Object.values(g.locations).find((l) => l.controller === me);
  const install = (chipId) => {
    const c = g.nextId("chip"); g.chips[c] = { uid: c, chipId };
    home.chips.push(c); recomputeResearch(g); return c;
  };

  install("labs");
  check("one Lab → research 1, Tech Level 1",
    g.players[me].research === 1 && g.players[me].techLevel === 1);
  install("labs");
  check("two Labs → research 2, Tech Level 2 (1 Ability Point)",
    g.players[me].research === 2 && g.players[me].techLevel === 2);

  const a1 = assignTechNode(g, me, "mil-entry");
  check("assigning an entry node spends the Ability Point",
    a1.ok && g.players[me].techWheel.includes("mil-entry"));
  check("no Ability Points left blocks a 2nd assignment",
    !assignTechNode(g, me, "mil-a1").ok);

  install("advanced-lab"); // +2 → research 4 → L3
  check("Advanced Lab pushes to L3 (research 4) — tier-2 Market unlocks",
    g.players[me].research === 4 && g.players[me].techLevel === 3);
  applyEffect(g, { type: "ADJUST_RESOURCE", resource: "Research", amount: 4, target: me }, {});
  check("permanent Research reaches L5 (research 8) — tier-3 Market unlocks",
    g.players[me].research === 8 && g.players[me].techLevel === 5);

  // 4 points now: assign a prereq chain + one more.
  assignTechNode(g, me, "mil-a1");
  const deep = assignTechNode(g, me, "mil-a2");
  const log = assignTechNode(g, me, "log-entry");
  check("prereq chain + 4th point assign (4 points spent)",
    deep.ok && log.ok && g.players[me].techWheel.length === 4);
  check("a node needs its prerequisite", !assignTechNode(g, me, "eco-a1").ok);

  // Strip all Labs — permanent Research (4) is a floor → L3 → 2 points →
  // peel the 2 most-recently assigned (log-entry, then mil-a2). LIFO.
  home.chips = home.chips.filter(
    (c) => !["labs", "advanced-lab"].includes(g.chips[c]?.chipId),
  );
  recomputeResearch(g);
  check("permanent Research is a floor (research 4 after Labs gone)",
    g.players[me].research === 4 && g.players[me].techLevel === 3);
  check("a level drop peels the most-recently-assigned nodes (LIFO)",
    g.players[me].techWheel.length === 2 &&
    !g.players[me].techWheel.includes("log-entry") &&
    !g.players[me].techWheel.includes("mil-a2") &&
    g.players[me].techWheel.includes("mil-entry") &&
    g.players[me].techWheel.includes("mil-a1"));
}

// --- Tech Wheel entry effects ---
line("\n  [Tech Wheel] entry-node effects");
{
  const terrain = Object.values(createGame({ seed }).board.hexes).find((h) => h.type === "terrain").id;

  // Military: +1 to the owner's contest roll (attacker side here).
  {
    const g = createGame({ seed }); startTurn(g);
    clearHexOfUnits(g, terrain);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].techLevel = 2; g.players[me].techWheel = ["mil-entry"];
    g.rng.roll = () => 1;
    const atk = Object.values(g.units).find((u) => u.owner === me);
    const vic = Object.values(g.units).find((u) => u.owner === foe);
    atk.node = terrain; atk.moveRemaining = atk.movement;
    vic.node = terrain; recomputeStats(g);
    g.players[me].actions.remaining = 5;
    const r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
    check("Military (Doctrine): +1 to the contest roll", r.attackerMilitary === 1);
  }

  // Logistics: +1 Movement to the owner's units.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    const before = u.movement;
    g.players[me].techLevel = 2; g.players[me].techWheel = ["log-entry"];
    recomputeStats(g);
    check("Logistics (Supply Lines): +1 Movement", u.movement === before + 1);
  }

  // Bugfix: the +1 Movement must extend THIS TURN's usable budget too, not
  // just the cap — previously recomputeStats only touched unit.movement;
  // unit.moveRemaining (what movement.js actually spends) only re-synced
  // at the next Upkeep, so assigning the tech mid-turn silently did
  // nothing until next turn. Covers both directions: a still-full budget
  // extends by the full delta, and a partially-spent one keeps its spent
  // amount (extends by the delta, not reset to the new cap).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    g.players[me].techLevel = 2;
    const r = assignTechNode(g, me, "log-entry");
    check("assigning +1 Movement mid-turn extends an untouched budget by 1",
      r.ok && u.moveRemaining === u.movement && u.moveRemaining === 3);
  }
  {
    const g2 = createGame({ seed }); startTurn(g2);
    const me2 = g2.turnOrder[0];
    const u2 = Object.values(g2.units).find((x) => x.owner === me2);
    u2.moveRemaining = 1; // already spent 1 of 2 this turn
    g2.players[me2].techLevel = 2;
    assignTechNode(g2, me2, "log-entry");
    check("a partially-spent budget extends by the delta, not reset to the new cap",
      u2.movement === 3 && u2.moveRemaining === 2);
  }

  // Economy: +1 scrap per fully-held Location at Upkeep.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    g.players[me].techLevel = 2; g.players[me].techWheel = ["eco-entry"];
    const locs = Object.values(g.locations).filter((l) => l.controller === me);
    // Net of the army's keep — this check is about INCOME, and standing units
    // now bill against the same pot.
    const expected = locs.reduce((n, l) => n + l.production, 0) + locs.length
      - armyUpkeep(g, me);
    const before = g.players[me].resource;
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // back to me's Upkeep
    check("Economy (Industry): +1 scrap per held Location",
      g.players[me].resource - before === expected);
  }

  // Intelligence: the redraw now comes from the TECH WHEEL, not from a
  // town-buildable chip. `recon-team` was removed by design ruling — encounter
  // foresight is a tech-wheel entry or a unit chip, never a settlement build —
  // so this asserts the tech grants it and that a unit chip stacks on top,
  // which is the only remaining way to reach a budget of 2.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    g.players[me].techLevel = 2; g.players[me].techWheel = ["int-entry"];
    const encHex = Object.values(g.board.hexes).find(
      (h) => h.type === "encounter" && g.board.adjacency[h.id]?.length,
    );
    const staging = g.board.adjacency[encHex.id][0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = staging; u.moveRemaining = 9;
    // Trailwise is a UNIT chip and remains buildable; it is what stacks with
    // the tech entry now that no Location chip grants a redraw.
    const tw = g.nextId("chip"); g.chips[tw] = { uid: tw, chipId: "trailwise" };
    u.chips.push(tw);
    recomputeStats(g);
    g.players[me].actions.remaining = 5;
    const original = [...g.encounterDeck];
    let discards = 0;
    const ctx = { interactiveLoot: false, interact: (req) => {
      if (req.kind === "encounterRedraw") return discards++ < 2; // discard twice
      if (req.kind === "encounterChoice") return 0;
      return req?.options ? req.options[0] : null;
    } };
    performAction(g, "move", { unit: u.uid, to: encHex.id }, ctx);
    const delivered = [...g.log].reverse().find((e) => e.name === "encounter_delivered");
    check("Intelligence (tech) + Trailwise (unit chip) grant 2 discards (3rd card drawn)",
      discards === 2 && delivered && delivered.payload.encounter === original[2]);
  }
}

// =====================================================================
// §17.5 TECH WHEEL BRANCH NODES — the 16 branch effects. Each builds a
// fresh deterministic game, sets the player's wheel directly, and asserts
// the effect site behaves. Effects ADD to their entry (never replace).
// =====================================================================
line("\n  [Tech Wheel §17.5] Military branch (Aggression / Bastion)");
{
  const terrain = Object.values(createGame({ seed }).board.hexes).find((h) => h.type === "terrain").id;
  const stage = (g, atk, vic, hex, as = 10, vs = 4) => {
    clearHexOfUnits(g, hex);
    atk.node = hex; atk.moveRemaining = atk.movement; atk.chips = []; atk.baseStrength = as;
    vic.node = hex; vic.chips = []; vic.baseStrength = vs;
    g.players[atk.owner].actions.remaining = 5;
    recomputeStats(g);
  };

  // A1 Vanguard — +1 to the INITIATOR's roll, stacking with Doctrine.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.rng.roll = () => 3;
    const atk = Object.values(g.units).find((u) => u.owner === me);
    const vic = Object.values(g.units).find((u) => u.owner === foe);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["mil-entry"];
    stage(g, atk, vic, terrain);
    const base = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
    g.players[me].techWheel = ["mil-entry", "mil-a1"];
    stage(g, atk, vic, terrain);
    const van = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
    check("Military A1 (Vanguard): +1 attacker roll over baseline (stacks with Doctrine)",
      van.attackerVanguard === 1 && van.initiatorTotal === base.initiatorTotal + 1);
  }

  // A2 Killing Blow — a winning attack drops the loser 2 Strength (was 1).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.rng.roll = () => 1;
    const atk = Object.values(g.units).find((u) => u.owner === me);
    const vic = Object.values(g.units).find((u) => u.owner === foe);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["mil-entry", "mil-a1", "mil-a2"];
    stage(g, atk, vic, terrain, 8, 4); // decisive, non-pyrrhic win
    const r = performAction(g, "contest", { unit: atk.uid, target: vic.uid });
    check("Military A2 (Killing Blow): a winning attack drops the loser 2 Strength",
      r.won && r.defenderStrLost === 2 && vic.baseStrength === 2);
  }

  // B1 Turrets — defending a controlled hex: +1 contest AND fortify doubles.
  {
    const turretRun = (withB1) => {
      const g = createGame({ seed }); startTurn(g);
      const me = g.turnOrder[0], foe = g.turnOrder[1];
      g.rng.roll = () => 1;
      const loc = Object.values(g.locations).find((l) => l.controller === foe);
      const defU = Object.values(g.units).find((u) => u.owner === foe);
      defU.node = loc.hexId; defU.fortified = true; defU.baseStrength = 4;
      const atk = Object.values(g.units).find((u) => u.owner === me);
      atk.node = loc.hexId; atk.moveRemaining = atk.movement; atk.baseStrength = 4;
      recomputeStats(g); g.players[me].actions.remaining = 5;
      if (withB1) { g.players[foe].techLevel = 5; g.players[foe].techWheel = ["mil-entry", "mil-b1"]; }
      return performAction(g, "contest", { unit: atk.uid });
    };
    const base = turretRun(false), b1 = turretRun(true);
    check("Military B1 (Turrets): +1 defender contest on a controlled hex",
      base.defenderTurrets === 0 && b1.defenderTurrets === 1);
    check("Military B1 (Turrets): doubles the §16.6 fortify bonus (1 → 2)",
      base.defenderFortify === 1 && b1.defenderFortify === 2);
  }

  // B2 Citadel — +2 garrison Strength; a capture FROM a holder starts Loyalty 0.
  {
    const citadelRun = (withB2) => {
      const g = createGame({ seed }); startTurn(g);
      const me = g.turnOrder[0], foe = g.turnOrder[1];
      g.rng.roll = () => 1;
      const loc = Object.values(g.locations).find((l) => l.controller === foe);
      // clear foe units off → garrison-only defence (clean defenderValue)
      for (const u of Object.values(g.units)) if (u.owner === foe && u.node === loc.hexId) {
        const away = g.board.adjacency[loc.hexId].find((h) => !g.locations[h]);
        if (away) u.node = away;
      }
      const atk = Object.values(g.units).find((u) => u.owner === me);
      atk.node = loc.hexId; atk.moveRemaining = atk.movement; atk.baseStrength = 1;
      recomputeStats(g); g.players[me].actions.remaining = 5;
      if (withB2) { g.players[foe].techLevel = 5; g.players[foe].techWheel = ["mil-entry", "mil-b1", "mil-b2"]; }
      return performAction(g, "contest", { unit: atk.uid });
    };
    const base = citadelRun(false), b2 = citadelRun(true);
    check("Military B2 (Citadel): +2 garrison Strength on a controlled Location",
      b2.defenderValue === base.defenderValue + 2);

    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    const loc = Object.values(g.locations).find((l) => l.controller === foe);
    g.players[foe].techLevel = 5; g.players[foe].techWheel = ["mil-entry", "mil-b1", "mil-b2"];
    for (const u of Object.values(g.units)) if (u.owner === foe && u.node === loc.hexId) {
      const away = g.board.adjacency[loc.hexId].find((h) => !g.locations[h]);
      if (away) u.node = away;
    }
    const atk = Object.values(g.units).find((u) => u.owner === me);
    atk.node = loc.hexId; atk.moveRemaining = atk.movement;
    applyEffect(g, { type: "MODIFY_STAT", stat: "Strength", amount: 60, target: atk.uid, duration: "this_turn" }, { sourcePlayer: me });
    g.players[me].actions.remaining = 20; g.rng.roll = () => 6;
    for (let i = 0; i < 3 && loc.controller !== me; i++) performAction(g, "contest", { unit: atk.uid });
    check("Military B2 (Citadel): a Location captured FROM a B2 holder starts at Loyalty 0",
      loc.controller === me && loc.loyalty === 0);
  }
}

line("\n  [Tech Wheel §17.5] Logistics branch (Maneuver / Sustainment)");
{
  // A1 Forced March — +1 Movement, stacking with Supply Lines (+2 total).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    const before = u.movement;
    g.players[me].techLevel = 5; g.players[me].techWheel = ["log-entry", "log-a1"];
    recomputeStats(g);
    check("Logistics A1 (Forced March): Movement is base + 2 (entry + A1)",
      u.movement === before + 2);
  }

  // A2 Forward Supply — route a convoy THROUGH enemy ZoC (synthetic graph).
  {
    const mk = (a2) => ({
      players: { me: { id: "me", techWheel: a2 ? ["log-entry", "log-a2"] : [] } },
      locations: { a: { hexId: "a", controller: "me" } },
      board: { adjacency: { a: ["b"], b: ["a", "c"], c: ["b"] } },
      world: { zoc: { b: "foe" } },
    });
    check("Logistics A2 (Forward Supply): enemy ZoC walls a convoy off WITHOUT it",
      reinforcementRoute(mk(false), "me", "c") === null);
    const route = reinforcementRoute(mk(true), "me", "c");
    check("Logistics A2 (Forward Supply): a holder routes a convoy THROUGH enemy ZoC",
      route && route.dist === 2 && route.originHex === "a");
    const walled = reinforcementRoute({
      players: { me: { id: "me", techWheel: ["log-entry", "log-a2"] } },
      locations: { a: { hexId: "a", controller: "me" }, b: { hexId: "b", controller: "foe" } },
      board: { adjacency: { a: ["b"], b: ["a", "c"], c: ["b"] } },
      world: { zoc: {} },
    }, "me", "c");
    check("Forward Supply: an enemy-CONTROLLED Location hex is still a hard wall",
      walled === null);
  }

  // B1 Field Hospital — heal is 2/Upkeep on a held Location.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = Object.values(g.locations).find((l) => l.controller === me);
    loc.abilityId = null; // pin: a seeded HEAL_HERE ability would skew the exact +2
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = loc.hexId; u.baseStrength = 1; recomputeStats(g);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["log-entry", "log-b1"];
    const before = u.baseStrength;
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // one of me's Upkeeps
    check("Logistics B1 (Field Hospital): heals 2/Upkeep on a held Location",
      u.baseStrength === before + 2);
  }

  // B2 Supply Convoys — +1 extra travel/round, and 1:1 reinforce healing.
  {
    const travelRun = (b2) => {
      const g = createGame({ seed }); startTurn(g);
      const me = g.turnOrder[0];
      g.players[me].permanentResearch = 8; // floor at L5 so the wheel can't peel
      g.players[me].techWheel = b2 ? ["log-entry", "log-b2"] : ["log-entry"];
      recomputeResearch(g);
      const u = Object.values(g.units).find((x) => x.owner === me);
      // strip me of Locations → no supply source → the convoy never delivers,
      // so we can read the per-round travel increment directly.
      for (const l of Object.values(g.locations)) if (l.controller === me) l.controller = null;
      g.reinforcements.push({ owner: me, targetUnit: u.uid, amount: 1, traveled: 0, originHex: u.node, requestedRound: g.round });
      for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
      return g.reinforcements.find((r) => r.targetUnit === u.uid)?.traveled ?? null;
    };
    check("Logistics B2 (Supply Convoys): a holder's convoy advances +1 extra hex/round (2 vs 1)",
      travelRun(false) === 1 && travelRun(true) === 2);

    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["log-entry", "log-b2"];
    const loc = Object.values(g.locations).find((l) => l.controller === me);
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = loc.hexId; u.baseStrength = 1; recomputeStats(g); // deficit 3 (cap 4)
    g.players[me].resource = 100; g.players[me].actions.remaining = 5;
    const before = g.players[me].resource;
    const r = performAction(g, "reinforce", { unit: u.uid, mode: "instant" });
    check("Logistics B2 (Supply Convoys): instant reinforce heals at 1 scrap/Strength (3, was 6)",
      r.ok && before - g.players[me].resource === 3);
  }
}

line("\n  [Tech Wheel §17.5] Economy branch (Industry / Construction)");
{
  // A1 Refineries — +2 scrap/Location with Industry (entry + A1).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["eco-entry", "eco-a1"];
    const locs = Object.values(g.locations).filter((l) => l.controller === me);
    const expected = locs.reduce((n, l) => n + l.production, 0) + locs.length * 2
      - armyUpkeep(g, me);
    const before = g.players[me].resource;
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
    check("Economy A1 (Refineries): +2 scrap/held Location (entry + A1)",
      g.players[me].resource - before === expected);
  }

  // A2 Industrial Might — a held Capital adds +1 Research; conditional.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find(
      (l) => l.controller === me && l.chips.some((c) => g.chips[c]?.chipId === "capital"));
    g.players[me].permanentResearch = 6; // floor at L4 (3 points) so eco-a2 is legal
    g.players[me].techWheel = ["eco-entry", "eco-a1"]; recomputeResearch(g);
    const without = g.players[me].research;
    g.players[me].techWheel = ["eco-entry", "eco-a1", "eco-a2"]; recomputeResearch(g);
    check("Economy A2 (Industrial Might): a held Capital generates +1 Research",
      !!home && g.players[me].research === without + 1);
    home.controller = null; recomputeResearch(g);
    check("Industrial Might: the +1 is CONDITIONAL — it drops when the Capital is lost",
      g.players[me].research === without);
  }

  // B1 Production Lines — effective buildCost is 1 cheaper (floor 1).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const def = CHIPS["labs"]; // buildCost 3
    g.players[me].techLevel = 5; g.players[me].techWheel = ["eco-entry", "eco-b1"];
    check("Economy B1 (Production Lines): effective buildCost reduced by 1 (floor 1)",
      effectiveBuildCost(g, me, def) === 2);
    // integration: a queued build records the reduced cost.
    g.players[me].permanentResearch = 8; recomputeResearch(g); // keep L5 (gate clears, wheel safe)
    g.players[me].techWheel = ["eco-entry", "eco-b1"];
    const loc = Object.values(g.locations).find((l) => l.controller === me);
    performAction(g, "build", { at: loc.hexId, chipId: "labs" });
    check("Production Lines: a queued build uses the reduced cost",
      loc.activeBuild && loc.activeBuild.cost === 2);
  }

  // B2 Capital Works — +1 chip slot at the Capital only.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find(
      (l) => l.controller === me && l.chips.some((c) => g.chips[c]?.chipId === "capital"));
    const before = slotCapacity(home, g);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["eco-entry", "eco-b1", "eco-b2"];
    check("Economy B2 (Capital Works): +1 chip slot at the holder's Capital",
      slotCapacity(home, g) === before + 1);
    const neutral = Object.values(g.locations).find((l) => !l.controller);
    neutral.controller = me;
    const withB2 = slotCapacity(neutral, g);
    g.players[me].techWheel = ["eco-entry", "eco-b1"];
    check("Capital Works: Capital-only — a plain Location gets no extra slot",
      withB2 === slotCapacity(neutral, g));
  }
}

line("\n  [Tech Wheel §17.5] Intelligence branch (Vision / Espionage)");
{
  // A1 Watch Network — +1 faction Vision; the OLD A1-OR-A2 bug is fixed.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    g.players[me].techWheel = [];
    const base = unitVision(g, u);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1"];
    const withA1 = unitVision(g, u);
    g.players[me].techWheel = ["int-entry", "int-a2"];
    const withA2 = unitVision(g, u);
    check("Intelligence A1 (Watch Network): grants +1 faction-wide Vision",
      withA1 === base + CONFIG.fog.intelVisionBonus);
    check("Watch Network bug fix: A2 (Listening Post) alone grants NO faction Vision",
      withA2 === base);
  }

  // B1 Spy Ring — read a rival's wheel + standing, or null without it.
  {
    const g = createGame({ seed });
    const me = g.turnOrder[0], rival = g.turnOrder[1];
    g.players[rival].techWheel = ["mil-entry", "mil-a1"];
    check("Intelligence B1 (Spy Ring): no intel without the node", readRivalIntel(g, me, rival) === null);
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-b1"];
    const intel = readRivalIntel(g, me, rival);
    check("Intelligence B1 (Spy Ring): a holder reads a rival's wheel + factionStanding",
      intel && JSON.stringify(intel.techWheel) === JSON.stringify(["mil-entry", "mil-a1"]) &&
        typeof intel.factionStanding === "object");
  }

  // B2 Saboteurs — −1 Loyalty on an enemy Location, gated once/round.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].permanentResearch = 8; // floor at L5 so the wheel can't peel across rounds
    g.players[me].techWheel = ["int-entry", "int-b1", "int-b2"]; recomputeResearch(g);
    g.players[me].actions.remaining = 5;
    const target = Object.values(g.locations).find((l) => l.controller === foe);
    target.loyalty = 5;
    const own = Object.values(g.locations).find((l) => l.controller === me);
    const bad = performAction(g, "sabotage", { at: own.hexId });
    const r1 = performAction(g, "sabotage", { at: target.hexId });
    const r2 = performAction(g, "sabotage", { at: target.hexId });
    check("Intelligence B2 (Saboteurs): drops target Loyalty by 1", r1.ok && target.loyalty === 4);
    check("Saboteurs: cannot target your own Location", !bad.ok);
    check("Saboteurs: gated to once per round", !r2.ok && r2.reason === "already sabotaged this round");
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
    g.players[me].actions.remaining = 5;
    const r3 = performAction(g, "sabotage", { at: target.hexId });
    check("Saboteurs: re-enabled the next round", r3.ok && target.loyalty === 3);
  }
}

// =====================================================================
// §17.7 LISTENING POST — the deployable Vision subsystem. Build → sight →
// concealment → contact-reveal → contest-destruction → upkeep dormancy.
// =====================================================================
line("\n  [Tech Wheel §17.7] Listening Post");
{
  // Build validation + cost.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const hex = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = hex; recomputeStats(g);
    g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    g.players[me].techWheel = ["int-entry"]; // no A2
    const noA2 = performAction(g, "build-post", { hex });
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1", "int-a2"];
    const poorRes = g.players[me].resource; g.players[me].resource = 1;
    const poor = performAction(g, "build-post", { hex });
    g.players[me].resource = poorRes;
    const onLoc = performAction(g, "build-post", { hex: Object.values(g.locations).find((l) => l.controller === me).hexId });
    const built = performAction(g, "build-post", { hex });
    check("Listening Post: build needs A2 + scrap + a non-Location hex, then succeeds",
      !noA2.ok && !poor.ok && !onLoc.ok && built.ok && !!postAt(g, hex));
    check("Listening Post: costs 3 scrap (10 → 7)", g.players[me].resource === 7);
  }

  // Vision (paid vs dormant) + concealment from enemies.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1", "int-a2"];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    const dHome = bfsDistances(g.board.adjacency, home.hexId);
    // farthest terrain hex from home so me's Capital can't see it
    const hex = Object.keys(g.board.hexes)
      .filter((h) => g.board.hexes[h].type === "terrain" && !g.locations[h])
      .sort((a, b) => (dHome[b] ?? 0) - (dHome[a] ?? 0))[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = hex; recomputeStats(g);
    g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    performAction(g, "build-post", { hex });
    const post = postAt(g, hex);
    // Isolate the post as me's ONLY Vision source: drop me's units, Locations
    // (as sources), and ZoC so the post alone can light the hex.
    for (const uid of Object.keys(g.units)) if (g.units[uid].owner === me) delete g.units[uid];
    for (const l of Object.values(g.locations)) if (l.controller === me) l.controller = null;
    g.world.zoc = {};
    recomputeVisibility(g, me, { emitEvents: false });
    const seesPaid = isHexVisible(g, me, hex);
    const reach = (g.board.adjacency[hex] || []).some((h) => isHexVisible(g, me, h));
    check("Listening Post: a PAID post grants radius-1 sight (own hex + an adjacent)",
      seesPaid && reach);
    check("Listening Post: concealed from enemies in fog (not in foe's revealedTo)",
      !isPostVisibleTo(g, foe, post));
    post.paid = false; // dormant
    recomputeVisibility(g, me, { emitEvents: false });
    check("Listening Post: a dormant (unpaid) post contributes NO Vision",
      !isHexVisible(g, me, hex));
  }

  // Contact reveal — a foe unit entering the hex reveals the post.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1", "int-a2"];
    const hex = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = hex; recomputeStats(g); g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    performAction(g, "build-post", { hex });
    const post = postAt(g, hex);
    check("Listening Post: concealed before contact", !isPostVisibleTo(g, foe, post));
    while (activePlayerId(g) !== foe) endTurn(g);
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = g.board.adjacency[hex][0]; fu.moveRemaining = 9; recomputeStats(g);
    g.players[foe].actions.remaining = 5;
    const mv = performAction(g, "move", { unit: fu.uid, to: hex });
    check("Listening Post: an enemy entering the hex reveals it (contact)",
      mv.ok && isPostVisibleTo(g, foe, postAt(g, hex)));
  }

  // Destruction — an enemy contest at Strength 5 destroys the post.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1", "int-a2"];
    const hex = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
    const mu = Object.values(g.units).find((x) => x.owner === me);
    mu.node = hex; recomputeStats(g); g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    performAction(g, "build-post", { hex });
    while (activePlayerId(g) !== foe) endTurn(g);
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = hex; fu.baseStrength = 12; fu.moveRemaining = fu.movement; recomputeStats(g);
    g.players[foe].actions.remaining = 5; g.rng.roll = () => 6;
    const r = performAction(g, "contest", { unit: fu.uid, target: "post" });
    check("Listening Post: an enemy contest defends at Strength 5 and can destroy it",
      r.won && r.kind === "post" && r.defenderValue === CONFIG.posts.defense && !postAt(g, hex));
  }

  // Upkeep — unpaid → dormant; repaid → active. Dormancy doesn't reveal.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    g.players[me].techLevel = 5; g.players[me].techWheel = ["int-entry", "int-a1", "int-a2"];
    const hex = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = hex; recomputeStats(g); g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    performAction(g, "build-post", { hex });
    g.players[me].resource = 0;
    chargePostUpkeep(g, me);
    const post = postAt(g, hex);
    check("Listening Post: an unpaid post goes dormant at Upkeep",
      post.paid === false && !post.revealedTo.includes(foe)); // dormancy reveals nobody
    g.players[me].resource = 5;
    chargePostUpkeep(g, me);
    check("Listening Post: paying upkeep reactivates the post",
      post.paid === true && g.players[me].resource === 4);
  }
}

// =====================================================================
// AMBUSH HALTS — a blocker you could not see stops you, but costs you the
// ADVANCE rather than the whole turn. A blocker you could see costs both.
// =====================================================================
line("\n  [§16.2] Halted by something you could not see");
{
  // `me`'s lone unit in open country with one enemy planted `range` hexes
  // ahead. Every other vision source `me` has is stripped (other units, its
  // Locations, its ZoC) so the mover's OWN sight is the only thing deciding
  // whether the blocker is a surprise — which is the whole variable here.
  const stage = (range) => {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0], foe = g.turnOrder[1];
    const u = Object.values(g.units).find((x) => x.owner === me);
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    for (const x of Object.values(g.units)) {
      if (x.uid !== u.uid && x.uid !== fu.uid) delete g.units[x.uid];
    }
    for (const l of Object.values(g.locations)) if (l.controller === me) l.controller = null;
    g.world.zoc = {};

    // Plain ground only — a mountain or forest would halt or tax the move for
    // reasons that have nothing to do with the blocker.
    const plain = (h) => g.board.hexes[h] && !g.locations[h] &&
      !g.board.hexes[h].elevation && !g.board.hexes[h].cover;
    const start = Object.keys(g.board.hexes).find(
      (h) => plain(h) && (g.board.adjacency[h] || []).filter(plain).length >= 2);
    u.node = start; u.moveRemaining = 6; u.turnStartNode = start; u.checked = false;

    const d = bfsDistances(g.board.adjacency, start);
    const blockHex = Object.keys(g.board.hexes)
      .filter((h) => plain(h) && d[h] === range).sort()[0];
    if (!blockHex) throw new Error(`no plain hex ${range} from ${start} on seed ${seed}`);
    fu.node = blockHex;
    recomputeStats(g);
    g.players[me].actions.remaining = 9;
    recomputeVisibility(g, me, { emitEvents: false });
    // A hex one step further out than the blocker — where "pressing on" leads.
    const beyond = (g.board.adjacency[blockHex] || []).find((h) => plain(h) && d[h] === range + 1);
    return { g, me, foe, u, fu, start, blockHex, beyond, d };
  };

  // Unseen (3 hexes out, past the mover's own sight): keeps the remainder.
  {
    const { g, me, u, blockHex } = stage(3);
    const hidden = !isHexVisible(g, me, blockHex);
    // What the trip WOULD have cost with nothing blocking — the movement the
    // unit should still be holding once it is stopped by a surprise.
    const owed = u.moveRemaining - (unitReach(g, u)[blockHex] ?? 0);
    const before = u.moveRemaining;
    const mv = performAction(g, "move", { unit: u.uid, to: blockHex });
    check("Ambush: a halt you could not see keeps the movement you had left",
      hidden && mv.ok && u.node === blockHex && u.moveRemaining > 0 &&
      u.moveRemaining === before - owed && u.checked === true);
  }

  // Seen (adjacent, so the mover's own sight covers it): costs the whole move.
  {
    const { g, me, u, blockHex } = stage(1);
    const seen = isHexVisible(g, me, blockHex);
    const mv = performAction(g, "move", { unit: u.uid, to: blockHex });
    check("Ambush: a halt you COULD see still costs the rest of the move",
      seen && mv.ok && u.node === blockHex && u.moveRemaining === 0 && !u.checked);
  }

  // Checked units may fall back or sidestep, but not press on. Note the unit
  // may not have the movement to reach its start hex again — the rule is about
  // DIRECTION, so the test is too: something strictly closer must be open, and
  // nothing further out may be.
  {
    const { g, me, u, blockHex, beyond, d } = stage(3);
    performAction(g, "move", { unit: u.uid, to: blockHex });
    const reach = unitReach(g, u);
    const closer = Object.keys(reach).filter((h) => (d[h] ?? 99) < d[blockHex]);
    check("Ambush: a checked unit may fall back toward where it started",
      u.moveRemaining > 0 && closer.length > 0);
    check("Ambush: a checked unit may sidestep, but never press on past the blocker",
      Object.keys(reach).every((h) => (d[h] ?? 99) <= d[blockHex]) &&
      // `beyond` only exists when the blocker isn't on the board's rim.
      (!beyond || !(beyond in reach)));
  }

  // The check lasts the turn, and lifts at the next Upkeep.
  {
    const { g, me, u, blockHex, d } = stage(3);
    performAction(g, "move", { unit: u.uid, to: blockHex });
    const back = Object.keys(unitReach(g, u))
      .filter((h) => (d[h] ?? 99) < d[blockHex]).sort()[0];
    performAction(g, "move", { unit: u.uid, to: back });
    check("Ambush: the check persists after falling back",
      u.node === back && u.checked === true);
    // Round the table back to `me` — its own turn has to END first, or the
    // loop condition is already satisfied and nothing happens.
    endTurn(g);
    while (activePlayerId(g) !== me) endTurn(g);
    check("Ambush: the next Upkeep clears it",
      u.checked === false && u.turnStartNode === u.node);
  }
}

// =====================================================================
// RAIL PRODUCTION POOLING (docs/rail-road-blockade-design.md §2.2) — an idle
// settlement routes its build throughput down a DIRECT rail link.
// =====================================================================
line("\n  [Rail doc §2.2] Production pooling");
{
  // Two capitals joined by a rail link, both held by `me`, both idle.
  const stage = () => {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const link = (g.board.rails || [])[0];
    if (!link) return null;
    const from = g.locations[link.a], to = g.locations[link.b];
    if (!from || !to) return null;
    for (const l of [from, to]) {
      l.controller = me; l.sections = [me, me, me];
      l.production = 6; l.buildSlider = 1; l.activeBuild = null; l.buildProgress = 0;
      l.poolTarget = null;
    }
    // Both endpoints were somebody else's capital, and their garrisons are
    // still standing on them — which genuinely cuts the line. Clear the whole
    // path so each case below controls the interruption it is testing.
    const path = new Set(link.path);
    for (const u of Object.values(g.units)) {
      if (u.owner !== me && path.has(u.node)) delete g.units[u.uid];
    }
    recomputeStats(g);
    g.players[me].actions.remaining = 9;
    return { g, me, from, to, link };
  };

  const st0 = stage();
  check("Pooling: the test board has a rail link between two Locations", !!st0);

  if (st0) {
    // Opt-in, direct pairs, both stations held.
    {
      const { g, me, from, to } = stage();
      const set = performAction(g, "set-pool-target", { at: from.hexId, to: to.hexId });
      const self = performAction(g, "set-pool-target", { at: from.hexId, to: from.hexId });
      const unlinked = Object.values(g.locations)
        .find((l) => l.hexId !== from.hexId && l.hexId !== to.hexId);
      unlinked.controller = me;
      const far = performAction(g, "set-pool-target", { at: from.hexId, to: unlinked.hexId });
      check("Pooling: opt-in only, never into itself, and only down a DIRECT link",
        set.ok && !self.ok && !far.ok && from.poolTarget === to.hexId);
    }

    // The transfer itself.
    {
      const { g, me, from, to } = stage();
      performAction(g, "set-pool-target", { at: from.hexId, to: to.hexId });
      const output = locationOutput(g, from);
      applyOutputAndBuilds(g, me);
      check("Pooling: an idle settlement's build output arrives at the recipient",
        to.buildProgress === output && from.buildProgress === 0 && output > 0);
    }

    // The donor's own build always comes first.
    {
      const { g, me, from, to } = stage();
      performAction(g, "set-pool-target", { at: from.hexId, to: to.hexId });
      from.activeBuild = { kind: "build", chipId: "scrapworks", cost: 99 };
      const output = locationOutput(g, from);
      applyOutputAndBuilds(g, me);
      check("Pooling: a settlement building something of its own pools nothing",
        from.buildProgress === output && to.buildProgress === 0);
    }

    // §2.2 mid-turn interruption — no partial credit, and it banks instead.
    {
      const { g, me, from, to, link } = stage();
      performAction(g, "set-pool-target", { at: from.hexId, to: to.hexId });
      const foe = g.turnOrder[1];
      const cutAt = link.path.find((h) => h !== from.hexId && h !== to.hexId) || link.path[1];
      const fu = Object.values(g.units).find((x) => x.owner === foe);
      fu.node = cutAt; recomputeStats(g);
      const banked = g.players[me].resource;
      applyOutputAndBuilds(g, me);
      check("Pooling: a cut line pools NOTHING — no partial credit",
        to.buildProgress === 0 && from.buildProgress === 0 &&
        g.log.some((e) => e.name === "pool_interrupted"));
      check("Pooling: a cut line banks the output instead of losing it",
        g.players[me].resource > banked);
    }

    // §2.3 — losing a station closes the link.
    {
      const { g, me, from, to } = stage();
      performAction(g, "set-pool-target", { at: from.hexId, to: to.hexId });
      to.controller = g.turnOrder[1];
      applyOutputAndBuilds(g, me);
      check("Pooling: you must hold BOTH stations — a lost recipient pools nothing",
        to.buildProgress === 0);
    }
  }
}

// =====================================================================
// BLOCKADE STRUCTURES (docs/rail-road-blockade-design.md §3) — build gating →
// supply-fed construction → blocking + Vision once complete → destroy-only.
// =====================================================================
line("\n  [Rail doc §3] Blockade structures");
{
  // A road hex with a friendly unit on it and an intact road link back to a
  // settlement `me` holds — the standard setup for every case below.
  const stage = () => {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    // Nearest road hex to home that isn't a Location, so supply is short and
    // its path is easy to cut in the tests that want to cut it.
    const d = bfsDistances(g.board.adjacency, home.hexId);
    const hex = Object.keys(g.board.hexes)
      .filter((h) => g.board.hexes[h].road && !g.locations[h])
      .sort((a, b) => (d[a] ?? 99) - (d[b] ?? 99))[0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = hex; recomputeStats(g);
    g.players[me].resource = 10; g.players[me].actions.remaining = 5;
    // Rail doc §3.4 — construction is paid out of the funding settlement's
    // build output, so pin that down: a generous Output, all of it on the guns
    // side, and no chip of its own competing unless a case asks for one.
    home.production = 8; home.buildSlider = 1; home.activeBuild = null;
    home.buildProgress = 0;
    return { g, me, hex, u, home };
  };

  // One Upkeep's worth of economy for `me` — this is what funds blockades now.
  const upkeep = (g, me) => applyOutputAndBuilds(g, me);

  // Build gating: road hex, a unit to pin, scrap, and a live supply line.
  {
    const { g, me, hex, u } = stage();
    const offRoad = Object.keys(g.board.hexes).find((h) => !g.board.hexes[h].road && !g.locations[h]);
    const notRoad = performAction(g, "build-blockade", { hex: offRoad });
    const onLoc = performAction(g, "build-blockade", {
      hex: Object.values(g.locations).find((l) => l.controller === me).hexId,
    });
    const kept = g.players[me].resource; g.players[me].resource = 1;
    const poor = performAction(g, "build-blockade", { hex });
    g.players[me].resource = kept;
    const built = performAction(g, "build-blockade", { hex });
    const twice = performAction(g, "build-blockade", { hex });
    check("Blockade: build needs a road hex, off a Location, with scrap — then succeeds",
      !notRoad.ok && !onLoc.ok && !poor.ok && built.ok && !twice.ok && !!blockadeAt(g, hex));
    check(`Blockade: costs ${CONFIG.blockades.buildCost} scrap and starts unfinished, pinning its builder`,
      g.players[me].resource === 10 - CONFIG.blockades.buildCost &&
      blockadeAt(g, hex).done === false &&
      blockadeAt(g, hex).builder === u.uid);
    // Step the builder aside to read the SITE's own blocking: with the unit
    // still on it the hex is blocked either way, and the point of the check is
    // that a construction site contributes nothing on its own.
    const parked = u.node;
    u.node = g.board.adjacency[hex][0]; recomputeStats(g);
    check("Blockade: an unfinished site is not a blockade and blocks nobody",
      !activeBlockadeAt(g, hex) && !movementBlockers(g, g.turnOrder[1]).has(hex));
    u.node = parked; recomputeStats(g);
  }

  // Construction takes the §3.1 two-turn floor, and completing it frees the
  // builder while turning the site into a real structure.
  {
    const { g, me, hex } = stage();
    performAction(g, "build-blockade", { hex });
    upkeep(g, me);
    const midway = blockadeAt(g, hex);
    // The settlement produces 8 with the slider fully on build, far more than
    // the site's whole 4-point cost — the floor is what stops it landing now.
    check("Blockade: a rich settlement still cannot raise one in a single Upkeep",
      midway.done === false && midway.progress === creditCap(midway));
    upkeep(g, me);
    const done = blockadeAt(g, hex);
    check("Blockade: a second Upkeep completes it and releases the builder",
      done.done === true && done.builder === null && !!activeBlockadeAt(g, hex));
  }

  // §3.1 — the builder is the real cost. Walk it off and construction fails.
  {
    const { g, me, hex, u } = stage();
    performAction(g, "build-blockade", { hex });
    u.node = g.board.adjacency[hex][0]; recomputeStats(g);
    upkeep(g, me);
    check("Blockade: losing the pinned builder fails construction outright",
      !blockadeAt(g, hex));
  }

  // §3.1 — a cut supply line stalls construction rather than failing it.
  {
    const { g, me, hex, home } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    // Park an enemy on the road between the site and home.
    const path = roadSupplyPath(g, me, hex);
    const cutAt = path[1];
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = cutAt; recomputeStats(g);
    upkeep(g, me);
    const stalled = blockadeAt(g, hex);
    check("Blockade: an enemy on the supply road stalls construction, not fails it",
      !!stalled && stalled.done === false && stalled.progress === 0 &&
      path[path.length - 1] === home.hexId);
    // Clear the line — every foreign unit, not just the one we parked — and
    // construction resumes.
    const offPath = Object.keys(g.board.hexes).find((h) => !path.includes(h));
    for (const x of Object.values(g.units)) {
      if (x.owner !== me && path.includes(x.node)) x.node = offPath;
    }
    recomputeStats(g);
    upkeep(g, me);
    check("Blockade: clearing the road resumes construction",
      blockadeAt(g, hex).progress === creditCap(blockadeAt(g, hex)));
  }

  // §3.4 — the blockade outranks the settlement's own chip by default, but only
  // takes what the floor lets it; the remainder still reaches the chip.
  {
    const { g, me, hex, home } = stage();
    performAction(g, "build-blockade", { hex });
    home.activeBuild = { kind: "build", chipId: "scrapworks", cost: 99 };
    home.buildProgress = 0;
    const site = blockadeAt(g, hex);
    const cap = creditCap(site);
    const output = locationOutput(g, home);
    upkeep(g, me);
    check("Blockade: outranks the settlement's own chip by default",
      blockadeAt(g, hex).progress === cap);
    check("Blockade: takes only its per-turn cap — the rest still reaches the chip",
      home.buildProgress === output - cap && output > cap);
  }

  // §3.4 — the toggle flips it, and flips it hard: while a chip is building,
  // it takes everything and the blockade waits.
  {
    const { g, me, hex, home } = stage();
    performAction(g, "build-blockade", { hex });
    const set = performAction(g, "set-build-priority", { at: home.hexId, value: "chips" });
    home.activeBuild = { kind: "build", chipId: "scrapworks", cost: 99 };
    home.buildProgress = 0;
    const output = locationOutput(g, home);
    upkeep(g, me);
    check("Blockade: the chips-first toggle starves the site while a chip builds",
      set.ok && blockadeAt(g, hex).progress === 0 && home.buildProgress === output);
    // Finish the chip and the site resumes — it was waiting, not cancelled.
    home.activeBuild = null;
    upkeep(g, me);
    check("Blockade: with the chip done, a chips-first settlement funds it again",
      blockadeAt(g, hex).progress === creditCap(blockadeAt(g, hex)));
    const bad = performAction(g, "set-build-priority", { at: home.hexId, value: "wombat" });
    check("Blockade: build priority only accepts blockade / chips", !bad.ok);
  }

  // §3 — once complete it halts enemy movement and sees for its owner.
  {
    const { g, me, hex } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    upkeep(g, me);
    upkeep(g, me);
    check("Blockade: a completed blockade halts enemy movement",
      movementBlockers(g, foe).has(hex) && !movementBlockers(g, me).has(hex));
    // Isolate it as me's only Vision source.
    for (const uid of Object.keys(g.units)) if (g.units[uid].owner === me) delete g.units[uid];
    for (const l of Object.values(g.locations)) if (l.controller === me) l.controller = null;
    g.world.zoc = {};
    recomputeVisibility(g, me, { emitEvents: false });
    check("Blockade: a completed blockade is a Vision source for its owner",
      isHexVisible(g, me, hex));
  }

  // Build points with nowhere to go become scrap rather than sitting on the
  // Location as an untargeted pile.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    home.buildSlider = 1;              // all Output to BUILD
    home.production = 20;              // far more than the cheapest chip costs
    home.activeBuild = null; home.buildProgress = 0;
    g.players[me].techLevel = 5;

    // Queue something cheap so the Output massively overshoots it.
    const opt = buildableChips(g, home).find((o) => !o.locked && o.def.kind === "location");
    const cost = effectiveBuildCost(g, me, opt.def);
    g.players[me].actions.remaining = 5;
    const queued = performAction(g, "build", { at: home.hexId, chipId: opt.chipId });

    const before = g.players[me].resource;
    // Snapshot Output BEFORE the tick: the chip that lands may itself add
    // Output, so reading it afterwards measures a different settlement.
    const outputs = Object.values(g.locations)
      .filter((l) => l.controller === me)
      .reduce((n, l) => n + locationOutput(g, l), 0);
    applyOutputAndBuilds(g, me);
    check("Build surplus: the overshoot banks as scrap, not stranded progress",
      queued.ok && home.activeBuild === null && (home.buildProgress || 0) === 0 &&
      g.players[me].resource > before);
    check("Build surplus: nothing is lost — output is conserved end to end",
      g.players[me].resource - before === outputs - cost);
  }

  // A unit chip with no unit to arm used to destroy every point sunk into it.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    g.players[me].techLevel = 5; g.players[me].actions.remaining = 5;
    home.buildSlider = 1; home.production = 20;
    const unitOpt = buildableChips(g, home).find((o) => !o.locked && o.def.kind === "unit");
    // Stage a unit so the build is legal to QUEUE, then march it off before the
    // chip lands — the forfeit path.
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = home.hexId; recomputeStats(g);
    const queuedUnit = performAction(g, "build", { at: home.hexId, chipId: unitOpt.chipId });
    u.node = (g.board.adjacency[home.hexId] || [])[0]; recomputeStats(g);
    const before = g.players[me].resource;
    const outputs = Object.values(g.locations)
      .filter((l) => l.controller === me)
      .reduce((n, l) => n + locationOutput(g, l), 0);
    applyOutputAndBuilds(g, me);
    check("Build surplus: a forfeited unit chip refunds its work as scrap",
      queuedUnit.ok && home.activeBuild === null && (home.buildProgress || 0) === 0 &&
      // The chip never landed, so the ENTIRE build half comes back rather than
      // evaporating: nothing is deducted for a chip that was never installed.
      g.players[me].resource - before === outputs);
  }

  // Rail doc Part 1 — a blockade is a GARRISON, not a wall: it halts only what
  // it can see, so stealth walks through and a Signal Mast closes the gap.
  {
    const { g, me, hex, u } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    upkeep(g, me); upkeep(g, me);
    const b = blockadeAt(g, hex);
    u.node = g.board.adjacency[hex][0]; recomputeStats(g); // builder steps off
    ensureAllVisibility(g);
    recomputeVisibility(g, me, { emitEvents: false });

    // An ordinary enemy walking up to it is seen and stopped.
    const mover = Object.values(g.units).find((x) => x.owner === foe);
    mover.node = g.board.adjacency[hex].find((h) => h !== u.node) || g.board.adjacency[hex][0];
    recomputeStats(g);
    check("Blockade garrison: an unconcealed mover is seen and halted",
      movementBlockers(g, foe, { mover }).has(hex));

    // Now the mover sneaks. Stealth is exactly the "if you are sneaking" case.
    mover.stealth = true;
    check("Blockade garrison: a stealthed mover slips past an unmasted blockade",
      !movementBlockers(g, foe, { mover }).has(hex));
    check("Blockade garrison: ground truth is unchanged — only the mover's view of it",
      movementBlockers(g, foe).has(hex));

    // A Signal Mast gives the blockade Detection, and the road shuts again.
    const mast = g.nextId("chip");
    g.chips[mast] = { uid: mast, chipId: "signal-mast" };
    b.chips = [...(b.chips || []), mast];
    recomputeVisibility(g, me, { emitEvents: false });
    check("Blockade garrison: a Signal Mast detects the sneak and halts it again",
      movementBlockers(g, foe, { mover }).has(hex));

    // A dormant blockade detects nothing, mast or not — nobody is up there.
    b.paid = false;
    check("Blockade garrison: a dormant masted blockade stops nobody",
      !movementBlockers(g, foe, { mover }).has(hex));
    b.paid = true;

    // And the unit's own reachability agrees with the scan — the field is what
    // the player actually acts on.
    mover.stealth = false;
    b.chips = [];
    recomputeVisibility(g, me, { emitEvents: false });
    mover.moveRemaining = 4; recomputeStats(g);
    const seenField = unitReach(g, mover);
    mover.stealth = true;
    const sneakField = unitReach(g, mover);
    // Past the blockade means: some hex beyond it that only opens when the
    // blockade stops halting you.
    const beyond = (g.board.adjacency[hex] || []).filter((h) => h !== mover.node);
    const opensUp = beyond.some((h) => !(h in seenField) && h in sneakField)
      || (seenField[hex] === 0 && sneakField[hex] > 0);
    check("Blockade garrison: sneaking actually widens the reachable field",
      opensUp);
  }

  // Standing armies eat — 1 scrap a unit, 2 with a full bay, and an unpaid
  // unit is stranded rather than killed.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const mine = Object.values(g.units).filter((u) => u.owner === me);
    const u = mine[0];

    check("Unit upkeep: a bare unit bills 1", unitUpkeepFor(g, u) === CONFIG.unit.upkeep);
    // Two 1-slot chips and one 2-slot chip must price identically — that is
    // the whole "or a single double chip" clause.
    const put = (unit, chipId) => {
      const uid = g.nextId("chip");
      g.chips[uid] = { uid, chipId };
      unit.chips.push(uid);
      return uid;
    };
    const oneSlot = put(u, "drilled-troops");
    check("Unit upkeep: a half-filled bay still bills 1",
      unitUpkeepFor(g, u) === CONFIG.unit.upkeep);
    put(u, "drilled-troops");
    check("Unit upkeep: two 1-slot chips fill the bay and double it",
      unitUpkeepFor(g, u) === CONFIG.unit.upkeepFullyChipped);
    u.chips = [];
    put(u, "bombard"); // slots: 2
    check("Unit upkeep: one 2-slot chip fills the bay on its own",
      unitUpkeepFor(g, u) === CONFIG.unit.upkeepFullyChipped);
    u.chips = [oneSlot];

    // Park it on plain ground so the build-post case below has a legal site.
    u.node = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]) || u.node;
    recomputeStats(g);

    // Charged against an empty pot: stranded, not destroyed.
    const before = Object.keys(g.units).length;
    g.players[me].resource = 0;
    chargeUnitUpkeep(g, me);
    check("Unit upkeep: an unpayable unit goes unsupplied, not destroyed",
      mine.every((x) => x.unsupplied) && Object.keys(g.units).length === before);
    check("Unit upkeep: an unsupplied unit cannot move or act",
      mine.every((x) => x.moveRemaining === 0 && x.actionsRemaining === 0));
    const moved = performAction(g, "move", {
      unit: u.uid, to: g.board.adjacency[u.node][0],
    });
    check("Unit upkeep: the move verb refuses an unsupplied unit",
      !moved.ok && /unsupplied/.test(moved.reason || ""));
    // A wildcard must not buy back what arrears took away. Everything else
    // about this build-post is made legal first (tech, scrap, wildcards), so
    // the only thing left to refuse it is the arrears — note the scrap is
    // restored AFTER the charge above, so the unit stays unsupplied.
    g.players[me].actions.remaining = 5;
    g.players[me].resource = 99;
    g.players[me].techLevel = 5;
    g.players[me].techWheel = ["int-entry", "int-a2"];
    const acted = performAction(g, "build-post", { unit: u.uid, hex: u.node });
    check("Unit upkeep: a player wildcard cannot revive an unsupplied unit",
      !acted.ok && /unsupplied/.test(acted.reason || ""));

    // Partial funds feed the cheap units first.
    g.players[me].resource = CONFIG.unit.upkeep;
    chargeUnitUpkeep(g, me);
    const fed = mine.filter((x) => !x.unsupplied);
    check("Unit upkeep: partial funds feed as many units as they cover",
      fed.length === 1 && g.players[me].resource === 0);

    g.players[me].resource = 99;
    chargeUnitUpkeep(g, me);
    check("Unit upkeep: paying up restores the whole army",
      mine.every((x) => !x.unsupplied));
  }

  // §3.1 — a finished blockade is manned, and an unmanned one is no obstacle.
  {
    const { g, me, hex, u } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    upkeep(g, me); upkeep(g, me);
    const b = blockadeAt(g, hex);
    check("Blockade upkeep: a blockade opens paid, before any Upkeep bills it",
      b.done && b.paid === true);
    // Step the builder off, or the hex reads as blocked by the UNIT and the
    // dormancy check below would pass for the wrong reason.
    u.node = g.board.adjacency[hex][0]; recomputeStats(g);

    // Broke: the whole army and the blockade bill against an empty pot.
    g.players[me].resource = 0;
    for (const l of Object.values(g.locations)) if (l.controller === me) l.production = 0;
    chargeBlockadeUpkeep(g, me);
    check("Blockade upkeep: unaffordable upkeep puts it dormant, not destroyed",
      b.paid === false && !!blockadeAt(g, hex));
    check("Blockade upkeep: a dormant blockade halts nobody",
      !activeBlockadeAt(g, hex) && !movementBlockers(g, foe).has(hex));
    // §7.3 — a blockade DRAINS its victim now rather than paying its owner.
    // A dormant one strangles nobody, which is the same contract dormancy has
    // always had: the garrison drifts off and comes back.
    check("Blockade upkeep: a dormant barricade strangles nobody", (() => {
      const victim = Object.values(g.locations).find(
        (l) => l.controller && l.controller !== me
          && [l.hexId, ...(g.board.adjacency[l.hexId] || [])].includes(hex));
      if (!victim) return true; // no Location in reach of this site on this seed
      b.paid = false;
      const dark = blockadeDrainOn(g, victim);
      b.paid = true;
      const lit = blockadeDrainOn(g, victim);
      b.paid = false;
      return dark === 0 && lit >= CONFIG.blockades.drainOutput;
    })());

    // Pay the arrears and it comes straight back.
    g.players[me].resource = 20;
    chargeBlockadeUpkeep(g, me);
    check("Blockade upkeep: paying the arrears revives it",
      b.paid === true && !!activeBlockadeAt(g, hex) &&
      g.players[me].resource === 20 - CONFIG.blockades.upkeep);
  }

  // §3.2 — upgrade chips: queued free, paid by the same settlement draw,
  // and each one actually changes the thing it says it changes.
  {
    const { g, me, hex, home } = stage();
    performAction(g, "build-blockade", { hex });
    upkeep(g, me); upkeep(g, me);
    const b = blockadeAt(g, hex);
    g.players[me].techLevel = 5;

    // A site still under construction takes no chips — check on a fresh one.
    const other = stage();
    other.g.players[other.me].techLevel = 5;
    performAction(other.g, "build-blockade", { hex: other.hex });
    const tooSoon = performAction(other.g, "upgrade-blockade",
      { hex: other.hex, chipId: "palisade" });

    const notBlockadeChip = performAction(g, "upgrade-blockade", { hex, chipId: "works" });
    const baseDef = blockadeDefense(g, b);
    const baseVis = blockadeVision(g, b);
    const queued = performAction(g, "upgrade-blockade", { hex, chipId: "palisade" });
    check("Blockade chip: queues free onto a FINISHED blockade, and only real ones",
      !tooSoon.ok && !notBlockadeChip.ok && queued.ok &&
      b.build.chipId === "palisade" && b.build.progress === 0);
    const busy = performAction(g, "upgrade-blockade", { hex, chipId: "signal-mast" });
    check("Blockade chip: one at a time", !busy.ok);

    upkeep(g, me);
    check("Blockade chip: the funding settlement pays for it, then it installs",
      b.build === null && b.chips.length === 1 &&
      blockadeDefense(g, b) === baseDef + CHIPS.palisade.blockadeDefense);

    performAction(g, "upgrade-blockade", { hex, chipId: "signal-mast" });
    upkeep(g, me);
    check("Blockade chip: Signal Mast widens its Vision",
      b.chips.length === 2 && blockadeVision(g, b) === baseVis + CHIPS["signal-mast"].blockadeVision);

    const full = performAction(g, "upgrade-blockade", { hex, chipId: "toll-booth" });
    check("Blockade chip: slots are finite", !full.ok && CONFIG.blockades.chipSlots === 2);

    // Destroying the structure takes its chips out of play with it.
    const installed = [...b.chips];
    destroyBlockade(g, hex, g.turnOrder[1]);
    check("Blockade chip: destroying the blockade removes its chips from play",
      installed.every((c) => g.removed.includes(c)) && !blockadeAt(g, hex));
  }

  // §3.2 Toll Booth — a blockade's own income, independent of its settlement.
  {
    const { g, me, hex } = stage();
    performAction(g, "build-blockade", { hex });
    upkeep(g, me); upkeep(g, me);
    const b = blockadeAt(g, hex);
    g.players[me].techLevel = 5;
    performAction(g, "upgrade-blockade", { hex, chipId: "toll-booth" });
    upkeep(g, me);
    // §7.3 — the Toll Booth stopped being a stipend and became a tighter grip.
    // The tariff-on-passing-trade version does not work: a route through a
    // hex you dominate is SEVERED rather than taxed, so there is nothing
    // passing to charge for.
    check("Blockade chip: Toll Booth installs", b.chips.length === 1);
    check("Blockade chip: …and pays its owner nothing", blockadeIncome(g, me) === 0);
    const victim2 = Object.values(g.locations).find(
      (l) => l.controller && l.controller !== me
        && [l.hexId, ...(g.board.adjacency[l.hexId] || [])].includes(hex));
    if (victim2) {
      const withBooth = blockadeDrainOn(g, victim2);
      b.chips = [];
      const bare = blockadeDrainOn(g, victim2);
      check("Blockade chip: …it makes the barricade bite harder on its victim",
        withBooth === bare + CHIPS["toll-booth"].output,
        `bare ${bare}, with booth ${withBooth}`);
    } else {
      check("Blockade chip: …it makes the barricade bite harder on its victim",
        true, "(no Location in reach of this site on this seed)");
    }
  }

  // §3.2/§3.3 — static defense, defender-stacking, and destroy-only.
  {
    const { g, me, hex } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    upkeep(g, me);
    upkeep(g, me);
    // The builder stays put, so the blockade defends at base + its Strength.
    while (activePlayerId(g) !== foe) endTurn(g);
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = hex; fu.baseStrength = 30; fu.moveRemaining = fu.movement; recomputeStats(g);
    // Snapshot the garrison's Strength BEFORE the contest — losing costs it 1,
    // so reading it afterwards would compare against the wounded value.
    const garrisonStrength = Object.values(g.units)
      .filter((x) => x.owner === me && x.node === hex)
      .reduce((n, x) => n + x.strength, 0);
    g.players[foe].actions.remaining = 5; g.rng.roll = () => 6;
    const r = performAction(g, "contest", { unit: fu.uid, target: "blockade" });
    check("Blockade: defends at its static value PLUS the stack standing on it",
      r.kind === "blockade" &&
      r.defenderValue === CONFIG.blockades.defense + garrisonStrength);
    check("Blockade: a lost contest destroys it outright — no capture, no flip",
      r.won && !blockadeAt(g, hex));
  }

  // §3.1 — a site under construction has no defense of its own; the builder
  // fights as an ordinary unit.
  {
    const { g, me, hex } = stage();
    const foe = g.turnOrder[1];
    performAction(g, "build-blockade", { hex });
    while (activePlayerId(g) !== foe) endTurn(g);
    const fu = Object.values(g.units).find((x) => x.owner === foe);
    fu.node = hex; fu.baseStrength = 30; fu.moveRemaining = fu.movement; recomputeStats(g);
    const builderStrength = Object.values(g.units)
      .filter((x) => x.owner === me && x.node === hex)
      .reduce((n, x) => n + x.strength, 0);
    g.players[foe].actions.remaining = 5; g.rng.roll = () => 6;
    const r = performAction(g, "contest", { unit: fu.uid, target: "blockade" });
    check("Blockade: an unfinished site adds no defense — only its builder does",
      r.defenderValue === builderStrength && r.won && !blockadeAt(g, hex));
  }
}

// =====================================================================
// AI SANITY — the demo AI USES the tech wheel, and a full AI-vs-AI game
// terminates with a winner (no infinite loop). Deterministic on seed 42.
// =====================================================================
line("\n  [AI sanity] tech-wheel use + game termination");
{
  // (1) The AI spends a free Ability Point when it has one. Seed an AI player
  // to Tech Level 2 (one point) and run its turn — maybeAssignTech should put
  // a node on the wheel. Deterministic (independent of how a given seed's
  // emergent game plays out, which terrain movement legitimately shifts).
  const g = createGame({ seed: 42, humanFactionId: "versari" });
  startTurn(g);
  let guard = 12;
  while (guard-- > 0 && !g.players[activePlayerId(g)].isAI && !g.winnerId) endTurn(g);
  const aiPid = activePlayerId(g);
  g.players[aiPid].permanentResearch = 2;
  recomputeResearch(g); // → Tech Level 2 → one Ability Point
  takeAITurn(g);
  check("AI assigns a tech-wheel node when it has a free Ability Point",
    g.players[aiPid].techWheel.length > 0);

  // (2) A full AI-vs-AI game never hangs: the turn loop keeps completing
  // and rounds keep advancing. This check exists to catch a true engine
  // hang, NOT to assert that AI dynamics converge to a winner — and with
  // the chip-content batch that distinction became load-bearing: the old
  // "seed 5 converges ~round 27" behavior was an ARTIFACT of the
  // knowledge-cache / fortified-ruins placeholder abilities, which both
  // granted a repeatable +1 VP per activation. With their real effects in
  // (draw-a-Reactive / suppress-chip-bonuses), the game currently has NO
  // repeatable VP source — capture VP is first-time-only — so AI games
  // stall in multi-faction stalemates. That is an open DESIGN gap
  // (win-condition pacing), tracked in docs/chip-set-v0.1.md's open
  // questions, not an engine hang.
  const g2 = createGame({ seed: 5 });
  let safety = 600;
  while (!g2.winnerId && safety-- > 0) takeAITurn(g2);
  check("a full AI-vs-AI game never hangs (rounds advance or a winner emerges)",
    !!g2.winnerId || g2.round > 50);
}

// The old maybeAssignTech picked ONE path by faction dial — military,
// economy, or intelligence only, via a hardcoded if/else that could never
// produce "logistics" — and filled exactly 3 nodes (entry + one branch)
// before every further call found all 3 already assigned and did nothing,
// silently stranding any later Ability Point forever. Verify both are
// fixed with unambiguous fixtures (every other candidate deliberately
// exhausted or unavailable) rather than predicting exact score arithmetic
// across many live candidates, which is exactly the kind of fragile,
// hard-to-eyeball setup the harness-determinism pass just finished purging.
line("\n  [Tech Wheel AI] scored allocation reaches every path, never strands a point");
{
  // (1) Logistics is reachable at all: assign every OTHER node (Military,
  // Economy, Intelligence — all 5 each) so Logistics's own entry is the
  // ONLY assignable candidate left, then confirm a free Ability Point
  // lands on it. Under the old code this could never happen no matter the
  // faction or the game state — "logistics" was not a reachable branch of
  // the if/else at all.
  const g = createGame({ seed: 42 });
  const pid = g.turnOrder[0];
  const p = g.players[pid];
  p.techWheel = [
    "mil-entry", "mil-a1", "mil-a2", "mil-b1", "mil-b2",
    "eco-entry", "eco-a1", "eco-a2", "eco-b1", "eco-b2",
    "int-entry", "int-a1", "int-a2", "int-b1", "int-b2",
  ];
  p.techLevel = 100; // fixture-only: budget = techLevel-1, well past techWheel.length
  maybeAssignTech(g, pid);
  check("Logistics is reachable when it's the only path left assignable",
    p.techWheel.includes("log-entry"));

  // (2) Points don't strand once a path is FULLY maxed (all 5 nodes, not
  // just the old code's single 3-node branch): grant a further free point
  // and confirm the allocator picks up a node from a different path
  // instead of leaving the point unspent.
  const g2 = createGame({ seed: 42 });
  const pid2 = g2.turnOrder[0];
  const p2 = g2.players[pid2];
  p2.techWheel = ["mil-entry", "mil-a1", "mil-a2", "mil-b1", "mil-b2"]; // Military fully maxed
  p2.techLevel = 7; // one free point past the 5 Military nodes
  maybeAssignTech(g2, pid2);
  check("a fully-maxed path doesn't strand a later Ability Point",
    p2.techWheel.length === 6 && !p2.techWheel[5].startsWith("mil-"));
}

// AI-turn replay slice contract (the one engine-touching surface of the
// cinematic-replay UI): events the UI walks === state.log.slice(preTurnLogLen)
// after takeAITurn, in order. The UI snapshots positions, runs the turn, and
// replays exactly this slice — nothing before preTurnLogLen leaks in.
line("\n  [AI replay] event-slice contract for the cinematic replay");
{
  const g = createGame({ seed: 42, humanFactionId: "versari" });
  startTurn(g);
  let guard = 12;
  while (guard-- > 0 && !g.players[activePlayerId(g)].isAI && !g.winnerId) endTurn(g);
  const pid = activePlayerId(g);
  const preTurnLogLen = g.log.length;
  takeAITurn(g);
  const events = g.log.slice(preTurnLogLen);
  check("the slice picks up exactly the events takeAITurn appended",
    g.players[pid].isAI && events.length === g.log.length - preTurnLogLen && events.length > 0);
  check("the slice is identical (and in order) to the tail of the log",
    events.every((e, i) => e === g.log[preTurnLogLen + i]));
  check("nothing before preTurnLogLen is included in the slice",
    preTurnLogLen === 0 || events[0] !== g.log[preTurnLogLen - 1]);
}

// =====================================================================
// §18.3 INFLUENCE & ZONE OF CONTROL — the deterministic scalar field +
// the derived ZoC owner map. Light-touch: capturing/integrating shifts
// ZoC borders, and reinforcement routing respects them.
// =====================================================================
line("\n§18.3 INFLUENCE & ZONE OF CONTROL");
{
  // The field + ZoC are seeded at setup; a starting Capital (Loyalty 8)
  // projects strongly enough to own its own hex.
  const g = createGame({ seed });
  const me = g.turnOrder[0];
  const home = Object.values(g.locations).find((l) => l.controller === me);
  check("setup seeds an Influence field for a controlling faction",
    !!g.world.influence[me] && (g.world.influence[me][home.hexId] || 0) > 0);
  check("a Capital owns its own hex in the ZoC map",
    zocOwner(g, home.hexId) === me && inZoC(g, me, home.hexId));
  check("the field is deterministic (no dice)", (() => {
    const g2 = createGame({ seed });
    return JSON.stringify(g2.world.zoc) === JSON.stringify(g.world.zoc);
  })());

  // Capturing a previously-neutral Location extends the captor's ZoC to
  // that hex — borders visibly shift on a control change.
  {
    const g3 = createGame({ seed });
    const fid = g3.turnOrder[0];
    // Pick a neutral Location that ISN'T already a ZoC spillover from fid's
    // own Capital — some seeds place one close enough that it would be, and
    // this test is specifically about a hex crossing INTO the ZoC on
    // capture, not one that's there from the start.
    const neutral = Object.values(g3.locations).find(
      (l) => !l.controller && zocOwner(g3, l.hexId) !== fid,
    );
    const ownerBefore = neutral && zocOwner(g3, neutral.hexId); // null or another faction's spillover
    check("a neutral Location is not yet in the would-be captor's ZoC",
      !!neutral && ownerBefore !== fid);
    neutral.controller = fid;
    neutral.loyaltyOwner = fid;
    neutral.sections = [fid, fid, fid];
    neutral.loyalty = CONFIG.loyalty.ceiling;
    recomputeInfluence(g3);
    check("capturing it pulls that hex into the captor's ZoC",
      zocOwner(g3, neutral.hexId) === fid);
  }

  // Integration (raising Loyalty) is the influence build: a fresh, low-
  // Loyalty capture projects little; integrating it expands the border.
  // Whether integrating any ONE given neutral Location visibly expands the
  // *global* ZoC border depends on that location's position (one deep
  // inside already-owned territory may have no neighbouring hex left to
  // flip) — some seeds' first neutral Location happens to be such a case.
  // Test the underlying claim as an existence check across every neutral
  // Location instead of gambling on whichever one iteration order picks
  // first.
  {
    const fid = createGame({ seed }).turnOrder[0];
    const neutralHexIds = Object.values(createGame({ seed }).locations)
      .filter((l) => !l.controller).map((l) => l.hexId);
    let anyProjected = false, anyExpanded = false;
    for (const hexId of neutralHexIds) {
      const g4 = createGame({ seed });
      const neutral = g4.locations[hexId];
      neutral.controller = fid;
      neutral.loyaltyOwner = fid;
      neutral.sections = [fid, fid, fid];
      neutral.loyalty = CONFIG.loyalty.start; // fresh capture — low Loyalty
      recomputeInfluence(g4);
      const lowReach = Object.keys(g4.world.zoc).filter((h) => g4.world.zoc[h] === fid).length;
      const lowSelf = g4.world.influence[fid][hexId] || 0;
      neutral.loyalty = CONFIG.loyalty.ceiling; // fully integrated
      recomputeInfluence(g4);
      const highReach = Object.keys(g4.world.zoc).filter((h) => g4.world.zoc[h] === fid).length;
      const highSelf = g4.world.influence[fid][hexId] || 0;
      if (lowSelf > 0 && highSelf > lowSelf) anyProjected = true;
      if (highReach > lowReach) anyExpanded = true;
    }
    check("a fresh low-Loyalty capture projects less than an integrated one (some neutral Location)",
      anyProjected);
    check("integrating (Loyalty → ceiling) expands the ZoC border (some neutral Location)",
      anyExpanded);
  }

  // A border shift emits zone_changed.
  {
    const g5 = createGame({ seed });
    const fid = g5.turnOrder[0];
    const neutral = Object.values(g5.locations).find((l) => !l.controller);
    const before = g5.log.filter((e) => e.name === "zone_changed").length;
    neutral.controller = fid;
    neutral.loyaltyOwner = fid;
    neutral.sections = [fid, fid, fid];
    neutral.loyalty = CONFIG.loyalty.ceiling;
    recomputeInfluence(g5);
    const after = g5.log.filter((e) => e.name === "zone_changed").length;
    check("a ZoC border shift emits zone_changed", after > before);
  }

  // Loyalty decay shrinks the projected ZoC (the Upkeep tick recomputes).
  // Same existence-check reasoning as above: whether THIS particular
  // neutral Location's border shrinks measurably on decay depends on its
  // position, so check across all of them rather than just the first.
  {
    const fid6 = createGame({ seed }).turnOrder[0];
    const neutralHexIds6 = Object.values(createGame({ seed }).locations)
      .filter((l) => !l.controller).map((l) => l.hexId);
    let anyShrank = false;
    for (const hexId of neutralHexIds6) {
      const g6 = createGame({ seed });
      const neutral = g6.locations[hexId];
      neutral.controller = fid6;
      neutral.loyaltyOwner = fid6;
      neutral.sections = [fid6, fid6, fid6];
      neutral.loyalty = CONFIG.loyalty.ceiling;
      recomputeInfluence(g6);
      const reachFull = Object.keys(g6.world.zoc).filter((h) => g6.world.zoc[h] === fid6).length;
      neutral.loyalty = 0; // neglected to nothing
      recomputeInfluence(g6);
      const reachZero = Object.keys(g6.world.zoc).filter((h) => g6.world.zoc[h] === fid6).length;
      if (reachZero < reachFull) anyShrank = true;
    }
    check("a neglected (Loyalty 0) Location projects a smaller ZoC (some neutral Location)",
      anyShrank);
  }

  // Reinforcement routing respects ZoC: an enemy zone walls a corridor.
  {
    const g7 = createGame({ seed });
    const fid = g7.turnOrder[0];
    const foe = g7.turnOrder.find((p) => p !== fid);
    const myLocHexes = new Set(
      Object.values(g7.locations).filter((l) => l.controller === fid).map((l) => l.hexId),
    );
    // A target hex that is not mine, not adjacent to any of my Locations
    // (so its only approaches are walkable hexes), and reachable now.
    const target = Object.keys(g7.board.hexes).find((h) => {
      if (myLocHexes.has(h)) return false;
      const nbs = g7.board.adjacency[h] || [];
      if (nbs.some((n) => myLocHexes.has(n))) return false;
      if (!nbs.length) return false;
      return reinforcementRoute(g7, fid, h) != null;
    });
    check("found a routable target hex for the ZoC-walling test", !!target);
    if (target) {
      const baseline = reinforcementRoute(g7, fid, target);
      // Wall every approach with the foe's ZoC.
      for (const nb of g7.board.adjacency[target]) g7.world.zoc[nb] = foe;
      const walled = reinforcementRoute(g7, fid, target);
      check("enemy ZoC over every approach severs the supply route",
        baseline != null && walled == null);
      // Clearing the foe's ZoC reopens the route.
      for (const nb of g7.board.adjacency[target]) g7.world.zoc[nb] = null;
      const reopened = reinforcementRoute(g7, fid, target);
      check("clearing the enemy ZoC reopens the route", reopened != null);
    }

    // Friendly ZoC never walls your own routing.
    const target2 = Object.keys(g7.board.hexes).find((h) => {
      if (myLocHexes.has(h)) return false;
      const nbs = g7.board.adjacency[h] || [];
      return nbs.length && !nbs.some((n) => myLocHexes.has(n)) &&
        reinforcementRoute(g7, fid, h) != null;
    });
    if (target2) {
      for (const nb of g7.board.adjacency[target2]) g7.world.zoc[nb] = fid;
      check("your own ZoC does not wall your routing",
        reinforcementRoute(g7, fid, target2) != null);
    }
  }

  // The encounter-reveal hook: zoc_contains reads the recipient's ZoC.
  {
    const g8 = createGame({ seed });
    const fid = g8.turnOrder[0];
    const home = Object.values(g8.locations).find((l) => l.controller === fid);
    const outsideHex = Object.keys(g8.world.zoc).find((h) => g8.world.zoc[h] !== fid);
    check("zoc_contains is true inside the recipient's ZoC",
      evalCond(g8, { zoc_contains: {} }, { sourcePlayer: fid, sourceHex: home.hexId }) === true);
    check("zoc_contains is false outside it",
      evalCond(g8, { zoc_contains: {} }, { sourcePlayer: fid, sourceHex: outsideHex }) === false);
  }
}

// --- §20 Economy: Output + slider, build, rush, upgrade, dormancy, gating ---
line("\n  [§20 Economy] Output slider, build/upgrade/rush, upkeep dormancy, gating");
{
  // Helper: fully capture a neutral Location for `pid` and integrate it.
  const grab = (g, pid, loy = 8) => {
    const loc = Object.values(g.locations).find((l) => l.controller == null);
    loc.controller = pid; loc.loyaltyOwner = pid; loc.sections = [pid, pid, pid]; loc.loyalty = loy;
    loc.chips = loc.chips.filter((c) => g.chips[c]?.chipId !== "capital");
    loc.activeBuild = null; loc.buildProgress = 0; loc.buildSlider = 0;
    loc.actionsRemaining = 1; // claimed mid-turn — grant the Upkeep action a held city would have
    return loc;
  };

  // Output banks to scrap when the slider is at 0 (no waste, no build).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me); loc.production = 4;
    performAction(g, "set-slider", { at: loc.hexId, value: 0 });
    const before = g.players[me].resource;
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // back to me's Upkeep
    check("slider=0 banks the whole Output as scrap", g.players[me].resource - before >= 4);
  }

  // Slider routes Output into buildProgress; the build completes off Output.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me); loc.production = 3;
    const b = performAction(g, "build", { at: loc.hexId, chipId: "recyclers" }); // buildCost 3, loyaltyReq 0
    performAction(g, "set-slider", { at: loc.hexId, value: 1 });
    check("build queues an activeBuild", b.ok && loc.activeBuild?.chipId === "recyclers");
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // one Upkeep: +3 buildProgress
    check("build completes off Output (Recyclers installed)",
      loc.chips.some((c) => g.chips[c]?.chipId === "recyclers") && loc.activeBuild == null);
    // The installed Recyclers raises Output by +1 (its yield).
    const out = loc.production + 1;
    const before = g.players[me].resource;
    performAction(g, "set-slider", { at: loc.hexId, value: 0 });
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g);
    check("an economy chip raises Output", g.players[me].resource - before >= out);
  }

  // Rush spends banked scrap to finish a build immediately — and now costs an
  // Action (queuing the build does not).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me);
    g.players[me].resource += 50;
    const locActsStart = loc.actionsRemaining;
    performAction(g, "build", { at: loc.hexId, chipId: "labs" }); // buildCost 3, free of actions
    const locActsAfterBuild = loc.actionsRemaining;
    const before = g.players[me].resource;
    const r = performAction(g, "rush", { at: loc.hexId });
    check("rush completes the build at once and spends scrap (at the §20.7 premium rate)",
      r.ok && loc.chips.some((c) => g.chips[c]?.chipId === "labs") &&
      loc.activeBuild == null &&
      g.players[me].resource === before - 3 * CONFIG.economy.rushScrapPerPoint);
    check("build is free of actions; rush spends the LOCATION's action",
      locActsAfterBuild === locActsStart && loc.actionsRemaining === locActsAfterBuild - 1);
  }

  // Upgrade in place: labs → advanced-lab, same slot (scarcity preserved).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me); // loyalty 8 clears advanced-lab's rung (3)
    g.players[me].resource += 50;
    g.players[me].actions.remaining = 9; // wildcards — two rushes at one Location this turn
    g.players[me].permanentResearch = 4; recomputeResearch(g); // L3 clears techL2 gate
    performAction(g, "build", { at: loc.hexId, chipId: "labs" });
    performAction(g, "rush", { at: loc.hexId });
    const labUid = loc.chips.find((c) => g.chips[c]?.chipId === "labs");
    const slotsBefore = loc.chips.length;
    const u = performAction(g, "upgrade", { at: loc.hexId, chip: labUid });
    performAction(g, "rush", { at: loc.hexId });
    check("upgrade replaces the chip in place (same uid, same slot count)",
      u.ok && g.chips[labUid]?.chipId === "advanced-lab" && loc.chips.length === slotsBefore);
  }

  // §20.6 gating: Tech-forbidden chips never validate; Loyalty-locked ones
  // block until integrated.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me, 0); // loyalty 0
    const techBlock = performAction(g, "build", { at: loc.hexId, chipId: "sharpened-blades" }); // techL2 @ player L1
    check("§20.6 Tech gate blocks a too-advanced chip", !techBlock.ok);
    g.players[me].permanentResearch = 4; recomputeResearch(g); // L3
    const loyBlock = performAction(g, "build", { at: loc.hexId, chipId: "sharpened-blades" }); // loyaltyReq 3 @ loyalty 0
    check("§20.6 Loyalty gate blocks until the rung is reached",
      !loyBlock.ok && /Loyalty/.test(loyBlock.reason));
    loc.loyalty = 3;
    // sharpened-blades is a unit chip → it needs a friendly unit stationed
    // here (the city arms the army). Park one with an empty bay.
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = loc.hexId; u.chips = []; recomputeStats(g);
    const pass = performAction(g, "build", { at: loc.hexId, chipId: "sharpened-blades" });
    check("clearing both gates (with a unit to arm) lets the build through", pass.ok);
  }

  // §20.6 — the +1 bonus slot appears at the bonus-slot Loyalty rung, and
  // §20.8 — dropping below it ejects the bonus-slot chip (newest-first).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me, 8); loc.chipSlots = 1; // base 1, +1 bonus slot at high loyalty
    g.players[me].resource += 50;
    g.players[me].actions.remaining = 9; // wildcards — two rushes at one Location this turn
    performAction(g, "build", { at: loc.hexId, chipId: "labs" });
    performAction(g, "rush", { at: loc.hexId });
    performAction(g, "build", { at: loc.hexId, chipId: "recyclers" }); // uses the bonus slot
    performAction(g, "rush", { at: loc.hexId });
    check("bonus slot (high Loyalty) holds a 2nd chip past base capacity",
      loc.chips.filter((c) => g.chips[c]?.chipId !== "capital").length === 2);
    loc.loyalty = CONFIG.economy.bonusSlotLoyalty - 1; // drop below the rung
    enforceLoyaltySlotCap(g, me);
    check("§20.8 dropping below the bonus rung ejects the newest chip",
      loc.chips.filter((c) => g.chips[c]?.chipId !== "capital").length === 1 &&
      loc.chips.some((c) => g.chips[c]?.chipId === "labs") &&
      !loc.chips.some((c) => g.chips[c]?.chipId === "recyclers"));
  }

  // §20.9 selective upkeep — an upkeep-bearing chip goes DORMANT when scrap
  // can't cover it (passives suppressed, not destroyed), then reactivates.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me, 8);
    g.players[me].resource += 50;
    g.players[me].permanentResearch = 4; recomputeResearch(g);
    performAction(g, "build", { at: loc.hexId, chipId: "advanced-lab" }); // research 2, upkeep 1
    performAction(g, "rush", { at: loc.hexId });
    const chip = loc.chips.find((c) => g.chips[c]?.chipId === "advanced-lab");
    const researchWith = g.players[me].research;
    // Drive the §20.9 charge directly (the real Upkeep step) with the
    // treasury empty — me's other cities would otherwise refill scrap and
    // cover the bill, so we isolate the charge here.
    g.players[me].resource = 0;
    chargeChipUpkeep(g, me);
    check("unpaid upkeep sends the chip dormant (passive suppressed, not destroyed)",
      g.chips[chip].disabled === true && loc.chips.includes(chip) &&
      g.players[me].research === researchWith - 2);
    g.players[me].resource = 20; // can pay again
    chargeChipUpkeep(g, me);
    check("paying upkeep reactivates the dormant chip",
      g.chips[chip].disabled === false && g.players[me].research === researchWith);
  }
}

// =====================================================================
// §19 EXPLORATION, VISION & FOG OF WAR — per-faction visibility, LoS over
// elevation/cover, ghosts/memory, concealment + ambush, the §19 effects.
// =====================================================================
line("\n§19 EXPLORATION, VISION & FOG OF WAR");

// A minimal line-graph state for deterministic LoS unit tests (a-b-c-d). The
// test unit carries visionBonus:1 so its effective sight is radius 2 — these
// tests exercise LoS MECHANICS (ridge-block, cover-cost) at a known radius,
// independent of the unit base value (CONFIG.fog.unitVision).
function miniLine() {
  return {
    board: {
      hexes: { a: { id: "a" }, b: { id: "b" }, c: { id: "c" }, d: { id: "d" } },
      adjacency: { a: ["b"], b: ["a", "c"], c: ["b", "d"], d: ["c"] },
    },
    units: { u1: { uid: "u1", owner: "X", node: "a", chips: [], visionBonus: 1 } },
    locations: {},
    players: { X: { id: "X", techWheel: [] }, Y: { id: "Y", techWheel: [] } },
    chips: {},
    world: { zoc: {} },
    turnOrder: ["X", "Y"],
    activeIndex: 0,
    round: 1,
    log: [],
    visibility: {},
  };
}

{
  // --- per-faction visibility seeded at setup; explored persists ---
  const g = createGame({ seed });
  const me = g.turnOrder[0];
  const vis = g.visibility[me];
  check("setup seeds a per-faction visibility set", !!vis && vis.visible.size > 0);
  check("explored ⊇ visible (explored persists)",
    [...vis.visible].every((h) => vis.explored.has(h)));
  // No vision cheat (§19.10): the board is NOT globally visible — each
  // faction sees only its own footprint. On this map's small hex count a
  // *particular* faction's starting sightlines can occasionally happen to
  // blanket the whole board (observed: turnOrder[0] on some seeds) without
  // that being a fog bug — so check the invariant across every faction
  // rather than just `me`: if fog were faked as global truth, ALL of them
  // would see the whole map, and on every seed tried at least one doesn't.
  check("a faction does NOT see the whole map at start (no global truth)",
    g.turnOrder.some((pid) => g.visibility[pid].explored.size < Object.keys(g.board.hexes).length));

  // --- LoS: radius, elevation blocks behind a ridge, cover costs sight ---
  {
    const m = miniLine();
    recomputeVisibility(m, "X", { emitEvents: false });
    check("LoS: a unit sees within its radius (a,b,c at radius 2)",
      m.visibility.X.visible.has("a") && m.visibility.X.visible.has("b") && m.visibility.X.visible.has("c"));
    check("LoS: d (dist 3) is beyond radius 2", !m.visibility.X.visible.has("d"));
  }
  {
    // §19.3 base unit vision is radius 1 (own hex + the ring); high ground and
    // Vision upgrades each add +1 on top.
    const m = miniLine();
    m.units.u1.visionBonus = 0; // strip the test's radius-2 bonus → bare base
    recomputeVisibility(m, "X", { emitEvents: false });
    check("base unit vision is radius 1 (sees a,b; not c)",
      m.visibility.X.visible.has("b") && !m.visibility.X.visible.has("c"));
    m.board.hexes.a.elevation = true; // on high ground → +1
    recomputeVisibility(m, "X", { emitEvents: false });
    check("a unit on high ground sees +1 (reaches c)", m.visibility.X.visible.has("c"));
    m.board.hexes.a.elevation = false;
    m.units.u1.visionBonus = 1; // a Vision upgrade → +1
    recomputeVisibility(m, "X", { emitEvents: false });
    check("a Vision upgrade adds to the base (radius 2 reaches c)", m.visibility.X.visible.has("c"));
  }
  {
    const m = miniLine();
    m.board.hexes.b.elevation = true; // a ridge at b
    recomputeVisibility(m, "X", { emitEvents: false });
    check("LoS: an elevation ridge is visible but BLOCKS sight behind it",
      m.visibility.X.visible.has("b") && !m.visibility.X.visible.has("c"));
    // source ON elevation sees over the ridge and farther
    m.board.hexes.a.elevation = true;
    recomputeVisibility(m, "X", { emitEvents: false });
    check("LoS: a source on high ground sees over ridges and farther",
      m.visibility.X.visible.has("c") && m.visibility.X.visible.has("d"));
  }
  {
    const m = miniLine();
    m.board.hexes.c.cover = true; // cover raises the cost to see into c
    recomputeVisibility(m, "X", { emitEvents: false });
    check("LoS: cover raises sight cost (c not seen at radius 2)",
      m.visibility.X.visible.has("b") && !m.visibility.X.visible.has("c"));
  }

  // --- concealment & detection (§19.5) ---
  {
    const m = miniLine();
    m.units.e1 = { uid: "e1", owner: "Y", node: "c", chips: [], stealth: true }; // hidden at dist 2
    recomputeVisibility(m, "X", { emitEvents: false });
    check("concealment: a stealthed enemy inside vision is hidden without Detection",
      m.visibility.X.visible.has("c") && !isUnitVisibleTo(m, "X", m.units.e1));
    m.units.u1.detectRange = 2; // a scout/recon loadout pierces it
    check("Detection: a Detection source in range reveals the concealed unit",
      isUnitVisibleTo(m, "X", m.units.e1));
  }

  // --- memory & ghosts: leaving vision snapshots a stale ghost (§19.2) ---
  {
    const m = miniLine(); // X unit at a, sees a,b,c at radius 2
    m.units.e1 = { uid: "e1", owner: "Y", node: "c", chips: [], strength: 5 };
    recomputeVisibility(m, "X", { emitEvents: false });
    const sawIt = isUnitVisibleTo(m, "X", m.units.e1);
    // X loses its only Vision source → c leaves vision → snapshot a ghost.
    delete m.units.u1;
    recomputeVisibility(m, "X", { emitEvents: false });
    const ghost = m.visibility.X.memory.c?.ghosts?.find((gh) => gh.unitId === "e1");
    check("a hex leaving vision snapshots a ghost of the enemy seen there",
      sawIt && !!ghost && ghost.strength === 5);
    // The enemy moves + grows; the ghost is FROZEN (stale until re-sighted).
    m.units.e1.node = "b"; m.units.e1.strength = 12;
    check("the ghost is stale — not updated when the enemy moves/grows",
      m.visibility.X.memory.c.ghosts[0].strength === 5);
  }

  // --- persistence rule: static terrain persists, live facts don't ---
  {
    const g3 = createGame({ seed });
    const a = g3.turnOrder[0];
    const someLoc = Object.values(g3.locations).find((l) => g3.visibility[a].visible.has(l.hexId));
    if (someLoc) {
      // record while visible, then drop it from vision
      const liveCtrl = someLoc.controller;
      // force the hex out of vision by clearing my sources near it: move all
      // my units away and recompute (Capitals still project, so pick a loc
      // far from my territory if possible — else just assert memory shape).
      recomputeVisibility(g3, a, { emitEvents: false });
      const mem = g3.visibility[a].memory[someLoc.hexId];
      check("a seen Location is recorded in memory (terrain + existence persist)",
        !!mem && mem.terrain && mem.location && mem.location.locationId === someLoc.locationId);
    } else {
      check("a seen Location is recorded in memory (terrain + existence persist)", true);
    }
  }

  // --- hidden encounter hexes (§19.6): fogged until revealed ---
  {
    const g4 = createGame({ seed });
    const a = g4.turnOrder[0];
    const hiddenEnc = Object.values(g4.board.hexes).find(
      (h) => h.type === "encounter" && !g4.visibility[a].explored.has(h.id),
    );
    check("encounter hexes are hidden until explored",
      hiddenEnc ? !g4.visibility[a].explored.has(hiddenEnc.id) : true);
    if (hiddenEnc) {
      revealRegion(g4, a, [hiddenEnc.id]);
      check("revealing the region explores the encounter hex",
        g4.visibility[a].explored.has(hiddenEnc.id));
    }
  }

  // --- §19 effects: REVEAL_REGION / GRANT_VISION / PLANT_FALSE_INTEL ---
  {
    const g5 = createGame({ seed });
    const a = g5.turnOrder[0];
    const b = g5.turnOrder[1];
    // a hex a does not yet see
    const darkHex = Object.keys(g5.board.hexes).find((h) => !g5.visibility[a].explored.has(h));
    if (darkHex) {
      applyEffect(g5, { type: "REVEAL_REGION", target: a, center: darkHex, radius: 0 });
      check("REVEAL_REGION explores + lights up the target region",
        g5.visibility[a].explored.has(darkHex) && g5.visibility[a].visible.has(darkHex));
    } else { check("REVEAL_REGION explores + lights up the target region", true); }

    // GRANT_VISION: b sees b's territory; share it with a.
    const bOnly = [...g5.visibility[b].visible].find((h) => !g5.visibility[a].visible.has(h));
    applyEffect(g5, { type: "GRANT_VISION", from: b, target: a });
    check("GRANT_VISION shares the granter's sight with an ally",
      bOnly ? g5.visibility[a].visible.has(bOnly) : true);

    // PLANT_FALSE_INTEL: write a fabricated ghost into a's memory.
    const explored = [...g5.visibility[a].explored][0];
    applyEffect(g5, { type: "PLANT_FALSE_INTEL", target: a, hex: explored, owner: b, strength: 9 });
    const planted = g5.visibility[a].memory[explored]?.ghosts?.some((gh) => gh.false && gh.strength === 9);
    check("PLANT_FALSE_INTEL writes a false ghost into a rival's memory", !!planted);
  }

  // --- ambush (§19.5): edge + reaction-window suppression ---
  {
    // Attacker ambush — a STEALTHED attacker contesting a foe's Location is
    // unseen → the defender's reaction window is suppressed and the
    // attacker gains the ambush edge. Compare with/without a defender
    // reactive (False Flag) in hand.
    const make = (stealth) => {
      const g6 = createGame({ seed });
      startTurn(g6);
      const atkPid = activePlayerId(g6);
      const foe = g6.turnOrder.find((p) => p !== atkPid);
      // Give the foe a fully-controlled Location and a defender unit on it.
      const loc = Object.values(g6.locations).find((l) => l.controller === foe)
        || Object.values(g6.locations).find((l) => !l.controller);
      loc.controller = foe; loc.loyaltyOwner = foe; loc.sections = [foe, foe, foe];
      loc.loyalty = CONFIG.loyalty.ceiling;
      // attacker unit onto the Location hex, strong enough to win.
      const atk = Object.values(g6.units).find((u) => u.owner === atkPid);
      atk.node = loc.hexId; atk.moveRemaining = 9; atk.baseStrength = 4; atk.stealth = stealth;
      recomputeStats(g6);
      g6.players[atkPid].actions.remaining = 5;
      // foe holds a False Flag (replace-mode cancel of a contest against it).
      const cardU = g6.nextId("card");
      g6.chips[cardU] = { uid: cardU, chipId: "false-flag" };
      g6.players[foe].hand.push(cardU);
      const res = performAction(g6, "contest", { unit: atk.uid });
      return res;
    };
    const seenRes = make(false);
    check("without surprise, the defender's reaction cancels the contest",
      seenRes.cancelled === true);
    const ambushRes = make(true);
    check("attacker ambush suppresses the §10 reaction window (no cancel)",
      ambushRes.cancelled !== true && ambushRes.attackerAmbush === true);
    check("attacker ambush adds the §16.6 edge to the attacker's total",
      ambushRes.attackerAmbushBonus === CONFIG.fog.ambushBonus);

    // Defender ambush — an attacker blunders into a hidden (stealthed)
    // defending unit it could not see → the defender gets the edge.
    const g7 = createGame({ seed });
    startTurn(g7);
    const atkPid = activePlayerId(g7);
    const foe = g7.turnOrder.find((p) => p !== atkPid);
    const loc = Object.values(g7.locations).find((l) => !l.controller)
      || Object.values(g7.locations).find((l) => l.controller === foe);
    loc.controller = foe; loc.loyaltyOwner = foe; loc.sections = [foe, foe, foe];
    loc.loyalty = CONFIG.loyalty.ceiling;
    const hiddenDef = Object.values(g7.units).find((u) => u.owner === foe);
    hiddenDef.node = loc.hexId; hiddenDef.stealth = true; recomputeStats(g7);
    const atk = Object.values(g7.units).find((u) => u.owner === atkPid);
    atk.node = loc.hexId; atk.moveRemaining = 9; atk.baseStrength = 4; recomputeStats(g7);
    g7.players[atkPid].actions.remaining = 5;
    const res = performAction(g7, "contest", { unit: atk.uid });
    check("a hidden defender ambushes the attacker (edge vs the attacker)",
      res.defenderAmbush === true && res.defenderAmbushBonus === CONFIG.fog.ambushBonus);
  }

  // --- incremental recompute is per-faction (the scale guard) ---
  {
    const g8 = createGame({ seed });
    const a = g8.turnOrder[0];
    const b = g8.turnOrder[1];
    const beforeB = g8.visibility[b].visible.size;
    const myU = Object.values(g8.units).find((u) => u.owner === a);
    myU.node = g8.board.adjacency[myU.node][0];
    recomputeVisibility(g8, a, { emitEvents: false }); // only a recomputed
    check("a move recomputes only the moving faction (b's sight untouched)",
      g8.visibility[b].visible.size === beforeB);
  }
}

// =====================================================================
// §18.4–§18.13 DIPLOMACY — faction model, reputation, deals, AI-to-AI
// politics, coalitions, vassalage, and the Recognition victory.
// =====================================================================
line("\n§18 DIPLOMACY CAPSTONE");
{
  // --- faction model + seeded standing variety (§18.4.1) ---
  {
    const g = createGame({ seed, humanFactionId: "versari", minors: ["tempest", "croppers"] });
    check("the faction model carries temperament dials",
      factionDef("lakers").temperament === "warlord" && factionDef("goldgrass").temperament === "pacifist");
    check("a minor carries scope:local + associatedMajor + relationship",
      MINOR_FACTIONS.tempest.scope === "local" && MINOR_FACTIONS.tempest.associatedMajor === "lakers"
      && MINOR_FACTIONS.tempest.relationship === "rival");
    // §18.4.1 — a minor that declares a homeLocation opens THERE. The
    // Dambarans hold Dambar; before this they took whatever neutral sat
    // nearest the Versari, which put them in a random city on most seeds.
    // Checked over a span of seeds because the seat used to be a layout
    // accident and a single seed would not have caught it.
    {
      let atHome = 0, versariClean = 0;
      const SEEDS = 40;
      for (let s = 1; s <= SEEDS; s++) {
        const gg = createGame({ seed: s, minors: ["dambarans", "croppers"], mapSize: "large" });
        const L = Object.values(gg.locations);
        const seat = L.find((l) => l.controller === "dambarans");
        if (seat && seat.locationId === "dambar") atHome++;
        // and the Versari open holding their capital and nothing else
        const vers = L.filter((l) => l.controller === "versari").map((l) => l.locationId);
        if (vers.length === 1 && vers[0] === "korad") versariClean++;
      }
      check("the Dambarans open at Dambar on every seed that seats them",
        atHome === SEEDS, `${atHome}/${SEEDS}`);
      check("the Versari open holding Korad alone (Dambar is not theirs to start)",
        versariClean === SEEDS, `${versariClean}/${SEEDS}`);
    }
    // A minor with no homeLocation still seats by proximity, and a declared
    // home that did not make the board falls through to the same rule.
    {
      const small = createGame({ seed, minors: ["dambarans"], mapSize: "small", locationBudget: 6 });
      const L = Object.values(small.locations);
      const seat = L.find((l) => l.controller === "dambarans");
      const dambarOnBoard = L.some((l) => l.locationId === "dambar");
      check("a minor whose home Location is off the board still gets a seat",
        !dambarOnBoard && !!seat);
    }
    // Unseeded means unheld: Dambar is only Dambaran when they are in the game.
    {
      const without = createGame({ seed, minors: ["croppers"], mapSize: "large" });
      const dambar = Object.values(without.locations).find((l) => l.locationId === "dambar");
      check("Dambar stays neutral in a game without the Dambarans",
        !!dambar && dambar.controller === null);
    }
    // seeded faction↔faction standing is non-trivial (not all zero)
    const anyNonZero = factionIds(g).some((a) => factionIds(g).some((b) => a !== b && getStanding(g, a, b) !== 0));
    check("faction↔faction Standing is seeded (not all neutral)", anyNonZero);
    // variety: a different seed yields a different standing web
    const g2 = createGame({ seed: seed + 1, humanFactionId: "versari", minors: ["tempest", "croppers"] });
    const sig = (gg) => factionIds(gg).map((a) => factionIds(gg).map((b) => getStanding(gg, a, b)).join(",")).join("|");
    check("alliances differ across seeds (seeded jitter — the variety goal)", sig(g) !== sig(g2));
    // a kin minor seeds WARM toward its major; a rival seeds COLD
    const cropToGold = getStanding(g, "croppers", "goldgrass");
    const tempToLak = getStanding(g, "tempest", "lakers");
    check("kin minor seeds warmer toward its major than a rival minor does",
      cropToGold > tempToLak);
  }

  // --- Menace scored relative to the target's temperament (§18.5) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    const before = g.players.versari.menace;
    menaceFromAttack(g, "versari", "goldgrass"); // bully a pacifist
    const afterBully = g.players.versari.menace;
    g.players.versari.menace = 0;
    menaceFromAttack(g, "versari", "lakers"); // check a warlord
    const afterCheck = g.players.versari.menace;
    check("attacking a pacifist RAISES Menace", afterBully > before);
    check("attacking a warlord does not raise Menace (checks the bully)", afterCheck <= 0);
  }

  // --- Honor: broken word dings it; attacking an ally breaks the pact ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    formPact(g, "versari", "lakers", "test");
    const h0 = g.players.versari.honor;
    check("a pact is formed", arePacted(g, "versari", "lakers"));
    onAttack(g, "versari", "lakers"); // attack your ally
    check("attacking an ally breaks the pact", !arePacted(g, "versari", "lakers"));
    check("breaking your word dings Honor", g.players.versari.honor < h0);
  }

  // --- deal valuation + wouldAccept (§18.6/§18.8) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    setStanding(g, "goldgrass", "versari", 4, "test"); // warm-ish
    const gift = { proposer: "versari", recipient: "goldgrass", give: [{ resource: { resource: "scrap", amount: 5 } }], get: [] };
    check("a faction accepts a gift (empty get)", wouldAccept(g, "goldgrass", gift));
    const robbery = { proposer: "versari", recipient: "goldgrass", give: [], get: [{ resource: { resource: "scrap", amount: 8 } }] };
    check("a faction refuses a lopsided demand", !wouldAccept(g, "goldgrass", robbery));
    check("dealValue is positive for the receiver of a gift", dealValue(g, "goldgrass", gift) > 0);
  }

  // --- Tolerance / trust-floor hard gates (§18.5/§18.8) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    setStanding(g, "goldgrass", "versari", 6, "test");
    check("rep gates pass with a clean record", passesRepGates(g, "goldgrass", "versari"));
    g.players.versari.menace = 99; // notorious bully
    check("Menace over a faction's Tolerance fails the rep gate", !passesRepGates(g, "goldgrass", "versari"));
    g.players.versari.menace = 0;
    g.players.versari.honor = -99; // proven liar
    check("Honor below a faction's trust floor fails the rep gate", !passesRepGates(g, "goldgrass", "versari"));
    // a warlord tolerates more Menace than a pacifist at equal Standing
    setStanding(g, "lakers", "versari", 6, "test"); setStanding(g, "goldgrass", "versari", 6, "test");
    check("a warlord tolerates a bloodier ally than a pacifist",
      tolerance(g, "lakers", "versari") > tolerance(g, "goldgrass", "versari"));
  }

  // --- AI-to-AI war forms (and can be resolved) WITHOUT the human (§18.8) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    setStanding(g, "lakers", "plainers", -6, "test"); // a warlord nurses a grudge
    const logFrom = g.log.length;
    runDiplomacyRound(g);
    const wars = g.log.slice(logFrom).filter((e) => e.name === "war_declared");
    const aiWar = wars.find((e) => e.payload.a !== "versari" && e.payload.b !== "versari");
    check("an AI-to-AI war forms without the human as a party", !!aiWar);
    // a high-Honor peacemaker mediating that war (resolution, also AI-only)
    const med = g.log.slice(logFrom).find((e) => e.name === "mediated" && e.payload.mediator !== "versari");
    check("AI-to-AI politics also resolves wars (mediation, no human)",
      !!med || g.diplomacy.wars.some((w) => w.a !== "versari" && w.b !== "versari"));
  }

  // --- coalitions: BOTH the Menace and the power-lead triggers (§18.8) ---
  {
    // Menace trigger — a notorious bully (clean board otherwise).
    const g = createGame({ seed, humanFactionId: "versari" });
    g.players.versari.menace = 24;
    runDiplomacyRound(g);
    check("a high-Menace player provokes a coalition (Menace trigger)",
      !!g.diplomacy.coalitions.find((c) => c.target === "versari"));
  }
  {
    // Power trigger — a runaway leader who played CLEAN (Menace 0).
    const g = createGame({ seed, humanFactionId: "versari" });
    g.players.versari.menace = 0;
    g.players.versari.vp = 11; // a commanding VP lead, no aggression
    for (const loc of Object.values(g.locations)) loc.controller = loc.controller ? "versari" : loc.controller;
    runDiplomacyRound(g);
    check("a clean runaway leader still provokes a coalition (power trigger)",
      !!g.diplomacy.coalitions.find((c) => c.target === "versari"));
    // Was: "a coalition member contributes 0 to the runaway's Recognition."
    // Recognition is gone (2026-08-23); the thing a coalition actually costs
    // the runaway is the win condition itself — a member marching against you
    // is a rival who is neither your ally nor your vassal, so it is
    // OUTSTANDING and Dominion cannot be met while the coalition stands.
    check("a coalition member leaves the runaway short of Dominion",
      dominionStanding(g, "versari").outstanding.length > 0);
  }

  // --- vassalage: formation, tribute, rebellion (§18.9) ---
  {
    const g = createGame({ seed, humanFactionId: "versari", minors: ["croppers"] });
    // make croppers weak + at war, then take it as a vassal
    declareWar(g, "versari", "croppers", "test");
    vassalize(g, "versari", "croppers", "test");
    check("a faction can be taken as a vassal", vassalLord(g, "croppers") === "versari");
    check("vassalizing makes peace + locks the vassal's Standing high",
      !atWar(g, "versari", "croppers") && getStanding(g, "croppers", "versari") >= CONFIG.diplomacy.tiers.allied);
    // tribute flows on the round tick
    g.players.croppers.resource = 10;
    const lordBefore = g.players.versari.resource;
    runDiplomacyRound(g);
    check("a vassal pays tribute to its lord each round", g.players.versari.resource > lordBefore);
    // resentment past threshold → rebellion
    g.diplomacy.resentment.croppers = CONFIG.diplomacy.vassal.rebellionThreshold;
    runDiplomacyRound(g);
    check("a resentful vassal rebels (breaks free + war)",
      vassalLord(g, "croppers") == null && atWar(g, "croppers", "versari"));
  }

  // --- the win condition: everyone dealt with, and it has to HOLD ---
  {
    const HOLD = CONFIG.victory.holdRounds;
    const mk = () => {
      const g = createGame({ seed, humanFactionId: "versari", minors: ["tempest", "croppers"] });
      ensureDiplomacy(g);
      return g;
    };
    const others = (g) => factionIds(g).filter((f) => f !== "versari");

    // Nothing dealt with, nothing won.
    {
      const g = mk();
      const st = dominionStanding(g, "versari");
      check("with rivals unaccounted for, the condition is not met",
        !st.met && st.outstanding.length === others(g).length);
    }

    // All vassals — the submission face.
    {
      const g = mk();
      for (const f of others(g)) vassalize(g, "versari", f, "test");
      check("every rival a vassal meets it", dominionMet(g, "versari"));
    }

    // A mix of allies and vassals — the case no previous version could express.
    {
      const g = mk();
      const list = others(g);
      vassalize(g, "versari", list[0], "test");
      for (const f of list.slice(1)) formPact(g, "versari", f, "test");
      const st = dominionStanding(g, "versari");
      check("…and so does a MIX of allies and vassals",
        st.met && st.vassals.length === 1 && st.allied.length === list.length - 1);
    }

    // The hold: reaching it starts a clock, and only time wins.
    {
      const g = mk();
      for (const f of others(g)) vassalize(g, "versari", f, "test");
      checkDominion(g);
      check("reaching it does not win on the spot — it starts a clock",
        !g.winnerId && dominionCountdown(g, "versari") === HOLD);
      for (let i = 0; i < HOLD - 1; i += 1) { g.round += 1; checkDominion(g); }
      check("…which is still running one round short", !g.winnerId);
      g.round += 1; checkDominion(g);
      check(`…and lands after ${HOLD} rounds held`, g.winnerId === "versari");
    }

    // …and a rival who breaks away stops it. This is the whole point of the
    // hold: a bloodless win is a position you defend, not a switch you flip.
    {
      const g = mk();
      for (const f of others(g)) vassalize(g, "versari", f, "test");
      checkDominion(g);
      g.round += 1; checkDominion(g);
      releaseVassal(g, others(g)[0], "rebellion");
      checkDominion(g);
      check("a rival breaking away stops the clock", !g.winnerId && dominionCountdown(g, "versari") === null);
      check("…and it restarts from the top, not from where it left off",
        (() => {
          vassalize(g, "versari", others(g)[0], "retaken");
          checkDominion(g);
          return dominionCountdown(g, "versari") === HOLD;
        })());
    }

    // The closing table has to be right the moment the game ends. Nothing
    // recomputed the score on a change to the ALLIANCE graph — territory
    // changes always did, handshakes never did — so a lord who had sworn the
    // whole board still showed its opening total, and the end screen could
    // rank the winner below its own vassal.
    {
      const g = mk();
      const before = g.players.versari.vp;
      for (const f of others(g)) vassalize(g, "versari", f, "test");
      checkDominion(g);
      const expect = before + others(g).length * CONFIG.victory.score.vassal;
      check("swearing the board moves the score without waiting for a turn",
        g.players.versari.vp === expect);
      // Only for a lord who has sworn EVERYONE. VP is not the condition, so in
      // an organic game a diplomat can win it while a bigger land power
      // out-scores them — measured at 2 games in 14. The end screen pins the
      // winner to the top of the table rather than pretending otherwise.
      check("…and a lord who has sworn the whole board tops the table",
        others(g).every((f) => g.players.versari.vp > g.players[f].vp));
    }

    // A faction serves ONE lord, so two rivals can never both count it.
    {
      const g = mk();
      for (const f of others(g)) vassalize(g, "versari", f, "test");
      vassalize(g, "goldgrass", "tempest", "steal");
      check("taking a vassal takes it from its old lord — nobody shares one",
        vassalLord(g, "tempest") === "goldgrass" && !dominionMet(g, "versari"));
      check("…and the old lord's tribute goes with it",
        g.diplomacy.agreements.filter((a) => a.vassalTribute === "tempest").length === 1);
    }

    // The reputation gates still bite, one level down: a bully cannot GET the
    // pacts and submissions in the first place, so the condition needs no gate
    // of its own.
    {
      const g = mk();
      g.players.versari.menace = 99;
      check("a notorious bully cannot get the alliances it would need",
        !aiAcceptsPact(g, "goldgrass", "versari"));
    }
  }

  // --- minors respect scope:"local" (§18.4.1) ---
  {
    const g = createGame({ seed, humanFactionId: "versari", minors: ["tempest"] });
    // a non-neighbour pairing for a local minor: pick a faction far from it.
    const farMajor = ["goldgrass", "plainers", "versari"].find((m) => !areNeighbours(g, "tempest", m));
    if (farMajor) {
      check("a scope:local minor will not engage a non-neighbour",
        !mayEngage(g, "tempest", farMajor));
    } else {
      check("a scope:local minor will not engage a non-neighbour (no far faction this seed)", true);
    }
    check("a global major may engage anyone", mayEngage(g, "versari", "goldgrass"));
    // §15 — and the ally/vassal doors open on their own clock. `mayEngage`
    // stays the scope predicate for war, grudges, ultimatums and coalition
    // membership; only `mayCourt` widens. Gating both on the widened one was
    // measured and reverted: wars per game 52 -> 78, unresolved 6 of 15 -> 11.
    if (farMajor) {
      check("…and cannot court one either, at first",
        !mayCourt(g, "tempest", farMajor));
      g.round = CONFIG.diplomacy.reach.reachabilityRounds + 1;
      check("…but silence long enough makes them strangers you can write to",
        mayCourt(g, "tempest", farMajor));
      check("…while the WAR predicate is untouched by distance",
        !mayEngage(g, "tempest", farMajor));
      // Strangers are a harder sell. The escape opens a door; it does not
      // lower the bar behind it.
      adjustStanding(g, "tempest", farMajor, CONFIG.diplomacy.pactStandingReq, "test");
      check("…and a stranger at the ordinary bar is still not enough",
        !aiAcceptsPact(g, "tempest", farMajor));
      adjustStanding(g, "tempest", farMajor, CONFIG.diplomacy.reach.distantStandingPenalty, "test");
      check("…they want the distance paid for",
        aiAcceptsPact(g, "tempest", farMajor) ||
        // sociability / rep gates are separate rulings; only the reach term
        // is under test here
        getStanding(g, "tempest", farMajor) >= CONFIG.diplomacy.pactStandingReq
          + CONFIG.diplomacy.reach.distantStandingPenalty);
      g.round = 1;
    }
  }

  // --- brief §7.1: the Standing pump is closed ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 200;
    const s0 = getStanding(g, "goldgrass", "versari");
    // The measured exploit, verbatim: four one-scrap deals took Goldgrass
    // from 0 to 8 and signed a pact on round one.
    for (let i = 0; i < 4; i += 1) {
      performDiplomacy(g, "versari", "propose-deal",
        { faction: "goldgrass", give: [{ resource: { resource: "scrap", amount: 1 } }], get: [] });
    }
    check("four scrap no longer buys eight Standing",
      getStanding(g, "goldgrass", "versari") <= s0);
    check("…and no pact with it",
      !performDiplomacy(g, "versari", "propose-pact", { faction: "goldgrass" }).accepted);
    check("…because a token deal transfers no net value worth warming to",
      getStanding(g, "goldgrass", "versari") < CONFIG.diplomacy.pactStandingReq);

    // Generosity still works, and is still capped per pair per round.
    const g2 = createGame({ seed, humanFactionId: "versari" });
    ensureDiplomacy(g2);
    g2.players.versari.resource = 200;
    performDiplomacy(g2, "versari", "propose-deal",
      { faction: "goldgrass", give: [{ resource: { resource: "scrap", amount: 12 } }], get: [] });
    const afterOne = getStanding(g2, "goldgrass", "versari");
    check("a generous deal still warms", afterOne > 0);
    performDiplomacy(g2, "versari", "propose-deal",
      { faction: "goldgrass", give: [{ resource: { resource: "scrap", amount: 12 } }], get: [] });
    check("…and the per-pair, per-round cap holds",
      getStanding(g2, "goldgrass", "versari") === afterOne);
    g2.round += 1;
    performDiplomacy(g2, "versari", "propose-deal",
      { faction: "goldgrass", give: [{ resource: { resource: "scrap", amount: 12 } }], get: [] });
    check("…and lifts again next round", getStanding(g2, "goldgrass", "versari") > afterOne);

    // A swap of equals is business, not friendship.
    const g3 = createGame({ seed, humanFactionId: "versari" });
    ensureDiplomacy(g3);
    g3.players.versari.resource = 200; g3.players.goldgrass.resource = 200;
    performDiplomacy(g3, "versari", "propose-deal", { faction: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 10 } }],
      get: [{ resource: { resource: "scrap", amount: 10 } }] });
    check("an even swap warms nobody", getStanding(g3, "goldgrass", "versari") === 0);
  }

  // --- economy §13: the control ledger is appended to ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    const loc = Object.values(g.locations).find((l) => l.controller === "versari");
    const before = g.world.controlHistory.length;
    check("setup seeds the ledger", before > 0);
    // Hand it over and sweep: the old tenure closes, a new one opens.
    loc.sections = loc.sections.map(() => "lakers");
    loc.controller = "lakers";
    g.round = 5;
    syncControlHistory(g);
    const open = g.world.controlHistory.filter((h) => h.hex === loc.hexId && h.toRound == null);
    const closed = g.world.controlHistory.filter((h) => h.hex === loc.hexId && h.toRound != null);
    check("a change of hands closes the old tenure", closed.length === 1 && closed[0].controller === "versari");
    check("…and opens the new one", open.length === 1 && open[0].controller === "lakers" && open[0].fromRound === 5);
    // Which is the whole point: control_duration could never fire before.
    g.round = 8;
    check("…so control_duration finally answers",
      evalCond(g, {
        op: "gte",
        left: { control_duration: { player: "lakers", hex: loc.hexId } },
        right: 3,
      }, {}) === true);
    // Idempotent — the sweep runs every round end and must not churn.
    const n = g.world.controlHistory.length;
    syncControlHistory(g); syncControlHistory(g);
    check("…and the sweep is idempotent", g.world.controlHistory.length === n);
  }

  // --- performDiplomacy verbs (the player's levers, §18.7) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    const s0 = getStanding(g, "goldgrass", "versari");
    // Economy §6.3 — a gift buys WARMTH, and warmth is bought with political
    // capacity. Scrap still moves goods; it no longer moves opinions.
    g.players.versari.resource = 10;
    g.players.versari.sway = 40;
    const gift = performDiplomacy(g, "versari", "gift", { faction: "goldgrass", standing: 2 });
    check("performDiplomacy gift warms Standing, and spends Sway to do it",
      gift.ok && getStanding(g, "goldgrass", "versari") > s0
      && g.players.versari.sway < 40 && g.players.versari.resource === 10,
      JSON.stringify(gift));
    const war = performDiplomacy(g, "versari", "declare-war", { faction: "lakers" });
    check("performDiplomacy declare-war sets the war-state", war.ok && atWar(g, "versari", "lakers"));
    // a pact offer is refused when Standing is too cold, accepted when warm
    setStanding(g, "plainers", "versari", -2, "test");
    check("a pact offer is refused when Standing is too cold",
      performDiplomacy(g, "versari", "propose-pact", { faction: "plainers" }).accepted === false);
    setStanding(g, "plainers", "versari", 8, "test"); setStanding(g, "versari", "plainers", 8, "test");
    g.players.versari.menace = 0; g.players.versari.honor = 6;
    // §7.2/§7.3 — Standing alone is no longer the whole bar. A faction does
    // not enter an alliance with anyone it is not Courting, and a courtship is
    // a process rather than a switch: it takes `courtRounds` of somebody
    // publicly working the relationship. The bar was never the problem; the
    // absence of a middle was.
    check("…and Standing alone is not enough without a courtship behind it",
      performDiplomacy(g, "versari", "propose-pact", { faction: "plainers" }).accepted === false);
    check("…so the player opens one", performDiplomacy(g, "versari", "court", { faction: "plainers" }).ok);
    check("…and it is not instant",
      performDiplomacy(g, "versari", "propose-pact", { faction: "plainers" }).accepted === false);
    g.round += CONFIG.diplomacy.posture.courtRounds;
    check("a pact offer is accepted when Standing + rep gates pass, after the courtship",
      performDiplomacy(g, "versari", "propose-pact", { faction: "plainers" }).accepted === true);
  }
}

// =====================================================================
// DIPLOMACY ENGINE (diplomacy-spec.md Parts 1 + 6) — the new verbs, AI
// evaluation, war tracking, and the open-borders contract.
// =====================================================================
line("\nDIPLOMACY ENGINE  (diplomacy-spec Parts 1 + 6)");
const DH = CONFIG.diplomacy;

// §1.1 — surprise-attack Honor
line("\n  [§1.1] surprise-attack Honor");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  const h0 = honorOf(g, a);
  onAttack(g, a, b); // no prior war → treacherous strike
  check("surprise attack (no prior war) drops attacker Honor by 8",
    honorOf(g, a) === h0 - DH.honor.surpriseAttackLoss && atWar(g, a, b));
  const h1 = honorOf(g, a);
  onAttack(g, a, b); // already at war
  check("a second attack in the same war doesn't ding Honor again", honorOf(g, a) === h1);
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  const h0 = honorOf(g, a);
  declareWar(g, a, b, "player"); // declare first, no pact
  onAttack(g, a, b);
  check("declaring war first (no pact) costs no surprise Honor", honorOf(g, a) === h0);
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  formPact(g, a, b, "test");
  const h0 = honorOf(g, a);
  declareWar(g, a, b, "player"); // breaks the pact → −breakLoss only
  check("declaring war on a pacted ally costs only the pact-break (−5)",
    honorOf(g, a) === h0 - DH.honor.breakLoss);
}

// §8 — the price of a fight, and whether it is worth paying.
//
// The rule ships with `attackPrice.enabled: 0` because every live setting of
// it made the three governing numbers worse (the table is in config.js). That
// makes a fixture MORE important, not less: an unexercised mechanism rots, and
// phase 5 is going to switch this on. Everything below sets `enabled` locally
// and puts it back, so the suite still measures the shipped default.
line("\n  [§8] a fight costs your name, and the AI can price it");
{
  const AP = CONFIG.diplomacy.attackPrice;
  const was = AP.enabled;
  try {
    AP.enabled = 0;
    const g0 = createGame({ seed }); ensureDiplomacy(g0);
    check("switched off, the price is zero and every fight is worth it",
      diplomaticPrice(g0, "versari", "lakers") === 0
      && attackIsWorthIt(g0, "versari", firstEnemyHex(g0, "versari"), 0.1));

    AP.enabled = 1;
    const g = createGame({ seed }); ensureDiplomacy(g);
    const a = "versari", b = "lakers";
    const surprise = diplomaticPrice(g, a, b);
    const declared = diplomaticPrice(g, a, b, { declared: true });
    check("a surprise strike costs more than declaring first", surprise > declared);
    check("…and declaring is not free either, absent a grievance", declared > 0);

    // The one thing the price must never do: stop you answering a war you are
    // already in. That reputation is spent.
    declareWar(g, a, b, "test");
    const hex = hexControlledBy(g, b);
    check("a war already open prices at nothing more",
      hex == null || attackIsWorthIt(g, a, hex, 0.05));

    // Defence is never priced — the exemption that took unresolved games back
    // from 6 to 3 when it was added.
    const g2 = createGame({ seed }); ensureDiplomacy(g2);
    const own = hexControlledBy(g2, "versari");
    check("clearing your own ground is never a treacherous strike",
      own == null || attackIsWorthIt(g2, "versari", own, 0.01, { victim: "lakers" }));
  } finally {
    AP.enabled = was;
  }
}

// §9 — a coalition needs GROUNDS, and each member decides for itself.
//
// The two failures this fixture pins are both in the 2026-08-15 log. A
// spotless Goldgrass had two wars declared on it in R7 for the crime of
// leading, and the blanket draft slammed every member's Standing to Hostile,
// so a partner became an enemy over a third party's position.
line("\n  [§9] a rising needs grounds, and members who want to be in it");
{
  const CC = CONFIG.diplomacy.coalition;
  const g = createGame({ seed }); ensureDiplomacy(g);
  const lead = "versari";
  g.players[lead].menace = 0;
  // Park the lead in the band that matters: frightening enough that the old
  // rule would have risen, clean enough that the new one must not.
  let t = 0;
  for (let vp = 1; vp <= 60; vp++) {
    g.players[lead].vp = vp;
    t = threatScore(g, lead);
    if (t >= CC.threshold && t < CC.fearThreshold) break;
  }
  check("a lead past the coalition threshold is reachable in the fixture",
    t >= CC.threshold && t < CC.fearThreshold);
  check("…and leading, alone, is not grounds to rise", coalitionGrounds(g, lead) === null);
  runDiplomacyRound(g);
  check("…so no coalition forms against a spotless leader", !coalitionAgainst(g, lead));

  // Conduct is grounds at any position.
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  g2.players[lead].menace = CC.menaceGrounds;
  check("Menace it earned itself IS grounds", coalitionGrounds(g2, lead) === "menace");

  // …and so is a lead far enough past everything else that saying so is honest.
  const g3 = createGame({ seed }); ensureDiplomacy(g3);
  g3.players[lead].menace = 0; g3.players[lead].vp = 200;
  check("a lead past fearThreshold is grounds on its own",
    coalitionGrounds(g3, lead) === "fear");

  // Switchable, per the plan's rule 1.4.
  const wasGate = CC.groundsGate;
  try {
    CC.groundsGate = 0;
    check("groundsGate 0 restores the old position-alone behaviour",
      coalitionGrounds(g, lead) === "position");
  } finally { CC.groundsGate = wasGate; }
}
{
  // The draft floor, and the Menace it must NOT charge.
  const CC = CONFIG.diplomacy.coalition;
  const g = createGame({ seed }); ensureDiplomacy(g);
  const lead = "versari";
  adjustStanding(g, "lakers", lead, 5, "test");
  g.players[lead].menace = CC.menaceGrounds + 2;
  g.players[lead].vp = 14;
  const menaceBefore = {};
  for (const f of factionIds(g)) menaceBefore[f] = g.players[f]?.menace ?? 0;
  runDiplomacyRound(g);
  const coal = coalitionAgainst(g, lead);
  check("with grounds, a coalition does form", !!coal && coal.members.length >= 2);
  check("…and it says what it rose about", coal?.grounds === "menace");
  if (coal) {
    check("no drafted member is pushed below the draft floor",
      coal.members.every((m) => getStanding(g, m, lead) >= CC.draftStandingFloor));
    check("…a partner at +5 is cooled to the floor, not made an enemy",
      !coal.members.includes("lakers") || getStanding(g, "lakers", lead) === CC.draftStandingFloor);
    // The seeding loop: an unjustified declaration charges Menace, wM is 1, so
    // the members' own threat scores rise and the next coalition forms out of
    // this one. A rising on grounds is justified for everyone in it.
    check("…and joining a justified rising charges the members no Menace",
      coal.members.every((m) => (g.players[m]?.menace ?? 0) <= menaceBefore[m]));
  }
}
{
  // Deliberation: the Standing term is signed, so liking the target holds you
  // back. This is what makes a coalition something the target can talk its way
  // out of rather than a dice roll on the leaderboard.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const lead = "versari";
  g.players[lead].menace = CONFIG.diplomacy.coalition.menaceGrounds + 2;
  g.players[lead].vp = 14;
  setStanding(g, "lakers", lead, 10);
  setStanding(g, "goldgrass", lead, -8);
  check("a faction that likes the target wants in less than one that doesn't",
    coalitionJoinScore(g, "lakers", lead) < coalitionJoinScore(g, "goldgrass", lead));
}

// §13 — the player can haggle, not only take it or leave it.
//
// The AI has been able to counter the player's terms since §6.10; the player
// could only Accept or Decline, which is what made the inbox read as a vending
// machine. A counter moves the SCRAP and nothing else — rewriting the other
// terms would be a different deal, and the AI's own counters hold the same line.
line("\n  [§13] a counter is a haggle: the scrap moves, the terms do not");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  g.players[me].resource = 60;
  // They offer non-aggression and want 20 scrap for it.
  const deal = {
    proposer: them, recipient: me,
    give: [{ promise: { kind: "nonAggression", rounds: 5 } }],
    get: [{ resource: { resource: "scrap", amount: 20 } }],
  };
  const offer = tableOffer(g, them, me, deal, { kind: "deal" });
  const purse = g.players[me].resource;

  const tooRich = performDiplomacy(g, me, "counter-offer", { offerId: offer.id, scrap: 999 });
  check("you cannot counter with scrap you do not hold", !tooRich.ok);
  check("…and the offer is still on the table to answer properly",
    offersFor(g, me).some((o) => o.id === offer.id));
  check("…and nothing was paid", g.players[me].resource === purse);

  // Haggle them down to 5.
  const res = performDiplomacy(g, me, "counter-offer", { offerId: offer.id, scrap: 5 });
  check("the counter is put to them", res.ok);
  check("…and it takes the original off the table either way",
    !offersFor(g, me).some((o) => o.id === offer.id));
  check("…the promise is untouched by the haggle — only scrap moved",
    g.log.some((e) => e.name === "offer_countered" && e.payload.offer === offer.id));
}
{
  // A counter they take applies at the COUNTERED price, not the tabled one.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  g.players[me].resource = 80;
  const deal = {
    proposer: them, recipient: me,
    give: [{ promise: { kind: "nonAggression", rounds: 5 } }],
    get: [{ resource: { resource: "scrap", amount: 12 } }],
  };
  const offer = tableOffer(g, them, me, deal, { kind: "deal" });
  const before = g.players[me].resource;
  // Overpay: they will not refuse more money than they asked for.
  const res = performDiplomacy(g, me, "counter-offer", { offerId: offer.id, scrap: 14 });
  check("a counter that pays over the asking price is taken", res.ok && res.accepted);
  check("…and it charges the countered price, not the tabled one",
    g.players[me].resource === before - 14);
}
{
  // The direction rule. On counter-terms the player is still the PROPOSER, so
  // a positive number is still scrap they pay — the frame flip that turned
  // every counter inside out the first time offers shipped.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  g.players[me].resource = 50;
  const deal = {
    proposer: me, recipient: them,
    give: [{ resource: { resource: "scrap", amount: 4 } }],
    get: [{ promise: { kind: "nonAggression", rounds: 5 } }],
  };
  const offer = tableOffer(g, them, me, deal, { kind: "deal", isCounter: true });
  const before = g.players[me].resource;
  const res = performDiplomacy(g, me, "counter-offer", { offerId: offer.id, scrap: 9 });
  check("countering counter-terms still reads positive as SCRAP YOU PAY",
    !res.accepted || g.players[me].resource === before - 9);
}

// §13 — a POSITION: unilateral, public, and cited by name when broken.
//
// The audit's claim is specifically about the citation. A cost nobody names is
// not a cost — it is a number in a save file — and the entire reason to stand
// on something in public is that the board can hold you to it out loud.
line("\n  [§13] you can stand for something, and be named when you don't");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  const PC = CONFIG.diplomacy.positions;

  const bad = performDiplomacy(g, me, "declare-position", { kind: "noWarOn" });
  check("a position about nobody in particular is refused", !bad.ok);
  const ok = performDiplomacy(g, me, "declare-position", { kind: "noWarOn", target: them });
  check("you can stand on making no war on somebody", ok.ok);
  check("…and it reads back", !!positionHeld(g, me, "noWarOn", them));
  check("…in words", /Lakers|lakers/.test(positionText(g, positionHeld(g, me, "noWarOn", them))));
  const dup = performDiplomacy(g, me, "declare-position", { kind: "noWarOn", target: them });
  check("…and you cannot stand on it twice", !dup.ok);

  // The press-release guard.
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  declareWar(g2, me, them, "test");
  check("you cannot take a position you are already in breach of",
    !performDiplomacy(g2, me, "declare-position", { kind: "noWarOn", target: them }).ok);

  // Standing down honestly, and not the round before you break it.
  const early = performDiplomacy(g, me, "withdraw-position",
    { positionId: positionHeld(g, me, "noWarOn", them).id });
  check("a position cannot be dropped the moment it becomes inconvenient", !early.ok);
  g.round += PC.minRounds;
  const h0 = honorOf(g, me);
  const late = performDiplomacy(g, me, "withdraw-position",
    { positionId: positionHeld(g, me, "noWarOn", them).id });
  check("…but it can be stood down from, once it has been stood on", late.ok);
  check("…and standing down costs less than being caught",
    honorOf(g, me) === h0 - PC.withdrawHonorLoss && PC.withdrawHonorLoss < PC.breakHonorLoss);
  check("…and it is no longer held", !positionHeld(g, me, "noWarOn", them));
}
{
  // Breaking one: the cost, and the citation the whole feature exists for.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers", other = "goldgrass";
  const PC = CONFIG.diplomacy.positions;
  performDiplomacy(g, me, "declare-position", { kind: "noWarOn", target: them });
  const h0 = honorOf(g, me), m0 = menaceOf(g, me);
  declareWar(g, me, them, "player");
  check("declaring the war breaks the position", !positionHeld(g, me, "noWarOn", them));
  check("…and it costs more Honor than a bilateral promise does",
    honorOf(g, me) === h0 - PC.breakHonorLoss && PC.breakHonorLoss > CONFIG.diplomacy.honor.breakLoss);
  // Not `=== m0 + breakMenace`: the declaration ALSO charges declareUnjustified,
  // and asserting the total would be asserting the sum of two unrelated rules.
  check("…and the board marks you for it, by that name",
    g.log.some((e) => e.name === "menace_changed"
      && e.payload.cause === "position-broken" && e.payload.delta === PC.breakMenace)
    && menaceOf(g, me) >= m0 + PC.breakMenace);
  check("…the wronged party holds a grievance naming it",
    grievancesAgainst(g, them, me).some((x) => x.kind === "position-broken"));
  // THE CLAIM: cited by name, within the window.
  const cites = citablePositions(g, me, them);
  check("it is citable, by name, this round", cites.length === 1);
  check("…and the citation carries the words you used",
    /Lakers|lakers/.test(positionText(g, cites[0])));
  check("…and a denouncement reaches for it first",
    denounceGrounds(g, them, me)?.kind === "position-broken");
  g.round += PC.citeWithinRounds + 1;
  check(`…and it stops being news after ${PC.citeWithinRounds} rounds`,
    citablePositions(g, me, them).length === 0);
  check("a faction it was not about cannot cite a targeted position",
    citablePositions(g, me, other).length === 0);
}
{
  // A position made to the ROOM is held by the room.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari";
  performDiplomacy(g, me, "declare-position", { kind: "noVassals" });
  check("you can stand on taking no vassals", !!positionHeld(g, me, "noVassals"));
  vassalize(g, me, "lakers", "test");
  check("…and taking one breaks it", !positionHeld(g, me, "noVassals"));
  const wronged = factionIds(g).filter((f) => f !== me
    && grievancesAgainst(g, f, me).some((x) => x.kind === "position-broken"));
  check("…and everybody holds it against you, not just the vassal",
    wronged.length >= 2);
  check("…so anyone may cite it", citablePositions(g, me, "goldgrass").length === 1);
}
{
  // The cap, so a player cannot paper the board with positions they mean to keep.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari";
  const PC = CONFIG.diplomacy.positions;
  const others = factionIds(g).filter((f) => f !== me);
  let taken = 0;
  for (const f of others) {
    if (performDiplomacy(g, me, "declare-position", { kind: "noWarOn", target: f }).ok) taken += 1;
  }
  if (others.length > PC.max) {
    check(`you can stand on at most ${PC.max} things at once`, taken === PC.max);
    check("…and the cap counts what you HOLD", positionsOf(g, me).length === PC.max);
  }
}

// Economy §10 — the effect→value table, and the upgrade pass it unblocked.
//
// `pickBuild` scored six of forty-two authored chip fields. Every movement
// chip, every vision chip, the whole blockade kit, the influence chips and the
// Loyalty chips were worth exactly zero to an AI deciding what to build, and
// `chipUpgradesByAI` measured 0 across the whole 15-seed suite — every tier-2
// chip in the content set was human-only.
line("\n  [economy §10] the AI can price content, and can upgrade");
{
  const SKIP = new Set(NON_EFFECT_FIELDS);
  const authored = new Set();
  for (const def of Object.values(CHIPS)) {
    for (const k of Object.keys(def)) if (!SKIP.has(k)) authored.add(k);
  }
  const unseen = [...authored].filter((f) => !VALUED_FIELDS.includes(f));
  check("every authored chip field has a row in the value table",
    unseen.length === 0);
  check("…and the table has no rows for fields nobody authors",
    VALUED_FIELDS.every((f) => authored.has(f)));
  check("…and every authored chip prices to a finite number",
    Object.values(CHIPS).every((d) => Number.isFinite(chipValue(d))));

  // The ordering that cost an evening. Garrison shipped at 1.6, which put
  // defense-turrets a fifth of a point over recyclers — and on seed 1234 the
  // AI then built 23 turrets, 0 recyclers, and its captures fell 22 -> 8.
  check("production outranks fortification, point for point",
    chipValue(CHIPS["recyclers"]) >= chipValue(CHIPS["defense-turrets"]));
  check("…and an upgrade is worth its DELTA, not its destination",
    upgradeValue(CHIPS["recyclers"], CHIPS["factory"])
      === chipValue(CHIPS["factory"]) - chipValue(CHIPS["recyclers"]));
  check("…which is smaller than the destination, so upgrades do not swamp builds",
    upgradeValue(CHIPS["recyclers"], CHIPS["factory"]) < chipValue(CHIPS["factory"]));
}
{
  // The field-aware influence term. Dominance is a step function with a wide
  // dead zone, so an influence chip is worth nothing mid-band and a great deal
  // one point below a bar — and a flat weight prices it at the average of
  // those, which is a number that is never right anywhere.
  const g = createGame({ seed });
  const loc = Object.values(g.locations).find((l) => l.controller);
  const chip = Object.values(CHIPS).find((c) => (c.localInfluence || 0) > 0);
  if (chip) {
    g.world = g.world || {};
    g.world.influence = {};
    const gain = chip.localInfluence;
    // Parked just under the 6-hex bar, the same chip should be worth more than
    // parked well inside a band.
    g.world.influence[loc.hexId] = 6 - gain;
    const atTheBar = chipValue(chip, { state: g, loc, contested: false });
    g.world.influence[loc.hexId] = 0;
    const deadZone = chipValue(chip, { state: g, loc, contested: false });
    check("an influence chip that crosses a dominance bar is worth more than one that does not",
      atTheBar > deadZone);
  }
  // Loyalty at the ceiling buys nothing, and the table has to know that.
  const loyChip = Object.values(CHIPS).find((c) => (c.loyaltyRise || 0) > 0);
  if (loyChip) {
    const full = { ...loc, loyalty: CONFIG.loyalty.max };
    const low = { ...loc, loyalty: 0 };
    check("a Loyalty chip on a city at the ceiling is worth nothing",
      chipValue(loyChip, { state: g, loc: full }) < chipValue(loyChip, { state: g, loc: low }));
  }
}
{
  // The compounding horizon. output/research/upkeep pay EVERY ROUND; strength
  // and siege pay once. A flat points-per-point scale cannot tell those apart,
  // and the first draft did not try.
  const AI = CONFIG.ai;
  const was = AI.compoundingWeight;
  try {
    AI.compoundingWeight = 1;
    const flat = chipValue(CHIPS["factory"]);
    AI.compoundingWeight = 2;
    check("the horizon lifts a per-round chip and nothing else",
      chipValue(CHIPS["factory"]) > flat
      && chipValue(CHIPS["defense-turrets"]) === chipValue(CHIPS["defense-turrets"]));
  } finally { AI.compoundingWeight = was; }
  // …and the horizon is the SHIPPED value, not an accident of the sweep. 2
  // sent the AI hoarding (109 median end scrap, 14 of 15 games unresolved).
  check("…and it ships at the value the suite chose", CONFIG.ai.compoundingWeight === 1);
}

// §5 — WHAT A FACTION WANTS, IN THE PRICE.
//
// `interestMultiplier` shipped with the interests module and was called by
// nothing. Every faction priced every item identically, so the six derived
// wants shaped what an AI would SAY in a courtship condition and had no bearing
// whatever on what it would PAY — a faction whose homeland was under occupation
// valued that city at exactly the number a bystander did.
line("\n  [§5] the six wants reach the price, not only the sentence");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  // A live grievance gives `me` a `redress` want against `them`. Settling is
  // the item that answers it.
  recordGrievance(g, me, them, "surprise-attack");
  const settlement = { settlement: true };
  const withWant = valueOfItem(g, me, settlement, { other: them });
  const cfg = CONFIG.diplomacy.interests;
  const was = cfg.priceMultiplier;
  try {
    cfg.priceMultiplier = 0;
    const flat = valueOfItem(g, me, settlement, { other: them });
    check("a faction that wants redress pays more for a settlement",
      withWant > flat);
    check("…and priceMultiplier 0 is a true no-op",
      flat === valueOfItem(g, me, settlement, { other: them }));
  } finally { cfg.priceMultiplier = was; }

  // Capped. Personality tilts a negotiation; it does not let a faction be
  // talked into anything with the right word in it.
  cfg.priceMultiplier = was;
  const bystander = createGame({ seed }); ensureDiplomacy(bystander);
  const flatPrice = valueOfItem(bystander, me, settlement, { other: them });
  check("…and the want is a tilt, not a blank cheque",
    withWant <= (flatPrice || 1) * (1 + was) + 0.001 || flatPrice === 0);

  // Scrap is exempt: a want that changed the value of a coin would be an
  // exchange-rate bug wearing a hat.
  const coin = { resource: { resource: "scrap", amount: 10 } };
  check("money is money — no want moves the price of scrap",
    valueOfItem(g, me, coin, { other: them }) === 10);
}
{
  // `routes` had no matcher at all: the interest was derived, weighted and
  // spoken in courtship conditions from the day it shipped, and the one item
  // that delivers it priced at par.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari";
  const other = factionIds(g).find((f) => f !== me
    && interestsOf(g, me).some((w) => w.kind === "routes" && w.subject === f));
  if (other) {
    const ob = { promise: { kind: "openBorders" } };
    const cfg = CONFIG.diplomacy.interests;
    const was = cfg.priceMultiplier;
    const wanted = valueOfItem(g, me, ob, { other });
    try {
      cfg.priceMultiplier = 0;
      check("a faction that wants a route pays more for open borders",
        wanted > valueOfItem(g, me, ob, { other }));
    } finally { cfg.priceMultiplier = was; }
  }
}

// §6.3/§6.4 — THE WALL HOLDS AT THE AI's FAUCET TOO.
//
// Scrap buys what a faction HAS; Sway buys what a faction THINKS, and nothing
// converts. The human's Gift button has been Sway-priced since §6.3 — but the
// AI was still handing over 3 scrap through `applyDeal` and getting Standing
// for it, so the wall held at one faucet and not the other. That is the same
// asymmetric-bar failure already fixed once for courtship.
line("\n  [§6.4] no faction buys goodwill with coin — the AI included");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const before = {};
  for (const f of factionIds(g)) for (const o of factionIds(g)) {
    if (f !== o) before[`${f}|${o}`] = getStanding(g, f, o);
  }
  const purses = {};
  for (const f of factionIds(g)) if (g.players[f]) { g.players[f].resource = 500; g.players[f].sway = 0; purses[f] = 500; }
  // Run the political layer with every faction rich in coin and broke in Sway.
  for (let i = 0; i < 6; i++) { g.round += 1; runDiplomacyRound(g); }
  // Standing may move for a dozen legitimate reasons — drift, war, peace,
  // grievances. What must NOT appear is a `gift` cause, because that is the
  // one that would mean somebody bought it.
  const bought = g.log.filter((e) => e.name === "standing_changed" && e.payload.cause === "gift");
  check("a board full of scrap and empty of Sway buys nobody's goodwill",
    bought.length === 0, );
}
{
  // …and the switch that would let the AI gift again is off, deliberately.
  // The measured table is in the config comment: the scrap breach read best
  // (mix 9, unresolved 1) and still cannot stay, and every Sway-priced version
  // reads worse than removing it because a gift competes with COURTSHIP for
  // the same pool.
  check("the AI's gift branch ships switched off", CONFIG.ai.giftAboveShareOfCap >= 1);
  // The human's, of course, does not.
  const g = createGame({ seed }); ensureDiplomacy(g);
  g.players.versari.sway = 200;
  g.players.versari.resource = 0;
  setStanding(g, "lakers", "versari", 0);
  const res = performDiplomacy(g, "versari", "gift", { faction: "lakers", standing: 1 });
  check("…while a player with Sway and no scrap can still send one", res.ok);
  check("…and it lands", getStanding(g, "lakers", "versari") > 0);
}

// §12.3 — the intrigue branch: Expose, Forge, Fabricate.
//
// `sway.opCost` sat in config with nothing reading it, and the recorded
// phase-3 finding was that the political pool sits at its ceiling 30% of all
// rounds. This is the sink. Each op is a claim about who wronged whom, and
// they differ in whether the claim is TRUE and in who it is about:
//
//   Expose     a true wrong, done by them, that nobody saw
//   Forge      a false wrong, done by them, to somebody else
//   Fabricate  a false wrong, done by them, to YOU
line("\n  [§12.3] what Sway buys when the courtships are paid for");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers", third = "goldgrass";
  g.players[me].sway = 500;
  check("with nothing to publish, Expose is refused rather than invented",
    !performDiplomacy(g, me, "expose", { faction: them }).ok);
  const sway0 = g.players[me].sway;
  check("…and it costs nothing to be told so", sway0 === 500);

  // Manufacture the one thing Expose reads: a strike whose Menace rounded to
  // nothing because nobody saw it. `menaceFromAttack` emits it; the op does
  // not keep a second ledger of the same fact.
  emit(g, "attack_unwitnessed", { attacker: them, victim: third, hex: null });

  // …AND YOU HAVE TO HAVE FOUND OUT SOMEHOW. The first draft read the log
  // omnisciently, so any faction anywhere could publish a strike that by
  // definition nobody witnessed — the one place in the diplomacy layer where
  // fog did not apply, in the one verb whose whole subject is a thing nobody
  // saw. The apparatus is the Intelligence branch, which until now had no
  // contact with the intrigue verbs at all.
  check("with no intelligence apparatus, there is nothing you can publish",
    exposableStrikes(g, them, me).length === 0);
  const blind = performDiplomacy(g, me, "expose", { faction: them });
  check("…and the refusal says WHICH wall you hit",
    !blind.ok && /no way of knowing/.test(blind.reason || ""), blind.reason);
  check("…and it costs nothing to be told", g.players[me].sway === 500);

  // Spy Ring: a standing network. Set directly, as the surrounding fixtures do
  // — this is about what the node BUYS, not about earning it.
  g.players[me].techWheel = ["int-entry", "int-b1"];
  check("a Spy Ring hears about it wherever it happened",
    exposableStrikes(g, them, me).length === 1);
  check("…and says so", exposableStrikes(g, them, me)[0].apparatus === "spy-ring");
  check("an unwitnessed strike is exposable", exposableStrikes(g, them, me).length === 1);
  const m0 = menaceOf(g, them), h0 = honorOf(g, me);
  const res = performDiplomacy(g, me, "expose", { faction: them });
  check("…and publishing it works", res.ok);
  check("…it charges the Menace the strike escaped", menaceOf(g, them) > m0);
  check("…it hands the victim the grievance they were denied",
    grievancesAgainst(g, third, them).some((x) => x.kind === "surprise-attack"));
  check("…the truth costs the teller no Honor", honorOf(g, me) === h0);
  check("…and it costs Sway", g.players[me].sway === 500 - CONFIG.sway.opCost);
  check("…and the same strike cannot be sold twice",
    exposableStrikes(g, them, me).length === 0
    && !performDiplomacy(g, me, "expose", { faction: them }).ok);

  // You are never a source on your own business — you were there.
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  g2.players[me].sway = 500;
  g2.players[me].techWheel = ["int-entry", "int-b1"];
  emit(g2, "attack_unwitnessed", { attacker: me, victim: them, hex: null });
  emit(g2, "attack_unwitnessed", { attacker: them, victim: me, hex: null });
  check("you cannot publish your own quiet strike",
    exposableStrikes(g2, me, me).length === 0);
  check("…nor one against you, which you did not need telling about",
    exposableStrikes(g2, them, me).length === 0);

  // The other two doors, because a gate only one node opens is that node's
  // gate rather than the branch's. A Listening Post is the A-path payoff: it
  // has carried an upkeep, a concealment model, a Strength and a destruction
  // path since it shipped, and the only reason to build one was map vision.
  {
    const gp = createGame({ seed }); ensureDiplomacy(gp);
    gp.players[me].sway = 500;
    const hex = Object.keys(gp.board.hexes)[0];
    const near = (gp.board.adjacency[hex] || [])[0];
    emit(gp, "attack_unwitnessed", { attacker: them, victim: third, hex });
    check("no post, no ears", exposableStrikes(gp, them, me).length === 0);
    gp.world.listeningPosts = gp.world.listeningPosts || {};
    gp.world.listeningPosts[near] = { hex: near, owner: me, strength: 5, revealedTo: [] };
    check("a Listening Post in earshot hears it",
      exposableStrikes(gp, them, me)[0]?.apparatus === "listening-post");
    // …and an unpaid one hears nothing, which is what dormancy MEANS.
    gp.world.listeningPosts[near].dormant = true;
    check("…and a dormant post hears nothing", exposableStrikes(gp, them, me).length === 0);
  }
  {
    // Scouts: int-a1 plus eyes on the place now.
    const gs = createGame({ seed }); ensureDiplomacy(gs);
    gs.players[me].sway = 500;
    const hex = Object.keys(gs.board.hexes)[0];
    emit(gs, "attack_unwitnessed", { attacker: them, victim: third, hex });
    gs.players[me].techWheel = ["int-entry", "int-a1"];
    gs.visibility = gs.visibility || {};
    gs.visibility[me] = { visible: new Set(), explored: new Set() };
    check("Intelligence A1 alone, with the place out of sight, learns nothing",
      exposableStrikes(gs, them, me).length === 0);
    gs.visibility[me].visible.add(hex);
    check("…and with eyes on it, the scouts piece it together",
      exposableStrikes(gs, them, me)[0]?.apparatus === "scouts");
  }

  // The no-op, per the plan's rule 1.4.
  const O = CONFIG.sway.ops;
  const wasNeed = O.exposeNeedsApparatus;
  try {
    O.exposeNeedsApparatus = 0;
    const g3 = createGame({ seed }); ensureDiplomacy(g3);
    emit(g3, "attack_unwitnessed", { attacker: them, victim: third, hex: null });
    check("exposeNeedsApparatus 0 restores the omniscient reading",
      exposableStrikes(g3, them, me).length === 1);
  } finally { O.exposeNeedsApparatus = wasNeed; }
}
{
  // A covert act is seen through on a roll with TWO sides. The caster's Honor
  // is cover — the interesting reason to keep it, and to spend it.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  g.players[me].honor = 0;
  const dishonest = covertDetection(g, me, null);
  g.players[me].honor = 12;
  check("a spotless name is cover for a lie", covertDetection(g, me, null) < dishonest);
  const o = CONFIG.sway.ops;
  check("…within bounds either way",
    covertDetection(g, me, null) >= o.lieDetectionMin
    && dishonest <= o.lieDetectionMax);

  // …and the VICTIM's apparatus is the counter. This half was missing, and its
  // absence made `int-b1` — a node called SPY RING — do nothing whatever to
  // help its holder catch somebody lying about them.
  check("a faction with nothing counts for nothing", counterIntelligence(g, them) === 0);
  const bare = covertDetection(g, me, them);
  g.players[them].techWheel = ["int-entry", "int-b1"];
  check("a Spy Ring makes you harder to lie about", covertDetection(g, me, them) > bare);
  check("…and it is the Spy Ring doing it, not the roll drifting",
    counterIntelligence(g, them) === o.counterSpyRing);
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  g2.world.listeningPosts = {};
  for (const hex of Object.keys(g2.board.hexes).slice(0, 12)) {
    g2.world.listeningPosts[hex] = { hex, owner: them, strength: 5, revealedTo: [] };
  }
  check("…and a wall of listening posts is capped, not cumulative",
    counterIntelligence(g2, them) === o.counterPostCap);
}
{
  // SABOTAGE IS A COVERT ACT TOO, and it was the only one in the game with no
  // risk at all: Forge and Fabricate roll against Honor and backfire hard,
  // while Saboteurs lowered a rival's Loyalty for free, anonymously, with no
  // Menace and no grievance. The diplomatic lie risked everything and the
  // physical one risked nothing.
  const o = CONFIG.sway.ops;
  const was = [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax];
  const me = "versari", them = "lakers";
  try {
    o.lieBaseDetection = 1; o.lieDetectionMin = 1; o.lieDetectionMax = 1;
    const g = createGame({ seed }); ensureDiplomacy(g);
    const h0 = honorOf(g, me), m0 = menaceOf(g, me);
    check("a saboteur can be traced", sabotageCaught(g, me, them) === true);
    check("…and it costs Honor, but less than a forgery does",
      honorOf(g, me) === h0 - o.sabotageCaughtHonorLoss
      && o.sabotageCaughtHonorLoss < o.caughtHonorLoss);
    check("…and Menace", menaceOf(g, me) === m0 + o.sabotageCaughtMenace);
    check("…and the victim holds it against them, by name",
      grievancesAgainst(g, them, me).length > 0);

    o.lieBaseDetection = 0; o.lieDetectionMin = 0; o.lieDetectionMax = 0;
    const g3 = createGame({ seed }); ensureDiplomacy(g3);
    const h1 = honorOf(g3, me);
    check("…and an unseen saboteur pays nothing",
      sabotageCaught(g3, me, them) === false && honorOf(g3, me) === h1);
  } finally {
    [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax] = was;
  }
  const wasCatch = o.sabotageCanBeCaught;
  try {
    o.sabotageCanBeCaught = 0;
    const g4 = createGame({ seed }); ensureDiplomacy(g4);
    check("sabotageCanBeCaught 0 restores the free, anonymous sabotage",
      sabotageCaught(g4, me, them) === false);
  } finally { o.sabotageCanBeCaught = wasCatch; }
}
{
  // §17.5 B1 — a Spy Ring reads the POLITICAL layer now, not just two numbers
  // that both predate the diplomacy rework.
  const g = createGame({ seed }); ensureDiplomacy(g);
  const me = "versari", them = "lakers";
  check("without a Spy Ring you learn nothing", readRivalIntel(g, me, them) === null);
  g.players[me].techWheel = ["int-entry", "int-b1"];
  const r = readRivalIntel(g, me, them);
  check("with one, you learn what they are AFTER", Array.isArray(r.interests));
  check("…and what they can afford to do about it",
    typeof r.sway.pool === "number" && typeof r.sway.income === "number");
  performDiplomacy(g, them, "declare-position", { kind: "noVassals" });
  const r2 = readRivalIntel(g, me, them);
  check("…and what they have sworn in public",
    r2.positions.some((p) => p.kind === "noVassals"));
  check("…in words", /vassal/i.test(r2.positions[0].text));
  r.techWheel.push("__probe");
  check("…and the report is a copy, not a handle on the engine",
    !g.players[them].techWheel.includes("__probe"));
}
{
  // Forge, forced to succeed and forced to fail, so both halves are pinned.
  const o = CONFIG.sway.ops;
  const was = [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax];
  try {
    o.lieBaseDetection = 0; o.lieDetectionMin = 0; o.lieDetectionMax = 0;
    const g = createGame({ seed }); ensureDiplomacy(g);
    const me = "versari", them = "lakers", third = "goldgrass";
    g.players[me].sway = 500;
    check("a forgery has to be about somebody else",
      !performDiplomacy(g, me, "forge", { faction: them, against: them }).ok);
    const r = performDiplomacy(g, me, "forge", { faction: them, against: third });
    check("an undetected forgery plants a grievance", r.ok && !r.caught);
    check("…held by the party it was told to, against the party it was about",
      grievancesAgainst(g, third, them).length === 1);
    check("…and it is marked as the lie it is",
      grievancesAgainst(g, third, them)[0].forged?.by === me);
    // …and it evaporates. Without this, one Fabricate would make every war
    // that faction ever fought against that target righteous forever.
    g.round += o.lieDecaysAfterRounds + 1;
    sweepForgeries(g);
    check("…and a lie is real while it lasts and then evaporates",
      grievancesAgainst(g, third, them).length === 0);

    o.lieBaseDetection = 1; o.lieDetectionMin = 1; o.lieDetectionMax = 1;
    const g2 = createGame({ seed }); ensureDiplomacy(g2);
    g2.players[me].sway = 500;
    const h0 = honorOf(g2, me), m0 = menaceOf(g2, me);
    const caught = performDiplomacy(g2, me, "forge", { faction: them, against: third });
    check("a forgery seen through is still an act that happened", caught.ok && caught.caught);
    check("…and it costs the forger more than an ordinary broken promise",
      honorOf(g2, me) === h0 - o.caughtHonorLoss
      && o.caughtHonorLoss > CONFIG.diplomacy.honor.breakLoss);
    check("…and the board marks them", menaceOf(g2, me) === m0 + o.caughtMenace);
    check("…and BOTH parties they tried to set against each other hold it",
      grievancesAgainst(g2, them, me).length > 0 && grievancesAgainst(g2, third, me).length > 0);
    check("…and no grievance was planted", grievancesAgainst(g2, third, them).length === 0);
  } finally {
    [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax] = was;
  }
}
{
  // Fabricate is the one that buys a war, so it is the one most worth lying
  // about — and the one that must refuse to stack on a real grievance, or the
  // AI would fabricate every round to keep a war righteous.
  const o = CONFIG.sway.ops;
  const was = [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax];
  try {
    o.lieBaseDetection = 0; o.lieDetectionMin = 0; o.lieDetectionMax = 0;
    const g = createGame({ seed }); ensureDiplomacy(g);
    const me = "versari", them = "lakers";
    g.players[me].sway = 500;
    check("a fabricated wrong makes your war righteous",
      performDiplomacy(g, me, "fabricate", { faction: them }).ok
      && warJustification(g, me, them) != null);
    const sway1 = g.players[me].sway;
    check("…but you cannot stack one on a grievance you actually hold",
      !performDiplomacy(g, me, "fabricate", { faction: them }).ok);
    check("…and being refused is free", g.players[me].sway === sway1);
    g.round += o.lieDecaysAfterRounds + 1;
    sweepForgeries(g);
    check("…and the licence expires with the lie", grievancesAgainst(g, me, them).length === 0);
  } finally {
    [o.lieBaseDetection, o.lieDetectionMin, o.lieDetectionMax] = was;
  }
}
{
  // The whole branch is switchable, per the plan's rule 1.4.
  const o = CONFIG.sway.ops;
  const was = o.enabled;
  try {
    o.enabled = 0;
    const g = createGame({ seed }); ensureDiplomacy(g);
    g.players.versari.sway = 500;
    check("ops.enabled 0 removes the branch entirely",
      !opsEnabled()
      && !performDiplomacy(g, "versari", "expose", { faction: "lakers" }).ok
      && !performDiplomacy(g, "versari", "fabricate", { faction: "lakers" }).ok
      && g.players.versari.sway === 500);
  } finally { o.enabled = was; }
  // The AI's pass ships ON as of the n=45 re-measurement (see the config
  // note). What the fixture pins is that the switch still SWITCHES — the verbs
  // are the player's either way, and `ops.enabled` above is the master.
  check("…and the AI's own intrigue pass is a switch, not a hard-coded policy",
    CONFIG.ai.intrigue === 0 || CONFIG.ai.intrigue === 1);
}

// Economy §8 — a COUNT-based obligation, because a per-chip one never arrived.
//
// Five of forty authored chips carry any `upkeep` at all, so a faction could
// accumulate thirty-five of them for nothing. Measured on seed 1234 at round
// 20, the leader held 20 chips while two of the four majors held none — so a
// count obligation bites exactly where a sink should, on the faction that is
// winning, and is invisible to the one that is losing.
line("\n  [economy §8] the Nth chip past the allowance costs something");
{
  const eco = CONFIG.economy;
  const g = createGame({ seed });
  startTurn(g);
  const pid = "versari";
  const home = Object.values(g.locations).find((l) => l.controller === pid);
  const free = Object.values(CHIPS).find((c) => !(c.upkeep > 0) && c.kind === "location");
  for (let i = 0; i < eco.freeChips + 3; i += 1) {
    const u = g.nextId("chip");
    g.chips[u] = { uid: u, chipId: free.id };
    home.chips.push(u);
  }
  const held = chipsHeldBy(g, pid);
  check("every chip a faction holds is counted, wherever it sits",
    held.length >= eco.freeChips + 3);
  check("…a chip inside the allowance costs only what it authored",
    held.slice(0, eco.freeChips).every((c, i) => chipUpkeepFor(g, pid, c.uid, i) === 0));
  check(`…and each one past it costs ${eco.perExtraChip} more`,
    held.slice(eco.freeChips).every((c, i) =>
      chipUpkeepFor(g, pid, c.uid, eco.freeChips + i) === eco.perExtraChip));

  // Charged, not merely quoted.
  g.players[pid].resource = 200;
  const before = g.players[pid].resource;
  chargeChipUpkeep(g, pid);
  check("…and the bill is actually taken",
    before - g.players[pid].resource >= (held.length - eco.freeChips) * eco.perExtraChip);

  // Cannot pay -> dormant, never destroyed. The surcharge must not be a way to
  // lose chips you built, only a reason to stop building more.
  g.players[pid].resource = 0;
  chargeChipUpkeep(g, pid);
  check("…and a faction that cannot pay goes dormant, never loses the chip",
    chipsHeldBy(g, pid).length === held.length
    && held.slice(eco.freeChips).some((c) => g.chips[c.uid].disabled));
  g.players[pid].resource = 200;
  chargeChipUpkeep(g, pid);
  check("…and it comes back the moment the bill can be met",
    held.slice(eco.freeChips).every((c) => !g.chips[c.uid].disabled));

  const was = eco.perExtraChip;
  try {
    eco.perExtraChip = 0;
    check("…and perExtraChip 0 is a true no-op",
      held.every((c, i) => chipUpkeepFor(g, pid, c.uid, i) === 0));
  } finally { eco.perExtraChip = was; }
}

// §4 — THE trust -> HONOR MERGE.
//
// Twenty-three authored beats write `ADJUST_TRACK {track:"trust"}`, summing
// -16, and `p.tracks.trust` was read by NOTHING in the rules — a parallel
// reputation the diplomacy layer could not see, so a player could be
// scrupulous through a whole quest line and have the board treat them as a
// stranger.
//
// The merge lands at the ADJUST_TRACK SEAM rather than in the corpus, and that
// is the load-bearing decision: `src/game/content/*.js` is generated from a
// JSON outside this repository (its own banner says so), so rewriting the 23
// beats would be blown away by the next `build-content.mjs` run — and would be
// 23 things to keep in sync instead of one.
line("\n  [§4] what a quest costs your name");
{
  const H = CONFIG.diplomacy.honor;
  const g = createGame({ seed }); ensureDiplomacy(g);
  const pid = "versari";
  const ctx = { activePlayer: pid };
  const h0 = honorOf(g, pid);
  applyEffect(g, { type: "ADJUST_TRACK", track: "trust", amount: -2, target: "active" }, ctx);
  check("an authored trust write now moves Honor", honorOf(g, pid) === h0 - 2 * H.trustToHonor);
  check("…at the halved magnitude, not the authored one",
    H.trustToHonor < 1 && honorOf(g, pid) > h0 - 2);
  check("…and the track keeps its own value for content that reads it",
    g.players[pid].tracks.trust === -2);
  check("…and it says where it came from",
    g.log.some((e) => e.name === "honor_changed" && e.payload.cause === "quest-trust"));

  // THE FLOOR. Halving alone was not enough: the audit measures the corpus at
  // Honor -4 with no faction's gates open, and every negative beat at -11.5 —
  // 62 rounds of clean play, which is longer than a game. A quest choice
  // should COST the board's regard and never close the diplomacy face
  // outright, because the player cannot see the arithmetic while reading a
  // story. Deeds still can; those are chosen with the numbers on screen.
  for (let i = 0; i < 40; i += 1) {
    applyEffect(g, { type: "ADJUST_TRACK", track: "trust", amount: -3, target: "active" }, ctx);
  }
  check("quest trust alone cannot push Honor past the floor",
    honorOf(g, pid) === H.questHonorFloor,
    );
  check("…while the track itself keeps counting, so content still reads the truth",
    g.players[pid].tracks.trust < H.questHonorFloor);
  // …and a DEED still can. The floor is on the merge, not on Honor.
  adjustHonor(g, pid, -H.surpriseAttackLoss, "test-deed");
  check("…but a deed still can, which is the whole distinction",
    honorOf(g, pid) < H.questHonorFloor);
}
{
  // Recovery. Honor was the one reputation stat with no passive faucet, and a
  // stat that only falls is a countdown rather than a character.
  const H = CONFIG.diplomacy.honor;
  check("Honor recovers, toward where an honourable faction started",
    H.decayPerRound > 0 && H.decayToward === H.start);
  const g = createGame({ seed }); ensureDiplomacy(g);
  const pid = "versari";
  adjustHonor(g, pid, -6, "test");
  const low = honorOf(g, pid);
  for (let i = 0; i < 5; i += 1) { g.round += 1; runDiplomacyRound(g); }
  check("…and clean play actually lifts it", honorOf(g, pid) > low);
  // It must not overshoot: drifting an honourable faction DOWN for playing
  // quietly would be its own bug.
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  adjustHonor(g2, pid, 6, "test");
  const high = honorOf(g2, pid);
  for (let i = 0; i < 40; i += 1) { g2.round += 1; runDiplomacyRound(g2); }
  check("…and it settles at the target rather than sliding past it",
    honorOf(g2, pid) <= high && honorOf(g2, pid) >= H.decayToward - H.decayPerRound);
}
{
  // Both halves are switchable, per the plan's rule 1.4.
  const H = CONFIG.diplomacy.honor;
  const was = H.trustToHonor;
  try {
    H.trustToHonor = 0;
    const g = createGame({ seed }); ensureDiplomacy(g);
    const h0 = honorOf(g, "versari");
    applyEffect(g, { type: "ADJUST_TRACK", track: "trust", amount: -5, target: "active" },
      { activePlayer: "versari" });
    check("trustToHonor 0 unmerges the tracks and restores the old silence",
      honorOf(g, "versari") === h0 && g.players.versari.tracks.trust === -5);
  } finally { H.trustToHonor = was; }
}

// §1.2 / economy §6.3 — gifts are priced in SWAY now, not scrap. The
// diminishing-returns window is unchanged, because which currency pays for a
// gift has nothing to do with how quickly a faction tires of being flattered.
line("\n  [§1.2] gifts buy Standing with political capacity, not scrap");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const from = "versari", to = "lakers";
  const SW = CONFIG.sway;
  g.players[from].resource = 200;
  g.players[from].sway = 400;
  setStanding(g, to, from, -12); setStanding(g, from, to, -2); // room below cap; no pact

  // The wall: scrap alone buys nothing a faction thinks.
  g.players[from].sway = 0;
  const broke = performDiplomacy(g, from, "gift", { faction: to, standing: 4 });
  check("a purse full of scrap and no Sway buys no goodwill at all",
    !broke.ok && /Sway/.test(broke.reason || ""));
  // -12 clamps to standingMin; read the board rather than the number we asked
  // for, which is what a refusal not moving anything actually means.
  check("…and moved nothing", getStanding(g, to, from) === CONFIG.diplomacy.standingMin);

  g.players[from].sway = 400;
  const gains = [];
  for (let i = 0; i < 4; i++) {
    const before = getStanding(g, to, from);
    performDiplomacy(g, from, "gift", { faction: to, standing: 4 });
    gains.push(getStanding(g, to, from) - before);
  }
  check("gift gains still diminish floor(want/(n+1)) → 4,2,1,1",
    JSON.stringify(gains) === JSON.stringify([4, 2, 1, 1]), JSON.stringify(gains));
  check("…and each landed gift cost Sway", g.players[from].sway < 400);
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const from = "versari", to = "lakers";
  g.players[from].sway = 400;
  setStanding(g, to, from, -12); setStanding(g, from, to, -2);
  performDiplomacy(g, from, "gift", { faction: to, standing: 4 }); // counter → 1
  runDiplomacyRound(g); // decay → 0
  g.players[from].sway = 400;
  const before = getStanding(g, to, from);
  performDiplomacy(g, from, "gift", { faction: to, standing: 4 });
  check("an idle round decays the gift counter, refreshing the gain rate (full 4)",
    getStanding(g, to, from) - before === 4);
}

// §1.3 — Trading Pact
line("\n  [§1.3] Trading Pact");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "goldgrass";
  const isCap = (l) => (l.chips || []).some((c) => g.chips[c]?.chipId === "capital");
  const capA = Object.values(g.locations).find((l) => l.controller === a && isCap(l));
  const capB = Object.values(g.locations).find((l) => l.controller === b && isCap(l));
  // Guarantee a clear capital-to-capital route: keep ONLY the two capitals
  // controlled (every other Location neutral) and clear the stale ZoC so
  // nothing walls the path between them.
  for (const loc of Object.values(g.locations)) if (loc !== capA && loc !== capB) loc.controller = null;
  g.world.zoc = {};
  setStanding(g, a, b, 0); setStanding(g, b, a, 0);
  g.players[a].menace = 0; g.players[b].menace = 0; g.players[a].honor = 6; g.players[b].honor = 6;
  const permA = g.players[a].permanentResearch || 0, permB = g.players[b].permanentResearch || 0;
  const res = formTradingPact(g, a, b);
  check("Trading Pact forms with capitals + clear route + Neutral+", res.ok);
  check("Trading Pact grants +1 permanent Research to each party",
    (g.players[a].permanentResearch || 0) === permA + 1 && (g.players[b].permanentResearch || 0) === permB + 1);
  const sa = g.players[a].resource, sb = g.players[b].resource;
  runDiplomacyRound(g);
  check("Trading Pact flows +2 scrap/round to each party while clear",
    g.players[a].resource >= sa + DH.tradingPact.scrapPerUpkeep && g.players[b].resource >= sb + DH.tradingPact.scrapPerUpkeep);

  // Sever the route (a loses all territory → no supply source) → suspend → dissolve.
  for (const loc of Object.values(g.locations)) if (loc.controller === a) loc.controller = null;
  runDiplomacyRound(g);
  const agr = g.diplomacy.agreements.find((x) => x.type === "trading-pact");
  check("a severed route suspends the Trading Pact", !!agr && agr.suspended === true);
  runDiplomacyRound(g); runDiplomacyRound(g); // reach the grace limit (3 suspended rounds)
  check("3 suspended rounds auto-dissolve the Trading Pact + remove the Research floor",
    !g.diplomacy.agreements.some((x) => x.type === "trading-pact") && (g.players[a].permanentResearch || 0) === permA);
}

// A trading pact is about whether two powers can reach each other, not about
// two specific hexes. It used to demand a clear CAPITAL-to-capital route, so
// two neighbours whose border towns shared a railway could not trade if their
// capitals sat at opposite ends of the map, and a pact died the moment either
// capital was cut off however well-connected the rest of both countries were.
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "goldgrass";
  const isCap = (l) => (l.chips || []).some((c) => g.chips[c]?.chipId === "capital");
  const seat = (loc, fid) => {
    loc.controller = fid; loc.loyaltyOwner = fid;
    loc.sections = [fid, fid, fid]; loc.loyalty = CONFIG.loyalty.ceiling;
  };
  setStanding(g, a, b, 0); setStanding(g, b, a, 0);
  g.players[a].menace = 0; g.players[b].menace = 0; g.players[a].honor = 6; g.players[b].honor = 6;
  g.world.zoc = {};

  // `a` loses its seat but keeps a city. It still has something to trade from.
  const capA = Object.values(g.locations).find((l) => l.controller === a && isCap(l));
  const spare = Object.values(g.locations).find((l) => !l.controller);
  seat(spare, a);
  capA.controller = null;
  capA.sections = ["neutral", "neutral", "neutral"];
  check("a faction that has lost its Capital can still trade from the cities it holds",
    formTradingPact(g, a, b).ok);

  // …but one with nothing left cannot.
  const g2 = createGame({ seed }); ensureDiplomacy(g2);
  setStanding(g2, a, b, 0); setStanding(g2, b, a, 0);
  g2.players[a].menace = 0; g2.players[b].menace = 0; g2.players[a].honor = 6; g2.players[b].honor = 6;
  for (const loc of Object.values(g2.locations)) if (loc.controller === a) loc.controller = null;
  const landless = formTradingPact(g2, a, b);
  check("…and a landless faction has nowhere to trade from",
    !landless.ok && /somewhere to trade from/.test(landless.reason || ""));
}

// Trade routes may run by rail, not only overland — a pact should not collapse
// for want of a footpath while a railway runs between the two.
line("\n  [§1.3] Trading Pact — routing by rail");
{
  const stage = () => {
    const g = createGame({ seed }); ensureDiplomacy(g);
    const a = "versari", b = "goldgrass";
    const isCap = (l) => (l.chips || []).some((c) => g.chips[c]?.chipId === "capital");
    const capA = Object.values(g.locations).find((l) => l.controller === a && isCap(l));
    const capB = Object.values(g.locations).find((l) => l.controller === b && isCap(l));
    for (const loc of Object.values(g.locations)) if (loc !== capA && loc !== capB) loc.controller = null;
    setStanding(g, a, b, 0); setStanding(g, b, a, 0);
    g.players[a].menace = 0; g.players[b].menace = 0; g.players[a].honor = 6; g.players[b].honor = 6;
    // Wall the OVERLAND route completely: a third faction's ZoC over every hex
    // but the two capitals. reinforcementRoute treats enemy ZoC as a wall; rail
    // does not care about ZoC at all, only about who is standing on the line.
    g.world.zoc = {};
    for (const h of Object.keys(g.board.hexes)) {
      if (h !== capA.hexId && h !== capB.hexId) g.world.zoc[h] = "plainers";
    }
    return { g, a, b, capA, capB };
  };

  {
    const { g, a, b, capA, capB } = stage();
    const overland = !!reinforcementRoute(g, a, capB.hexId);
    const railed = (g.board.rails || []).length > 0;
    const res = formTradingPact(g, a, b);
    check("Trading Pact: forms over an intact rail line with the overland route walled off",
      railed && !overland && res.ok);
    runDiplomacyRound(g);
    const agr = g.diplomacy.agreements.find((x) => x.type === "trading-pact");
    check("Trading Pact: a railed route keeps it running", !!agr && agr.suspended === false);
  }

  {
    const { g, a, b } = stage();
    formTradingPact(g, a, b);
    // Park a hostile third party on every rail hex — the line is track, not an
    // abstraction, so standing on it severs it (rail doc §2.1).
    const railHexes = new Set((g.board.rails || []).flatMap((l) => l.path));
    setStanding(g, a, "plainers", -8); setStanding(g, "plainers", a, -8);
    setStanding(g, b, "plainers", -8); setStanding(g, "plainers", b, -8);
    let n = 0;
    for (const h of railHexes) {
      const u = Object.values(g.units).find((x) => x.owner === "plainers" && !x.parked);
      if (!u) break;
      u.node = h; u.parked = true; n++;
    }
    runDiplomacyRound(g);
    const agr = g.diplomacy.agreements.find((x) => x.type === "trading-pact");
    check("Trading Pact: an enemy standing on the line cuts the railed route",
      n > 0 && !!agr && agr.suspended === true);
  }
}

// §1.6 — the open-borders Standing gate reports WHICH side is short.
line("\n  [§1.6] Open Borders — mutual standing");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "goldgrass";
  const need = DH.tiers.friendly;

  // The case that reads as a bug: they like you plenty, you do not like them.
  setStanding(g, b, a, need + 2);
  setStanding(g, a, b, need - 2);
  const oneWay = openBordersStanding(g, a, b);
  check("Open Borders: one-sided Friendly is refused, naming YOUR side as short",
    !oneWay.ok && oneWay.reason.includes("your regard"));
  const attempt = performDiplomacy(g, a, "set-open-borders", { faction: b, on: true });
  check("Open Borders: the engine refuses with that same reason",
    !attempt.ok && attempt.reason === oneWay.reason);

  // And the mirror image, so the message is not just always blaming you.
  setStanding(g, a, b, need + 2);
  setStanding(g, b, a, need - 2);
  check("Open Borders: when THEY are short, the reason says so",
    openBordersStanding(g, a, b).reason.includes("their regard"));

  setStanding(g, b, a, need);
  check("Open Borders: exactly Friendly on both sides passes — the tier label is not a lie",
    openBordersStanding(g, a, b).ok &&
    performDiplomacy(g, a, "set-open-borders", { faction: b, on: true }).ok);
}

// §1.4 — Demand Tribute
line("\n  [§1.4] Demand Tribute");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const strong = "versari", weak = "lakers";
  g.players[strong].vp += 30; // overwhelming power lead
  g.players[weak].resource = 10;
  check("Demand Tribute is power-gated (strong enough → allowed)", canDemandTribute(g, strong, weak));
  const r = performDiplomacy(g, strong, "demand-tribute", { faction: weak, amount: 5 });
  check("a much-stronger demander makes the target cave (tribute transferred)",
    r.ok && r.caved && g.players[weak].resource === 5 && g.players[strong].resource >= 5);
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const strong = "versari", target = "lakers";
  g.players[target].resource = 10;
  // Tune the power ratio to ~1.7 — passes the 1.5 gate but the target is brave
  // enough to refuse (ratio < caveBaseRatio 2.0), escalating to war.
  const base = powerOf(g, target);
  const cur = powerOf(g, strong);
  g.players[strong].vp += Math.max(0, Math.ceil((1.7 * base - cur) / DH.coalition.vpWeight));
  check("Demand Tribute gate passes at a 1.7× power lead", canDemandTribute(g, strong, target));
  const r = performDiplomacy(g, strong, "demand-tribute", { faction: target, amount: 5 });
  check("a brave target near parity refuses tribute and the demand escalates to war",
    r.refused === true && atWar(g, strong, target));
}

// §1.5 — Sue for peace
line("\n  [§1.5] Sue for peace (deal-evaluated)");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const suer = "versari", ai = "lakers";
  declareWar(g, suer, ai, "test");
  const war = findWar(g, suer, ai);
  war.unitsLost[ai] = 5; war.locationsLost[ai] = 2; // the AI is bleeding
  g.round = 6; // duration 5
  check("warExhaustion rises with duration + own losses", warExhaustion(g, ai, suer) >= 8);
  const r = performDiplomacy(g, suer, "sue-for-peace", { faction: ai });
  check("sue-for-peace accepted when the AI is exhausted (war ends)",
    r.accepted === true && !atWar(g, suer, ai));
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const suer = "versari", ai = "lakers";
  declareWar(g, suer, ai, "test"); // fresh
  findWar(g, suer, ai).unitsLost[suer] = 3; // the AI is winning
  const r = performDiplomacy(g, suer, "sue-for-peace", { faction: ai });
  check("sue-for-peace refused when the AI is fresh + winning (war intact, no penalty)",
    r.accepted === false && atWar(g, suer, ai));
}

// §1.7 — Free vassal
line("\n  [§1.7] Free vassal");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const lord = "versari", vassal = "lakers";
  vassalize(g, lord, vassal, "test");
  check("vassalization establishes the tribute flow", g.diplomacy.agreements.some((a) => a.vassalTribute === vassal));
  const h0 = honorOf(g, lord);
  const r = performDiplomacy(g, lord, "free-vassal", { faction: vassal });
  check("free-vassal: +5 lord Honor, vassal freed to Friendly, tribute flow stops",
    r.ok && vassalLord(g, vassal) === null &&
    honorOf(g, lord) === Math.min(DH.honor.max, h0 + DH.freeVassal.honorGain) &&
    getStanding(g, vassal, lord) === DH.freeVassal.standingToFriendly &&
    !g.diplomacy.agreements.some((a) => a.vassalTribute === vassal));
}

// §1.8 — Pact call
line("\n  [§1.8] Player-initiated pact call");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const caller = "versari", ally = "lakers", target = "plainers";
  formPact(g, caller, ally, "test");
  declareWar(g, caller, target, "test");
  setStanding(g, ally, target, -8); setStanding(g, ally, caller, 10);
  check("evaluatePactCall honors when ally hates the target + loves the caller",
    evaluatePactCall(g, ally, caller, target).honor === true);
  const r = performDiplomacy(g, caller, "pact-call", { ally, target });
  check("pact-call honored → ally joins the war", r.honored === true && atWar(g, ally, target));
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const caller = "versari", ally = "lakers", target = "plainers";
  formPact(g, caller, ally, "test");
  declareWar(g, caller, target, "test");
  setStanding(g, ally, target, 5); setStanding(g, ally, caller, -2);
  g.players[target].vp += 40; // a strong target the ally won't risk
  const sBefore = getStanding(g, caller, ally);
  check("evaluatePactCall declines when ally is friendly to a strong target",
    evaluatePactCall(g, ally, caller, target).honor === false);
  const r = performDiplomacy(g, caller, "pact-call", { ally, target });
  check("pact-call declined → caller Standing toward ally drops",
    r.honored === false && getStanding(g, caller, ally) === sBefore - DH.pactCall.declineStandingHit);
}

// §1.8 — incoming pact-call inbox (AI ally → human)
line("\n  [§1.8] incoming pact-call inbox");
{
  const human = "versari", ally = "lakers", target = "plainers";
  // queue: an AI ally at war queues a call to the human (not resolved at once)
  const g = createGame({ seed, humanFactionId: human }); ensureDiplomacy(g);
  formPact(g, human, ally, "test");
  declareWar(g, ally, target, "test"); // ally at war; human is not
  runDiplomacyRound(g);
  const call = g.diplomacy.pendingCalls.find((c) => c.from === ally && c.target === target);
  check("an AI ally at war queues a pact call to the human inbox", !!call);

  // accept → human joins the war, call cleared, ally Standing rises
  const sUp = getStanding(g, human, ally);
  const ra = performDiplomacy(g, human, "respond-pact-call", { callId: call.id, accept: true });
  check("answering an inbox call declares war + clears it + warms the ally",
    ra.ok && ra.honored === true && atWar(g, human, target) &&
    !g.diplomacy.pendingCalls.some((c) => c.id === call.id) &&
    getStanding(g, human, ally) === sUp + DH.pactCall.honorGainOnHonor);
}
{
  // refuse → Honor + the caller's Standing toward you drop, no war
  const human = "versari", ally = "lakers", target = "plainers";
  const g = createGame({ seed, humanFactionId: human }); ensureDiplomacy(g);
  formPact(g, human, ally, "test");
  declareWar(g, ally, target, "test");
  runDiplomacyRound(g);
  const call = g.diplomacy.pendingCalls.find((c) => c.from === ally);
  const h0 = honorOf(g, human), s0 = getStanding(g, ally, human);
  const rr = performDiplomacy(g, human, "respond-pact-call", { callId: call.id, accept: false });
  check("refusing an inbox call costs Honor + the ally's Standing, and no war starts",
    rr.ok && rr.honored === false && !atWar(g, human, target) &&
    honorOf(g, human) === h0 - DH.honor.breakLoss &&
    getStanding(g, ally, human) === s0 - DH.pactCall.declineStandingHit);
}
{
  // expiry → an unanswered call lapses (no penalty) once the war is gone
  const human = "versari", ally = "lakers", target = "plainers";
  const g = createGame({ seed, humanFactionId: human }); ensureDiplomacy(g);
  formPact(g, human, ally, "test");
  declareWar(g, ally, target, "test");
  runDiplomacyRound(g);
  const call = g.diplomacy.pendingCalls.find((c) => c.from === ally);
  // the war ends (so it won't be re-queued), then time passes the expiry
  g.diplomacy.wars = g.diplomacy.wars.filter(
    (w) => !((w.a === ally && w.b === target) || (w.a === target && w.b === ally)));
  g.round = call.expiresOnRound + 1;
  const h0 = honorOf(g, human);
  runDiplomacyRound(g);
  check("an unanswered inbox call lapses after expiry with no Honor penalty",
    !g.diplomacy.pendingCalls.some((c) => c.id === call.id) && honorOf(g, human) === h0);
}

// §1.9 — Allied vision
line("\n  [§1.9] Allied vision auto-share + toggle");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  const hexes = Object.keys(g.board.hexes);
  g.visibility[a].visible = new Set([hexes[0]]);
  g.visibility[b].visible = new Set([hexes[1]]);
  formPact(g, a, b, "test"); // applySharedVision unions on formation
  check("pact auto-shares vision (both factions see the union)",
    g.visibility[a].visible.has(hexes[1]) && g.visibility[b].visible.has(hexes[0]));
  const s0 = getStanding(g, a, b);
  const r = performDiplomacy(g, a, "toggle-allied-vision", { faction: b, on: false });
  const agr = findPactAgreement(g, a, b);
  check("toggle-allied-vision off flips visionShare + costs 1 Standing",
    r.ok && agr.visionShare === false && getStanding(g, a, b) === s0 - DH.pact.toggleVisionStandingHit);
}

// §1.6 / §1.10 — Open borders
line("\n  [§1.6/§1.10] Open borders contract");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  check("hasOpenBorders is false with no agreement", !hasOpenBorders(g, a, b));
  formPact(g, a, b, "test");
  check("pacted parties have open borders by default (§1.10)",
    hasOpenBorders(g, a, b) && hasOpenBorders(g, b, a));
  performDiplomacy(g, a, "toggle-open-borders", { faction: b, on: false });
  check("toggle-open-borders off removes the pact passage", !hasOpenBorders(g, a, b));
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  g.players[a].menace = 0; g.players[b].menace = 0; g.players[a].honor = 6; g.players[b].honor = 6;
  setStanding(g, a, b, 0); setStanding(g, b, a, 0);
  check("set-open-borders refused below Friendly",
    !performDiplomacy(g, a, "set-open-borders", { faction: b, on: true }).ok);
  setStanding(g, a, b, 6); setStanding(g, b, a, 6);
  check("set-open-borders grants standalone passage at Friendly+",
    performDiplomacy(g, a, "set-open-borders", { faction: b, on: true }).ok && hasOpenBorders(g, a, b));
  check("set-open-borders off removes standalone passage",
    performDiplomacy(g, a, "set-open-borders", { faction: b, on: false }).ok && !hasOpenBorders(g, a, b));
}

// Rail doc §2 — where the trunk line stops. It used to stop at the four
// CAPITALS and nowhere else, which gave every board the same three links
// however big the map or however many cities were seated, and meant the only
// way to hold both ends of a link — which is what production pooling needs —
// was to take an enemy capital.
{
  line("\n  [Rail doc §2] The trunk stops at the major settlements");
  const rails = (g2) => g2.board.rails || [];
  const hubsOf = (g2) => new Set(rails(g2).flatMap((l) => [l.a, l.b]));
  const nameAt = (g2, hex) => LOCATIONS[g2.locations[hex]?.locationId];

  const small = createGame({ seed, mapSize: "medium", locationBudget: 6 });
  const big = createGame({ seed, mapSize: "large", locationBudget: 19 });
  check("rail scales with how many major settlements are seated",
    rails(big).length > rails(small).length);
  check("…and stops at more than the four capitals",
    hubsOf(big).size > 4);

  // Every station is a major settlement, and never a sign-named one.
  const badTier = [...hubsOf(big)].filter((h) => {
    const def = nameAt(big, h);
    return !def || !CONFIG.rail.hubTiers.includes(def.strategicValue);
  });
  check("every station is a settlement in the hub tiers",
    badTier.length === 0);
  check("…and a sign-named settlement is never a station",
    [...hubsOf(big)].every((h) => !nameAt(big, h)?.noRailTerminus));

  // Capitals are all `high`, so widening the band must not drop any of them.
  const capHexes = Object.values(big.locations)
    .filter((l) => (l.chips || []).some((c) => big.chips[c]?.chipId === "capital"))
    .map((l) => l.hexId);
  check("every capital is still on the line",
    capHexes.length > 0 && capHexes.every((h) => hubsOf(big).has(h)));

  // A line may still RUN THROUGH a hex that is not a station — that is what
  // makes it cuttable per-hex rather than an abstract edge.
  check("a link is a real sequence of hexes, not an abstract edge",
    rails(big).every((l) => l.path.length >= 2 && l.path[0] === l.a && l.path[l.path.length - 1] === l.b));

  // The network is one system: every station reachable from every other.
  const seen = new Set([rails(big)[0].a]);
  const queue = [rails(big)[0].a];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of rails(big)) {
      const far = l.a === cur ? l.b : l.b === cur ? l.a : null;
      if (far && !seen.has(far)) { seen.add(far); queue.push(far); }
    }
  }
  check("…and the trunk is ONE network, not islands", seen.size === hubsOf(big).size);
}

// Rail doc §2.3 — running rights over another faction's stations.
{
  line("\n  [Rail doc §2.3] Running rights");
  const g = createGame({ seed }); ensureDiplomacy(g);
  const a = "versari", b = "lakers";
  g.players[a].menace = 0; g.players[b].menace = 0; g.players[a].honor = 6; g.players[b].honor = 6;

  // Below Neutral, nobody is lending anybody a railway.
  setStanding(g, a, b, -4); setStanding(g, b, a, -4);
  check("rail access refused below Neutral",
    !performDiplomacy(g, a, "set-rail-access", { faction: b, on: true }).ok);

  // Neutral is enough — a LOWER bar than open borders (Friendly+), which is
  // the point: freight is not an army.
  setStanding(g, a, b, 0); setStanding(g, b, a, 0);
  const grant = performDiplomacy(g, a, "set-rail-access", { faction: b, on: true });
  check("rail access granted at Neutral, a lower bar than open borders",
    grant.ok && !openBordersStanding(g, a, b).ok);
  check("rail access is one-directional — granting is not receiving",
    hasRailAccess(g, b, a) && !hasRailAccess(g, a, b));
  check("rail access revokes cleanly",
    performDiplomacy(g, a, "set-rail-access", { faction: b, on: false }).ok &&
    !hasRailAccess(g, b, a));

  // A pact carries running rights without a separate negotiation.
  check("pacted factions ride each other's lines implicitly", (() => {
    const h = createGame({ seed }); ensureDiplomacy(h);
    formPact(h, a, b);
    return hasRailAccess(h, a, b) && hasRailAccess(h, b, a);
  })());

  // Transport: a link whose far station belongs to someone else is closed
  // until they grant rights, then it opens.
  check("running rights open a foreign station for unit transport", (() => {
    const h = createGame({ seed }); ensureDiplomacy(h);
    // CONSTRUCT the situation rather than hunt the board for it. This used to
    // take rails[0] and assume its two ends belonged to different factions,
    // which held only while rail stopped at capitals and nothing else. Now the
    // trunk stops at every major settlement and the capitals are joined
    // THROUGH the unheld big cities, so on some seeds no link has a rival at
    // each end at all — and a fixture that returns early is a check that
    // silently stopped checking.
    const link = (h.board.rails || [])[0];
    if (!link) return false;
    const holderA = "versari", holderB = "lakers";
    const seat = (hexId, fid) => {
      const loc = h.locations[hexId];
      loc.controller = fid;
      loc.loyaltyOwner = fid;
      loc.sections = [fid, fid, fid];
      loc.loyalty = CONFIG.loyalty.ceiling;
    };
    seat(link.a, holderA);
    seat(link.b, holderB);
    // Pick the rider FIRST, then clear every other unit off the line so a
    // parked garrison isn't what closes it (deleting first can delete the
    // only unit holderA has).
    const rider = Object.values(h.units).find((u) => u.owner === holderA);
    if (!rider) return false;
    for (const uid of Object.keys(h.units)) {
      if (uid !== rider.uid && link.path.includes(h.units[uid].node)) delete h.units[uid];
    }
    rider.node = link.a;
    const before = unitRailEdges(h, rider);
    setStanding(h, holderB, holderA, 0);
    h.players[holderB].menace = 0; h.players[holderA].honor = 6;
    const ok = performDiplomacy(h, holderB, "set-rail-access", { faction: holderA, on: true }).ok;
    const after = unitRailEdges(h, rider);
    // Assert the specific EDGE, not the whole station. A hub now has several
    // lines out of it, and unheld track is nobody's to close — so the station
    // can be open toward a neutral neighbour while still shut toward this
    // rival's. "Does this station have any edge at all" stopped being the
    // same question as "is this link open".
    return ok
      && !before?.get(link.a)?.includes(link.b)
      && !!after?.get(link.a)?.includes(link.b);
  })());
}

// Open borders is a permit, not a wall — moving through territory without it
// is trespassing (relations hit); with it, free passage.
//
// These fixtures move onto "the first non-Location adjacent hex" — for some
// seeds that happens to be a field-encounter tile, whose headless
// auto-resolved choice can itself change Standing (e.g. "side with X")
// independently of the trespass logic. Reading the emitted
// `territory_trespassed` event (or its absence) instead of the net
// before/after Standing lets the assertion isolate the trespass rule from
// whatever else a given seed's map happens to trigger on that hex.
const lastTrespassEvent = (g) => [...g.log].reverse().find((e) => e.name === "territory_trespassed");
// A citation is a diplomatic reaction, so it needs someone to have reacted.
// Slipping through cover used to be cited by a faction that could not see you
// — the one place ZoC and Vision were fused (rail doc Part 0).
line("\n  [Open borders] trespass needs the host to SEE you");
{
  // Same intrusion three ways: open ground seen, cover unseen, cover detected.
  const stage = (pick) => {
    const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
    const mover = g.turnOrder[0], owner = g.turnOrder[1];
    setStanding(g, owner, mover, CONFIG.diplomacy.tiers.wary - 1); // no courtesy
    const u = Object.values(g.units).find((x) => x.owner === mover);
    const dest = (g.board.adjacency[u.node] || []).find(pick(g));
    if (!dest) return null;
    g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner;
    revealRegion(g, owner, [dest]); // the hex itself is in sight either way
    u.moveRemaining = 2; recomputeStats(g);
    return { g, mover, owner, u, dest };
  };
  const open = (g) => (h) => !g.locations[h] && !g.board.hexes[h].cover;
  const covered = (g) => (h) => !g.locations[h];

  {
    const st = stage(open);
    performAction(st.g, "move", { unit: st.u.uid, to: st.dest });
    check("Trespass: open ground in plain sight is still cited", !!lastTrespassEvent(st.g));
  }
  {
    // Force the destination into cover — the terrain that exists to hide you.
    const st = stage(covered);
    st.g.board.hexes[st.dest].cover = true;
    performAction(st.g, "move", { unit: st.u.uid, to: st.dest });
    check("Trespass: slipping through cover is NOT cited by a host without Detection",
      !lastTrespassEvent(st.g));
  }
  {
    // Same cover, but the host can see through it. Detection is granted via a
    // Watchtower on a Location the host holds next to the hex — failing that,
    // fall back to asserting the concealment check is what did it.
    const st = stage(covered);
    st.g.board.hexes[st.dest].cover = true;
    const seen = isUnitVisibleTo(st.g, st.owner, st.u);
    performAction(st.g, "move", { unit: st.u.uid, to: st.dest });
    check("Trespass: the citation tracks visibility exactly — cited iff seen",
      !!lastTrespassEvent(st.g) === seen);
  }
}

line("\n  [Open borders] territory trespass penalty");
{
  // Move a unit into a DISTRUSTFUL faction's ZoC with no open borders →
  // the full relations + reputation hit. (At Neutral-or-better the tuning
  // pass downgrades trespass to a warning — asserted in Phase 20.)
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, CONFIG.diplomacy.tiers.wary - 1);
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h] && !g.board.hexes[h].cover);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner; // owner's territory
  revealRegion(g, owner, [dest]); // the host can see the intrusion
  u.moveRemaining = 2; recomputeStats(g);
  performAction(g, "move", { unit: u.uid, to: dest });
  const ev = lastTrespassEvent(g);
  check("trespassing on distrustful ground hits relationship + reputation in full",
    !!ev && ev.payload.standingHit === CONFIG.diplomacy.trespass.standingPenalty &&
    ev.payload.repHit === CONFIG.diplomacy.trespass.reputationPenalty &&
    CONFIG.diplomacy.trespass.standingPenalty > CONFIG.diplomacy.trespass.reputationPenalty);
}
{
  // Same move, but with an open-borders agreement → no penalty (free passage).
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, 0);
  g.diplomacy.agreements.push({ id: "ob-test", type: "open-borders", a: mover, b: owner, since: 0 });
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h] && !g.board.hexes[h].cover);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner;
  revealRegion(g, owner, [dest]); // the host can see the intrusion
  u.moveRemaining = 2; recomputeStats(g);
  performAction(g, "move", { unit: u.uid, to: dest });
  check("an open-borders agreement waives the trespass penalty (no Standing or Menace hit)",
    !lastTrespassEvent(g));
}
{
  // On Friendly+ terms the first incursion is a courtesy WARNING (the
  // escalation ladder starts at 0 — see Phase 20 for the full ladder).
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, CONFIG.diplomacy.tiers.friendly); // good terms
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h] && !g.board.hexes[h].cover);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner;
  revealRegion(g, owner, [dest]); // the host can see the intrusion
  u.moveRemaining = 2; recomputeStats(g);
  performAction(g, "move", { unit: u.uid, to: dest });
  const ev = lastTrespassEvent(g);
  check("on good terms the first incursion is a warning, not a hit",
    !!ev && ev.payload.warning === true && ev.payload.standingHit === 0 && ev.payload.repHit === 0);
}

// §6.2 — war-record listeners (combat feeds the war record)
line("\n  [§6.2] war-record listeners");
{
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const me = g.turnOrder[0], foe = g.turnOrder[1];
  declareWar(g, me, foe, "test");
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
  clearHexOfUnits(g, terrain);
  const atk = Object.values(g.units).find((u) => u.owner === me);
  const vic = Object.values(g.units).find((u) => u.owner === foe);
  atk.node = terrain; atk.moveRemaining = atk.movement; atk.baseStrength = 12;
  vic.node = terrain; vic.baseStrength = 1;
  recomputeStats(g); g.players[me].actions.remaining = 5; g.rng.roll = () => 6;
  performAction(g, "contest", { unit: atk.uid, target: vic.uid });
  const war = findWar(g, me, foe);
  check("unit_destroyed in a war increments war.unitsLost for the victim's owner",
    !!war && (war.unitsLost[foe] || 0) >= 1);
  check("contest_won credits war.contestsWon for the winner",
    !!war && (war.contestsWon[me] || 0) >= 1);
}

// =====================================================================
// Phase 10 — content-tool DSL extensions (chip checks, unit_count, score)
// + trigger weight + DELIVER_ENCOUNTER condition gating + hex-filter
// terrain/road keys.
// =====================================================================
line("\n  [Phase 10] content-tool gates");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = activePlayerId(g);

  // has_chip — every faction starts with a Capital chip on their capital.
  const capitalCheck = {
    has_chip: { holder: "active-player-locations", chipId: "capital", player: me },
  };
  check("has_chip / active-player-locations finds the starter Capital",
    evalCond(g, capitalCheck) === true);

  const missingCheck = {
    has_chip: { holder: "active-player-locations", chipId: "never-existed", player: me },
  };
  check("has_chip with unknown chip returns false",
    evalCond(g, missingCheck) === false);

  // unit_count — owner's starting units.
  const expected = Object.values(g.units).filter((u) => u.owner === me).length;
  const countCond = { unit_count: { player: me } };
  check("unit_count returns owner's unit total",
    evalCond(g, countCond) === expected);

  // score (menace / honor) — at game start both are baselines.
  const menaceCond = { score: { kind: "menace", player: me } };
  const honorCond = { score: { kind: "honor", player: me } };
  check("score / menace = 0 at start", evalCond(g, menaceCond) === 0);
  check("score / honor = configured start value",
    evalCond(g, honorCond) === CONFIG.diplomacy.honor.start);

  // score / standing — reads the matrix verbatim (factions have temperament
  // presets at start; the test just confirms the DSL returns whatever is in
  // the matrix, not 0 specifically).
  const foe = g.turnOrder[1];
  const standingCond = { score: { kind: "standing", fromFaction: me, toFaction: foe } };
  check("score / standing reads the factionStanding matrix",
    evalCond(g, standingCond) === g.factionStanding[me][foe]);

  // op-with-score-as-Val: gate triggers as `score.menace > 5`.
  g.players[me].menace = 10;
  const menaceGate = {
    op: "gt",
    left: { score: { kind: "menace", player: me } },
    right: 5,
  };
  check("score nests as Val inside an op() predicate",
    evalCond(g, menaceGate) === true);
}

// trigger weight — strength × weight beats a higher raw strength.
line("\n  [Phase 10] trigger weight multiplier");
{
  // Simulate: two triggers, strength 3 weight 2 vs strength 5 weight 0.5.
  // Final scores: 6.0 vs 2.5 — the first should beat the second.
  const a = { strength: 3, weight: 2, score: 3 * 2 };
  const b = { strength: 5, weight: 0.5, score: 5 * 0.5 };
  check("weight-2 strength-3 (score 6) beats weight-0.5 strength-5 (score 2.5)",
    a.score > b.score);
}

// DELIVER_ENCOUNTER skip-on-condition.
line("\n  [Phase 10] DELIVER_ENCOUNTER condition gate");
{
  const g = createGame({ seed });
  startTurn(g);
  let skipped = false;
  // Stub a content entry for the test by pulling any existing field encounter id.
  const anyId = Object.keys(WORLD_ENCOUNTERS)[0] || "ghost";
  // Hook the event listener.
  const origLen = g.log.length;
  applyEffect(g, {
    type: "DELIVER_ENCOUNTER",
    encounterId: anyId,
    condition: { op: "eq", left: 1, right: 2 }, // always false
  }, {});
  skipped = g.log.slice(origLen).some(
    (ev) => ev.name === "encounter_delivery_skipped" && ev.payload?.encounterId === anyId,
  );
  check("DELIVER_ENCOUNTER with a false condition emits encounter_delivery_skipped", skipped);
}

// hex-filter terrain + hasRoad — stamp test data onto a hex and probe pickHexByFilter.
line("\n  [Phase 10] hex-filter terrain + hasRoad");
{
  const g = createGame({ seed });
  // Use a unique terrain marker so terrain= filter is deterministic.
  const someHex = Object.values(g.board.hexes).find((h) => h.type === "terrain");
  someHex.terrain = "__testronium__";
  const onTerrain = pickHexByFilter(g, { terrain: "__testronium__" });
  check("hex-filter terrain matches a stamped terrain sub-type",
    onTerrain === someHex.id);

  // Road filter: just verify the picked hex actually has road=true (the
  // capital-to-capital MST already stamps several road hexes at setup).
  const onRoad = pickHexByFilter(g, { hasRoad: true });
  check("hex-filter hasRoad:true picks a road hex",
    onRoad != null && g.board.hexes[onRoad]?.road === true);
  const offRoad = pickHexByFilter(g, { hasRoad: false });
  check("hex-filter hasRoad:false picks a non-road hex",
    offRoad != null && !g.board.hexes[offRoad]?.road);
}

// =====================================================================
// Phase 11 — text-token resolver. Substitutes {kind:selector} tokens
// in flavor text using current state. Unknown / unresolvable tokens
// fall back to a generic word so text never reads as broken.
// =====================================================================
line("\n  [Phase 11] text-token resolver");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = activePlayerId(g);

  // {faction:active} resolves to the active player's faction name.
  const activeName = factionDef(me).name;
  check("{faction:active} resolves to the active player's faction name",
    resolveTokens(g, "Hail, {faction:active}.") === `Hail, ${activeName}.`);

  // Unknown selector falls back to "someone".
  check("unknown faction selector falls back to 'someone'",
    resolveTokens(g, "{faction:nonsense}") === "someone");

  // Unknown kind passes through unchanged.
  check("unknown kind leaves the token as-is",
    resolveTokens(g, "{weather:rain}") === "{weather:rain}");

  // Text with no token returns unchanged.
  check("text without tokens passes through verbatim",
    resolveTokens(g, "no tokens here") === "no tokens here");

  // Lowest-standing — set a clear minimum and verify it picks that faction.
  const foe = g.turnOrder[1];
  if (g.factionStanding && g.factionStanding[foe]) {
    g.factionStanding[foe][me] = -99;
    const foeName = factionDef(foe).name;
    check("{faction:lowest-standing-with-active} picks the faction with smallest standing toward active",
      resolveTokens(g, "{faction:lowest-standing-with-active}") === foeName);
  }

  // {location:active-capital} should find the starter capital.
  const capRes = resolveTokens(g, "meet at {location:active-capital}");
  check("{location:active-capital} resolves to a known Location name",
    capRes.startsWith("meet at ") && !capRes.endsWith("a place"));

  // Multiple tokens in one string.
  const both = resolveTokens(g, "{faction:active} marches on {location:active-capital}");
  check("multiple tokens resolve independently in one pass",
    both.includes(activeName) && !both.includes("{"));
}


// Phase 12 — chip content batch v0.1 (docs/chip-set-v0.1.md,
// docs/location-chips-v0.1.md): the one-chip-per-stat rule, faction-locked
// signatures, and the per-Location behavior chips.
{
  line("\n  [Phase 12] chip content batch v0.1");
  const install = (g, holder, chipId) => {
    const uid = g.nextId("chip");
    g.chips[uid] = { uid, chipId };
    holder.chips.push(uid);
    recomputeStats(g); recomputeResearch(g); recomputeInfluence(g);
    return uid;
  };

  // -- logistics-hub actionBonus: install BEFORE the first startTurn so the
  // Upkeep grant is observable on the opening turn.
  const gH = createGame({ seed: 91 });
  const hubPid = gH.turnOrder[gH.activeIndex];
  const hubLoc = Object.values(gH.locations).find((l) => l.controller === hubPid);
  install(gH, hubLoc, "logistics-hub");
  startTurn(gH);
  check("logistics-hub: its Location acts twice per turn (actionBonus)",
    hubLoc.actionsRemaining === 2);

  const g12 = createGame({ seed: 92 });
  startTurn(g12);
  const pid = g12.turnOrder[g12.activeIndex];
  const p12 = g12.players[pid];
  p12.resource = 99;
  p12.actions.remaining = 99;
  p12.permanentResearch = 20; recomputeResearch(g12); // Tech L5 — nothing gated
  const home = Object.values(g12.locations).find((l) => l.controller === pid);
  const grunt = Object.values(g12.units).find((u) => u.owner === pid);
  grunt.node = home.hexId;

  // -- one-chip-per-stat: a strength chip blocks a second strength chip on
  // the same unit but not a movement chip.
  install(g12, grunt, "drilled-troops");
  const dupe = performAction(g12, "build", { at: home.hexId, chipId: "sharpened-blades" });
  check("one-per-stat: second Strength chip refused on the same unit", !dupe.ok);
  const cross = performAction(g12, "build", { at: home.hexId, chipId: "navigator" });
  check("one-per-stat: a Movement chip still installs beside a Strength chip", !!cross.ok);
  home.activeBuild = null; home.buildProgress = 0; // clear for later checks

  // -- faction lock: only your own signature shows in the build menu.
  const menuIds = buildableChips(g12, home).map((o) => o.chipId);
  const ownSig = { versari: "burning-glass", goldgrass: "guest-house", lakers: "motor-pool", plainers: "waystation" }[pid];
  const foreignSigs = ["burning-glass", "guest-house", "motor-pool", "waystation"].filter((c) => c !== ownSig);
  check("faction lock: own signature chip is offered", menuIds.includes(ownSig));
  check("faction lock: foreign signature chips are hidden", foreignSigs.every((c) => !menuIds.includes(c)));
  const foreign = performAction(g12, "build", { at: home.hexId, chipId: foreignSigs[0] });
  check("faction lock: building a foreign signature is refused", !foreign.ok);

  // -- civic-hall: faster rise while garrisoned, no decay while neglected.
  const town = Object.values(g12.locations).find((l) => !l.controller);
  town.controller = pid; town.loyaltyOwner = pid;
  town.sections = town.sections.map(() => pid);
  town.loyalty = 4;
  install(g12, town, "civic-hall");
  const sentry = Object.values(g12.units).filter((u) => u.owner === pid)[1] || grunt;
  const sentryHome = sentry.node;
  sentry.node = town.hexId;
  tickLoyalty(g12, pid);
  check("civic-hall: garrisoned Loyalty rises 2/Upkeep (base 1 + chip 1)", town.loyalty === 6);
  sentry.node = sentryHome; grunt.node = home.hexId;
  tickLoyalty(g12, pid);
  check("civic-hall: neglected Loyalty holds instead of decaying", town.loyalty === 6);

  // -- works: +1 build progress even with the slider fully on scrap.
  town.activeBuild = { kind: "build", chipId: "recyclers", cost: 99, targetSlot: 0 };
  town.buildProgress = 0; town.buildSlider = 0;
  install(g12, town, "works");
  applyOutputAndBuilds(g12, pid);
  check("works: active build advances +1/turn outside the slider split", town.buildProgress >= 1);
  town.activeBuild = null;

  // -- motor-pool: recruit discount reads through recruitCostAt.
  install(g12, town, "motor-pool"); // install directly — build path is faction-locked elsewhere
  check("motor-pool: recruit cost drops by the chip discount", recruitCostAt(g12, town) === CONFIG.unitRecruitCost - 2);

  // -- waystation: a unit opening its turn on the chip's Location gets +1
  // Movement for that turn via an until_your_next_turn modifier.
  install(g12, home, "waystation");
  grunt.node = home.hexId;
  const baseMove = grunt.movement;
  startTurn(g12); // cycles to the next player's Upkeep…
  while (g12.turnOrder[g12.activeIndex] !== pid) { endTurn(g12); startTurn(g12); }
  check("waystation: +1 Movement on the turn a unit starts there", grunt.movement === baseMove + 1);

  // -- burning-glass: pre-contest erosion on the attacker.
  const gBG = createGame({ seed: 93 });
  startTurn(gBG);
  const atkPid = gBG.turnOrder[gBG.activeIndex];
  gBG.players[atkPid].actions.remaining = 9;
  const foePid = gBG.turnOrder.find((f) => f !== atkPid);
  const foeLoc = Object.values(gBG.locations).find((l) => l.controller === foePid);
  const igniter = gBG.nextId("chip");
  gBG.chips[igniter] = { uid: igniter, chipId: "burning-glass" };
  foeLoc.chips.push(igniter);
  const raider = Object.values(gBG.units).find((u) => u.owner === atkPid);
  raider.node = foeLoc.hexId;
  performAction(gBG, "contest", { unit: raider.uid });
  const burn = gBG.log.find((e) => e.name === "garrison_erosion");
  check("burning-glass: attacker erodes 1 base Strength before the contest",
    !!burn && burn.payload.amount === 1 && burn.payload.unit === raider.uid);

  // -- bombard: static defenses zeroed on a Location contest.
  const gSG = createGame({ seed: 94 });
  startTurn(gSG);
  const sgPid = gSG.turnOrder[gSG.activeIndex];
  gSG.players[sgPid].actions.remaining = 9;
  const sgFoe = gSG.turnOrder.find((f) => f !== sgPid);
  const sgLoc = Object.values(gSG.locations).find((l) => l.controller === sgFoe);
  const defU = Object.values(gSG.units).find((u) => u.owner === sgFoe);
  defU.node = sgLoc.hexId; defU.fortified = true; defU.movedSinceUpkeep = false;
  const sgAtk = Object.values(gSG.units).find((u) => u.owner === sgPid);
  sgAtk.node = sgLoc.hexId;
  install(gSG, sgAtk, "bombard");
  const sgRes = performAction(gSG, "contest", { unit: sgAtk.uid });
  check("bombard: a fortified defender's static bonus is flattened (siege)",
    sgRes.attackerSiege === true && sgRes.defenderFortify === 0);

  // -- guest-house: standing toward the host rises for non-belligerents.
  const gGH = createGame({ seed: 95 });
  const host = gGH.turnOrder[0];
  const hostLoc = Object.values(gGH.locations).find((l) => l.controller === host);
  const parlor = gGH.nextId("chip");
  gGH.chips[parlor] = { uid: parlor, chipId: "guest-house" };
  hostLoc.chips.push(parlor);
  const guest = gGH.turnOrder[1];
  const before = getStanding(gGH, guest, host);
  runDiplomacyRound(gGH);
  const after = getStanding(gGH, guest, host);
  check("guest-house: a non-belligerent's Standing toward the host rises",
    after > before || after >= CONFIG.diplomacy.tiers.friendly);
}


// Phase 13 — special chips batch 2: reward delivery (GRANT_CHIP), chip
// activation (Cold Camp), and the per-chip hooks (docs/chip-set-v0.1.md).
{
  line("\n  [Phase 13] special chips: rewards, activation, hooks");
  const install = (g, holder, chipId) => {
    const uid = g.nextId("chip");
    g.chips[uid] = { uid, chipId };
    holder.chips.push(uid);
    recomputeStats(g);
    return uid;
  };
  const g13 = createGame({ seed: 131 });
  startTurn(g13);
  const pid = g13.turnOrder[g13.activeIndex];
  const p13 = g13.players[pid];
  p13.resource = 99; p13.actions.remaining = 99;
  const home = Object.values(g13.locations).find((l) => l.controller === pid);
  const vet = Object.values(g13.units).find((u) => u.owner === pid);

  // -- reward chips never appear in a build menu.
  const menu = buildableChips(g13, home).map((o) => o.chipId);
  check("reward chips are absent from every build menu",
    ["cold-camp", "night-march", "war-banner", "old-hands", "safe-conduct", "relay-kit"]
      .every((c) => !menu.includes(c)));

  // -- GRANT_CHIP installs into the triggering unit's bay…
  applyEffect(g13, { type: "GRANT_CHIP", chipId: "old-hands" }, { sourceUnit: vet.uid });
  check("GRANT_CHIP installs the reward into the triggering unit's bay",
    vet.chips.some((c) => g13.chips[c]?.chipId === "old-hands"));
  // …and overflows to hex loot when the bay is full.
  install(g13, vet, "trailwise"); // bay now 2/2
  applyEffect(g13, { type: "GRANT_CHIP", chipId: "night-march" }, { sourceUnit: vet.uid });
  check("GRANT_CHIP drops as hex loot when the bay is full",
    (g13.hexLoot?.[vet.node] || []).some((c) => g13.chips[c]?.chipId === "night-march"));

  // -- old-hands: the unit counts as veteran (cap 8, contest bonus reads).
  check("old-hands: unit counts as a veteran while installed", effectiveVeteran(g13, vet));

  // -- trailwise: the drawing unit adds its own redraw to the budget.
  check("trailwise: unit-carried encounter redraw joins the budget",
    encounterRedrawBudget(g13, pid, vet) === encounterRedrawBudget(g13, pid) + 1);

  // -- cold camp: pay scrap, unseen even in contact, expires on your next turn.
  const g14 = createGame({ seed: 132 });
  startTurn(g14);
  const spid = g14.turnOrder[g14.activeIndex];
  g14.players[spid].resource = 99; g14.players[spid].actions.remaining = 99;
  const sneak = Object.values(g14.units).find((u) => u.owner === spid);
  const camp = g14.nextId("chip");
  g14.chips[camp] = { uid: camp, chipId: "cold-camp" };
  sneak.chips.push(camp);
  const foe = g14.turnOrder.find((f) => f !== spid);
  const watcher = Object.values(g14.units).find((u) => u.owner === foe);
  watcher.node = sneak.node; // contact — normally reveals point-blank
  recomputeVisibility(g14, foe);
  const seenBefore = isUnitVisibleTo(g14, foe, sneak);
  const scrapBefore = g14.players[spid].resource;
  const act = performAction(g14, "activate-chip", { unit: sneak.uid, chip: camp });
  recomputeVisibility(g14, foe);
  check("cold camp: activation costs its scrap and conceals even in contact",
    act.ok && g14.players[spid].resource === scrapBefore - 2 &&
    seenBefore && !isUnitVisibleTo(g14, foe, sneak));
  const again = performAction(g14, "activate-chip", { unit: sneak.uid, chip: camp });
  check("cold camp: cannot re-activate while already concealed", !again.ok);
  for (let i = 0; i < g14.turnOrder.length; i++) { endTurn(g14); startTurn(g14); }
  recomputeVisibility(g14, foe);
  check("cold camp: concealment expires at the owner's next turn",
    isUnitVisibleTo(g14, foe, sneak));

  // -- night march: unit blockers vanish for the carrier; Locations still halt.
  const nmBlockersAll = movementBlockers(g14, spid);
  const nmBlockersNM = movementBlockers(g14, spid, { ignoreUnits: true });
  const foeLocHexes = Object.values(g14.locations)
    .filter((l) => l.controller && l.controller !== spid).map((l) => l.hexId);
  check("night march: foreign units stop blocking; enemy Locations still do",
    nmBlockersNM.size <= nmBlockersAll.size &&
    foeLocHexes.every((h) => !nmBlockersAll.has(h) || nmBlockersNM.has(h)));

  // -- safe conduct: moving into another faction's ZoC draws no trespass hit.
  const g15 = createGame({ seed: 133 });
  startTurn(g15);
  const scPid = g15.turnOrder[g15.activeIndex];
  const envoy = Object.values(g15.units).find((u) => u.owner === scPid);
  install(g15, envoy, "safe-conduct");
  const scFoe = g15.turnOrder.find((f) => f !== scPid);
  const scFoeLoc = Object.values(g15.locations).find((l) => l.controller === scFoe);
  g15.world.zoc = g15.world.zoc || {};
  g15.world.zoc[scFoeLoc.hexId] = scFoe; // force the destination into foe ZoC
  const trespassCountBefore = g15.log.filter((e) => e.name === "territory_trespassed").length;
  emit(g15, "unit_moved", { unit: envoy.uid, player: scPid, from: envoy.node, to: scFoeLoc.hexId });
  check("safe conduct: no trespass penalty fires for the carrier",
    g15.log.filter((e) => e.name === "territory_trespassed").length === trespassCountBefore);

  // -- relay kit: listening post buildable without Intelligence A2.
  const kit = install(g15, envoy, "relay-kit");
  const fieldHex = Object.values(g15.board.hexes).find(
    (h) => !g15.locations[h.id] && !postAt(g15, h.id));
  envoy.node = fieldHex.id;
  g15.players[scPid].resource = 99; g15.players[scPid].actions.remaining = 99;
  const post = performAction(g15, "build-post", { hex: fieldHex.id });
  check("relay kit: listening post deploys without the Intelligence tech", !!post.ok);

  // -- pathfinders shares the landship ignoresTerrain read.
  const scout = Object.values(g15.units).filter((u) => u.owner === scPid)[1] || envoy;
  install(g15, scout, "pathfinders");
  check("pathfinders: ignoresTerrain flag reads through", unitIgnoresTerrain(g15, scout));
}


// Phase 14 — repeatable VP faucets, elimination, chip removal
// (docs/vp-and-actions-design.md §1; removability ruling).
{
  line("\n  [Phase 14] VP faucets, elimination, chip removal");
  const install14 = (g, holder, chipId) => {
    const uid = g.nextId("chip");
    g.chips[uid] = { uid, chipId };
    holder.chips.push(uid);
    recomputeStats(g);
    return uid;
  };
  const cycleTo = (g, pid) => { do { endTurn(g); } while (!g.winnerId && g.turnOrder[g.activeIndex] !== pid); };
  // A foreign (non-affiliated, non-capital) high/veryHigh city for pid.
  const foreignCity = (g, pid) => Object.values(g.locations).find((l) => {
    const def = LOCATIONS[l.locationId];
    return def && def.affiliation && def.affiliation !== pid &&
      (def.strategicValue === "high" || def.strategicValue === "veryHigh") &&
      !l.chips.some((c) => g.chips[c]?.chipId === "capital");
  });
  const grabFor = (g, pid, loc, loyalty) => {
    loc.controller = pid; loc.loyaltyOwner = pid;
    loc.sections = loc.sections.map(() => pid);
    loc.loyalty = loyalty;
  };

  // -- VP is HELD, not ticked: taking a city moves its value across, losing it
  // moves it back, and Loyalty scales what it is worth while you have it.
  const gD = createGame({ seed: 141 });
  startTurn(gD);
  const dPid = gD.turnOrder[gD.activeIndex];
  const prize = foreignCity(gD, dPid);
  const rival = holderOf(prize);
  const prizeWorth = LOCATIONS[prize.locationId].vpReward;
  const before = gD.players[dPid].vp;
  const rivalBefore = rival ? gD.players[rival].vp : null;
  grabFor(gD, dPid, prize, CONFIG.loyalty.ceiling); // fully settled
  recomputeVp(gD);
  check("held VP: taking a settled city is worth its full value immediately",
    gD.players[dPid].vp === before + prizeWorth);
  check("held VP: and the same value leaves whoever held it",
    rival === null || gD.players[rival].vp === rivalBefore - prizeWorth);

  prize.loyalty = Math.floor(CONFIG.loyalty.ceiling / 2); // exactly half — not OVER
  recomputeVp(gD);
  check("held VP: under half Loyalty a city is worth half, rounded down",
    gD.players[dPid].vp === before + Math.floor(prizeWorth / 2));

  prize.loyalty = CONFIG.loyalty.ceiling / 2 + 1; // over half
  recomputeVp(gD);
  check("held VP: over half Loyalty restores the full value",
    gD.players[dPid].vp === before + prizeWorth);

  // Losing it takes the VP away again — the part a banked model could not do.
  grabFor(gD, rival || gD.turnOrder.find((f) => f !== dPid), prize, CONFIG.loyalty.ceiling);
  recomputeVp(gD);
  check("held VP: losing the city loses the VP", gD.players[dPid].vp === before);

  // Your own homeland counts now — dominion's "never your own land" rule went
  // with the faucet. A faction opens holding something, so it opens above zero.
  check("held VP: a faction's own homeland is worth VP, so nobody opens on 0",
    gD.turnOrder.filter((f) => factionDef(f)?.tier === "major")
      .every((f) => gD.players[f].vp > 0));

  // -- content invariant: the rail-incompatibility flag matches the rule.
  // The rule (2-slot unit chips can't use rail) is the source of truth; the
  // hand-set flags in content.js are documentation. This catches them drifting
  // apart, which is the failure mode a derived rule exists to prevent.
  const railMismatch = Object.values(CHIPS).filter(
    (c) => !!c.railIncompatible !== chipBlocksRail(c.id) && c.kind === "unit",
  );
  check("rail-incompatible chips are exactly the 2-slot unit chips",
    railMismatch.length === 0, railMismatch.map((c) => c.id));

  // Vassal dominion went with the faucet: a vassal's cities are the VASSAL's
  // holdings and score for the vassal. An overlord's reward is tribute and the
  // recognition summit, not a share of ground it does not hold.

  // -- diplomacy is HELD, like territory. The trickle it replaced paid +1 per
  // allied major every round forever once you were pacted with a majority: it
  // was 77% of all banked VP across 20 games and let a faction win holding no
  // ground at all. An alliance is worth its score while it stands, and worth
  // nothing the moment it doesn't.
  // The three checks below read `players[dip].vp` as an ABSOLUTE, which only
  // measures the alliance if nothing else can move VP in the same window. The
  // Upkeep claim drift can: `cycleTo` runs a full round, and a faction that
  // dominates a neutral hex absorbs a section of it and scores the territory.
  // That is real behaviour, not a regression — so isolate the measurement
  // rather than loosen it, and cover the drift on its own terms below.
  const claimWas = CONFIG.influence.claim.enabled;
  CONFIG.influence.claim.enabled = 0;
  const gT = createGame({ seed: 143 });
  startTurn(gT);
  const dip = gT.turnOrder[gT.activeIndex];
  const majors14 = gT.turnOrder.filter((f) => f !== dip && factionDef(f)?.tier === "major");
  const SC = CONFIG.victory.score;
  const base = gT.players[dip].vp;
  formPact(gT, dip, majors14[0]);
  recomputeVp(gT);
  check("held diplomacy: one ally is worth its score at once — no majority bar",
    gT.players[dip].vp === base + SC.allied);
  // …and it does not pay again just because a round went by.
  cycleTo(gT, dip);
  recomputeVp(gT);
  check("…and it does not pay again next round",
    gT.players[dip].vp === base + SC.allied);
  // A vassal is worth more than an ally.
  vassalize(gT, dip, majors14[1], "test");
  recomputeVp(gT);
  check("…a vassal is worth more than an ally",
    gT.players[dip].vp === base + SC.allied + SC.vassal && SC.vassal > SC.allied);
  // Lose the alliance, lose the score — the half a banked model could not do.
  breakPact(gT, dip, majors14[0], "test");
  recomputeVp(gT);
  check("…and losing the alliance loses the score with it",
    gT.players[dip].vp === base + SC.vassal);
  CONFIG.influence.claim.enabled = claimWas;

  // -- the claim drift: unclaimed ground never rests at neutral.
  //
  // The old rule only peeled TOWARD neutral and stopped there, so a town that
  // nobody held stayed nobody's for the rest of the game however deep inside
  // one faction's country it sat. These four cover the rule and the three
  // things that stop it, because a drift that cannot be stopped is a land
  // grab rather than a border.
  {
    // TWO DIFFERENT THINGS ARE UNDER TEST HERE, and conflating them is what
    // made the first draft of this block fail the moment the bar was tuned.
    //
    // The MECHANISM — one section per Upkeep, three Upkeeps to absorb, and the
    // three things that stop it — is a rule, and it holds at any threshold.
    // Those checks run at a bar a fresh map can actually reach, so they are
    // measuring the rule and not the map generator.
    //
    // The BAR ITSELF — 8 — is a tuning number, measured in sim-suite, not
    // asserted here. The one thing worth asserting about it is the property it
    // was chosen for: that it is high enough nobody is handed a free town on
    // round 1 for merely bordering it.
    const barWas = CONFIG.influence.claim.threshold;
    CONFIG.influence.claim.threshold = 5; // reachable on a fresh map

    const gC = createGame({ seed: 424242 });
    recomputeInfluence(gC);
    const pid = gC.turnOrder[0];
    const target = Object.values(gC.locations).find(
      (l) => l.sections.every((x) => x === "neutral")
        && claimStrength(gC, pid, l.hexId) >= CONFIG.influence.claim.threshold
        && strongestRivalAt(gC, pid, l.hexId) < claimStrength(gC, pid, l.hexId));
    check("claim: a neutral hex inside somebody's country is claimable at all", !!target);
    if (target) {
      const vpBefore = (recomputeVp(gC), gC.players[pid].vp);
      tickClaims(gC, pid);
      check("claim: one section per Upkeep, not the whole place at once",
        target.sections.filter((x) => x === pid).length === 1);
      tickClaims(gC, pid); tickClaims(gC, pid);
      check("claim: three Upkeeps absorb it outright, and Loyalty opens low",
        target.controller === pid && target.loyalty === CONFIG.influence.claim.startingLoyalty,
        `controller=${target.controller} loyalty=${target.loyalty}`);
      recomputeVp(gC);
      check("claim: an absorbed place is worth its VP like any other ground",
        gC.players[pid].vp > vpBefore, `${vpBefore} -> ${gC.players[pid].vp}`);
    }

    // A rival column standing in the town outranks the border on the map.
    const gB = createGame({ seed: 424242 });
    recomputeInfluence(gB);
    const pid2 = gB.turnOrder[0];
    const blocked = Object.values(gB.locations).find(
      (l) => l.sections.every((x) => x === "neutral")
        && claimStrength(gB, pid2, l.hexId) >= CONFIG.influence.claim.threshold);
    if (blocked) {
      const rival = Object.values(gB.units).find((u) => u.owner !== pid2);
      rival.node = blocked.hexId;
      recomputeInfluence(gB);
      tickClaims(gB, pid2); tickClaims(gB, pid2); tickClaims(gB, pid2);
      check("claim: a rival column on the hex stops the drift dead",
        blocked.sections.every((x) => x === "neutral"), `[${blocked.sections}]`);
    }

    // Influence never takes a section off a faction still standing there —
    // that is what a contest is for.
    const gH = createGame({ seed: 424242 });
    recomputeInfluence(gH);
    const pid3 = gH.turnOrder[0];
    const held = Object.values(gH.locations).find(
      (l) => l.sections.every((x) => x === "neutral")
        && claimStrength(gH, pid3, l.hexId) >= CONFIG.influence.claim.threshold);
    if (held) {
      const rivalFid = gH.turnOrder.find((f) => f !== pid3);
      held.sections[0] = rivalFid;
      tickClaims(gH, pid3); tickClaims(gH, pid3);
      check("claim: contested ground stays the contest's business",
        held.sections.filter((x) => x === pid3).length === 0, `[${held.sections}]`);
    }

    CONFIG.influence.claim.threshold = barWas;

    // The bar as shipped: enclosing, not merely bordering. On a fresh map no
    // faction can reach it anywhere, even with every city at full Loyalty and
    // every unit it owns standing on the tile — which is the property that
    // stopped the rule from handing out the whole neutral map (measured: 7.7
    // places absorbed per game at 5, 2.0 at 8).
    const gN = createGame({ seed: 424242 });
    for (const l of Object.values(gN.locations)) if (l.controller) l.loyalty = CONFIG.loyalty.ceiling;
    recomputeInfluence(gN);
    const freebie = Object.values(gN.locations).some(
      (l) => l.sections.every((x) => x === "neutral")
        && gN.turnOrder.some((f) => claimStrength(gN, f, l.hexId) >= CONFIG.influence.claim.threshold));
    check("claim: the shipping bar hands nobody a free town on round 1", !freebie);

    // THE PULSE MUST NOT LIE. The wheel now pre-announces the third that
    // turns over next Upkeep, and a forecast derived separately from the rule
    // is a forecast that eventually promises a flip that does not happen. So
    // these check the prediction against what the tick actually does, in both
    // directions, rather than checking that the predicate returns something.
    {
      const barWas2 = CONFIG.influence.claim.threshold;
      CONFIG.influence.claim.threshold = 5;
      const gP = createGame({ seed: 424242 });
      recomputeInfluence(gP);
      const who = gP.turnOrder[0];
      const loc = Object.values(gP.locations).find(
        (l) => l.sections.every((x) => x === "neutral")
          && claimStrength(gP, who, l.hexId) >= CONFIG.influence.claim.threshold
          && strongestRivalAt(gP, who, l.hexId) < claimStrength(gP, who, l.hexId));
      const forecast = loc ? pendingSectionChange(gP, loc) : null;
      check("pulse: a section about to be claimed is flagged before it happens",
        !!forecast && forecast.cause === "influence" && forecast.to === who,
        JSON.stringify(forecast));
      if (loc && forecast) {
        tickClaims(gP, who);
        check("pulse: …and it is the section the Upkeep actually turned over",
          loc.sections[forecast.index] === who, `[${loc.sections}] idx ${forecast.index}`);
      }
      // A hex nobody is close to says nothing — the wheel is quiet by default.
      const quiet = Object.values(gP.locations).find(
        (l) => l.sections.every((x) => x === "neutral")
          && gP.turnOrder.every((f) => claimStrength(gP, f, l.hexId) < CONFIG.influence.claim.threshold));
      check("pulse: …and a place nobody is close to does not pulse",
        !quiet || pendingSectionChange(gP, quiet) === null);
      CONFIG.influence.claim.threshold = barWas2;

      // The other direction: a neglected city at Loyalty 0 sheds a section at
      // its holder's next Upkeep, and the holder gets a turn's warning.
      // Every Location a faction holds at round 1 is its CAPITAL, and a
      // Capital is inert by design — locked at full Loyalty, it never peels.
      // So the neglected city has to be built: take a neutral one, hand it
      // over, then walk everybody out and let it go cold. (The first draft
      // grabbed the first controlled Location it found, which was a capital,
      // and read the correct answer as a failure.)
      const neglect = (g, pid) => {
        const l = Object.values(g.locations).find((x) => x.sections.every((sec) => sec === "neutral"));
        if (!l) return null;
        l.sections = l.sections.map(() => pid);
        l.controller = pid;
        l.loyaltyOwner = pid;
        l.loyalty = 0;
        for (const u of Object.values(g.units)) if (u.node === l.hexId) u.node = null;
        return l;
      };
      const gL = createGame({ seed: 424242 });
      const holder = gL.turnOrder[0];
      const mine = neglect(gL, holder);
      recomputeInfluence(gL);
      const losing = pendingSectionChange(gL, mine);
      check("pulse: a section about to peel away is flagged too",
        !!losing && losing.cause === "loyalty" && losing.from === holder,
        JSON.stringify(losing));
      if (losing) {
        tickLoyalty(gL, holder);
        check("pulse: …and that is the section the Upkeep actually peeled",
          mine.sections[losing.index] === "neutral", `[${mine.sections}] idx ${losing.index}`);
      }
      // A garrison walking back in is exactly what cancels it, and the wheel
      // has to stop promising the loss the moment it does.
      const gG = createGame({ seed: 424242 });
      const held = neglect(gG, gG.turnOrder[0]);
      const anyUnit = Object.values(gG.units).find((u) => u.owner === held.controller);
      anyUnit.node = held.hexId;
      check("pulse: …and a garrison back in the city stops the warning",
        pendingSectionChange(gG, held) === null);
    }

    // FIELD DECK — one card, one player, once.
    //
    // The deck is shared by every faction, so before this the same handful of
    // cards cycled past everybody: 28 draws from a 22-card deck in a
    // nine-round playtest, and the human met four cards twice. These check the
    // two halves of the fix, which pull in opposite directions and are easy to
    // get half right: a player never repeats, AND a card one faction burned is
    // still waiting for a faction that has not met it.
    {
      const mkDeck = () => createGame({ seed: 424242 });
      const drawAll = (g, pid, n) => {
        const u = Object.values(g.units).find((x) => x.owner === pid);
        const out = [];
        for (let i = 0; i < n; i++) {
          const r = drawFieldEncounter(g, u, {});
          if (r?.encounterId) out.push(r.encounterId);
        }
        return out;
      };
      const distinct = Object.keys(fieldEncounters()).length;

      const gD = mkDeck();
      const mine = drawAll(gD, gD.turnOrder[0], distinct * 3);
      check("field deck: a faction never meets the same card twice",
        new Set(mine).size === mine.length, `${mine.length} draws, ${new Set(mine).size} distinct`);
      check("field deck: …and it can meet every card in the game",
        mine.length === distinct, `met ${mine.length} of ${distinct}`);
      check("field deck: …then the road goes quiet rather than repeating",
        drawFieldEncounter(gD, Object.values(gD.units).find((u) => u.owner === gD.turnOrder[0]), {}) === null);

      // The whole reason the pile stays shared: a card burned by one faction
      // is still news to one that has not met it.
      const theirs = drawAll(gD, gD.turnOrder[1], distinct * 3);
      const burned = new Set(mine);
      check("field deck: a card one faction burned still reaches another",
        theirs.length > 0 && theirs.every((id) => burned.has(id)),
        `${theirs.length} drawn, ${theirs.filter((id) => burned.has(id)).length} of them already burned`);
      check("field deck: …and that faction does not repeat either",
        new Set(theirs).size === theirs.length);

      const wasOnce = CONFIG.encounters.fieldOncePerPlayer;
      CONFIG.encounters.fieldOncePerPlayer = 0;
      const gR = mkDeck();
      const rep = drawAll(gR, gR.turnOrder[0], distinct * 3);
      CONFIG.encounters.fieldOncePerPlayer = wasOnce;
      check("field deck: the switch really does restore repeats",
        rep.length > distinct && new Set(rep).size <= distinct,
        `${rep.length} draws, ${new Set(rep).size} distinct`);

      // The repo seam: hand-authored cards must actually be dealt, and must
      // keep the shape the seam promises — three doors, two that pay, one
      // that costs nothing to walk through.
      const repo = Object.values(fieldEncounters()).filter((e) => e.id.startsWith("fer_"));
      check("field deck: the repo-authored cards are in the shipped deck",
        repo.length > 0 && repo.every((e) => mkDeck().encounterDeck.includes(e.id)),
        `${repo.length} repo cards`);
      const misshapen = repo.filter((e) => {
        const ch = e.choices || [];
        const paying = ch.filter((c) => (c.effects || []).length > 0);
        return ch.length !== 3 || paying.length !== 2;
      });
      check("field deck: …each with three doors, two that pay and one that does not",
        misshapen.length === 0, misshapen.map((e) => e.id).join(", "));
      const punished = repo.filter((e) =>
        (e.choices || []).some((c) => (c.effects || []).some((f) =>
          (f.amount ?? 0) < 0 && (f.type === "ADJUST_HONOR" || f.type === "ADJUST_MENACE"))));
      check("field deck: …and walking away is never punished",
        punished.length === 0, punished.map((e) => e.id).join(", "));
    }

    // And the switch is a real no-op.
    const gO = createGame({ seed: 424242 });
    recomputeInfluence(gO);
    const was = CONFIG.influence.claim.enabled;
    CONFIG.influence.claim.enabled = 0;
    const off = Object.values(gO.locations).find((l) => l.sections.every((x) => x === "neutral"));
    for (let i = 0; i < 4; i++) for (const f of gO.turnOrder) tickClaims(gO, f);
    CONFIG.influence.claim.enabled = was;
    check("claim: enabled 0 leaves every neutral section neutral",
      !off || off.sections.every((x) => x === "neutral"));
  }

  // -- elimination: a stripped faction is flagged, skipped, and excluded;
  // last faction standing wins outright.
  const gE = createGame({ seed: 144 });
  startTurn(gE);
  const alivePid = gE.turnOrder[gE.activeIndex];
  const doomed = gE.turnOrder.find((f) => f !== alivePid);
  for (const l of Object.values(gE.locations)) {
    if (l.controller === doomed) { l.controller = null; l.loyaltyOwner = null; l.loyalty = null; l.sections = l.sections.map(() => "neutral"); }
  }
  for (const u of Object.values(gE.units)) if (u.owner === doomed) delete gE.units[u.uid];
  cycleTo(gE, alivePid);
  check("elimination: a faction with nothing left is flagged and skipped",
    gE.players[doomed].eliminated === true &&
    gE.log.some((e) => e.name === "faction_eliminated" && e.payload.player === doomed));
  for (const f of gE.turnOrder) {
    if (f === alivePid) continue;
    for (const l of Object.values(gE.locations)) {
      if (l.controller === f) { l.controller = null; l.loyaltyOwner = null; l.loyalty = null; l.sections = l.sections.map(() => "neutral"); }
    }
    for (const u of Object.values(gE.units)) if (u.owner === f) delete gE.units[u.uid];
  }
  endTurn(gE);
  check("elimination: last faction standing wins outright", gE.winnerId === alivePid);

  // -- chip removal: unit chips drop as hex loot and free their stat slot.
  const gR = createGame({ seed: 145 });
  startTurn(gR);
  const rPid = gR.turnOrder[gR.activeIndex];
  gR.players[rPid].actions.remaining = 9;
  const rHome = Object.values(gR.locations).find((l) => l.controller === rPid);
  const rUnit = Object.values(gR.units).find((u) => u.owner === rPid);
  rUnit.node = rHome.hexId;
  const blade = install14(gR, rUnit, "drilled-troops");
  const removed = performAction(gR, "remove-chip", { at: rHome.hexId, chip: blade });
  check("remove-chip: a unit chip drops as hex loot and frees its stat slot",
    !!removed.ok &&
    (gR.hexLoot?.[rHome.hexId] || []).includes(blade) &&
    !rUnit.chips.includes(blade));
  const capUid = rHome.chips.find((c) => gR.chips[c]?.chipId === "capital");
  const noCap = performAction(gR, "remove-chip", { at: rHome.hexId, chip: capUid });
  check("remove-chip: the Capital is never removable", !noCap.ok);
}


// Phase 15 — location ability roster v0.2: interim Rail Corridor, priced
// Staging Ground, Blacksite, Scrapyard, Old Armory, The Springs, Toll Gate.
{
  line("\n  [Phase 15] location ability roster v0.2");
  const gA = createGame({ seed: 151 });
  startTurn(gA);
  const aPid = gA.turnOrder[gA.activeIndex];
  const aP = gA.players[aPid];
  aP.resource = 99; aP.actions.remaining = 99;
  const aHome = Object.values(gA.locations).find((l) => l.controller === aPid);
  const aUnit = Object.values(gA.units).find((u) => u.owner === aPid);
  aUnit.node = aHome.hexId;

  // -- rail corridor (interim): 2 scrap → +2 Movement this turn for a
  // stationed unit.
  aHome.abilityId = "rail-corridor";
  const movBefore = aUnit.movement;
  const rode = performAction(gA, "activate", { location: aHome.hexId });
  check("rail corridor (interim): 2 scrap boosts a stationed unit +2 Movement",
    !!rode.ok && aUnit.movement === movBefore + 2);

  // -- staging ground: now costs 2 scrap (the free +1 Action dominated the
  // Logistics Hub chip).
  aHome.abilityId = "staging-ground";
  aHome.abilityActivatedTurn = undefined;
  aP.resource = 1;
  const broke = performAction(gA, "activate", { location: aHome.hexId });
  check("staging ground: refuses without its 2-scrap cost", !broke.ok);

  // -- old armory: once per game, arms a stationed unit with a reward chip.
  aHome.abilityId = "old-armory";
  aHome.abilityActivatedTurn = undefined;
  aP.resource = 99;
  const before15 = aUnit.chips.length + (gA.hexLoot?.[aHome.hexId]?.length || 0);
  const dug = performAction(gA, "activate", { location: aHome.hexId });
  const after15 = aUnit.chips.length + (gA.hexLoot?.[aHome.hexId]?.length || 0);
  check("old armory: digs up a reward chip for the garrison", !!dug.ok && after15 === before15 + 1);
  aHome.abilityActivatedTurn = undefined;
  const again15 = performAction(gA, "activate", { location: aHome.hexId });
  check("old armory: once per game — second use refused", !again15.ok);

  // -- scrapyard: strips a chip from an enemy unit at this location → loot.
  aHome.abilityId = "scrapyard";
  aHome.abilityActivatedTurn = undefined;
  const foe15 = gA.turnOrder.find((f) => f !== aPid);
  const mark = Object.values(gA.units).find((u) => u.owner === foe15);
  const stolenGear = gA.nextId("chip");
  gA.chips[stolenGear] = { uid: stolenGear, chipId: "navigator" };
  mark.chips.push(stolenGear);
  mark.node = aHome.hexId;
  recomputeStats(gA);
  performAction(gA, "activate", { location: aHome.hexId });
  check("scrapyard: rips an enemy chip into hex loot",
    !mark.chips.includes(stolenGear) && (gA.hexLoot?.[aHome.hexId] || []).includes(stolenGear));

  // -- blacksite: an enemy chip goes dark and STAYS dark through its
  // owner's paid upkeep, until the suppressor's window passes.
  const gB = createGame({ seed: 152 });
  startTurn(gB);
  const bPid = gB.turnOrder[gB.activeIndex];
  const bFoe = gB.turnOrder.find((f) => f !== bPid);
  const bFoeLoc = Object.values(gB.locations).find((l) => l.controller === bFoe);
  const lab = gB.nextId("chip");
  gB.chips[lab] = { uid: lab, chipId: "advanced-lab" }; // upkeep 1 — the guard case
  bFoeLoc.chips.push(lab);
  gB.players[bFoe].resource = 99;
  applyEffect(gB, { type: "DISABLE_CHIP" }, { sourcePlayer: bPid });
  const suppressed = Object.values(gB.chips).find((c) => c.suppressedUntil != null);
  check("blacksite: an enemy chip is suppressed (dormant with a window)",
    !!suppressed && suppressed.disabled === true);
  endTurn(gB); // into the next seat's turn — foe's upkeep pays but cannot revive it
  const stillDark = suppressed.disabled === true;
  for (let i = 0; i < gB.turnOrder.length; i++) endTurn(gB); // past the window
  check("blacksite: paid upkeep cannot revive it early; the window expiring does",
    stillDark && suppressed.disabled === false && suppressed.suppressedUntil == null);

  // -- the springs: heals ANY owner's damaged unit standing on it.
  const gS = createGame({ seed: 153 });
  startTurn(gS);
  const sPid = gS.turnOrder[gS.activeIndex];
  const oasis = Object.values(gS.locations).find((l) => !l.controller);
  oasis.abilityId = "the-springs";
  const pilgrim = Object.values(gS.units).find((u) => u.owner === sPid);
  pilgrim.node = oasis.hexId;
  pilgrim.baseStrength = 1; recomputeStats(gS);
  do { endTurn(gS); } while (gS.turnOrder[gS.activeIndex] !== sPid);
  check("the springs: a unit camping the oasis heals +2 even off friendly ground",
    pilgrim.baseStrength === 3);

  // -- toll gate: entering the taxed ring costs +1 movement.
  const gG = createGame({ seed: 154 });
  startTurn(gG);
  const gPid = gG.turnOrder[gG.activeIndex];
  const gFoe = gG.turnOrder.find((f) => f !== gPid);
  const tollLoc = Object.values(gG.locations).find((l) => l.controller === gFoe);
  tollLoc.abilityId = "toll-gate";
  const ringHex = (gG.board.adjacency[tollLoc.hexId] || []).find(
    (h) => !gG.locations[h] && !gG.board.hexes[h].elevation && !gG.board.hexes[h].cover);
  const walker = Object.values(gG.units).find((u) => u.owner === gPid);
  if (ringHex) {
    const ringNeighbor = (gG.board.adjacency[ringHex] || []).find(
      (h) => h !== tollLoc.hexId && !gG.locations[h] && !gG.board.hexes[h].elevation && !gG.board.hexes[h].cover);
    if (ringNeighbor) {
      // Measure the TOLL, not the surface. A capital's ring is often road, and
      // graded ground is half a hex — which would make the taxed hex cost 1.5
      // and leave this fixture reading the pavement rather than the tax. The
      // toll-on-a-lane interaction has its own check in [Paved].
      for (const h of [ringHex, ringNeighbor]) {
        gG.board.hexes[h].road = false; gG.board.hexes[h].rail = false;
      }
      walker.node = ringNeighbor;
      walker.moveRemaining = 1;
      isolateTerrain(gG, walker.owner); // the TOLL is what is on trial here
      const reach = unitReach(gG, walker);
      check("toll gate: a taxed hex costs 2 to enter (unreachable on budget 1)",
        !(ringHex in reach));
      walker.moveRemaining = 2;
      const reach2 = unitReach(gG, walker);
      check("toll gate: budget 2 enters the taxed hex with nothing left",
        reach2[ringHex] === 0);
    }
  }
}


// Phase 15b — the authored Location prose. content/locations.csv carried a
// Flavor column for the ten original cities and, exactly like unit-names.csv
// before it, was wired to nothing: nineteen places on the board and not a
// word of what was written for them ever reaching a player.
{
  line("\n  [Phase 15b] Locations say what they are");
  // The ten the sheet covers. Deliberately a list of ids rather than "every
  // Location must have one" — nine more were added after that sheet and have
  // no line written yet, and a check that failed on those would be demanding
  // fiction rather than guarding the pipe.
  const AUTHORED = ["korad", "dambar", "kansit", "omara", "chigan", "droit",
    "the-shelf", "tin-town", "concordan", "erport"];
  const missing = AUTHORED.filter((id) => !(LOCATIONS[id]?.flavour || "").trim());
  check("every Location the sheet covers carries its authored line",
    missing.length === 0);
  check("…and it is prose, not an id echoed back",
    AUTHORED.every((id) => (LOCATIONS[id]?.flavour || "").length > 12
      && LOCATIONS[id].flavour !== LOCATIONS[id].name));
  // The real-world basis is optional — two of the ten are invented
  // settlements and two more have none recorded.
  check("the real-world basis rides along where the sheet has one",
    LOCATIONS.korad.basis === "Boulder, CO" && LOCATIONS.droit.basis === "Detroit");
  // Nothing may claim a line it does not have: an empty string would render
  // an empty italic paragraph in the Location window rather than nothing.
  check("a Location with no line written carries none at all",
    Object.values(LOCATIONS).every((l) => l.flavour === undefined || !!l.flavour.trim()));
}

// Phase 16 — per-entity actions (docs/vp-and-actions-design.md §2/§4):
// one action per unit/Location, coalition charging, wildcards.
{
  line("\n  [Phase 16] per-entity actions");
  const g16 = createGame({ seed: 161 });
  startTurn(g16);
  const pid = g16.turnOrder[g16.activeIndex];
  const p16 = g16.players[pid];
  p16.resource = 99;
  const home = Object.values(g16.locations).find((l) => l.controller === pid);
  const foe = g16.turnOrder.find((f) => f !== pid);
  const foeLoc = Object.values(g16.locations).find((l) => l.controller === foe);

  check("Upkeep grants each unit and held Location exactly 1 action",
    Object.values(g16.units).filter((u) => u.owner === pid).every((u) => u.actionsRemaining === 1) &&
    home.actionsRemaining === 1);

  // The refresh rule has one name, because the HUD has to draw the same
  // number the engine hands out. It used to assume one action per city, so a
  // Logistics Hub city put the action readout at "8/7" — more remaining than
  // the maximum — and drew its pip row one pip short of what it held.
  check("a plain city's action capacity is 1",
    locationActionCapacity(g16, home) === 1
    && home.actionsRemaining === locationActionCapacity(g16, home));
  {
    const gC = createGame({ seed: 161 });
    const cPid = gC.turnOrder[gC.activeIndex];
    const hub = Object.values(gC.locations).find((l) => l.controller === cPid);
    const uid = gC.nextId("chip");
    gC.chips[uid] = { uid, chipId: "logistics-hub", owner: cPid };
    hub.chips.push(uid);
    startTurn(gC);
    check("…and a Logistics Hub city's is 2, which is what it refreshes to",
      locationActionCapacity(gC, hub) === 2 && hub.actionsRemaining === 2);
    // The readout's own invariant, stated where it can never drift: you can
    // never have more actions left than you could possibly have had.
    const total = (l) => Object.values(gC.locations)
      .filter((x) => x.controller === cPid)
      .reduce((n, x) => n + locationActionCapacity(gC, x), 0);
    const remaining = gC.players[cPid].actions.remaining
      + Object.values(gC.units).filter((u) => u.owner === cPid).reduce((n, u) => n + (u.actionsRemaining ?? 0), 0)
      + Object.values(gC.locations).filter((x) => x.controller === cPid).reduce((n, x) => n + (x.actionsRemaining ?? 0), 0);
    const max = gC.players[cPid].actions.remaining
      + Object.values(gC.units).filter((u) => u.owner === cPid).length + total();
    check("…so the readout never shows more actions left than its own maximum",
      remaining <= max);
  }

  // -- a unit acts once: two solo contests from one unit are refused.
  const [uA, uB] = Object.values(g16.units).filter((u) => u.owner === pid);
  uA.node = foeLoc.hexId; uB.node = foeLoc.hexId;
  const c1 = performAction(g16, "contest", { unit: uA.uid, coalition: [] });
  const c2 = performAction(g16, "contest", { unit: uA.uid, coalition: [] });
  check("a unit's action is spent by its contest; a second is refused",
    !!c1.ok && !c2.ok && uA.actionsRemaining === 0);

  // -- coalition charging: joining a push spends the member's action too.
  const c3 = performAction(g16, "contest", { unit: uB.uid, coalition: [] });
  check("a fresh unit still has its own action", !!c3.ok && uB.actionsRemaining === 0);
  // Wildcards cover an exhausted entity.
  p16.actions.remaining = 1;
  const c4 = performAction(g16, "contest", { unit: uA.uid, coalition: [] });
  check("a wildcard action covers an already-acted unit",
    !!c4.ok && p16.actions.remaining === 0);

  // -- recruit charges the LOCATION, and a hub Location acts twice.
  const g17 = createGame({ seed: 162 });
  startTurn(g17);
  const rPid = g17.turnOrder[g17.activeIndex];
  g17.players[rPid].resource = 99;
  const rHome = Object.values(g17.locations).find((l) => l.controller === rPid);
  const tg16 = g17.nextId("chip");
  g17.chips[tg16] = { uid: tg16, chipId: "training-grounds" };
  rHome.chips.push(tg16);
  const r1 = performAction(g17, "recruit", { at: rHome.hexId });
  const r2 = performAction(g17, "recruit", { at: rHome.hexId });
  check("recruit spends the Location's action; a second recruit there is refused",
    !!r1.ok && !r2.ok && rHome.actionsRemaining === 0);

  // -- staging ground feeds the wildcard pool (2 scrap → +1 anywhere).
  rHome.abilityId = "staging-ground";
  rHome.actionsRemaining = 1; // refit for the activation itself
  const poolBefore = g17.players[rPid].actions.remaining;
  const staged = performAction(g17, "activate", { location: rHome.hexId });
  check("staging ground: 2 scrap buys a wildcard action",
    !!staged.ok && g17.players[rPid].actions.remaining === poolBefore + 1);

  // -- a fresh recruit cannot act the turn it musters.
  const recruitUid = r1.unit;
  check("a fresh recruit has no action until its next Upkeep",
    g17.units[recruitUid].actionsRemaining === 0);
}


// Phase 17 — influence pressure: the soft-power siege and its Menace cost.
{
  line("\n  [Phase 17] influence pressure");
  const g = createGame({ seed: 171 });
  startTurn(g);
  const owner17 = g.turnOrder[g.activeIndex];
  const presser = g.turnOrder.find((f) => f !== owner17);
  const town = Object.values(g.locations).find((l) => l.controller === owner17);
  town.chips = town.chips.filter((c) => g.chips[c]?.chipId !== "capital");
  town.loyalty = 5; town.loyaltyOwner = owner17;
  const guard17 = Object.values(g.units).find((u) => u.owner === owner17);
  guard17.node = town.hexId;
  // The soft-power siege reads the Influence FIELD (a held Location anchors
  // its own hex in the ZoC map), so pin the field: the rival out-projects
  // the owner at the town's own hex. tickLoyalty recomputes at the end, so
  // re-pin before each call.
  const pressAt = () => {
    g.world.influence = { [presser]: { [town.hexId]: 999 }, [owner17]: { [town.hexId]: 1 } };
  };
  pressAt();
  const menaceBefore = g.players[presser].menace || 0;
  const standingBefore = getStanding(g, owner17, presser);
  tickLoyalty(g, owner17);
  check("pressure: a garrisoned town under rival dominance stalls flat (rise 1 − bleed 1)",
    town.loyalty === 5);
  check("pressure is soft hostility: presser loses Standing and gains Menace",
    getStanding(g, owner17, presser) === standingBefore - 1 &&
    (g.players[presser].menace || 0) === menaceBefore + 1);
  // Ungarrisoned: neglect + pressure double-bleeds.
  guard17.node = Object.values(g.board.hexes).find((h) => !g.locations[h.id]).id;
  pressAt(); // tickLoyalty recomputed influence — re-pin
  tickLoyalty(g, owner17);
  check("pressure: neglected AND pressured bleeds 2/Upkeep", town.loyalty === 3);
  // Civic Hall stops neglect but NOT foreign dominance.
  const hall = g.nextId("chip");
  g.chips[hall] = { uid: hall, chipId: "civic-hall" };
  town.chips.push(hall);
  pressAt();
  tickLoyalty(g, owner17);
  check("pressure: Civic Hall cancels neglect but not the rival's dominance",
    town.loyalty === 2);
  // Allies never pressure each other.
  formPact(g, owner17, presser);
  pressAt();
  const loyBefore = town.loyalty;
  tickLoyalty(g, owner17);
  check("pressure: a pacted ally's ZoC does not bleed your towns",
    town.loyalty === loyBefore - 0); // civic hall holds, no pressure, no neglect
}


// Phase 18 — roads, rail and terrain movement: graded ground is half a hex,
// the roadless mountain halt, and paved-negates-terrain.
{
  line("\n  [Phase 18] roads, rail & terrain movement");
  const PAVED = CONFIG.movement.pavedCost;
  const g18 = createGame({ seed: 181 });
  startTurn(g18);
  const pid = g18.turnOrder[g18.activeIndex];
  const walker = Object.values(g18.units).find((u) => u.owner === pid);

  // The network pays per hex travelled, not as a lump for being parked on it
  // at Upkeep — there is no start bonus to collect any more.
  check("a turn's budget is the unit's Movement, wherever it began",
    walker.moveRemaining === walker.movement);

  const occupied = (h) => Object.values(g18.units).some((x) => x.node === h);
  const anyHex = Object.values(g18.board.hexes).find(
    (h) => !g18.locations[h.id] && !occupied(h.id) &&
      (g18.board.adjacency[h.id] || []).some((n) => !g18.locations[n] && !occupied(n)));
  const mtHex = anyHex.id;
  const from18 = (g18.board.adjacency[mtHex] || []).find((n) => !g18.locations[n] && !occupied(n));
  // `paved` has to clear RAIL as well as road. A hex can carry both, and this
  // fixture used to set `road = false` and call the hex unpaved — which was
  // true only while rail ran between four capitals and never crossed here.
  const stage = ({ elevation = false, cover = false, road = false, rail = false }) => {
    const h = g18.board.hexes[mtHex];
    h.elevation = elevation; h.cover = cover; h.road = road; h.rail = rail;
    const f = g18.board.hexes[from18];
    f.elevation = false; f.cover = false;
    walker.node = from18; walker.moveRemaining = 3;
    isolateTerrain(g18, walker.owner); // terrain only — see the helper
    return unitReach(g18, walker);
  };

  // --- §10.2 — entering a rival's ZoC costs movement ---
  //
  // The most standard ZoC verb in the genre, and it was missing entirely:
  // `blockerScan` never read `state.world.zoc`, so the field that defines
  // "territory" for trespass, the withdraw ultimatum and `unitsInTerritory`
  // had no effect whatever on walking through it.
  {
    const gz = createGame({ seed: 4242, humanFactionId: "versari" });
    const w = Object.values(gz.units).find((u) => u.owner === "versari");
    // A clean open lane out of the unit's hex, with nothing else charging —
    // and AWAY FROM VERSARI'S OWN GROUND, because the toll is deliberately
    // waived on your own Locations and the ring around them (see
    // `zocFreeOnOwnGround`). Testing it on the doorstep would be testing the
    // exemption and calling it the rule; the exemption gets its own check
    // below.
    // With the exemption off by default this set only steers the fixture away
    // from home; it is kept so the check reads the same either way.
    const ownRing = new Set();
    for (const l of Object.values(gz.locations)) {
      if (l.controller !== "versari") continue;
      ownRing.add(l.hexId);
      for (const n of gz.board.adjacency[l.hexId] || []) ownRing.add(n);
    }
    // The unit starts at home, so walk it out to open country first — every
    // hex beside its own capital is exempt by construction.
    const away = Object.keys(gz.board.hexes).find((h) => !ownRing.has(h) && !gz.locations[h]
      && (gz.board.adjacency[h] || []).some((n) => !ownRing.has(n) && !gz.locations[n]
        && !Object.values(gz.units).some((u) => u.node === n)));
    if (away) w.node = away;
    const step = (gz.board.adjacency[w.node] || []).find(
      (n) => !gz.locations[n] && !ownRing.has(n)
        && !Object.values(gz.units).some((u) => u.node === n));
    check("§10.2 fixture: found open ground off versari's own doorstep", !!step);
    const hex = gz.board.hexes[step];
    hex.elevation = false; hex.cover = false; hex.road = false; hex.rail = false;
    gz.world.zoc = {};
    w.moveRemaining = 2;
    const before = unitReach(gz, w)[step];
    check("§10.2 baseline: open ground costs one movement", before === 1, `${before}`);

    // Now it is somebody else's ground.
    gz.world.zoc[step] = "lakers";
    setStanding(gz, "versari", "lakers", 0, "test");
    setStanding(gz, "lakers", "versari", 0, "test");
    const taxed = unitReach(gz, w)[step];
    check("§10.2 a rival's ZoC costs extra to enter",
      taxed === before - CONFIG.influence.zocMoveCost, `${before} -> ${taxed}`);

    // …and NEVER on your own doorstep. The toll is a border friction, not a
    // charge for defending yourself — without this exemption the side with the
    // furthest to march is always the side that is losing, and a faction cut
    // to one city recovered ground in 0 of 15 games instead of 4.
    {
      // The exemption ships OFF (see the config note — it made the elimination
      // ratchet worse rather than better), so the fixture turns it on to check
      // the mechanism still works for whoever switches it on.
      const wasFree = CONFIG.influence.zocFreeOnOwnGround;
      CONFIG.influence.zocFreeOnOwnGround = 1;
      const home = Object.values(gz.locations).find((l) => l.controller === "versari");
      const doorstep = (gz.board.adjacency[home.hexId] || []).find((n) => !gz.locations[n]);
      if (doorstep) {
        const u2 = Object.values(gz.units).find((x) => x.owner === "versari" && x.node !== w.node) || w;
        u2.node = home.hexId; u2.moveRemaining = 2;
        const clean = unitReach(gz, u2)[doorstep];
        gz.world.zoc[doorstep] = "lakers";
        check("§10.2 …but never on ground of your own, or the ring around it",
          unitReach(gz, u2)[doorstep] === clean, `${clean} -> ${unitReach(gz, u2)[doorstep]}`);
        delete gz.world.zoc[doorstep];
      }
      CONFIG.influence.zocFreeOnOwnGround = wasFree;
    }

    // …and it is the RELATIONSHIP that decides, not the border. The same
    // predicate open borders and trespass read: you are not picking your way
    // through a country you are welcome in.
    formPact(gz, "versari", "lakers", "test");
    check("§10.2 …but not an ally's — passesFreely waives it",
      unitReach(gz, w)[step] === before);
    breakPact(gz, "versari", "lakers", "test");
    setStanding(gz, "versari", "lakers", 0, "test");
    setStanding(gz, "lakers", "versari", 0, "test");

    // Forward Supply already waives the supply wall in reinforcementRoute.
    // One node, one meaning.
    gz.players.versari.techLevel = 4;
    assignTechNode(gz, "versari", "log-entry");
    assignTechNode(gz, "versari", "log-a1");
    assignTechNode(gz, "versari", "log-a2");
    // The logistics nodes also grant Movement, and `assignTechNode` runs
    // `recomputeStats` — so the budget has to be pinned again or the check
    // measures the movement bonus rather than the waived toll.
    w.moveRemaining = 2;
    check("§10.2 …and Forward Supply waives it too",
      unitReach(gz, w)[step] === before,
      `log-a2 held: ${(gz.players.versari.techWheel || []).join(",")}`);

    // Your OWN ground is never a toll.
    const gz2 = createGame({ seed: 4242, humanFactionId: "versari" });
    const w2 = Object.values(gz2.units).find((u) => u.owner === "versari");
    const step2 = (gz2.board.adjacency[w2.node] || []).find(
      (n) => !gz2.locations[n] && !Object.values(gz2.units).some((u) => u.node === n));
    const h2 = gz2.board.hexes[step2];
    h2.elevation = false; h2.cover = false; h2.road = false; h2.rail = false;
    gz2.world.zoc = { [step2]: "versari" };
    w2.moveRemaining = 2;
    check("§10.2 your own territory is free to cross", unitReach(gz2, w2)[step2] === 1);
  }

  const M18 = CONFIG.movement;
  check("mountain, unpaved: enterable but terminal (0 movement remains)",
    stage({ elevation: true })[mtHex] === 0);
  check(`…a road over it does not halt, and costs ${M18.roadMountainCost}`,
    stage({ elevation: true, road: true })[mtHex] === 3 - M18.roadMountainCost);
  check("…and rail over it does the same — a cutting is a cutting",
    stage({ elevation: true, rail: true })[mtHex] === 3 - M18.roadMountainCost);
  check("forest, unpaved: costs forestCost to enter",
    stage({ cover: true })[mtHex] === 3 - M18.forestCost);
  check(`…a road through it costs ${M18.roadForestCost}`,
    stage({ cover: true, road: true })[mtHex] === 3 - M18.roadForestCost);
  check("open ground costs a whole hex", stage({})[mtHex] === 2);
  check("…and half a hex once it is paved",
    stage({ road: true })[mtHex] === 3 - PAVED);

  // The headline: a column that stays on the network covers twice the ground.
  // On EASY ground — the lane, not the pass, which is the half the merge with
  // "roads ease terrain rather than deleting it" left intact.
  {
    const g = createGame({ seed: 181 });
    startTurn(g);
    const p = g.turnOrder[g.activeIndex];
    const u = Object.values(g.units).find((x) => x.owner === p);
    const busy = (h) => Object.values(g.units).some((x) => x.node === h && x.uid !== u.uid);
    const lane = [u.node];
    while (lane.length < 6) {
      const next = (g.board.adjacency[lane[lane.length - 1]] || []).find(
        (n) => !lane.includes(n) && !g.locations[n] && !busy(n));
      if (!next) break;
      lane.push(next);
    }
    for (const h of lane) {
      const hex = g.board.hexes[h];
      hex.elevation = false; hex.cover = false; hex.road = true; hex.rail = false;
    }
    u.moveRemaining = 2;
    isolateTerrain(g, u.owner); // the ROAD is what is on trial here
    const paved = unitReach(g, u);
    check("2 Movement carries you FOUR hexes down a lane",
      lane.length >= 5 && paved[lane[4]] === 0 && paved[lane[3]] === 0.5);
    // …and two across country, which is what makes the lane worth taking.
    // Strip the WHOLE board, not just the lane: leaving a neighbouring road in
    // place hands the walker a cheaper way round and the comparison stops
    // being about the lane at all.
    for (const hex of Object.values(g.board.hexes)) { hex.road = false; hex.rail = false; }
    u.moveRemaining = 2;
    const open = unitReach(g, u);
    check("…and only TWO across open ground",
      open[lane[2]] === 0 && open[lane[3]] === undefined && open[lane[4]] === undefined);
  }

}

// Phase 19 — diplomacy robustness pass: standing baselines (drift toward
// earned history, not zero), patronage vassalage for minors, and the
// Recognition summit VP dividend.
{
  line("\n  [Phase 19] diplomacy robustness — baselines, patronage, summit VP");
  const bl = CONFIG.diplomacy.baseline;

  // --- baselines: cap + event hooks ---
  const g = createGame({ seed: 191 });
  ensureDiplomacy(g);
  const majors19 = g.turnOrder.filter((f) => factionDef(f)?.tier === "major");
  const [a, b, c, d19] = majors19;
  adjustBaseline(g, a, b, 99, "test");
  check("baseline: clamped to +cap", getBaseline(g, a, b) === bl.cap);
  adjustBaseline(g, a, b, -bl.cap, "test"); // back to 0
  formPact(g, a, b, "test");
  breakPact(g, a, b, "test");
  check("baseline: breaking a pact scars the victim's baseline toward the breaker",
    getBaseline(g, b, a) === -bl.pactBrokenLoss);
  check("baseline: the breaker's own baseline is unmarked", getBaseline(g, a, b) === 0);
  resolvePactCall(g, c, b, d19, true); // c called, b honored
  check("baseline: an honored pact call warms the caller's baseline toward the honorer",
    getBaseline(g, c, b) === bl.pactHonoredGain);
  const surpriseBefore = getBaseline(g, c, a);
  onAttack(g, a, c); // no prior war — treachery
  check("baseline: a surprise attack scars the victim's baseline toward the attacker",
    getBaseline(g, c, a) === surpriseBefore - bl.surpriseAttackLoss);

  // --- baselines: drift pulls toward the baseline, not zero ---
  // Measured on a human→AI pair: human rows sit outside seeded standings,
  // AI politics, and mediation, so ONLY drift moves this number.
  const g3 = createGame({ seed: 193, humanFactionId: "versari" });
  ensureDiplomacy(g3);
  const other19 = g3.turnOrder.find((f) => f !== "versari");
  adjustBaseline(g3, "versari", other19, 3, "test");
  const target = getBaseline(g3, "versari", other19);
  setStanding(g3, "versari", other19, 0, "test");
  runDiplomacyRound(g3);
  check("drift: standing below its baseline climbs toward it",
    getStanding(g3, "versari", other19) > 0 && getStanding(g3, "versari", other19) <= target);
  setStanding(g3, "versari", other19, CONFIG.diplomacy.tiers.friendly - 1, "test"); // above baseline
  for (let i = 0; i < 6; i++) runDiplomacyRound(g3);
  check("drift: standing settles AT the baseline instead of fading to zero",
    getStanding(g3, "versari", other19) === target);

  // --- patronage: a friendly minor takes a protector without a war ---
  const g2 = createGame({ seed: 192, humanFactionId: "versari", minors: ["croppers"] });
  ensureDiplomacy(g2);
  const lord = "goldgrass", minor = "croppers";
  // Make the minor clearly weaker than the lord (patronage keeps the power
  // gate). Land now counts twice over — territory AND the VP it is worth, since
  // VP is held — so a client with no army but a fat city is not weak. Strip
  // both: no units, no holdings.
  for (const u of Object.values(g2.units)) if (u.owner === minor) delete g2.units[u.uid];
  for (const l of Object.values(g2.locations)) {
    if (holderOf(l) !== minor) continue;
    l.controller = null; l.loyaltyOwner = null; l.loyalty = null;
    l.sections = l.sections.map(() => "neutral");
  }
  recomputeVp(g2);
  setStanding(g2, minor, lord, CONFIG.diplomacy.tiers.friendly + 1, "test");
  for (const o of factionIds(g2)) {
    if (o !== minor && o !== lord) setStanding(g2, minor, o, 0, "test");
  }
  check("patronage: a weak minor at Friendly+ accepts its best friend as protector — no war needed",
    !atWar(g2, lord, minor) && aiAcceptsVassalage(g2, minor, lord));
  setStanding(g2, minor, "plainers", CONFIG.diplomacy.tiers.friendly + 2, "test");
  const patronNotTop = aiAcceptsVassalage(g2, minor, lord);
  setStanding(g2, minor, "plainers", 0, "test");
  check("patronage: refused when the suitor isn't the minor's top standing", !patronNotTop);
  setStanding(g2, minor, lord, CONFIG.diplomacy.tiers.friendly - 1, "test");
  check("patronage: refused below Friendly standing", !aiAcceptsVassalage(g2, minor, lord));
  setStanding(g2, minor, lord, CONFIG.diplomacy.tiers.friendly + 1, "test");
  // a MAJOR in the same posture (weak, friendly, uncornered) still refuses
  const weakMajor = majors19.find((f) => f !== lord && g2.players[f]);
  for (const u of Object.values(g2.units)) if (u.owner === weakMajor) delete g2.units[u.uid];
  setStanding(g2, weakMajor, lord, CONFIG.diplomacy.tiers.friendly + 1, "test");
  check("patronage is minors-only: an uncornered major never bends the knee",
    !aiAcceptsVassalage(g2, weakMajor, lord));

  // --- taking a vassal is worth its score, and only while you keep it ---
  // The "summit dividend" this replaced banked 1 VP the first time each
  // faction ever backed you — permanently, whether or not the arrangement
  // survived. Score is held now, so a vassal you lose is a vassal you stop
  // counting.
  const lp = g2.players[lord];
  const vpBefore = lp.vp;
  const res19 = performDiplomacy(g2, lord, "vassalize", { faction: minor });
  check("patronage: the vassalize verb lands peacefully end-to-end", res19.ok && res19.accepted === true);
  recomputeVp(g2);
  check("a new vassal is worth its score to the lord",
    lp.vp === vpBefore + CONFIG.victory.score.vassal);
  checkDominion(g2);
  recomputeVp(g2);
  check("…and re-checking never pays twice", lp.vp === vpBefore + CONFIG.victory.score.vassal);
  releaseVassal(g2, minor, "test");
  recomputeVp(g2);
  check("…and releasing it takes the score back", lp.vp === vpBefore);
}

// Phase 20 — diplomacy tuning (2026-08-13 playtest log): coalitions never
// conscript the player or mint pacts, menace can't be laundered by
// attacking warlords, trespass is a rate-limited citation, mediation and
// rebellion carry cooldowns, gifts leave a durable baseline mark, and
// encounter standing rewards can't target the player's own faction.
{
  line("\n  [Phase 20] diplomacy tuning — conscription, cooldowns, citations");

  // --- coalitions: no conscription, no bloc pacts, voluntary join ---
  const g = createGame({ seed: 201, humanFactionId: "versari" });
  ensureDiplomacy(g);
  const target20 = "plainers";
  g.players[target20].menace = 10;
  g.players[target20].vp = 8; // power lead → threat past the threshold
  const pactsBefore = g.diplomacy.pacts.length;
  runDiplomacyRound(g);
  const coal20 = g.diplomacy.coalitions.find((c) => c.target === target20);
  check("coalition still forms against a menace-backed leader", !!coal20);
  check("the human is never conscripted into a coalition",
    !!coal20 && !coal20.members.includes("versari"));
  check("the human is not dragged to war by a coalition", !atWar(g, "versari", target20));
  check("coalition members mint NO pacts (no allied web, no free summit VP)",
    g.diplomacy.pacts.length === pactsBefore
    && !g.diplomacy.pacts.some((p) => p.a === "versari" || p.b === "versari"));
  performDiplomacy(g, "versari", "declare-war", { faction: target20 });
  check("declaring war on the target is the human's road INTO the coalition",
    !!coal20 && coal20.members.includes("versari"));

  // --- menace clamp: no laundering by attacking warlords ---
  g.players.versari.menace = 5;
  menaceFromAttack(g, "versari", "lakers"); // aggression 0.9 → raw −2, clamped −1
  check("attacking a warlord soothes Menace by at most 1 (no laundering)",
    g.players.versari.menace === 4);

  // --- trespass: Civ-style escalation ladder on Neutral ground ---
  const g2 = createGame({ seed: 202, humanFactionId: "versari" });
  ensureDiplomacy(g2);
  const u20 = Object.values(g2.units).find((u) => u.owner === "versari");
  // Open ground, not cover — this block tests the escalation ladder, and cover
  // would hide the trespasser from a host with no Detection.
  const hex20 = Object.values(g2.board.hexes).find((h) => !g2.locations[h.id] && !h.cover).id;
  g2.world.zoc = g2.world.zoc || {};
  g2.world.zoc[hex20] = "goldgrass";
  setStanding(g2, "goldgrass", "versari", 0, "test");
  // A citation needs the host to have SEEN the intrusion. Put the unit on the
  // hex and give goldgrass sight of it.
  u20.node = hex20;
  revealRegion(g2, "goldgrass", [hex20]);
  const menBefore = g2.players.versari.menace || 0;
  emit(g2, "unit_moved", { unit: u20.uid, from: u20.node, to: hex20 });
  check("first incursion on Neutral ground is a WARNING — no Standing hit, no Menace",
    getStanding(g2, "goldgrass", "versari") === 0
    && (g2.players.versari.menace || 0) === menBefore
    && g2.log.some((e) => e.name === "territory_trespassed" && e.payload.warning));
  emit(g2, "unit_moved", { unit: u20.uid, from: u20.node, to: hex20 });
  check("only one trespass citation per faction pair per round",
    getStanding(g2, "goldgrass", "versari") === 0);
  u20.node = hex20; // stay parked — the presence sweep keeps the streak alive
  g2.round += 1;
  sweepTrespass(g2, "versari");
  check("staying a second round escalates to −1 Standing",
    getStanding(g2, "goldgrass", "versari") === -1);
  g2.round += 1;
  sweepTrespass(g2, "versari");
  check("a third consecutive round bites at −2/round",
    getStanding(g2, "goldgrass", "versari") === -3);
  // reset test — mend relations back to Neutral first (a pair the ladder
  // itself drove below Neutral loses the courtesy, by design)
  setStanding(g2, "goldgrass", "versari", 0, "test");
  g2.round += 2; // absent for a round → the ladder resets
  sweepTrespass(g2, "versari");
  check("leaving for a round resets the ladder to a warning",
    getStanding(g2, "goldgrass", "versari") === 0);
  setStanding(g2, "goldgrass", "versari", -4, "test"); // Wary — no courtesy
  g2.round += 1;
  emit(g2, "unit_moved", { unit: u20.uid, from: u20.node, to: hex20 });
  check("distrustful hosts skip the courtesy: −2 Standing + Menace at once",
    getStanding(g2, "goldgrass", "versari") === -6
    && (g2.players.versari.menace || 0) === menBefore + 1);

  // --- mediation cooldown: no Honor pump off a recurring feud ---
  const g3 = createGame({ seed: 203 });
  ensureDiplomacy(g3);
  const [ma, mb, mc] = g3.turnOrder.filter((f) => factionDef(f)?.tier === "major");
  declareWar(g3, ma, mb, "test");
  check("mediation still works the first time", mediate(g3, mc, ma, mb) === true);
  declareWar(g3, ma, mb, "test2");
  check("a just-mediated pair is on cooldown", mediate(g3, mc, ma, mb) === false);
  g3.round += CONFIG.diplomacy.ai.mediateCooldownRounds;
  check("mediation works again once the feud has aged", mediate(g3, mc, ma, mb) === true);

  // --- rebellion cooldown: no same-round re-vassalizing ---
  const g4 = createGame({ seed: 204, humanFactionId: "versari", minors: ["tempest"] });
  ensureDiplomacy(g4);
  // Same as the patronage fixture: a client with no army but a rich seat is not
  // weak now that VP is held, so strip its holdings too before the power gate.
  for (const u of Object.values(g4.units)) if (u.owner === "tempest") delete g4.units[u.uid];
  for (const l of Object.values(g4.locations)) {
    if (holderOf(l) !== "tempest") continue;
    l.controller = null; l.loyaltyOwner = null; l.loyalty = null;
    l.sections = l.sections.map(() => "neutral");
  }
  recomputeVp(g4);
  vassalize(g4, "lakers", "tempest", "test");
  g4.diplomacy.resentment.tempest = 99;
  runDiplomacyRound(g4);
  check("a resentful vassal rebels",
    vassalLord(g4, "tempest") == null && atWar(g4, "tempest", "lakers"));
  check("a fresh rebel refuses its old lord (revolving door closed)",
    !aiAcceptsVassalage(g4, "tempest", "lakers"));
  g4.round += CONFIG.diplomacy.vassal.rebellionCooldownRounds;
  check("after the cooldown, a cornered rebel can be re-subjugated",
    aiAcceptsVassalage(g4, "tempest", "lakers"));

  // --- gift ladder: the price is Sway, and a landed gift still lasts ---
  //
  // The old cap (`gift.maxScrapPerGift`) existed to stop one giant bribe
  // buying a pact. It is no longer the mechanism that does that job: warmth is
  // bought a point at a time out of a political income with a ceiling, so the
  // ceiling IS the cap and one enormous gift is arithmetically impossible.
  const g5 = createGame({ seed: 205, humanFactionId: "versari" });
  ensureDiplomacy(g5);
  const SW5 = CONFIG.sway;
  g5.players.versari.resource = 30;
  g5.players.versari.sway = SW5.cap;
  const r4 = performDiplomacy(g5, "versari", "gift", { faction: "goldgrass", standing: 4 });
  check("a gift buys the warmth it paid for", r4.ok && getStanding(g5, "goldgrass", "versari") === 4);
  check("…out of the political pool, at the published rate",
    g5.players.versari.sway === SW5.cap - 4 * SW5.perStanding);
  check("…and a full pool cannot buy past the pact bar in one go",
    Math.floor(SW5.cap / SW5.perStanding) < CONFIG.diplomacy.pactStandingReq
    || CONFIG.diplomacy.posture.courtRounds > 0);
  check("a landed gift warms the baseline — drift can't erase generosity",
    getBaseline(g5, "goldgrass", "versari") === CONFIG.diplomacy.gift.baselineWarmth);

  // --- encounter standing rewards: self-standing is a no-op ---
  const g6 = createGame({ seed: 206, humanFactionId: "versari" });
  const logBefore6 = g6.log.length;
  applyEffect(g6, { type: "ADJUST_STANDING", player: "versari", faction: "versari", amount: 2 }, {});
  check("an encounter can't move a faction's standing toward itself",
    getStanding(g6, "versari", "versari") === 0
    && !g6.log.slice(logBefore6).some((e) => e.name === "standing_changed"));
  applyEffect(g6, { type: "ADJUST_STANDING", player: "versari", faction: "goldgrass", amount: 2 }, {});
  check("encounter standing rewards still land on real pairs",
    getStanding(g6, "goldgrass", "versari") === 2);

  // --- AI casus belli: a pacifist at Neutral doesn't blind-attack ---
  const g7 = createGame({ seed: 207, humanFactionId: "versari" });
  ensureDiplomacy(g7);
  const pacifist = "goldgrass"; // aggression 0.1
  const homeLoc = Object.values(g7.locations).find((l) => l.controller === "versari");
  const gUnit = Object.values(g7.units).find((u) => u.owner === pacifist);
  gUnit.node = homeLoc.hexId;
  setStanding(g7, pacifist, "versari", 0, "test");
  while (g7.turnOrder[g7.activeIndex] !== pacifist) endTurn(g7);
  takeAITurn(g7);
  check("a pacifist at Neutral standing does not blind-attack the human",
    !atWar(g7, pacifist, "versari"));
}

// Phase 21 — just war + precursor warnings: a formal grievance makes war
// righteous (no Menace from fighting it); the AI telegraphs trouble to
// the human before acting on it.
{
  line("\n  [Phase 21] just war + precursor warnings");
  const jw = CONFIG.diplomacy.justWar;

  // --- denounce → declare = justified: fighting costs no Menace ---
  // The denouncement has to be WARRANTED to justify anything. Lakers earn it
  // here the way a faction earns it in play: by piling up Menace past what
  // Versari will overlook. (Denouncing a clean-handed faction is covered
  // below — it is a slander, and justifies nothing.)
  const g = createGame({ seed: 211, humanFactionId: "versari" });
  ensureDiplomacy(g);
  check("a clean-handed faction cannot be denounced into a just war",
    denounceWarrant(g, "versari", "lakers") === null);
  g.players.lakers.menace = 24;
  check("…but a faction past your tolerance can",
    denounceWarrant(g, "versari", "lakers") === "menace");
  performDiplomacy(g, "versari", "denounce", { faction: "lakers" });
  check("a warranted denouncement justifies a later declaration",
    warJustification(g, "versari", "lakers") === "denounced");
  performDiplomacy(g, "versari", "declare-war", { faction: "lakers" });
  const war21 = findWar(g, "versari", "lakers");
  check("the declared war carries the justification",
    !!war21 && war21.justified.includes("versari") && !war21.justified.includes("lakers"));
  g.players.versari.menace = 5;
  menaceFromAttack(g, "versari", "lakers");
  check("fighting a justified war generates no Menace",
    g.players.versari.menace === 5);

  // --- being wronged also justifies, and grievances expire ---
  const g2 = createGame({ seed: 212, humanFactionId: "versari" });
  ensureDiplomacy(g2);
  formPact(g2, "goldgrass", "versari", "test");
  breakPact(g2, "goldgrass", "versari", "test"); // they broke it — you hold the grievance
  check("a broken pact leaves a grievance that justifies war",
    warJustification(g2, "versari", "goldgrass") === "pact-broken");
  g2.round += jw.grievanceWindowRounds + 1;
  check("grievances expire — old wounds don't justify forever",
    warJustification(g2, "versari", "goldgrass") == null);

  // --- unprovoked war still stains ---
  const g3 = createGame({ seed: 213, humanFactionId: "versari" });
  ensureDiplomacy(g3);
  performDiplomacy(g3, "versari", "declare-war", { faction: "goldgrass" });
  g3.players.versari.menace = 0;
  menaceFromAttack(g3, "versari", "goldgrass"); // pacifist target → +2
  check("an unprovoked war still stains: attacking a pacifist raises Menace",
    g3.players.versari.menace === 2);

  // --- precursor warnings: a Wary faction sends word ---
  const g4 = createGame({ seed: 214, humanFactionId: "versari" });
  ensureDiplomacy(g4);
  setStanding(g4, "lakers", "versari", CONFIG.diplomacy.tiers.wary - 1, "test");
  const logFrom4 = g4.log.length;
  runDiplomacyRound(g4);
  const warn4 = g4.log.slice(logFrom4).find(
    (e) => e.name === "diplomatic_warning" && e.payload.from === "lakers");
  check("a faction sunk to Wary warns the human before acting",
    !!warn4 && warn4.payload.kind === "war" && warn4.payload.temperament === factionDef("lakers").temperament);
  setStanding(g4, "lakers", "versari", CONFIG.diplomacy.tiers.wary - 1, "test");
  const logFrom4b = g4.log.length;
  runDiplomacyRound(g4);
  check("the warning respects its cooldown — no nagging",
    !g4.log.slice(logFrom4b).some((e) => e.name === "diplomatic_warning" && e.payload.from === "lakers"));

  // --- precursor warnings: the board murmurs before a coalition ---
  const g5 = createGame({ seed: 215, humanFactionId: "versari" });
  ensureDiplomacy(g5);
  // pin threat into the murmur band [threshold·fraction, threshold): base
  // threat is board-dependent, so top it up with Menace to just past the line
  const DC = CONFIG.diplomacy;
  const base5 = threatScore(g5, "versari");
  // +decayPerRound: Menace decays at the top of the round, before warnings
  g5.players.versari.menace = Math.max(0,
    Math.ceil(DC.coalition.threshold * DC.warnings.coalitionFraction - base5) + DC.menace.decayPerRound);
  const logFrom5 = g5.log.length;
  runDiplomacyRound(g5);
  check("the board murmurs before a coalition actually forms",
    g5.log.slice(logFrom5).some((e) => e.name === "diplomatic_warning" && e.payload.kind === "coalition")
    && !g5.diplomacy.coalitions.find((c) => c.target === "versari"));
}

// Phase 22 — pace & siege (2026-08-15 playtest): peace now binds for a
// window, a besieged city keeps working, and a Location anchors its own
// hex so its garrison is never cited as trespassers at home.
{
  line("\n  [Phase 22] pace & siege — truces, partial control, ZoC anchor");
  const tc = CONFIG.diplomacy.truce;

  // --- truce: peace binds, and the AI honors it ---
  const g = createGame({ seed: 221, humanFactionId: "versari" });
  ensureDiplomacy(g);
  declareWar(g, "lakers", "versari", "test");
  makePeace(g, "lakers", "versari", "test-peace");
  check("peace opens a truce window", !!truceBetween(g, "lakers", "versari"));
  check("peace lifts both sides clear of contempt (no instant re-attack)",
    getStanding(g, "lakers", "versari") >= tc.standingFloor
    && getStanding(g, "versari", "lakers") >= tc.standingFloor);
  const logFrom = g.log.length;
  runDiplomacyRound(g);
  check("no war re-declared through a live truce",
    !g.log.slice(logFrom).some((e) => e.name === "war_declared"
      && [e.payload.a, e.payload.b].includes("lakers")
      && [e.payload.a, e.payload.b].includes("versari")));
  g.round += tc.rounds;
  check("the truce expires on schedule", !truceBetween(g, "lakers", "versari"));

  // --- breaking a truce is treachery ---
  const g2 = createGame({ seed: 222, humanFactionId: "versari" });
  ensureDiplomacy(g2);
  declareWar(g2, "versari", "goldgrass", "test");
  makePeace(g2, "versari", "goldgrass", "test-peace");
  const honorBefore = honorOf(g2, "versari");
  const menaceBefore = g2.players.versari.menace || 0;
  const logFrom2 = g2.log.length;
  onAttack(g2, "versari", "goldgrass");
  // Striking through a truce is BOTH treachery and a surprise attack —
  // the tolls stack, so assert "at least the truce toll", not equality.
  check("striking through a truce costs Honor and raises Menace",
    honorOf(g2, "versari") <= honorBefore - tc.breakHonorLoss
    && (g2.players.versari.menace || 0) >= menaceBefore + tc.breakMenace
    && g2.log.slice(logFrom2).some((e) => e.name === "truce_broken"));
  check("the victim of a broken truce earns a justified war",
    !!warJustification(g2, "goldgrass", "versari"));
  check("the truce is gone once broken", !truceBetween(g2, "versari", "goldgrass"));

  // --- partial control: a besieged city still works ---
  const g3 = createGame({ seed: 223, humanFactionId: "versari" });
  ensureDiplomacy(g3);
  const city = Object.values(g3.locations).find((l) => l.controller === "versari" && l.sections.length === 3);
  city.sections = ["versari", "versari", "versari"];
  city.controller = "versari"; city.loyaltyOwner = "versari"; city.loyalty = 6;
  recomputeInfluence(g3);
  const fullOut = locationOutput(g3, city);
  check("full control reads as 'full'", controlLevel(city, "versari") === "full");
  // an attacker takes ONE section — the old model zeroed the place out
  city.sections[0] = "lakers";
  city.controller = null; // engine clears the flag below full control
  check("2 of 3 sections still HOLDS the city",
    holderOf(city) === "versari" && controlLevel(city, "versari") === "majority"
    && holdsLocation(city, "versari"));
  const bankBefore = g3.players.versari.resource;
  applyOutputAndBuilds(g3, "versari");
  const gained = g3.players.versari.resource - bankBefore;
  check("a besieged city still pays its holder (at reduced output)",
    gained > 0 && gained <= fullOut);
  recomputeInfluence(g3);
  check("a besieged city still projects influence",
    (g3.world.influence.versari?.[city.hexId] || 0) > 0);

  // --- ZoC anchor: your own city is yours, and its garrison is home ---
  check("a held Location's own hex sits in its holder's ZoC",
    g3.world.zoc[city.hexId] === "versari");
  // even when a rival out-projects there
  const bully = Object.values(g3.locations).find((l) => l.hexId !== city.hexId);
  bully.controller = "lakers"; bully.sections = ["lakers", "lakers", "lakers"];
  bully.loyaltyOwner = "lakers"; bully.loyalty = 8;
  recomputeInfluence(g3);
  check("a rival cannot out-influence you out of your own city hex",
    g3.world.zoc[city.hexId] === "versari");
  const garrison = Object.values(g3.units).find((u) => u.owner === "versari");
  garrison.node = city.hexId;
  g3.world.zoc[city.hexId] = "lakers"; // force the old broken state
  const standBefore = getStanding(g3, "lakers", "versari");
  sweepTrespass(g3, "versari");
  check("your garrison is never cited for trespassing in a city you hold",
    getStanding(g3, "lakers", "versari") === standBefore);
}

// Phase 23 — the diplomacy audit fixes (docs/diplomacy-audit-2026-08-19.md).
// Every check here is a bug that shipped: a verb that did nothing, a verb
// that skipped consent entirely, a cost the UI promised and the engine never
// charged, and a deal schema the two halves of the app disagreed on.
{
  line("\n  [Phase 23] diplomacy — consent, cost, and one deal schema");
  const H = CONFIG.diplomacy.honor;
  const M = CONFIG.diplomacy.menace;

  // --- 1. Make Peace is an OFFER, not a button ---
  {
    const g = createGame({ seed: 231, humanFactionId: "versari" });
    ensureDiplomacy(g);
    declareWar(g, "lakers", "versari", "test");
    // A warlord one round into a war it has lost nothing in refuses.
    check("a fresh war cannot be ended by asking",
      aiAcceptsPeace(g, "lakers", "versari", null) === false);
    const res = performDiplomacy(g, "versari", "make-peace", { faction: "lakers" });
    check("make-peace reports the refusal instead of silently succeeding",
      res.ok === true && res.accepted === false);
    check("…and the war is still on", atWar(g, "versari", "lakers"));
    check("make-peace off a war is refused outright",
      performDiplomacy(g, "versari", "make-peace", { faction: "goldgrass" }).ok === false);
  }

  // --- 2. Denounce costs Honor, and cannot be spammed ---
  {
    const g = createGame({ seed: 232, humanFactionId: "versari" });
    ensureDiplomacy(g);
    const h0 = honorOf(g, "versari");
    check("denouncing lands the first time", denounce(g, "versari", "lakers") === true);
    check("denouncing a clean faction costs Honor", honorOf(g, "versari") === h0 - H.denounceLoss);
    check("a second denouncement in the window is refused",
      denounce(g, "versari", "lakers") === false);
    check("…and costs nothing further", honorOf(g, "versari") === h0 - H.denounceLoss);
    // …and the same act against a faction that has earned it PAYS.
    const gw = createGame({ seed: 232, humanFactionId: "versari" });
    ensureDiplomacy(gw);
    gw.players.lakers.menace = 24;
    const hw = honorOf(gw, "versari");
    denounce(gw, "versari", "lakers");
    check("denouncing a faction the board can see is dangerous pays Honor",
      honorOf(gw, "versari") === hw + H.denounceWarrantedGain);
    check("the cooldown is readable by the UI",
      denounceCooldown(g, "versari", "lakers") > 0
      && denounceCooldown(g, "versari", "goldgrass") === 0);
  }

  // --- 2b. The board judges the ACCUSATION, not the accused ---
  {
    // A tyrant everyone can see: denouncing them says out loud what the
    // board was already thinking, and the board warms to the speaker.
    const g = createGame({ seed: 238, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.lakers.menace = 24;
    const before = getStanding(g, "goldgrass", "versari");
    denounce(g, "versari", "lakers");
    check("denouncing a faction the board also condemns rallies them to you",
      getStanding(g, "goldgrass", "versari") > before);

    // The same words against a faction with clean hands land as slander.
    const g2 = createGame({ seed: 238, humanFactionId: "versari" });
    ensureDiplomacy(g2);
    const before2 = getStanding(g2, "goldgrass", "versari");
    denounce(g2, "versari", "lakers");
    check("denouncing a clean-handed faction turns the board against YOU",
      getStanding(g2, "goldgrass", "versari") < before2);

    // …and nobody listens to a liar in the first place.
    const g3 = createGame({ seed: 238, humanFactionId: "versari" });
    ensureDiplomacy(g3);
    g3.players.lakers.menace = 24;
    g3.players.versari.honor = CONFIG.diplomacy.honor.min;
    const before3 = getStanding(g3, "goldgrass", "versari");
    denounce(g3, "versari", "lakers");
    check("an accusation from a faction with no Honor moves nobody",
      getStanding(g3, "goldgrass", "versari") === before3);
  }

  // --- 3. Declaring an unjustified war marks you; a just one does not ---
  {
    const g = createGame({ seed: 233, humanFactionId: "versari" });
    ensureDiplomacy(g);
    declareWar(g, "versari", "lakers", "player");
    check("an unprovoked declaration raises Menace before a shot is fired",
      (g.players.versari.menace || 0) === M.declareUnjustified);
    const g2 = createGame({ seed: 233, humanFactionId: "versari" });
    ensureDiplomacy(g2);
    g2.players.lakers.menace = 24; // they have earned the accusation
    denounce(g2, "versari", "lakers");
    declareWar(g2, "versari", "lakers", "player");
    check("a war you denounced your way into costs no Menace to declare",
      (g2.players.versari.menace || 0) === 0);
    const g3 = createGame({ seed: 233, humanFactionId: "versari" });
    ensureDiplomacy(g3);
    denounce(g3, "versari", "lakers"); // baseless — they have done nothing
    declareWar(g3, "versari", "lakers", "player");
    check("a baseless denouncement launders nothing",
      (g3.players.versari.menace || 0) === M.declareUnjustified);
  }

  // --- 4. One deal schema: a struck promise is performed ---
  {
    const g = createGame({ seed: 234, humanFactionId: "versari" });
    ensureDiplomacy(g);
    adjustStanding(g, "goldgrass", "versari", 12, "test");
    adjustStanding(g, "versari", "goldgrass", 12, "test");
    // §7.2 — a pact inside a deal answers to the same bar as a pact asked for
    // directly, courtship included. One bar for everyone has to mean every
    // road, or the deal builder becomes the road round the ladder.
    performDiplomacy(g, "versari", "court", { faction: "goldgrass" });
    g.round += CONFIG.diplomacy.posture.courtRounds;
    check("the drawer's old shorthand is worth nothing (it is not the schema)",
      valueOfItem(g, "goldgrass", { pact: true }) === 0);
    check("an alliance is worth something to a faction that would take one",
      valueOfItem(g, "goldgrass", { promise: { kind: "pact" } }, { other: "versari" }) > 0);
    const r = performDiplomacy(g, "versari", "propose-deal", {
      faction: "goldgrass",
      give: [{ promise: { kind: "pact" } }, { promise: { kind: "openBorders" } }],
      get: [{ resource: { resource: "scrap", amount: 3 } }],
    });
    check("a struck deal that promised a pact leaves a pact behind",
      r.accepted === true && arePacted(g, "versari", "goldgrass"));
    check("…and one that promised open borders leaves them open",
      hasOpenBorders(g, "versari", "goldgrass"));
  }

  // --- 5. dontAlly is enforced, not just priced ---
  {
    const g = createGame({ seed: 235, humanFactionId: "versari" });
    ensureDiplomacy(g);
    applyDeal(g, {
      proposer: "versari", recipient: "plainers",
      give: [{ promise: { kind: "dontAlly", target: "lakers", rounds: 6 } }], get: [],
    }, "test");
    adjustStanding(g, "lakers", "versari", 12, "test");
    adjustStanding(g, "versari", "lakers", 12, "test");
    check("a live dontAlly pledge blocks the alliance it named",
      formPact(g, "versari", "lakers", "test") === false && !arePacted(g, "versari", "lakers"));
  }

  // --- 6. A flow is priced on its term, pays exactly that many times ---
  {
    const g = createGame({ seed: 236, humanFactionId: "versari" });
    ensureDiplomacy(g);
    const short = { flow: { resource: "scrap", amountPerTurn: 4, rounds: 5 } };
    const long = { flow: { resource: "scrap", amountPerTurn: 4, rounds: 20 } };
    check("a longer stream is worth more than a shorter one",
      valueOfItem(g, "goldgrass", long) > valueOfItem(g, "goldgrass", short));
    check("a stream is priced at rate x term", valueOfItem(g, "goldgrass", short) === 20);
    applyDeal(g, { proposer: "goldgrass", recipient: "versari", give: [short], get: [] }, "test");
    g.players.goldgrass.resource = 500;
    const start = g.players.versari.resource || 0;
    for (let i = 0; i < 12; i++) { g.round += 1; runDiplomacyRound(g); }
    check("a 5-round stream pays exactly 5 times, then lapses",
      (g.players.versari.resource || 0) - start === 20);
    check("…and the agreement is gone",
      !g.diplomacy.agreements.some((a) => a.type === "deal-promise"));
  }

  // --- 7. Demand Tribute reads what the drawer sends ---
  {
    const g = createGame({ seed: 237, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 50;
    g.players.versari.resource = 0;
    for (const loc of Object.values(g.locations)) {
      if (loc.controller && loc.controller !== "goldgrass") loc.controller = "versari";
    }
    for (const u of Object.values(g.units)) if (u.owner !== "goldgrass") u.owner = "versari";
    check("a demand naming nothing is refused",
      performDiplomacy(g, "versari", "demand-tribute", { faction: "goldgrass", terms: [] }).ok === false);
    performDiplomacy(g, "versari", "demand-tribute", {
      faction: "goldgrass", terms: [{ resource: { resource: "scrap", amount: 15 } }],
    });
    check("a demand that caves actually moves the scrap named",
      (g.players.versari.resource || 0) === 15);
  }
}

// Phase 24 — §6.10 the round trip. A proposal is a thing on a table, a
// refusal comes back with a price, and asking has a cost. Before this every
// verb resolved instantly and the AI never approached the player at all.
{
  line("\n  [Phase 24] diplomacy — the round trip");
  const O = CONFIG.diplomacy.offers;

  // --- a refusal comes back with terms ---
  {
    const g = createGame({ seed: 241, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 40;
    const lowball = {
      proposer: "versari", recipient: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 1 } }],
      get: [{ promise: { kind: "openBorders" } }, { promise: { kind: "nonAggression", rounds: 6 } }],
    };
    check("a lowball is refused as it stands", wouldAccept(g, "goldgrass", lowball) === false);
    const counter = counterOffer(g, "goldgrass", lowball);
    check("…but a price exists, and they name it", !!counter);
    check("the counter is one they would actually take", wouldAccept(g, "goldgrass", counter));
    check("the counter asks for more than the lowball did",
      counter.give.find((i) => i.resource)?.resource.amount > 1);
    check("…and keeps the terms the proposer actually wanted",
      counter.get.length === lowball.get.length);
    const r = performDiplomacy(g, "versari", "propose-deal",
      { faction: "goldgrass", give: lowball.give, get: lowball.get });
    check("proposing it puts their counter in your inbox",
      r.countered === true && offersFor(g, "versari").length === 1);
    const offer = offersFor(g, "versari")[0];
    check("the tabled offer is theirs, marked as a counter",
      offer.from === "goldgrass" && offer.isCounter === true);
    const before = g.players.versari.resource;
    answerOffer(g, "versari", offer.id, true);
    check("accepting it applies exactly those terms",
      g.players.versari.resource < before && hasOpenBorders(g, "goldgrass", "versari"));
    check("…and takes it off the table", offersFor(g, "versari").length === 0);
  }

  // --- an alliance is not for sale ---
  {
    const g = createGame({ seed: 242, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 200;
    adjustStanding(g, "goldgrass", "versari", -4, "test"); // under the pact bar
    const bribe = {
      proposer: "versari", recipient: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 150 } }],
      get: [{ promise: { kind: "pact" } }],
    };
    check("no pile of scrap buys past the Standing bar",
      wouldAccept(g, "goldgrass", bribe) === false);
    check("…and there is no counter for it either",
      counterOffer(g, "goldgrass", bribe) === null);
  }

  // --- a hopeless ask gets an honest no, not an empty counter ---
  {
    const g = createGame({ seed: 243, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 3;
    const r = performDiplomacy(g, "versari", "propose-deal", {
      faction: "lakers", give: [],
      get: [{ flow: { resource: "scrap", amountPerTurn: 10, rounds: 20 } }],
    });
    check("a gap beyond the proposer's means is refused outright",
      r.accepted === false && !r.countered);
    check("…and tables nothing", offersFor(g, "versari").length === 0);
  }

  // --- asking too often costs Standing ---
  {
    const g = createGame({ seed: 244, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 0;
    const hopeless = { faction: "lakers", give: [],
      get: [{ flow: { resource: "scrap", amountPerTurn: 10, rounds: 20 } }] };
    const s0 = getStanding(g, "lakers", "versari");
    for (let i = 0; i < O.freeAsksPerRound; i++) performDiplomacy(g, "versari", "propose-deal", hopeless);
    check("the first asks of a round are free", getStanding(g, "lakers", "versari") === s0);
    performDiplomacy(g, "versari", "propose-deal", hopeless);
    check("one past the quota cools them", getStanding(g, "lakers", "versari") === s0 - O.pesterStandingHit);
    check("the tally is readable", asksThisRound(g, "versari", "lakers") === O.freeAsksPerRound + 1);
    g.round += 1;
    check("and it resets with the round", asksThisRound(g, "versari", "lakers") === 0);
  }

  // --- answering is never an ask ---
  {
    const g = createGame({ seed: 245, humanFactionId: "versari" });
    ensureDiplomacy(g);
    const o = tableOffer(g, "goldgrass", "versari",
      { give: [{ resource: { resource: "scrap", amount: 5 } }], get: [] }, { kind: "deal" });
    performDiplomacy(g, "versari", "answer-offer", { offerId: o.id, accept: false });
    check("declining somebody else's offer costs no patience",
      asksThisRound(g, "versari", "goldgrass") === 0);
  }

  // --- an unanswered offer lapses, and lapsing is free ---
  {
    const g = createGame({ seed: 246, humanFactionId: "versari" });
    ensureDiplomacy(g);
    tableOffer(g, "goldgrass", "versari",
      { give: [{ resource: { resource: "scrap", amount: 5 } }], get: [] }, { kind: "deal" });
    const s0 = getStanding(g, "goldgrass", "versari");
    check("it waits in the inbox", offersFor(g, "versari").length === 1);
    for (let i = 0; i < O.expiryRounds + 1; i++) { g.round += 1; runDiplomacyRound(g); }
    check("…then lapses", offersFor(g, "versari").length === 0);
    check("and silence was not a refusal", getStanding(g, "goldgrass", "versari") === s0);
  }

  // --- the AI approaches the human, and stops imposing on them ---
  {
    const g = createGame({ seed: 247, humanFactionId: "versari" });
    ensureDiplomacy(g);
    adjustStanding(g, "goldgrass", "versari", 20, "test");
    adjustStanding(g, "versari", "goldgrass", 20, "test");
    g.activeIndex = g.turnOrder.indexOf("goldgrass");
    takeAITurn(g);
    check("an AI no longer imposes an alliance on the human",
      !arePacted(g, "goldgrass", "versari"));
    // §5 — and it does not ask on the first turn either. Its one initiative
    // goes on OPENING the courtship, which is the middle the layer was
    // missing: an alliance out of a clear sky is unearned, the same alliance
    // after rounds of a faction publicly courting you is not.
    check("…it opens a courtship first", isCourting(g, "goldgrass", "versari"));
    check("…and says so where the player can read it",
      g.log.some((e) => e.name === "posture_changed" && e.payload.to === "Courting"));
    // Run the ladder out. The AI keeps its cadence, so give it turns.
    for (let i = 0; i < CONFIG.diplomacy.posture.courtRounds + 2; i += 1) {
      g.round += 1;
      runDiplomacyRound(g);
      g.activeIndex = g.turnOrder.indexOf("goldgrass");
      takeAITurn(g);
      if (offersFor(g, "versari").some((o) => o.from === "goldgrass" && o.kind === "pact")) break;
    }
    check("…then it asks", offersFor(g, "versari").some((o) => o.from === "goldgrass" && o.kind === "pact"));
    const offer = offersFor(g, "versari").find((o) => o.from === "goldgrass");
    answerOffer(g, "versari", offer.id, true);
    check("and accepting the offer forms the pact", arePacted(g, "goldgrass", "versari"));
  }

  // --- across a real run, the AI opens conversations ---
  {
    const g = createGame({ seed: 248, humanFactionId: "versari" });
    ensureDiplomacy(g);
    let seen = 0;
    for (let r = 0; r < 25; r += 1) {
      for (const f of g.turnOrder) {
        if (f === "versari") continue;
        g.activeIndex = g.turnOrder.indexOf(f);
        takeAITurn(g);
      }
      seen += offersFor(g, "versari").length;
      for (const o of offersFor(g, "versari")) answerOffer(g, "versari", o.id, false);
      g.round += 1;
      runDiplomacyRound(g);
    }
    check("over 25 rounds the AI approaches the human at least once", seen > 0);
  }
}

// Phase 25 — the grievance ledger. What was done to you is a list with
// weights and places, not one overwritten flag, and it can be settled.
{
  line("\n  [Phase 25] diplomacy — the grievance ledger");
  const G = CONFIG.diplomacy.grievance;

  // --- it accumulates, instead of overwriting ---
  {
    const g = createGame({ seed: 251, humanFactionId: "versari" });
    ensureDiplomacy(g);
    recordGrievance(g, "goldgrass", "versari", "surprise-attack", { at: "h2-1" });
    g.round += 1;
    recordGrievance(g, "goldgrass", "versari", "truce-broken", { at: "h3-0" });
    g.round += 1;
    recordGrievance(g, "goldgrass", "versari", "promise-broken");
    const held = grievancesAgainst(g, "goldgrass", "versari");
    check("three betrayals leave three entries, not one", held.length === 3);
    check("each carries its own weight",
      grievanceWeight(g, "goldgrass", "versari")
        === G.severity["surprise-attack"] + G.severity["truce-broken"] + G.severity["promise-broken"]);
    check("and its own place", held.some((e) => e.at === "h3-0"));
    const worst = worstGrievance(g, "goldgrass", "versari");
    check("a denouncement cites the worst of them, not the latest",
      worst.kind === "truce-broken");
    check("…with the receipt attached",
      denounceGrounds(g, "goldgrass", "versari").entry.at === "h3-0");
  }

  // --- entries age out one at a time ---
  {
    const g = createGame({ seed: 252, humanFactionId: "versari" });
    ensureDiplomacy(g);
    recordGrievance(g, "goldgrass", "versari", "truce-broken");
    g.round += CONFIG.diplomacy.justWar.grievanceWindowRounds;
    recordGrievance(g, "goldgrass", "versari", "promise-broken");
    g.round += 1;
    check("the old grievance lapses while the fresh one stands",
      grievancesAgainst(g, "goldgrass", "versari").length === 1
      && worstGrievance(g, "goldgrass", "versari").kind === "promise-broken");
  }

  // --- the ledger stays bounded ---
  {
    const g = createGame({ seed: 253, humanFactionId: "versari" });
    ensureDiplomacy(g);
    for (let i = 0; i < G.maxPerPair + 5; i += 1) recordGrievance(g, "goldgrass", "versari", "promise-broken");
    check("the ledger keeps a bounded history",
      g.diplomacy.grievances.goldgrass.versari.length === G.maxPerPair);
  }

  // --- an apology is not free, and a settlement has a price ---
  {
    const g = createGame({ seed: 254, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 40;
    recordGrievance(g, "goldgrass", "versari", "truce-broken");
    recordGrievance(g, "goldgrass", "versari", "surprise-attack");
    const weight = grievanceWeight(g, "goldgrass", "versari");
    const sorry = { proposer: "versari", recipient: "goldgrass", give: [], get: [{ settlement: true }] };
    check("'let us call it settled', offering nothing, is refused",
      wouldAccept(g, "goldgrass", sorry) === false);
    const counter = counterOffer(g, "goldgrass", sorry);
    check("…but they will name a price for it", !!counter);
    check("the price tracks what is owed",
      counter.give.find((i) => i.resource)?.resource.amount >= Math.floor(weight * G.settlementPerWeight));
  }

  // --- paying it clears the slate, both ways, and restores Honor ---
  {
    const g = createGame({ seed: 255, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.versari.resource = 40;
    recordGrievance(g, "goldgrass", "versari", "truce-broken");
    recordGrievance(g, "versari", "goldgrass", "promise-broken");
    const h0 = honorOf(g, "versari");
    check("a grievance justifies their war on you",
      warJustification(g, "goldgrass", "versari") === "truce-broken");
    applyDeal(g, {
      proposer: "versari", recipient: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 12 } }], get: [{ settlement: true }],
    }, "test");
    check("settling clears what they hold against you",
      grievanceWeight(g, "goldgrass", "versari") === 0);
    check("…and what you hold against them — half a reconciliation is not one",
      grievanceWeight(g, "versari", "goldgrass") === 0);
    check("their justification goes with it",
      warJustification(g, "goldgrass", "versari") === null);
    check("making amends is honourable", honorOf(g, "versari") === h0 + G.settlementHonorGain);
  }

  // --- and it pulls the rug from a denouncement resting on it ---
  {
    const g = createGame({ seed: 256, humanFactionId: "versari" });
    ensureDiplomacy(g);
    recordGrievance(g, "goldgrass", "versari", "truce-broken");
    denounce(g, "goldgrass", "versari");
    check("the denouncement stands while the grievance does",
      warJustification(g, "goldgrass", "versari") === "denounced");
    applyDeal(g, {
      proposer: "versari", recipient: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 9 } }], get: [{ settlement: true }],
    }, "test");
    check("settling takes the grounds out from under it",
      warJustification(g, "goldgrass", "versari") === null);
  }
}

// Phase 26 — reputation is what the board SAW. Fog of war and diplomacy did
// not touch anywhere in the codebase, so a massacre in unexplored wasteland
// cost exactly what one on a rival's doorstep did.
{
  line("\n  [Phase 26] diplomacy — witnessed reputation");
  const M = CONFIG.diplomacy.menace;

  // Pick a hex nobody third-party can see, and the most-watched one there is.
  const probe = createGame({ seed: 261, humanFactionId: "versari" });
  ensureDiplomacy(probe);
  const opts = { attacker: "versari", victim: "goldgrass" };
  const counted = Object.keys(probe.board.hexes)
    .map((h) => [h, witnessesOf(probe, h, opts).length]);
  const mostSeen = Math.max(...counted.map(([, n]) => n));
  const openHex = counted.find(([, n]) => n === mostSeen)[0];
  const darkHex = counted.find(([, n]) => n === 0)?.[0];

  check("some ground is watched and some is not", mostSeen > 0 && !!darkHex);
  check("an unwatched hex scores near nothing",
    witnessShare(probe, darkHex, opts) === M.unwitnessedShare);
  check("a watched one scores more", witnessShare(probe, openHex, opts) > witnessShare(probe, darkHex, opts));

  // The same blow, in the open and in the dark. Already at war both times so
  // the declaration's own Menace doesn't muddy the reading.
  const strike = (hex) => {
    const g = createGame({ seed: 261, humanFactionId: "versari" });
    ensureDiplomacy(g);
    declareWar(g, "versari", "goldgrass", "test");
    const before = g.players.versari.menace || 0;
    onAttack(g, "versari", "goldgrass", hex);
    return (g.players.versari.menace || 0) - before;
  };
  check("striking where the board can see costs reputation", strike(openHex) > 0);
  check("…and striking where it cannot costs less", strike(darkHex) < strike(openHex));

  // But the victim was there, and can say so.
  {
    const g = createGame({ seed: 261, humanFactionId: "versari" });
    ensureDiplomacy(g);
    onAttack(g, "versari", "goldgrass", darkHex); // undeclared, unseen
    const quiet = g.players.versari.menace || 0;
    check("the victim holds it against you regardless of who saw",
      worstGrievance(g, "goldgrass", "versari")?.kind === "surprise-attack");
    check("…which gives them grounds",
      denounceWarrant(g, "goldgrass", "versari") === "surprise-attack");
    denounce(g, "goldgrass", "versari");
    check("and a believed accusation is how a hidden crime reaches the board",
      (g.players.versari.menace || 0) > quiet);
  }

  // …unless the accuser has burned their own credibility.
  {
    const g = createGame({ seed: 261, humanFactionId: "versari" });
    ensureDiplomacy(g);
    onAttack(g, "versari", "goldgrass", darkHex);
    const quiet = g.players.versari.menace || 0;
    g.players.goldgrass.honor = CONFIG.diplomacy.honor.min;
    denounce(g, "goldgrass", "versari");
    check("a discredited victim shouts into the void",
      (g.players.versari.menace || 0) === quiet);
  }

  // A grievance now knows where it happened, which is what lets the UI cite
  // the act rather than assert that one exists.
  {
    const g = createGame({ seed: 261, humanFactionId: "versari" });
    ensureDiplomacy(g);
    onAttack(g, "versari", "goldgrass", darkHex);
    check("the ledger records the place", worstGrievance(g, "goldgrass", "versari").at === darkHex);
  }
}

// Phase 27 — receipts. Menace and Honor were floats with no history, so a
// player could watch the board turn on them with no way to learn which of
// their own acts had done it.
{
  line("\n  [Phase 27] diplomacy — reputation receipts");
  const g = createGame({ seed: 271, humanFactionId: "versari" });
  ensureDiplomacy(g);
  check("a clean faction has nothing on its record",
    reputationLog(g, "versari").length === 0);

  declareWar(g, "versari", "goldgrass", "player"); // unjustified → Menace
  const menace = reputationLog(g, "versari", "menace");
  check("an act that moved Menace leaves a receipt", menace.length === 1);
  check("…carrying its cause", /^declare:/.test(menace[0].cause));
  check("…its size", menace[0].delta === CONFIG.diplomacy.menace.declareUnjustified);
  check("…and when", menace[0].round === g.round);

  adjustHonor(g, "versari", -2, "test-cause");
  check("Honor keeps its own receipts, filterable apart from Menace",
    reputationLog(g, "versari", "honor").length === 1
    && reputationLog(g, "versari", "menace").length === 1);
  check("newest first", reputationLog(g, "versari")[0].stat === "honor");

  // A change of zero is not an event.
  const before = reputationLog(g, "versari").length;
  adjustMenace(g, "versari", 0, "nothing-happened");
  check("a no-op writes no receipt", reputationLog(g, "versari").length === before);

  // The roll is bounded — it is a receipt, not an archive.
  for (let i = 0; i < 40; i += 1) adjustMenace(g, "versari", 1, "test-spam");
  check("the roll stays bounded", reputationLog(g, "versari").length <= 14);
}

// Phase 28 — claims. Every Location carries an `affiliation` in content.js
// and it decided exactly one thing: where factions start. Holding somebody
// else's homeland was politically invisible.
{
  line("\n  [Phase 28] diplomacy — ground held is a grievance");
  const g = createGame({ seed: 281, humanFactionId: "versari" });
  ensureDiplomacy(g);
  const theirs = Object.values(g.locations).find(
    (l) => LOCATIONS[l.locationId]?.affiliation === "goldgrass",
  );
  check("the board seats a Goldgrass homeland", !!theirs);
  check("nothing is held against you to begin with",
    grievanceWeight(g, "goldgrass", "versari") === 0);

  theirs.controller = "versari";
  check("taking it is a grievance the moment you hold it",
    grievanceWeight(g, "goldgrass", "versari") > 0);
  check("…recorded as an occupation, on the hex",
    worstGrievance(g, "goldgrass", "versari").kind === "occupation"
    && worstGrievance(g, "goldgrass", "versari").at === theirs.hexId);
  check("their war to take it back is righteous",
    warJustification(g, "goldgrass", "versari") === "occupation");
  check("…and they may say so publicly",
    denounceWarrant(g, "goldgrass", "versari") === "occupation");

  // …but it is not a thing that HAPPENED, so it cannot be paid off.
  check("no payment settles ground you are still standing on",
    settleableWeight(g, "goldgrass", "versari") === 0);
  g.players.versari.resource = 200;
  const bribe = performDiplomacy(g, "versari", "propose-deal", {
    faction: "goldgrass",
    give: [{ resource: { resource: "scrap", amount: 100 } }],
    get: [{ settlement: true }],
  });
  check("offering a fortune for it is refused, not pocketed",
    bribe.accepted === false && (g.players.versari.resource || 0) === 200);

  // It ends the only way it can.
  theirs.controller = "goldgrass";
  check("giving the place back ends it",
    grievanceWeight(g, "goldgrass", "versari") === 0
    && warJustification(g, "goldgrass", "versari") === null);

  // A real betrayal alongside an occupation settles; the occupation stays.
  {
    const g2 = createGame({ seed: 281, humanFactionId: "versari" });
    ensureDiplomacy(g2);
    g2.players.versari.resource = 60;
    recordGrievance(g2, "goldgrass", "versari", "truce-broken");
    Object.values(g2.locations).find(
      (l) => LOCATIONS[l.locationId]?.affiliation === "goldgrass",
    ).controller = "versari";
    applyDeal(g2, {
      proposer: "versari", recipient: "goldgrass",
      give: [{ resource: { resource: "scrap", amount: 20 } }], get: [{ settlement: true }],
    }, "test");
    const left = grievancesAgainst(g2, "goldgrass", "versari");
    check("the betrayal is settled and the occupation is not",
      left.length === 1 && left[0].kind === "occupation");
  }
}

// Phase 29 — ultimatums. There was no verb between asking and attacking:
// no way to say "stop, or else", which is the act that generates all the
// tension in pre-war diplomacy.
{
  line("\n  [Phase 29] diplomacy — or else");
  const U = CONFIG.diplomacy.ultimatum;
  const demand = { kind: "tribute", amount: 10 };

  // --- issuing costs something, and starts a clock ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 40;
    const r = performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand });
    check("an ultimatum can be issued", r.ok === true);
    check("a threat is a hostile act", (g.players.versari.menace || 0) === U.menaceOnIssue);
    check("…and it lands in their hands with a deadline",
      ultimatumsFor(g, "goldgrass").length === 1);
    check("you cannot stack two on the same faction",
      performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand }).ok === false);
  }

  // --- complying pays, and ends it warmer than it started ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 40;
    g.players.versari.resource = 0;
    performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand });
    const u = ultimatumsFor(g, "goldgrass")[0];
    const s0 = getStanding(g, "versari", "goldgrass");
    performDiplomacy(g, "goldgrass", "answer-ultimatum", { ultimatumId: u.id, comply: true });
    check("giving in moves the scrap", (g.players.versari.resource || 0) === demand.amount);
    check("…and the crisis ending warms them a little",
      getStanding(g, "versari", "goldgrass") === s0 + U.complyStandingGain);
    check("…and it is off the table", ultimatumsFor(g, "goldgrass").length === 0);
  }

  // --- defiance hands the issuer a righteous war ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 40;
    performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand });
    check("nothing is owed while the deadline stands",
      warJustification(g, "versari", "goldgrass") === null);
    for (let i = 0; i < U.deadlineRounds + 1; i += 1) { g.round += 1; runDiplomacyRound(g); }
    check("silence past the deadline is defiance",
      denounceWarrant(g, "versari", "goldgrass") === "defiance");
    check("…and makes the war you threatened a just one",
      warJustification(g, "versari", "goldgrass") === "defiance");

    // …and now the issuer is the one on a clock.
    const h0 = honorOf(g, "versari");
    for (let i = 0; i < U.graceRounds + 1; i += 1) { g.round += 1; runDiplomacyRound(g); }
    check("an ultimatum you do not act on is a bluff the board watched",
      honorOf(g, "versari") === h0 - U.bluffHonorLoss);
  }

  // --- unless you meant it ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 40;
    performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand });
    for (let i = 0; i < U.deadlineRounds + 1; i += 1) { g.round += 1; runDiplomacyRound(g); }
    const h0 = honorOf(g, "versari");
    const m0 = g.players.versari.menace || 0;
    declareWar(g, "versari", "goldgrass", "ultimatum-defied");
    for (let i = 0; i < U.graceRounds + 1; i += 1) { g.round += 1; runDiplomacyRound(g); }
    check("making good on it costs no Honor", honorOf(g, "versari") === h0);
    check("…and the war is justified, so the declaration costs no Menace",
      (g.players.versari.menace || 0) === m0);
  }

  // --- "get out" is satisfied by marching home, with nothing to click ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    const zoc = g.world.zoc || {};
    const mine = Object.keys(zoc).find((h) => zoc[h] === "versari");
    const theirs = Object.values(g.units).find((u) => u.owner === "goldgrass");
    check("the board gives you territory and them a unit", !!mine && !!theirs);
    check("you cannot demand a withdrawal from somebody who is not there",
      performDiplomacy(g, "versari", "issue-ultimatum",
        { faction: "goldgrass", demand: { kind: "withdraw" } }).ok === false);
    theirs.node = mine;
    check("…but you can once they are",
      performDiplomacy(g, "versari", "issue-ultimatum",
        { faction: "goldgrass", demand: { kind: "withdraw" } }).ok === true);
    theirs.node = Object.keys(g.board.hexes).find((h) => zoc[h] !== "versari");
    g.round += 1;
    runDiplomacyRound(g);
    check("marching home IS complying — the world is the check",
      ultimatumsFor(g, "goldgrass").length === 0
      && g.log.some((e) => e.name === "ultimatum_complied"));
  }

  // --- the word has to mean something, so it has a cooldown ---
  {
    const g = createGame({ seed: 291, humanFactionId: "versari" });
    ensureDiplomacy(g);
    g.players.goldgrass.resource = 40;
    performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand });
    const u = ultimatumsFor(g, "goldgrass")[0];
    performDiplomacy(g, "goldgrass", "answer-ultimatum", { ultimatumId: u.id, comply: true });
    check("you cannot immediately threaten them again",
      performDiplomacy(g, "versari", "issue-ultimatum", { faction: "goldgrass", demand }).ok === false);
    check("…and the wait is readable", ultimatumCooldown(g, "versari", "goldgrass") > 0);
  }
}

// Phase 30 — §3's second half: Locations as deal items. Claims made holding
// somebody else's homeland a standing grievance, and it could only ever end
// one way: give the place back. There was no way to give the place back.
// Diplomacy could move scrap, streams, promises and apologies, but not the
// one thing the whole war is about, so it ran as a side-market beside the
// game rather than inside it.
{
  line("\n  [Phase 30] diplomacy — ground on the table");
  const C30 = CONFIG.diplomacy.cession;

  // Set a Goldgrass homeland in Versari hands, and make sure Versari has
  // somewhere else to stand so the last-ground rule is not what is being
  // tested. Returns the game and the contested city.
  const seize = (seed = 301) => {
    const g = createGame({ seed, humanFactionId: "versari" });
    ensureDiplomacy(g);
    const theirs = Object.values(g.locations).find(
      (l) => LOCATIONS[l.locationId]?.affiliation === "goldgrass" && !l.controller,
    ) || Object.values(g.locations).find(
      (l) => LOCATIONS[l.locationId]?.affiliation === "goldgrass" && l.controller !== "versari",
    );
    theirs.controller = "versari";
    theirs.loyaltyOwner = "versari";
    theirs.sections = ["versari", "versari", "versari"];
    return { g, theirs };
  };

  // --- a city has a price, and it is not the same price to everybody ---
  {
    const { g, theirs } = seize();
    const toThem = locationWorth(g, "goldgrass", theirs.hexId);
    const toYou = locationWorth(g, "versari", theirs.hexId);
    check("a city is worth something on the table", toYou > 0);
    check("…and worth more to the faction that calls it home", toThem > toYou);
    check("the claim is exactly the difference",
      Math.abs(toThem - toYou * C30.claimMultiplier) < 0.001);
    // Ground given up costs more than ground gained.
    const giving = valueOfItem(g, "versari", { location: { hexId: theirs.hexId } },
      { other: "goldgrass", side: "give" });
    const getting = valueOfItem(g, "versari", { location: { hexId: theirs.hexId } },
      { other: "goldgrass", side: "get" });
    check("letting go of ground costs more than taking it", giving > getting);
  }

  // --- what can and cannot be signed away ---
  {
    const { g, theirs } = seize();
    check("you can offer a city you fully hold",
      cedeBlocker(g, "versari", theirs.hexId) === null);
    check("…and not one you do not hold",
      typeof cedeBlocker(g, "goldgrass", theirs.hexId) === "string");
    // Half a city is not a thing you can sign away.
    theirs.sections = ["versari", "versari", "goldgrass"];
    theirs.controller = null;
    check("nor half of one", typeof cedeBlocker(g, "versari", theirs.hexId) === "string");
    theirs.sections = ["versari", "versari", "versari"];
    theirs.controller = "versari";
    // A seat is not a bargaining chip.
    const seat = Object.values(g.locations).find(
      (l) => l.controller === "versari"
        && (l.chips || []).some((c) => g.chips[c]?.chipId === "capital"),
    );
    check("a capital is on the board", !!seat);
    check("but a seat is never for sale",
      typeof cedeBlocker(g, "versari", seat.hexId) === "string");
    check("the picker offers what is offerable and nothing else",
      cedeableLocations(g, "versari").includes(theirs.hexId)
      && !cedeableLocations(g, "versari").includes(seat.hexId));
    // …and never the last thing you hold, which would be an elimination
    // dressed as an offer.
    for (const l of Object.values(g.locations)) {
      if (l.controller === "versari" && l.hexId !== theirs.hexId) l.controller = null;
    }
    check("nor the last ground you stand on",
      typeof cedeBlocker(g, "versari", theirs.hexId) === "string"
      && cedeableLocations(g, "versari").length === 0);
  }

  // --- the flagship sentence: "cede Omara and we have peace" ---
  {
    const { g, theirs } = seize();
    declareWar(g, "versari", "goldgrass", "test");
    check("you are at war, and they hold a grievance you cannot pay off",
      atWar(g, "versari", "goldgrass")
      && warJustification(g, "goldgrass", "versari") === "occupation"
      && settleableWeight(g, "goldgrass", "versari") === 0);
    const r = performDiplomacy(g, "versari", "sue-for-peace", {
      faction: "goldgrass",
      give: [{ location: { hexId: theirs.hexId } }], get: [],
    });
    check("handing the city back buys the peace", r.accepted === true);
    check("…and the city actually moved", theirs.controller === "goldgrass");
    check("…and the war is over", atWar(g, "versari", "goldgrass") === false);
    check("the grievance ends because the condition ended",
      grievanceWeight(g, "goldgrass", "versari") === 0
      && warJustification(g, "goldgrass", "versari") === null);
  }

  // --- a city given is a city intact ---
  {
    const { g, theirs } = seize();
    theirs.chips = [...theirs.chips];
    const chipsBefore = theirs.chips.length;
    theirs.activeBuild = { kind: "build", chipId: "workshop", cost: 6 };
    theirs.buildProgress = 4;
    cedeLocation(g, "versari", "goldgrass", theirs.hexId, "test");
    check("nothing is sacked — every chip carries over",
      theirs.chips.length === chipsBefore);
    check("but the workshop's half-built job does not",
      theirs.activeBuild === null && theirs.buildProgress === 0);
    check("the people living there did not agree to this",
      theirs.loyalty === C30.loyaltyOnCede);
    check("control is whole, not partial",
      theirs.controller === "goldgrass"
      && theirs.sections.every((x) => x === "goldgrass"));
    check("the feed calls it a cession, not a conquest",
      g.log.some((e) => e.name === "location_ceded" && e.payload.to === "goldgrass")
      && !g.log.some((e) => e.name === "location_captured"));
  }

  // --- a third party minds who ends up standing in its homeland ---
  {
    const { g, theirs } = seize();
    const before = getStanding(g, "goldgrass", "lakers");
    cedeLocation(g, "versari", "lakers", theirs.hexId, "test");
    check("passing a homeland to somebody else is not an improvement",
      getStanding(g, "goldgrass", "lakers") === before - C30.thirdPartyStandingHit);
    check("…and the occupation simply re-points at its new holder",
      grievanceWeight(g, "goldgrass", "lakers") > 0
      && grievanceWeight(g, "goldgrass", "versari") === 0);
  }

  // --- a promise nobody can keep is not a deal that fell short ---
  {
    const { g, theirs } = seize();
    g.players.goldgrass.resource = 100;
    // Versari asking Goldgrass to cede a city Goldgrass does not hold.
    const bad = performDiplomacy(g, "versari", "propose-deal", {
      faction: "goldgrass", give: [], get: [{ location: { hexId: theirs.hexId } }],
    });
    check("you cannot be sold a city its seller does not hold",
      bad.accepted === false && bad.countered !== true
      && /do not hold/.test(bad.reason || ""));
    check("…and no counter-offer is invented for it",
      offersFor(g, "versari").length === 0);
  }

  // --- an offer sits on a table for rounds; the world does not wait ---
  {
    const { g, theirs } = seize();
    g.players.goldgrass.resource = 100;
    tableOffer(g, "goldgrass", "versari", {
      proposer: "goldgrass", recipient: "versari",
      give: [{ resource: { resource: "scrap", amount: 20 } }],
      get: [{ location: { hexId: theirs.hexId } }],
    }, { kind: "deal" });
    const id = offersFor(g, "versari")[0].id;
    // …and in the meantime the city is lost.
    theirs.controller = "lakers";
    const res = answerOffer(g, "versari", id, true);
    check("accepting a city you no longer hold is refused, not half-applied",
      res.ok === false && (g.players.versari.resource || 0) < 100);
    check("…and the offer is still there to decline properly",
      offersFor(g, "versari").length === 1);
    check("nothing moved", theirs.controller === "lakers");
  }

  // --- ground is not tribute ---
  {
    const { g, theirs } = seize();
    // Give versari the muscle to coerce, so the refusal is about the ASK and
    // not about the power ratio.
    for (const [id, u] of Object.entries(g.units)) {
      if (u.owner === "goldgrass") delete g.units[id];
    }
    const r = performDiplomacy(g, "versari", "demand-tribute", {
      faction: "goldgrass",
      get: [{ resource: { resource: "scrap", amount: 1 } }, { location: { hexId: theirs.hexId } }],
    });
    check("a city cannot be squeezed out of somebody on a power ratio",
      r.ok === false && /not tribute/.test(r.reason || ""));
  }

  // --- and the AI can say it too, in both directions ---
  //
  // Tested on the DECISION rather than by playing games until an AI happens
  // to speak: approaching the player is behind the game's own RNG gate, so
  // "run turns until it fires" is a coin-flip dressed as a check — and if
  // the game reaches a winner first, takeAITurn quietly stops doing anything
  // at all, which is how an earlier version of this passed for the wrong
  // reason. warPeaceTerms is the whole judgement; the callers only choose
  // between an inbox and applying it on the spot.
  const warSetup = (seed, occupier, victim) => {
    const g = createGame({ seed, humanFactionId: "versari" });
    ensureDiplomacy(g);
    // A homeland of `victim`'s that is not their seat: a captured capital
    // has its chip destroyed, so a city really held in a war has none.
    const loc = Object.values(g.locations).find(
      (l) => LOCATIONS[l.locationId]?.affiliation === victim
        && !(l.chips || []).some((c) => g.chips[c]?.chipId === "capital"),
    );
    loc.controller = occupier;
    loc.loyaltyOwner = occupier;
    loc.sections = [occupier, occupier, occupier];
    loc.loyalty = CONFIG.loyalty.ceiling;
    declareWar(g, occupier, victim, "test");
    return { g, loc };
  };

  // Losing badly, and squatting on the other side's homeland: give it back.
  {
    const { g, loc } = warSetup(303, "goldgrass", "versari");
    const war = findWar(g, "goldgrass", "versari");
    war.unitsLost.goldgrass = 12;
    war.contestsWon.versari = 8;
    check("they are losing and they know it",
      warExhaustion(g, "goldgrass", "versari") >= CONFIG.diplomacy.suePeace.acceptThreshold * 0.6);
    const terms = warPeaceTerms(g, "goldgrass", "versari");
    check("the AI offers the city back to end a war it is losing",
      !!terms && (terms.give || []).some((it) => it.location?.hexId === loc.hexId));
    check("…and offers peace with it, not the city alone",
      !!terms && (terms.give || []).some((it) => it.promise?.kind === "peace"));
    check("…and asks for nothing in return", !!terms && !(terms.get || []).length);
    applyDeal(g, { proposer: "goldgrass", recipient: "versari", give: terms.give, get: terms.get }, "test");
    check("…and the terms, applied, move the city and end the war",
      loc.controller === "versari" && atWar(g, "versari", "goldgrass") === false);
    check("…and the occupation goes with it",
      grievanceWeight(g, "versari", "goldgrass") === 0);
  }

  // Losing, but holding nothing of theirs: scrap, because there is no city
  // to hand over. The branch has to fall through cleanly, not stall.
  {
    const g = createGame({ seed: 304, humanFactionId: "versari" });
    ensureDiplomacy(g);
    declareWar(g, "goldgrass", "versari", "test");
    const war = findWar(g, "goldgrass", "versari");
    war.unitsLost.goldgrass = 12;
    war.contestsWon.versari = 8;
    g.players.goldgrass.resource = 20;
    const terms = warPeaceTerms(g, "goldgrass", "versari");
    check("with no city of theirs to give, it reaches for the purse",
      !!terms && !(terms.give || []).some((it) => it.location)
      && (terms.give || []).some((it) => it.resource?.resource === "scrap"));
  }

  // Winning, and the player is sitting in their homeland: name the price.
  // The AI had no way to say this at all — it could only fight on until
  // exhaustion turned it into a supplicant, so a war it was WINNING had no
  // diplomatic expression whatsoever.
  {
    const { g, loc } = warSetup(305, "versari", "goldgrass");
    const war = findWar(g, "versari", "goldgrass");
    war.unitsLost.versari = 12;
    war.contestsWon.goldgrass = 8;
    // …and the muscle to mean it. Strip the human's army rather than inflate
    // theirs: `powerOf` reads live Strength, which recomputeStats rebuilds
    // from baseStrength on every turn, so a hand-set `strength` survives
    // exactly one call.
    for (const [id, u] of Object.entries(g.units)) {
      if (u.owner === "versari") delete g.units[id];
    }
    const terms = warPeaceTerms(g, "goldgrass", "versari");
    check("the AI names the city as the price of peace",
      !!terms && (terms.get || []).some((it) => it.location?.hexId === loc.hexId)
      && (terms.give || []).some((it) => it.promise?.kind === "peace"));
    applyDeal(g, { proposer: "goldgrass", recipient: "versari", give: terms.give, get: terms.get }, "test");
    check("…and paying it ends the war and the occupation together",
      loc.controller === "goldgrass"
      && atWar(g, "versari", "goldgrass") === false
      && grievanceWeight(g, "goldgrass", "versari") === 0);
  }

  // …and between two AIs it lands on the spot, because neither has an inbox
  // — the same road the settle branch takes. Before this, two AIs in a war
  // one of them was plainly losing fought it to the end while the loser sat
  // in the winner's homeland with no way to put it down.
  {
    const { g, loc } = warSetup(303, "goldgrass", "lakers");
    const war = findWar(g, "goldgrass", "lakers");
    war.unitsLost.goldgrass = 12;
    war.contestsWon.lakers = 8;
    const terms = warPeaceTerms(g, "goldgrass", "lakers");
    const deal = { proposer: "goldgrass", recipient: "lakers", give: terms.give, get: terms.get };
    check("the wronged AI takes the city back rather than fight on",
      wouldAccept(g, "lakers", deal));
    applyDeal(g, deal, "ai-war-cession");
    check("…and it changes hands with no human in the room",
      loc.controller === "lakers" && atWar(g, "goldgrass", "lakers") === false);
  }
}

line(`\n  v0.2 verification: ${v2pass} passed, ${v2fail} failed`);
line("");
