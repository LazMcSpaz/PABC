// ─── UPGRADES ─────────────────────────────────────────────────────────────────
// Upgrades are pulled from the Unlockable Deck — they do NOT appear in the Building Row.
// When purchased, the upgrade card replaces the parent building in the settlement.
// The upgrade occupies the same slot — no additional slot is consumed.
// Upgrade cost is paid on top of having already purchased the parent building.

export const UPGRADES = [

  {
    id: "greenhouse",
    name: "Greenhouse",
    type: "Upgrade",
    age: 1,
    requires: "communal_garden",
    scrapCost: 2,
    atkCost: 0,
    passiveScrap: 3, // Replaces Communal Garden's 2 Scrap with 3 Scrap (net +1)
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: {
      // Passive immunity: owning player is unaffected by the Ash Storm event.
      // When Ash Storm resolves, this player does not skip their Exploration Action.
      type: "passive_immunity",
      immuneTo: ["ash_storm"],
      description: "Immune to Ash Storm event.",
    },
    flavor: "A SOLUX greenhouse kit will save your crops from the harsh Ashland conditions.",
    qty: 2,
  },

  {
    id: "visionscope",
    name: "VisionScope",
    type: "Upgrade",
    age: 1,
    requires: "lookout_tower",
    scrapCost: 2,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 2, // Same Defense as Lookout Tower
    passActions: 0,
    vp: 2,
    ability: {
      // Activated: once per turn, the owning player may look at one random card
      // from another player's hand (Intrigue hand).
      // The chosen player does not know which card was viewed.
      // Does not cost an Action or Scrap.
      // IMPLEMENTATION NOTE: randomly select one card from target's intrigueHand
      // and display it to the active player only.
      type: "activated",
      trigger: "free",
      effect: "peek_player_hand",
      maxPerTurn: 1,
      description: "Once per turn, look at a random card in another player's Intrigue hand.",
    },
    flavor: "The Aegis VisionScope 337B4 has built-in thermal and night-vision capabilities.",
    qty: 2,
  },

  {
    id: "reloading_bench",
    name: "Reloading Bench",
    type: "Upgrade",
    age: 1,
    requires: "forge",
    scrapCost: 1,
    atkCost: 1,
    passiveScrap: 0,
    passiveAtk: 3, // Replaces Forge's 2 Attack with 3 Attack (net +1)
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: null,
    flavor: "Finding ammo isn't always the easiest. That's why I say 'just make it!' — Lucky P.",
    qty: 2,
  },

  {
    id: "improved_meds",
    name: "Improved Meds",
    type: "Upgrade",
    age: 1,
    requires: "medic_tent",
    scrapCost: 2,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: {
      // Enhanced version of Medic Tent: recovers +2 Attack per turn instead of +1.
      type: "passive",
      trigger: "collect_resources",
      effect: "recover_atk",
      atkRecovery: 2,
      description: "Each turn, recover up to +2 used Attack.",
    },
    flavor: "Recently scavenged med-tek should improve treatment at your medical facilities.",
    qty: 1,
  },

  {
    id: "logistics_manager",
    name: "Logistics Manager",
    type: "Upgrade",
    age: 1,
    requires: "antenna_array",
    scrapCost: 3,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 1,
    vp: 2,
    ability: null,
    flavor: "ServoCo built this bot for one thing only — helping crews work more efficiently.",
    qty: 2,
  },
];
