import {
  HEX_TYPE_OPTIONS,
  STRATEGIC_VALUE_OPTIONS,
  FACTION_IDS,
} from "../lib/schema.js";

export function HexFilterBuilder({ value, onChange, allowNull = true }) {
  const filter = value ?? {};

  const set = (key, v) => {
    const next = { ...filter };
    if (v == null || v === "") delete next[key];
    else next[key] = v;
    onChange(Object.keys(next).length === 0 && allowNull ? null : next);
  };

  return (
    <div className="border border-slate-800 rounded p-3 bg-slate-950/40 flex flex-col gap-2">
      <div className="text-xs text-slate-500">
        all fields optional, AND-ed; empty matches any hex
      </div>

      <Row label="type">
        <select value={filter.type ?? ""} onChange={(e) => set("type", e.target.value || null)}>
          <option value="">(any)</option>
          {HEX_TYPE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>

      <Row label="controlledBy">
        <ControlledByPicker
          value={filter.controlledBy}
          options={["neutral", "any-player", "any", ...FACTION_IDS]}
          onChange={(v) => set("controlledBy", v)}
        />
      </Row>

      <Row label="notControlledBy">
        <ControlledByPicker
          value={filter.notControlledBy}
          options={["any-player", ...FACTION_IDS]}
          onChange={(v) => set("notControlledBy", v)}
        />
      </Row>

      <Row label="withinHexesOf">
        <HexRangePicker
          value={filter.withinHexesOf}
          onChange={(v) => set("withinHexesOf", v)}
        />
      </Row>

      <Row label="outsideHexesOf">
        <HexRangePicker
          value={filter.outsideHexesOf}
          onChange={(v) => set("outsideHexesOf", v)}
        />
      </Row>

      <Row label="hasChip">
        <input
          type="text"
          value={filter.hasChip ?? ""}
          placeholder="chip id"
          onChange={(e) => set("hasChip", e.target.value || null)}
        />
      </Row>

      <Row label="notHasChip">
        <input
          type="text"
          value={filter.notHasChip ?? ""}
          placeholder="chip id"
          onChange={(e) => set("notHasChip", e.target.value || null)}
        />
      </Row>

      <Row label="factionAffiliation">
        <select
          value={filter.factionAffiliation ?? ""}
          onChange={(e) => set("factionAffiliation", e.target.value || null)}
        >
          <option value="">(any)</option>
          {["unaffiliated", "any", ...FACTION_IDS].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>

      <Row label="strategicValue">
        <select
          value={filter.strategicValue ?? ""}
          onChange={(e) => set("strategicValue", e.target.value || null)}
        >
          <option value="">(any)</option>
          {STRATEGIC_VALUE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>

      <Row label="hasAbility">
        <input
          type="text"
          value={filter.hasAbility ?? ""}
          placeholder="ability id, 'any', or 'none'"
          onChange={(e) => set("hasAbility", e.target.value || null)}
        />
      </Row>

      {allowNull && Object.keys(filter).length > 0 && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="self-start text-xs text-rose-400 hover:text-rose-300"
        >
          clear filter
        </button>
      )}
    </div>
  );
}

function ControlledByPicker({ value, options, onChange }) {
  const isToken = value == null || options.includes(value);
  return (
    <div className="flex items-center gap-2">
      <select
        value={isToken ? value ?? "" : "__custom__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(null);
          else if (v === "__custom__") onChange(value ?? "");
          else onChange(v);
        }}
      >
        <option value="">(any)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__custom__">custom pid…</option>
      </select>
      {!isToken && (
        <input
          type="text"
          value={value ?? ""}
          placeholder="pid"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function HexRangePicker({ value, onChange }) {
  const hex = value?.hex ?? "";
  const range = value?.range ?? "";
  const empty = !hex && range === "";

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={hex}
        placeholder="hex id"
        onChange={(e) => {
          const v = e.target.value;
          if (!v && range === "") onChange(null);
          else onChange({ hex: v, range: Number(range) || 0 });
        }}
        className="w-24"
      />
      <span className="text-xs text-slate-500">range</span>
      <input
        type="number"
        value={range}
        onChange={(e) => {
          const r = e.target.value;
          if (!hex && r === "") onChange(null);
          else onChange({ hex, range: Number(r) || 0 });
        }}
        className="w-20"
      />
      {!empty && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-rose-400 hover:text-rose-300 text-xs"
        >
          ×
        </button>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      <div>{children}</div>
    </div>
  );
}
