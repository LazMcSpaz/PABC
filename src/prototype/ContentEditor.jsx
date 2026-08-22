// Content Edit Mode's panel — rewrite a beat or an encounter from inside the
// running game, and see the change on the next card rather than the next
// build.
//
// The one design rule here: NOTHING is hand-listed per effect type. The last
// authoring tool (editor/src/lib/schema.js) kept a hand-maintained vocabulary
// and it rotted — as of today it is missing 26 of the engine's 49 effect
// types, including ROLL, CONTEST, ADJUST_HONOR and every diplomacy verb, so
// roughly a hundred effects in the live corpus cannot be represented in it at
// all. A list a human has to remember to update is a list that goes stale.
//
// So the form is derived from the data in front of it: every scalar parameter
// on an effect becomes an input, every parameter holding a list of effects
// becomes a nested, editable list, and anything else falls through to JSON.
// A new effect type is editable the day the engine gains it, with no change
// here. effectText.js does the same for the reading half, and
// check-content-editor.mjs asserts the coverage against the live engine so a
// gap fails a check rather than going quietly.
import { useEffect, useMemo, useState } from "react";
import { C } from "./HudChrome.jsx";
import { theme } from "./data.js";
import { describeEffect, describeCondition } from "./effectText.js";
import { setPatch, clearPatch, getPatch } from "../game/contentPatch.js";
import { resolveEntity, contentIndex } from "./contentEditExport.js";
import { savePatches } from "./contentEditMode.js";

const TONE = { good: theme.good, bad: theme.accent2, flat: C.textDim };

// Branch keys whose value is a list of further effects. Named because they
// are a shape, not a type: any effect carrying one gets a nested editor.
const BRANCH_KEYS = ["effects", "onWin", "onLose", "onSuccess", "onFail", "onMissed"];
const BRANCH_LABEL = {
  effects: "then", onWin: "if you win", onLose: "if you lose",
  onSuccess: "if it holds", onFail: "if it fails", onMissed: "if the deadline passes",
};
// Never offered as an editable field: identity and ordering are the editor's
// own bookkeeping, and renaming an id silently orphans every reference to it.
const HIDDEN_PARAMS = new Set(["type", "id", "ordinal"]);

const input = {
  width: "100%", background: "rgba(0,0,0,0.35)", color: C.text,
  border: "1px solid rgba(86,211,198,0.28)", borderRadius: 5,
  padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit",
};
const mono = { ...input, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 11.5, lineHeight: 1.45 };
const btn = {
  fontFamily: C.font, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
  textTransform: "uppercase", padding: "5px 10px", borderRadius: 5,
  border: `1px solid ${C.holo}66`, background: "rgba(86,211,198,0.08)",
  color: C.holoHi, cursor: "pointer",
};
const labelStyle = {
  fontFamily: C.font, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6,
  textTransform: "uppercase", color: C.textDim,
};

// A field that commits on blur rather than per keystroke: the patch store
// writes through to localStorage and re-derives every quest that reads it, and
// doing that on each character typed into a paragraph of prose is a lot of
// work to throw away.
function Committed({ value, onCommit, multiline, rows = 4, placeholder }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => { if ((draft ?? "") !== (value ?? "")) onCommit(draft); };
  const props = {
    value: draft, placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    style: multiline ? { ...input, minHeight: rows * 18, resize: "vertical" } : input,
  };
  return multiline ? <textarea {...props} rows={rows} /> : <input {...props} />;
}

// JSON with live validation. An unparseable draft is kept on screen and NOT
// committed — losing what someone half-typed because it did not parse yet is
// the fastest way to make an editor unusable.
function JsonField({ value, onCommit, rows = 3 }) {
  const serialised = value == null ? "" : JSON.stringify(value, null, 1);
  const [draft, setDraft] = useState(serialised);
  const [err, setErr] = useState(null);
  useEffect(() => { setDraft(serialised); setErr(null); }, [serialised]);
  const commit = () => {
    const t = draft.trim();
    if (t === "") { setErr(null); onCommit(null); return; }
    try { onCommit(JSON.parse(t)); setErr(null); } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <textarea
        value={draft} rows={rows}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        style={{ ...mono, borderColor: err ? theme.accent2 : mono.border, minHeight: rows * 16, resize: "vertical" }}
      />
      {err && <div style={{ fontSize: 10.5, color: theme.accent2, marginTop: 3 }}>{err} — not saved</div>}
    </div>
  );
}

