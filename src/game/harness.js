// Headless harness — `node src/game/harness.js [seed]`. Builds a game,
// runs the turn loop, and exercises the effect library so each engine
// layer can be verified without the UI.
import { createGame } from "./setup.js";
import { startTurn, endTurn } from "./turn.js";
import { performAction } from "./actions.js";
import { applyEffect } from "./effects.js";
import { activePlayerId } from "./targeting.js";
import { FACTIONS, LOCATIONS, ABILITIES, REACTIVES } from "./content.js";
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
line(`   ${victim.uid} retreated to ${victim.node}, immobilizedUntil ${victim.immobilizedUntil}`);

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

ensureInRow(1, "new-recruits");
ensureInRow(1, "labs");
ensureInRow(2, "sharpened-blades");

line(`  tier 1 row: ${game.market.tiers[1].row.map((c) => game.chips[c].chipId).join(", ")}`);
line(`  champ STR ${champ.strength}; scrap ${game.players[me].resource}`);
const acq1 = performAction(game, "acquire", { chip: findChip(1, "new-recruits"), into: { unit: champ.uid } });
line(`  acquire new-recruits -> ${acq1.ok ? `ok (chip ${acq1.chip})` : "blocked — " + acq1.reason}`);
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

line(`\n  v0.2 verification: ${v2pass} passed, ${v2fail} failed`);
line("");
