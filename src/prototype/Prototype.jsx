// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar and a
// bottom tab dock — with a floating tabbed window for hex inspection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./prototype.css";
import { FACTIONS as UI_FACTIONS, LOCATIONS as UI_LOCATIONS, valueOf, fullController, theme } from "./data.js";
import { Btn } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import BoardViewport from "./BoardViewport.jsx";
import Inspector from "./Inspector.jsx";
import UnitCard from "./UnitCard.jsx";
import MarketRow from "./MarketRow.jsx";
import ControlMeter from "./ControlMeter.jsx";
import {
  ResourceWheel, FactionReadout, MenuOrb, RadialMenu, LocationWindow, TitledWindow, ICON, C as HUD,
} from "./HudChrome.jsx";
import { createGame } from "../game/setup.js";
import { startTurn, endTurn } from "../game/turn.js";
import { performAction } from "../game/actions.js";
import { takeAITurn } from "../game/ai.js";
import { activePlayerId } from "../game/targeting.js";
import { bfsDistances } from "../game/board.js";
import { CHIPS as ENGINE_CHIPS, LOCATIONS as ENGINE_LOCATIONS } from "../game/content.js";
import { CONFIG } from "../game/config.js";
import { NEUTRAL } from "./data.js";
import { getEncounter } from "../game/encounters.js";
import { hasTechNode } from "../game/tech.js";
import { evalCond } from "../game/dsl.js";
import { adaptState, reinforcePreview, engineChipIdToUi, previewLocationContest, previewAttackerStrength } from "./engineAdapter.js";
import { resolveSalvage } from "../game/contest.js";
import { assignTechNode } from "../game/stats.js";
import EncounterModal from "./EncounterModal.jsx";
import TechWheel from "./TechWheel.jsx";
import EventFeed from "./EventFeed.jsx";
import UnitPanel from "./UnitPanel.jsx";
import ContestOverlay from "./ContestOverlay.jsx";
import SalvageModal from "./SalvageModal.jsx";

const TAB_H = 44;

// v0.2 §16.6 — human-readable list of the combat-lever modifiers a
// contest applied, for the resolution overlay.
function contestMods(r) {
  const out = [];
  if (r.attackerAllies) out.push(`+${r.attackerAllies} atk allied units`);
  if (r.attackerConcentration) out.push(`+${r.attackerConcentration} atk concentration`);
  if (r.attackerVeteran) out.push(`+${r.attackerVeteran} atk veteran`);
  if (r.defenderAllies) out.push(`+${r.defenderAllies} def allied units`);
  if (r.defenderConcentration) out.push(`+${r.defenderConcentration} def concentration`);
  if (r.defenderMountain) out.push(`+${r.defenderMountain} mountain`);
  if (r.defenderFortify) out.push(`+${r.defenderFortify} fortify`);
  if (r.defenderVeteran) out.push(`+${r.defenderVeteran} def veteran`);
  return out;
}

const MENU_ITEMS = [
  { key: "research", icon: ICON.research, label: "Research" },
  { key: "units", icon: ICON.units, label: "Units" },
  { key: "locations", icon: ICON.shield, label: "Locations" },
  { key: "market", icon: ICON.scrap, label: "Market" },
];