function Row({ label, children, onRevert }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={labelStyle}>{label}</span>
        {onRevert && (
          <button className="hud-int" onClick={onRevert}
            style={{ ...btn, padding: "2px 7px", fontSize: 9, borderColor: "rgba(199,93,48,0.5)", color: theme.accent2, background: "transparent" }}>
            Revert
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// One effect. Scalars become inputs; nested effect lists become nested
// editors; everything else is JSON. Derived entirely from the value, so an
// effect type nobody has taught this file about is still fully editable.
function EffectRow({ effect, onChange, onRemove, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const d = describeEffect(effect);
  const scalars = Object.entries(effect).filter(
    ([k, v]) => !HIDDEN_PARAMS.has(k) && !BRANCH_KEYS.includes(k)
      && (typeof v === "number" || typeof v === "string" || typeof v === "boolean"));
  const others = Object.entries(effect).filter(
    ([k, v]) => !HIDDEN_PARAMS.has(k) && !BRANCH_KEYS.includes(k)
      && !(typeof v === "number" || typeof v === "string" || typeof v === "boolean"));
  const branches = BRANCH_KEYS.filter((k) => Array.isArray(effect[k]));

  const set = (k, v) => onChange({ ...effect, [k]: v });

  return (
    <div style={{
      border: "1px solid rgba(86,211,198,0.18)", borderRadius: 6,
      padding: "8px 10px", background: depth ? "rgba(0,0,0,0.18)" : "rgba(86,211,198,0.035)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <button className="hud-int" onClick={() => setOpen((o) => !o)}
          style={{ ...btn, padding: "3px 7px", fontSize: 9, flexShrink: 0 }}>{open ? "−" : "+"}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: TONE[d.tone] || C.text }}>{d.text}</div>
          <div style={{ fontFamily: C.font, fontSize: 9, letterSpacing: 1.2, color: C.textFaint, textTransform: "uppercase", marginTop: 2 }}>
            {effect.type}
          </div>
        </div>
        {onRemove && (
          <button className="hud-int" onClick={onRemove}
            style={{ ...btn, padding: "3px 7px", fontSize: 9, borderColor: "rgba(199,93,48,0.5)", color: theme.accent2, background: "transparent", flexShrink: 0 }}>
            ✕
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>
          {scalars.map(([k, v]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...labelStyle, width: 96, flexShrink: 0 }}>{k}</span>
              {typeof v === "number" ? (
                <>
                  <button className="hud-int" onClick={() => set(k, v - 1)} style={{ ...btn, padding: "3px 8px" }}>−</button>
                  <input type="number" value={v}
                    onChange={(e) => set(k, e.target.value === "" ? 0 : Number(e.target.value))}
                    style={{ ...input, width: 76, textAlign: "center" }} />
                  <button className="hud-int" onClick={() => set(k, v + 1)} style={{ ...btn, padding: "3px 8px" }}>+</button>
                </>
              ) : typeof v === "boolean" ? (
                <input type="checkbox" checked={v} onChange={(e) => set(k, e.target.checked)} />
              ) : (
                <input value={v} onChange={(e) => set(k, e.target.value)} style={input} />
              )}
            </label>
          ))}
          {others.map(([k, v]) => (
            <div key={k}>
              <span style={labelStyle}>{k}</span>
              <JsonField value={v} onCommit={(next) => set(k, next)} rows={2} />
            </div>
          ))}
          {branches.map((k) => (
            <div key={k} style={{ borderLeft: `2px solid ${C.holo}44`, paddingLeft: 9 }}>
              <span style={labelStyle}>{BRANCH_LABEL[k] || k}</span>
              <EffectList
                effects={effect[k]} depth={depth + 1}
                onChange={(next) => set(k, next)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EffectList({ effects, onChange, depth = 0 }) {
  const list = effects || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      {list.map((e, i) => (
        <EffectRow
          key={`${e.type}-${i}`} effect={e} depth={depth}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(list.filter((_, j) => j !== i))}
        />
      ))}
      {!list.length && (
        <div style={{ fontSize: 11.5, color: C.textFaint, fontStyle: "italic" }}>nothing — this choice is pure story</div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="hud-int" onClick={() => onChange([...list, { type: "ADJUST_RESOURCE", resource: "Resource", amount: 1, target: "active" }])} style={btn}>
          + scrap
        </button>
        <button className="hud-int" onClick={() => onChange([...list, { type: "ADJUST_STANDING", faction: "goldgrass", amount: 1, player: "active" }])} style={btn}>
          + standing
        </button>
        <button className="hud-int" onClick={() => onChange([...list, { type: "SET_PLAYER_FLAG", flag: "new_flag", value: true, target: "active", duration: "permanent" }])} style={btn}>
          + flag
        </button>
      </div>
    </div>
  );
}

// --- the browser -------------------------------------------------------

function Browser({ onPick, query, setQuery }) {
  const groups = useMemo(() => contentIndex(), []);
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !q
        || it.label.toLowerCase().includes(q)
        || it.id.toLowerCase().includes(q)
        || g.title.toLowerCase().includes(q)
        || (it.subtitle || "").toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length);

  return (
    <div>
      <input
        value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search quests, beats, encounters…"
        style={{ ...input, marginBottom: 12 }}
      />
      {shown.map((g) => (
        <div key={g.id} style={{ marginBottom: 14 }}>
          <div style={{ ...labelStyle, color: C.holoHi, marginBottom: 5 }}>{g.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {g.items.map((it) => (
              <button key={it.id} className="hud-int" onClick={() => onPick(it.id)}
                style={{
                  textAlign: "left", background: it.edited ? "rgba(232,169,63,0.10)" : "rgba(0,0,0,0.22)",
                  border: `1px solid ${it.edited ? "rgba(232,169,63,0.45)" : "rgba(86,211,198,0.18)"}`,
                  borderRadius: 5, padding: "7px 9px", cursor: "pointer", color: C.text,
                }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {it.edited && <span style={{ color: theme.accent }}>● </span>}{it.label}
                </div>
                {it.subtitle && (
                  <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{it.subtitle}…</div>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!shown.length && <div style={{ fontSize: 12, color: C.textFaint }}>Nothing matches.</div>}
    </div>
  );
}

// --- the editor --------------------------------------------------------

export default function ContentEditor({ entityId, onPick, onClose, onChanged }) {
  const [query, setQuery] = useState("");
  const [, bump] = useState(0);
  const entity = entityId ? resolveEntity(entityId) : null;

  const write = (change) => {
    setPatch(entityId, change);
    savePatches();
    bump((n) => n + 1);
    onChanged?.();
  };
  const revert = (field) => write({ [field]: undefined });
  const revertChoice = (cid, field) => write({ choices: { [cid]: { [field]: undefined } } });

  if (!entity) {
    return (
      // Addressable so the screenshot harness can drive the panel without
      // guessing at selectors — the first attempt at that grabbed the board's
      // zoom button and closed the window it was trying to type into.
      <div data-pc="content-editor" data-view="browser">
        <Browser onPick={onPick} query={query} setQuery={setQuery} />
      </div>
    );
  }

  const { live, source, patch, kind } = entity;
  const gateField = kind === "quest-beat" ? "deliverCondition" : "condition";
  const gate = live[gateField] ?? null;
  const dirty = (f) => patch && f in patch;
  const choiceDirty = (cid, f) => !!patch?.choices?.[cid] && f in patch.choices[cid];

  return (
    <div data-pc="content-editor" data-view="editor" data-entity={entityId}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <button className="hud-int" onClick={() => onPick(null)} style={btn}>← All content</button>
        {patch && (
          <button className="hud-int"
            onClick={() => { clearPatch(entityId); savePatches(); bump((n) => n + 1); onChanged?.(); }}
            style={{ ...btn, borderColor: "rgba(199,93,48,0.5)", color: theme.accent2, background: "transparent" }}>
            Revert everything
          </button>
        )}
      </div>

      <div style={{ fontFamily: C.font, fontSize: 17, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.holoHi, marginBottom: 2 }}>
        {entity.label}
      </div>
      <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 10.5, color: C.textFaint, marginBottom: 14 }}>
        {entityId}
      </div>

      <Row label={`Gate — ${dirty(gateField) ? "edited" : "as authored"}`} onRevert={dirty(gateField) ? () => revert(gateField) : null}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 5, fontStyle: "italic" }}>
          {describeCondition(gate)}
        </div>
        <JsonField value={gate} onCommit={(v) => write({ [gateField]: v })} rows={3} />
      </Row>

      <Row label={`Text — ${dirty("text") ? "edited" : "as authored"}`} onRevert={dirty("text") ? () => revert("text") : null}>
        <Committed value={live.text} multiline rows={6} onCommit={(v) => write({ text: v })} />
      </Row>

      <div style={{ ...labelStyle, color: C.holoHi, marginTop: 16, marginBottom: 6 }}>
        Choices ({(live.choices || []).length})
      </div>
      {(live.choices || []).map((c) => (
        <div key={c.id} style={{
          border: "1px solid rgba(86,211,198,0.22)", borderRadius: 7,
          padding: "10px 11px", marginBottom: 10, background: "rgba(0,0,0,0.18)",
        }}>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, color: C.textFaint, marginBottom: 6 }}>{c.id}</div>

          <Row label="Label" onRevert={choiceDirty(c.id, "label") ? () => revertChoice(c.id, "label") : null}>
            <Committed value={c.label} onCommit={(v) => write({ choices: { [c.id]: { label: v } } })} />
          </Row>

          <Row label="Outcome text — what the player reads afterwards"
            onRevert={choiceDirty(c.id, "outcomeText") ? () => revertChoice(c.id, "outcomeText") : null}>
            <Committed value={c.outcomeText} multiline rows={3}
              onCommit={(v) => write({ choices: { [c.id]: { outcomeText: v } } })} />
          </Row>

          <Row label="Shown only when" onRevert={choiceDirty(c.id, "condition") ? () => revertChoice(c.id, "condition") : null}>
            <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 4, fontStyle: "italic" }}>
              {describeCondition(c.condition ?? null)}
            </div>
            <JsonField value={c.condition ?? null} onCommit={(v) => write({ choices: { [c.id]: { condition: v } } })} rows={2} />
          </Row>

          <Row label="Grants and costs" onRevert={choiceDirty(c.id, "effects") ? () => revertChoice(c.id, "effects") : null}>
            <EffectList
              effects={c.effects}
              onChange={(next) => write({ choices: { [c.id]: { effects: next } } })}
            />
          </Row>
        </div>
      ))}

      <Row label="Note for the changelog — free text, goes in the export">
        <Committed value={patch?.note} multiline rows={3}
          placeholder="Why this changed. Reads back to you in the exported file."
          onCommit={(v) => write({ note: v || undefined })} />
      </Row>

      <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8, lineHeight: 1.5 }}>
        Edits apply to this session immediately — the next time this card is
        drawn it uses them. The shipped content is untouched; leaving Content
        Edit Mode downloads the change file.
      </div>
      {onClose && (
        <button className="hud-int" onClick={onClose} style={{ ...btn, marginTop: 12, padding: "8px 18px", fontSize: 12 }}>
          Done
        </button>
      )}
    </div>
  );
}
