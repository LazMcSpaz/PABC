// AI seats answer cards in character.
//
// Every AI faction used to answer every encounter and every quest beat with
// `choice 0` — the first eligible option, 134 multi-choice cards deep, without
// looking at what any of them granted. choicePolicy.js scores the options
// against the faction's authored temperament instead.
//
// The fixtures below are synthetic on purpose. Asserting against the real
// corpus would test the corpus as much as the policy, and would have to be
// rewritten every time a reward is tuned — which is exactly the thing the
// designer is now free to do from inside the game.
import { createGame } from "../src/game/setup.js";
import { startTurn } from "../src/game/turn.js";
import { pickChoice, valueChoice, setChoiceOverride, CHOICE_OVERRIDES, profileFor } from "../src/game/choicePolicy.js";
import { allQuestSources } from "../src/game/quests.js";
import { allEncounterSources } from "../src/game/encounters.js";
import { setPatch, clearPatch } from "../src/game/contentPatch.js";

let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "\n        " + d}`); };

const g = createGame({ seed: 1126, humanFactionId: "plainers" });
startTurn(g);
// One comparable unit each, so a CONTEST is priced the same for every seat and
// the difference in what they choose is temperament, not army size.
//
// This includes the minors, which are seeded variably and may field nothing at
// a given seed. That is not a detail to paper over: a faction with no army
// prices every fight as a near-certain loss and refuses it, which is correct
// and which is why the fixture has to hand out the army explicitly rather than
// assume one.
for (const f of ["lakers", "versari", "goldgrass", "plainers", "tempest", "croppers"]) {
  let u = Object.values(g.units).find((x) => x.owner === f);
  if (!u) {
    const hex = Object.keys(g.board.hexes)[0];
    u = { uid: `probe-${f}`, owner: f, node: hex, chips: [], veteran: false,
          fortified: false, actionsRemaining: 1 };
    g.units[u.uid] = u;
  }
  u.baseStrength = 4; u.strength = 4;
}
const pick = (f, cs, id = "test-card") => cs[pickChoice(g, f, id, cs)].id;

// --- 1. the warlord takes the fight the pacifist walks away from --------
{
  const cs = [
    { id: "fight", label: "Take the wall", effects: [
      { type: "CONTEST", opponentStrength: 4,
        onWin: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 8, target: "active" }],
        onLose: [{ type: "ADJUST_BASE_STRENGTH", amount: -99, target: "triggering-unit" }] }] },
    { id: "talk", label: "Pay them off", effects: [
      { type: "ADJUST_RESOURCE", resource: "Resource", amount: -3, target: "active" },
      { type: "ADJUST_STANDING", faction: "goldgrass", amount: 2, player: "active" }] },
  ];
  check("1. the Lakers (warlord) take the fight", pick("lakers", cs) === "fight",
    `chose ${pick("lakers", cs)}`);
  check("2. the Goldgrass (pacifist) pay instead", pick("goldgrass", cs) === "talk",
    `chose ${pick("goldgrass", cs)}`);
  check("3. …and a minor warlord inherits the character without being named",
    pick("tempest", cs) === "fight", `Clan Tempest chose ${pick("tempest", cs)}`);
}

// --- 2. the schemer buys leverage; the opportunist buys scrap -----------
{
  // `seen_apprentice` is read by real gates elsewhere in the corpus, so it is
  // a door. The scrap is worth more on the face of it.
  const cs = [
    { id: "cash", label: "Take the scrap", effects: [
      { type: "ADJUST_RESOURCE", resource: "Resource", amount: 4, target: "active" }] },
    { id: "leverage", label: "Take what they know", effects: [
      { type: "SET_PLAYER_FLAG", flag: "seen_apprentice", value: true, target: "active", duration: "permanent" },
      { type: "PEEK", deck: "encounterDeck", count: 3, target: "active" }] },
  ];
  check("4. the Versari (schemer) take the leverage over the money",
    pick("versari", cs) === "leverage", `chose ${pick("versari", cs)}`);
  check("5. the Free Plainers (opportunist) take the money",
    pick("plainers", cs) === "cash", `chose ${pick("plainers", cs)}`);
}

// --- 3. short-term thinking is a discount rate, not a special case ------
{
  // The same payoff, now or in three rounds. Nothing else differs.
  const cs = [
    { id: "now", label: "Take 5 now", effects: [
      { type: "ADJUST_RESOURCE", resource: "Resource", amount: 5, target: "active" }] },
    { id: "later", label: "Take 9 in three rounds", effects: [
      { type: "QUEUE_DEFERRED", delayRounds: 3, target: "active",
        effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 9, target: "active" }] }] },
  ];
  check("6. the opportunist takes the smaller sum today",
    pick("plainers", cs) === "now", `chose ${pick("plainers", cs)}`);
  check("7. the patient schemer waits for the larger one",
    pick("versari", cs) === "later", `chose ${pick("versari", cs)}`);
  check("8. patience is what separates them",
    profileFor("plainers").patience < profileFor("versari").patience,
    `plainers ${profileFor("plainers").patience} vs versari ${profileFor("versari").patience}`);
}

// --- 4. authored overrides win, but never break eligibility -------------
{
  const cs = [
    { id: "safe", label: "Withdraw", effects: [{ type: "ADJUST_RESOURCE", resource: "Resource", amount: 6, target: "active" }] },
    { id: "reckless", label: "Charge", effects: [{ type: "ADJUST_BASE_STRENGTH", amount: -2, target: "triggering-unit" }] },
  ];
  check("9. without an override the sensible option wins",
    pick("goldgrass", cs, "ov-card") === "safe", `chose ${pick("goldgrass", cs, "ov-card")}`);
  setChoiceOverride("ov-card", "goldgrass", "reckless");
  check("10. an authored override outranks the score",
    pick("goldgrass", cs, "ov-card") === "reckless", `chose ${pick("goldgrass", cs, "ov-card")}`);
  check("11. …and applies only to the faction it names",
    pick("versari", cs, "ov-card") === "safe", `versari chose ${pick("versari", cs, "ov-card")}`);
  // An override for a choice the content has gated away must not force it.
  setChoiceOverride("ov-card", "lakers", "not-on-offer");
  check("12. an override naming an ineligible choice is ignored, not forced",
    ["safe", "reckless"].includes(pick("lakers", cs, "ov-card")),
    `chose ${pick("lakers", cs, "ov-card")}`);
  delete CHOICE_OVERRIDES["ov-card"];
}

// --- 5. it holds up against the real corpus -----------------------------
{
  const cards = [];
  for (const q of Object.values(allQuestSources()))
    for (const b of q.beats || []) cards.push([`quest:${q.id}:beat:${b.id}`, b.choices]);
  const { field, world } = allEncounterSources();
  for (const m of [field, world]) for (const e of Object.values(m)) cards.push([e.id, e.choices]);

  const factions = ["lakers", "versari", "goldgrass", "plainers", "tempest", "croppers"];
  let bad = 0, decided = 0, split = 0, multi = 0;
  for (const [id, cs] of cards) {
    if (!cs?.length) continue;
    const picks = [];
    for (const f of factions) {
      const i = pickChoice(g, f, id, cs);
      if (!Number.isInteger(i) || i < 0 || i >= cs.length) bad++;
      picks.push(i);
    }
    decided++;
    if (cs.length > 1) { multi++; if (new Set(picks).size > 1) split++; }
  }
  check(`13. every card in the corpus decides for every faction (${decided} × ${factions.length})`,
    bad === 0, `${bad} returned an index outside the choice list`);
  check(`14. factions actually disagree — ${split} of ${multi} multi-choice cards`,
    split > 0, "every faction made identical choices; the profiles are not biting");

  // Determinism: a replay of a seed must make the same decisions.
  const twice = cards.map(([id, cs]) => (cs?.length ? pickChoice(g, "lakers", id, cs) : 0));
  const again = cards.map(([id, cs]) => (cs?.length ? pickChoice(g, "lakers", id, cs) : 0));
  check("15. the same card decides the same way twice", JSON.stringify(twice) === JSON.stringify(again),
    "the policy is not deterministic — replays would diverge");
}

// --- 6. malformed content degrades, it does not crash -------------------
{
  const cs = [
    { id: "a", label: "a", effects: [{ type: "NOT_A_REAL_EFFECT", nonsense: {} }] },
    { id: "b", label: "b" },                       // no effects at all
    { id: "c", label: "c", effects: null },
  ];
  let threw = null;
  try { pickChoice(g, "lakers", "junk", cs); } catch (e) { threw = e.message; }
  check("16. an unknown effect type is worth nothing, not an exception", !threw, threw);
}

// --- 7. the balance loop: an edit moves the decision --------------------
{
  // The point of scoring rather than authoring every pick. Retune a reward in
  // Content Edit Mode and AI seats respond to it.
  clearPatch(null);
  const cs = [
    { id: "small", label: "Take the small pile", effects: [
      { type: "ADJUST_RESOURCE", resource: "Resource", amount: 2, target: "active" }] },
    { id: "standing", label: "Leave it for them", effects: [
      { type: "ADJUST_STANDING", faction: "goldgrass", amount: 1, player: "active" }] },
  ];
  const before = pick("plainers", cs, "tune-card");
  const richer = [{ ...cs[0] }, { ...cs[1], effects: [
    { type: "ADJUST_STANDING", faction: "goldgrass", amount: 12, player: "active" }] }];
  const after = richer[pickChoice(g, "plainers", "tune-card", richer)].id;
  check("17. raising a reward changes what the AI takes",
    before === "small" && after === "standing", `${before} → ${after}`);
  clearPatch(null);
}

console.log(fail ? `\n${fail} check(s) failed` : "\nall checks passed");
process.exit(fail ? 1 : 0);
