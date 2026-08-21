// The Rainmaker on the board.
//
// Built as its OWN map object, not as a flag on the unit escorting it, because
// it is not one (implementation notes §0, §4): it outlives every unit around
// it, it changes hands, and it can sit on a hex belonging to nobody at all. A
// status icon hung off an escort would vanish the moment that escort died,
// which is precisely the case the whole design turns on.
//
// The dedicated sprite is in progress and will be supplied. What is here is a
// placeholder built the same way BlockadeMark is — plain SVG, one element at
// either level of detail, with a dark casing so a faction-coloured mark does
// not disappear into that faction's own tinted ground. Swapping in the art
// means replacing the <svg> body and nothing else: position, states and the
// data attribute all stay.
//
// Four states, and they must read differently at a glance because they mean
// completely different things to whoever is looking:
//
//   buried     at the site, not yet lifted. Nobody owns it.
//   carried    on the road, in its holder's colour. This is the vulnerable one.
//   loose      nobody's. Drawn cold and pulsing — first unit there takes it.
//   installed  in a capital. Ringed when it is switched on and the clock runs.
import { ownerColor } from "./data.js";
import { HEX_W } from "./hexProjection.js";

const R = HEX_W * 0.13;
const CASING = "rgba(4,8,12,0.9)";
const LOOSE = "#cfd8dc";

let keyframesInstalled = false;
function ensureKeyframes() {
  if (keyframesInstalled || typeof document === "undefined") return;
  keyframesInstalled = true;
  const el = document.createElement("style");
  el.textContent = `
@keyframes rainmaker-loose { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes rainmaker-live { 0%,100% { transform: scale(1) } 50% { transform: scale(1.09) } }`;
  document.head.appendChild(el);
}

export default function RainmakerMark({ x, y, device, running = false }) {
  if (!device || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  ensureKeyframes();
  const loose = device.status === "loose";
  const col = loose ? LOOSE : ownerColor(device.owner) || LOOSE;
  const size = R * 2;

  return (
    <div
      data-rainmaker={device.status}
      data-rainmaker-owner={device.owner || "none"}
      title={loose
        ? "The Rainmaker — nobody is holding it"
        : `The Rainmaker${running ? " — running" : ""}`}
      style={{
        position: "absolute",
        left: x - R,
        top: y - R,
        width: size,
        height: size,
        pointerEvents: "none",
        animation: loose
          ? "rainmaker-loose 1.6s ease-in-out infinite"
          : running ? "rainmaker-live 2.2s ease-in-out infinite" : undefined,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }}>
        {/* Casing first, so the mark holds its shape over any ground. */}
        <circle cx="50" cy="50" r="42" fill={CASING} />
        {/* A condenser: a squat drum under a collecting dish. Placeholder — the
            silhouette is what has to be recognisable at a glance from across
            the board, so the real sprite should keep this shape. */}
        <path
          d="M22 40 Q50 20 78 40 L68 46 Q50 32 32 46 Z"
          fill={col}
          stroke={CASING}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="38" y="46" width="24" height="26" rx="4" fill={col} stroke={CASING} strokeWidth="3" />
        <line x1="50" y1="30" x2="50" y2="46" stroke={col} strokeWidth="5" strokeLinecap="round" />
        {/* Rain, only when it is actually making any. Before the switch it
            produces nothing at all, and the board should not imply otherwise. */}
        {running && (
          <g stroke={col} strokeWidth="4" strokeLinecap="round" opacity="0.9">
            <line x1="36" y1="76" x2="33" y2="88" />
            <line x1="50" y1="78" x2="47" y2="92" />
            <line x1="64" y1="76" x2="61" y2="88" />
          </g>
        )}
        {/* Damaged in a hurried extraction — a visible cost for a visible
            shortcut, so a rival can see what they are chasing is hurt. */}
        {device.damaged && (
          <path d="M62 42 L54 57 L62 57 L52 72" fill="none" stroke="#ffb74d" strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}
