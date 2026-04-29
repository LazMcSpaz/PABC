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
// +1 per matching building. Scrap Yard scales on Scrap-producing
// buildings (passiveScrap > 0) and now contributes its own +1 base, so
// it counts itself in the scaling tally. Training Grounds scales on
// Attack-producing (passiveAtk > 0). No hard cap — the 5-slot
// settlement limit (plus the rare unique building) is the natural
// ceiling. Multiple copies of the triggering building do not stack.
function scalingBonus(player, triggerBuildingId, field) {
  const active = activeBuildings(player);
  if (!active.some((b) => b.id === triggerBuildingId)) return 0;
  return active.filter((b) => (b[field] ?? 0) > 0).length;
}

// Lt. Tusk's passive mirrors Training Grounds — +1 Attack per attack-
// producing building — but is uncapped, and does NOT stack with
// Training Grounds. If both are present, calcAttack applies the higher
// of the two.
function tuskBonus(player) {
  if (player.leader?.id !== "lt_tusk" || player.leader?.disabled) return 0;
  return activeBuildings(player).filter((b) => (b.passiveAtk ?? 0) > 0).length;
}

// Sum any permanent bonus whose mechanic wires into a given calc field.
// Used for narrative rewards like Soluxian "gain +3 Scrap per turn".
function permanentBonusSum(player, effect) {
  return (player.permanentBonuses ?? []).reduce((sum, b) => {
    const m = b.mechanic;
    if (m?.effect === effect) return sum + (m.amount ?? 0);
    return sum;
  }, 0);
}

export function calcPassiveScrap(player) {
  return (
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveScrap ?? 0), 0) +
    leaderContribution(player, "passiveScrap") +
    scalingBonus(player, "scrap_yard", "passiveScrap") +
    permanentBonusSum(player, "bonus_scrap")
  );
}

export function calcAttack(player) {
  // Tusk's passive and Training Grounds' passive both scale on attack-
  // producing buildings; they do not stack — use the higher.
  const scalingAtk = Math.max(
    scalingBonus(player, "training_grounds", "passiveAtk"),
    tuskBonus(player),
  );
  const base =
    activeBuildings(player).reduce((sum, b) => sum + (b.passiveAtk ?? 0), 0) +
    leaderContribution(player, "passiveAtk") +
    scalingAtk;
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
