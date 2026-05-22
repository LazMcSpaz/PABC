// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn } from "./turn.js";
import { performAction } from "./actions.js";
import { applyEffect } from "./effects.js";
import { recomputeStats } from "./stats.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS, ABILITIES, REACTIVES, CHIPS } from "./content.js";
import { resolveSalvage } from "./contest.js";
import { loadFieldEncounters, findUnsupportedTypes, choiceIsRunnable, WORLD_ENCOUNTERS } from "./content-loader.js";
import { evalCond, evalStrength } from "./dsl.js";
import { registerQuest } from "./quests.js";
import { CONFIG } from "./config.js";
import { takeAITurn } from "./ai.js";

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
line(`  -> controller ${prize.controller || "neutral"}, foothold ${prize.foothold}`);

// Raid: drop an enemy unit on the captured Location (no neutral sections
// remain, so raids are legal) and contest it directly.
const victim = Object.values(game.units).find((u) => u.owner !== me);
victim.node = prize.hexId;
const raid = performAction(game, "contest", { unit: champ.uid, target: victim.uid });
line(`  raid ${victim.uid} (owner ${victim.owner}): roll ${raid.initiatorTotal} vs ${raid.defenderTotal} -> ${raid.won ? "won" : "lost"}`);
line(`   ${victim.uid} now at ${victim.node}, base STR ${game.units[victim.uid]?.baseStrength ?? "destroyed"} (attrition + optional retreat)`);

// --- Layer 3.3 — Acquire + Activate + tech progression ---
line("\nMARKET / ACQUIRE  (Layer 3.3)");
applyEffect(game, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 30, target: "active_player" }, ctx);

// Pull a specific chip into a tier's face-up row by swapping out a
// non-protected chip — keeps the demo deterministic regardless of the
// seed's market shuffle. Chips passed through this helper are protected
// from later swaps, so multiple ensures stack without clobbering.
const protectedChipIds = new Set();
const ensureInRow = (tier, chipId) => {
  protectedChipIds.add(chipId);
  const m = game.market.tiers[tier];
  if (m.row.some((c) => game.chips[c]?.chipId === chipId)) return;
  const i = m.deck.findIndex((c) => game.chips[c]?.chipId === chipId);
  if (i < 0) return;
  const [pulled] = m.deck.splice(i, 1);
  const victimIdx = m.row.findIndex((c) => !protectedChipIds.has(game.chips[c]?.chipId));
  if (victimIdx < 0) { m.row.push(pulled); return; }
  const victim = m.row.splice(victimIdx, 1, pulled)[0];
  m.deck.push(victim);
};
const findChip = (tier, chipId) =>
  game.market.tiers[tier].row.find((c) => game.chips[c]?.chipId === chipId);

ensureInRow(1, "drilled-troops");
ensureInRow(1, "labs");
ensureInRow(2, "sharpened-blades");

line(`  tier 1 row: ${game.market.tiers[1].row.map((c) => game.chips[c].chipId).join(", ")}`);
line(`  champ STR ${champ.strength}; scrap ${game.players[me].resource}`);
const acq1 = performAction(game, "acquire", { chip: findChip(1, "drilled-troops"), into: { unit: champ.uid } });
line(`  acquire drilled-troops -> ${acq1.ok ? `ok (chip ${acq1.chip})` : "blocked — " + acq1.reason}`);
line(`  champ STR ${champ.strength}; scrap ${game.players[me].resource}`);

line(`\nTECH  versari tech ${game.players[me].tech}`);
performAction(game, "acquire", { chip: findChip(1, "labs"), into: { location: prize.hexId } });
ensureInRow(1, "labs"); // bring a second copy face-up
performAction(game, "acquire", { chip: findChip(1, "labs"), into: { location: prize.hexId } });
line(`  installed 2 Labs at ${LOCATIONS[prize.locationId].name} -> tech ${game.players[me].tech}`);

const acq2 = performAction(game, "acquire", { chip: findChip(2, "sharpened-blades"), into: { unit: champ.uid } });
line(`  acquire sharpened-blades (tier 2) -> ${acq2.ok ? "ok" : "blocked — " + acq2.reason}; champ STR ${champ.strength}`);

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
  const techBefore = game.players[me].tech;
  for (const eff of choice.effects) applyEffect(game, eff, ctx);
  const dr = (a, b) => `${a}->${b}`;
  line(`   active player ${me}: scrap ${dr(scrapBefore, game.players[me].resource)}, vp ${dr(vpBefore, game.players[me].vp)}, tech ${dr(techBefore, game.players[me].tech)}`);
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
const c1 = { op: "gte", left: "players.versari.tech", right: 1 };
line(`  versari.tech >= 1: ${evalCond(game, c1)}`);
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
  { op: "gt", left: "players.versari.tech", right: 5 }, 5,
  { op: "gt", left: "players.versari.tech", right: 2 }, 3,
  1,
] };
line(`  strength cascade by tech: ${evalStrength(game, s1)}`);

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
const techPre = game.players[me].tech;
const tracksPre = { ...game.players[me].tracks };
line(`  deck size before: ${deckBefore}; champ ${champ.uid} on ${stagingHex} → moves to encounter hex ${encounterHex.id}`);
const fe = performAction(game, "move", { unit: champ.uid, to: encounterHex.id });
line(`  move: ${fe.ok ? "ok" : "blocked — " + fe.reason}`);
line(`  deck size after: ${game.encounterDeck.length}; encounter discard: ${game.discards.encounter.length}; hex cooldown until round ${game.world.encounterHexCooldowns[encounterHex.id]}`);
const lastDelivered = [...game.log].reverse().find((e) => e.name === "encounter_delivered");
const lastResolved = [...game.log].reverse().find((e) => e.name === "encounter_resolved");
if (lastDelivered) line(`  delivered: ${lastDelivered.payload.encounter} → "${lastDelivered.payload.choiceLabel}"`);
if (lastResolved) line(`  resolved:  ${lastResolved.payload.encounter}`);
line(`  ${me} deltas: scrap ${scrapPre}→${game.players[me].resource}, tech ${techPre}→${game.players[me].tech}, tracks {trust ${tracksPre.trust}→${game.players[me].tracks.trust}, reputation ${tracksPre.reputation}→${game.players[me].tracks.reputation}, alignment ${tracksPre.alignment}→${game.players[me].tracks.alignment}}`);

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

  g.players[me].resource += 100;
  const acq = performAction(g, "acquire", { chip: c2, into: { unit: atk.uid } });
  check("resale chips are acquirable at full cost",
    acq.ok && atk.chips.includes(c2) && !g.resaleRow.includes(c2));
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

line(`\n  v0.2 verification: ${v2pass} passed, ${v2fail} failed`);
line("");
