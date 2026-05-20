import { Field, TextInput, NumberInput, TextArea, SectionCard } from "./Field.jsx";
import { ChoiceList } from "./ChoiceEditor.jsx";

export function FieldEncounterEditor({ value, onChange, context }) {
  const set = (key, v) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Core">
        <div className="grid grid-cols-2 gap-3">
          <Field label="id">
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="copies (deck count)">
            <NumberInput value={value.copies} onChange={(v) => set("copies", v)} />
          </Field>
          <Field label="art" className="col-span-2">
            <TextInput value={value.art} onChange={(v) => set("art", v)} placeholder="art direction notes" />
          </Field>
          <Field label="text" className="col-span-2">
            <TextArea value={value.text} onChange={(v) => set("text", v)} rows={5} />
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
    </div>
  );
}
