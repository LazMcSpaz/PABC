// Upgrade purchase flow.
//
// Upgrades live in state.unlockableDeck (seeded from UPGRADES at game
// start). Each upgrade has `requires: <parentBuildingId>`. A player can
// buy an upgrade when they own an active, non-disabled copy of the
// parent, have the scrapCost, meet atkCost (checked, not spent), and
// have an action to spend. On purchase the upgrade replaces the parent
// in the same settlement slot — no new slot is consumed.
//
// unlockableDeck may also contain unique buildings and leader cards
// unlocked by progression challenges / narrative chains later; those
// carry scope = playerId to restrict purchase to the unlocker. This
// module treats any entry with a `requires` field as a purchasable
// Upgrade and leaves the others for chunk 4's narrative reward flow.

import { calcAttack } from "./calculations.js";
import { NotifKind, impact, notify } from "./notifications.js";

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function logEntry(state, entry) {
  return { ...state, log: [...(state.log ?? []), { round: state.round, ...entry }] };
}

function activeParent(player, requires) {
  const disabled = new Set(player.disabledBuildingUids ?? []);
  return player.settlement.find((b) => b.id === requires && !disabled.has(b.uid));
}

function scopeAllows(upgrade, playerId) {
  return upgrade.scope === "any" || upgrade.scope === playerId;
}

export function canUpgrade(state, playerId, upgrade) {
  if (!upgrade?.requires) return { ok: false, reason: "not-an-upgrade" };
  if (!scopeAllows(upgrade, playerId)) return { ok: false, reason: "out-of-scope" };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "no-player" };
  if (state.activePlayerId !== playerId) return { ok: false, reason: "not-your-turn" };
  if (player.actionsRemaining < 1) return { ok: false, reason: "actions" };
  if (player.scrap < (upgrade.scrapCost ?? 0)) return { ok: false, reason: "scrap" };
  if (calcAttack(player) < (upgrade.atkCost ?? 0)) return { ok: false, reason: "attack" };
  const parent = activeParent(player, upgrade.requires);
  if (!parent) return { ok: false, reason: "parent" };
  return { ok: true, parent };
}

export function getAvailableUpgradesFor(state, playerId) {
  return (state.unlockableDeck ?? []).filter(
    (u) => u.requires && scopeAllows(u, playerId),
  );
}

export function upgradeBuilding(state, playerId, upgradeUid) {
  if (state.winnerId != null) return state;
  const upgrade = (state.unlockableDeck ?? []).find((u) => u.uid === upgradeUid);
  if (!upgrade) return state;
  const check = canUpgrade(state, playerId, upgrade);
  if (!check.ok) return state;

  const parent = check.parent;

  // Swap parent → upgrade in the same slot. Also scrub any disabled-state
  // bookkeeping that referenced the parent's uid so the upgrade comes in
  // clean.
  let next = updatePlayer(state, playerId, (p) => {
    const newSlot = { ...upgrade };
    const settlement = p.settlement.map((b) => (b.uid === parent.uid ? newSlot : b));
    const disabled = (p.disabledBuildingUids ?? []).filter((x) => x !== parent.uid);
    const disabledPool = (p.buildingsDisabledUntilOwnerTurnStart ?? []).filter(
      (x) => x !== parent.uid,
    );
    const abilityUsed = { ...(p.abilityUsedThisTurn ?? {}) };
    delete abilityUsed[parent.uid];
    return {
      ...p,
      scrap: p.scrap - (upgrade.scrapCost ?? 0),
      actionsRemaining: p.actionsRemaining - 1,
      settlement,
      disabledBuildingUids: disabled,
      buildingsDisabledUntilOwnerTurnStart: disabledPool,
      abilityUsedThisTurn: abilityUsed,
    };
  });

  // Pull the purchased upgrade out of the shared unlockableDeck.
  next = {
    ...next,
    unlockableDeck: next.unlockableDeck.filter((u) => u.uid !== upgradeUid),
  };

  next = logEntry(next, {
    type: "upgrade",
    playerId,
    upgradeId: upgrade.id,
    parentId: parent.id,
  });

  const player = next.players.find((p) => p.id === playerId);
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} upgraded ${parent.name} → ${upgrade.name}`,
    message: upgrade.ability?.description ?? "",
    impacts: [
      impact(playerId, `−${upgrade.scrapCost ?? 0} Scrap · +${upgrade.vp ?? 0}★`, {
        scrap: -(upgrade.scrapCost ?? 0),
        vp: upgrade.vp,
      }),
    ],
    sourceCardId: upgrade.id,
    sourcePlayerId: playerId,
  });
}

// Called from progression-challenge `unlock_unlockable` effect. If the
// referenced card id already lives in an extended UPGRADES / unique-
// buildings registry, this would add a copy to the deck. For now (Age 2
// content doesn't yet exist in cards.js) we record the intent on
// state.unlocksPending and emit a notification so the player knows the
// unlock fired. Chunk 4 / Age 2 work will resolve pending entries into
// real cards.
export function unlockUnlockable(state, unlockableId, unlockerId, label) {
  const next = {
    ...state,
    unlocksPending: [...new Set([...(state.unlocksPending ?? []), unlockableId])],
  };
  return notify(next, {
    kind: NotifKind.FLAG,
    title: `Unlock available: ${label ?? unlockableId}`,
    message:
      `${unlockableId} is unlocked, but its card data isn't implemented yet. ` +
      "It will become purchasable once Age 2 content lands.",
    sourcePlayerId: unlockerId,
    severity: "info",
  });
}
