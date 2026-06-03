import { useState } from "react";
import {
  DSL_OPS,
  DSL_PATHS,
  SCORE_KINDS,
  CHIP_HOLDERS,
  FACTION_IDS,
} from "../lib/schema.js";
import { emptyCond, condForm } from "../lib/dsl.js";
import { RecipientPicker } from "./RecipientPicker.jsx";
import { HelpTip } from "./Field.jsx";

const FORM_LABELS = {
  all: "ALL (and)",
  any: "ANY (or)",
  not: "NOT",
  op: "compare",
  has_flag: "has_flag",
  quest_active: "quest_active",
  quest_completed: "quest_completed",
  controls_count: "controls_count (int)",
  control_duration: "control_duration (int)",
  has_chip: "has_chip",
  unit_count: "unit_count (int)",
  score: "score (int)",
  literal: "literal true/false",
};

const FORM_TIP_KEYS = {
  op: "dsl.op",
  has_flag: "dsl.has_flag",
  has_chip: "dsl.has_chip",
  unit_count: "dsl.unit_count",
  score: "dsl.score",
  controls_count: "dsl.controls_count",
};

export function DslBuilder({ value, onChange, allowNull = false, label }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2">
        {label && <span className="text-xs text-slate-400">{label}</span>}
        <button
          type="button"
          className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={() => onChange(emptyCond("op"))}
        >
          + add condition
        </button>
      </div>
    );
  }

  return (
    <div className="border border-slate-800 rounded p-3 bg-slate-950/40 flex flex-col gap-2">
      {label && <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>}
      <CondNode value={value} onChange={onChange} />
      {allowNull && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="self-start text-xs text-rose-400 hover:text-rose-300"
        >
          clear condition
        </button>
      )}
    </div>
  );
}

