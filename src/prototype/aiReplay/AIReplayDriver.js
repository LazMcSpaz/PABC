// AIReplayDriver — the deferred-display queue walker for one AI turn. The
// engine has ALREADY resolved synchronously; we walk the new event slice on a
// timer to give the turn a temporal shape: camera pans, pawns slide hop-by-
// hop (with FOV-edge fades), and annotation popups fade over the relevant
// hexes. Everything but unit positions is rendered at end-state by the host;
// this driver only sequences the *display*.
//
// Pure of React: it talks to the host through injected `helpers` (geometry,
// fog, paths, labels) and `callbacks` (setState shims). `createAIReplayDriver`
// returns a controller with { skip(), cancel() }.
import { midpoint } from "./CameraController.js";

// Cadence per speed tier (ms). `skip` collapses everything to 0.
export const CADENCE = {
  slow: { perEvent: 1000, gap: 300, pan: 600 },
  normal: { perEvent: 500, gap: 150, pan: 350 },
  fast: { perEvent: 250, gap: 50, pan: 200 },
  skip: { perEvent: 0, gap: 0, pan: 0 },
};

// The human-contest dice display runs ~2s before locking; AI contests run the
// ticker at 0.3× that, regardless of aiTurnSpeed, so dice always read fast.
export const HUMAN_DICE_MS = 2000;
export const AI_DICE_MS = Math.round(0.3 * HUMAN_DICE_MS);

// Player-state events (tech, diplomacy, standing, menace/honor, pacts, wars,
// deals, recognition) and bookkeeping events carry no board location worth a
// camera move — they fall through handleEvent's `default` and stay in the
// textual event feed only. build_started is likewise quiet; construction is
// surfaced on build_completed so the popup names what actually landed.

let SEQ = 0;
const nextId = () => `rep-${++SEQ}`;

