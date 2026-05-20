import { useEffect, useRef, useState } from "react";

// 3:2 locked image cropper. The crop rectangle is constrained to the
// image bounds; drag the rectangle to reposition, drag a corner handle
// to resize (aspect ratio held). The rightmost third of the crop area
// renders a semi-transparent "fade" overlay — purely a preview cue,
// not baked into the saved file. The final fade is the engine's job.

const ASPECT = 3 / 2; // width / height

// Max output dimensions, in image-native pixels. Larger crops are
// downscaled on confirm; smaller crops keep their native resolution.
const MAX_OUTPUT_W = 1500;
const MAX_OUTPUT_H = 1000;

const JPEG_QUALITY = 0.85;

export function ImageCropper({ file, beatId, onCancel, onConfirm }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [crop, setCrop] = useState(null); // in image-native pixels
  const [dragging, setDragging] = useState(null);
  const wrapRef = useRef(null);
  const imgRef = useRef(null);

  // Load the file into a data URL once.
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setImageUrl(e.target.result);
    reader.readAsDataURL(file);
  }, [file]);

  // Initialise crop to the largest 3:2 rectangle that fits, centred.
  const onImgLoad = (e) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    setNaturalSize({ w, h });
    setCrop(initialCrop(w, h));
  };

  // ----- Mouse / touch handling -----

  const displayScale = () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return 1;
    const rect = img.getBoundingClientRect();
    return rect.width / naturalSize.w;
  };

  const toImagePx = (clientX, clientY) => {
    const rect = imgRef.current.getBoundingClientRect();
    const scale = rect.width / naturalSize.w;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const startMove = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = pointerCoords(e);
    const img = toImagePx(p.clientX, p.clientY);
    setDragging({ mode: "move", offX: img.x - crop.x, offY: img.y - crop.y });
  };

  const startResize = (corner) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ mode: "resize", corner, anchor: anchorFor(corner, crop) });
  };

  useEffect(() => {
    if (!dragging || !naturalSize) return;

    const onMove = (e) => {
      const p = pointerCoords(e);
      if (!p) return;
      const img = toImagePx(p.clientX, p.clientY);
      if (dragging.mode === "move") {
        let x = img.x - dragging.offX;
        let y = img.y - dragging.offY;
        x = clamp(x, 0, naturalSize.w - crop.w);
        y = clamp(y, 0, naturalSize.h - crop.h);
        setCrop({ ...crop, x, y });
      } else if (dragging.mode === "resize") {
        const next = resizeFromAnchor({
          anchor: dragging.anchor,
          corner: dragging.corner,
          pointer: img,
          natural: naturalSize,
        });
        if (next) setCrop(next);
      }
    };

    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, crop, naturalSize]);

  // ----- Confirm -----

  const handleConfirm = async () => {
    if (!crop || !naturalSize) return;
    const blob = await cropToBlob({
      imageUrl,
      crop,
      natural: naturalSize,
    });
    onConfirm(blob);
  };

  // ----- Render -----

  const scale = displayScale();
  const cropDisplay = crop
    ? {
        left: crop.x * scale,
        top: crop.y * scale,
        width: crop.w * scale,
        height: crop.h * scale,
      }
    : null;

  return (
    <div className="fixed inset-0 bg-black/80 z-30 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-4xl flex flex-col max-h-[95vh]">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center">
          <h2 className="text-sm font-semibold text-slate-200">
            Crop image for{" "}
            <code className="text-slate-300">{beatId}</code>
          </h2>
          <span className="ml-3 text-xs text-slate-500">
            3:2 locked · drag to position · corners to resize
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-slate-400 hover:text-slate-200 text-sm"
          >
            close
          </button>
        </header>

        <div
          ref={wrapRef}
          className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0 bg-slate-950/60"
        >
          {!imageUrl && <div className="text-slate-500 text-sm">loading…</div>}
          {imageUrl && (
            <div
              className="relative inline-block select-none"
              style={{ touchAction: "none" }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt=""
                onLoad={onImgLoad}
                draggable={false}
                className="block max-w-full max-h-[70vh] object-contain"
              />

              {cropDisplay && (
                <>
                  {/* Dimming masks around the crop rectangle */}
                  <Mask
                    style={{
                      left: 0,
                      top: 0,
                      right: 0,
                      height: cropDisplay.top,
                    }}
                  />
                  <Mask
                    style={{
                      left: 0,
                      top: cropDisplay.top + cropDisplay.height,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                  <Mask
                    style={{
                      left: 0,
                      top: cropDisplay.top,
                      width: cropDisplay.left,
                      height: cropDisplay.height,
                    }}
                  />
                  <Mask
                    style={{
                      left: cropDisplay.left + cropDisplay.width,
                      top: cropDisplay.top,
                      right: 0,
                      height: cropDisplay.height,
                    }}
                  />

                  {/* Crop rectangle */}
                  <div
                    onMouseDown={startMove}
                    onTouchStart={startMove}
                    style={{
                      position: "absolute",
                      ...cropDisplay,
                      cursor: dragging?.mode === "move" ? "grabbing" : "grab",
                    }}
                    className="border-2 border-amber-400 box-border"
                  >
                    {/* Fade overlay on the rightmost third */}
                    <div
                      className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
                      style={{
                        left: "66.6667%",
                        right: 0,
                        background:
                          "linear-gradient(to right, rgba(15,23,42,0.15), rgba(15,23,42,0.85))",
                      }}
                    >
                      <span className="text-slate-100 text-xs uppercase tracking-[0.3em] font-semibold opacity-70">
                        fade
                      </span>
                    </div>

                    {/* Corner handles */}
                    {["nw", "ne", "sw", "se"].map((corner) => (
                      <Handle
                        key={corner}
                        corner={corner}
                        onStart={startResize(corner)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-slate-800 flex items-center gap-2">
          <span className="text-xs text-slate-500">
            output: <code>src/game/content/images/beats/{beatId}.jpg</code> ·
            committed to the content branch on confirm
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 text-sm rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!crop}
              className="px-3 py-1 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400 disabled:opacity-50"
            >
              crop & upload
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Mask({ style }) {
  return (
    <div
      style={{ position: "absolute", ...style, background: "rgba(2,6,23,0.6)" }}
    />
  );
}

function Handle({ corner, onStart }) {
  const pos = {
    nw: { left: -6, top: -6, cursor: "nwse-resize" },
    ne: { right: -6, top: -6, cursor: "nesw-resize" },
    sw: { left: -6, bottom: -6, cursor: "nesw-resize" },
    se: { right: -6, bottom: -6, cursor: "nwse-resize" },
  }[corner];
  return (
    <div
      onMouseDown={onStart}
      onTouchStart={onStart}
      style={{
        position: "absolute",
        width: 12,
        height: 12,
        background: "#f59e0b",
        border: "1px solid #0f172a",
        borderRadius: 2,
        ...pos,
      }}
    />
  );
}

// ----- Geometry -----

function initialCrop(w, h) {
  // Largest 3:2 rectangle that fits.
  let cw = w;
  let ch = cw / ASPECT;
  if (ch > h) {
    ch = h;
    cw = ch * ASPECT;
  }
  return {
    x: (w - cw) / 2,
    y: (h - ch) / 2,
    w: cw,
    h: ch,
  };
}

function anchorFor(corner, crop) {
  // The opposite corner stays fixed during resize.
  switch (corner) {
    case "se":
      return { x: crop.x, y: crop.y };
    case "sw":
      return { x: crop.x + crop.w, y: crop.y };
    case "ne":
      return { x: crop.x, y: crop.y + crop.h };
    case "nw":
      return { x: crop.x + crop.w, y: crop.y + crop.h };
    default:
      return { x: crop.x, y: crop.y };
  }
}

function resizeFromAnchor({ anchor, corner, pointer, natural }) {
  const MIN = 50; // minimum crop width in image pixels

  // Direction relative to anchor.
  const goingRight = corner === "se" || corner === "ne";
  const goingDown = corner === "se" || corner === "sw";

  let px = clamp(pointer.x, 0, natural.w);
  let py = clamp(pointer.y, 0, natural.h);

  let w = Math.abs(px - anchor.x);
  let h = Math.abs(py - anchor.y);

  // Lock to 3:2 by taking the larger constraint and recomputing the other.
  if (w / ASPECT >= h) {
    h = w / ASPECT;
  } else {
    w = h * ASPECT;
  }

  // Clamp against image bounds (the anchor stays fixed).
  if (goingRight) w = Math.min(w, natural.w - anchor.x);
  else w = Math.min(w, anchor.x);
  h = w / ASPECT;
  if (goingDown) h = Math.min(h, natural.h - anchor.y);
  else h = Math.min(h, anchor.y);
  w = h * ASPECT;

  if (w < MIN) return null;

  const x = goingRight ? anchor.x : anchor.x - w;
  const y = goingDown ? anchor.y : anchor.y - h;
  return { x, y, w, h };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pointerCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.clientX != null) return { clientX: e.clientX, clientY: e.clientY };
  return null;
}

// ----- Crop → JPEG blob -----

async function cropToBlob({ imageUrl, crop, natural }) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imageUrl;
  });

  // Output: at most MAX_OUTPUT_W × MAX_OUTPUT_H, preserving the crop's
  // native resolution if smaller. Aspect ratio is already 3:2.
  let outW = crop.w;
  let outH = crop.h;
  if (outW > MAX_OUTPUT_W) {
    outW = MAX_OUTPUT_W;
    outH = MAX_OUTPUT_H;
  }
  outW = Math.round(outW);
  outH = Math.round(outH);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    outW,
    outH,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
