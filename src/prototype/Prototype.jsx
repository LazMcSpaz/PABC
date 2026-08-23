// Root of the look-pass prototype. The board is front-and-centre;
// everything else lives in peripheral bars — a top faction bar and a
// bottom tab dock — with a floating tabbed window for hex inspection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./prototype.css";
import { FACTIONS as UI_FACTIONS, LOCATIONS as UI_LOCATIONS, valueOf, fullController, theme } from "./data.js";
import { Btn } from "./kit.jsx";
import HexBoard from "./HexBoard.jsx";
import HexBoard3D from "./HexBoard3D.jsx";
import { InfluenceLegend } from "./InfluenceOverlay.jsx";
import BoardViewport from "./BoardViewport.jsx";
import UnitCard from "./UnitCard.jsx";
import ControlMeter from "./ControlMeter.jsx";
import {
  TopBar, MenuOrb, RadialMenu, LocationWindow, BlockadeWindow, EconomyLedger, TitledWindow, ICON, C as HUD, COMPACT_HUD_H,
} from "./HudChrome.jsx";
import { useIsPhone } from "./useViewport.js";
import { useSfxHold, useSfxOn, useSfxOnChange } from "../audio/AudioProvider.jsx";
import VolumeSliders from "../audio/VolumeSliders.jsx";
import { createGame } from "../game/setup.js";
import { startTurn, endTurn } from "../game/turn.js";
import { performAction } from "../game/actions.js";
import { applyOutputAndBuilds, chargeChipUpkeep, chargeUnitUpkeep } from "../game/economy.js";
import { chargePostUpkeep } from "../game/posts.js";
import { chargeBlockadeUpkeep } from "../game/blockades.js";
import { takeAITurn } from "../game/ai.js";
import { activePlayerId } from "../game/targeting.js";
import { bfsDistances } from "../game/board.js";
import { unitReach, unitMovePath } from "../game/movement.js";
import { CHIPS as ENGINE_CHIPS, LOCATIONS as ENGINE_LOCATIONS, ABILITIES as ENGINE_ABILITIES, FACTIONS as ENGINE_FACTIONS, chipDisplayName } from "../game/content.js";
import { CONFIG } from "../game/config.js";
import { downloadGameLog } from "./gameLogExport.js";
import { NEUTRAL } from "./data.js";
import { getEncounter } from "../game/encounters.js";
import { pendingEncountersFor, resolvePendingEncounter } from "../game/encounters.js";
import { encounterRedrawBudget } from "../game/encounters.js";
import { evalCond } from "../game/dsl.js";
import { adaptState, reinforcePreview, engineChipIdToUi, previewLocationContest, previewAttackerStrength, blockadeView, blockadeBuildOffer, postAction, upkeepSummary, economyReport, homeHexFor } from "./engineAdapter.js";
import { resolveSalvage } from "../game/contest.js";
import { assignTechNode } from "../game/stats.js";
import { hasTechNode } from "../game/tech.js";
import { performDiplomacy, trespassPreview } from "../game/diplomacy.js";
import { isUnitVisibleTo } from "../game/visibility.js";
import DiplomacyDrawer from "./DiplomacyDrawer.jsx";
import EncounterModal from "./EncounterModal.jsx";
import { summarizeResolution } from "./encounterOutcome.js";
import ContentEditor from "./ContentEditor.jsx";
import { readEditMode, writeEditMode, restorePatches, forgetPatches } from "./contentEditMode.js";
import { downloadContentEdits } from "./contentEditExport.js";
import { clearPatch } from "../game/contentPatch.js";
import MoveConfirmOverlay from "./MoveConfirmOverlay.jsx";
import { WikiProvider, TokenProvider } from "./RichText.jsx";
import WikiModal from "./WikiModal.jsx";
import { WIKI_ENTRIES } from "../game/content/wiki-repo.js";
import { resolveTokens } from "../game/textTokens.js";

// The ECONOMY half of a player's Upkeep, in the order turn.js charges it.
// Exposed as a dev handle so the upkeep-UI check can compare what the HUD
// promises against what the engine actually takes, rather than reimplementing
// the sum inside the test and proving only that two copies of a bug agree.
function runUpkeepFor(game, pid) {
  applyOutputAndBuilds(game, pid);
  chargeChipUpkeep(game, pid);
  chargePostUpkeep(game, pid);
  chargeBlockadeUpkeep(game, pid);
  chargeUnitUpkeep(game, pid);
}

// Local-storage key for the "Don't ask again" preference on move confirm.
const SKIP_MOVE_CONFIRM_KEY = "pabc.skipMoveConfirm";
function readSkipMoveConfirm() {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(SKIP_MOVE_CONFIRM_KEY) === "1"; }
  catch { return false; }
}

// Board renderer selection. The holographic tile board is the default; the old
// flat board is still reachable for side-by-side comparison on the same save.
// `?board=flat` / `?board=holo` wins for the session and is remembered, so a
// screenshot run or a bug report can pin one without touching code.
const BOARD_KEY = "pc.board";
function useHoloBoard() {
  try {
    const q = typeof location !== "undefined" && new URLSearchParams(location.search).get("board");
    if (q === "flat" || q === "holo") {
      localStorage.setItem(BOARD_KEY, q);
      return q === "holo";
    }
    return localStorage.getItem(BOARD_KEY) !== "flat";
  } catch {
    return true;
  }
}
import TechWheel from "./TechWheel.jsx";
import EventFeed from "./EventFeed.jsx";
import UnitPanel from "./UnitPanel.jsx";
import ContestOverlay from "./ContestOverlay.jsx";
import SalvageModal from "./SalvageModal.jsx";
import { ConfirmModal, CoalitionModal, isPromptDismissed } from "./ConfirmModal.jsx";
import { HeraldLayer, heraldFromLog } from "./HeraldBanners.jsx";
import EnvoyModal from "./EnvoyModal.jsx";
import { atWar } from "../game/diplomacy.js";
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
  { key: "economy", icon: ICON.scrap, label: "Economy" },
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
      return {
        uid,
        chipId: engineId,
        name: chipDisplayName(engineId, ctrl),
        disabled: !!state.engineState.chips[uid]?.disabled,
        upkeep: ENGINE_CHIPS[engineId]?.upkeep || 0,
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
      // Rail doc §2.2 pooling + §3.4 funding priority.
      garrison: e.garrison,
      poolTarget: e.poolTarget,
      poolTargetName: e.poolTargetName,
      poolTargets: e.poolTargets,
      poolBlocked: e.poolBlocked,
      buildPriority: e.buildPriority,
      fundsBlockade: e.fundsBlockade,
    };
  }

  return {
    hexId: hex.id,
    name: (uiLoc.name || hex.locationId).toUpperCase(),
    valueLabel: `${val.label} Value`,
    valueColor: val.color,
    vp: uiLoc.vp || 0,
    statusLabel: ctrl ? `Held — ${UI_FACTIONS[ctrl]?.name}` : claimed ? "Contested" : "Uncontrolled",
    // What this place IS, as opposed to what it scores. Nine of the nineteen
    // have no line written yet and render without one.
    flavour: uiLoc.flavour || null,
    basis: uiLoc.basis || null,
    // Whether the city can still do something — the window is where you spend
    // a city's action, so it is the one place that has to say so.
    actionsReady: hex.actionsReady || 0,
    sections: control.sections,
    loyalty: control.loyalty,
    loyaltyMax: control.loyaltyMax,
    loyaltyDanger: control.loyaltyDanger,
    // §11 — who is squeezing the place. The window is where a player decides
    // what to do about it, so it is where the arrow has to be nameable.
    pressureBy: control.pressureBy || null,
    garrison: hex.garrison,
    production: hex.production,
    chipSlots: control.chipSlots,
    ability:
      hex.abilityId && control.ability
        ? {
            name: control.ability.name,
            text: control.ability.text,
            usedThisTurn: control.abilityUsedThisTurn,
            // Passive-only abilities (Fortified Ruins, Toll Gate, …) have
            // nothing to activate — the window hides the button entirely.
            passiveOnly: (ENGINE_ABILITIES[hex.abilityId]?.activated?.length ?? 0) === 0,
            canActivate: youControlHere && isYourTurn && !control.abilityUsedThisTurn &&
              (ENGINE_ABILITIES[hex.abilityId]?.activated?.length ?? 0) > 0,
          }
        : null,
    recruit:
      youControlHere && hasTrainingGrounds
        ? { cost: CONFIG.unitRecruitCost, canAfford: isYourTurn && you.scrap >= CONFIG.unitRecruitCost }
        : null,
    // §12.3 — Saboteurs. The engine action has existed and worked since the
    // Intelligence branch shipped, the AI uses it every round it can, and the
    // player had NO BUTTON ANYWHERE. An engine verb the human cannot reach is
    // not a verb; it is an asymmetry. It ships in the legibility phase rather
    // than with the espionage economy for exactly that reason — otherwise
    // economy stage 5 would put a price on something only the AI can buy.
    sabotage: sabotageOffer(state, hex, isYourTurn),
    economy,
    contest,
  };
}

