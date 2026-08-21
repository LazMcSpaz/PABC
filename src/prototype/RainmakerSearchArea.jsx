// Where the Rainmaker might be — the search's narrowing, drawn on the ground.
//
// The panel can say "narrowed down to 25 hexes" and that is close to useless on
// its own: the whole beat is walking the right ground, and a number does not
// tell you which ground. This is the number, on the board.
//
// It is a WASH rather than a set of outlined tiles, and that is the honest
// shape for what it represents. The engine's narrowing is an area that shrinks
// toward the true hex; it is never a list of hexes ruled in or out one by one,
// and never says "not here" about anywhere. A soft blurred cloud reads as
// "somewhere in here" — outlined tiles would read as a checklist, which is a
// promise the mechanic does not make.
//
// Not drawn at all once the area is the whole landmass: a wash over every hex
// on the map is noise that says nothing, and the first tier of narrowing is
// exactly that.
import { HEX_W } from "./hexProjection.js";

const TINT = "rgba(86,211,198,0.30)";

export default function RainmakerSearchArea({ candidates, centers, totalHexes }) {
  if (!candidates?.length) return null;
  if (totalHexes && candidates.length >= totalHexes) return null;
  const r = HEX_W * 0.62;

  return (
    <div
      data-rainmaker-search={candidates.length}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        pointerEvents: "none",
        // Blurred as one layer so the discs merge into a single field instead
        // of reading as a scatter of markers.
        filter: `blur(${Math.round(HEX_W * 0.16)}px)`,
        mixBlendMode: "screen",
        opacity: 0.75,
      }}
    >
      {candidates.map((id) => {
        const c = centers[id];
        if (!c) return null;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              left: c.x - r,
              top: c.y - r * 0.62, // squashed like everything else on this board
              width: r * 2,
              height: r * 1.24,
              borderRadius: "50%",
              background: TINT,
            }}
          />
        );
      })}
    </div>
  );
}
