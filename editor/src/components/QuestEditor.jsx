import { useState } from "react";
import {
  Field,
  TextInput,
  Select,
  SectionCard,
  IconButton,
  TextArea,
  NumberInput,
} from "./Field.jsx";
import { ChoiceList } from "./ChoiceEditor.jsx";
import { EffectList } from "./EffectEditor.jsx";
import { DslBuilder } from "./DslBuilder.jsx";
import { HexFilterBuilder } from "./HexFilterBuilder.jsx";
import { RecipientPicker } from "./RecipientPicker.jsx";
import { EncounterImageEditor } from "./EncounterImageEditor.jsx";
import { BeatTreeView } from "./BeatTreeView.jsx";
import {
  QUEST_MODES,
  BEAT_DELIVER_MODES,
  BEAT_MODES,
} from "../lib/schema.js";
import { newId } from "../lib/id.js";

export function QuestEditor({ value, onChange, context }) {
  const [selectedBeatId, setSelectedBeatId] = useState(
    value.beats?.[0]?.id ?? null,
  );

  const set = (key, v) => onChange({ ...value, [key]: v });

  const addBeat = () => {
    const id = newId("beat");
    const beat = {
      id,
      ordinal: value.beats?.length ?? 0,
      deliver: "auto",
      deliverCondition: null,
      placementFilter: null,
      mode: value.mode === "global" ? "public" : "private",
      recipient: value.mode === "global" ? null : "claimant",
      art: "",
      imagePath: null,
      text: "",
      choices: [],
    };
    onChange({ ...value, beats: [...(value.beats ?? []), beat] });
    setSelectedBeatId(id);
  };

  const updateBeat = (id, updater) => {
    const next = (value.beats ?? []).map((b) => (b.id === id ? updater(b) : b));
    onChange({ ...value, beats: next });
  };

  const deleteBeat = (id) => {
    if (!confirm(`Delete beat ${id}?`)) return;
    const beats = (value.beats ?? []).filter((b) => b.id !== id);
    const prereqs = (value.prereqs ?? []).filter(
      (p) => p.beatId !== id && p.prereqBeatId !== id,
    );
    const cleaned = beats.map((b) => ({
      ...b,
      choices: (b.choices ?? []).map((c) => ({
        ...c,
        effects: (c.effects ?? []).filter(
          (e) => !(e.type === "ADVANCE_QUEST" && e.params?.beatId === id),
        ),
      })),
    }));
    onChange({ ...value, beats: cleaned, prereqs });
    if (selectedBeatId === id) setSelectedBeatId(beats[0]?.id ?? null);
  };

  const selectedBeat = (value.beats ?? []).find((b) => b.id === selectedBeatId);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Quest">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="id" tip="quest.id">
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="title" tip="quest.title">
            <TextInput value={value.title} onChange={(v) => set("title", v)} />
          </Field>
          <Field
            label="mode"
            tip={`quest.mode.${value.mode || "single-player"}`}
          >
            <Select
              value={value.mode}
              onChange={(v) => set("mode", v)}
              options={QUEST_MODES}
            />
          </Field>
        </div>
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
          choice's bottom handle onto another beat's top handle to wire the
          choice into that beat. Click a beat to edit it inline.
        </div>
        <BeatTreeView
          beats={value.beats ?? []}
          onBeatsChange={(nextBeats) => set("beats", nextBeats)}
          advanceEffectType="ADVANCE_QUEST"
          buildAdvanceParams={(beatId) => ({ questId: value.id, beatId })}
          selectedBeatId={selectedBeatId}
          onSelectBeat={setSelectedBeatId}
        />
      </SectionCard>

      {selectedBeat && (
        <BeatEditor
          beat={selectedBeat}
          quest={value}
          onChange={(updated) => updateBeat(selectedBeat.id, () => updated)}
          onDelete={() => deleteBeat(selectedBeat.id)}
          onPrereqsChange={(prereqs) => set("prereqs", prereqs)}
          context={context}
        />
      )}

      <SectionCard title="Completion rewards — claimant only">
        <EffectList
          effects={value.claimRewards ?? []}
          onChange={(effs) => set("claimRewards", effs)}
          context={context}
        />
      </SectionCard>

      <SectionCard title="Completion rewards — shared (every player)">
        <EffectList
          effects={value.sharedRewards ?? []}
          onChange={(effs) => set("sharedRewards", effs)}
          context={context}
        />
      </SectionCard>
    </div>
  );
}

