// useAIReplay — the React glue for the cinematic AI-turn replay. The engine
// resolves each AI turn synchronously; this hook captures the pre-turn unit
// positions, runs takeAITurn, then walks the new event slice through
// AIReplayDriver so the display lags: pawns slide, overlays fade, the camera
// follows. Everything but unit positions renders at end-state (the host
// bumps a tick right after takeAITurn); only pawns are deferred.
//
// Exposes { displayedPositions, animatedPawns, activeOverlays, cameraTarget,
// cameraPanMs, isReplaying, runAITurns, skipNow }.
import { useCallback, useEffect, useRef, useState } from "react";
import { takeAITurn } from "../../game/ai.js";
import { activePlayerId } from "../../game/targeting.js";
import { FACTIONS as UI_FACTIONS, NEUTRAL } from "../data.js";
import { CHIPS as ENGINE_CHIPS, LOCATIONS as ENGINE_LOCATIONS } from "../../game/content.js";
import { runAITurnWithReplay } from "../engineAdapter.js";
import { displayRoute } from "../../game/movement.js";
import { createAIReplayDriver, CADENCE } from "./AIReplayDriver.js";
import { getAiTurnSpeed } from "./options.js";

const AI_DRIVE_GUARD = 12; // matches the synchronous driver's bound

