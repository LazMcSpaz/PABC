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

function debuffSum(player, stat) {
  return (player.temporaryDebuffs ?? [])
    .filter((d) => d.stat === stat)
    .reduce((sum, d) => sum + (d.amount ?? 0), 0);
}

// Passive_scaling abilities fire during resource collection and grant
// +1 per matching building, capped at +4. Scrap Yard scales on Scrap-
// producing buildings (passiveScrap > 0); Training Grounds on Attack-
// producing (passiveAtk > 0). Multiple copies of the triggering building
// do not stack — the cap is on the total bonus, not per copy.
function scalingBonus(player, triggerBuildingId, field) {
  const active = activeBuildings(player);
  if (!active.some((b) => b.id === triggerBuildingId)) return 0;
  const matching = active.filter((b) => (b[field] ?? 0) > 0).length;
  return Math.min(4, matching);
}

export function calcPassiveScrap(player) {
  return (
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveScrap ?? 0), 0) +
    leaderContribution(player, "passiveScrap") +
    scalingBonus(player, "scrap_yard", "passiveScrap")
  );
}

export function calcAttack(player) {
  const base =
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveAtk ?? 0), 0) +
    leaderContribution(player, "passiveAtk") +
    scalingBonus(player, "training_grounds", "passiveAtk");
  return Math.max(
    0,
    base + (player.bonusAtk ?? 0) + (player.boosts?.atk ?? 0) + debuffSum(player, "atk"),
  );
}

export function calcDefense(player) {
  const base =
    BASE_DEFENSE +
    activeBuildings(player).reduce((sum, b) => sum + (b.passDef ?? 0), 0) +
    leaderContribution(player, "passDef");
  return Math.max(
    0,
    base + (player.bonusDef ?? 0) + (player.boosts?.def ?? 0) + debuffSum(player, "def"),
  );
}

// Defense for the purpose of raid resolution only. Adds reactive building
// bonuses that the owner isn't expected to trigger manually. Currently:
//   - Lookout Tower: automatic +2 when raided.
// Opt-in reactives (Perimeter Traps) are not auto-fired here; they'll be
// wired through a prompt UI in a later pass.
export function calcDefenseForRaid(player) {
  const base = calcDefense(player);
  const lookoutBonus = activeBuildings(player).some((b) => b.id === "lookout_tower") ? 2 : 0;
  return base + lookoutBonus;
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
