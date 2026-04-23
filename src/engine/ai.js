// AI opponent system. Each personality ships a system prompt that shapes
// strategic priorities. getAIDecision() serializes state and calls the
// Claude API; the model returns a structured JSON action plan.
//
// Security: the API key is read from import.meta.env.VITE_ANTHROPIC_API_KEY
// and used client-side. This is acceptable for a local prototype per the
// README; before any public deployment, move behind a server proxy.

import Anthropic from "@anthropic-ai/sdk";
import { abilityMeta, activateAbility, canActivate } from "./abilities.js";
import * as actions from "./actions.js";
import { calcActions, calcAttack, calcDefense, calcPassiveScrap, calcVP } from "./calculations.js";
import { INTRIGUE_EFFECTS, playIntrigue } from "./intrigue.js";

const MODEL_ID = "claude-sonnet-4-20250514";

export const AI_PERSONALITIES = [
  {
    id: "warlord",
    name: "The Warlord AI",
    color: "#e74c3c",
    description:
      "Aggressive raider. Prioritizes Attack-producing buildings. Raids whenever Attack exceeds a target's Defense. Will preferentially target the human player if they're ahead on VP. Uses Intrigue cards aggressively for sabotage.",
    systemPrompt:
      "You are playing Ashland Conquest as The Warlord — an aggressive raider faction. Prioritize Attack-producing buildings. Raid whenever your Attack exceeds a target's Defense, preferring whoever is ahead on VP. Use Intrigue cards aggressively for sabotage. Always respond with a single valid JSON object matching the action-plan schema — no prose outside the JSON.",
  },
  {
    id: "builder",
    name: "The Builder AI",
    color: "#27ae60",
    description:
      "Economic engine. Prioritizes Scrap-producing buildings, then explores constantly. Builds defensive structures rather than raiding. Wins through VP accumulation from completed challenges.",
    systemPrompt:
      "You are playing Ashland Conquest as The Builder — an economic engine faction. Prioritize Scrap-producing buildings, then explore constantly. Build defensive structures rather than raiding. Win through VP from completed challenges. Always respond with a single valid JSON object matching the action-plan schema — no prose outside the JSON.",
  },
];

export const NOOP_PLAN = {
  reasoning: "No API key configured — skipping turn.",
  actions: [{ type: "end_turn" }],
};

function summarizeBuilding(b) {
  return {
    uid: b.uid,
    id: b.id,
    name: b.name,
    passiveScrap: b.passiveScrap,
    passiveAtk: b.passiveAtk,
    passDef: b.passDef,
    passActions: b.passActions,
    vp: b.vp,
    ability: b.ability?.description ?? null,
    activated: abilityMeta(b.id) != null,
  };
}

function summarizePlayer(p, opts = {}) {
  const out = {
    id: p.id,
    name: p.name,
    kind: p.kind,
    scrap: p.scrap,
    derived: {
      vp: calcVP(p),
      atk: calcAttack(p),
      def: calcDefense(p),
      passiveScrap: calcPassiveScrap(p),
      actions: calcActions(p),
    },
    settlement: p.settlement.map(summarizeBuilding),
    leader: p.leader
      ? { id: p.leader.id, name: p.leader.name, ability: p.leader.ability?.description ?? null }
      : null,
  };
  if (opts.includeHand) {
    out.intrigueHand = p.intrigueHand.map((c) => ({
      uid: c.uid,
      id: c.id,
      name: c.name,
      immediate: c.immediate,
      ability: c.ability?.description ?? null,
    }));
    out.actionsRemaining = p.actionsRemaining;
    out.boosts = p.boosts;
  }
  return out;
}

export function serializeForAI(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const myAtk = calcAttack(me);

  const buildingRow = state.buildingRow.map((c) => ({
    ...summarizeBuilding(c),
    type: c.type,
    scrapCost: c.scrapCost,
    atkCost: c.atkCost,
    canAfford: me.scrap >= (c.scrapCost ?? 0) && myAtk >= (c.atkCost ?? 0),
  }));

  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => {
      const theirDef = calcDefense(p);
      return {
        ...summarizePlayer(p),
        theirDef,
        raidWouldSucceed: myAtk > theirDef,
      };
    });

  const top = state.explorationDeck[0] ?? null;
  const topExploration = top
    ? {
        id: top.id,
        name: top.name,
        type: top.type,
        scrapCost: top.scrapCost,
        reqAtk: top.reqAtk,
        reqDef: top.reqDef,
        scrapReward: top.scrapReward,
        atkReward: top.atkReward,
        defReward: top.defReward,
        actionReward: top.actionReward,
        vp: top.vp,
        surprise: top.surprise,
        ability: top.ability?.description ?? null,
        canResolve:
          me.scrap >= (top.scrapCost ?? 0) &&
          myAtk >= (top.reqAtk ?? 0) &&
          calcDefense(me) >= (top.reqDef ?? 0),
      }
    : null;

  return {
    round: state.round,
    age: state.age,
    progressionResolved: state.progressionResolved,
    me: summarizePlayer(me, { includeHand: true }),
    opponents,
    buildingRow,
    topExploration,
    explorationInPlay: state.explorationInPlay.map((e) => ({
      uid: e.card.uid,
      id: e.card.id,
      name: e.card.name,
      type: e.card.type,
      drawnBy: e.drawnBy,
      scrapCost: e.card.scrapCost,
      reqAtk: e.card.reqAtk,
      reqDef: e.card.reqDef,
      canResolve:
        me.scrap >= (e.card.scrapCost ?? 0) &&
        myAtk >= (e.card.reqAtk ?? 0) &&
        calcDefense(me) >= (e.card.reqDef ?? 0),
    })),
    globalFlags: state.globalFlags,
    recentLog: (state.log ?? []).slice(-10),
  };
}

