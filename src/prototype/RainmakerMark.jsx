// The Rainmaker on the board.
//
// Built as its OWN map object, not as a flag on the unit escorting it, because
// it is not one (implementation notes §0, §4): it outlives every unit around
// it, it changes hands, and it can sit on a hex belonging to nobody at all. A
// status icon hung off an escort would vanish the moment that escort died,
// which is precisely the case the whole design turns on.
//
// The art is the Oldworld weather machine — the first asset in this game with
// no owner at all, filed under the `neutral` pseudo-faction and drawn from the
// same sprite machinery as a unit or a tollbooth (see
// docs/weather-machine-pipeline-asks.md). It carries NO owner colour by
// ruling: pale hull, wood cradle, black wheels. So whose it is has to be said
// some other way, and it is said underneath — a faction-coloured contact
// ellipse on the ground, the way the board already marks who holds a place.
// Tinting the machine itself would be inventing livery for a thing that
// predates every faction on the map.
//
// Four states, and they must read differently at a glance because they mean
// completely different things to whoever is looking:
//
//   buried     at the site, not yet lifted. No ground mark — nobody owns it.
//   carried    on the road, facing its travel, over its holder's colour.
//   loose      nobody's. Pulsing, and the ground mark is gone.
//   installed  in a capital. Raining once it is switched on.
import { ownerColor } from "./data.js";
import { HEX_H, HEX_W } from "./hexProjection.js";
import { facingFor } from "./boardSlots.js";
import { structureFor, spriteStyle, spriteScale, ensureIdleKeyframes } from "./unitSprites.js";

// The board's vertical squash. DERIVED, the way blockadeStance derives it —
// hardcoding the number would silently start pointing the machine the wrong way
// if the tiles were ever re-exported at a different aspect.
const DEPTH_SQUASH = HEX_H / HEX_W;

let keyframesInstalled = false;
function ensureMarkKeyframes() {
  if (keyframesInstalled || typeof document === "undefined") return;
  keyframesInstalled = true;
  const el = document.createElement("style");
  el.textContent = `
@keyframes rainmaker-loose { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
@keyframes rainmaker-rain { 0% { opacity: 0; transform: translateY(-4px) } 40% { opacity: .9 } 100% { opacity: 0; transform: translateY(10px) } }`;
  document.head.appendChild(el);
}

// Which way the carts are pointing: the bearing of the last step it took.
// Unsquashed first, because the board's vertical squash would otherwise pull
// every heading toward the horizontal and the machine would face east on a
// journey that was mostly north.
function facingOf(device, centers) {
  const from = device.fromHex && centers[device.fromHex];
  const to = centers[device.hex];
  if (!from || !to || (from.x === to.x && from.y === to.y)) return "s";
  return facingFor(Math.atan2((to.y - from.y) / DEPTH_SQUASH, to.x - from.x));
}

export default function RainmakerMark({ x, y, device, running = false, centers = {} }) {
  if (!device || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const spec = structureFor("neutral", "weather_machine");
  if (!spec) return null;
  ensureIdleKeyframes(spec);
  ensureMarkKeyframes();

  const loose = device.status === "loose";
  const held = !loose && device.owner ? ownerColor(device.owner) : null;
  const style = spriteStyle(spec, "base", {
    uid: `rainmaker-${device.hex}`,
    facing: facingOf(device, centers),
  });
  // The ground mark is sized off the machine's own footprint, so it sits under
  // the thing rather than under a guess about it.
  const foot = spec.footprintMetres * spec.pixelsPerMetre * spriteScale(spec);

  return (
    <div
      data-rainmaker={device.status}
      data-rainmaker-owner={device.owner || "none"}
      title={loose
        ? "The Rainmaker — nobody is holding it"
        : `The Rainmaker${running ? " — running" : ""}`}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 0,
        height: 0,
        pointerEvents: "none",
        animation: loose ? "rainmaker-loose 1.7s ease-in-out infinite" : undefined,
      }}
    >
      {/* Whose it is, on the ground rather than on the machine. */}
      {held && (
        <div style={{
          position: "absolute",
          left: -foot / 2,
          top: -(foot * DEPTH_SQUASH) / 2,
          width: foot,
          height: foot * DEPTH_SQUASH,
          borderRadius: "50%",
          border: `2px solid ${held}`,
          boxShadow: `0 0 12px ${held}66, inset 0 0 14px ${held}33`,
          background: `radial-gradient(ellipse at 50% 50%, ${held}22, transparent 70%)`,
        }} />
      )}

      <div style={{ position: "absolute", left: 0, top: 0, ...style }} />

      {/* Rain, only when it is actually making any. Before the switch it
          produces nothing at all, and the board must not imply otherwise —
          that is the design's single most important balance rule. */}
      {running && (
        <div style={{ position: "absolute", left: -foot * 0.3, top: -foot * 0.1, width: foot * 0.6, height: foot * 0.5 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${12 + i * 24}%`,
                top: 0,
                width: 2,
                height: "42%",
                borderRadius: 2,
                background: "rgba(190,225,235,0.95)",
                animation: `rainmaker-rain ${0.9 + i * 0.13}s linear infinite`,
                animationDelay: `-${i * 0.22}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Torn loose in a hurry — a visible cost for a visible shortcut, so a
          rival can see that what they are chasing is hurt. */}
      {device.damaged && (
        <svg
          width={foot * 0.34}
          height={foot * 0.34}
          viewBox="0 0 40 40"
          style={{ position: "absolute", left: foot * 0.16, top: -foot * 0.34 }}
        >
          <circle cx="20" cy="20" r="17" fill="rgba(6,10,14,0.85)" />
          <path d="M23 9 L14 22 L21 22 L16 32" fill="none" stroke="#ffb74d"
            strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
