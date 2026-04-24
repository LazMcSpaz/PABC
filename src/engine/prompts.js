// Mid-flow prompt infrastructure.
//
// An engine action that needs a decision from a specific player calls
// pauseWithPrompt(state, { kind, playerId, context, options, message }).
// The returned state carries state.pendingPrompt — every other engine
// action early-returns while a prompt is pending, and the UI renders a
// modal for the prompted player (or the AI driver auto-resolves via a
// registered heuristic).
//
// resolvePrompt(state, choice) looks up the resumer for the prompt
// kind and calls it with the saved context. The resumer is a pure
// function (state, choice, context) -> newState that completes
// whatever flow paused.

export function pauseWithPrompt(state, prompt) {
  const counter = (state.notificationCounter ?? 0) + 1;
  return {
    ...state,
    pendingPrompt: {
      id: `prompt${counter}`,
      ...prompt,
    },
    notificationCounter: counter,
  };
}

// Per-kind resumers. Each: (state, choice, context) => newState.
// Populated by the feature modules that emit prompts of that kind.
export const PROMPT_RESUMERS = {};

export function registerResumer(kind, fn) {
  PROMPT_RESUMERS[kind] = fn;
}

export function resolvePrompt(state, choice) {
  const prompt = state.pendingPrompt;
  if (!prompt) return state;
  const cleared = { ...state, pendingPrompt: null };
  const resumer = PROMPT_RESUMERS[prompt.kind];
  if (!resumer) return cleared;
  return resumer(cleared, choice, prompt.context);
}

// AI heuristics — per-kind choosers that pick a sensible option for
// an AI player. Each: (state, prompt) => choice value. Missing kinds
// default to the first option's value.
export const AI_PROMPT_HEURISTICS = {};

export function registerAIHeuristic(kind, fn) {
  AI_PROMPT_HEURISTICS[kind] = fn;
}

export function aiAutoResolve(state) {
  const prompt = state.pendingPrompt;
  if (!prompt) return state;
  const heuristic = AI_PROMPT_HEURISTICS[prompt.kind];
  const choice = heuristic
    ? heuristic(state, prompt)
    : prompt.options?.[0]?.value ?? null;
  return resolvePrompt(state, choice);
}
