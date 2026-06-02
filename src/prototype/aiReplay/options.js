// Persisted UI option: AI turn speed (§ cinematic replay). Stored in
// localStorage under `pabc.aiTurnSpeed`; default "normal". The runtime
// skip-now flag (tap-to-skip) is a SEPARATE, non-persisted session flag held
// in the replay hook — setting the speed here never clears skip-now; only a
// new game does.
export const AI_TURN_SPEEDS = ["slow", "normal", "fast", "skip"];
export const AI_TURN_SPEED_LABELS = {
  slow: "Slow — cinematic",
  normal: "Normal",
  fast: "Fast",
  skip: "Skip — instant",
};

const KEY = "pabc.aiTurnSpeed";

export function getAiTurnSpeed() {
  try {
    const v = localStorage.getItem(KEY);
    return AI_TURN_SPEEDS.includes(v) ? v : "normal";
  } catch {
    return "normal";
  }
}

export function setAiTurnSpeed(speed) {
  if (!AI_TURN_SPEEDS.includes(speed)) return;
  try {
    localStorage.setItem(KEY, speed);
  } catch {
    /* storage unavailable — keep the in-memory default */
  }
}
