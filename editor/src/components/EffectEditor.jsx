import {
  EFFECT_TYPES,
  DEFAULT_PARAMS_BY_TYPE,
  RESOURCE_KINDS,
  STAT_KINDS,
  STAT_DURATIONS,
  GRANT_WHEN,
  ENTITY_FLAGS,
  TRACKS,
  FACTION_IDS,
} from "../lib/schema.js";
import { RecipientPicker } from "./RecipientPicker.jsx";
import { DslBuilder } from "./DslBuilder.jsx";
import { HexFilterBuilder } from "./HexFilterBuilder.jsx";
import { HelpTip } from "./Field.jsx";
import { newId } from "../lib/id.js";

export function EffectList({ effects, onChange, context }) {
  const setAt = (i, e) => {
    const next = effects.slice();
    next[i] = e;
    onChange(next);
  };
  const remove = (i) => onChange(effects.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= effects.length) return;
    const next = effects.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const type = "ADJUST_RESOURCE";
    onChange([
      ...effects,
      {
        id: newId("eff"),
        type,
        params: structuredClone(DEFAULT_PARAMS_BY_TYPE[type]),
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-2">
      {effects.length === 0 && (
        <div className="text-xs text-slate-500">no effects</div>
      )}
      {effects.map((e, i) => (
        <EffectRow
          key={e.id ?? i}
          effect={e}
          context={context}
          onChange={(next) => setAt(i, next)}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0}
          canMoveDown={i < effects.length - 1}
        />
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700 hover:bg-slate-700"
      >
        + effect
      </button>
    </div>
  );
}

function EffectRow({
  effect,
  context,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}) {
  const setType = (type) => {
    onChange({
      ...effect,
      type,
      params: structuredClone(DEFAULT_PARAMS_BY_TYPE[type] ?? {}),
    });
  };

  const setParams = (params) => onChange({ ...effect, params });

  return (
    <div className="border border-slate-800 rounded p-3 bg-slate-950/40">
      <div className="flex items-center gap-2 mb-2">
        <select
          value={effect.type ?? ""}
          onChange={(e) => setType(e.target.value)}
          className="text-sm font-semibold"
        >
          {EFFECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-xs px-1 disabled:opacity-30"
            title="move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-xs px-1 disabled:opacity-30"
            title="move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-rose-400 hover:text-rose-300 px-1"
          >
            ×
          </button>
        </div>
      </div>
      <EffectParams type={effect.type} params={effect.params ?? {}} onChange={setParams} context={context} />
    </div>
  );
}

function ParamRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function NumberField({ value, onChange, width = "w-24" }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={width}
    />
  );
}

function TextField({ value, onChange, placeholder, width = "w-48" }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={width}
    />
  );
}

function PickList({ value, options, onChange }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function EffectParams({ type, params, onChange, context }) {
  const set = (key, val) => onChange({ ...params, [key]: val });

  switch (type) {
    case "ADJUST_RESOURCE":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="resource">
            <PickList value={params.resource} options={RESOURCE_KINDS} onChange={(v) => set("resource", v)} />
          </ParamRow>
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "MODIFY_STAT":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="stat">
            <PickList value={params.stat} options={STAT_KINDS} onChange={(v) => set("stat", v)} />
          </ParamRow>
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="duration">
            <PickList value={params.duration} options={STAT_DURATIONS} onChange={(v) => set("duration", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "GRANT_ACTIONS":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="when">
            <PickList value={params.when} options={GRANT_WHEN} onChange={(v) => set("when", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "MOVE_CARD":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="from">
            <TextField value={params.from} onChange={(v) => set("from", v)} placeholder="zone" />
          </ParamRow>
          <ParamRow label="to">
            <TextField value={params.to} onChange={(v) => set("to", v)} placeholder="zone" />
          </ParamRow>
          <ParamRow label="selector">
            <PickList
              value={params.selector}
              options={["top", "chosen", "random", "by_id", "all_matching"]}
              onChange={(v) => set("selector", v)}
            />
          </ParamRow>
          <ParamRow label="count">
            <NumberField value={params.count} onChange={(v) => set("count", v)} />
          </ParamRow>
          {params.selector === "by_id" && (
            <ParamRow label="id">
              <TextField value={params.id} onChange={(v) => set("id", v)} />
            </ParamRow>
          )}
          {params.selector === "all_matching" && (
            <ParamRow label="filter">
              <JsonField value={params.filter ?? {}} onChange={(v) => set("filter", v)} />
            </ParamRow>
          )}
        </div>
      );

    case "SET_FLAG":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="flag">
            <PickList value={params.flag} options={ENTITY_FLAGS} onChange={(v) => set("flag", v)} />
          </ParamRow>
          <ParamRow label="value">
            <PickList
              value={String(Boolean(params.value))}
              options={["true", "false"]}
              onChange={(v) => set("value", v === "true")}
            />
          </ParamRow>
          <ParamRow label="duration">
            <TextField value={params.duration} onChange={(v) => set("duration", v)} placeholder="e.g. this_turn" />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "TRANSFER":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="what">
            <PickList value={params.what} options={["resource", "card"]} onChange={(v) => set("what", v)} />
          </ParamRow>
          {params.what === "resource" && (
            <ParamRow label="resource">
              <TextField value={params.resource} onChange={(v) => set("resource", v)} placeholder="resource name" />
            </ParamRow>
          )}
          <ParamRow label="amount">
            <AmountOrToken value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="from">
            <RecipientPicker value={params.from} onChange={(v) => set("from", v)} />
          </ParamRow>
          <ParamRow label="to">
            <RecipientPicker value={params.to} onChange={(v) => set("to", v)} />
          </ParamRow>
        </div>
      );

    case "CONVERT":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="from">
            <TextField value={params.from} onChange={(v) => set("from", v)} placeholder="pool" />
          </ParamRow>
          <ParamRow label="to">
            <TextField value={params.to} onChange={(v) => set("to", v)} placeholder="pool" />
          </ParamRow>
          <ParamRow label="rate.cost">
            <NumberField
              value={params.rate?.cost}
              onChange={(v) => set("rate", { ...(params.rate ?? {}), cost: v })}
            />
          </ParamRow>
          <ParamRow label="rate.gain">
            <NumberField
              value={params.rate?.gain}
              onChange={(v) => set("rate", { ...(params.rate ?? {}), gain: v })}
            />
          </ParamRow>
          <ParamRow label="max">
            <NumberField value={params.max} onChange={(v) => set("max", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "SPAWN":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="source">
            <TextField value={params.source} onChange={(v) => set("source", v)} />
          </ParamRow>
          <ParamRow label="zone">
            <TextField value={params.zone} onChange={(v) => set("zone", v)} />
          </ParamRow>
          <ParamRow label="initialState">
            <JsonField value={params.initialState ?? {}} onChange={(v) => set("initialState", v)} />
          </ParamRow>
        </div>
      );

    case "PEEK":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="deck">
            <TextField value={params.deck} onChange={(v) => set("deck", v)} />
          </ParamRow>
          <ParamRow label="count">
            <NumberField value={params.count} onChange={(v) => set("count", v)} />
          </ParamRow>
          <ParamRow label="reorder">
            <PickList
              value={String(Boolean(params.reorder))}
              options={["true", "false"]}
              onChange={(v) => set("reorder", v === "true")}
            />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "FORCE_CHOICE":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="chooser">
            <RecipientPicker value={params.chooser} onChange={(v) => set("chooser", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">options</span>
            <ForceChoiceOptions
              options={params.options ?? []}
              onChange={(opts) => set("options", opts)}
              context={context}
            />
          </div>
        </div>
      );

    case "SURCHARGE":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="action">
            <TextField value={params.action} onChange={(v) => set("action", v)} />
          </ParamRow>
          <ParamRow label="extraCost">
            <NumberField value={params.extraCost} onChange={(v) => set("extraCost", v)} />
          </ParamRow>
          <ParamRow label="block">
            <PickList
              value={String(Boolean(params.block))}
              options={["true", "false"]}
              onChange={(v) => set("block", v === "true")}
            />
          </ParamRow>
          <ParamRow label="window">
            <TextField value={params.window} onChange={(v) => set("window", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "REDIRECT":
      return (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-amber-400">reaction-only</div>
          <ParamRow label="field">
            <PickList
              value={params.field}
              options={["recipient", "target", "amount"]}
              onChange={(v) => set("field", v)}
            />
          </ParamRow>
          <ParamRow label="operation">
            <PickList
              value={params.operation}
              options={["set", "scale", "clamp"]}
              onChange={(v) => set("operation", v)}
            />
          </ParamRow>
          <ParamRow label="value">
            <TextField value={params.value} onChange={(v) => set("value", v)} />
          </ParamRow>
        </div>
      );

    case "CANCEL":
      return (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-amber-400">reaction-only</div>
          <DslBuilder
            label="condition (optional)"
            value={params.condition ?? null}
            onChange={(v) => set("condition", v)}
            allowNull
          />
        </div>
      );

    case "ADJUST_TRACK":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="track">
            <PickList value={params.track} options={TRACKS} onChange={(v) => set("track", v)} />
          </ParamRow>
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    case "ADJUST_STANDING":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="faction">
            <PickList value={params.faction} options={FACTION_IDS} onChange={(v) => set("faction", v)} />
          </ParamRow>
          <ParamRow label="player">
            <RecipientPicker value={params.player} onChange={(v) => set("player", v)} />
          </ParamRow>
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
        </div>
      );

    case "SET_PLAYER_FLAG":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="flag">
            <TextField value={params.flag} onChange={(v) => set("flag", v)} />
          </ParamRow>
          <ParamRow label="value">
            <TextField
              value={typeof params.value === "string" ? params.value : JSON.stringify(params.value ?? true)}
              onChange={(v) => {
                let parsed;
                try {
                  parsed = JSON.parse(v);
                } catch {
                  parsed = v;
                }
                set("value", parsed);
              }}
            />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
          <ParamRow label="duration">
            <TextField value={params.duration} onChange={(v) => set("duration", v)} placeholder="optional" />
          </ParamRow>
        </div>
      );

    case "QUEUE_DEFERRED":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="delayRounds">
            <NumberField value={params.delayRounds} onChange={(v) => set("delayRounds", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">effects (deferred)</span>
            <div className="pl-4 border-l border-slate-800">
              <EffectList
                effects={params.effects ?? []}
                onChange={(effs) => set("effects", effs)}
                context={context}
              />
            </div>
          </div>
        </div>
      );

    case "START_QUEST":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="questId">
            <TextField value={params.questId} onChange={(v) => set("questId", v)} />
          </ParamRow>
          <ParamRow label="claimant">
            <RecipientPicker value={params.claimant} onChange={(v) => set("claimant", v)} />
          </ParamRow>
        </div>
      );

    case "ADVANCE_QUEST":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="questId">
            <TextField value={params.questId} onChange={(v) => set("questId", v)} />
          </ParamRow>
          <ParamRow label="beatId">
            <TextField value={params.beatId} onChange={(v) => set("beatId", v)} />
          </ParamRow>
        </div>
      );

    case "COMPLETE_QUEST":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="questId">
            <TextField value={params.questId} onChange={(v) => set("questId", v)} />
          </ParamRow>
        </div>
      );

    case "PLACE_ENCOUNTER":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="encounterId">
            <EncounterIdPicker
              value={params.encounterId}
              onChange={(v) => set("encounterId", v)}
              ids={context?.worldEncounterIds}
            />
          </ParamRow>
          <ParamRow label="hex">
            <TextField value={params.hex} onChange={(v) => set("hex", v)} />
          </ParamRow>
          <ParamRow label="expiresIn">
            <NumberField value={params.expiresIn} onChange={(v) => set("expiresIn", v)} />
          </ParamRow>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">hexFilter</span>
            <HexFilterBuilder
              value={params.hexFilter ?? null}
              onChange={(v) => set("hexFilter", v)}
            />
          </div>
        </div>
      );

    case "DELIVER_ENCOUNTER":
      return (
        <div className="flex flex-col gap-2">
          <ParamRow label="encounterId">
            <EncounterIdPicker
              value={params.encounterId}
              onChange={(v) => set("encounterId", v)}
              ids={context?.worldEncounterIds}
            />
          </ParamRow>
          <ParamRow label="mode">
            <PickList
              value={params.mode ?? ""}
              options={["", "private", "public"]}
              onChange={(v) => set("mode", v || null)}
            />
          </ParamRow>
          <ParamRow label="recipient">
            <RecipientPicker
              value={params.recipient}
              onChange={(v) => set("recipient", v)}
              allowEmpty
            />
          </ParamRow>
          <ParamRow label={<>gate <HelpTip k="deliver.condition" /></>}>
            <DslBuilder
              value={params.condition}
              onChange={(v) => set("condition", v)}
              allowNull
            />
          </ParamRow>
        </div>
      );

    case "ADJUST_BASE_STRENGTH":
      return (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500">
            Permanently wounds (−) or heals (+) a unit's base Strength = HP
            (clamped to [0, cap]; destroyed at 0). For a temporary combat
            buff instead, use <code>MODIFY_STAT</code> on Strength with a
            duration.
          </div>
          <ParamRow label="amount">
            <NumberField value={params.amount} onChange={(v) => set("amount", v)} />
          </ParamRow>
          <ParamRow label="target">
            <RecipientPicker value={params.target} onChange={(v) => set("target", v)} />
          </ParamRow>
        </div>
      );

    default:
      return <div className="text-xs text-rose-400">unknown effect type</div>;
  }
}

function AmountOrToken({ value, onChange }) {
  const isToken = value === "all" || value === "half";
  return (
    <div className="flex items-center gap-2">
      <select
        value={isToken ? value : "__num__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__num__") onChange(0);
          else onChange(v);
        }}
      >
        <option value="__num__">number</option>
        <option value="all">all</option>
        <option value="half">half</option>
      </select>
      {!isToken && (
        <NumberField value={value} onChange={onChange} />
      )}
    </div>
  );
}

function JsonField({ value, onChange }) {
  const text = JSON.stringify(value ?? {});
  return (
    <input
      type="text"
      defaultValue={text}
      onBlur={(e) => {
        try {
          onChange(JSON.parse(e.target.value || "{}"));
        } catch {
          // keep last valid
        }
      }}
      className="w-64 font-mono text-xs"
    />
  );
}

function EncounterIdPicker({ value, onChange, ids }) {
  if (!ids || ids.size === 0) {
    return <TextField value={value} onChange={onChange} placeholder="world_encounter id" />;
  }
  const known = Array.from(ids).sort();
  const inList = known.includes(value);
  return (
    <div className="flex items-center gap-2">
      <select
        value={inList ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {known.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {!inList && value && (
        <span className="text-xs text-rose-400" title="not an existing world_encounter">
          ⚠ {value}
        </span>
      )}
    </div>
  );
}

function ForceChoiceOptions({ options, onChange, context }) {
  const setAt = (i, o) => {
    const next = options.slice();
    next[i] = o;
    onChange(next);
  };
  const add = () =>
    onChange([...options, { label: "", effects: [] }]);
  const remove = (i) => onChange(options.filter((_, j) => j !== i));

  return (
    <div className="flex flex-col gap-2 pl-4 border-l border-slate-800">
      {options.map((o, i) => (
        <div key={i} className="border border-slate-800 rounded p-2 bg-slate-950/40 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={o.label ?? ""}
              placeholder="label"
              onChange={(e) => setAt(i, { ...o, label: e.target.value })}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-rose-400 hover:text-rose-300 text-xs"
            >
              ×
            </button>
          </div>
          <EffectList
            effects={o.effects ?? []}
            onChange={(effs) => setAt(i, { ...o, effects: effs })}
            context={context}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
      >
        + option
      </button>
    </div>
  );
}
