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

import { REWARD_CARD_MAP } from "./cards_age1_rewards.js";
import { calcAttack } from "./calculations.js";
import { NotifKind, impact, notify } from "./notifications.js";
import { logEntry, updatePlayer } from "./stateHelpers.js";

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

// Unique buildings: unlockables that are full buildings (no parent
// required) scoped to a single player. Either purchased with Scrap +
// Action (like regular buildings) or granted free for 0 Scrap (reward
// drops). They join the player's settlement alongside the 5-slot cap —
// unique buildings don't count against the cap per the reward-card
// file's "Do not consume a building slot unless noted" guideline.
export function getAvailableUniqueBuildingsFor(state, playerId) {
  return (state.unlockableDeck ?? []).filter(
    (u) =>
      !u.requires &&
      (u.type === "Unique Building" || u.unique === true) &&
      scopeAllows(u, playerId),
  );
}

export function canBuildUnique(state, playerId, card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "no-player" };
  if (state.activePlayerId !== playerId) return { ok: false, reason: "not-your-turn" };
  if (player.actionsRemaining < 1) return { ok: false, reason: "actions" };
  if (player.scrap < (card.scrapCost ?? 0)) return { ok: false, reason: "scrap" };
  if (calcAttack(player) < (card.atkCost ?? 0)) return { ok: false, reason: "attack" };
  if (!scopeAllows(card, playerId)) return { ok: false, reason: "out-of-scope" };
  return { ok: true };
}

export function purchaseUniqueBuilding(state, playerId, uid) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const card = (state.unlockableDeck ?? []).find((u) => u.uid === uid);
  if (!card) return state;
  const check = canBuildUnique(state, playerId, card);
  if (!check.ok) return state;

  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    scrap: p.scrap - (card.scrapCost ?? 0),
    actionsRemaining: p.actionsRemaining - 1,
    settlement: [...p.settlement, { ...card }],
    builtThisTurnUids: [...(p.builtThisTurnUids ?? []), card.uid],
  }));
  next = { ...next, unlockableDeck: next.unlockableDeck.filter((u) => u.uid !== uid) };
  next = logEntry(next, { type: "build_unique", playerId, cardId: card.id });
  const player = next.players.find((p) => p.id === playerId);
  return notify(next, {
    kind: NotifKind.BUILD,
    title: `${player.name} built ${card.name}`,
    message: card.ability?.description ?? "",
    impacts: [
      impact(playerId, `−${card.scrapCost ?? 0} Scrap · +${card.vp ?? 0}★`, {
        scrap: -(card.scrapCost ?? 0),
        vp: card.vp,
      }),
    ],
    sourceCardId: card.id,
    sourcePlayerId: playerId,
  });
}

export function upgradeBuilding(state, playerId, upgradeUid) {
  if (state.winnerId != null) return state;
  if (state.pendingPrompt) return state;
  const upgrade = (state.unlockableDeck ?? []).find((u) => u.uid === upgradeUid);
  if (!upgrade) return state;
  const check = canUpgrade(state, playerId, upgrade);
  if (!check.ok) return state;

  const parent = check.parent;

  // Swap parent → upgrade in the same slot. Also scrub any disabled-state
  // bookkeeping that referenced the parent's uid so the upgrade comes in
  // clean.
  let next = updatePlayer(state, playerId, (p) => {
    // The upgrade replaces the parent visually (same settlement slot),
    // but the parent's passive stats are preserved by attaching the
    // parent card onto the upgrade entry. calculations.js sums stats
    // across an entry and its attachedParent. Activated abilities still
    // come from the upgrade only — not merged.
    const newSlot = { ...upgrade, attachedParent: { ...parent } };
    const settlement = p.settlement.map((b) => (b.uid === parent.uid ? newSlot : b));
    const disabled = (p.disabledBuildingUids ?? []).filter((x) => x !== parent.uid);
    const disabledPool = (p.buildingsDisabledUntilOwnerTurnEnd ?? []).filter(
      (x) => x !== parent.uid,
    );
    const abilityUsed = { ...(p.abilityUsedThisTurn ?? {}) };
    delete abilityUsed[parent.uid];
    const builtThisTurn = (p.builtThisTurnUids ?? []).filter((x) => x !== parent.uid);
    return {
      ...p,
      scrap: p.scrap - (upgrade.scrapCost ?? 0),
      actionsRemaining: p.actionsRemaining - 1,
      settlement,
      disabledBuildingUids: disabled,
      buildingsDisabledUntilOwnerTurnEnd: disabledPool,
      abilityUsedThisTurn: abilityUsed,
      builtThisTurnUids: [...builtThisTurn, upgrade.uid],
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

// Called from progression-challenge `unlock_unlockable` effect. Looks up
// the referenced card in REWARD_CARD_MAP; if found, adds a playerId-
// scoped copy to the Unlockable Deck. If the card id isn't defined yet
// (e.g. Age 2 content not landed), records the intent on
// state.unlocksPending and notifies the unlocker.
export function unlockUnlockable(state, unlockableId, unlockerId, label) {
  const card = REWARD_CARD_MAP[unlockableId];
  if (card) {
    const copy = {
      ...card,
      scope: unlockerId,
      uid: `${card.id}_p${unlockerId}`,
    };
    const alreadyInDeck = (state.unlockableDeck ?? []).some((u) => u.uid === copy.uid);
    const next = alreadyInDeck
      ? state
      : { ...state, unlockableDeck: [...(state.unlockableDeck ?? []), copy] };
    return notify(next, {
      kind: NotifKind.FLAG,
      title: `Unlocked: ${label ?? card.name}`,
      message: `${card.name} is now purchasable from the Unlockable Deck.`,
      sourcePlayerId: unlockerId,
      severity: "info",
    });
  }
  // Unknown id — most likely Age 2 content — record as pending.
  const next = {
    ...state,
    unlocksPending: [...new Set([...(state.unlocksPending ?? []), unlockableId])],
  };
  return notify(next, {
    kind: NotifKind.FLAG,
    title: `Unlock available: ${label ?? unlockableId}`,
    message:
      `${unlockableId} is unlocked, but its card data isn't implemented yet. ` +
      "It will become purchasable once its card ships.",
    sourcePlayerId: unlockerId,
    severity: "info",
  });
}
