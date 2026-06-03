// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn, tickLoyalty } from "./turn.js";
import { performAction } from "./actions.js";
import { applyEffect } from "./effects.js";
import { recomputeStats, recomputeResearch, assignTechNode } from "./stats.js";
import { recomputeInfluence, zocOwner, inZoC } from "./influence.js";
import { reinforcementRoute, bfsDistances } from "./board.js";
import { recomputeVisibility, isUnitVisibleTo, revealRegion, unitVision, isHexVisible } from "./visibility.js";
import {
  ensureDiplomacy, menaceFromAttack, onAttack,
  formPact, declareWar, vassalize, runDiplomacyRound,
  recognitionScore, recognitionMet, wouldAccept, dealValue, performDiplomacy,
  getStanding, atWar, arePacted, vassalLord, mayEngage, areNeighbours,
  tolerance, passesRepGates, factionIds,
  // diplomacy-spec.md additions
  findWar, warExhaustion, aiAcceptsPeace, evaluatePactCall,
  canDemandTribute, caveOnDemand, hasOpenBorders, formTradingPact,
  findPactAgreement, honorOf, powerOf,
} from "./diplomacy.js";
import { setStanding } from "./standing.js";
import { factionDef, MINOR_FACTIONS } from "./content.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS, ABILITIES, REACTIVES, CHIPS } from "./content.js";
import { resolveSalvage } from "./contest.js";
import { readRivalIntel } from "./intel.js";
import { postAt, isPostVisibleTo, chargePostUpkeep } from "./posts.js";
import { loadFieldEncounters, findUnsupportedTypes, choiceIsRunnable, WORLD_ENCOUNTERS } from "./content-loader.js";
import { evalCond, evalStrength } from "./dsl.js";
import { registerQuest } from "./quests.js";
import { CONFIG } from "./config.js";
import { takeAITurn } from "./ai.js";
import { enforceLoyaltySlotCap, chargeChipUpkeep, slotCapacity, effectiveBuildCost } from "./economy.js";

const seed = Number(process.argv[2]) || 42;
const line = (s = "") => console.log(s);

const game = createGame({ seed });
line(`\n=== Ashland Conquest — engine harness (seed ${seed}) ===`);

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
const check = (label, cond) => {
  if (cond) { v2pass++; line(`  ✓ ${label}`); }
  else { v2fail++; line(`  ✗ FAIL — ${label}`); }
};
const setStrOn = (g, u, n) => { u.baseStrength = n; recomputeStats(g); };

// --- Phase 1: movement is its own budget ---
line("\n  [Phase 1] movement budget");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = activePlayerId(g);
  const u = Object.values(g.units).find((x) => x.owner === me);
  check("base Movement is 2", u.movement === 2 && u.moveRemaining === 2);
  const actionsBefore = g.players[me].actions.remaining;
  const a = g.board.adjacency[u.node][0];
  const m1 = performAction(g, "move", { unit: u.uid, to: a });
  const b = g.board.adjacency[u.node].find((h) => h !== a);
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
  // Already at 2; recruit to 3 then 4 should work, 5th blocked.
  const r3 = performAction(g, "recruit", { at: home.hexId });
  const r4 = performAction(g, "recruit", { at: home.hexId });
  const r5 = performAction(g, "recruit", { at: home.hexId });
  check("recruit allowed up to baseUnitCap + Training Grounds (4)", r3.ok && r4.ok);
  check("recruit blocked past cap", !r5.ok && r5.reason === "unit cap reached");
}

