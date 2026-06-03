// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar and a
// bottom tab dock — with a floating tabbed window for hex inspection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./prototype.css";
import { FACTIONS as UI_FACTIONS, LOCATIONS as UI_LOCATIONS, valueOf, fullController, theme } from "./data.js";
import { Btn } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import BoardViewport from "./BoardViewport.jsx";
import Inspector from "./Inspector.jsx";
import UnitCard from "./UnitCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import {
  TopBar, MenuOrb, RadialMenu, LocationWindow, TitledWindow, ICON, C as HUD,
} from "./HudChrome.jsx";
import { createGame } from "../game/setup.js";
import { startTurn, endTurn } from "../game/turn.js";
import { performAction } from "../game/actions.js";
import { takeAITurn } from "../game/ai.js";
import { activePlayerId } from "../game/targeting.js";
import { bfsDistances } from "../game/board.js";
import { unitReach, unitMovePath } from "../game/movement.js";
import { CHIPS as ENGINE_CHIPS, LOCATIONS as ENGINE_LOCATIONS } from "../game/content.js";
import { CONFIG } from "../game/config.js";
import { NEUTRAL } from "./data.js";
import { getEncounter } from "../game/encounters.js";
import { hasTechNode } from "../game/tech.js";
import { evalCond } from "../game/dsl.js";
import { adaptState, reinforcePreview, engineChipIdToUi, previewLocationContest, previewAttackerStrength } from "./engineAdapter.js";
import { resolveSalvage } from "../game/contest.js";
import { assignTechNode } from "../game/stats.js";
import { performDiplomacy } from "../game/diplomacy.js";
import DiplomacyDrawer from "./DiplomacyDrawer.jsx";
import EncounterModal from "./EncounterModal.jsx";
import MoveConfirmOverlay from "./MoveConfirmOverlay.jsx";
import { WikiProvider, TokenProvider } from "./RichText.jsx";
import WikiModal from "./WikiModal.jsx";
import { WIKI_ENTRIES } from "../game/content/index.js";
import { resolveTokens } from "../game/textTokens.js";

// Local-storage key for the "Don't ask again" preference on move confirm.
const SKIP_MOVE_CONFIRM_KEY = "pabc.skipMoveConfirm";
function readSkipMoveConfirm() {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(SKIP_MOVE_CONFIRM_KEY) === "1"; }
  catch { return false; }
}
import TechWheel from "./TechWheel.jsx";
import EventFeed from "./EventFeed.jsx";
import UnitPanel from "./UnitPanel.jsx";
import ContestOverlay from "./ContestOverlay.jsx";
import SalvageModal from "./SalvageModal.jsx";
import { useAIReplay } from "./aiReplay/useAIReplay.js";
import ReplayLayer from "./aiReplay/ReplayLayer.jsx";
import { buildHexGeometry } from "./aiReplay/CameraController.js";
import { getAiTurnSpeed, setAiTurnSpeed, AI_TURN_SPEEDS, AI_TURN_SPEED_LABELS } from "./aiReplay/options.js";

const TAB_H = 44;

// Re-place unit tokens at their DISPLAYED (lagging) hexes during an AI replay
// so pawns visibly slide rather than teleport. Everything else on the board
// stays at end-state. Units currently mid-slide (in `hiddenUnitIds`) are drawn
// by the ReplayLayer instead, so we omit them from the static board.
function withDisplayedPositions(state, positions, hiddenUnitIds) {
  if (!positions) return state;
  const youId = state.youId;
  const byHex = {};
  for (const u of Object.values(state.units)) {
    if (hiddenUnitIds && hiddenUnitIds.has(u.uid)) continue;
    const hex = positions[u.uid] ?? u.node;
    (byHex[hex] ||= []).push(u);
  }
  const hexes = {};
  for (const [id, h] of Object.entries(state.hexes)) {
    if (h.fog !== "visible") { hexes[id] = h; continue; }
    const list = byHex[id];
    if (!list || !list.length) {
      hexes[id] = h.unitId || h.unitIds ? { ...h, unitId: undefined, unitIds: undefined } : h;
      continue;
    }
    const ordered = [...list].sort((a, b) => {
      const am = a.owner === youId ? 0 : 1;
      const bm = b.owner === youId ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.uid < b.uid ? -1 : 1;
    });
    hexes[id] = { ...h, unitIds: ordered.map((u) => u.uid), unitId: ordered[0].uid };
  }
  return { ...state, hexes };
}

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

