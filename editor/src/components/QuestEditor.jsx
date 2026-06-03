import { useState } from "react";
import {
  Field,
  TextInput,
  Select,
  SectionCard,
  SectionIntro,
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
        <SectionIntro>
          A quest is a multi-step storyline. Each <em>beat</em> is one screen
          the player reads; beats can require earlier beats to be completed
          first (set in the Delivery section). When the player finishes the
          last beat, the quest's completion rewards fire.
        </SectionIntro>

        <Field
          label="id"
          tip="quest.id"
          hint="Unique identifier. Use lower-case with underscores; prefix `q_` by convention. Don't change after saving — beats and effects reference this."
        >
          <TextInput value={value.id} onChange={(v) => set("id", v)} />
        </Field>
        <Field
          label="title"
          tip="quest.title"
          hint="Player-facing name in the quest log. Leave blank to auto-generate from the id."
        >
          <TextInput value={value.title} onChange={(v) => set("title", v)} />
        </Field>
        <Field
          label="mode"
          tip={`quest.mode.${value.mode || "single-player"}`}
          hint={
            value.mode === "global"
              ? "All players experience the beats simultaneously. Use for world events."
              : "Only the claimant runs the beats. Use for personal storylines."
          }
        >
          <Select
            value={value.mode}
            onChange={(v) => set("mode", v)}
            options={QUEST_MODES}
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
        <SectionIntro>
          A beat is one screen of the quest. Write what the player reads,
          attach optional choices below, and decide in the Delivery section
          how this beat is unlocked (auto / hex-discovered / conditional)
          and which earlier beats must complete first.
        </SectionIntro>

        <Field
          label="id"
          tip="beat.id"
          hint="Unique identifier within this quest. Other beats and effects route here by id."
        >
          <TextInput value={beat.id} onChange={(v) => set("id", v)} />
        </Field>
        <Field
          label="ordinal"
          tip="beat.ordinal"
          hint="Display order in the quest log. Lower numbers come first. Doesn't gate anything — use prerequisites for that."
        >
          <NumberInput
            value={beat.ordinal}
            onChange={(v) => set("ordinal", v)}
          />
        </Field>
        <EncounterImageEditor
          kind="beat"
          id={beat.id}
          imagePath={beat.imagePath}
          onChange={(v) => set("imagePath", v)}
        />
        <Field
          label="text"
          tip="beat.text"
          hint="What the player reads on this beat. Wrap terms in [[double brackets]] to make them clickable wiki links."
        >
          <TextArea
            value={beat.text}
            onChange={(v) => set("text", v)}
            rows={4}
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

      <SectionCard title="Delivery">
        <SectionIntro>
          How and when this beat unlocks. <strong>Auto</strong> fires it as
          soon as prerequisites complete; <strong>discovered</strong> places
          it on a hex matching the filter and waits for a unit to step on
          it; <strong>conditional</strong> only fires when a logic
          expression evaluates true. The prerequisites list below restricts
          this further to "these earlier beats must already be done".
        </SectionIntro>

        <Field
          label="deliver"
          tip={`beat.deliver.${beat.deliver || "auto"}`}
          hint={
            beat.deliver === "discovered"
              ? "Lands on a hex (filtered below) and waits for a unit."
              : beat.deliver === "conditional"
              ? "Only fires when the condition you build below is true."
              : "Fires automatically as soon as the prereqs complete."
          }
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
          hint={
            beat.mode === "public"
              ? "All players see and resolve this beat together."
              : "Only the claimant (or chosen recipient) sees it."
          }
        >
          <Select
            value={beat.mode}
            onChange={(v) => set("mode", v)}
            options={BEAT_MODES}
          />
        </Field>
        {beat.mode === "private" && (
          <Field
            label="recipient"
            tip="encounter.recipient"
            hint="`claimant` = whoever picked up the quest. The parameterised tokens compute the recipient from current state."
          >
            <RecipientPicker
              value={beat.recipient}
              onChange={(v) => set("recipient", v)}
            />
          </Field>
        )}

        {beat.deliver === "conditional" && (
          <Field
            label="deliver condition"
            tip="beat.deliverCondition"
            hint="Logic expression evaluated at round-end. Beat stays dormant while this is false."
          >
            <DslBuilder
              value={beat.deliverCondition}
              onChange={(v) => set("deliverCondition", v)}
            />
          </Field>
        )}
        {beat.deliver === "discovered" && (
          <Field
            label="placement filter"
            tip="beat.placementFilter"
            hint="Which hexes are valid landing spots. Empty filter = any hex."
          >
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