function getClient() {
  const apiKey = import.meta?.env?.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export async function getAIDecision(state, playerId, personality) {
  const client = getClient();
  if (!client) return NOOP_PLAN;
  const serialized = serializeForAI(state, playerId);
  if (!serialized) return NOOP_PLAN;

  const userMessage = [
    "Return ONE JSON object with keys `reasoning` (string, 1-2 sentences) and `actions` (array).",
    "Action types you may use:",
    "  { type: \"build\", buildingId: <id from buildingRow> }",
    "  { type: \"explore\" }  // blocked if globalFlags.explorationBlocked",
    "  { type: \"resolve\", cardId: <id from explorationInPlay where canResolve=true> }",
    "  { type: \"raid\", targetId: <opponent id>, raidType: \"Destroy Building\"|\"Steal Intrigue\"|\"Disable Leader\", buildingId?: <target building id in opponent.settlement, required if raidType=\"Destroy Building\"> }  // blocked if globalFlags.raidsBlocked",
    "  { type: \"boost\", stat: \"atk\"|\"def\" }",
    "  { type: \"play_intrigue\", cardName: <name>, targetId?: <id> }",
    "  { type: \"activate\", buildingId: <id in me.settlement where activated=true>, partnerId?: <opponent id for Trading Post> }",
    "  { type: \"end_turn\" }",
    "Each non-end_turn action consumes resources you must have. The engine will silently no-op invalid actions.",
    "Plan up to 4 actions in priority order. End with end_turn if you intentionally pass remaining actions.",
    "Game state:",
    "```json",
    JSON.stringify(serialized, null, 2),
    "```",
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: personality.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...NOOP_PLAN, reasoning: "Model returned no JSON; passing." };
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.actions)) parsed.actions = [{ type: "end_turn" }];
    return parsed;
  } catch (err) {
    console.error("getAIDecision failed", err);
    return { ...NOOP_PLAN, reasoning: `AI call failed: ${err.message ?? "unknown error"}` };
  }
}

// Maps a single action from the AI plan onto an engine call. Pure function:
// returns new state. Invalid actions return state unchanged (engine actions
// already no-op when preconditions aren't met).
export function executeAIAction(state, playerId, action) {
  if (!state || state.winnerId != null) return state;
  if (!action || typeof action !== "object") return state;
  switch (action.type) {
    case "build": {
      const card = state.buildingRow.find((c) => c.id === action.buildingId);
      return card ? actions.build(state, playerId, card.uid) : state;
    }
    case "explore":
      return actions.explore(state, playerId);
    case "resolve": {
      const entry = state.explorationInPlay.find((e) => e.card.id === action.cardId);
      return entry ? actions.resolveCard(state, playerId, entry.card.uid) : state;
    }
    case "raid": {
      const extras = {};
      if (action.raidType === "Destroy Building") {
        const target = state.players.find((p) => p.id === action.targetId);
        const building =
          target?.settlement.find((b) => b.id === action.buildingId) ??
          target?.settlement.find((b) => b.uid === action.buildingUid) ??
          target?.settlement[0];
        if (building) extras.buildingUid = building.uid;
      }
      return actions.raid(state, playerId, action.targetId, action.raidType, extras);
    }
    case "boost":
      return actions.boost(state, playerId, action.stat, 1);
    case "activate": {
      const me = state.players.find((p) => p.id === playerId);
      if (!me) return state;
      const building = me.settlement.find(
        (b) => b.id === action.buildingId || b.uid === action.buildingUid,
      );
      if (!building) return state;
      const meta = abilityMeta(building.id);
      if (!meta) return state;
      const check = canActivate(state, playerId, building);
      if (!check.ok) return state;
      const opts = {};
      if (meta.requires === "partner") {
        const opponents = state.players.filter((p) => p.id !== playerId);
        opts.partnerId = action.partnerId ?? opponents[0]?.id;
      }
      return activateAbility(state, playerId, building.uid, opts);
    }
    case "play_intrigue": {
      const me = state.players.find((p) => p.id === playerId);
      if (!me) return state;
      const card = me.intrigueHand.find(
        (c) =>
          (action.cardName && c.name.toLowerCase() === action.cardName.toLowerCase()) ||
          (action.cardId && c.id === action.cardId),
      );
      if (!card) return state;
      const entry = INTRIGUE_EFFECTS[card.id];
      if (!entry || entry.immediate) return state;
      const opts = {};
      const opponents = state.players.filter((p) => p.id !== playerId);
      if (entry.requires === "target") {
        opts.targetId = action.targetId ?? opponents[0]?.id;
      } else if (entry.requires === "twoTargets") {
        const ids = Array.isArray(action.targetIds) ? action.targetIds : opponents.slice(0, 2).map((p) => p.id);
        opts.targetIds = ids;
      } else if (entry.requires === "buildingTarget") {
        const target = state.players.find((p) => p.id === action.targetId) ?? opponents[0];
        opts.targetId = target?.id;
        const bu = target?.settlement?.[0]?.uid;
        opts.buildingUid = action.buildingUid ?? bu;
      }
      return playIntrigue(state, playerId, card.uid, opts);
    }
    case "end_turn":
    default:
      return state;
  }
}

// Records the full AI decision (reasoning + planned actions) into state.aiLog.
export function recordAIDecision(state, playerId, plan) {
  const entry = {
    round: state.round,
    playerId,
    reasoning: plan.reasoning ?? "",
    actions: plan.actions ?? [],
    timestamp: Date.now(),
  };
  return { ...state, aiLog: [...(state.aiLog ?? []), entry] };
}