export function useAIReplay({ gameRef, geomRef, bumpTick }) {
  const [displayedPositions, setDisplayedPositions] = useState(null);
  const [animatedPawns, setAnimatedPawns] = useState([]);
  const [activeOverlays, setActiveOverlays] = useState([]);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [cameraPanMs, setCameraPanMs] = useState(CADENCE.normal.pan);
  const [isReplaying, setIsReplaying] = useState(false);
  const [turnBanner, setTurnBanner] = useState(null); // { name, color } of the AI now replaying

  const posRef = useRef(null);          // {uid: hexId} — displayed positions, source of truth
  const ownersRef = useRef({});         // {uid: owner} snapshot (survives unit death)
  const lastHexRef = useRef({});        // {uid: hexId} last-known hex (survives unit death)
  const driverRef = useRef(null);
  const skipCurrentRef = useRef(false); // tap-to-skip: skip the REST of THIS end-turn's AI sequence
  const onAllDoneRef = useRef(null);
  const runNextRef = useRef(null);

  // Drive every remaining AI turn synchronously with no cinematics — used by
  // the "skip" speed tier and by tap-to-skip for the rest of the session.
  const drainSync = useCallback(() => {
    const game = gameRef.current;
    let guard = AI_DRIVE_GUARD;
    while (!game.winnerId && guard-- > 0) {
      const pid = activePlayerId(game);
      if (!game.players[pid]?.isAI) break;
      takeAITurn(game);
    }
  }, [gameRef]);

  const finish = useCallback(() => {
    driverRef.current = null;
    posRef.current = null;
    skipCurrentRef.current = false; // reset for the next end-turn — skip is per-sequence
    setDisplayedPositions(null);
    setAnimatedPawns([]);
    setActiveOverlays([]);
    setCameraTarget(null);
    setTurnBanner(null);
    setIsReplaying(false);
    bumpTick();
    const cb = onAllDoneRef.current;
    onAllDoneRef.current = null;
    cb && cb();
  }, [bumpTick]);

  // Build the host-bound helpers the (React-free) driver needs.
  const makeHelpers = useCallback((game) => {
    const viewer = game.humanFactionId;
    const center = (hex) => geomRef.current?.centers?.[hex] || { x: 0, y: 0 };
    const isVisible = (hex) => {
      const vis = viewer ? game.visibility?.[viewer] : null;
      return vis ? vis.visible.has(hex) : true;
    };
    const ownerOf = (uid) => ownersRef.current[uid] ?? game.units[uid]?.owner;
    return {
      viewer: () => viewer,
      center,
      isVisible,
      path: (from, to) => displayRoute(game, from, to), // §16.2 terrain/road-aware route
      unitNode: (uid) => game.units[uid]?.node ?? lastHexRef.current[uid] ?? null,
      lastUnitHex: (uid) => lastHexRef.current[uid] ?? null,
      unitColor: (uid) => UI_FACTIONS[ownerOf(uid)]?.color || "#888",
      unitLabel: (uid) => (game.units[uid]?.name || ownerOf(uid) || "?")[0],
      factionName: (pid) => UI_FACTIONS[pid]?.name || pid,
      factionColor: (pid) => UI_FACTIONS[pid]?.color || "#888",
      chipName: (engineChipId) => ENGINE_CHIPS[engineChipId]?.name || engineChipId,
      visibleChip: (hex) => isVisible(hex),
      contestDefenderName: (declared, hex) => {
        if (declared.kind === "post") return "Listening Post";
        if (declared.kind === "raid") {
          const owner = game.units[declared.target]?.owner;
          return owner ? UI_FACTIONS[owner]?.name || owner : "Enemy unit";
        }
        const loc = game.locations[hex];
        return loc ? ENGINE_LOCATIONS[loc.locationId]?.name || "Garrison" : "Garrison";
      },
      contestDefenderColor: (declared, hex) => {
        if (declared.kind === "raid") {
          const owner = game.units[declared.target]?.owner;
          return UI_FACTIONS[owner]?.color || NEUTRAL;
        }
        const loc = game.locations[hex];
        return loc?.controller ? UI_FACTIONS[loc.controller]?.color || NEUTRAL : NEUTRAL;
      },
    };
  }, [geomRef]);

  // Replay one AI turn, then chain to the next; hand control back at the human.
  runNextRef.current = function runOneAITurn() {
    const game = gameRef.current;
    if (game.winnerId || !game.players[activePlayerId(game)]?.isAI) return finish();

    // Tapped to skip → drain the rest of THIS sequence instantly (the next
    // end-turn replays normally; finish() clears the flag).
    if (skipCurrentRef.current) {
      drainSync();
      return finish();
    }

    // Announce whose turn is about to replay (banner over the board).
    const actingPid = activePlayerId(game);
    setTurnBanner({
      name: UI_FACTIONS[actingPid]?.name || actingPid,
      color: UI_FACTIONS[actingPid]?.color || "#888",
    });

    // Snapshot pre-turn positions, run the AI turn, and take the event slice
    // — all via the engineAdapter wrapper (owners + last hex survive death).
    const { events, positions, owners } = runAITurnWithReplay(game);
    posRef.current = { ...positions };
    ownersRef.current = owners;
    lastHexRef.current = { ...positions };
    setDisplayedPositions({ ...positions });
    bumpTick(); // render end-state now; pawns stay deferred via displayedPositions

    const speed = getAiTurnSpeed();
    setCameraPanMs((CADENCE[speed] || CADENCE.normal).pan);

    const callbacks = {
      setCamera: (pt) => setCameraTarget(pt ? { x: pt.x, y: pt.y } : null),
      showOverlay: (o) => setActiveOverlays((a) => [...a, o]),
      hideOverlay: (id) => setActiveOverlays((a) => a.filter((x) => x.id !== id)),
      addPawn: (p) => setAnimatedPawns((a) => [...a, p]),
      removePawn: (key) => setAnimatedPawns((a) => a.filter((x) => x.key !== key)),
      setPosition: (uid, hex) => {
        posRef.current = { ...(posRef.current || {}), [uid]: hex };
        setDisplayedPositions(posRef.current);
      },
      onComplete: () => { driverRef.current = null; runNextRef.current(); },
    };
    driverRef.current = createAIReplayDriver(events, { speed, helpers: makeHelpers(game), callbacks });
  };

  // Entry point: called after the human ends their turn (and after endTurn).
  const runAITurns = useCallback((onAllDone) => {
    onAllDoneRef.current = onAllDone || null;
    const game = gameRef.current;
    // Nothing to replay if it's still the human's turn or the game is over.
    if (game.winnerId || !game.players[activePlayerId(game)]?.isAI) {
      onAllDoneRef.current = null;
      onAllDone && onAllDone();
      return;
    }
    const speed = getAiTurnSpeed();
    if (speed === "skip") {
      drainSync();
      finish();
      return;
    }
    setIsReplaying(true);
    setCameraPanMs((CADENCE[speed] || CADENCE.normal).pan);
    runNextRef.current();
  }, [gameRef, drainSync, finish]);

  // Cancel any in-flight replay if the component unmounts (e.g. New Game),
  // so its timers don't fire setState on an unmounted tree.
  useEffect(() => () => { if (driverRef.current) driverRef.current.cancel(); }, []);

  // Tap-to-skip: skip the REST of this end-turn's AI sequence (drain to the
  // human instantly). NOT sticky — the next time the human ends a turn, the
  // replay runs again at the chosen speed. For a permanent skip, pick the
  // "skip" speed tier in Settings.
  const skipNow = useCallback(() => {
    if (!isReplaying) return;
    skipCurrentRef.current = true;
    if (driverRef.current) driverRef.current.skip();
  }, [isReplaying]);

  return {
    displayedPositions,
    animatedPawns,
    activeOverlays,
    cameraTarget,
    cameraPanMs,
    isReplaying,
    turnBanner,
    runAITurns,
    skipNow,
  };
}
