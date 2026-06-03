import { useState } from "react";
import {
  Field,
  TextInput,
  NumberInput,
  Select,
  TextArea,
  SectionCard,
  SectionIntro,
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
        <SectionIntro>
          World encounters are events the engine fires at end-of-round when
          their conditions are met. Each round, the top two highest-scoring
          eligible encounters fire — set <code className="text-amber-400">strength</code> and {" "}
          <code className="text-amber-400">rarity</code> below to control how
          often this one wins. Inside the encounter, a tree of beats and
          choices plays out what the player sees and does.
        </SectionIntro>

        <Field
          label="id"
          tip="encounter.id"
          hint="Unique identifier. Use lower-case with underscores; prefix `we_` by convention. Don't change after saving — choices in other encounters may route here."
        >
          <TextInput value={value.id} onChange={(v) => set("id", v)} />
        </Field>

        <Field
          label="title"
          tip="encounter.title"
          hint="Player-facing name on the encounter card. Leave blank to auto-generate from the id."
        >
          <TextInput
            value={value.title}
            onChange={(v) => set("title", v)}
            placeholder="e.g. The Versari Courier"
          />
        </Field>

        <Field
          label="mode"
          tip={`encounter.mode.${value.mode || "private"}`}
          hint={
            value.mode === "placement"
              ? "Lands on a hex (filtered below) and sits there until a unit triggers it."
              : value.mode === "public"
              ? "Every player sees it at once. They either each pick individually, or one player picks for the group (toggle below)."
              : "Fires to one player only — no hex on the map. Use for governance events (e.g. 'a delegation arrives at your capital')."
          }
        >
          <Select
            value={value.mode}
            onChange={(v) => set("mode", v)}
            options={ENCOUNTER_MODES}
          />
        </Field>

        {value.mode !== "placement" && (
          <Field
            label="recipient"
            tip="encounter.recipient"
            hint="Who the encounter is delivered to. `active` = the current player. The parameterised forms compute the recipient from state at trigger time."
          >
            <RecipientPicker
              value={value.recipient}
              onChange={(v) => set("recipient", v)}
            />
          </Field>
        )}

        {value.mode === "public" && (
          <Toggle
            value={value.publicGroupChoice}
            onChange={(v) => set("publicGroupChoice", v)}
            label="one player chooses for the group"
          />
        )}
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
        <SectionIntro>
          The trigger decides <strong>when</strong> this encounter is eligible
          and <strong>how badly it wants to fire</strong>. At end-of-round the
          engine scores every eligible trigger as <code className="text-amber-400">strength × rarity</code> and
          fires the top two. Cooldown then locks this one out for a few
          rounds so it doesn't dominate.
        </SectionIntro>

        <Field
          label="condition"
          tip="trigger.condition"
          hint="When is this encounter even allowed to fire? Build a logic expression — e.g. 'active player has 3+ alignment' or 'round > 5'. If you don't gate it, it's eligible every round."
        >
          <DslBuilder
            value={value.triggerCondition}
            onChange={(v) => set("triggerCondition", v)}
          />
        </Field>

        <Field
          label="strength"
          tip="trigger.strength"
          hint="How urgent is this encounter right now? Use a plain number 1–5, or a cascade that picks a number based on current state."
        >
          <StrengthBuilder
            value={value.triggerStrength}
            onChange={(v) => set("triggerStrength", v)}
          />
        </Field>

        <Field
          label="rarity"
          tip="trigger.weight"
          hint="Multiplier on strength. `Mythic` (0.1×) basically only fires when the strength cascade pushes it to 5 in an otherwise quiet round. Most encounters should be Normal."
        >
          <WeightTierPicker
            value={value.triggerWeight}
            onChange={(v) => set("triggerWeight", v)}
          />
        </Field>

        <Field
          label="cooldown (rounds)"
          tip="trigger.cooldown"
          hint="After firing, how many rounds before this can fire again. Use 0 for evergreen encounters."
        >
          <NumberInput
            value={value.triggerCooldown}
            onChange={(v) => set("triggerCooldown", v)}
          />
        </Field>
      </SectionCard>

      {value.mode === "placement" && (
        <SectionCard title="Placement">
          <SectionIntro>
            Placement-mode encounters land on a specific hex and wait there.
            The filter below decides which hexes qualify; the engine picks
            one matching hex at random when the encounter fires.
          </SectionIntro>

          <Field
            label="expires in (rounds)"
            tip="placement.expiresIn"
            hint="After this many rounds without anyone triggering it, the encounter is silently removed."
          >
            <NumberInput
              value={value.expiresIn}
              onChange={(v) => set("expiresIn", v)}
            />
          </Field>
          <Field
            label="hex filter"
            tip="placement.hexFilter"
            hint="Which hexes are valid landing spots. Empty filter = any hex. Add constraints one row at a time."
          >
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
        <SectionIntro>
          A beat is one screen the player reads. The head beat opens the
          encounter; sub-beats are reached by routing a choice's effect to
          them. Each beat has its own text, optional image, and up to three
          choices the player can pick from.
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
          kind="world"
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
        <SectionIntro>
          Each choice is a button the player can tap. Pick a label, optional
          gate, and a list of effects that fire when chosen. To branch into a
          sub-beat, add a <code className="text-amber-400">DELIVER_ENCOUNTER</code> effect
          pointing at the next beat.
        </SectionIntro>
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
