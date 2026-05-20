import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
} from "reactflow";
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
import {
  QUEST_MODES,
  BEAT_DELIVER_MODES,
  BEAT_MODES,
} from "../lib/schema.js";
import { newId } from "../lib/id.js";

const nodeTypes = { beat: BeatNode, choice: ChoiceNode };

// Layout constants for auto-positioning choices relative to their beat.
const BEAT_WIDTH = 200;
const CHOICE_WIDTH = 170;
const CHOICE_GAP_X = 24;
const CHOICE_GAP_Y = 100;

export function QuestEditor({ value, onChange, context }) {
  const [selectedBeatId, setSelectedBeatId] = useState(
    value.beats?.[0]?.id ?? null,
  );

  const set = (key, v) => onChange({ ...value, [key]: v });

  // ----- Graph derivation -----

  const beatPositions = useMemo(() => {
    const map = new Map();
    (value.beats ?? []).forEach((b, i) => {
      map.set(b.id, positionForBeat(b, i));
    });
    return map;
  }, [value.beats]);

  const beatNodes = useMemo(
    () =>
      (value.beats ?? []).map((b) => ({
        id: b.id,
        type: "beat",
        position: beatPositions.get(b.id),
        data: {
          beat: b,
          selected: b.id === selectedBeatId,
          onSelect: () => setSelectedBeatId(b.id),
        },
      })),
    [value.beats, selectedBeatId, beatPositions],
  );

  const choiceNodes = useMemo(() => {
    const out = [];
    for (const b of value.beats ?? []) {
      const pos = beatPositions.get(b.id);
      if (!pos) continue;
      const choices = b.choices ?? [];
      const totalWidth =
        choices.length * CHOICE_WIDTH + Math.max(0, choices.length - 1) * CHOICE_GAP_X;
      const startX = pos.x + BEAT_WIDTH / 2 - totalWidth / 2;
      choices.forEach((c, i) => {
        out.push({
          id: choiceNodeId(b.id, c.id),
          type: "choice",
          position: {
            x: startX + i * (CHOICE_WIDTH + CHOICE_GAP_X),
            y: pos.y + CHOICE_GAP_Y,
          },
          data: {
            choice: c,
            beatId: b.id,
            ordinal: i,
            onSelect: () => setSelectedBeatId(b.id),
          },
        });
      });
    }
    return out;
  }, [value.beats, beatPositions]);

  const nodes = useMemo(
    () => [...beatNodes, ...choiceNodes],
    [beatNodes, choiceNodes],
  );

  // Edges: ownership (beat → its choices) plus advance (choice → next beat
  // via an ADVANCE_QUEST effect on that choice).
  const beatIds = useMemo(
    () => new Set((value.beats ?? []).map((b) => b.id)),
    [value.beats],
  );

  const edges = useMemo(() => {
    const out = [];
    for (const b of value.beats ?? []) {
      for (const c of b.choices ?? []) {
        const cnid = choiceNodeId(b.id, c.id);
        // ownership
        out.push({
          id: ownershipEdgeId(b.id, c.id),
          source: b.id,
          target: cnid,
          deletable: false,
          selectable: false,
          style: { stroke: "#475569", strokeDasharray: "2 4" },
        });
        // advance — one edge per ADVANCE_QUEST effect targeting a beat
        // within this quest. Other effects don't render.
        for (const e of c.effects ?? []) {
          if (
            e.type === "ADVANCE_QUEST" &&
            e.params?.beatId &&
            beatIds.has(e.params.beatId)
          ) {
            out.push({
              id: advanceEdgeId(c.id, e.params.beatId, e.id),
              source: cnid,
              target: e.params.beatId,
              animated: true,
              style: { stroke: "#f59e0b", strokeWidth: 1.5 },
              data: { kind: "advance", choiceId: c.id, effectId: e.id },
            });
          }
        }
      }
    }
    return out;
  }, [value.beats, beatIds]);

  // ----- Interactions -----

  const onNodesChange = useCallback(
    (changes) => {
      // We only persist position changes for beat nodes (choice positions
      // are derived from their parent beat). React Flow may emit other
      // change kinds (selection, dimensions); pass those through without
      // mutating the model.
      const beatChanges = changes.filter(
        (c) => c.type === "position" && beatIds.has(c.id),
      );
      if (beatChanges.length === 0) return;

      const stagedBeats = (value.beats ?? []).map((b) => ({
        id: b.id,
        position: beatPositions.get(b.id),
        data: {},
      }));
      const updated = applyNodeChanges(beatChanges, stagedBeats);
      const idToPos = new Map(updated.map((n) => [n.id, n.position]));
      const remapped = (value.beats ?? []).map((b) => {
        const pos = idToPos.get(b.id);
        if (!pos) return b;
        return { ...b, _x: pos.x, _y: pos.y };
      });
      onChange({ ...value, beats: remapped });
    },
    [value, onChange, beatIds, beatPositions],
  );

  const onConnect = useCallback(
    (params) => {
      // Only choice → beat connections create advance edges. Anything
      // else (beat → choice, beat → beat) is ignored — prereqs live in
      // the beat form now, not the graph.
      const sourceParts = parseChoiceNodeId(params.source);
      if (!sourceParts) return;
      const { beatId: sourceBeatId, choiceId } = sourceParts;
      const targetBeatId = params.target;
      if (!beatIds.has(targetBeatId)) return;

      const beats = (value.beats ?? []).map((b) => {
        if (b.id !== sourceBeatId) return b;
        const choices = (b.choices ?? []).map((c) => {
          if (c.id !== choiceId) return c;
          // Skip if an ADVANCE_QUEST to this beat already exists.
          const already = (c.effects ?? []).some(
            (e) =>
              e.type === "ADVANCE_QUEST" && e.params?.beatId === targetBeatId,
          );
          if (already) return c;
          return {
            ...c,
            effects: [
              ...(c.effects ?? []),
              {
                id: newId("eff"),
                type: "ADVANCE_QUEST",
                params: { questId: value.id, beatId: targetBeatId },
              },
            ],
          };
        });
        return { ...b, choices };
      });
      onChange({ ...value, beats });
    },
    [value, onChange, beatIds],
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      // Map: choiceId → set of effect ids to drop.
      const toDrop = new Map();
      for (const e of deleted) {
        if (e.data?.kind !== "advance") continue;
        const list = toDrop.get(e.data.choiceId) ?? new Set();
        list.add(e.data.effectId);
        toDrop.set(e.data.choiceId, list);
      }
      if (toDrop.size === 0) return;

      const beats = (value.beats ?? []).map((b) => ({
        ...b,
        choices: (b.choices ?? []).map((c) => {
          const drops = toDrop.get(c.id);
          if (!drops) return c;
          return {
            ...c,
            effects: (c.effects ?? []).filter((eff) => !drops.has(eff.id)),
          };
        }),
      }));
      onChange({ ...value, beats });
    },
    [value, onChange],
  );

  // ----- Beat CRUD -----

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
    // Drop any prereqs referencing this beat AND any ADVANCE_QUEST
    // effects on remaining choices that pointed here.
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="id">
            <TextInput value={value.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="title">
            <TextInput value={value.title} onChange={(v) => set("title", v)} />
          </Field>
          <Field label="mode">
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
          Beats are rectangles; their choices hang below as pills. Drag from a
          choice's bottom handle onto another beat's top handle to wire the
          choice into that beat (this adds an{" "}
          <code className="text-slate-300">ADVANCE_QUEST</code> effect). Select
          an amber edge and press Backspace to remove the advancement. Drag
          beats to rearrange; choices follow their parent.
        </div>
        <div
          style={{ height: 520 }}
          className="bg-slate-950/60 rounded border border-slate-800"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#1e293b" />
            <Controls />
          </ReactFlow>
        </div>
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

function BeatNode({ data }) {
  const b = data.beat;
  return (
    <div
      onClick={data.onSelect}
      style={{ width: BEAT_WIDTH }}
      className={`cursor-pointer rounded-md border bg-slate-900 px-3 py-2 text-xs shadow ${
        data.selected ? "border-amber-400" : "border-slate-700"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-slate-100 mb-1 truncate">{b.id}</div>
      <div className="text-slate-500">
        deliver: <span className="text-slate-300">{b.deliver}</span>
        <span className="text-slate-600"> · </span>
        mode: <span className="text-slate-300">{b.mode}</span>
      </div>
      {b.text && (
        <div className="text-slate-400 mt-1 line-clamp-2" title={b.text}>
          {b.text}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ChoiceNode({ data }) {
  const c = data.choice;
  const advanceCount = (c.effects ?? []).filter(
    (e) => e.type === "ADVANCE_QUEST",
  ).length;
  const effectCount = (c.effects ?? []).length - advanceCount;

  return (
    <div
      onClick={data.onSelect}
      style={{ width: CHOICE_WIDTH }}
      className="cursor-pointer rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] shadow"
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-slate-200 truncate" title={c.label}>
        {c.label || <em className="text-slate-500">unlabeled choice</em>}
      </div>
      {(effectCount > 0 || c.outcomeText) && (
        <div className="text-slate-500 mt-0.5">
          {c.outcomeText ? "text + " : ""}
          {effectCount} effect{effectCount === 1 ? "" : "s"}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function BeatEditor({ beat, quest, onChange, onDelete, onPrereqsChange, context }) {
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="id">
            <TextInput value={beat.id} onChange={(v) => set("id", v)} />
          </Field>
          <Field label="ordinal">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="deliver">
            <Select
              value={beat.deliver}
              onChange={(v) => set("deliver", v)}
              options={BEAT_DELIVER_MODES}
            />
          </Field>
          <Field label="mode">
            <Select
              value={beat.mode}
              onChange={(v) => set("mode", v)}
              options={BEAT_MODES}
            />
          </Field>
          {beat.mode === "private" && (
            <Field label="recipient" className="col-span-2">
              <RecipientPicker
                value={beat.recipient}
                onChange={(v) => set("recipient", v)}
              />
            </Field>
          )}
        </div>

        {beat.deliver === "conditional" && (
          <Field label="deliverCondition">
            <DslBuilder
              value={beat.deliverCondition}
              onChange={(v) => set("deliverCondition", v)}
            />
          </Field>
        )}
        {beat.deliver === "discovered" && (
          <Field label="placementFilter">
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

// ----- helpers -----

function positionForBeat(b, i) {
  if (typeof b._x === "number" && typeof b._y === "number") {
    return { x: b._x, y: b._y };
  }
  return { x: 100 + (i % 3) * 280, y: 60 + Math.floor(i / 3) * 260 };
}

function choiceNodeId(beatId, choiceId) {
  return `choice::${beatId}::${choiceId}`;
}

function parseChoiceNodeId(id) {
  if (typeof id !== "string" || !id.startsWith("choice::")) return null;
  const [, beatId, choiceId] = id.split("::");
  if (!beatId || !choiceId) return null;
  return { beatId, choiceId };
}

function ownershipEdgeId(beatId, choiceId) {
  return `own::${beatId}::${choiceId}`;
}

function advanceEdgeId(choiceId, targetBeatId, effectId) {
  return `adv::${choiceId}::${targetBeatId}::${effectId}`;
}
