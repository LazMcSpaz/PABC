import { DslBuilder } from "./DslBuilder.jsx";
import { EffectList } from "./EffectEditor.jsx";
import { newId } from "../lib/id.js";

export function ChoiceList({ choices, onChange, context, maxChoices = 3 }) {
  const setAt = (i, c) => {
    const next = choices.slice();
    next[i] = c;
    onChange(next);
  };
  const remove = (i) => onChange(choices.filter((_, j) => j !== i));
  const add = () =>
    onChange([
      ...choices,
      {
        id: newId("ch"),
        label: "",
        outcomeText: "",
        condition: null,
        deferredDelay: null,
        effects: [],
      },
    ]);

  return (
    <div className="flex flex-col gap-3">
      {choices.length === 0 && (
        <div className="text-xs text-slate-500">no choices</div>
      )}
      {choices.map((c, i) => (
        <div
          key={c.id ?? i}
          className="border border-slate-800 rounded-lg p-3 bg-slate-900/30 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">#{i}</span>
            <input
              type="text"
              value={c.label ?? ""}
              placeholder="choice label"
              onChange={(e) => setAt(i, { ...c, label: e.target.value })}
              className="flex-1 font-semibold"
            />
            <div className="flex items-center gap-1">
              <label className="text-xs text-slate-400">defer rounds</label>
              <input
                type="number"
                value={c.deferredDelay ?? ""}
                placeholder=""
                onChange={(e) =>
                  setAt(i, {
                    ...c,
                    deferredDelay: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-16"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-rose-400 hover:text-rose-300 text-xs"
            >
              remove
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              outcome text (narrative shown after choosing)
            </span>
            <textarea
              value={c.outcomeText ?? ""}
              onChange={(e) => setAt(i, { ...c, outcomeText: e.target.value })}
              rows={3}
              placeholder="What the player sees after picking this choice. Effects fire alongside."
              className="w-full"
            />
          </label>

          <DslBuilder
            label="condition (optional — hides choice if false)"
            value={c.condition}
            onChange={(v) => setAt(i, { ...c, condition: v })}
            allowNull
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">effects</span>
            <EffectList
              effects={c.effects ?? []}
              onChange={(effs) => setAt(i, { ...c, effects: effs })}
              context={context}
            />
          </div>
        </div>
      ))}
      {choices.length < maxChoices && (
        <button
          type="button"
          onClick={add}
          className="self-start px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700 hover:bg-slate-700"
        >
          + choice
        </button>
      )}
    </div>
  );
}
