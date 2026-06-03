import { useState } from "react";
import {
  Field,
  TextInput,
  NumberInput,
  Select,
  TextArea,
  SectionCard,
  IconButton,
  Toggle,
} from "./Field.jsx";
import { RecipientPicker } from "./RecipientPicker.jsx";
import { DslBuilder, StrengthBuilder } from "./DslBuilder.jsx";
import { HexFilterBuilder } from "./HexFilterBuilder.jsx";
import { ChoiceList } from "./ChoiceEditor.jsx";
import { EncounterImageEditor } from "./EncounterImageEditor.jsx";
import { BeatTreeView } from "./BeatTreeView.jsx";
import { ENCOUNTER_MODES, WEIGHT_TIERS, weightTierFor } from "../lib/schema.js";
import { newId } from "../lib/id.js";
import { subBeatId } from "../lib/story.js";

export function WorldEncounterEditor({ value, onChange, context }) {
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
      <SectionCard title="World encounter">
        <div className="grid grid-cols-2 gap-3">
          <Field label="id" tip="encounter.id">
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="title (player-facing; blank = prettified id)" tip="encounter.title">
            <TextInput
              value={value.title}
              onChange={(v) => set("title", v)}
              placeholder="e.g. The Versari Courier"
            />
          </Field>
          <Field
            label="mode"
            tip={`encounter.mode.${value.mode || "private"}`}
          >
            <Select
              value={value.mode}
              onChange={(v) => set("mode", v)}
              options={ENCOUNTER_MODES}
            />
          </Field>
          {value.mode !== "placement" && (
            <Field label="recipient" className="col-span-2" tip="encounter.recipient">
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
          Sub-beats are stored as linked encounters that never fire on their
          own. Click a beat to edit it inline.
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

      <SectionCard title="Trigger">
        <Field label="condition (required)" tip="trigger.condition">
          <DslBuilder
            value={value.triggerCondition}
            onChange={(v) => set("triggerCondition", v)}
          />
        </Field>
        <Field label="strength (1..5 or cascade)" tip="trigger.strength">
          <StrengthBuilder
            value={value.triggerStrength}
            onChange={(v) => set("triggerStrength", v)}
          />
        </Field>
        <Field label="rarity" tip="trigger.weight">
          <WeightTierPicker
            value={value.triggerWeight}
            onChange={(v) => set("triggerWeight", v)}
          />
        </Field>
        <Field label="cooldown (rounds)" tip="trigger.cooldown">
          <NumberInput
            value={value.triggerCooldown}
            onChange={(v) => set("triggerCooldown", v)}
          />
        </Field>
      </SectionCard>

      {value.mode === "placement" && (
        <SectionCard title="Placement">
          <Field label="expiresIn (rounds)" tip="placement.expiresIn">
            <NumberInput
              value={value.expiresIn}
              onChange={(v) => set("expiresIn", v)}
            />
          </Field>
          <Field label="hexFilter" tip="placement.hexFilter">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="id">
            <TextInput
              value={beat.id}
              onChange={(v) => set("id", v)}
              {...(isHead ? { placeholder: "head id (also story id)" } : {})}
            />
          </Field>
          <div />
          <div className="col-span-2">
            <EncounterImageEditor
              kind="world"
              id={beat.id}
              imagePath={beat.imagePath}
              onChange={(v) => set("imagePath", v)}
            />
          </div>
          <Field label="text" className="col-span-2">
            <TextArea
              value={beat.text}
              onChange={(v) => set("text", v)}
              rows={5}
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
    </>
  );
}

// Five-tier rarity picker. Authors pick from named tiers
// (Common / Normal / Uncommon / Rare / Mythic). Existing content with
// some other numeric value is preserved and shown as "Custom".
function WeightTierPicker({ value, onChange }) {
  const current = weightTierFor(value);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {WEIGHT_TIERS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.value)}
          className={`px-2 py-1 text-xs rounded border ${
            current.key === t.key
              ? "bg-amber-500 text-slate-950 border-amber-400 font-semibold"
              : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
          }`}
          title={`${t.label} — multiplier ${t.value}`}
        >
          {t.label}
        </button>
      ))}
      {current.key === "custom" && (
        <span className="text-xs text-slate-500">
          custom: ×{current.value.toFixed(2)} (snap to a tier to discard)
        </span>
      )}
    </div>
  );
}
