export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
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