// Can the viewer run Saboteurs against this Location right now, and if not,
// why not? Mirrors `validateSabotage` rather than re-deriving it, so the
// button never offers something the engine will refuse — and the reason it
// gives is the engine's own.
function sabotageOffer(state, hex, isYourTurn) {
  const g = state.engineState;
  const youId = state.youId;
  if (!hasTechNode(g, youId, "int-b2")) return null; // not on your wheel: no button at all
  const ctrl = hex.controller || fullController(hex.control?.sections);
  if (!ctrl || ctrl === youId) return null;          // nothing to sabotage
  const usedThisRound = g.players[youId]?.sabotageUsedRound === g.round;
  return {
    targetName: UI_LOCATIONS[hex.locationId]?.name || hex.locationId,
    can: isYourTurn && !usedThisRound,
    reason: !isYourTurn ? "Not your turn"
      : usedThisRound ? "Your saboteurs have already moved this round"
      : null,
    // Sabotage costs no Action and no scrap — the cost is the once-per-round
    // limit, and the Loyalty it takes off a place is the point.
    effect: "Loyalty −1",
  };
}

// §18.4.1 — field a VARIABLE subset of minors per game so no two casts (and
// therefore no two political webs) recur. Two distinct minors chosen by seed.
const MINOR_POOL = ["tempest", "croppers", "steeltraders", "dambarans"];

// Which majors are in play. The human is always seated; the rest fill up to
// `count` in registry order, so a 2-faction game is you and one rival rather
// than a random pair that might exclude you.
function majorsFor(humanFactionId, count) {
  const all = Object.keys(ENGINE_FACTIONS);
  const n = Math.max(2, Math.min(all.length, count || all.length));
  if (n >= all.length) return undefined; // undefined = "all of them", createGame's default
  const picked = [humanFactionId].filter((f) => all.includes(f));
  for (const f of all) {
    if (picked.length >= n) break;
    if (!picked.includes(f)) picked.push(f);
  }
  // Keep registry order, so turn order does not depend on who the human picked.
  return all.filter((f) => picked.includes(f));
}