// §20.2 — the Market is retired; chips are built per-Location, so the radial
// menu drops the Market sector. Building/upgrading happens in the Location
// window (slot-click build menu + chip-click upgrade view).
const MENU_ITEMS = [
  { key: "research", icon: ICON.research, label: "Research" },
  { key: "units", icon: ICON.units, label: "Units" },
  { key: "locations", icon: ICON.shield, label: "Locations" },
  { key: "diplomacy", icon: ICON.diplomacy, label: "Diplomacy" },
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

  // §20 — economy view for cities you fully hold: Output, the guns/butter
  // slider, the active build, the §20.6 build menu and per-chip upgrades.
  // Chips are shown as occupied/empty slots; clicking an empty slot opens the
  // build menu, clicking an installed chip opens its upgrade view (host UI).
  let economy = null;
  if (youControlHere && hex.economy) {
    const e = hex.economy;
    const chipDefs = (control.chipUids || []).map((uid, i) => {
      const engineId = state.engineState.chips[uid]?.chipId;
      const def = ENGINE_CHIPS[engineId];
      return {
        uid,
        chipId: engineId,
        name: def?.name || engineId,
        disabled: !!state.engineState.chips[uid]?.disabled,
        upgrade: e.upgrades[uid] || null,
      };
    });
    economy = {
      output: e.output,
      slider: e.slider,
      progress: e.progress,
      slotCapacity: e.slotCapacity,
      slotsUsed: e.slotsUsed,
      activeBuild: e.activeBuild,
      buildMenu: e.buildMenu,
      chips: chipDefs,
      canManage: isYourTurn,
      scrap: you.scrap,
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
    loyalty: control.loyalty,
    loyaltyMax: control.loyaltyMax,
    loyaltyDanger: control.loyaltyDanger,
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
        ? { cost: CONFIG.unitRecruitCost, canAfford: isYourTurn && you.scrap >= CONFIG.unitRecruitCost }
        : null,
    economy,
    contest,
  };
}

// §18.4.1 — field a VARIABLE subset of minors per game so no two casts (and
// therefore no two political webs) recur. Two distinct minors chosen by seed.
const MINOR_POOL = ["tempest", "croppers", "steeltraders", "dambarans"];
function bootGame(seed, humanFactionId) {
  const minors = [MINOR_POOL[seed % 4], MINOR_POOL[(seed + 2) % 4]];
  const game = createGame({ seed, humanFactionId, minors });
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

  // §AI replay — hex → content-space centre geometry (for camera + pawns).
  const geomRef = useRef(null);
  geomRef.current = useMemo(() => buildHexGeometry(state.rows), [state.rows]);
  const replay = useAIReplay({ gameRef, geomRef, bumpTick });

  const [selectedHexId, setSelectedHexId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [toast, setToast] = useState(null); // { kind: "error"|"info", text }
  const [encounterPrompt, setEncounterPrompt] = useState(null); // pending move + encounter pick
  const [pendingMove, setPendingMove] = useState(null);          // { unitUid, origin, dest } awaiting confirm
  const [skipMoveConfirm, setSkipMoveConfirm] = useState(readSkipMoveConfirm);
  const [contestViz, setContestViz] = useState(null); // contest replay overlay
  const [salvagePrompt, setSalvagePrompt] = useState(null); // interactive salvage

  // Wiki — a clickable [[term]] anywhere in flavor text opens this modal.
  // We keep a small history so the in-modal cross-links have a back button.
  const [wikiHistory, setWikiHistory] = useState([]); // ids visited before current
  const [wikiOpen, setWikiOpen] = useState(null);     // id currently shown
  const openWikiEntry = useCallback((id) => {
    setWikiHistory((h) => (wikiOpen ? [...h, wikiOpen] : h));
    setWikiOpen(id);
  }, [wikiOpen]);
  const navigateWiki = useCallback((id) => openWikiEntry(id), [openWikiEntry]);
  const backWiki = useCallback(() => {
    setWikiHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setWikiOpen(last);
      return h.slice(0, -1);
    });
  }, []);
  const closeWiki = useCallback(() => {
    setWikiOpen(null);
    setWikiHistory([]);
  }, []);
  const [showTechWheel, setShowTechWheel] = useState(false); // §17 wheel overlay
  const [showDiplomacy, setShowDiplomacy] = useState(false); // §18 diplomacy screen
  const [diploResult, setDiploResult] = useState(null); // last action feedback
  // Drawer asks the host to glow a faction's locations on the map while
  // its detail view is open. `null` means no highlight.
  const [highlightedFactionId, setHighlightedFactionId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false); // radial menu visible
  const [menuPanel, setMenuPanel] = useState(null); // "units"|"market"|"locations"|"settings"
  const [aiSpeed, setAiSpeed] = useState(getAiTurnSpeed()); // §AI replay speed (persisted)
  const you = state.players[state.youId];
  // During an AI replay the engine has already advanced (often to the human),
  // but the player must not act until the cinematics finish — gate on it too.
  const isYourTurn = state.activeId === state.youId && !state.winnerId && !replay.isReplaying;
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
    // §16.2 — terrain/road/blockade-aware reachability (shared with the engine).
    const field = unitReach(gameRef.current, gameRef.current.units[selectedUnitId]);
    return new Set(Object.keys(field));
  }, [tick, isYourTurn, selectedUnitId, state]);

  // During an AI replay the board renders pawns at their DISPLAYED (lagging)
  // hexes; units mid-slide are drawn by the ReplayLayer, so hide them here.
  const hiddenUnitIds = useMemo(
    () => new Set(replay.animatedPawns.map((p) => p.uid)),
    [replay.animatedPawns],
  );
  const boardState = replay.displayedPositions
    ? withDisplayedPositions(state, replay.displayedPositions, hiddenUnitIds)
    : state;

  // §16 field raids — enemy units sharing the selected unit's hex are
  // contestable directly (no Location needed). Surfaced in the UnitPanel.
  const raidTargets = useMemo(() => {
    const u = selectedUnitId ? state.units[selectedUnitId] : null;
    if (!u || u.owner !== state.youId) return [];
    // §9 — the engine forces the contest onto the garrison while any neutral
    // section stands, so don't offer a field raid that would be rejected.
    const h = state.hexes[u.node];
    if (h?.type === "location" && h.control?.sections?.includes("neutral")) return [];
    return Object.values(state.units).filter((t) => t.node === u.node && t.owner !== state.youId);
  }, [state, selectedUnitId]);

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
  // never open the Inspector. Encounter hexes still in their refresh
  // cooldown (already drawn this run) are skipped too — the player
  // doesn't need a popup telling them the timer.
  function isInspectableHex(hexId) {
    const hex = state.hexes[hexId];
    if (!hex || hex.type === "terrain") return false;
    if (hex.type === "encounter") {
      const cd = gameRef.current.world?.encounterHexCooldowns?.[hex.id] || 0;
      if (gameRef.current.round < cd) return false;
    }
    return true;
  }
  function inspectHex(hexId) {
    if (!isInspectableHex(hexId)) {
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

  // Run the actual move once the player has committed (either by
  // confirming the overlay or because they've opted out of the prompt).
  // If the destination would draw a field encounter, surface the choice
  // modal — at that point the move is already locked in.
  function executeMove(unitUid, destHex) {
    const enc = peekFieldEncounter(gameRef.current, destHex);
    if (enc && (enc.choices || []).length > 0) {
      setEncounterPrompt(buildEncounterPrompt(gameRef.current, unitUid, destHex, 0));
      return;
    }
    const r = runAction("move", { unit: unitUid, to: destHex }, { interactiveLoot: true });
    if (r.ok) { inspectHex(destHex); maybeOpenLoot(); }
  }

  function onHexClick(hexId) {
    // Reachable hex with selected unit → Move. Don't open inspector.
    if (
      isYourTurn &&
      selectedUnitId &&
      reachable?.has(hexId) &&
      state.units[selectedUnitId]?.node !== hexId
    ) {
      const origin = state.units[selectedUnitId]?.node;
      if (skipMoveConfirm) {
        executeMove(selectedUnitId, hexId);
      } else {
        setPendingMove({ unitUid: selectedUnitId, origin, dest: hexId });
      }
      return;
    }

    // Otherwise toggle the inspector. Skip hexes that don't carry
    // anything worth a dialogue (terrain; encounter sites in cooldown).
    if (!isInspectableHex(hexId)) {
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
  // §20.4–20.7 — economy directives (all free of Actions). Construction
  // advances at Upkeep off the city's Output via its guns/butter slider.
  function onBuild(hexId, chipId) {
    return runAction("build", { at: hexId, chipId }, null, "Build queued.");
  }
  function onUpgrade(hexId, chipUid) {
    return runAction("upgrade", { at: hexId, chip: chipUid }, null, "Upgrade queued.");
  }
  function onRush(hexId) {
    return runAction("rush", { at: hexId }, null, "Build rushed.");
  }
  function onSetSlider(hexId, value) {
    return runAction("set-slider", { at: hexId, value });
  }

  function onEndTurn() {
    if (!isYourTurn || replay.isReplaying) return;
    setSelectedUnitId(null);
    setSelectedHexId(null);
    endTurn(gameRef.current);
    bumpTick();
    // Replay each AI turn cinematically (camera, sliding pawns, popups); the
    // hook bumps ticks through the sequence and hands control back at the end.
    replay.runAITurns();
  }

  function onMenuPick(key) {
    setMenuOpen(false);
    if (key === "research") {
      setShowTechWheel(true);
      return;
    }
    if (key === "diplomacy") {
      setShowDiplomacy(true);
      return;
    }
    setMenuPanel(key);
  }

  // §18.7 — issue a diplomatic verb (free of the Action budget). All 18
  // verbs dispatch through performDiplomacy now; the prototype layer just
  // routes params + surfaces the accept/decline result.
  function onDiplomacy(action, params) {
    const game = gameRef.current;
    const youId = state.youId;
    const r = performDiplomacy(game, youId, action, params || {});
    const targetId = params?.faction || params?.ally || params?.b;
    const name = state.players[targetId] ? (UI_FACTIONS[targetId]?.name || targetId) : targetId;
    let msg = "";
    if (action === "respond-pact-call") {
      // The player answered an inbox call — frame it from their side.
      msg = !r.ok ? (r.reason || "no effect") : r.honored ? "You answer the call to arms." : "You refuse the call.";
      setDiploResult({ ...r, msg });
      bumpTick();
      return;
    }
    if (!r.ok) msg = r.reason || "no effect";
    else if (r.accepted === false) msg = `${name} declines — ${r.reason || ""}`;
    else if (r.accepted === true) msg = `${name} agrees.`;
    else if (r.honored === true) msg = `${name} answers the call.`;
    else if (r.honored === false) msg = `${name} refuses the call.`;
    else msg = `Done${name ? ` — ${name}` : ""}.`;
    setDiploResult({ ...r, msg });
    bumpTick();
  }

  // Bind the token resolver to live engine state. Re-fires on every
  // engine tick so a {faction:lowest-standing-with-active} read mid-game
  // reflects current standings.
  const resolveText = useCallback(
    (text) => resolveTokens(gameRef.current, text, {
      sourcePlayer: encounterPrompt?.encounter?.recipient,
    }),
    [tick, encounterPrompt?.encounter?.recipient],
  );

  return (
    <WikiProvider entries={WIKI_ENTRIES} openEntry={openWikiEntry}>
    <TokenProvider resolve={resolveText}>
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
      <div className="hud-screen-scan" style={{ zIndex: 6 }} />
      {/* BOARD — the field of battle; drag to pan, wheel to zoom.
          HUD chrome (resource wheel, faction readout, menu orb) floats
          over it as absolute overlays — see below. */}
      <div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
        <BoardViewport cameraTarget={replay.cameraTarget} cameraPanMs={replay.cameraPanMs}>
          <div style={{ position: "relative", padding: 30 }}>
            <Bracket corner="tl" />
            <Bracket corner="tr" />
            <Bracket corner="bl" />
            <Bracket corner="br" />
            <HexBoard
              state={boardState}
              selectedHexId={selectedHexId}
              selectedUnitId={selectedUnitId}
              dimmedUnitUid={pendingMove?.unitUid}
              highlightedFactionId={highlightedFactionId}
              reachable={reachable}
              onSelect={onHexClick}
              onUnitClick={onUnitClick}
            />
            <ReplayLayer pawns={replay.animatedPawns} overlays={replay.activeOverlays} />
          </div>
        </BoardViewport>
        {/* Tap-anywhere-to-skip catcher during an AI replay. Skips the rest of
            THIS round's AI turns; the next round replays normally. */}
        {replay.isReplaying && (
          <div
            onClick={replay.skipNow}
            title="Tap to skip the rest of this round's AI turns"
            style={{ position: "absolute", inset: 0, zIndex: 40, cursor: "pointer" }}
          />
        )}
        {replay.isReplaying && replay.turnBanner && <TurnBanner banner={replay.turnBanner} />}
        {selectedUnitId && state.units[selectedUnitId] && (
          <UnitPanel
            unit={state.units[selectedUnitId]}
            hex={state.hexes[state.units[selectedUnitId].node]}
            canAct={isYourTurn && state.units[selectedUnitId].owner === state.youId}
            reinforce={reinforcePreview(gameRef.current, selectedUnitId)}
            scrap={you.scrap}
            raidTargets={raidTargets}
            onReinforce={onReinforce}
            onContest={onContest}
            onClose={() => setSelectedUnitId(null)}
          />
        )}
        <EventFeed engineState={gameRef.current} tick={tick} />
      </div>

      {/* HEX DETAIL — locations open the single-window Location view;
          encounter / terrain hexes keep the tabbed Inspector. */}
      <AnimatePresence>
        {selectedHexId && state.hexes[selectedHexId]?.type === "location" &&
          state.hexes[selectedHexId]?.fog === "visible" && (
          <LocationWindow
            key="location-window"
            view={buildLocView(state, state.hexes[selectedHexId], isYourTurn)}
            onClose={() => setSelectedHexId(null)}
            onActivate={(h) => onActivate(h)}
            onRecruit={(h) => onRecruit(h)}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onRush={onRush}
            onSetSlider={onSetSlider}
            onContest={(p) => {
              onContest(p);
              setSelectedHexId(null);
            }}
          />
        )}
      </AnimatePresence>
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
      <TopBar
        scrap={you.scrap}
        units={{ n: yourUnits.length, cap: you.unitCap }}
        tech={{ level: you.techLevel, label: techLabel }}
        name={UI_FACTIONS[state.youId]?.name}
        color={UI_FACTIONS[state.youId]?.color}
        vp={you.vp}
        vpGoal={state.vpGoal}
        actions={you.actions}
        round={state.round}
        onEndTurn={onEndTurn}
        endDisabled={!isYourTurn}
        onSettings={() => setMenuPanel("settings")}
      />
      <MenuOrb onOpen={() => setMenuOpen(true)} />

      <AnimatePresence>
        {menuOpen && (
          <RadialMenu key="radial-menu" items={MENU_ITEMS} onPick={onMenuPick} onClose={() => setMenuOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
      {menuPanel === "units" && (
        <TitledWindow key="units" title="Units" icon={ICON.units} onClose={() => setMenuPanel(null)}>
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

      {menuPanel === "locations" && (
        <TitledWindow key="locations" title="Locations" icon={ICON.shield} onClose={() => setMenuPanel(null)}>
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
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(86,211,198,0.3)", background: "rgba(0,0,0,0.25)", color: HUD.text, cursor: "pointer", textAlign: "left" }}
                >
                  <ControlMeter sections={h.control.sections} loyalty={h.control.loyalty} danger={h.control.loyaltyDanger} size={40} />
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
        <TitledWindow key="settings" title="Settings" onClose={() => setMenuPanel(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: HUD.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: HUD.text }}>
              AI turn speed
            </span>
            <p className="pc-prose" style={{ margin: "0 0 4px", fontSize: 12, lineHeight: 1.5, color: HUD.textDim }}>
              How fast enemy turns replay — camera pans, sliding pawns, and event popups.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {AI_TURN_SPEEDS.map((s) => (
                <label
                  key={s}
                  className="hud-int"
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(86,211,198,0.25)", background: aiSpeed === s ? "rgba(86,211,198,0.12)" : "rgba(0,0,0,0.2)", color: HUD.text, cursor: "pointer", fontSize: 13 }}
                >
                  <input
                    type="radio"
                    name="aiTurnSpeed"
                    checked={aiSpeed === s}
                    onChange={() => { setAiTurnSpeed(s); setAiSpeed(s); }}
                  />
                  {AI_TURN_SPEED_LABELS[s]}
                </label>
              ))}
            </div>
            <p className="pc-prose" style={{ margin: "6px 0 0", fontSize: 11, lineHeight: 1.5, color: HUD.textFaint }}>
              Tip: tap anywhere during an AI turn to skip the rest of that round&rsquo;s
              enemy turns — the next round still replays. Choose <em>Skip — instant</em>
              above to turn the replay off for good.
            </p>
          </div>
          <div style={{ marginTop: 16, borderTop: `1px solid ${theme.border}`, paddingTop: 14 }}>
            <Btn variant="primary" onClick={onNewGame}>Abandon &amp; New Game</Btn>
          </div>
        </TitledWindow>
      )}
      </AnimatePresence>

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

      <AnimatePresence>
        {pendingMove && (
          <MoveConfirmOverlay
            key="move-confirm"
            unit={state.units[pendingMove.unitUid]}
            originHexId={pendingMove.origin}
            destHexId={pendingMove.dest}
            pathHexIds={unitMovePath(gameRef.current, gameRef.current.units[pendingMove.unitUid], pendingMove.dest)}
            ownerColor={UI_FACTIONS[state.units[pendingMove.unitUid]?.owner]?.color}
            onConfirm={() => {
              const m = pendingMove;
              setPendingMove(null);
              executeMove(m.unitUid, m.dest);
            }}
            onCancel={() => setPendingMove(null)}
            onSkipFuture={() => {
              setSkipMoveConfirm(true);
              try { localStorage.setItem(SKIP_MOVE_CONFIRM_KEY, "1"); } catch {}
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {encounterPrompt && (
          <EncounterModal
            key="encounter"
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
          />
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {showTechWheel && (
          <TechWheel
            key="research"
            player={you}
            onAssign={onAssignTech}
            onClose={() => setShowTechWheel(false)}
            levelInfo={{ level: you.techLevel, maxLevel: state.maxTechLevel, research: you.research }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDiplomacy && (
          <DiplomacyDrawer
            key="diplo-drawer"
            dip={state.diplomacy}
            lastResult={diploResult}
            onAction={onDiplomacy}
            onClose={() => { setShowDiplomacy(false); setDiploResult(null); setHighlightedFactionId(null); }}
            onHighlightFaction={setHighlightedFactionId}
          />
        )}
      </AnimatePresence>

      {state.winnerId && !contestViz && !salvagePrompt && (
        <EndOverlay state={state} onNewGame={onNewGame} />
      )}

      <WikiModal
        openEntryId={wikiOpen}
        history={wikiHistory}
        onClose={closeWiki}
        onNavigate={navigateWiki}
        onBack={backWiki}
      />
    </div>
    </TokenProvider>
    </WikiProvider>
  );
}

// §AI replay — a top-centre announcement of whose turn is replaying. Re-keys
// on the faction name so each AI re-announces with a fade/slide.
function TurnBanner({ banner }) {
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 60, pointerEvents: "none" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={banner.name}
          initial={{ opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 20px",
            borderRadius: 8,
            background: "rgba(14,17,22,0.92)",
            border: `1.5px solid ${banner.color}`,
            boxShadow: `0 6px 22px rgba(0,0,0,0.6), 0 0 18px ${banner.color}55`,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: banner.color, boxShadow: `0 0 10px ${banner.color}` }} />
          <span style={{ fontFamily: theme.fontDisplay, fontSize: 15, fontWeight: 800, letterSpacing: 1, color: theme.text, textTransform: "uppercase" }}>
            {banner.name}&rsquo;s Turn
          </span>
        </motion.div>
      </AnimatePresence>
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