function CondNode({ value, onChange }) {
  const form = condForm(value);
  const tipKey = FORM_TIP_KEYS[form];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={form}
          onChange={(e) => onChange(emptyCond(e.target.value))}
          className="text-xs"
        >
          {Object.entries(FORM_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </select>
        {tipKey && <HelpTip k={tipKey} />}
      </div>
      <FormBody form={form} value={value} onChange={onChange} />
    </div>
  );
}

function FormBody({ form, value, onChange }) {
  switch (form) {
    case "all":
    case "any":
      return <ListBody form={form} value={value} onChange={onChange} />;
    case "not":
      return (
        <div className="pl-4 border-l border-slate-800">
          <CondNode value={value.not} onChange={(v) => onChange({ not: v })} />
        </div>
      );
    case "op":
      return <OpBody value={value} onChange={onChange} />;
    case "has_flag":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="player">
            <RecipientPicker
              value={value.has_flag?.player}
              onChange={(v) =>
                onChange({ has_flag: { ...value.has_flag, player: v } })
              }
            />
          </Row>
          <Row label="flag">
            <input
              type="text"
              value={value.has_flag?.flag ?? ""}
              onChange={(e) =>
                onChange({ has_flag: { ...value.has_flag, flag: e.target.value } })
              }
              className="w-48"
            />
          </Row>
        </div>
      );
    case "quest_active":
      return (
        <div className="pl-4 border-l border-slate-800">
          <Row label="questId">
            <input
              type="text"
              value={value.quest_active ?? ""}
              onChange={(e) => onChange({ quest_active: e.target.value })}
              className="w-64"
            />
          </Row>
        </div>
      );
    case "quest_completed":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="player">
            <RecipientPicker
              value={value.quest_completed?.player}
              onChange={(v) =>
                onChange({
                  quest_completed: { ...value.quest_completed, player: v },
                })
              }
            />
          </Row>
          <Row label="questId">
            <input
              type="text"
              value={value.quest_completed?.questId ?? ""}
              onChange={(e) =>
                onChange({
                  quest_completed: { ...value.quest_completed, questId: e.target.value },
                })
              }
              className="w-64"
            />
          </Row>
        </div>
      );
    case "controls_count":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="player">
            <RecipientPicker
              value={value.controls_count?.player}
              onChange={(v) =>
                onChange({ controls_count: { ...value.controls_count, player: v } })
              }
            />
          </Row>
          <Row label="strategicValue">
            <select
              value={value.controls_count?.strategicValue ?? ""}
              onChange={(e) =>
                onChange({
                  controls_count: {
                    ...value.controls_count,
                    strategicValue: e.target.value || undefined,
                  },
                })
              }
            >
              <option value="">(any)</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="veryHigh">veryHigh</option>
            </select>
          </Row>
        </div>
      );
    case "control_duration":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="player">
            <RecipientPicker
              value={value.control_duration?.player}
              onChange={(v) =>
                onChange({ control_duration: { ...value.control_duration, player: v } })
              }
            />
          </Row>
          <Row label="hex">
            <input
              type="text"
              value={value.control_duration?.hex ?? ""}
              onChange={(e) =>
                onChange({
                  control_duration: { ...value.control_duration, hex: e.target.value },
                })
              }
              className="w-32"
            />
          </Row>
        </div>
      );
    case "has_chip":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="holder">
            <select
              value={value.has_chip?.holder ?? "active-player-units"}
              onChange={(e) =>
                onChange({ has_chip: { ...value.has_chip, holder: e.target.value } })
              }
            >
              {CHIP_HOLDERS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </Row>
          <Row label="chipId">
            <input
              type="text"
              value={value.has_chip?.chipId ?? ""}
              placeholder="e.g. medic, training_grounds"
              onChange={(e) =>
                onChange({ has_chip: { ...value.has_chip, chipId: e.target.value } })
              }
              className="w-48"
            />
          </Row>
          {(value.has_chip?.holder ?? "").startsWith("active-player") && (
            <Row label="player">
              <RecipientPicker
                value={value.has_chip?.player ?? "active"}
                onChange={(v) =>
                  onChange({ has_chip: { ...value.has_chip, player: v } })
                }
              />
            </Row>
          )}
          {(value.has_chip?.holder ?? "").endsWith("-on-hex") && (
            <Row label="hex">
              <input
                type="text"
                value={value.has_chip?.hex ?? ""}
                placeholder="hex id or state path"
                onChange={(e) =>
                  onChange({ has_chip: { ...value.has_chip, hex: e.target.value } })
                }
                className="w-48"
              />
            </Row>
          )}
        </div>
      );
    case "unit_count":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="player">
            <RecipientPicker
              value={value.unit_count?.player ?? "active"}
              onChange={(v) =>
                onChange({ unit_count: { ...value.unit_count, player: v } })
              }
            />
          </Row>
          <Row label="unitType">
            <input
              type="text"
              value={value.unit_count?.unitType ?? ""}
              placeholder="(any) — or specific type id"
              onChange={(e) =>
                onChange({
                  unit_count: {
                    ...value.unit_count,
                    unitType: e.target.value || undefined,
                  },
                })
              }
              className="w-48"
            />
          </Row>
        </div>
      );
    case "score":
      return (
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
          <Row label="kind">
            <select
              value={value.score?.kind ?? "menace"}
              onChange={(e) =>
                onChange({ score: { ...value.score, kind: e.target.value } })
              }
            >
              {SCORE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Row>
          {(value.score?.kind === "menace" ||
            value.score?.kind === "honor" ||
            value.score?.kind === "recognition") && (
            <Row label="player">
              <RecipientPicker
                value={value.score?.player ?? "active"}
                onChange={(v) =>
                  onChange({ score: { ...value.score, player: v } })
                }
              />
            </Row>
          )}
          {value.score?.kind === "standing" && (
            <>
              <Row label="fromFaction">
                <RecipientPicker
                  value={value.score?.fromFaction ?? "active"}
                  onChange={(v) =>
                    onChange({ score: { ...value.score, fromFaction: v } })
                  }
                />
              </Row>
              <Row label="toFaction">
                <RecipientPicker
                  value={value.score?.toFaction}
                  onChange={(v) =>
                    onChange({ score: { ...value.score, toFaction: v } })
                  }
                />
              </Row>
            </>
          )}
          {value.score?.kind === "tolerance" && (
            <>
              <Row label="observer">
                <RecipientPicker
                  value={value.score?.observer ?? "active"}
                  onChange={(v) =>
                    onChange({ score: { ...value.score, observer: v } })
                  }
                />
              </Row>
              <Row label="toward">
                <RecipientPicker
                  value={value.score?.toward}
                  onChange={(v) =>
                    onChange({ score: { ...value.score, toward: v } })
                  }
                />
              </Row>
            </>
          )}
          {value.score?.kind === "trust_floor" && (
            <Row label="observer">
              <RecipientPicker
                value={value.score?.observer ?? "active"}
                onChange={(v) =>
                  onChange({ score: { ...value.score, observer: v } })
                }
              />
            </Row>
          )}
        </div>
      );
    case "literal":
      return (
        <div className="pl-4 border-l border-slate-800">
          <select
            value={value === true ? "true" : "false"}
            onChange={(e) => onChange(e.target.value === "true")}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      );
    default:
      return <pre className="text-xs text-rose-400">unknown form</pre>;
  }
}

