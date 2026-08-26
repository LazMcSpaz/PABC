// The Loyalty radial, lifted off the tile and hung in the air above it.
//
// On the old flat board this sat superimposed on the hex face. On a projected
// board that reads as a sticker lying on the ground; floating it, with a
// dashed tether down to a contact ellipse on the top face, is what makes the
// tile look like it has height. The radial itself is deliberately NOT squashed
// by the projection — it stays a true circle, a billboard facing the viewer,
// which is both what sells it as hovering and what keeps it readable.
import { METER } from "./radialGeometry.js";
import ControlMeter from "./ControlMeter.jsx";
import GarrisonValue from "./GarrisonValue.jsx";
import { fullController, holoColor, HOLO_NEUTRAL, theme } from "./data.js";
import { FLOAT_LIFT, HEX_W, HEX_H } from "./hexProjection.js";

// Geometry lives in radialGeometry.js so the token layer and the tests can read
// it without pulling in this component. Re-exported for existing callers.
export { METER, radialBox, hasRadial } from "./radialGeometry.js";

export default function FloatingControlMeter({ x, y, name, control, locationId, dim, ready = 0 }) {
  const ctrl = fullController(control.sections);
  const col = ctrl ? holoColor(ctrl) : HOLO_NEUTRAL;
  const lift = FLOAT_LIFT;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: dim ? 0.45 : 1,
        transition: "opacity .3s ease",
        pointerEvents: "none",
      }}
    >
      {/* tether + contact ellipse: without these the radial detaches and reads
          as free-floating UI rather than as something anchored to this tile */}
      <svg
        width={HEX_W}
        height={lift + HEX_H}
        viewBox={`${-HEX_W / 2} ${-lift} ${HEX_W} ${lift + HEX_H}`}
        style={{ position: "absolute", left: -HEX_W / 2, top: -lift, overflow: "visible" }}
      >
        <line
          x1={0} y1={-lift + METER / 2} x2={0} y2={0}
          stroke={col} strokeWidth={1.3} strokeDasharray="3 4" opacity={0.55}
        />
        <ellipse
          cx={0} cy={0} rx={HEX_W * 0.14} ry={HEX_W * 0.14 * (HEX_H / HEX_W)}
          fill="none" stroke={col} strokeWidth={1.2} opacity={0.45}
        />
      </svg>

      <div
        data-radial=""
        style={{
          position: "absolute",
          left: 0,
          top: -lift,
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          filter: `drop-shadow(0 0 10px ${col}66) drop-shadow(0 6px 10px rgba(0,0,0,0.75))`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.7,
            color: theme.text,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(0,0,0,0.55)",
            padding: "0 7px",
            borderRadius: 3,
            whiteSpace: "nowrap",
          }}
        >
          {/* §4 of vp-and-actions-design — this city still has an action, and
              a Logistics Hub city has two. Same dot as the unit tokens and the
              HUD's READY strip: one symbol for "this can still do something",
              wherever you happen to be looking. */}
          {Array.from({ length: ready }, (_, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                width: 6, height: 6, borderRadius: "50%",
                marginRight: 5, verticalAlign: "middle",
                background: theme.ready,
                boxShadow: `0 0 5px ${theme.ready}`,
              }}
            />
          ))}
          {name}
        </div>
        <ControlMeter
          sections={control.sections}
          loyalty={control.loyalty}
          danger={control.loyaltyDanger}
          pressureBy={control.pressureBy}
          pending={control.pending}
          size={METER}
        />
        <div style={{ pointerEvents: "auto" }}>
          <GarrisonValue
            locationId={locationId}
            control={control}
            height={11}
            fontSize={11}
            pill
          />
        </div>
      </div>
    </div>
  );
}