function BeatEditor({
  beat,
  quest,
  onChange,
  onDelete,
  onPrereqsChange,
  context,
}) {
  const set = (key, v) => onChange({ ...beat, [key]: v });

  return (
    <>
      <SectionCard
        title={`Encounter — beat ${beat.id}`}
        actions={
          <IconButton variant="danger" onClick={onDelete}>
            delete beat
          </IconButton>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="id" tip="beat.id">
            <TextInput value={beat.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="ordinal" tip="beat.ordinal">
            <NumberInput
              value={beat.ordinal}
              onChange={(v) => set("ordinal", v)}
            />
          </Field>
          <div className="col-span-2">
            <EncounterImageEditor
              kind="beat"
              id={beat.id}
              imagePath={beat.imagePath}
              onChange={(v) => set("imagePath", v)}
            />
          </div>
          <Field label="text" className="col-span-2">
            <TextArea
              value={beat.text}
              onChange={(v) => set("text", v)}
              rows={4}
            />
          </Field>
          <Field
            label="art (free-text direction notes)"
            className="col-span-2"
          >
            <TextInput
              value={beat.art}
              onChange={(v) => set("art", v)}
              placeholder="optional art-direction notes"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Choices (up to 3)">
        <ChoiceList
          choices={beat.choices ?? []}
          onChange={(v) => set("choices", v)}
          context={context}
        />
      </SectionCard>

      <SectionCard title="Delivery">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="deliver"
            tip={`beat.deliver.${beat.deliver || "auto"}`}
          >
            <Select
              value={beat.deliver}
              onChange={(v) => set("deliver", v)}
              options={BEAT_DELIVER_MODES}
            />
          </Field>
          <Field
            label="mode"
            tip={`beat.mode.${beat.mode || "private"}`}
          >
            <Select
              value={beat.mode}
              onChange={(v) => set("mode", v)}
              options={BEAT_MODES}
            />
          </Field>
          {beat.mode === "private" && (
            <Field label="recipient" className="col-span-2" tip="encounter.recipient">
              <RecipientPicker
                value={beat.recipient}
                onChange={(v) => set("recipient", v)}
              />
            </Field>
          )}
        </div>

        {beat.deliver === "conditional" && (
          <Field label="deliverCondition" tip="beat.deliverCondition">
            <DslBuilder
              value={beat.deliverCondition}
              onChange={(v) => set("deliverCondition", v)}
            />
          </Field>
        )}
        {beat.deliver === "discovered" && (
          <Field label="placementFilter" tip="beat.placementFilter">
            <HexFilterBuilder
              value={beat.placementFilter}
              onChange={(v) => set("placementFilter", v)}
              allowNull={false}
            />
          </Field>
        )}

        <PrereqEditor
          beatId={beat.id}
          beats={quest.beats ?? []}
          prereqs={quest.prereqs ?? []}
          onChange={onPrereqsChange}
        />
      </SectionCard>
    </>
  );
}

function PrereqEditor({ beatId, beats, prereqs, onChange }) {
  const current = new Set(
    prereqs.filter((p) => p.beatId === beatId).map((p) => p.prereqBeatId),
  );

  const toggle = (otherBeatId) => {
    let next;
    if (current.has(otherBeatId)) {
      next = prereqs.filter(
        (p) => !(p.beatId === beatId && p.prereqBeatId === otherBeatId),
      );
    } else {
      next = [...prereqs, { beatId, prereqBeatId: otherBeatId }];
    }
    onChange(next);
  };

  const others = beats.filter((b) => b.id !== beatId);
  if (others.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-3">
      <span className="text-xs uppercase tracking-wide text-slate-400">
        prerequisites
      </span>
      <div className="text-xs text-slate-500">
        Other beats that must complete before this one becomes eligible.
        Separate from the decision tree — this is engine-level gating.
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((b) => {
          const on = current.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              className={`px-2 py-1 text-xs rounded border ${
                on
                  ? "bg-amber-500 border-amber-400 text-slate-950"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {on ? "✓ " : ""}
              {b.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