function ListBody({ form, value, onChange }) {
  const items = Array.isArray(value[form]) ? value[form] : [];
  const setItems = (next) => onChange({ [form]: next });

  return (
    <div className="pl-4 border-l border-slate-800 flex flex-col gap-2">
      {items.length === 0 && <div className="text-xs text-slate-500">empty</div>}
      {items.map((sub, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-xs text-slate-500 w-6 pt-1">{i}</span>
          <div className="flex-1">
            <CondNode
              value={sub}
              onChange={(v) => {
                const next = items.slice();
                next[i] = v;
                setItems(next);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            className="text-rose-400 hover:text-rose-300 text-xs"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems([...items, emptyCond("op")])}
        className="self-start px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
      >
        + item
      </button>
    </div>
  );
}

function OpBody({ value, onChange }) {
  return (
    <div className="pl-4 border-l border-slate-800 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ValueEditor
          value={value.left}
          onChange={(v) => onChange({ ...value, left: v })}
        />
        <select
          value={value.op}
          onChange={(e) => onChange({ ...value, op: e.target.value })}
        >
          {DSL_OPS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <ValueEditor
          value={value.right}
          onChange={(v) => onChange({ ...value, right: v })}
        />
      </div>
    </div>
  );
}

function ValueEditor({ value, onChange }) {
  const kind = valueKind(value);
  const [expanded, setExpanded] = useState(false);

  const changeKind = (k) => {
    if (k === "number") onChange(0);
    else if (k === "string") onChange("");
    else if (k === "bool") onChange(true);
    else if (k === "path") onChange(DSL_PATHS[0]);
    else if (k === "cond") onChange({ controls_count: { player: "active" } });
  };

  return (
    <div className="inline-flex items-center gap-1">
      <select value={kind} onChange={(e) => changeKind(e.target.value)} className="text-xs">
        <option value="number">number</option>
        <option value="string">string</option>
        <option value="bool">bool</option>
        <option value="path">path</option>
        <option value="cond">subcond</option>
      </select>
      {kind === "number" && (
        <input
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20"
        />
      )}
      {kind === "string" && (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-32"
        />
      )}
      {kind === "bool" && (
        <select
          value={value ? "true" : "false"}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}
      {kind === "path" && (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
        >
          {DSL_PATHS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
      {kind === "cond" && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="text-xs px-1 rounded bg-slate-800 border border-slate-700"
          >
            {expanded ? "−" : "+"} {condForm(value)}
          </button>
          {expanded && (
            <div className="ml-2 mt-2 p-2 border border-slate-800 rounded bg-slate-950/40 w-full">
              <CondNode value={value} onChange={onChange} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function valueKind(v) {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") {
    if (DSL_PATHS.includes(v) || v.includes(".")) return "path";
    return "string";
  }
  if (v && typeof v === "object") return "cond";
  return "number";
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-24">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ----- Strength builder (1..5 or {if: cascade}) -----

export function StrengthBuilder({ value, onChange }) {
  if (value == null) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700"
      >
        + add strength
      </button>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="text-sm"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
          onClick={() => onChange({ if: [emptyCond("op"), 5, 1] })}
        >
          convert to cascade
        </button>
      </div>
    );
  }

  // Cascade
  const arr = value.if ?? [];
  const setArr = (next) => onChange({ if: next });

  const pairCount = Math.floor(arr.length / 2);
  const fallback = arr.length > 0 ? arr[arr.length - 1] : 1;

  return (
    <div className="flex flex-col gap-2 border border-slate-800 rounded p-2 bg-slate-950/40">
      {Array.from({ length: pairCount }).map((_, i) => {
        const cond = arr[i * 2];
        const v = arr[i * 2 + 1];
        return (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs text-slate-500 mt-2">if</span>
            <div className="flex-1">
              <CondNode
                value={cond}
                onChange={(nv) => {
                  const next = arr.slice();
                  next[i * 2] = nv;
                  setArr(next);
                }}
              />
            </div>
            <span className="text-xs text-slate-500 mt-2">→</span>
            <select
              value={typeof v === "number" ? v : 1}
              onChange={(e) => {
                const next = arr.slice();
                next[i * 2 + 1] = Number(e.target.value);
                setArr(next);
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const next = arr.slice();
                next.splice(i * 2, 2);
                setArr(next);
              }}
              className="text-rose-400 hover:text-rose-300 text-xs"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">else</span>
        <select
          value={typeof fallback === "number" ? fallback : 1}
          onChange={(e) => {
            const next = arr.length > 0 ? arr.slice() : [1];
            next[next.length - 1] = Number(e.target.value);
            setArr(next);
          }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = arr.slice();
            const fb = next.length > 0 ? next.pop() : 1;
            next.push(emptyCond("op"), 1, fb);
            setArr(next);
          }}
          className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
        >
          + clause
        </button>
        <button
          type="button"
          onClick={() => onChange(1)}
          className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
        >
          collapse to constant
        </button>
      </div>
    </div>
  );
}
