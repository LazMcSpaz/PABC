import {
  Field,
  TextInput,
  NumberInput,
  Select,
  TextArea,
  SectionCard,
  Toggle,
} from "./Field.jsx";
import { RecipientPicker } from "./RecipientPicker.jsx";
import { DslBuilder, StrengthBuilder } from "./DslBuilder.jsx";
import { HexFilterBuilder } from "./HexFilterBuilder.jsx";
import { ChoiceList } from "./ChoiceEditor.jsx";
import { EncounterImageEditor } from "./EncounterImageEditor.jsx";
import { ENCOUNTER_MODES } from "../lib/schema.js";

export function WorldEncounterEditor({ value, onChange, context }) {
  const set = (key, v) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Encounter">
        <div className="grid grid-cols-2 gap-3">
          <Field label="id">
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <div />
          <div className="col-span-2">
            <EncounterImageEditor
              kind="world"
              id={value.id}
              imagePath={value.imagePath}
              onChange={(v) => set("imagePath", v)}
            />
          </div>
          <Field label="text" className="col-span-2">
            <TextArea
              value={value.text}
              onChange={(v) => set("text", v)}
              rows={5}
            />
          </Field>
          <Field label="art (free-text direction notes)" className="col-span-2">
            <TextInput
              value={value.art}
              onChange={(v) => set("art", v)}
              placeholder="optional art-direction notes"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Choices (up to 3)">
        <ChoiceList
          choices={value.choices ?? []}
          onChange={(v) => set("choices", v)}
          context={context}
        />
      </SectionCard>

      <SectionCard title="Delivery">
        <div className="grid grid-cols-2 gap-3">
          <Field label="mode">
            <Select
              value={value.mode}
              onChange={(v) => set("mode", v)}
              options={ENCOUNTER_MODES}
            />
          </Field>
          {value.mode !== "placement" && (
            <Field label="recipient">
              <RecipientPicker
                value={value.recipient}
                onChange={(v) => set("recipient", v)}
              />
            </Field>
          )}
          {value.mode === "public" && (
            <div className="col-span-2">
              <Toggle
                value={value.publicGroupChoice}
                onChange={(v) => set("publicGroupChoice", v)}
                label="one player chooses for the group"
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Trigger">
        <Field label="condition (required)">
          <DslBuilder
            value={value.triggerCondition}
            onChange={(v) => set("triggerCondition", v)}
          />
        </Field>
        <Field label="strength (1..5 or cascade)">
          <StrengthBuilder
            value={value.triggerStrength}
            onChange={(v) => set("triggerStrength", v)}
          />
        </Field>
        <Field label="cooldown (rounds)">
          <NumberInput
            value={value.triggerCooldown}
            onChange={(v) => set("triggerCooldown", v)}
          />
        </Field>
      </SectionCard>

      {value.mode === "placement" && (
        <SectionCard title="Placement">
          <Field label="expiresIn (rounds)">
            <NumberInput
              value={value.expiresIn}
              onChange={(v) => set("expiresIn", v)}
            />
          </Field>
          <Field label="hexFilter">
            <HexFilterBuilder
              value={value.placementFilter}
              onChange={(v) => set("placementFilter", v)}
            />
          </Field>
        </SectionCard>
      )}
    </div>
  );
}