export function createAIReplayDriver(events, { speed = "normal", helpers, callbacks }) {
  const cad = CADENCE[speed] || CADENCE.normal;
  let cancelled = false;
  let skipped = speed === "skip";
  let resolveWait = null;

  // A wait that resolves early when skipped/cancelled (and is a no-op at 0ms).
  const wait = (ms) => new Promise((res) => {
    if (cancelled || skipped || ms <= 0) return res();
    const t = setTimeout(() => { resolveWait = null; res(); }, ms);
    resolveWait = () => { clearTimeout(t); resolveWait = null; res(); };
  });

  const visible = (hex) => !!hex && helpers.isVisible(hex);
  const centerOf = (hex) => helpers.center(hex);

  // Units that get an explicit slide this turn — so a redundant unit_spotted
  // for the same unit doesn't double-render it.
  const movedUnits = new Set(
    events.filter((e) => e.name === "unit_moved").map((e) => e.payload.unit),
  );

  let pendingDeclared = null; // last contest_declared payload, paired on outcome

  async function run() {
    for (const ev of events) {
      if (cancelled) break;
      await handleEvent(ev);
      if (!skipped && !cancelled) await wait(cad.gap);
    }
    // Safety net: every moved unit ends at its true position even if a hop was
    // skipped or the player tapped to skip mid-slide.
    for (const uid of movedUnits) {
      const node = helpers.unitNode(uid);
      if (node) callbacks.setPosition(uid, node);
    }
    if (!cancelled) callbacks.onComplete();
  }

  async function handleEvent(ev) {
    const p = ev.payload || {};
    switch (ev.name) {
      case "unit_moved":
        return animateMove(p);
      case "contest_declared":
        pendingDeclared = p;
        return;
      case "contest_won":
      case "contest_lost":
        return contestOutcome(ev, p);
      case "unit_destroyed":
        return destroyed(p);
      case "build_completed":
        return locPopup(p.hex, buildLabel("Construction finished", p));
      case "unit_reinforced":
        return locPopup(helpers.unitNode(p.unit), "Unit reinforced");
      case "chip_upgraded":
        return locPopup(p.hex, helpers.visibleChip(p.hex)
          ? `Upgraded to ${helpers.chipName(p.chipId)}` : "Upgraded a chip");
      case "encounter_delivered":
        return encPopup(p.hex, `${helpers.factionName(p.player)} resolved an event`);
      case "loyalty_changed":
        if (p.cause === "sabotage") return locPopup(p.hex, "Sabotaged — Loyalty falls", true);
        return; // routine ticks are feed-only noise
      case "control_peeled":
        return locPopup(p.hex, "Control slipping", true);
      case "section_flipped":
        return p.cause === "contest" ? undefined : locPopup(p.hex, "Control shifts", true);
      case "unit_spotted":
        return spotted(p);
      default:
        return; // FEED_ONLY and everything else — event feed shows it textually
    }
  }

  // --- unit movement: hop-by-hop slide with FOV-edge fades ---------------
  async function animateMove(p) {
    const uid = p.unit;
    const path = helpers.path(p.from, p.to);
    if (!path || path.length < 2) { callbacks.setPosition(uid, p.to); return; }
    if (skipped) { callbacks.setPosition(uid, p.to); return; }

    for (let i = 0; i < path.length - 1 && !cancelled; i++) {
      const a = path[i];
      const b = path[i + 1];
      const va = visible(a);
      const vb = visible(b);
      if (!va && !vb) { callbacks.setPosition(uid, b); continue; } // dark hop
      if (skipped) { callbacks.setPosition(uid, b); continue; }

      const ca = centerOf(a);
      const cb = centerOf(b);
      let fromC = ca, toC = cb, fadeIn = false, fadeOut = false, panTo = cb;
      if (va && vb) {
        panTo = cb; // full slide
      } else if (va && !vb) {
        toC = midpoint(ca, cb); fadeOut = true; panTo = ca; // sliding into the dark
      } else {
        fromC = midpoint(ca, cb); fadeIn = true; panTo = cb; // emerging from the dark
      }

      callbacks.setCamera(panTo);
      const key = nextId();
      callbacks.addPawn({
        key, uid, fromCenter: fromC, toCenter: toC, fadeIn, fadeOut,
        durationMs: cad.perEvent, color: helpers.unitColor(uid), label: helpers.unitLabel(uid),
      });
      await wait(cad.perEvent);
      callbacks.removePawn(key);
      callbacks.setPosition(uid, b); // displayed position only advances on a completed hop
    }
    callbacks.setPosition(uid, p.to);
  }

  // --- contest popup: declared (for hex/factions) + outcome --------------
  async function contestOutcome(ev, p) {
    const d = pendingDeclared || {};
    const hex = d.hex || helpers.unitNode(p.initiator);
    pendingDeclared = null;
    if (!visible(hex) || skipped) return;
    callbacks.setCamera(centerOf(hex));
    const id = nextId();
    callbacks.showOverlay({
      id,
      kind: "contest",
      center: centerOf(hex),
      attackerName: helpers.factionName(p.player),
      attackerColor: helpers.factionColor(p.player),
      defenderName: helpers.contestDefenderName(d, hex),
      defenderColor: helpers.contestDefenderColor(d, hex),
      atkRoll: p.initiatorRoll,
      defRoll: p.defenderRoll,
      defenderRolled: p.defenderRolled,
      won: ev.name === "contest_won",
      diceMs: AI_DICE_MS,
    });
    await wait(Math.max(cad.perEvent, AI_DICE_MS + 200));
    callbacks.hideOverlay(id);
  }

  async function destroyed(p) {
    const hex = p.hex || helpers.unitNode(p.unit) || helpers.lastUnitHex(p.unit);
    if (!visible(hex) || skipped) return;
    callbacks.setCamera(centerOf(hex));
    const id = nextId();
    callbacks.showOverlay({ id, kind: "contest", center: centerOf(hex), terse: "Unit lost", won: false });
    await wait(cad.perEvent);
    callbacks.hideOverlay(id);
  }

  async function locPopup(hex, text, brief = false) {
    if (!hex || !visible(hex) || skipped) return;
    callbacks.setCamera(centerOf(hex));
    const id = nextId();
    callbacks.showOverlay({ id, kind: "location", center: centerOf(hex), text });
    await wait(brief ? Math.round(cad.perEvent * 0.7) : cad.perEvent);
    callbacks.hideOverlay(id);
  }

  async function encPopup(hex, text) {
    if (!hex || !visible(hex) || skipped) return;
    callbacks.setCamera(centerOf(hex));
    const id = nextId();
    callbacks.showOverlay({ id, kind: "encounter", center: centerOf(hex), text });
    await wait(cad.perEvent);
    callbacks.hideOverlay(id);
  }

  async function spotted(p) {
    if (p.faction !== helpers.viewer()) return; // only the human's own spots matter
    if (movedUnits.has(p.unit)) return; // its move already faded it in
    const hex = p.hex || helpers.unitNode(p.unit);
    if (!hex || !visible(hex) || skipped) { if (hex) callbacks.setPosition(p.unit, hex); return; }
    const c = centerOf(hex);
    const key = nextId();
    callbacks.addPawn({
      key, uid: p.unit, fromCenter: c, toCenter: c, fadeIn: true, fadeOut: false,
      durationMs: cad.perEvent, color: helpers.unitColor(p.unit), label: helpers.unitLabel(p.unit),
    });
    await wait(cad.perEvent);
    callbacks.removePawn(key);
    callbacks.setPosition(p.unit, hex);
  }

  function buildLabel(verb, p) {
    return helpers.visibleChip(p.hex) ? `${verb} (${helpers.chipName(p.chipId)})` : verb;
  }

  run();

  return {
    skip() {
      if (skipped) return;
      skipped = true;
      callbacks.onSkip && callbacks.onSkip();
      if (resolveWait) resolveWait();
    },
    cancel() {
      cancelled = true;
      if (resolveWait) resolveWait();
    },
  };
}
