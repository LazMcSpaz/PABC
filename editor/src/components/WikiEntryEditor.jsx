// Editor for a single wiki entry. Cross-links to other entries use the
// in-game `[[term]]` markup convention — author types `[[Menace]]` and
// the renderer turns it into a clickable lookup. The preview pane below
// shows what the entry will look like in-game (best-effort: it doesn't
// resolve real cross-link targets — it just highlights the markup so the
// author can spot typos).

import { useState } from "react";
import {
  Field,
  TextInput,
  TextArea,
  Select,
  SectionCard,
  IconButton,
  HelpTip,
} from "./Field.jsx";

const STARTER_CATEGORIES = ["Mechanics", "Geography & Story", "Factions"];

export function WikiEntryEditor({ value, onChange }) {
  const set = (key, v) => onChange({ ...value, [key]: v });

  // aliases are stored as an array of strings; the UI surfaces them as
  // a comma-separated text box for low-friction editing.
  const aliasesText = (value.aliases ?? []).join(", ");
  const onAliases = (text) => {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    set("aliases", parts);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Wiki entry">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="id"
            tip="wiki.id"
            hint="stable identifier — referenced by [[term]] markup as-is or via aliases"
          >
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="term (display)" tip="wiki.term">
            <TextInput
              value={value.term}
              onChange={(v) => set("term", v)}
              placeholder="e.g. Menace"
            />
          </Field>
          <Field
            label="aliases (comma-separated)"
            tip="wiki.aliases"
            className="col-span-2"
            hint='e.g. "ZoC, zone of control, control zone"'
          >
            <TextInput value={aliasesText} onChange={onAliases} />
          </Field>
          <Field label="category" tip="wiki.category">
            <CategoryPicker
              value={value.category}
              onChange={(v) => set("category", v)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Body"
        actions={<HelpTip k="wiki.body" />}
      >
        <Field label="body (supports [[other-term]] cross-links)">
          <TextArea
            value={value.body}
            onChange={(v) => set("body", v)}
            rows={10}
          />
        </Field>
        <BodyPreview body={value.body} />
      </SectionCard>
    </div>
  );
}

// Picker: starter categories as buttons + an "Other" input for custom ones.
function CategoryPicker({ value, onChange }) {
  const known = STARTER_CATEGORIES.includes(value);
  const [custom, setCustom] = useState(!known && value ? value : "");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STARTER_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`px-2 py-1 text-xs rounded border ${
            value === c
              ? "bg-amber-500 text-slate-950 border-amber-400 font-semibold"
              : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
          }`}
        >
          {c}
        </button>
      ))}
      <span className="text-xs text-slate-500">other:</span>
      <input
        type="text"
        value={custom}
        placeholder="custom"
        onChange={(e) => {
          setCustom(e.target.value);
          onChange(e.target.value || null);
        }}
        className="w-32"
      />
    </div>
  );
}

// Highlights `[[term]]` markup so authors can spot stray brackets and
// double-check cross-link targets without leaving the editor.
function BodyPreview({ body }) {
  if (!body) return null;
  const parts = splitMarkup(body);
  return (
    <div className="border border-slate-800 rounded bg-slate-950/40 p-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
        preview
      </div>
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <span
            key={i}
            className="text-amber-400 underline decoration-dotted underline-offset-2"
            title={`links to wiki entry "${p.target}"`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </div>
  );
}

function splitMarkup(text) {
  const out = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) != null) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    const target = m[1].trim();
    const display = (m[2] ?? m[1]).trim();
    out.push({ kind: "link", text: display, target });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
