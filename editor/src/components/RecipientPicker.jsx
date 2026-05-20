import {
  SIMPLE_RECIPIENT_TOKENS,
  PARAMETERISED_RECIPIENT_TEMPLATES,
  FACTION_IDS,
} from "../lib/schema.js";
import { parseRecipient, buildRecipient } from "../lib/recipient.js";

export function RecipientPicker({ value, onChange, allowEmpty = false }) {
  const parsed = parseRecipient(value);

  const kindOptions = [
    ...(allowEmpty ? [{ value: "empty", label: "—" }] : []),
    { value: "simple", label: "Simple token" },
    { value: "parameterised", label: "Parameterised" },
    { value: "faction", label: "Faction id" },
  ];

  const changeKind = (kind) => {
    if (kind === "empty") onChange("");
    else if (kind === "simple") onChange(buildRecipient({ kind: "simple", token: SIMPLE_RECIPIENT_TOKENS[0] }));
    else if (kind === "parameterised")
      onChange(
        buildRecipient({
          kind: "parameterised",
          template: PARAMETERISED_RECIPIENT_TEMPLATES[0],
          arg: "",
        }),
      );
    else if (kind === "faction")
      onChange(buildRecipient({ kind: "faction", fid: FACTION_IDS[0] }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={parsed.kind} onChange={(e) => changeKind(e.target.value)}>
        {kindOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {parsed.kind === "simple" && (
        <select
          value={parsed.token}
          onChange={(e) =>
            onChange(buildRecipient({ kind: "simple", token: e.target.value }))
          }
        >
          {SIMPLE_RECIPIENT_TOKENS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      {parsed.kind === "faction" && (
        <select
          value={parsed.fid}
          onChange={(e) =>
            onChange(buildRecipient({ kind: "faction", fid: e.target.value }))
          }
        >
          {FACTION_IDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}

      {parsed.kind === "parameterised" && (
        <>
          <select
            value={parsed.template}
            onChange={(e) =>
              onChange(
                buildRecipient({
                  kind: "parameterised",
                  template: e.target.value,
                  arg: parsed.arg,
                }),
              )
            }
          >
            {PARAMETERISED_RECIPIENT_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={parsed.arg ?? ""}
            placeholder={parsed.template.includes("hex") ? "hex id" : "faction id"}
            onChange={(e) =>
              onChange(
                buildRecipient({
                  kind: "parameterised",
                  template: parsed.template,
                  arg: e.target.value,
                }),
              )
            }
            className="w-32"
          />
        </>
      )}

      {parsed.kind === "raw" && (
        <input
          type="text"
          value={parsed.value}
          onChange={(e) => onChange(e.target.value)}
          className="w-40"
        />
      )}
    </div>
  );
}
