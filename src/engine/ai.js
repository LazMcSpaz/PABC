// AI opponent system. Each personality ships a system prompt that shapes
// strategic priorities. getAIDecision() serializes state and calls the
// Claude API; the model returns a structured JSON action plan.
//
// Security: the API key is read from import.meta.env.VITE_ANTHROPIC_API_KEY
// and used client-side. This is acceptable for a local prototype per the
// README; before any public deployment, move behind a server proxy.

import Anthropic from "@anthropic-ai/sdk";

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

const NOOP_PLAN = {
  reasoning: "No API key configured — skipping turn.",
  actions: [{ type: "end_turn" }],
};

function getClient() {
  const apiKey = import.meta?.env?.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export async function getAIDecision(serializedState, personality) {
  const client = getClient();
  if (!client) return NOOP_PLAN;

  const userMessage = [
    "Return a JSON object with keys `reasoning` (string) and `actions` (array).",
    "Valid action types: build {buildingId}, explore, raid {targetId, raidType}, boost {stat: 'atk'|'def'}, play_intrigue {cardName, targetId?}, end_turn.",
    "Here is the current game state:",
    "```json",
    JSON.stringify(serializedState, null, 2),
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
    if (!jsonMatch) return NOOP_PLAN;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("getAIDecision failed", err);
    return NOOP_PLAN;
  }
}
