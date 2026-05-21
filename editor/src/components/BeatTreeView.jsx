import { useCallback, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
} from "reactflow";
import { newId } from "../lib/id.js";

// A decision-tree visualization shared by every multi-beat story
// editor (quest, world, field). Beats are rectangles; their choices
// hang below as pills. Dragging a choice handle onto another beat
// adds the "advance" effect (caller-chosen) on that choice.
//
// Props:
//   beats         array of { id, text, choices, _x?, _y? }
//   onBeatsChange (beats) => void
//   advanceEffectType  e.g. "ADVANCE_QUEST" | "DELIVER_ENCOUNTER"
//   buildAdvanceParams (targetBeatId) => params for the advance effect
//   selectedBeatId, onSelectBeat
//   onAddBeat     () => void  (caller decides how a new beat is shaped)
//   height        optional, default 520
//   prereqs       optional array — kept for compatibility (quests).
//                  Pass null/empty to disable prereq edges entirely.

const BEAT_WIDTH = 200;
const CHOICE_WIDTH = 170;
const CHOICE_GAP_X = 24;
const CHOICE_GAP_Y = 100;

const nodeTypes = { beat: BeatNode, choice: ChoiceNode };

export function BeatTreeView({
  beats,
  onBeatsChange,
  advanceEffectType,
  buildAdvanceParams,
  selectedBeatId,
  onSelectBeat,
  onAddBeat,
  height = 520,
}) {
  // ----- positions -----

  const beatPositions = useMemo(() => {
    const map = new Map();
    (beats ?? []).forEach((b, i) => map.set(b.id, positionForBeat(b, i)));
    return map;
  }, [beats]);

  const beatIds = useMemo(
    () => new Set((beats ?? []).map((b) => b.id)),
    [beats],
  );

  const beatNodes = useMemo(
    () =>
      (beats ?? []).map((b) => ({
        id: b.id,
        type: "beat",
        position: beatPositions.get(b.id),
        data: {
          beat: b,
          selected: b.id === selectedBeatId,
          onSelect: () => onSelectBeat(b.id),
        },
      })),
    [beats, selectedBeatId, beatPositions, onSelectBeat],
  );

  const choiceNodes = useMemo(() => {
    const out = [];
    for (const b of beats ?? []) {
      const pos = beatPositions.get(b.id);
      if (!pos) continue;
      const choices = b.choices ?? [];
      const totalWidth =
        choices.length * CHOICE_WIDTH +
        Math.max(0, choices.length - 1) * CHOICE_GAP_X;
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
            onSelect: () => onSelectBeat(b.id),
            advanceEffectType,
          },
        });
      });
    }
    return out;
  }, [beats, beatPositions, onSelectBeat, advanceEffectType]);

  const nodes = useMemo(
    () => [...beatNodes, ...choiceNodes],
    [beatNodes, choiceNodes],
  );

  const edges = useMemo(() => {
    const out = [];
    for (const b of beats ?? []) {
      for (const c of b.choices ?? []) {
        const cnid = choiceNodeId(b.id, c.id);
        out.push({
          id: ownershipEdgeId(b.id, c.id),
          source: b.id,
          target: cnid,
          deletable: false,
          selectable: false,
          style: { stroke: "#475569", strokeDasharray: "2 4" },
        });
        for (const e of c.effects ?? []) {
          const targetBeatId = advanceTargetForEffect(e, advanceEffectType);
          if (targetBeatId && beatIds.has(targetBeatId)) {
            out.push({
              id: advanceEdgeId(c.id, targetBeatId, e.id),
              source: cnid,
              target: targetBeatId,
              animated: true,
              style: { stroke: "#f59e0b", strokeWidth: 1.5 },
              data: { kind: "advance", choiceId: c.id, effectId: e.id },
            });
          }
        }
      }
    }
    return out;
  }, [beats, beatIds, advanceEffectType]);

  // ----- interactions -----

  const onNodesChange = useCallback(
    (changes) => {
      const beatChanges = changes.filter(
        (c) => c.type === "position" && beatIds.has(c.id),
      );
      if (beatChanges.length === 0) return;
      const staged = (beats ?? []).map((b) => ({
        id: b.id,
        position: beatPositions.get(b.id),
        data: {},
      }));
      const updated = applyNodeChanges(beatChanges, staged);
      const idToPos = new Map(updated.map((n) => [n.id, n.position]));
      const remapped = (beats ?? []).map((b) => {
        const pos = idToPos.get(b.id);
        if (!pos) return b;
        return { ...b, _x: pos.x, _y: pos.y };
      });
      onBeatsChange(remapped);
    },
    [beats, onBeatsChange, beatIds, beatPositions],
  );

  const onConnect = useCallback(
    (params) => {
      const parts = parseChoiceNodeId(params.source);
      if (!parts) return;
      const { beatId: sourceBeatId, choiceId } = parts;
      const targetBeatId = params.target;
      if (!beatIds.has(targetBeatId)) return;

      const nextBeats = (beats ?? []).map((b) => {
        if (b.id !== sourceBeatId) return b;
        const choices = (b.choices ?? []).map((c) => {
          if (c.id !== choiceId) return c;
          // skip if an effect already targets this beat
          const already = (c.effects ?? []).some(
            (e) =>
              advanceTargetForEffect(e, advanceEffectType) === targetBeatId,
          );
          if (already) return c;
          return {
            ...c,
            effects: [
              ...(c.effects ?? []),
              {
                id: newId("eff"),
                type: advanceEffectType,
                params: buildAdvanceParams(targetBeatId),
              },
            ],
          };
        });
        return { ...b, choices };
      });
      onBeatsChange(nextBeats);
    },
    [beats, onBeatsChange, beatIds, advanceEffectType, buildAdvanceParams],
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      const toDrop = new Map();
      for (const e of deleted) {
        if (e.data?.kind !== "advance") continue;
        const list = toDrop.get(e.data.choiceId) ?? new Set();
        list.add(e.data.effectId);
        toDrop.set(e.data.choiceId, list);
      }
      if (toDrop.size === 0) return;
      const nextBeats = (beats ?? []).map((b) => ({
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
      onBeatsChange(nextBeats);
    },
    [beats, onBeatsChange],
  );

  return (
    <div
      style={{ height }}
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
      <div className="font-semibold text-slate-100 mb-1 truncate" title={b.id}>
        {b.id}
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
  const advType = data.advanceEffectType;
  const advanceCount = (c.effects ?? []).filter(
    (e) => e.type === advType,
  ).length;
  const otherCount = (c.effects ?? []).length - advanceCount;

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
      {(otherCount > 0 || c.outcomeText) && (
        <div className="text-slate-500 mt-0.5">
          {c.outcomeText ? "text + " : ""}
          {otherCount} effect{otherCount === 1 ? "" : "s"}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
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

function advanceTargetForEffect(e, advanceEffectType) {
  if (e.type !== advanceEffectType) return null;
  // ADVANCE_QUEST stores target as params.beatId; DELIVER_ENCOUNTER as
  // params.encounterId.
  if (advanceEffectType === "ADVANCE_QUEST") return e.params?.beatId ?? null;
  if (advanceEffectType === "DELIVER_ENCOUNTER")
    return e.params?.encounterId ?? null;
  return null;
}
