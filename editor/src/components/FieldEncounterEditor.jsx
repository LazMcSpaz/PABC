import { useState } from "react";
import {
  Field,
  TextInput,
  NumberInput,
  TextArea,
  SectionCard,
  SectionIntro,
  IconButton,
} from "./Field.jsx";
import { ChoiceList } from "./ChoiceEditor.jsx";
import { EncounterImageEditor } from "./EncounterImageEditor.jsx";
import { BeatTreeView } from "./BeatTreeView.jsx";
import { subBeatId } from "../lib/story.js";

export function FieldEncounterEditor({ value, onChange, context }) {
  const [selectedBeatId, setSelectedBeatId] = useState(
    value.beats?.[0]?.id ?? null,
  );

  const set = (key, v) => onChange({ ...value, [key]: v });
  const setBeats = (nextBeats) => onChange({ ...value, beats: nextBeats });

  const addBeat = () => {
    const beats = value.beats ?? [];
    const existing = new Set(beats.map((b) => b.id));
    let n = 1;
    while (existing.has(subBeatId(value.id, n))) n++;
    const id = subBeatId(value.id, n);
    setBeats([
      ...beats,
      { id, isHead: false, art: "", imagePath: null, text: "", choices: [] },
    ]);
    setSelectedBeatId(id);
  };

  const updateBeat = (id, updater) => {
    setBeats((value.beats ?? []).map((b) => (b.id === id ? updater(b) : b)));
  };

  const deleteBeat = (id) => {
    if (id === value.id) {
      alert("Can't delete the head beat. Delete the whole story instead.");
      return;
    }
    if (!confirm(`Delete beat ${id}?`)) return;
    const remaining = (value.beats ?? []).filter((b) => b.id !== id);
    const cleaned = remaining.map((b) => ({
      ...b,
      choices: (b.choices ?? []).map((c) => ({
        ...c,
        effects: (c.effects ?? []).filter(
          (e) => !(e.type === "DELIVER_ENCOUNTER" && e.params?.encounterId === id),
        ),
      })),
    }));
    setBeats(cleaned);
    if (selectedBeatId === id) setSelectedBeatId(cleaned[0]?.id ?? null);
  };

  const selectedBeat = (value.beats ?? []).find((b) => b.id === selectedBeatId);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Field encounter">
        <SectionIntro>
          Field encounters are cards in a shared deck. When a player's unit
          moves into an Encounter hex, the engine draws from this deck and
          presents what the card describes. Use <code className="text-amber-400">copies</code> to
          control how many of each card go into the deck at game start.
        </SectionIntro>

        <Field
          label="id"
          tip="field.id"
          hint="Unique identifier. Use lower-case with underscores; prefix `fe_` by convention. Don't change after saving."
        >
          <TextInput value={value.id} onChange={(v) => set("id", v)} />
        </Field>
        <Field
          label="title"
          tip="field.title"
          hint="Player-facing name on the card. Leave blank to auto-generate from the id."
        >
          <TextInput
            value={value.title}
            onChange={(v) => set("title", v)}
            placeholder="e.g. The Grain Silo"
          />
        </Field>
        <Field
          label="copies (deck count)"
          tip="field.copies"
          hint="How many copies seed the deck. More copies = more likely to draw. Sub-beats are saved with 0 automatically — don't touch that."
        >
          <NumberInput
            value={value.copies}
            onChange={(v) => set("copies", v)}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Decision tree"
        actions={
          <IconButton onClick={addBeat} variant="primary">
            + beat
          </IconButton>
        }
      >
        <div className="text-xs text-slate-500 leading-relaxed">
          Beats are rectangles; their choices hang below as pills. Drag a
          choice's bottom handle onto another beat's top handle to make the
          choice lead to that beat (this adds a{" "}
          <code className="text-slate-300">DELIVER_ENCOUNTER</code> effect).
          Sub-beats are stored as linked encounters with{" "}
          <code className="text-slate-300">copies = 0</code> so they never
          appear in the deck on their own.
        </div>
        <BeatTreeView
          beats={value.beats ?? []}
          onBeatsChange={setBeats}
          advanceEffectType="DELIVER_ENCOUNTER"
          buildAdvanceParams={(targetBeatId) => ({
            encounterId: targetBeatId,
          })}
          selectedBeatId={selectedBeatId}
          onSelectBeat={setSelectedBeatId}
        />
      </SectionCard>

      {selectedBeat && (
        <BeatEditor
          beat={selectedBeat}
          onChange={(updated) => updateBeat(selectedBeat.id, () => updated)}
          onDelete={() => deleteBeat(selectedBeat.id)}
          isHead={selectedBeat.id === value.id}
          context={context}
        />
      )}
    </div>
  );
}

function BeatEditor({ beat, onChange, onDelete, isHead, context }) {
  const set = (key, v) => onChange({ ...beat, [key]: v });
  return (
    <>
      <SectionCard
        title={isHead ? `Encounter — head beat` : `Encounter — ${beat.id}`}
        actions={
          !isHead && (
            <IconButton variant="danger" onClick={onDelete}>
              delete beat
            </IconButton>
          )
        }
      >
        <SectionIntro>
          A beat is one screen the player reads. The head beat opens the
          encounter; sub-beats are reached via a choice's DELIVER_ENCOUNTER
          effect. Each beat has its own text, optional image, and choices.
        </SectionIntro>
        <Field
          label="id"
          tip="beat.id"
          hint="The head beat shares the encounter id. Sub-beats look like `parent_id/2`."
        >
          <TextInput
            value={beat.id}
            onChange={(v) => set("id", v)}
            {...(isHead ? { placeholder: "head id (also story id)" } : {})}
          />
        </Field>
        <EncounterImageEditor
          kind="field"
          id={beat.id}
          imagePath={beat.imagePath}
          onChange={(v) => set("imagePath", v)}
        />
        <Field
          label="text"
          tip="beat.text"
          hint="What the player reads. Wrap terms in [[double brackets]] to make them clickable wiki links."
        >
          <TextArea
            value={beat.text}
            onChange={(v) => set("text", v)}
            rows={5}
          />
        </Field>
        <Field
          label="art (direction notes)"
          tip="beat.art"
          hint="Free-text notes for whoever generates the illustration — not shown in-game."
        >
          <TextInput
            value={beat.art}
            onChange={(v) => set("art", v)}
            placeholder="optional art-direction notes"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Choices (up to 3)">
        <ChoiceList
          choices={beat.choices ?? []}
          onChange={(v) => set("choices", v)}
          context={context}
        />
      </SectionCard>
    </>
  );
}