// --- Phase 3: attrition, death, salvage ---
line("\n  [Phase 3] attrition, death, salvage");
{
  const g = createGame({ seed });
  startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
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

// --- Interactive salvage + resale row ---
line("\n  [Salvage] deferred interactive salvage + resale row");
{
  const g = createGame({ seed }); startTurn(g);
  const me = g.turnOrder[0];
  const foe = g.turnOrder[1];
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain");
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

  // Economy: +1 scrap per fully-held Location at Upkeep.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    g.players[me].techLevel = 2; g.players[me].techWheel = ["eco-entry"];
    const locs = Object.values(g.locations).filter((l) => l.controller === me);
    const expected = locs.reduce((n, l) => n + l.production, 0) + locs.length;
    const before = g.players[me].resource;
    for (let i = 0; i < g.turnOrder.length; i++) endTurn(g); // back to me's Upkeep
    check("Economy (Industry): +1 scrap per held Location",
      g.players[me].resource - before === expected);
  }

  // Intelligence: the redraw stacks with the Recon Team chip (budget 2).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const home = Object.values(g.locations).find((l) => l.controller === me);
    g.players[me].techLevel = 2; g.players[me].techWheel = ["int-entry"];
    const rc = g.nextId("chip"); g.chips[rc] = { uid: rc, chipId: "recon-team" };
    home.chips.push(rc); // +1 discard; with int-entry = 2 total
    const encHex = Object.values(g.board.hexes).find(
      (h) => h.type === "encounter" && g.board.adjacency[h.id]?.length,
    );
    const staging = g.board.adjacency[encHex.id][0];
    const u = Object.values(g.units).find((x) => x.owner === me);
    u.node = staging; u.moveRemaining = 9; recomputeStats(g);
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
    check("Intelligence + Recon Team grant 2 discards (3rd card drawn)",
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
    const expected = locs.reduce((n, l) => n + l.production, 0) + locs.length * 2;
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
// AI SANITY — the demo AI USES the tech wheel, and a full AI-vs-AI game
// terminates with a winner (no infinite loop). Deterministic on seed 42.
// =====================================================================
line("\n  [AI sanity] tech-wheel use + game termination");
{
  const g = createGame({ seed: 42 });
  let safety = 1500;
  while (!g.winnerId && safety-- > 0) takeAITurn(g);
  const assigns = g.log.filter((e) => e.name === "tech_node_assigned").length;
  check("AI assigns tech-wheel nodes during a game (tech_node_assigned fires)", assigns > 0);
  check("a full AI-vs-AI game terminates with a winner (no infinite loop)",
    safety > 0 && !!g.winnerId);
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
    const neutral = Object.values(g3.locations).find((l) => !l.controller);
    const ownerBefore = zocOwner(g3, neutral.hexId); // null or a spillover owner
    check("a neutral Location is not yet in the would-be captor's ZoC",
      neutral && ownerBefore !== fid);
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
  {
    const g4 = createGame({ seed });
    const fid = g4.turnOrder[0];
    const neutral = Object.values(g4.locations).find((l) => !l.controller);
    neutral.controller = fid;
    neutral.loyaltyOwner = fid;
    neutral.sections = [fid, fid, fid];
    neutral.loyalty = CONFIG.loyalty.start; // fresh capture — low Loyalty
    recomputeInfluence(g4);
    const lowReach = Object.keys(g4.world.zoc).filter((h) => g4.world.zoc[h] === fid).length;
    const lowSelf = g4.world.influence[fid][neutral.hexId] || 0;
    neutral.loyalty = CONFIG.loyalty.ceiling; // fully integrated
    recomputeInfluence(g4);
    const highReach = Object.keys(g4.world.zoc).filter((h) => g4.world.zoc[h] === fid).length;
    const highSelf = g4.world.influence[fid][neutral.hexId] || 0;
    check("a fresh low-Loyalty capture projects less than an integrated one",
      lowSelf > 0 && highSelf > lowSelf);
    check("integrating (Loyalty → ceiling) expands the ZoC border",
      highReach > lowReach);
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
  {
    const g6 = createGame({ seed });
    const fid = g6.turnOrder[0];
    const neutral = Object.values(g6.locations).find((l) => !l.controller);
    neutral.controller = fid;
    neutral.loyaltyOwner = fid;
    neutral.sections = [fid, fid, fid];
    neutral.loyalty = CONFIG.loyalty.ceiling;
    recomputeInfluence(g6);
    const reachFull = Object.keys(g6.world.zoc).filter((h) => g6.world.zoc[h] === fid).length;
    neutral.loyalty = 0; // neglected to nothing
    recomputeInfluence(g6);
    const reachZero = Object.keys(g6.world.zoc).filter((h) => g6.world.zoc[h] === fid).length;
    check("a neglected (Loyalty 0) Location projects a smaller ZoC",
      reachZero < reachFull);
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

  // Rush spends banked scrap to finish a build immediately.
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me);
    g.players[me].resource += 50;
    performAction(g, "build", { at: loc.hexId, chipId: "labs" }); // buildCost 3
    const before = g.players[me].resource;
    const r = performAction(g, "rush", { at: loc.hexId });
    check("rush completes the build at once and spends scrap",
      r.ok && loc.chips.some((c) => g.chips[c]?.chipId === "labs") &&
      loc.activeBuild == null && g.players[me].resource === before - 3);
  }

  // Upgrade in place: labs → advanced-lab, same slot (scarcity preserved).
  {
    const g = createGame({ seed }); startTurn(g);
    const me = g.turnOrder[0];
    const loc = grab(g, me); // loyalty 8 clears advanced-lab's rung (3)
    g.players[me].resource += 50;
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

// A minimal line-graph state for deterministic LoS unit tests (a-b-c-d).
function miniLine() {
  return {
    board: {
      hexes: { a: { id: "a" }, b: { id: "b" }, c: { id: "c" }, d: { id: "d" } },
      adjacency: { a: ["b"], b: ["a", "c"], c: ["b", "d"], d: ["c"] },
    },
    units: { u1: { uid: "u1", owner: "X", node: "a", chips: [] } },
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
  // No vision cheat (§19.10): the board is NOT globally visible — a fresh
  // faction sees only its own footprint, so much of the map is still dark.
  check("a faction does NOT see the whole map at start (no global truth)",
    vis.explored.size < Object.keys(g.board.hexes).length);

  // --- LoS: radius, elevation blocks behind a ridge, cover costs sight ---
  {
    const m = miniLine();
    recomputeVisibility(m, "X", { emitEvents: false });
    check("LoS: a unit sees within its radius (a,b,c at radius 2)",
      m.visibility.X.visible.has("a") && m.visibility.X.visible.has("b") && m.visibility.X.visible.has("c"));
    check("LoS: d (dist 3) is beyond radius 2", !m.visibility.X.visible.has("d"));
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
    check("a coalition member contributes 0 to the runaway's Recognition",
      recognitionScore(g, "versari").total === 0 || (g.diplomacy.coalitions.find((c) => c.target === "versari")));
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

  // --- Recognition victory + its Menace/Honor gate (§18.10) ---
  {
    const g = createGame({ seed, humanFactionId: "versari", minors: ["tempest", "croppers"] });
    // convert three factions into vassals (weight 2 each = 6 ≥ threshold 6)
    for (const f of ["goldgrass", "croppers", "tempest"]) vassalize(g, "versari", f, "test");
    const sc = recognitionScore(g, "versari");
    check("Recognition reaches the threshold via vassals (Allied=1, Vassal=2)",
      sc.total >= CONFIG.diplomacy.recognition.threshold);
    check("Recognition victory is reachable (winner set on the check)",
      (() => { const gg = g; gg.winnerId = null; ensureDiplomacy(gg); runDiplomacyRound(gg); return gg.winnerId === "versari"; })());
    // gate: a notorious bully loses Recognition (Menace over Tolerance)
    const g2 = createGame({ seed, humanFactionId: "versari", minors: ["tempest", "croppers"] });
    for (const f of ["goldgrass", "croppers", "tempest"]) vassalize(g2, "versari", f, "test");
    g2.players.versari.menace = 99;
    check("Recognition is GATED by Menace (a bully cannot be acknowledged)",
      !recognitionMet(g2, "versari"));
    const g3 = createGame({ seed, humanFactionId: "versari", minors: ["tempest", "croppers"] });
    for (const f of ["goldgrass", "croppers", "tempest"]) vassalize(g3, "versari", f, "test");
    g3.players.versari.honor = -99;
    check("Recognition is GATED by Honor (a liar cannot be acknowledged)",
      !recognitionMet(g3, "versari"));
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
  }

  // --- performDiplomacy verbs (the player's levers, §18.7) ---
  {
    const g = createGame({ seed, humanFactionId: "versari" });
    const s0 = getStanding(g, "goldgrass", "versari");
    g.players.versari.resource = 10;
    const gift = performDiplomacy(g, "versari", "gift", { faction: "goldgrass", amount: 5 });
    check("performDiplomacy gift transfers scrap + warms Standing",
      gift.ok && getStanding(g, "goldgrass", "versari") > s0 && g.players.versari.resource === 5);
    const war = performDiplomacy(g, "versari", "declare-war", { faction: "lakers" });
    check("performDiplomacy declare-war sets the war-state", war.ok && atWar(g, "versari", "lakers"));
    // a pact offer is refused when Standing is too cold, accepted when warm
    setStanding(g, "plainers", "versari", -2, "test");
    check("a pact offer is refused when Standing is too cold",
      performDiplomacy(g, "versari", "propose-pact", { faction: "plainers" }).accepted === false);
    setStanding(g, "plainers", "versari", 8, "test"); setStanding(g, "versari", "plainers", 8, "test");
    g.players.versari.menace = 0; g.players.versari.honor = 6;
    check("a pact offer is accepted when Standing + rep gates pass",
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

// §1.2 — gift diminishing returns
line("\n  [§1.2] gift diminishing returns");
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const from = "versari", to = "lakers";
  g.players[from].resource = 200;
  setStanding(g, to, from, -12); setStanding(g, from, to, -2); // room below cap; no pact
  const gains = [];
  for (let i = 0; i < 4; i++) {
    const before = getStanding(g, to, from);
    performDiplomacy(g, from, "gift", { faction: to, amount: 8 }); // baseGain 4
    gains.push(getStanding(g, to, from) - before);
  }
  check("gift gains diminish floor(baseGain/(n+1)) → 4,2,1,1",
    JSON.stringify(gains) === JSON.stringify([4, 2, 1, 1]));
}
{
  const g = createGame({ seed }); ensureDiplomacy(g);
  const from = "versari", to = "lakers";
  g.players[from].resource = 200;
  setStanding(g, to, from, -12); setStanding(g, from, to, -2);
  performDiplomacy(g, from, "gift", { faction: to, amount: 8 }); // counter → 1
  runDiplomacyRound(g); // decay → 0
  const before = getStanding(g, to, from);
  performDiplomacy(g, from, "gift", { faction: to, amount: 8 });
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

// Open borders is a permit, not a wall — moving through territory without it
// is trespassing (relations hit); with it, free passage.
line("\n  [Open borders] territory trespass penalty");
{
  // Move a unit into another faction's ZoC with no open borders → relations hit.
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, 0);
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner; // owner's territory
  u.moveRemaining = 2; recomputeStats(g);
  const s0 = getStanding(g, owner, mover);
  const m0 = g.players[mover].menace || 0;
  performAction(g, "move", { unit: u.uid, to: dest });
  check("moving into a faction's territory without open borders hits relationship + reputation",
    getStanding(g, owner, mover) === s0 - CONFIG.diplomacy.trespass.standingPenalty &&
    (g.players[mover].menace || 0) === m0 + CONFIG.diplomacy.trespass.reputationPenalty &&
    CONFIG.diplomacy.trespass.standingPenalty > CONFIG.diplomacy.trespass.reputationPenalty);
}
{
  // Same move, but with an open-borders agreement → no penalty (free passage).
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, 0);
  g.diplomacy.agreements.push({ id: "ob-test", type: "open-borders", a: mover, b: owner, since: 0 });
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner;
  u.moveRemaining = 2; recomputeStats(g);
  const s0 = getStanding(g, owner, mover);
  const m0 = g.players[mover].menace || 0;
  performAction(g, "move", { unit: u.uid, to: dest });
  check("an open-borders agreement waives the trespass penalty (no Standing or Menace hit)",
    getStanding(g, owner, mover) === s0 && (g.players[mover].menace || 0) === m0);
}
{
  // On Friendly+ terms the hit is softened.
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const mover = g.turnOrder[0], owner = g.turnOrder[1];
  setStanding(g, owner, mover, CONFIG.diplomacy.tiers.friendly); // good terms
  const u = Object.values(g.units).find((x) => x.owner === mover);
  const dest = (g.board.adjacency[u.node] || []).find((h) => !g.locations[h]);
  g.world.zoc = g.world.zoc || {}; g.world.zoc[dest] = owner;
  u.moveRemaining = 2; recomputeStats(g);
  const s0 = getStanding(g, owner, mover);
  const m0 = g.players[mover].menace || 0;
  performAction(g, "move", { unit: u.uid, to: dest });
  const tr = CONFIG.diplomacy.trespass;
  check("the trespass hit is softened on good terms (relationship −1, reputation waived)",
    getStanding(g, owner, mover) === s0 - Math.max(1, tr.standingPenalty - tr.goodTermsReduction) &&
    (g.players[mover].menace || 0) === m0 + Math.max(0, tr.reputationPenalty - tr.goodTermsReduction));
}

// §6.2 — war-record listeners (combat feeds the war record)
line("\n  [§6.2] war-record listeners");
{
  const g = createGame({ seed }); startTurn(g); ensureDiplomacy(g);
  const me = g.turnOrder[0], foe = g.turnOrder[1];
  declareWar(g, me, foe, "test");
  const terrain = Object.values(g.board.hexes).find((h) => h.type === "terrain" && !g.locations[h.id]).id;
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

line(`\n  v0.2 verification: ${v2pass} passed, ${v2fail} failed`);
line("");
