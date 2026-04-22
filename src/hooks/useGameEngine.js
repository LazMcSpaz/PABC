// The ONLY bridge between React state and the pure engine.
// If you're tempted to import `useState` inside src/engine/, move it here instead.

import { useCallback, useMemo, useState } from "react";
import * as actions from "../engine/actions.js";
import { makeInitialState, makePlayer } from "../engine/gameState.js";
import { AI_PERSONALITIES } from "../engine/ai.js";

export function useGameEngine() {
  const [state, setState] = useState(null);

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
      endTurn: () => setState((s) => actions.endTurn(s)),
    }),
    [],
  );

  const reset = useCallback(() => setState(null), []);

  return { state, startGame, reset, ...wrapped };
}
