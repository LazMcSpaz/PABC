// The ONLY bridge between React state and the pure engine.
// If you're tempted to import `useState` inside src/engine/, move it here instead.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as actions from "../engine/actions.js";
import {
  AI_PERSONALITIES,
  executeAIAction,
  getAIDecision,
  recordAIDecision,
} from "../engine/ai.js";
import { activateAbility } from "../engine/abilities.js";
import { makeInitialState, makePlayer } from "../engine/gameState.js";
import { playIntrigue } from "../engine/intrigue.js";

const ACTION_DELAY_MS = 700;
const PRE_TURN_DELAY_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useGameEngine() {
  const [state, setState] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const stateRef = useRef(state);
  const aiTurnRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const startGame = useCallback((config) => {
    const players = config.players.map((p, i) =>
      makePlayer({
        id: i,
        name: p.name,
        kind: p.kind,
        personalityId: p.personalityId ?? null,
        color:
          p.kind === "ai"
            ? AI_PERSONALITIES.find((x) => x.id === p.personalityId)?.color ?? "#888"
            : "#3498db",
      }),
    );
    setState(makeInitialState({ players }));
  }, []);

  const wrapped = useMemo(
    () => ({
      build: (playerId, uid) => setState((s) => actions.build(s, playerId, uid)),
      demolish: (playerId, uid) => setState((s) => actions.demolish(s, playerId, uid)),
      boost: (playerId, stat, amount) =>
        setState((s) => actions.boost(s, playerId, stat, amount)),
      explore: (playerId) => setState((s) => actions.explore(s, playerId)),
      resolveCard: (playerId, uid) => setState((s) => actions.resolveCard(s, playerId, uid)),
      raid: (attackerId, targetId, raidType) =>
        setState((s) => actions.raid(s, attackerId, targetId, raidType)),
      playIntrigue: (playerId, cardUid, opts) =>
        setState((s) => playIntrigue(s, playerId, cardUid, opts)),
      activateAbility: (playerId, buildingUid, opts) =>
        setState((s) => activateAbility(s, playerId, buildingUid, opts)),
      endTurn: () => setState((s) => actions.endTurn(s)),
    }),
    [],
  );

  const reset = useCallback(() => {
    aiTurnRef.current = false;
    setAiThinking(false);
    setState(null);
  }, []);

  // AI turn driver. Fires whenever the active player becomes an AI; serializes
  // the current state, asks the model for a plan, executes each action with a
  // short delay, then ends the turn. Re-fires for back-to-back AI turns.
  useEffect(() => {
    if (!state || state.winnerId != null) return;
    const active = state.players.find((p) => p.id === state.activePlayerId);
    if (!active || active.kind !== "ai") return;
    if (aiTurnRef.current) return;

    aiTurnRef.current = true;
    setAiThinking(true);

    (async () => {
      try {
        const personality = AI_PERSONALITIES.find((x) => x.id === active.personalityId);
        const plan = await getAIDecision(state, active.id, personality);
        setState((s) => recordAIDecision(s, active.id, plan));

        await sleep(PRE_TURN_DELAY_MS);

        for (const action of plan.actions ?? []) {
          if (stateRef.current?.winnerId != null) break;
          if (action.type === "end_turn") break;
          setState((s) => executeAIAction(s, active.id, action));
          await sleep(ACTION_DELAY_MS);
        }

        if (stateRef.current?.winnerId == null) {
          setState((s) => actions.endTurn(s));
        }
      } catch (err) {
        console.error("AI turn driver error:", err);
        setState((s) => actions.endTurn(s));
      } finally {
        aiTurnRef.current = false;
        setAiThinking(false);
      }
    })();
  }, [state?.activePlayerId, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, aiThinking, startGame, reset, ...wrapped };
}
