// Pan / zoom viewport for the hex board. The mouse wheel zooms toward
// the cursor; press-and-drag pans. A drag is told apart from a click so
// tapping a hex still selects it. A small control cluster offers button
// zoom and a recenter that re-fits the whole board.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { theme } from "./data.js";
import { animatePan } from "./aiReplay/CameraController.js";

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.4;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// `cameraTarget` is a content-space point {x,y} (a hex centre) the AI replay
// wants centred; `cameraPanMs` is the eased pan duration (0 = snap). User
// drag / wheel still work and simply override the last programmatic pan.
export default function BoardViewport({ children, cameraTarget = null, cameraPanMs = 350 }) {
  const vpRef = useRef(null);
  const contentRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const panStopRef = useRef(null);
  // Two-finger pinch-to-zoom (touch only — mouse only ever produces one
  // pointer, so this branch is simply unreachable for mouse input, no
  // desktop behavior change). `pointers` tracks every currently-down
  // pointer by id; `pinch` holds the previous frame's midpoint/distance
  // between the first two fingers so each move applies an incremental
  // scale + pan, exactly like a native map/photo app pinch.
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const fitToView = useCallback(() => {
    const vp = vpRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = content.offsetWidth;
    const ch = content.offsetHeight;
    if (!cw || !ch) return;
    const fit = clamp(Math.min(vw / cw, vh / ch) * 0.92, MIN_SCALE, MAX_SCALE);
    setView({ scale: fit, x: (vw - cw * fit) / 2, y: (vh - ch * fit) / 2 });
  }, []);

  // Fit the board into the viewport once, on mount.
  useLayoutEffect(() => {
    fitToView();
  }, [fitToView]);

  // Programmatic camera pan: ease the content translate so `cameraTarget`
  // centres in the viewport, keeping the current scale. Driven by the AI
  // replay; a new target cancels any in-flight pan.
  useEffect(() => {
    if (!cameraTarget) return undefined;
    const vp = vpRef.current;
    if (!vp) return undefined;
    if (panStopRef.current) panStopRef.current();
    const start = { x: viewRef.current.x, y: viewRef.current.y };
    panStopRef.current = animatePan({
      start,
      target: cameraTarget,
      vw: vp.clientWidth,
      vh: vp.clientHeight,
      scale: viewRef.current.scale,
      durationMs: cameraPanMs,
      onFrame: ({ x, y }) => setView((v) => ({ ...v, x, y })),
    });
    return () => { if (panStopRef.current) panStopRef.current(); };
  }, [cameraTarget?.x, cameraTarget?.y, cameraPanMs]);

  // Wheel zoom — attached natively so preventDefault is honoured (React's
  // synthetic wheel handler is passive and cannot block page scroll).
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const ratio = scale / v.scale;
        return { scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
      });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor) => {
    const vp = vpRef.current;
    if (!vp) return;
    const px = vp.clientWidth / 2;
    const py = vp.clientHeight / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / v.scale;
      return { scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  // The first two pointers down, in touch order — a stray 3rd/4th finger
  // is tracked (so counts stay right) but never enters the pinch math.
  const pinchPair = () => [...pointers.current.values()].slice(0, 2);
  const midOf = (pts) => ({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
  const distOf = (pts) => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      // A 2nd finger landed — hand off from single-finger pan to pinch.
      if (drag.current?.captured) {
        try { vpRef.current?.releasePointerCapture(drag.current.pointerId); } catch {}
      }
      drag.current = null;
      const pts = pinchPair();
      pinch.current = { lastMid: midOf(pts), lastDist: distOf(pts) };
      moved.current = true; // suppress any click once fingers lift
      return;
    }
    // Don't capture yet — capture redirects pointerup (and the
    // subsequent click) to the viewport, which would steal clicks
    // from hex / unit / button targets nested inside the board. We
    // only capture once the gesture is unmistakably a drag.
    drag.current = {
      sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y,
      pointerId: e.pointerId, captured: false,
    };
    moved.current = false;
    setGrabbing(true);
  };
  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size >= 2) {
      const rect = vpRef.current?.getBoundingClientRect();
      const ox = rect?.left || 0, oy = rect?.top || 0;
      const pts = pinchPair();
      const curMid = midOf(pts);
      const curDist = distOf(pts);
      const { lastMid, lastDist } = pinch.current;
      setView((v) => {
        const scaleRatio = lastDist > 0 ? curDist / lastDist : 1;
        const scale = clamp(v.scale * scaleRatio, MIN_SCALE, MAX_SCALE);
        const appliedRatio = scale / v.scale;
        // Two-finger drag pans first (viewport-local, so subtract origin)...
        let x = v.x + (curMid.x - lastMid.x);
        let y = v.y + (curMid.y - lastMid.y);
        // ...then zoom anchored at the current midpoint.
        const px = curMid.x - ox, py = curMid.y - oy;
        x = px - (px - x) * appliedRatio;
        y = py - (py - y) * appliedRatio;
        return { scale, x, y };
      });
      pinch.current = { lastMid: curMid, lastDist: curDist };
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!moved.current && Math.hypot(dx, dy) > 4) {
      moved.current = true;
      // Promote to a captured drag now that we know it's a pan, not a
      // tap. From here on we want pointer events even if the cursor
      // leaves the viewport.
      if (!d.captured) {
        try { vpRef.current?.setPointerCapture(d.pointerId); } catch {}
        d.captured = true;
      }
    }
    if (moved.current) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const endDrag = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // One finger remains after a pinch — resume it as a pan from here
      // rather than leaving a dead zone until it's lifted and re-pressed.
      // Already know this is a drag (we were just pinching), so capture
      // immediately instead of waiting for the usual 4px tap/drag threshold.
      const [remainingId, pt] = [...pointers.current.entries()][0];
      try { vpRef.current?.setPointerCapture(remainingId); } catch {}
      drag.current = { sx: pt.x, sy: pt.y, ox: view.x, oy: view.y, pointerId: remainingId, captured: true };
      return;
    }
    const vp = vpRef.current;
    const d = drag.current;
    if (d?.captured && vp?.hasPointerCapture?.(e.pointerId)) {
      vp.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setGrabbing(false);
  };
  // The click that ends a real drag must not fall through and select a hex.
  const onClickCapture = (e) => {
    if (moved.current) {
      e.stopPropagation();
      moved.current = false;
    }
  };

  return (
    <div
      ref={vpRef}
      className="pc-board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        cursor: grabbing ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {children}
      </div>

      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 5,
        }}
      >
        <ZoomBtn label="+" title="Zoom in" onClick={() => zoomBy(1.25)} />
        <ZoomBtn label="−" title="Zoom out" onClick={() => zoomBy(0.8)} />
        <ZoomBtn label="⤢" title="Recenter board" onClick={fitToView} />
      </div>
    </div>
  );
}

function ZoomBtn({ label, title, onClick }) {
  return (
    <button
      className="pc-int"
      title={title}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 5,
        border: `1px solid ${theme.borderLit}`,
        background: "linear-gradient(180deg, #332b20, #241e16)",
        color: theme.text,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
      }}
    >
      {label}
    </button>
  );
}
