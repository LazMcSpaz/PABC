// Pure notification helpers. The engine pushes an entry onto
// state.notifications every time it applies an automatic effect that the
// user might miss — events firing, raid outcomes, challenges resolving,
// intrigue cards playing, persistent flags changing.
//
// UI components (see NotificationToasts / NotificationFeed) read from
// state.notifications and render them; newest last.

export const NotifKind = {
  EVENT: "event",
  INTRIGUE: "intrigue",
  RAID: "raid",
  CHALLENGE: "challenge",
  BUILD: "build",
  FLAG: "flag",
  TURN: "turn",
  INFO: "info",
};

function nextCounter(state) {
  return (state.notificationCounter ?? 0) + 1;
}

// Push one notification. Pure — returns new state.
// Props: { kind, title, message?, impacts?, sourceCardId?, sourcePlayerId?, severity? }
export function notify(state, props) {
  const counter = nextCounter(state);
  const notif = {
    id: `n${counter}`,
    round: state.round ?? 0,
    severity: "info",
    impacts: [],
    message: "",
    ...props,
  };
  return {
    ...state,
    notifications: [...(state.notifications ?? []), notif],
    notificationCounter: counter,
  };
}

// Build a per-player impact line. Keeps the shape consistent.
export function impact(playerId, text, delta) {
  const out = { playerId, text };
  if (delta) out.delta = delta;
  return out;
}
