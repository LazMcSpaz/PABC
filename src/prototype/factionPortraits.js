// Diplomacy portraits — the painted faces the political layer speaks through.
// Shared by the herald banners, the envoy audience and the offer cards.
// `pos` is the object-position that keeps each face inside a tight crop.
//
// TWO registers, and the distinction is the point:
//
//   leader — the head of state. Reserved for the moments that change what
//            the game is: war declared, an alliance sworn or broken, a
//            faction bending the knee, a coalition rising, recognition.
//            If a leader's face appears, something irreversible happened.
//
//   envoy  — the person they send for everything else. Warnings, offers,
//            ultimatums, denouncements, tribute demands. These are frequent,
//            and a head of state who personally delivers every routine
//            protest stops reading as a head of state.
//
// A faction with no envoy art falls back to its leader rather than to
// nothing, so the layer never renders a blank frame.
const A = import.meta.env.BASE_URL;

export const LEADER_PORTRAITS = {
  versari:   { src: `${A}assets/portraits/factions/versari/versari_diplomacy_1.webp`, pos: "50% 25%" },
  lakers:    { src: `${A}assets/portraits/factions/lakers/lakers_diplomacy_1.webp`, pos: "50% 22%" },
  goldgrass: { src: `${A}assets/portraits/factions/goldgrass/goldgrass_diplomacy_1.webp`, pos: "66% 22%" },
  plainers:  { src: `${A}assets/portraits/factions/plainers/plainers_diplomacy_1.webp`, pos: "72% 22%" },
};

// Drop a faction's envoy art at the path below and it is picked up with no
// other change. Until then that faction quietly uses its leader.
export const ENVOY_PORTRAITS = {
  versari:   { src: `${A}assets/portraits/factions/versari/versari_envoy_1.webp`, pos: "50% 22%" },
  lakers:    { src: `${A}assets/portraits/factions/lakers/lakers_envoy_1.webp`, pos: "50% 22%" },
  goldgrass: { src: `${A}assets/portraits/factions/goldgrass/goldgrass_envoy_1.webp`, pos: "50% 22%" },
  plainers:  { src: `${A}assets/portraits/factions/plainers/plainers_envoy_1.webp`, pos: "50% 22%" },
};

// Which faces exist on disk. Kept as an explicit list rather than probed at
// runtime: an <img> that 404s has already flashed an empty frame by the time
// anything could react to it.
const ENVOY_ART_AVAILABLE = new Set(["versari"]);

// `tone` is "leader" for the irreversible moments and "envoy" for everything
// else — see the note at the top. Defaults to envoy because most of what the
// political layer says is routine.
export function portraitFor(fid, tone = "envoy") {
  if (tone === "leader") return LEADER_PORTRAITS[fid] || null;
  if (ENVOY_ART_AVAILABLE.has(fid)) return ENVOY_PORTRAITS[fid];
  return LEADER_PORTRAITS[fid] || null;
}

// The events that earn a head of state. Everything not named here is routine
// enough to be somebody's job rather than the leader's.
const LEADER_EVENTS = new Set([
  "war_declared", "peace_made",
  "pact_formed", "pact_broken",
  "coalition_formed",
  "vassal_established", "vassal_rebelled", "vassal_freed",
  "recognition_summit",
  "faction_eliminated",
]);
export function toneForEvent(eventName) {
  return LEADER_EVENTS.has(eventName) ? "leader" : "envoy";
}
