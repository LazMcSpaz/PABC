// Pure score calculations. Attack/Defense/VP/Scrap/Actions are derived from
// buildings + leader; never stored directly on a player. Base Defense of 1
// applies to all players per README "Resources" table.

const BASE_ACTIONS = 2;
const BASE_DEFENSE = 1;

function activeBuildings(player) {
  const disabled = new Set(player.disabledBuildingUids ?? []);
  return player.settlement.filter((b) => !disabled.has(b.uid));
}

function leaderContribution(player, field) {
  if (!player.leader || player.leader.disabled) return 0;
  return player.leader[field] ?? 0;
}

export function calcPassiveScrap(player) {
  return (
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveScrap ?? 0), 0) +
    leaderContribution(player, "passiveScrap")
  );
}

export function calcAttack(player) {
  const base =
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveAtk ?? 0), 0) +
    leaderContribution(player, "passiveAtk");
  return base + (player.bonusAtk ?? 0) + (player.boosts?.atk ?? 0);
}

export function calcDefense(player) {
  const base =
    BASE_DEFENSE +
    activeBuildings(player).reduce((sum, b) => sum + (b.passDef ?? 0), 0) +
    leaderContribution(player, "passDef");
  return base + (player.bonusDef ?? 0) + (player.boosts?.def ?? 0);
}

export function calcActions(player) {
  return (
    BASE_ACTIONS +
    activeBuildings(player).reduce((sum, b) => sum + (b.passActions ?? 0), 0) +
    leaderContribution(player, "passActions")
  );
}

export function calcVP(player) {
  return (
    activeBuildings(player).reduce((sum, b) => sum + (b.vp ?? 0), 0) +
    leaderContribution(player, "vp") +
    (player.earnedVP ?? 0)
  );
}