// Collapse a selected location hex into the single-window view-model that
// LocationWindow renders. Mirrors Inspector's old Card/Control/Contest/
// Manage tabs, now on one screen.
function buildLocView(state, hex, isYourTurn) {
  const youId = state.youId;
  const you = state.players[youId];
  const control = hex.control;
  const ctrl = fullController(control.sections);
  const uiLoc = UI_LOCATIONS[hex.locationId] || {};
  const val = valueOf(hex.locationId);
  const unit = hex.unitId ? state.units[hex.unitId] : null;
  const yourUnitHere = unit && unit.owner === youId;
  const youControlHere = ctrl === youId;
  const hasNeutral = control.sections.includes("neutral");
  const claimed = control.sections.some((s) => s !== "neutral");
  const hasTrainingGrounds = control.chips.includes("trainingGrounds");

  let contest = null;
  if (yourUnitHere && ctrl !== youId) {
    const atk = previewAttackerStrength(state.engineState, hex.id, unit.owner);
    const def = previewLocationContest(state.engineState, hex.id);
    contest = {
      attackerName: unit.name,
      attackerTotal: atk.total,
      defenderLabel: def && def.defendingUnit ? "Garrison + unit" : "Garrison",
      defenderValue: def ? def.value : hex.garrison,
      defenderRollsDie: def ? def.defenderRollsDie : true,
      hasNeutral,
      canContest: isYourTurn,
      unitId: unit.id,
    };
  }

  return {
    hexId: hex.id,
    name: (uiLoc.name || hex.locationId).toUpperCase(),
    valueLabel: `${val.label} Value`,
    valueColor: val.color,
    vp: uiLoc.vp || 0,
    statusLabel: ctrl ? `Held — ${UI_FACTIONS[ctrl]?.name}` : claimed ? "Contested" : "Uncontrolled",
    sections: control.sections,
    foothold: control.foothold,
    footholdCap: control.footholdCap,
    garrison: hex.garrison,
    production: hex.production,
    chipSlots: control.chipSlots,
    ability:
      hex.abilityId && control.ability
        ? {
            name: control.ability.name,
            text: control.ability.text,
            usedThisTurn: control.abilityUsedThisTurn,
            canActivate: youControlHere && isYourTurn && !control.abilityUsedThisTurn,
          }
        : null,
    recruit:
      youControlHere && hasTrainingGrounds
        ? { cost: 10, canAfford: isYourTurn && you.scrap >= 10 }
        : null,
    contest,
  };
}

function bootGame(seed, humanFactionId) {
  const game = createGame({ seed, humanFactionId });
  startTurn(game);
  driveAIsThroughHumanTurn(game);
  return game;
}

function driveAIsThroughHumanTurn(game) {
  let guard = 12;
  while (!game.winnerId && guard-- > 0) {
    const pid = activePlayerId(game);
    if (!game.players[pid].isAI) return;
    takeAITurn(game);
  }
}

