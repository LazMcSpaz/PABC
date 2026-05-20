import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  addEdge,
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
import {
  QUEST_MODES,
  BEAT_DELIVER_MODES,
  BEAT_MODES,
} from "../lib/schema.js";
import { newId } from "../lib/id.js";

const nodeTypes = { beat: BeatNode };

export function QuestEditor({ value, onChange, context }) {
  const [selectedBeatId, setSelectedBeatId] = useState(
    value.beats?.[0]?.id ?? null,
  );

  const set = (key, v) => onChange({ ...value, [key]: v });

  const nodes = useMemo(
    () =>
      (value.beats ?? []).map((b, i) => ({
        id: b.id,
        type: "beat",
        position: positionForBeat(b, i),
        data: {
          beat: b,
          selected: b.id === selectedBeatId,
          onSelect: () => setSelectedBeatId(b.id),
        },
      })),
    [value.beats, selectedBeatId],
  );

  const edges = useMemo(
    () =>
      (value.prereqs ?? []).map((p) => ({
        id: `${p.prereqBeatId}->${p.beatId}`,
        source: p.prereqBeatId,
        target: p.beatId,
        animated: false,
      })),
    [value.prereqs],
  );

  const onNodesChange = useCallback(
    (changes) => {
      const nextBeats = (value.beats ?? []).slice();
      const updated = applyNodeChanges(
        changes,
        nextBeats.map((b, i) => ({
          id: b.id,
          position: positionForBeat(b, i),
          data: {},
        })),
      );
      const idToPos = new Map(updated.map((n) => [n.id, n.position]));
      const remapped = nextBeats.map((b) => {
        const pos = idToPos.get(b.id);
        if (!pos) return b;
        return { ...b, _x: pos.x, _y: pos.y };
      });
      onChange({ ...value, beats: remapped });
    },
    [value, onChange],
  );

  const onConnect = useCallback(
    (params) => {
      const next = addEdge(params, edges);
      const newPrereqs = next.map((e) => ({
        beatId: e.target,
        prereqBeatId: e.source,
      }));
      onChange({ ...value, prereqs: dedupePrereqs(newPrereqs) });
    },
    [edges, value, onChange],
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      const removed = new Set(
        deleted.map((e) => `${e.source}->${e.target}`),
      );
      const next = (value.prereqs ?? []).filter(
        (p) => !removed.has(`${p.prereqBeatId}->${p.beatId}`),
      );
      onChange({ ...value, prereqs: next });
    },
    [value, onChange],
  );

  const addBeat = () => {
    const id = newId("beat");
    const beat = {
      id,
      ordinal: (value.beats?.length ?? 0),
      deliver: "auto",
      deliverCondition: null,
      placementFilter: null,
      mode: value.mode === "global" ? "public" : "private",
      recipient: value.mode === "global" ? null : "claimant",
      art: "",
      text: "",
      choices: [],
    };
    onChange({ ...value, beats: [...(value.beats ?? []), beat] });
    setSelectedBeatId(id);
  };

  const updateBeat = (id, updater) => {
    const next = (value.beats ?? []).map((b) =>
      b.id === id ? updater(b) : b,
    );
    onChange({ ...value, beats: next });
  };

  const deleteBeat = (id) => {
    if (!confirm(`Delete beat ${id}?`)) return;
    const beats = (value.beats ?? []).filter((b) => b.id !== id);
    const prereqs = (value.prereqs ?? []).filter(
      (p) => p.beatId !== id && p.prereqBeatId !== id,
    );
    onChange({ ...value, beats, prereqs });
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
            <Select value={value.mode} onChange={(v) => set("mode", v)} options={QUEST_MODES} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Beat graph"
        actions={
          <IconButton onClick={addBeat} variant="primary">
            + beat
          </IconButton>
        }
      >
        <div className="text-xs text-slate-500">
          Drag beats to reorganise. Drag from one beat's bottom handle to
          another's top to create a prerequisite edge. Click a beat to edit
          its details below.
        </div>
        <div style={{ height: 380 }} className="bg-slate-950/60 rounded border border-slate-800">
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
          onChange={(updated) => updateBeat(selectedBeat.id, () => updated)}
          onDelete={() => deleteBeat(selectedBeat.id)}
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
      className={`min-w-[180px] cursor-pointer rounded-md border bg-slate-900 px-3 py-2 text-xs shadow ${
        data.selected ? "border-amber-400" : "border-slate-700"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-slate-100 mb-1">{b.id}</div>
      <div className="text-slate-500">
        deliver: <span className="text-slate-300">{b.deliver}</span>
      </div>
      <div className="text-slate-500">
        mode: <span className="text-slate-300">{b.mode}</span>
      </div>
      {b.choices?.length > 0 && (
        <div className="text-slate-500">
          {b.choices.length} choice{b.choices.length === 1 ? "" : "s"}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function BeatEditor({ beat, onChange, onDelete, context }) {
  const set = (key, v) => onChange({ ...beat, [key]: v });

  return (
    <SectionCard
      title={`Beat — ${beat.id}`}
      actions={
        <IconButton variant="danger" onClick={onDelete}>
          delete beat
        </IconButton>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="id">
          <TextInput value={beat.id} onChange={(v) => set("id", v)} />
        </Field>
        <Field label="ordinal">
          <NumberInput value={beat.ordinal} onChange={(v) => set("ordinal", v)} />
        </Field>
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
            <RecipientPicker value={beat.recipient} onChange={(v) => set("recipient", v)} />
          </Field>
        )}
        <Field label="art" className="col-span-3">
          <TextInput value={beat.art} onChange={(v) => set("art", v)} />
        </Field>
        <Field label="text" className="col-span-3">
          <TextArea value={beat.text} onChange={(v) => set("text", v)} rows={4} />
        </Field>
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

      <div className="flex flex-col gap-2 mt-3">
        <span className="text-xs uppercase tracking-wide text-slate-400">
          choices
        </span>
        <ChoiceList
          choices={beat.choices ?? []}
          onChange={(v) => set("choices", v)}
          context={context}
        />
      </div>
    </SectionCard>
  );
}

function positionForBeat(b, i) {
  if (typeof b._x === "number" && typeof b._y === "number") {
    return { x: b._x, y: b._y };
  }
  return { x: 100 + (i % 4) * 230, y: 60 + Math.floor(i / 4) * 130 };
}

function dedupePrereqs(prereqs) {
  const seen = new Set();
  return prereqs.filter((p) => {
    const k = `${p.prereqBeatId}->${p.beatId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
