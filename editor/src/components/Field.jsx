import { useEffect, useRef, useState } from "react";
import { tip as tipFor } from "../lib/tips.js";

// `tip` is a key in tips.js — the lookup happens here so call sites
// stay compact (`tip="trigger.condition"` rather than spelling out the
// body inline).
export function Field({ label, hint, tip, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs uppercase tracking-wide text-slate-400 inline-flex items-center gap-1">
        {label}
        {tip && <HelpTip k={tip} />}
      </span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// "?" affordance. Tap (mobile) or click (desktop) opens a popover with
// the help text — `title` attributes don't fire on touch, so the old
// hover-only behaviour was invisible on phone.
//
// `k` is a tips.js key, `body` is raw override text.
export function HelpTip({ k, body }) {
  const text = body ?? (k ? tipFor(k) : null);
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

  if (!text) return null;
  return (
    <span ref={rootRef} className="relative inline-flex items-center" onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        onClick={(e) => {
          // Stop the surrounding <label> from focusing its child input.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="help"
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold leading-none cursor-help select-none border ${
          open
            ? "bg-amber-500 text-slate-950 border-amber-400"
            : "bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"
        }`}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-30 w-64 max-w-[80vw] rounded border border-slate-700 bg-slate-950 text-slate-200 text-xs leading-relaxed p-2 shadow-lg normal-case tracking-normal"
          style={{ fontWeight: 400 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function TextInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full ${className}`}
    />
  );
}

export function NumberInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Number(v));
      }}
      className={`w-32 ${className}`}
    />
  );
}

export function Select({ value, onChange, options, includeBlank = false, className = "" }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={className}
    >
      {includeBlank && <option value="">—</option>}
      {options.map((opt) => {
        if (typeof opt === "string") {
          return (
            <option key={opt} value={opt}>
              {opt}
            </option>
          );
        }
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Toggle({ value, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-amber-500"
      />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

export function TextArea({ value, onChange, rows = 4, placeholder = "" }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full"
    />
  );
}

export function SectionCard({ title, children, actions }) {
  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      {(title || actions) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function IconButton({ onClick, children, title, variant = "default" }) {
  const styles = {
    default: "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700",
    danger: "bg-rose-900/60 hover:bg-rose-800 text-rose-100 border-rose-800",
    primary: "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 font-semibold",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded border ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