function Bracket({ corner }) {
  const c = theme.accent;
  const map = {
    tl: { top: 0, left: 0, borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}` },
    tr: { top: 0, right: 0, borderTop: `2px solid ${c}`, borderRight: `2px solid ${c}` },
    bl: { bottom: 0, left: 0, borderBottom: `2px solid ${c}`, borderLeft: `2px solid ${c}` },
    br: { bottom: 0, right: 0, borderBottom: `2px solid ${c}`, borderRight: `2px solid ${c}` },
  };
  return <div className="pc-bracket" style={map[corner]} />;
}

export default function Prototype({ config, onNewGame }) {
  // The engine mutates a single GameState in place; we hold a ref to it
  // and bump a tick to trigger a re-adapt + re-render after each mutation.
  const gameRef = useRef(null);
  if (!gameRef.current) {
    gameRef.current = bootGame(config?.seed ?? 42, config?.humanFactionId ?? "versari");
  }
  const [tick, setTick] = useState(0);
  const bumpTick = useCallback(() => setTick((t) => t + 1), []);

  const state = useMemo(() => adaptState(gameRef.current), [tick]);
  const [selectedHexId, setSelectedHexId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [toast, setToast] = useState(null); // { kind: "error"|"info", text }
  const [encounterPrompt, setEncounterPrompt] = useState(null); // pending move + encounter pick
  const [contestViz, setContestViz] = useState(null); // contest replay overlay
  const [salvagePrompt, setSalvagePrompt] = useState(null); // interactive salvage
  const [showTechWheel, setShowTechWheel] = useState(false); // §17 wheel overlay
  const [menuOpen, setMenuOpen] = useState(false); // radial menu visible
  const [menuPanel, setMenuPanel] = useState(null); // "units"|"market"|"locations"|"settings"
  const you = state.players[state.youId];
  const isYourTurn = state.activeId === state.youId && !state.winnerId;
  const yourUnits = Object.values(state.units).filter((u) => u.owner === state.youId);
  const yourLocationHexes = Object.values(state.hexes).filter(
    (h) => h.type === "location" && h.control?.sections?.some((s) => s === state.youId),
  );
  const techLabel = (() => {
    const research = you.research || 0;
    const thresholds = state.techThresholds || [];
    const next = thresholds.find((t) => t > research);
    if (!next) return "Tech Max";
    const prev = [0, ...thresholds].filter((t) => t <= research).pop() || 0;
    return `Tech ${Math.round((100 * (research - prev)) / (next - prev))}%`;
  })();

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Drop selection when a turn changes — selected unit may no longer be
  // yours / be ready.
  useEffect(() => {
    if (!selectedUnitId) return;
    const unit = state.units[selectedUnitId];
    if (!unit || unit.owner !== state.youId) setSelectedUnitId(null);
  }, [state, selectedUnitId]);

  // Compute the set of hexes the selected unit can reach this turn.
  const reachable = useMemo(() => {
    if (!isYourTurn || !selectedUnitId) return null;
    const unit = state.units[selectedUnitId];
    const budget = unit?.moveRemaining ?? unit?.effectiveMovement ?? 0;
    if (!unit || unit.immobilized || budget <= 0) return null;
    const dists = bfsDistances(gameRef.current.board.adjacency, unit.node);
    const out = new Set();
    for (const [hex, d] of Object.entries(dists)) {
      if (d > 0 && d <= budget) out.add(hex);
    }
    return out;
  }, [tick, isYourTurn, selectedUnitId, state]);

  // --- action handlers ----------------------------------------------

  function runAction(type, params, ctx, successMsg) {
    const r = performAction(gameRef.current, type, params, ctx || {});
    if (!r.ok) {
      setToast({ kind: "error", text: r.reason });
      return r;
    }
    if (successMsg) setToast({ kind: "info", text: successMsg });
    bumpTick();
    return r;
  }

  function peekFieldEncounter(game, destHex) {
    if (game.board.hexes[destHex]?.type !== "encounter") return null;
    const cooldownUntil = game.world?.encounterHexCooldowns?.[destHex] || 0;
    if (game.round < cooldownUntil) return null;
    const id = game.encounterDeck?.[0];
    if (!id) return null;
    return getEncounter(id);
  }

  function eligibleChoiceIds(game, encounter, pid) {
    const subCtx = { sourcePlayer: pid };
    return (encounter.choices || [])
      .filter((c) => c.condition == null || evalCond(game, c.condition, subCtx))
      .map((c) => c.id);
  }

  // §17.5 Intelligence (Recon) + Recon Team chips each grant one
  // encounter discard for the drawing player.
  function redrawBudget(game, pid) {
    let recon = 0;
    for (const loc of Object.values(game.locations)) {
      if (loc.controller !== pid) continue;
      for (const c of loc.chips) if (game.chips[c]?.chipId === "recon-team") recon += 1;
    }
    return (hasTechNode(game, pid, "int-entry") ? 1 : 0) + recon;
  }

  // Build the encounter pre-flight prompt for the card at deck index `idx`
  // (the engine discards to the bottom, so after `idx` discards it draws
  // exactly deck[idx]). `redrawsLeft` drives the "discard & redraw" button.
  function buildEncounterPrompt(game, unitUid, dest, idx) {
    const id = game.encounterDeck?.[idx];
    if (!id) return null;
    const enc = getEncounter(id);
    if (!enc || !(enc.choices || []).length) return null;
    const elig = eligibleChoiceIds(game, enc, state.youId);
    const remaining = Math.max(0, redrawBudget(game, state.youId) - idx);
    const canRedraw = remaining > 0 && game.encounterDeck.length > idx + 1;
    return {
      encounter: enc,
      choices: enc.choices,
      eligibleIds: elig.length ? elig : enc.choices.map((c) => c.id),
      unitUid, dest, idx,
      redrawsLeft: canRedraw ? remaining : 0,
    };
  }

  // Terrain (wasteland) hexes carry no info worth a dialogue, so they
  // never open the Inspector — landing on or clicking one just leaves
  // the inspector closed.
  function inspectHex(hexId) {
    if (state.hexes[hexId]?.type === "terrain") {
      setSelectedHexId(null);
      return;
    }
    setSelectedHexId(hexId);
  }

  function doMoveWithEncounterChoice(unitUid, dest, choiceId, discards = 0) {
    let redrawsDone = 0;
    const ctx = {
      interactiveLoot: true,
      interact: (req) => {
        // Replay the player's discards (engine sends them to the bottom),
        // then answer the choice for the card finally drawn.
        if (req.kind === "encounterRedraw") return redrawsDone++ < discards;
        if (req.kind === "encounterChoice") return choiceId;
        return req?.options ? req.options[0] : null; // fallback to first
      },
    };
    const r = runAction("move", { unit: unitUid, to: dest }, ctx);
    if (r.ok) { inspectHex(dest); maybeOpenLoot(); }
    setEncounterPrompt(null);
  }

  // Open the salvage modal if a Move just landed on a loot pile (§ hex loot).
  function maybeOpenLoot() {
    const p = buildSalvagePrompt(gameRef.current);
    if (p) setSalvagePrompt(p);
  }

  function onHexClick(hexId) {
    // Reachable hex with selected unit → Move. Don't open inspector.
    if (
      isYourTurn &&
      selectedUnitId &&
      reachable?.has(hexId) &&
      state.units[selectedUnitId]?.node !== hexId
    ) {
      // Pre-flight: if the move would draw a field encounter, surface
      // the choice modal first and stash the pending move on it.
      const enc = peekFieldEncounter(gameRef.current, hexId);
      if (enc && (enc.choices || []).length > 0) {
        setEncounterPrompt(buildEncounterPrompt(gameRef.current, selectedUnitId, hexId, 0));
        return;
      }
      const r = runAction("move", { unit: selectedUnitId, to: hexId }, { interactiveLoot: true });
      if (r.ok) { inspectHex(hexId); maybeOpenLoot(); }
      return;
    }

    // Otherwise toggle the inspector (terrain never opens it). Hex
    // selection no longer touches unit selection — those are
    // independent now (unit tokens have their own click handler).
    if (state.hexes[hexId]?.type === "terrain") {
      setSelectedHexId(null);
      return;
    }
    setSelectedHexId((cur) => (cur === hexId ? null : hexId));
  }

  function onUnitClick(unit) {
    // Toggle: clicking the already-selected unit deselects.
    setSelectedUnitId((cur) => (cur === unit.uid ? null : unit.uid));
  }

  function onSelectUnit(unitUid) {
    // Path used by the Units menu window's cards.
    setSelectedUnitId(unitUid);
  }

  function onContest(params) {
    const game = gameRef.current;
    const attacker = game.units[params.unit];
    if (!attacker) return runAction("contest", params);

    // Capture the contestant descriptors BEFORE resolving (names, base
    // values, owner colours) — the contest mutates state and clears
    // this-contest modifiers afterwards.
    const loc = game.locations[attacker.node];
    let defName, defBase, defColor, defLabel;
    if (params.target && game.units[params.target]) {
      const du = game.units[params.target];
      defName = du.name;
      defBase = du.baseStrength;
      defColor = UI_FACTIONS[du.owner]?.color;
      defLabel = "Strength";
    } else if (loc) {
      defName = ENGINE_LOCATIONS[loc.locationId]?.name || loc.locationId;
      defBase = CONFIG.garrisonByValue[loc.strategicValue] ?? loc.garrison;
      defColor = loc.controller ? UI_FACTIONS[loc.controller]?.color : NEUTRAL;
      defLabel = "Garrison";
    }

    // deferSalvage routes any kill's chip distribution to the interactive
    // SalvageModal (opened when the contest overlay closes) instead of the
    // headless auto-salvage.
    const r = performAction(game, "contest", params, { deferSalvage: true });
    if (!r.ok) {
      setToast({ kind: "error", text: r.reason });
      return r;
    }
    bumpTick();

    setContestViz({
      attacker: {
        name: attacker.name,
        label: "Strength",
        base: attacker.baseStrength,
        calculated: r.cancelled ? null : r.initiatorTotal - r.initiatorRoll,
        roll: r.initiatorRoll,
        total: r.initiatorTotal,
        color: UI_FACTIONS[attacker.owner]?.color,
      },
      defender: {
        name: defName,
        label: defLabel,
        base: defBase,
        // pre-die value, now incl. §16.6 modifiers
        calculated: r.cancelled ? null : r.defenderTotal - r.defenderRoll,
        roll: r.defenderRoll,
        total: r.defenderTotal,
        rollsDie: r.defenderRolled,
        color: defColor,
      },
      won: r.won,
      cancelled: r.cancelled,
      kind: r.kind,
      // v0.2 §16.4 — attrition / death / salvage summary
      attackerStrLost: r.attackerStrLost || 0,
      defenderStrLost: r.defenderStrLost || 0,
      killed: r.killed || [],
      salvage: r.salvage || null,
      // v0.2 §16.6 — combat-lever breakdown
      mods: contestMods(r),
    });
    return r;
  }
  // Build the descriptor the SalvageModal needs from the head of the
  // engine's pending-salvage queue (null when empty).
  function buildSalvagePrompt(game) {
    const e = game.pendingSalvage?.[0];
    if (!e) return null;
    const killer = game.units[e.killerUid];
    const info = (uid) => {
      const id = game.chips[uid]?.chipId;
      const def = ENGINE_CHIPS[id] || {};
      return {
        uid, uiChipId: engineChipIdToUi(id), name: def.name || id,
        cost: def.cost || 0, slots: def.slots || 1,
        resale: Math.ceil((def.cost || 0) / 2),
      };
    };
    return {
      kind: e.kind === "loot" ? "loot" : "death",
      killerName: killer?.name || "Victor",
      killerColor: UI_FACTIONS[killer?.owner]?.color,
      baySlots: CONFIG.unit.baySlots,
      unitChips: (killer?.chips || []).map(info),
      salvagedChips: e.chips.map(info),
    };
  }

  function onSalvageConfirm(assignments) {
    resolveSalvage(gameRef.current, assignments);
    bumpTick();
    setSalvagePrompt(buildSalvagePrompt(gameRef.current)); // next in queue, or null
  }

  function onAssignTech(nodeId) {
    const r = assignTechNode(gameRef.current, state.youId, nodeId);
    if (!r.ok) setToast({ kind: "error", text: r.reason });
    else bumpTick();
  }

  function onActivate(hexId) {
    return runAction("activate", { location: hexId }, null, "Ability activated.");
  }
  function onRecruit(hexId) {
    return runAction("recruit", { at: hexId }, null, "Unit recruited.");
  }
  function onReinforce(unitUid, mode) {
    const msg = mode === "instant" ? "Unit reinforced." : "Reinforcements dispatched.";
    return runAction("reinforce", { unit: unitUid, mode }, null, msg);
  }
  function onAcquire(uiChip) {
    // uiChip is { uid, chipId, engineChipId }. Pick an install target:
    // unit chip → strongest of your units with bay slots; location chip
    // → cheapest controlled location with free chip slots.
    const def = gameRef.current.chips[uiChip.uid];
    const engineId = def?.chipId;
    const enginePool = gameRef.current.market.tiers[1]?.row || [];
    const inResale = (gameRef.current.resaleRow || []).includes(uiChip.uid);
    if (!enginePool.includes(uiChip.uid) && !inResale) {
      setToast({ kind: "error", text: "Chip is no longer in the market." });
      return;
    }
    const into = pickAcquireTarget(gameRef.current, state.youId, engineId);
    if (!into) {
      setToast({ kind: "error", text: "No legal install target for this chip." });
      return;
    }
    runAction("acquire", { chip: uiChip.uid, into }, null, "Chip installed.");
  }

  function onEndTurn() {
    if (!isYourTurn) return;
    setSelectedUnitId(null);
    endTurn(gameRef.current);
    driveAIsThroughHumanTurn(gameRef.current);
    bumpTick();
  }

  function onMenuPick(key) {
    setMenuOpen(false);
    if (key === "research") {
      setShowTechWheel(true);
      return;
    }
    setMenuPanel(key);
  }

  return (
    <div
      className="pc-root"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* BOARD — the field of battle; drag to pan, wheel to zoom.
          HUD chrome (resource wheel, faction readout, menu orb) floats
          over it as absolute overlays — see below. */}
      <div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
        <BoardViewport>
          <div style={{ position: "relative", padding: 30 }}>
            <Bracket corner="tl" />
            <Bracket corner="tr" />
            <Bracket corner="bl" />
            <Bracket corner="br" />
            <HexBoard
              state={state}
              selectedHexId={selectedHexId}
              selectedUnitId={selectedUnitId}
              reachable={reachable}
              onSelect={onHexClick}
              onUnitClick={onUnitClick}
            />
          </div>
        </BoardViewport>
        {selectedUnitId && state.units[selectedUnitId] && (
          <UnitPanel
            unit={state.units[selectedUnitId]}
            hex={state.hexes[state.units[selectedUnitId].node]}
            canAct={isYourTurn && state.units[selectedUnitId].owner === state.youId}
            reinforce={reinforcePreview(gameRef.current, selectedUnitId)}
            scrap={you.scrap}
            onReinforce={onReinforce}
            onClose={() => setSelectedUnitId(null)}
          />
        )}
        <EventFeed engineState={gameRef.current} tick={tick} />
      </div>

      {/* HEX DETAIL — locations open the single-window Location view;
          encounter / terrain hexes keep the tabbed Inspector. */}
      {selectedHexId && state.hexes[selectedHexId]?.type === "location" && (
        <LocationWindow
          view={buildLocView(state, state.hexes[selectedHexId], isYourTurn)}
          onClose={() => setSelectedHexId(null)}
          onActivate={(h) => onActivate(h)}
          onRecruit={(h) => onRecruit(h)}
          onContest={(p) => {
            onContest(p);
            setSelectedHexId(null);
          }}
        />
      )}
      {selectedHexId && state.hexes[selectedHexId]?.type !== "location" && (
        <Inspector
          state={state}
          selectedHexId={selectedHexId}
          selectedUnitId={selectedUnitId}
          isYourTurn={isYourTurn}
          onClose={() => setSelectedHexId(null)}
          onSelectUnit={onSelectUnit}
          onContest={onContest}
          onActivate={onActivate}
          onRecruit={onRecruit}
        />
      )}

      {/* HUD CHROME — radial / holographic overlays replacing the old
          top bar and bottom dock. */}
      <ResourceWheel
        scrap={you.scrap}
        units={{ n: yourUnits.length, cap: you.unitCap }}
        tech={{ level: you.techLevel, label: techLabel }}
        onSettings={() => setMenuPanel("settings")}
      />
      <FactionReadout
        name={UI_FACTIONS[state.youId]?.name}
        color={UI_FACTIONS[state.youId]?.color}
        vp={you.vp}
        vpGoal={state.vpGoal}
        actions={you.actions}
        round={state.round}
        onEndTurn={onEndTurn}
        endDisabled={!isYourTurn}
      />
      <MenuOrb onOpen={() => setMenuOpen(true)} />

      {menuOpen && (
        <RadialMenu items={MENU_ITEMS} onPick={onMenuPick} onClose={() => setMenuOpen(false)} />
      )}

      {menuPanel === "units" && (
        <TitledWindow title="Units" icon={ICON.units} onClose={() => setMenuPanel(null)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {yourUnits.length === 0 && (
              <span style={{ color: HUD.textDim, fontSize: 13 }}>No units in the field yet.</span>
            )}
            {yourUnits.map((u) => (
              <div
                key={u.id}
                className="hud-int"
                onClick={() => { onSelectUnit(u.id); setMenuPanel(null); }}
                style={{ cursor: "pointer" }}
              >
                <UnitCard unit={u} />
              </div>
            ))}
          </div>
        </TitledWindow>
      )}

      {menuPanel === "market" && (
        <TitledWindow title="Market" icon={ICON.scrap} onClose={() => setMenuPanel(null)} width={560}>
          <MarketRow state={state} isYourTurn={isYourTurn} onAcquire={onAcquire} chipWidth={76} />
        </TitledWindow>
      )}

      {menuPanel === "locations" && (
        <TitledWindow title="Locations" icon={ICON.shield} onClose={() => setMenuPanel(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {yourLocationHexes.length === 0 && (
              <span style={{ color: HUD.textDim, fontSize: 13 }}>
                You hold no sections yet. Move a unit onto a location and contest it.
              </span>
            )}
            {yourLocationHexes.map((h) => {
              const ctrl = fullController(h.control.sections);
              return (
                <button
                  key={h.id}
                  className="hud-int"
                  onClick={() => { setMenuPanel(null); setSelectedHexId(h.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(192,124,56,0.3)", background: "rgba(0,0,0,0.25)", color: HUD.text, cursor: "pointer", textAlign: "left" }}
                >
                  <ControlMeter sections={h.control.sections} foothold={h.control.foothold} footholdCap={h.control.footholdCap} size={40} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: HUD.font, fontSize: 16, fontWeight: 700 }}>
                      {UI_LOCATIONS[h.locationId]?.name || h.locationId}
                    </span>
                    <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: HUD.textFaint }}>
                      {ctrl === state.youId ? "Held" : ctrl ? `Held — ${UI_FACTIONS[ctrl]?.short}` : "Contested"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </TitledWindow>
      )}

      {menuPanel === "settings" && (
        <TitledWindow title="Settings" onClose={() => setMenuPanel(null)}>
          <p className="pc-prose" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: HUD.textDim }}>
            Game options will live here. For now:
          </p>
          <div style={{ marginTop: 14 }}>
            <Btn variant="primary" onClick={onNewGame}>Abandon &amp; New Game</Btn>
          </div>
        </TitledWindow>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: TAB_H + 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 65,
            background: toast.kind === "error" ? "#3a1a14" : theme.plate,
            border: `1px solid ${toast.kind === "error" ? theme.accent2 : theme.borderLit}`,
            borderRadius: 6,
            padding: "8px 16px",
            color: theme.text,
            fontFamily: theme.fontDisplay,
            fontSize: 12.5,
            letterSpacing: 0.6,
            boxShadow: theme.shadowDeep,
          }}
        >
          {toast.text}
        </div>
      )}

      {encounterPrompt && (
        <EncounterModal
          encounter={encounterPrompt.encounter}
          choices={encounterPrompt.choices}
          eligibleIds={encounterPrompt.eligibleIds}
          redrawsLeft={encounterPrompt.redrawsLeft}
          onRedraw={() =>
            setEncounterPrompt(
              buildEncounterPrompt(
                gameRef.current,
                encounterPrompt.unitUid,
                encounterPrompt.dest,
                encounterPrompt.idx + 1,
              ),
            )
          }
          onPick={(choiceId) =>
            doMoveWithEncounterChoice(
              encounterPrompt.unitUid,
              encounterPrompt.dest,
              choiceId,
              encounterPrompt.idx,
            )
          }
          onCancel={() => setEncounterPrompt(null)}
        />
      )}

      {contestViz && (
        <ContestOverlay
          viz={contestViz}
          onClose={() => {
            setContestViz(null);
            setSalvagePrompt(buildSalvagePrompt(gameRef.current));
          }}
        />
      )}

      {salvagePrompt && (
        <SalvageModal prompt={salvagePrompt} onConfirm={onSalvageConfirm} />
      )}

      {showTechWheel && (
        <TechWheelOverlay
          you={you}
          state={state}
          onAssign={onAssignTech}
          onClose={() => setShowTechWheel(false)}
        />
      )}

      {state.winnerId && !contestViz && !salvagePrompt && (
        <EndOverlay state={state} onNewGame={onNewGame} />
      )}
    </div>
  );
}

function EndOverlay({ state, onNewGame }) {
  const winner = state.players[state.winnerId];
  const winnerFaction = UI_FACTIONS[state.winnerId];
  const sorted = Object.values(state.players).sort((a, b) => b.vp - a.vp);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.78)",
      }}
    >
      <div
        style={{
          background: theme.plate,
          border: `2px solid ${winnerFaction?.color || theme.accent}`,
          borderRadius: 12,
          padding: "30px 44px",
          textAlign: "center",
          boxShadow: theme.shadowDeep,
          minWidth: 320,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 12,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: theme.textFaint,
            fontWeight: 600,
          }}
        >
          Victory
        </div>
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 30,
            fontWeight: 800,
            color: winnerFaction?.color || theme.accent,
            marginTop: 6,
            letterSpacing: 1.4,
          }}
        >
          {winnerFaction?.name || winner?.id}
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {sorted.map((p) => {
            const f = UI_FACTIONS[p.id];
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12.5,
                  color: theme.text,
                  borderTop: `1px solid ${theme.border}`,
                  padding: "5px 0",
                }}
              >
                <span style={{ color: f?.color, fontWeight: 600 }}>
                  {f?.short || p.id}
                  {p.id === state.winnerId ? " ★" : ""}
                </span>
                <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700 }}>
                  {p.vp} VP
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <Btn variant="primary" onClick={onNewGame}>
            New Game
          </Btn>
        </div>
      </div>
    </div>
  );
}

function TechWheelOverlay({ you, state, onAssign, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 72, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.plate, border: `1px solid ${theme.borderLit}`, borderRadius: 12,
          boxShadow: theme.shadowDeep, padding: "18px 22px 20px", maxWidth: "96vw",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontFamily: theme.fontDisplay, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: theme.text }}>
            Tech Wheel
          </span>
          <span style={{ fontSize: 11, color: theme.textDim }}>
            Level {you.techLevel}/{state.maxTechLevel} · Research {you.research} ·{" "}
            <span style={{ color: theme.accent, fontWeight: 700 }}>{you.abilityPointsAvailable} Ability Points</span>
          </span>
          <Btn onClick={onClose}>Close</Btn>
        </div>
        <TechWheel player={you} onAssign={onAssign} />
      </div>
    </div>
  );
}

// Pick an install target for an Acquire — mirrors the AI's logic so the
// user doesn't have to navigate a sub-modal for the demo. Returns
// { unit } or { location } shaped param for performAction("acquire").
function pickAcquireTarget(game, pid, engineChipId) {
  const chipDef = ENGINE_CHIPS[engineChipId];
  if (!chipDef) return null;
  const slotsUsed = (chipUids) => chipUids.reduce((n, c) => {
    const id = game.chips[c]?.chipId;
    if (id === "capital") return n + 1;
    return n + (ENGINE_CHIPS[id]?.slots ?? 1);
  }, 0);

  if (chipDef.kind === "unit") {
    const mine = Object.values(game.units)
      .filter((u) => u.owner === pid)
      .sort((a, b) => b.strength - a.strength);
    for (const u of mine) {
      if (slotsUsed(u.chips) + chipDef.slots <= CONFIG.unit.baySlots) {
        return { unit: u.uid };
      }
    }
    return null;
  }
  const mine = Object.values(game.locations).filter((l) => l.controller === pid);
  for (const loc of mine) {
    if (slotsUsed(loc.chips) + chipDef.slots <= loc.chipSlots) {
      return { location: loc.hexId };
    }
  }
  return null;
}
