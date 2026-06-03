// "+ variable" button that inserts a {kind:selector} token at the
// current cursor position of an associated input/textarea. Authors
// don't need to memorise syntax — they pick from a labelled list.
//
// Usage:
//   const ref = useRef(null);
//   <TextArea inputRef={ref} value={...} onChange={...} />
//   <VariablePicker targetRef={ref} onInsert={(next) => onChange(next)} />

import { useEffect, useRef, useState } from "react";
import { TEXT_TOKENS } from "../lib/textTokens.js";

export function VariablePicker({ targetRef, onInsert }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const insert = (token) => {
    const el = targetRef?.current;
    if (!el) {
      // Fall back to append.
      onInsert((prev) => (prev ?? "") + token);
      setOpen(false);
      return;
    }
    const value = el.value ?? "";
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onInsert(next);
    setOpen(false);
    // Restore focus + place caret after the inserted token.
    requestAnimationFrame(() => {
      try {
        el.focus();
        const caret = start + token.length;
        el.setSelectionRange(caret, caret);
      } catch {}
    });
  };

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded border ${
          open
            ? "bg-amber-500 text-slate-950 border-amber-400"
            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
        }`}
      >
        + variable
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-72 max-w-[88vw] rounded border border-slate-700 bg-slate-950 shadow-lg p-2 flex flex-col gap-2 max-h-[60vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500 leading-relaxed normal-case">
            <span className="uppercase tracking-wider">Insert at cursor.</span>{" "}
            <span className="normal-case tracking-normal text-slate-400">
              Resolves at display time to whatever fits the game state then —
              e.g. <code className="text-amber-400">{"{faction:lowest-standing-with-active}"}</code> picks
              the faction that likes the active player least.
            </span>
          </div>
          {TEXT_TOKENS.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wider text-amber-400/80 px-1">
                {g.group}
              </div>
              {g.items.map((it) => (
                <button
                  key={it.token}
                  type="button"
                  onClick={() => insert(it.token)}
                  className="block text-left px-2 py-1.5 rounded hover:bg-slate-800 text-xs text-slate-200"
                  style={{ minHeight: 36 }}
                >
                  <div className="font-mono text-amber-300 text-[11px]">{it.token}</div>
                  <div className="text-[11px] text-slate-400 normal-case tracking-normal">
                    {it.label}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
