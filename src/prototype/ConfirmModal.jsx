// Player-choice confirmation layer: a generic confirm dialog with a
// persistent "Don't show this again" option, plus the coalition picker
// that puts the contest rule's split-or-pool decision in the player's
// hands. Dismissals persist per browser via localStorage.
import React, { useState } from "react";
import { C } from "./HudChrome.jsx";

const PREFS_KEY = "ashland.dismissedPrompts";

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
}

export function isPromptDismissed(key) {
  return !!loadPrefs()[key];
}

export function dismissPrompt(key) {
  try {
    const p = loadPrefs();
    p[key] = true;
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* private mode etc. — session-only dismissal */ }
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 300,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(4, 10, 12, 0.72)",
};
const cardStyle = {
  minWidth: 320, maxWidth: 430, padding: 18, borderRadius: 10,
  border: "1px solid rgba(86,211,198,0.45)",
  background: "linear-gradient(180deg, #10201f, #0a1514)",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 24px rgba(86,211,198,0.15)",
  color: C.text, fontFamily: C.font,
};
const titleStyle = {
  fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase",
  color: C.holoHi, marginBottom: 10,
};
const btnBase = {
  fontFamily: C.font, fontSize: 12, fontWeight: 700, letterSpacing: 1,
  textTransform: "uppercase", padding: "8px 18px", borderRadius: 7, cursor: "pointer",
};

function DontShowAgain({ checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.textFaint, cursor: "pointer", marginTop: 12 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Don't show this again
    </label>
  );
}

// Generic confirmation. `prompt`: { title, body (string|node), confirmLabel,
// cancelLabel, dontShowKey, danger } — onConfirm/onCancel close it.
export function ConfirmModal({ prompt, onConfirm, onCancel }) {
  const [dontShow, setDontShow] = useState(false);
  if (!prompt) return null;
  const confirm = () => {
    if (dontShow && prompt.dontShowKey) dismissPrompt(prompt.dontShowKey);
    onConfirm?.();
  };
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>{prompt.title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.text }}>{prompt.body}</div>
        {prompt.dontShowKey && <DontShowAgain checked={dontShow} onChange={setDontShow} />}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="hud-int" onClick={onCancel}
            style={{ ...btnBase, color: C.text, border: "1px solid rgba(86,211,198,0.35)", background: "rgba(0,0,0,0.25)" }}>
            {prompt.cancelLabel || "Cancel"}
          </button>
          <button className="hud-int" onClick={confirm}
            style={{ ...btnBase, color: "#fff",
              border: `1px solid ${prompt.danger ? C.red : C.holo}`,
              background: prompt.danger
                ? "linear-gradient(180deg, #e2554c, #a3322c)"
                : "linear-gradient(180deg, #2e8f85, #1d5f58)" }}>
            {prompt.confirmLabel || "Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Coalition picker — the contest rule's core decision: every selected unit
// spends its action on this one contest; unselected units keep theirs.
// EVERY row is toggleable (nobody is "locked in" — the initiator is chosen
// at confirm time from the checked units that can still pay).
// `prompt`: { units: [{uid,name,strength,acted}...], defender: {name,
//   value, rollsDie}, wildcards, warnPeace: factionName|null }
// onConfirm(selectedUids) — the units taking part, in display order.
export function CoalitionModal({ prompt, onConfirm, onCancel }) {
  const [picked, setPicked] = useState(() => new Set((prompt?.units || []).map((a) => a.uid)));
  if (!prompt) return null;
  const toggle = (uid) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    return n;
  });
  const selected = prompt.units.filter((a) => picked.has(a.uid));
  const combined = selected.reduce((n, u) => n + u.strength, 0);
  const shortfall = selected.filter((u) => u.acted).length;
  const payable = selected.length > 0 && shortfall <= prompt.wildcards;
  const row = (u) => (
    <label key={u.uid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(86,211,198,0.2)", cursor: "pointer" }}>
      <input type="checkbox" checked={picked.has(u.uid)} onChange={() => toggle(u.uid)} />
      <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{u.name}</span>
      <span style={{ fontSize: 11.5, color: C.holoHi }}>Str {u.strength}</span>
      {u.acted && <span style={{ fontSize: 9.5, color: C.red }}>acted — needs wildcard</span>}
    </label>
  );
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>Commit forces</div>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 10, lineHeight: 1.5 }}>
          Every unit committed spends its action on this one contest.
          Units left out keep their actions — and still add concentration
          just by standing here.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {prompt.units.map(row)}
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          Combined Strength <b style={{ color: C.holoHi }}>{combined}</b> + 1d6
          {"  vs  "}
          <b style={{ color: C.text }}>{prompt.defender.name}</b>{" "}
          {prompt.defender.value}{prompt.defender.rollsDie ? " + 1d6" : " (no roll)"}
        </div>
        {prompt.warnPeace && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.red }}>
            You are not at war with {prompt.warnPeace} — attacking will cost
            Standing and raise your Menace.
          </div>
        )}
        {selected.length === 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.red }}>
            Commit at least one unit.
          </div>
        )}
        {selected.length > 0 && !payable && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.red }}>
            {shortfall} committed unit{shortfall === 1 ? " has" : "s have"} already
            acted, but you only hold {prompt.wildcards} wildcard action{prompt.wildcards === 1 ? "" : "s"}. Uncheck
            {shortfall === 1 ? " it" : " them"} to attack with the rest.
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="hud-int" onClick={onCancel}
            style={{ ...btnBase, color: C.text, border: "1px solid rgba(86,211,198,0.35)", background: "rgba(0,0,0,0.25)" }}>
            Cancel
          </button>
          <button className="hud-int" disabled={!payable}
            onClick={payable ? () => onConfirm?.(selected.map((a) => a.uid)) : undefined}
            style={{ ...btnBase, color: "#fff", border: `1px solid ${C.red}`,
              background: "linear-gradient(180deg, #e2554c, #a3322c)",
              opacity: payable ? 1 : 0.5, cursor: payable ? "pointer" : "not-allowed" }}>
            Attack{selected.length > 1 ? ` with ${selected.length} units` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