function bootGame(config) {
  const seed = config?.seed ?? 42;
  const humanFactionId = config?.humanFactionId ?? "versari";
  // §18.4.1 — a VARIABLE subset of minors per game so no two political webs
  // recur. The setup screen can switch them off entirely.
  const minors = config?.minorFactions === false
    ? []
    : [MINOR_POOL[seed % 4], MINOR_POOL[(seed + 2) % 4]];
  const game = createGame({
    seed,
    humanFactionId,
    minors,
    mapSize: config?.mapSize,
    factionIds: majorsFor(humanFactionId, config?.factionCount),
    locationBudget: config?.locationBudget ?? null,
    // Victory conditions, encounter cadence and fog all come straight from
    // the setup screen. Anything the screen omits falls back to the engine's
    // own defaults inside createGame.
    rules: {
      victory: config?.victory,
      fogOfWar: config?.fogOfWar,
      encounters: config?.encounters,
    },
  });
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

// Content Edit Mode's saved edits go back into the engine BEFORE any game is
// built: offerQuests reads opener gates on the very first turn, so a gate
// edited last session has to be in place by then or the session starts on the
// shipped content and diverges from the file on disk.
restorePatches();

export default function Prototype({ config, onNewGame }) {
  // The engine mutates a single GameState in place; we hold a ref to it
  // and bump a tick to trigger a re-adapt + re-render after each mutation.
  const gameRef = useRef(null);
  if (!gameRef.current) {
    gameRef.current = bootGame(config);
    // Dev handle — lets the screenshot harness / console stage scenarios.
    if (typeof window !== "undefined") window.__ashland = gameRef.current;
    // Dev handle: run the engine's own Upkeep for one player. Exists so the
    // upkeep-UI check can compare what the HUD promises against what the
    // engine actually charges, rather than reimplementing the sum in the test.
    if (typeof window !== "undefined") window.__ashlandUpkeep = runUpkeepFor;
  }
  const [tick, setTick] = useState(0);
  const bumpTick = useCallback(() => setTick((t) => t + 1), []);
  if (typeof window !== "undefined") window.__ashlandBump = bumpTick; // dev handle
  const isPhone = useIsPhone();
  const hudOffset = isPhone ? COMPACT_HUD_H : 60;

  const state = useMemo(() => adaptState(gameRef.current), [tick]);

  // Which board renders. The holographic tile board is the direction of
  // travel; the flat board stays reachable (`?board=flat`, or localStorage
  // `pc.board`) so the two can be compared on the same save while the art and
  // the overlays are still being tuned.
  const holoBoard = useHoloBoard();
  const Board = holoBoard ? HexBoard3D : HexBoard;

  // §AI replay — hex → content-space centre geometry (for camera + pawns).
  // The two boards project hexes differently, so the camera has to be told
  // which one it is flying over.
  const geomRef = useRef(null);
  geomRef.current = useMemo(
    () => buildHexGeometry(state.rows, { holo: holoBoard }),
    [state.rows, holoBoard],
  );
  const replay = useAIReplay({ gameRef, geomRef, bumpTick });

  // Where the camera opens the game: your Capital, in the same content-space
  // coordinates the replay camera pans to. Computed once — BoardViewport only
  // reads it on mount, and re-deriving it every render would recompute a
  // constant on every tick.
  const openingFocus = useMemo(
    () => geomRef.current?.centers?.[homeHexFor(gameRef.current, state.youId)] || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // §11 — the influence heatmap toggle. Off by default: it answers a question
  // the player asks deliberately, and a permanent wash over the board would
  // compete with the ZoC ring for the same reading.
  const [showInfluence, setShowInfluence] = useState(false);
  const [selectedHexId, setSelectedHexId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [toast, setToast] = useState(null); // { kind: "error"|"info", text }
  // Things the player has waved off for now. An offer they said "consider it"
  // to stays live in the drawer; it just stops knocking. Cleared by nothing —
  // the ids are one-shot and the offer expires on its own.
  const [deferredAudience, setDeferredAudience] = useState([]);
  const [encounterPrompt, setEncounterPrompt] = useState(null); // pending move + encounter pick
  const [pendingMove, setPendingMove] = useState(null);          // { unitUid, origin, dest } awaiting confirm
  const [skipMoveConfirm, setSkipMoveConfirm] = useState(readSkipMoveConfirm);
  const [contestViz, setContestViz] = useState(null); // contest replay overlay
  const [confirmPrompt, setConfirmPrompt] = useState(null); // generic confirm dialog
  const [coalitionPrompt, setCoalitionPrompt] = useState(null); // commit-forces picker
  const [salvagePrompt, setSalvagePrompt] = useState(null); // interactive salvage
  // World encounters and quest beats arrive from the round-end pipeline,
  // which is synchronous and cannot wait for a click — so the engine parks
  // them on a queue (encounters.js) and we drain it here. Until this existed
  // every one of them auto-resolved to the first choice and the player never
  // saw the card at all.
  const [pendingEnc, setPendingEnc] = useState(null);
  // The card the player just answered, held open on its outcome face. Until
  // this is dismissed nothing else may take the screen — not the next queued
  // encounter, not the salvage picker — because the aftermath IS the answer
  // to "what happened to my unit", and a card that is instantly replaced by
  // the next one is the bug this exists to fix.
  const [encOutcome, setEncOutcome] = useState(null);
  // Content Edit Mode — off by default, remembered between sessions. `target`
  // is the entity the editor is open on; null means the content browser.
  const [editMode, setEditMode] = useState(readEditMode);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState(null);
  const [editTick, setEditTick] = useState(0); // re-render cards after an edit

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
  // Settings → Wiki: open the modal on the first entry (alphabetical by
  // term) so the sidebar doubles as a browsable index.
  const openWikiFromSettings = useCallback(() => {
    const first = Object.values(WIKI_ENTRIES)
      .sort((a, b) => String(a.term).localeCompare(String(b.term)))[0];
    if (!first) return;
    setMenuPanel(null);
    setWikiHistory([]);
    setWikiOpen(first.id);
  }, []);
  const [showTechWheel, setShowTechWheel] = useState(false); // §17 wheel overlay
  const [showDiplomacy, setShowDiplomacy] = useState(false); // §18 diplomacy screen
  const [diploResult, setDiploResult] = useState(null); // last action feedback
  // Drawer asks the host to glow a faction's locations on the map while
  // its detail view is open. `null` means no highlight.
  const [highlightedFactionId, setHighlightedFactionId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false); // radial menu visible
  const [menuPanel, setMenuPanel] = useState(null); // "units"|"market"|"economy"|"settings"
  const [aiSpeed, setAiSpeed] = useState(getAiTurnSpeed()); // §AI replay speed (persisted)
  const you = state.players[state.youId];
  // During an AI replay the engine has already advanced (often to the human),
  // but the player must not act until the cinematics finish — gate on it too.
  const isYourTurn = state.activeId === state.youId && !state.winnerId && !replay.isReplaying;
  const yourUnits = Object.values(state.units).filter((u) => u.owner === state.youId);
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

  // Auto-dismiss the diplomacy action banner so it stops covering the
  // drawer's text. The timer resets whenever a new result arrives.
  useEffect(() => {
    if (!diploResult) return undefined;
    const t = setTimeout(() => setDiploResult(null), 4500);
    return () => clearTimeout(t);
  }, [diploResult]);

  // Herald — scan log entries appended since the last tick and surface the
  // political moves as transient banners. The cursor starts at the current
  // log length so setup noise never banners; each batch self-expires.
  const [heralds, setHeralds] = useState([]);
  const heraldCursor = useRef(gameRef.current?.log?.length ?? 0);
  const dismissHerald = useCallback((id) => setHeralds((q) => q.filter((b) => b.id !== id)), []);
  useEffect(() => {
    const log = gameRef.current?.log || [];
    if (heraldCursor.current > log.length) heraldCursor.current = 0; // log replaced (new game)
    if (heraldCursor.current === log.length) return;
    const fresh = log.slice(heraldCursor.current);
    heraldCursor.current = log.length;
    const msgs = heraldFromLog(fresh, state.youId);
    if (!msgs.length) return;
    setHeralds((q) => [...q, ...msgs].slice(-4));
    const ids = new Set(msgs.map((m) => m.id));
    setTimeout(() => setHeralds((q) => q.filter((b) => !ids.has(b.id))), 7000);
  }, [tick, state.youId]);

  // Show the next encounter waiting on the player. Re-checked on every tick,
  // so a queue that filled during the AI turns is drained one card at a time
  // as soon as control comes back.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (encOutcome) return; // the last card is still being read
    const queue = pendingEncountersFor(game, game.humanFactionId);
    setPendingEnc((cur) => {
      if (cur && queue.some((p) => p.id === cur.id)) return cur; // still open
      return queue[0] || null;
    });
  }, [tick, encOutcome]);

  // Answer one. The engine applies the choice's effects at this point —
  // they were held, not skipped, so nothing has happened until now. Which is
  // also what makes the aftermath cheap to build: everything the choice does
  // lands inside this call, so the slice of the event log it appends IS the
  // consequence list.
  function answerPendingEncounter(choiceId) {
    const game = gameRef.current;
    if (!game || !pendingEnc) return;
    const from = game.log.length;
    const chosen = pendingEnc.choices.find((c) => c.id === choiceId);
    resolvePendingEncounter(game, pendingEnc.id, choiceId, { interactiveLoot: true });
    showOutcome(pendingEnc, pendingEnc.choices, chosen, from);
    setPendingEnc(null);
    bumpTick();
  }

  // Turn a resolved card over onto its outcome face. `from` is the log length
  // captured immediately before the effects ran.
  function showOutcome(encounter, choices, chosen, from) {
    const game = gameRef.current;
    const events = game.log.slice(from);
    const summary = summarizeResolution(events, game, game.humanFactionId);
    // A dismissal ("Continue") on a purely narrative beat that changed
    // nothing has no aftermath worth a second click — it would be a card
    // whose only content is the button you press to leave it.
    if (chosen?.dismiss && !summary.contest && !summary.roll
        && !summary.lines.length && !chosen.outcomeText) {
      maybeOpenLoot();
      return;
    }
    setEncOutcome({
      encounter, choices,
      outcome: {
        choiceLabel: chosen?.label || null,
        outcomeText: chosen?.outcomeText || null,
        ...summary,
      },
    });
  }

  // Leaving the mode is what hands over the file — that is the whole point of
  // the mode, and a designer who forgets to press a button loses a session of
  // notes. Turning it ON never downloads anything.
  function toggleEditMode(on) {
    setEditMode(on);
    writeEditMode(on);
    if (!on) {
      setEditorOpen(false);
      const doc = downloadContentEdits(gameRef.current);
      setToast(doc
        ? { kind: "info", text: `Saved ${doc.counts.changes} change(s) across ${doc.counts.entities} card(s)` }
        : { kind: "info", text: "Content Edit Mode off — nothing was changed" });
    }
  }

  function openEditorOn(entityId) {
    setEditorTarget(entityId);
    setEditorOpen(true);
    setMenuPanel(null);
  }

  function closeOutcome() {
    setEncOutcome(null);
    bumpTick();
    maybeOpenLoot();
  }

  // Manage the selection's lifetime. Enemy units stay selectable so the
  // player can inspect their stats and owner read-only — control actions
  // (move, contest, reinforce) are gated on ownership everywhere they're
  // offered. We drop the selection when:
  //   • the unit no longer exists (killed / pulled off-board), or
  //   • §19 fog — it's an enemy unit that has left the viewer's sight.
  // Your own units are always visible, so they're never dropped for fog.
  useEffect(() => {
    if (!selectedUnitId) return;
    const game = gameRef.current;
    const eu = game?.units?.[selectedUnitId];
    if (!eu) { setSelectedUnitId(null); return; }
    if (eu.owner !== state.youId && !isUnitVisibleTo(game, state.youId, eu)) {
      setSelectedUnitId(null);
    }
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

  // §17.5 Intelligence (Recon) + any chip carrying `encounterRedraws` each
  // grant one encounter discard for the drawing player. Mirrors
  // encounters.js exactly (imported from there) so the UI's redraw button
  // and the engine's own headless default never drift apart.
  const redrawBudget = encounterRedrawBudget;

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

  // Only Locations are worth a window. Terrain carries no info, and an
  // encounter hex has nothing to say either until you actually move onto it and
  // draw the card — the board's own `?` mark already tells you it is there, so
  // a panel that repeats it is a click you have to dismiss for nothing.
  // What opens a window on click. A Location always has, and a blockade now
  // does too: it is a structure that outlives the unit that raised it, so it
  // gets selected like a place rather than reached through a passing soldier.
  function isInspectableHex(hexId) {
    const h = state.hexes[hexId];
    return h?.type === "location" || (!!h?.blockade && h.fog === "visible");
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
    // Which card `interact` is actually authorised to answer. A Move can
    // surface a second encounter — walking onto a hex that also holds a
    // discovered quest beat — and answering that one with this one's choice
    // id resolves it blind. Returning nothing for anything else sends it to
    // the pending queue instead (see encounters.js presentToPlayer).
    const answering = encounterPrompt?.encounter?.id ?? null;
    const ctx = {
      interactiveLoot: true,
      interact: (req) => {
        // Replay the player's discards (engine sends them to the bottom),
        // then answer the choice for the card finally drawn.
        if (req.kind === "encounterRedraw") return redrawsDone++ < discards;
        if (req.kind === "encounterChoice") {
          return req.encounter === answering ? choiceId : undefined;
        }
        return req?.options ? req.options[0] : null; // fallback to first
      },
    };
    const prompt = encounterPrompt;
    const from = gameRef.current.log.length;
    const r = runAction("move", { unit: unitUid, to: dest }, ctx);
    setEncounterPrompt(null);
    if (r.ok) inspectHex(dest);
    if (prompt) {
      const chosen = (prompt.choices || []).find((c) => c.id === choiceId);
      showOutcome(prompt.encounter, prompt.choices, chosen, from);
    } else if (r.ok) {
      maybeOpenLoot();
    }
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

  // Contest flow: the coalition picker (2+ friendly units on the hex) or a
  // long-odds / peace-breaking confirm for a lone attacker, then resolve.
  function onContest(params) {
    const game = gameRef.current;
    const attacker = game.units[params.unit];
    if (!attacker) return runAction("contest", params);

    const allies = Object.values(game.units).filter(
      (u) => u.owner === attacker.owner && u.node === attacker.node && u.uid !== attacker.uid,
    );
    const targetLoc = params.target ? null : game.locations[attacker.node];
    const defOwner = params.target
      ? game.units[params.target]?.owner
      : targetLoc?.controller;
    const warnPeace = defOwner && !atWar(game, attacker.owner, defOwner)
      ? UI_FACTIONS[defOwner]?.name || defOwner
      : null;
    const defPreview = params.target
      ? { name: game.units[params.target]?.name || "enemy unit",
          value: game.units[params.target]?.strength ?? 0, rollsDie: true }
      : (() => {
          const pv = previewLocationContest(game, attacker.node);
          return { name: ENGINE_LOCATIONS[targetLoc?.locationId]?.name || "garrison",
            value: pv ? pv.value : targetLoc?.garrison ?? 0,
            rollsDie: pv ? pv.defenderRollsDie : true };
        })();

    const unitRow = (u) => ({
      uid: u.uid, name: u.name, strength: u.strength,
      acted: (u.actionsRemaining ?? 0) < 1,
    });

    if (allies.length > 0) {
      // The split-or-pool decision belongs to the player whenever a stack
      // could fight together. Every row is toggleable — the engine's
      // initiator is picked at confirm time from the checked units, so an
      // already-acted unit never blocks the fresh ones.
      setCoalitionPrompt({
        units: [unitRow(attacker), ...allies.map(unitRow)],
        defender: defPreview,
        wildcards: game.players[attacker.owner]?.actions.remaining ?? 0,
        warnPeace,
        params,
      });
      return { ok: true, pending: true };
    }

    const longOdds = attacker.strength < defPreview.value;
    const needsPeaceWarn = warnPeace && !isPromptDismissed("attack-at-peace");
    const needsOddsWarn = longOdds && !isPromptDismissed("contest-long-odds");
    if (needsPeaceWarn || needsOddsWarn) {
      setConfirmPrompt({
        title: needsPeaceWarn ? "Break the peace?" : "Attack at long odds?",
        body: [
          needsPeaceWarn ? `You are not at war with ${warnPeace} — attacking will cost Standing and raise your Menace. ` : "",
          longOdds ? `${attacker.name} brings ${attacker.strength} against ${defPreview.value}${defPreview.rollsDie ? " (both roll 1d6, defender wins ties)" : ""}.` : "",
        ].join(""),
        confirmLabel: "Attack",
        danger: true,
        dontShowKey: needsPeaceWarn ? "attack-at-peace" : "contest-long-odds",
        onConfirm: () => resolveContest({ ...params, coalition: [] }),
      });
      return { ok: true, pending: true };
    }
    return resolveContest({ ...params, coalition: [] });
  }

  function resolveContest(params) {
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
  // §12.3 — Saboteurs. The engine action shipped with the Intelligence
  // branch and the AI has used it every round since; this is the first time
  // the human has been able to.
  function onSabotage(hexId) {
    return runAction("sabotage", { at: hexId }, null, "Saboteurs went to work.");
  }
  function onReinforce(unitUid, mode) {
    const msg = mode === "instant" ? "Unit reinforced." : "Reinforcements dispatched.";
    return runAction("reinforce", { unit: unitUid, mode }, null, msg);
  }
  // §20.4–20.7 — economy directives (all free of Actions). Construction
  // advances at Upkeep off the city's Output via its guns/butter slider.
  // `into` names which stationed unit a UNIT chip is destined for, so a city
  // with two units in it does not silently arm whichever the engine happens to
  // scan first. Omitted for city chips, where it means nothing.
  function onBuild(hexId, chipId, into) {
    return runAction("build", { at: hexId, chipId, ...(into ? { into } : {}) },
      null, "Build queued.");
  }
  // Rail doc §3 — raise a blockade on the hex this unit stands on, and fit
  // chips to one already standing there.
  function onBuildBlockade(hexId) {
    return runAction("build-blockade", { hex: hexId }, null, "Blockade started.");
  }
  function onUpgradeBlockade(hexId, chipId) {
    return runAction("upgrade-blockade", { hex: hexId, chipId }, null, "Blockade upgrade queued.");
  }
  // §17.7 — dig a listening post in where this unit stands.
  function onBuildPost(unitUid, hexId) {
    return runAction("build-post", { unit: unitUid, hex: hexId }, null, "Listening post built.");
  }
  function onUpgrade(hexId, chipUid) {
    return runAction("upgrade", { at: hexId, chip: chipUid }, null, "Upgrade queued.");
  }
  function onRush(hexId) {
    const game = gameRef.current;
    const loc = game.locations[hexId];
    const you = game.players[game.turnOrder[game.activeIndex]];
    const rate = CONFIG.economy.rushScrapPerPoint;
    const need = loc?.activeBuild
      ? Math.max(0, loc.activeBuild.cost - (loc.buildProgress || 0)) : 0;
    const affordable = you ? Math.floor(you.resource / rate) : 0;
    if (need > 0 && affordable < need && !isPromptDismissed("rush-partial")) {
      const points = Math.max(0, affordable);
      setConfirmPrompt({
        title: "Rush won't finish the build",
        body: `Rushing now spends ${points * rate} scrap for ${points} build point${points === 1 ? "" : "s"} — the build still needs ${need - points} more after that. Proceed anyway?`,
        confirmLabel: "Rush anyway",
        dontShowKey: "rush-partial",
        onConfirm: () => runAction("rush", { at: hexId }, null, "Build rushed."),
      });
      return { ok: true, pending: true };
    }
    return runAction("rush", { at: hexId }, null, "Build rushed.");
  }
  function onSetSlider(hexId, value) {
    return runAction("set-slider", { at: hexId, value });
  }
  // Rail doc §2.2 / §3.4 — both are free (no action cost), so they run
  // straight through without a confirm.
  function onSetPoolTarget(hexId, to) {
    return runAction("set-pool-target", { at: hexId, to },
      null, to ? "Rail shipment set." : "Rail shipment stopped.");
  }
  function onSetBuildPriority(hexId, value) {
    return runAction("set-build-priority", { at: hexId, value },
      null, value === "chips" ? "Chips funded first." : "Blockade funded first.");
  }

  function onEndTurn() {
    if (!isYourTurn || replay.isReplaying) return;
    const game = gameRef.current;
    const pid = game.turnOrder[game.activeIndex];
    const idleUnits = Object.values(game.units).filter(
      (u) => u.owner === pid && (u.actionsRemaining ?? 0) > 0).length;
    const idleLocs = Object.values(game.locations).filter(
      (l) => l.controller === pid && (l.actionsRemaining ?? 0) > 0).length;
    if ((idleUnits > 0 || idleLocs > 0) && !isPromptDismissed("end-turn-idle")) {
      const parts = [];
      if (idleUnits) parts.push(`${idleUnits} unit${idleUnits === 1 ? "" : "s"}`);
      if (idleLocs) parts.push(`${idleLocs} location${idleLocs === 1 ? "" : "s"}`);
      setConfirmPrompt({
        title: "End turn with actions left?",
        body: `${parts.join(" and ")} still ${idleUnits + idleLocs === 1 ? "has" : "have"} an action this turn.`,
        confirmLabel: "End turn",
        dontShowKey: "end-turn-idle",
        onConfirm: doEndTurn,
      });
      return;
    }
    doEndTurn();
  }

  function doEndTurn() {
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
  // Answer an envoy's audience (hear / placate / defy). The engine dequeues
  // the warning, so the modal closes to whatever is next in line.
  // Everything a faction says to you arrives through the same door. An
  // offer or a demand is not "open the drawer and look" news — somebody has
  // come to say it, so they get an audience and an answer.
  function onEnvoyRespond(item, answer) {
    const game = gameRef.current;
    if (item?.kind === "offer") {
      if (answer === "later") { setDeferredAudience((d) => [...d, item.offer.id]); return; }
      onDiplomacy("answer-offer", { offerId: item.offer.id, accept: answer === "accept" });
      return;
    }
    if (item?.kind === "ultimatum") {
      onDiplomacy("answer-ultimatum", {
        ultimatumId: item.ultimatum.id, comply: answer === "comply",
      });
      if (answer === "defy") setDeferredAudience((d) => [...d, item.ultimatum.id]);
      return;
    }
    const warning = item;
    const r = performDiplomacy(game, state.youId, "respond-warning", {
      warningId: warning.id,
      answer,
      amount: answer === "placate" ? warning.placateScrap : undefined,
    });
    if (r.ok) {
      const who = warning.fromName || "them";
      setToast({
        kind: "info",
        text: answer === "placate" ? `You send ${r.amount} scrap to ${who}.`
          : answer === "defy" ? `You defy ${who}.`
          : "The envoy is heard and sent on their way.",
      });
    } else if (r.reason) {
      setToast({ kind: "error", text: r.reason });
    }
    bumpTick();
  }

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
    if (action === "answer-offer") {
      msg = !r.ok ? (r.reason || "that offer is gone")
        : r.accepted ? "Agreed. The terms stand."
        : "You let it pass.";
      setDiploResult({ ...r, msg });
      bumpTick();
      return;
    }
    // §13 — a counter is your terms, put back to them, and answered at once.
    // The generic lines below would report it as a deal ("Lakers agrees") and
    // lose the fact that it was YOUR number they took.
    if (action === "counter-offer") {
      msg = !r.ok ? (r.reason || "that offer is gone")
        : r.accepted ? "They take your terms."
        : r.countered ? "They come back with terms of their own."
        : `They will not have it — ${r.reason || "no reason given"}.`;
      setDiploResult({ ...r, msg });
      bumpTick();
      return;
    }
    // §12.3 — the ops report their own outcome, and a lie that was seen
    // through is the one result the player most needs told plainly. The
    // generic line below would say "Lakers agrees" about a forgery.
    if (action === "expose" || action === "forge" || action === "fabricate") {
      msg = !r.ok ? (r.reason || "no effect")
        : action === "expose" ? "It is in the open now. The board has read it."
        : r.caught ? "They saw through it. Your name is worth less than it was this morning."
        : "It is put about, and it is believed.";
      setDiploResult({ ...r, msg });
      bumpTick();
      return;
    }
    // …and a position is said to the room, not to a faction, so the generic
    // "Done — undefined" would be exactly wrong.
    if (action === "declare-position" || action === "withdraw-position") {
      msg = !r.ok ? (r.reason || "no effect")
        : action === "declare-position" ? "You say it, and the board hears it."
        : "You stand down from it, in the open.";
      setDiploResult({ ...r, msg });
      bumpTick();
      return;
    }
    if (!r.ok) msg = r.reason || "no effect";
    // A counter is not a refusal — it is their price, and it is waiting to be
    // answered. Say where it went, because it lands in the inbox rather than
    // in this result line.
    else if (r.countered) msg = `${name} counter-offers — their terms are on the table.`;
    else if (r.accepted === false) msg = `${name} declines — ${r.reason || ""}`;
    else if (r.accepted === true) msg = `${name} agrees.`;
    else if (r.honored === true) msg = `${name} answers the call.`;
    else if (r.honored === false) msg = `${name} refuses the call.`;
    else msg = `Done${name ? ` — ${name}` : ""}.`;
    setDiploResult({ ...r, msg });
    bumpTick();
  }

  // Who is at the door, in order of how much it can hurt to ignore them. A
  // demand with a deadline outranks an offer, which outranks a grumble.
  const audience = useMemo(() => {
    const d = state.diplomacy;
    if (!d) return null;
    const ult = (d.ultimatums || []).find((u) => !u.defied && !deferredAudience.includes(u.id));
    if (ult) return { kind: "ultimatum", ultimatum: ult };
    const offer = (d.offers || []).find((o) => !deferredAudience.includes(o.id));
    if (offer) return { kind: "offer", offer };
    return d.pendingWarnings?.[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, deferredAudience]);

  // Bind the token resolver to live engine state. Re-fires on every
  // engine tick so a {faction:lowest-standing-with-active} read mid-game
  // reflects current standings.
  const resolveText = useCallback(
    (text) => resolveTokens(gameRef.current, text, {
      sourcePlayer: encounterPrompt?.encounter?.recipient,
    }),
    [tick, encounterPrompt?.encounter?.recipient],
  );

  // Detail windows announce themselves with a whoosh. Two keys rather than
  // one, because a unit panel and a location window can be open at the same
  // time and a single key would let the second one slide in silently. The
  // conditions mirror the render below exactly — the cue has to fire when a
  // window actually appears, not merely when something is selected (an
  // ordinary terrain hex opens nothing). Simultaneous fires collapse in the
  // sfx player's retrigger guard, so this never doubles up.
  const selectedUnitForPanel = selectedUnitId && state.units[selectedUnitId] ? selectedUnitId : null;
  const selectedHexForWindow = (() => {
    const h = selectedHexId ? state.hexes[selectedHexId] : null;
    if (!h || h.fog !== "visible") return null;
    return h.type === "location" || h.blockade ? selectedHexId : null;
  })();
  useSfxOnChange(selectedUnitForPanel && `unit:${selectedUnitForPanel}`, "windowOpen");
  useSfxOnChange(selectedHexForWindow && `hex:${selectedHexForWindow}`, "windowOpen");

  // Whatever the radial menu opened gets the same window cue — the diplomacy
  // drawer, the tech wheel, and the Units / Economy / Settings panels. One key
  // rather than four hooks: onMenuPick opens exactly one of these at a time,
  // and a single key means switching straight from one to another still reads
  // as a new window opening.
  const radialDestination =
    showDiplomacy ? "diplomacy"
    : showTechWheel ? "tech"
    : menuPanel ? `panel:${menuPanel}`
    : null;
  useSfxOnChange(radialDestination, "windowOpen");
  // Herald banners — the small, option-less callouts at the top of the screen
  // announcing what the powers just did to each other. Keyed on the newest
  // banner's id: they arrive in batches and the retrigger guard collapses a
  // batch into one hit, which is what a batch should sound like.
  // (The envoy audience gets its own, heavier cue, fired from EnvoyModal.)
  useSfxOn(heralds.length ? heralds[heralds.length - 1].id : null, "diplomacyAlert");

  // The radial menu hums while it is open and waiting on a choice. It stops
  // the moment a sector is picked — onMenuPick closes the radial before it
  // opens anything, and the extra clauses hold even if a panel is opened by
  // some other route while the radial is still up.
  useSfxHold(menuOpen && !menuPanel && !showTechWheel && !showDiplomacy, "radialAmbience");

  // The battle under a conflict roll — both surfaces that show one. The
  // player's own contest gets the dramatised overlay; an AI's gets a fast
  // popup during the turn replay. Held rather than fired, so the stinger is
  // released with the roll instead of running on over whatever comes next,
  // and so two contests in quick succession cannot stack. `terse` overlays
  // ("Unit lost") are aftermath, not a roll, so they are excluded.
  const contestRollOnScreen =
    !!contestViz ||
    // An encounter's narrative CONTEST is a conflict roll like any other and
    // gets the same stinger — it is the same dice, decided the same way.
    !!encOutcome?.outcome?.contest ||
    (replay.activeOverlays || []).some((o) => o.kind === "contest" && !o.terse);
  useSfxHold(contestRollOnScreen, "contestRoll");

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
        <BoardViewport cameraTarget={replay.cameraTarget} cameraPanMs={replay.cameraPanMs} controlsTop={hudOffset + 10} initialFocus={openingFocus}>
          {/* No corner brackets here. They used to sit on this element —
              the pan/zoom CONTENT layer — which put them at the corners of
              the MAP, not of the screen: the top pair rendered underneath
              the HUD bar and was never visible, and the moment you panned
              or zoomed the bottom pair drifted across the board as two
              stray gold Ls with nothing attached to them. Promoting them
              to the viewport layer doesn't work either — the board's four
              screen corners are already occupied by the zoom cluster, the
              event feed and the menu orb, so a frame drawn there lands on
              top of live controls. The board is the one surface in this UI
              that is framed by its own HUD rather than by panel chrome. */}
          <div style={{ position: "relative", padding: 30 }}>
            <Board
              state={boardState}
              selectedHexId={selectedHexId}
              selectedUnitId={selectedUnitId}
              dimmedUnitUid={pendingMove?.unitUid}
              highlightedFactionId={highlightedFactionId}
              reachable={reachable}
              showInfluence={showInfluence}
              influenceThreshold={state.influenceThreshold}
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
            owned={state.units[selectedUnitId].owner === state.youId}
            canAct={isYourTurn && state.units[selectedUnitId].owner === state.youId}
            reinforce={reinforcePreview(gameRef.current, selectedUnitId)}
            scrap={you.scrap}
            raidTargets={raidTargets}
            blockade={blockadeBuildOffer(gameRef.current, selectedUnitId)}
            post={postAction(gameRef.current, selectedUnitId)}
            onReinforce={onReinforce}
            onContest={onContest}
            onBuildBlockade={() => onBuildBlockade(state.units[selectedUnitId].node)}
            onBuildPost={() => onBuildPost(selectedUnitId, state.units[selectedUnitId].node)}
            onClose={() => setSelectedUnitId(null)}
          />
        )}
        {/* §11 — the influence toggle and its legend. Bottom-left, clear of
            the zoom cluster (bottom-right) and the feed (top-right). The
            legend only appears with the overlay: without it the ramp is
            decoration, because the amber ring IS the dominance threshold and
            that is not derivable from a gradient. */}
        <div style={{
          position: "absolute", left: 18, bottom: 18, zIndex: 28,
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
        }}>
          {showInfluence && <InfluenceLegend threshold={state.influenceThreshold} />}
          <button
            className="hud-int"
            onClick={() => setShowInfluence((v) => !v)}
            title="Show the Influence you project — and where it clears the dominance threshold"
            style={{
              fontFamily: "inherit", fontSize: 10, fontWeight: 700,
              letterSpacing: 1.6, textTransform: "uppercase",
              padding: "7px 14px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${showInfluence ? "#56d3c6" : "rgba(86,211,198,0.45)"}`,
              background: showInfluence
                ? "linear-gradient(180deg, #8ff6ea, #56d3c6)"
                : "rgba(6,14,15,0.9)",
              color: showInfluence ? "#08100f" : "#8ff6ea",
              boxShadow: showInfluence ? "0 0 14px rgba(86,211,198,0.5)" : "none",
            }}
          >Influence</button>
        </div>
        <EventFeed engineState={gameRef.current} tick={tick} topOffset={hudOffset + 10} />
      </div>

      {/* HEX DETAIL — a Location opens the single-window Location view. It is
          the only hex kind that opens anything: terrain and encounter hexes
          have nothing to say that the board is not already showing. */}
      <AnimatePresence>
        {selectedHexId && state.hexes[selectedHexId]?.type === "location" &&
          state.hexes[selectedHexId]?.fog === "visible" && (
          <LocationWindow
            key="location-window"
            view={buildLocView(state, state.hexes[selectedHexId], isYourTurn)}
            onClose={() => setSelectedHexId(null)}
            onActivate={(h) => onActivate(h)}
            onRecruit={(h) => onRecruit(h)}
            onSabotage={(h) => onSabotage(h)}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onRush={onRush}
            onSetSlider={onSetSlider}
            onSetPoolTarget={onSetPoolTarget}
            onSetBuildPriority={onSetBuildPriority}
            onContest={(p) => {
              onContest(p);
              setSelectedHexId(null);
            }}
          />
        )}
        {selectedHexId && state.hexes[selectedHexId]?.type !== "location" &&
          state.hexes[selectedHexId]?.blockade &&
          state.hexes[selectedHexId]?.fog === "visible" && (
          <BlockadeWindow
            key="blockade-window"
            view={blockadeView(gameRef.current, selectedHexId, state.youId)}
            canAct={isYourTurn}
            onClose={() => setSelectedHexId(null)}
            onFit={(chipId) => onUpgradeBlockade(selectedHexId, chipId)}
          />
        )}
      </AnimatePresence>

      {/* HUD CHROME — radial / holographic overlays replacing the old
          top bar and bottom dock. */}
      <TopBar
        scrap={you.scrap}
        upkeep={upkeepSummary(gameRef.current, state.youId)}
        units={{ n: yourUnits.length, cap: you.unitCap }}
        tech={{ level: you.techLevel, label: techLabel }}
        name={UI_FACTIONS[state.youId]?.name}
        color={UI_FACTIONS[state.youId]?.color}
        vp={you.vp}
        vpGoal={state.vpGoal}
        dominion={state.diplomacy?.dominion || null}
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

      {menuPanel === "economy" && (
        <TitledWindow key="economy" title="Economy" icon={ICON.scrap} onClose={() => setMenuPanel(null)}>
          <EconomyLedger
            report={economyReport(gameRef.current, state.youId)}
            onOpenHex={(h) => { setMenuPanel(null); setSelectedHexId(h); }}
            onOpenUnit={(uid) => { setMenuPanel(null); setSelectedUnitId(uid); }}
          />
        </TitledWindow>
      )}

      {menuPanel === "settings" && (
        <TitledWindow key="settings" title="Settings" onClose={() => setMenuPanel(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            <span style={{ fontFamily: HUD.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: HUD.text }}>
              Volume
            </span>
            <p className="pc-prose" style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.5, color: HUD.textDim }}>
              The score and the interface run on separate levels — turn either
              one down without losing the other. Both are remembered between
              sessions.
            </p>
            {/* Same component the corner audio widget uses, so the two can
                never disagree about what these are called or where they sit. */}
            <VolumeSliders />
          </div>
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
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
            <span style={{ fontFamily: HUD.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: HUD.text }}>
              Wiki
            </span>
            <p className="pc-prose" style={{ margin: "4px 0 8px", fontSize: 12, lineHeight: 1.5, color: HUD.textDim }}>
              The world&rsquo;s reference. Every underlined term in encounter
              text links into it, and it can be browsed end to end from here.
            </p>
            <Btn onClick={openWikiFromSettings} disabled={!Object.keys(WIKI_ENTRIES).length}>
              Open Wiki
            </Btn>
          </div>
          <div style={{ marginTop: 16, borderTop: `1px solid ${theme.border}`, paddingTop: 14 }}>
            <span style={{ fontFamily: HUD.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: HUD.text }}>
              Content Edit Mode
            </span>
            <p className="pc-prose" style={{ margin: "4px 0 8px", fontSize: 12, lineHeight: 1.5, color: HUD.textDim }}>
              Rewrite quests and encounters while you play them — what gates a
              beat, its prose, its choices, and exactly what each choice grants
              or costs. Every card also shows its grants under the options while
              this is on. Edits apply to this session only; the shipped content
              is never touched. Switching this off downloads the change file.
            </p>
            <label
              className="hud-int"
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 6, border: `1px solid ${editMode ? "rgba(232,169,63,0.5)" : "rgba(86,211,198,0.25)"}`, background: editMode ? "rgba(232,169,63,0.12)" : "rgba(0,0,0,0.2)", color: HUD.text, cursor: "pointer", fontSize: 13 }}
            >
              <input type="checkbox" checked={editMode} onChange={(e) => toggleEditMode(e.target.checked)} />
              {editMode ? "On — editing" : "Off"}
            </label>
            {editMode && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => openEditorOn(null)}>Browse all content</Btn>
                <Btn onClick={() => {
                  const doc = downloadContentEdits(gameRef.current);
                  setToast(doc
                    ? { kind: "info", text: `Saved ${doc.counts.changes} change(s)` }
                    : { kind: "info", text: "No changes yet" });
                }}>Download changes</Btn>
                <Btn onClick={() => setConfirmPrompt({
                  title: "Discard every edit?",
                  body: "Every change made in Content Edit Mode is dropped and the shipped content comes back. This cannot be undone, and anything not already downloaded is lost.",
                  confirmLabel: "Discard",
                  danger: true,
                  onConfirm: () => {
                    clearPatch(null);
                    forgetPatches();
                    setEditTick((n) => n + 1);
                    setToast({ kind: "info", text: "Edits discarded" });
                  },
                })}>Discard edits</Btn>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, borderTop: `1px solid ${theme.border}`, paddingTop: 14 }}>
            <span style={{ fontFamily: HUD.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: HUD.text }}>
              Playtest log
            </span>
            <p className="pc-prose" style={{ margin: "4px 0 8px", fontSize: 12, lineHeight: 1.5, color: HUD.textDim }}>
              Every action this session, in detail — moves, contests (full dice
              and modifier breakdown), tech assignments, diplomacy, everything.
              Downloads as a text file you can read start to finish.
            </p>
            <Btn onClick={() => {
              downloadGameLog(gameRef.current);
              setToast({ kind: "info", text: "Playtest log downloaded." });
            }}>Export Playtest Log</Btn>
          </div>
          <div style={{ marginTop: 16, borderTop: `1px solid ${theme.border}`, paddingTop: 14 }}>
            <Btn variant="primary" onClick={onNewGame}>Abandon &amp; New Game</Btn>
          </div>
        </TitledWindow>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {editorOpen && (
          <TitledWindow
            key="content-editor"
            title={editorTarget ? "Edit content" : "All content"}
            width={720}
            onClose={() => setEditorOpen(false)}
          >
            <ContentEditor
              entityId={editorTarget}
              onPick={setEditorTarget}
              onClose={() => setEditorOpen(false)}
              // A card on screen is rendered from the live definition, so an
              // edit has to re-render it — otherwise the prose you just
              // rewrote is still the old prose behind the panel.
              onChanged={() => setEditTick((n) => n + 1)}
            />
          </TitledWindow>
        )}
      </AnimatePresence>

      {/* Envoy audience — an AI's warning, answered rather than just read.
          Shown one at a time; only on your own turn so it never interrupts
          an AI replay. */}
      {isYourTurn && !showDiplomacy && (
        <EnvoyModal audience={audience} onRespond={onEnvoyRespond} />
      )}

      <HeraldLayer banners={heralds} onDismiss={dismissHerald} topOffset={hudOffset + 14} />

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
            // §11 — what walking in there costs, BEFORE committing. The
            // trespass ladder is [0,1,2] by consecutive round, which is a rule
            // a player can only plan around if they can read it in advance.
            trespass={trespassPreview(
              gameRef.current,
              gameRef.current.units[pendingMove.unitUid],
              pendingMove.dest,
            )}
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

      {/* The card the player just answered, face down on its outcome. It
          outranks both live cards: until it is dismissed there is nothing
          else to look at. */}
      <AnimatePresence>
        {encOutcome && (
          <EncounterModal
            key="encounter-outcome"
            encounter={encOutcome.encounter}
            choices={encOutcome.choices}
            eligibleIds={[]}
            redrawsLeft={0}
            onRedraw={() => {}}
            onPick={() => {}}
            outcome={encOutcome.outcome}
            onClose={closeOutcome}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!encOutcome && encounterPrompt && (
          <EncounterModal
            key="encounter"
            editMode={editMode}
            editRev={editTick}
            onEdit={() => openEditorOn(encounterPrompt.encounter.id)}
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

      <AnimatePresence>
        {!encOutcome && !encounterPrompt && pendingEnc && (
          <EncounterModal
            key={`pending-${pendingEnc.id}`}
            editMode={editMode}
            editRev={editTick}
            onEdit={() => openEditorOn(pendingEnc.encounterId)}
            encounter={pendingEnc}
            choices={pendingEnc.choices}
            eligibleIds={pendingEnc.choices.map((c) => c.id)}
            redrawsLeft={0}
            onRedraw={() => {}}
            onPick={answerPendingEncounter}
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

      {/* Same z-index as the encounter card, so a salvage left over from a
          board contest would render on top of an outcome the player has not
          read yet. It waits. */}
      {salvagePrompt && !encOutcome && (
        <SalvageModal prompt={salvagePrompt} onConfirm={onSalvageConfirm} />
      )}

      {confirmPrompt && (
        <ConfirmModal
          prompt={confirmPrompt}
          onConfirm={() => { const go = confirmPrompt.onConfirm; setConfirmPrompt(null); go?.(); }}
          onCancel={() => setConfirmPrompt(null)}
        />
      )}
      {coalitionPrompt && (
        <CoalitionModal
          prompt={coalitionPrompt}
          onConfirm={(selectedUids) => {
            // Root the contest on a checked unit that still has its own
            // action (the initiator takes the loser's attrition, so prefer
            // one that pays for itself); the rest join as the coalition.
            const game = gameRef.current;
            const lead = selectedUids.find((u) => (game.units[u]?.actionsRemaining ?? 0) > 0)
              ?? selectedUids[0];
            const params = {
              ...coalitionPrompt.params,
              unit: lead,
              coalition: selectedUids.filter((u) => u !== lead),
            };
            setCoalitionPrompt(null);
            resolveContest(params);
          }}
          onCancel={() => setCoalitionPrompt(null)}
        />
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
            onDismissResult={() => setDiploResult(null)}
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
  // Winner first, then by score. VP is the closing STANDING — ground held and
  // friends kept — and it is not what decided the game, so a diplomat can win
  // the condition while the biggest land power out-scores them. That is a
  // coherent story, but a table with the winner sitting fifth reads like a
  // bug, so the ★ goes on top and the real numbers stay honest.
  const sorted = Object.values(state.players).sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    return b.vp - a.vp;
  });
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
        {/* HOW it ended. The table below is the closing standing — VP is a
            score now, not the condition — so without this line a player is
            left to infer what actually won it. */}
        {state.winnerBy && (
          <div
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 12.5,
              letterSpacing: 1,
              color: theme.textDim,
              marginTop: 8,
              maxWidth: 320,
            }}
          >
            {{
              conquest: "By conquest — nobody left standing.",
              diplomacy: "By treaty — every rival an ally.",
              submission: "By submission — every rival sworn.",
              mixed: "By war and treaty together.",
            }[state.winnerBy] || ""}
          </div>
        )}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 10, letterSpacing: 2,
            textTransform: "uppercase", color: theme.textFaint, textAlign: "left",
          }}>Final standing · ground held and friends kept</div>
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
                  {p.vp}
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

