// src/engine/cards.js
// Ashland Conquest — Age 1 Card Data
// Source of truth for all card definitions.
// Schema definitions are in README.md > Card Data Reference.

// ─── BUILDINGS ────────────────────────────────────────────────────────────────

export const BUILDINGS = [

  // ── STARTER BUILDINGS ──
  // Pre-built in every settlement at game start. All players share the same two.

  {
    id: "salvage_depot",
    name: "Salvage Depot",
    type: "Starter",
    age: 1,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 1,
    ability: null,
    upgradable: true,
    upgradeId: null, // assigned when upgrade system is built
    flavor: "A rough collection of scavenged materials forms the backbone of any new settlement's economy.",
    qty: 4,
  },

  {
    id: "makeshift_barracks",
    name: "Makeshift Barracks",
    type: "Starter",
    age: 1,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 1,
    ability: null,
    upgradable: true,
    upgradeId: null,
    flavor: "It isn't much, but it gives your people a place to organize and defend from.",
    qty: 4,
  },

  // ── AGE 1 PURCHASABLE BUILDINGS ──

  {
    id: "scavengers_hut",
    name: "Scavenger's Hut",
    type: "Building",
    age: 1,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: null,
    upgradable: true,
    upgradeId: null,
    flavor: "Scavenging old-world tech forms the basis of any functional settlement.",
    qty: 4,
  },

  {
    id: "militia_bunkhouse",
    name: "Militia Bunkhouse",
    type: "Building",
    age: 1,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: null,
    upgradable: true,
    upgradeId: null,
    flavor: "Although they aren't highly-trained soldiers, they still need a place to rest their heads.",
    qty: 4,
  },

  {
    id: "communal_garden",
    name: "Communal Garden",
    type: "Building",
    age: 1,
    scrapCost: 4,
    atkCost: 0,
    passiveScrap: 2,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: null,
    upgradable: true,
    upgradeId: "greenhouse",
    flavor: "We can't eat tech, so tend to the damn garden! — T.J. Farmer",
    qty: 4,
  },

  {
    id: "scrap_yard",
    name: "Scrap Yard",
    type: "Building",
    age: 1,
    scrapCost: 2,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Triggered: passive, evaluated during resource collection each turn.
      // Grants +1 Scrap per Scrap-producing building in the player's settlement.
      // A Scrap-producing building is any building where passiveScrap > 0.
      // Hard cap: +4 maximum bonus Scrap from this effect.
      type: "passive_scaling",
      trigger: "collect_resources",
      scalesOn: "passiveScrap",
      bonusPerBuilding: 1,
      bonusStat: "scrap",
      maxBonus: 4,
      description: "Each turn, gain +1 Scrap per Scrap-producing building in your settlement. Max +4.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "Ooooh yeah, I can't get enough of that rusty ol' scrap! — Old Scrappy",
    qty: 2,
  },

  {
    id: "trading_post",
    name: "Trading Post",
    type: "Building",
    age: 1,
    scrapCost: 3,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Activated: player spends 1 Action to trigger.
      // Active player receives +3 Scrap.
      // Active player then chooses one other player, who receives +1 Scrap.
      // The Trader leader enhances this: active player receives +2 additional Scrap,
      // and the chosen partner receives +1 additional Scrap (i.e. +5 and +2 total).
      type: "activated",
      trigger: "spend_action",
      actionCost: 1,
      effect: "trade",
      selfScrap: 3,
      partnerScrap: 1,
      description: "Spend 1 Action → +3 Scrap. Choose a player to receive +1 Scrap.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "Barter between settlements could mean the difference between success or death.",
    qty: 3,
  },

  {
    id: "vehicle_garage",
    name: "Vehicle Garage",
    type: "Building",
    age: 1,
    scrapCost: 5,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 1,
    vp: 3,
    ability: {
      // Activated: once per turn, spend 2 Scrap → gain +1 Action immediately.
      // This is in addition to the passive +1 Action this building already provides.
      // Limit: once per turn.
      type: "activated",
      trigger: "spend_scrap",
      scrapCost: 2,
      effect: "gain_actions",
      actionGain: 1,
      maxPerTurn: 1,
      description: "Once per turn, spend 2 Scrap → +1 Action.",
    },
    upgradable: true,
    upgradeId: null, // Advanced Welders — Age 2 upgrade, not yet implemented
    flavor: "The Ashlands are big. Very big. You aren't going anywhere without hard-working vehicles.",
    qty: 3,
  },

  {
    id: "medic_tent",
    name: "Medic Tent",
    type: "Building",
    age: 1,
    scrapCost: 2,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Passive: at the start of each player's turn, during resource collection,
      // this building restores +1 to the player's permanent bonusAtk pool.
      // This represents recovering Attack that was lost to temporary debuffs
      // (e.g., Disease Scare, Forced March trade-off).
      // It does NOT generate new Attack — it only recovers lost Attack, up to the
      // player's base calculated Attack score.
      // IMPLEMENTATION NOTE: track a "pendingAtkRecovery" field; add 1 per turn,
      // apply against any active atkDebuffs, then clear.
      type: "passive",
      trigger: "collect_resources",
      effect: "recover_atk",
      atkRecovery: 1,
      description: "Each turn, recover up to +1 used Attack.",
    },
    upgradable: true,
    upgradeId: "improved_meds",
    flavor: "Damnit Captain, I'm a doctor not a miracle worker! — Doc Brawlins",
    qty: 2,
  },

  {
    id: "forge",
    name: "Forge",
    type: "Building",
    age: 1,
    scrapCost: 2,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 2,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: null,
    upgradable: true,
    upgradeId: "reloading_bench",
    flavor: "A militia is nothing more than a band of farmers without decent arms and armor.",
    qty: 4,
  },

  {
    id: "training_grounds",
    name: "Training Grounds",
    type: "Building",
    age: 1,
    scrapCost: 0,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Passive: mirrors Scrap Yard but for Attack.
      // Grants +1 Attack per Attack-producing building in the player's settlement.
      // An Attack-producing building is any building where passiveAtk > 0.
      // Hard cap: +4 maximum bonus Attack from this effect.
      type: "passive_scaling",
      trigger: "collect_resources",
      scalesOn: "passiveAtk",
      bonusPerBuilding: 1,
      bonusStat: "atk",
      maxBonus: 4,
      description: "Each turn, gain +1 Attack per Attack-producing building in your settlement. Max +4.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "We'll whip these troops into shape in no time. — Lt. Tusk",
    qty: 2,
  },

  {
    id: "antenna_array",
    name: "Antenna Array",
    type: "Building",
    age: 1,
    scrapCost: 2,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Activated: once per turn, spend 2 Scrap → draw 1 Intrigue card.
      // Drawing does not cost an Action — only the Scrap.
      // If hand is already at 3, player must discard before receiving the new card.
      // Disabled by Solar Flare event.
      type: "activated",
      trigger: "spend_scrap",
      scrapCost: 2,
      effect: "draw_intrigue",
      intrigueDraw: 1,
      maxPerTurn: 1,
      disabledBy: ["solar_flare"],
      description: "Once per turn, spend 2 Scrap → draw 1 Intrigue card.",
    },
    upgradable: true,
    upgradeId: "logistics_manager",
    flavor: "Listening in on and broadcasting to settlements is the only way to gain an upper hand.",
    qty: 4,
  },

  {
    id: "lookout_tower",
    name: "Lookout Tower",
    type: "Building",
    age: 1,
    scrapCost: 1,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 2,
    passActions: 0,
    vp: 3,
    ability: {
      // Reactive: triggers automatically when the owning player is targeted by a raid.
      // Adds +2 to the player's Defense score for the purpose of that raid resolution only.
      // This stacks with any boosts already declared.
      // Does not cost Scrap or an Action.
      type: "reactive",
      trigger: "raid_declared_against_owner",
      effect: "bonus_defense",
      defBonus: 2,
      description: "When raided, add +2 to your Defense score.",
    },
    upgradable: true,
    upgradeId: "visionscope",
    flavor: "Spotting threats at a distance allows for proper preparation against raids.",
    qty: 3,
  },

  {
    id: "drone_lab",
    name: "Drone Lab",
    type: "Building",
    age: 1,
    scrapCost: 2,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Activated: once per turn, the owning player may look at the top card
      // of the Exploration deck without drawing it (no Action cost, no Scrap cost).
      // After looking, they may choose to discard that top card (it goes to discard pile).
      // If they discard it, the next card becomes the new top card.
      // Disabled by Solar Flare event.
      type: "activated",
      trigger: "free",
      effect: "peek_explore_deck",
      mayDiscard: true,
      maxPerTurn: 1,
      disabledBy: ["solar_flare"],
      description: "Once per turn, look at the top card of the Exploration deck. You may discard it.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "Sending drones into the Ash can save the lives of scouts and soldiers.",
    qty: 2,
  },

  {
    id: "light_artillery",
    name: "Light Artillery",
    type: "Building",
    age: 1,
    scrapCost: 3,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Activated: when the owning player is resolving an Exploration Challenge,
      // they may spend 1 Scrap to reduce the Attack requirement on that card by 2.
      // This is applied before checking whether the player meets the requirement.
      // Minimum Attack requirement after reduction: 0 (cannot go negative).
      // Does not apply to Defense requirements.
      // Does not apply to Surprise-type cards (no interaction with boosting rules —
      // this is a direct requirement reduction, not a boost).
      type: "activated",
      trigger: "resolving_challenge",
      scrapCost: 1,
      effect: "reduce_atk_requirement",
      reduction: 2,
      minimum: 0,
      appliesToSurprise: true,
      description: "When resolving a Challenge, spend 1 Scrap to reduce the Attack requirement by 2.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "These shells aren't easy to make, but damn do I love to see 'em blow up. — Benny Bombs",
    qty: 2,
  },

  {
    id: "perimeter_traps",
    name: "Perimeter Traps",
    type: "Building",
    age: 1,
    scrapCost: 1,
    atkCost: 1,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Reactive: when the owning player is targeted by a raid,
      // they may optionally spend 2 Scrap to add +2 to their Defense score
      // for that raid resolution.
      // This is optional — player chooses whether to activate it.
      // Unlike Lookout Tower, this costs Scrap and is not automatic.
      // Can stack with Lookout Tower and boosts.
      type: "reactive",
      trigger: "raid_declared_against_owner",
      optional: true,
      scrapCost: 2,
      effect: "bonus_defense",
      defBonus: 2,
      description: "When raided, spend 2 Scrap → +2 Defense.",
    },
    upgradable: true,
    upgradeId: null, // Automated Turrets — Age 2 upgrade, not yet implemented
    flavor: "Traps take a variety of forms, but the result is usually the same... Dead marauders.",
    qty: 3,
  },

  {
    id: "signal_jammers",
    name: "Signal Jammers",
    type: "Building",
    age: 1,
    scrapCost: 1,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 2,
    ability: {
      // Activated: when the owning player initiates a raid,
      // they may spend 2 Scrap to reduce the target's Defense score by 2
      // for that raid resolution only.
      // Applied before comparing Attack vs. Defense.
      // Minimum Defense after reduction: 0.
      // Disabled by Solar Flare event.
      type: "activated",
      trigger: "owner_initiating_raid",
      optional: true,
      scrapCost: 2,
      effect: "reduce_target_defense",
      reduction: 2,
      minimum: 0,
      disabledBy: ["solar_flare"],
      description: "When raiding, spend 2 Scrap → reduce target's Defense score by 2.",
    },
    upgradable: false,
    upgradeId: null,
    flavor: "Cutting communications should help your raids greatly.",
    qty: 2,
  },
];


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


// ─── LEADERS ──────────────────────────────────────────────────────────────────
// Each player starts with The Administrator. Other leaders are discovered
// through the Exploration deck as narrative or challenge rewards.
// A player may hold a discovered leader and choose when to swap.
// Replacing a leader does not cost an Action.

export const LEADERS = [

  {
    id: "administrator",
    name: "The Administrator",
    type: "Leader (Starter)",
    age: 1,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 1,
    ability: null,
    flavor: "It's not ServoCo's best work, but it's great at multitasking. — Rita, 1st Engineer",
    qty: 4,
  },

  {
    id: "the_diplomat",
    name: "The Diplomat",
    type: "Leader",
    age: 1,
    scrapCost: 2,
    atkCost: 2,
    passiveScrap: 1,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Free action (no Action cost): once per turn, the player may swap up to 3 Scrap
      // for Attack or vice versa at a 1:1 ratio.
      // "Swap" means converting from one resource to the other permanently for the turn.
      // Scrap → Attack: reduces scrap pool, increases bonusAtk by same amount.
      // Attack → Scrap: reduces bonusAtk, increases scrap by same amount.
      // Maximum 3 in either direction per activation.
      // Once per turn limit.
      type: "free_action",
      trigger: "once_per_turn",
      effect: "swap_scrap_atk",
      maxSwap: 3,
      description: "Once per turn (free): swap up to 3 Scrap ↔ Attack at 1:1.",
    },
    flavor: "Why commit ourselves to one approach when adaptability is a universal skill?",
    qty: 1,
  },

  {
    id: "the_trader",
    name: "The Trader",
    type: "Leader",
    age: 1,
    scrapCost: 5,
    atkCost: 0,
    passiveScrap: 2,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Passive enhancement to Trading Post.
      // When the owning player uses the Trading Post activated ability:
      // - They receive an additional +2 Scrap (total: +5 instead of +3)
      // - Their chosen partner receives an additional +1 Scrap (total: +2 instead of +1)
      // This only applies to Trading Post trades, not to other Scrap-giving effects.
      type: "passive_enhancement",
      enhances: "trading_post",
      trigger: "trading_post_activated",
      selfBonus: 2,
      partnerBonus: 1,
      description: "When trading, receive +2 additional Scrap. Partner receives +1 additional Scrap.",
    },
    flavor: "Commerce keeps the Ash alive, and I aim to be its biggest supporter!",
    qty: 1,
  },

  {
    id: "the_explorer",
    name: "The Explorer",
    type: "Leader",
    age: 1,
    scrapCost: 2,
    atkCost: 3,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Free action: once per turn, the owning player may draw and resolve
      // one Exploration card without spending an Action.
      // The card is resolved normally (costs still apply, requirements still checked).
      // Only the Action cost is waived — Scrap costs are still paid.
      // Once per turn limit.
      type: "free_action",
      trigger: "once_per_turn",
      effect: "free_explore",
      description: "Once per turn, draw and resolve an Exploration card without spending an Action.",
    },
    flavor: "Real opportunity is out in the Ash.",
    qty: 1,
  },

  {
    id: "the_warlord",
    name: "The Warlord",
    type: "Leader",
    age: 1,
    scrapCost: 1,
    atkCost: 4,
    passiveScrap: 0,
    passiveAtk: 2,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Passive raid enhancement: when the owning player initiates a raid,
      // the target's effective Defense score is reduced by 1 for each
      // Attack-producing building in the attacker's settlement.
      // An Attack-producing building is any building where passiveAtk > 0.
      // This reduction is applied before comparing Attack vs. Defense.
      // Minimum effective Defense: 0.
      // Stacks with Signal Jammers.
      // Also affects Negotiate with Marauders: if this player is the leader,
      // that card may be paid up to 3 times without spending additional Actions.
      type: "passive",
      trigger: "owner_initiating_raid",
      effect: "reduce_target_defense_per_atk_building",
      reductionPerBuilding: 1,
      scalesOn: "passiveAtk",
      minimum: 0,
      description: "When raiding, reduce target's Defense by 1 per Attack-producing building in your settlement.",
    },
    flavor: "We'll be there to reap the rewards of their labor.",
    qty: 1,
  },

  {
    id: "the_stalwart",
    name: "The Stalwart",
    type: "Leader",
    age: 1,
    scrapCost: 2,
    atkCost: 2,
    passiveScrap: 0,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 3,
    ability: {
      // Passive raid defense: when the owning player is targeted by a raid,
      // their Defense score is increased by 1 for each Attack-producing building
      // in their settlement.
      // An Attack-producing building is any building where passiveAtk > 0.
      // This bonus is applied automatically — no Scrap or Action cost.
      // Stacks with Lookout Tower and Perimeter Traps.
      type: "passive",
      trigger: "raid_declared_against_owner",
      effect: "bonus_defense_per_atk_building",
      bonusPerBuilding: 1,
      scalesOn: "passiveAtk",
      description: "When raided, add +1 to Defense per Attack-producing building in your settlement.",
    },
    flavor: "The safety of our settlement should be our first priority.",
    qty: 1,
  },

  {
    id: "the_engineer",
    name: "The Engineer",
    type: "Leader",
    age: 1,
    scrapCost: 3,
    atkCost: 2,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Passive demolition bonus: when the owning player demolishes a building
      // as part of purchasing a new one, they recover Scrap equal to half the
      // demolished building's total cost (scrapCost + atkCost), rounded up.
      // Example: demolishing a Forge (scrapCost 2 + atkCost 2 = 4 total) returns 2 Scrap.
      // Example: demolishing a Communal Garden (scrapCost 4 + atkCost 0 = 4 total) returns 2 Scrap.
      // This Scrap is added to the player's pool immediately.
      // Does not apply when a building is destroyed by a raid.
      type: "passive",
      trigger: "owner_demolishes_building",
      effect: "recover_scrap_on_demolish",
      fraction: 0.5,
      roundUp: true,
      description: "When replacing a building, recover half its total cost (rounded up) in Scrap.",
    },
    flavor: "I have no intention of letting our resources go to waste.",
    qty: 1,
  },
];


// ─── EXPLORATION CHALLENGES ───────────────────────────────────────────────────
// The most common card type. Player draws by spending 1 Action.
// Requirements: scrapCost is spent from pool. reqAtk / reqDef are checked (not spent).
// Player may boost Attack/Defense after a Challenge is revealed but before resolution.
// Failed/skipped challenges remain face-up. Any player may attempt them (costs 1 Action).

export const CHALLENGES = [

  {
    id: "scavenge_ruins",
    name: "Scavenge Ruins",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 1,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: {
      // The player may pay the cost and claim the reward up to 3 times
      // in a single resolution, without spending additional Actions.
      // Total reward if fully exploited: +9 Scrap, 6 VP.
      type: "repeatable",
      maxRepeat: 3,
      description: "Pay cost up to 3 times without spending additional Actions.",
    },
    flavor: "There is still plenty to be found out in the world.",
    qty: 3,
  },

  {
    id: "negotiate_with_marauders",
    name: "Negotiate with Marauders",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 4,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // Standard resolution: pay 2 Scrap, gain +4 permanent Attack bonus.
      // Leader bonus: if The Warlord is the active player's leader,
      // they may pay the cost up to 3 times without spending additional Actions.
      // Total Attack if fully exploited with Warlord: +12 permanent Attack.
      type: "leader_enhanced",
      leaderId: "the_warlord",
      leaderBonus: {
        type: "repeatable",
        maxRepeat: 3,
      },
      description: "If leader is The Warlord, pay cost up to 3 times without extra Actions.",
    },
    flavor: "They may be merciless killers, but even they can't survive without food and water.",
    qty: 2,
  },

  {
    id: "discover_supply_cache",
    name: "Discover Supply Cache",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: null,
    flavor: "An undefended supply cache? Your luck must be turning around.",
    qty: 4,
  },

  {
    id: "raid_solux_factory",
    name: "Raid SOLUX Factory",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 1,
    vp: 3,
    ability: null,
    flavor: "There wasn't a consumer product SOLUX didn't make, defense bots included.",
    qty: 2,
  },

  {
    id: "rebuild_abandoned_bot",
    name: "Rebuild Abandoned Bot",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 5,
    defReward: 0,
    actionReward: 0,
    vp: 4,
    ability: null,
    flavor: "I think we can reprogram this old bot for defensive patrols. — Frika, 3rd Engineer",
    qty: 2,
  },

  {
    id: "infiltrate_marauder_camp",
    name: "Infiltrate Marauder Camp",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 1,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 1,
    vp: 3,
    ability: {
      // On resolution, the active player draws 1 Intrigue card.
      // This is in addition to the actionReward.
      // If hand is full (3 cards), player must discard before receiving the new card.
      type: "on_resolve",
      effect: "draw_intrigue",
      intrigueDraw: 1,
      description: "Draw 1 Intrigue card on resolution.",
    },
    flavor: "Marauders come across valuable tech during their raids. Now it's your turn.",
    qty: 2,
  },

  {
    id: "form_trade_route",
    name: "Form Trade Route",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 8,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 5,
    ability: null,
    flavor: "It takes resources to establish trade routes, but the payoff is well worth it.",
    qty: 2,
  },

  {
    id: "encounter_mountain_cult",
    name: "Encounter Mountain Cult",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 2,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // Leader bonus: if The Diplomat is the active player's leader,
      // add +3 to the Attack reward on resolution (total: +3 permanent Attack).
      // Completing a Mountain Cult challenge also grants immunity to
      // Mountain Cult Sermon event (tracked via player.flags.completedMountainCult).
      type: "leader_enhanced",
      leaderId: "the_diplomat",
      leaderBonus: {
        atkRewardBonus: 3,
      },
      sideEffect: {
        effect: "set_flag",
        flag: "completedMountainCult",
        value: true,
      },
      description: "If leader is The Diplomat, add +3 Attack to reward.",
    },
    flavor: "They call themselves the Cult of the Mountain. — 1st Scout Yeats",
    qty: 2,
  },

  {
    id: "discover_logistics_datapak",
    name: "Discover Logistics DataPak",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 2,
    actionReward: 2,
    vp: 3,
    ability: {
      // Bonus: if the active player has an Antenna Array in their settlement,
      // they gain +1 additional Action on resolution (total: +3 Actions).
      type: "building_enhanced",
      requiresBuilding: "antenna_array",
      bonus: {
        actionRewardBonus: 1,
      },
      description: "Gain +1 additional Action if you have an Antenna Array.",
    },
    flavor: "Occasionally you find a diamond in the rough among corrupted old DataPaks.",
    qty: 2,
  },

  {
    id: "reprogram_sentries",
    name: "Reprogram Sentries",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 8,
    defReward: 0,
    actionReward: 0,
    vp: 5,
    ability: null,
    flavor: "Jacking into a sentry's hardware is dangerous, but well worth the risk.",
    qty: 1,
  },

  {
    id: "rebuild_vanguard_armory",
    name: "Rebuild Vanguard Armory",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 2,
    defReward: 0,
    actionReward: 0,
    vp: 4,
    ability: {
      // On resolution: this card is added to the player's settlement as a building.
      // It does NOT consume a building slot.
      // It provides no passive stats — it exists only for VP and flavor.
      // If disabled by an Intrigue effect, it is discarded rather than recovering.
      type: "on_resolve",
      effect: "add_to_settlement",
      noSlotRequired: true,
      discardIfDisabled: true,
      description: "On resolution, add this card to your settlement. No slot needed. Discard if disabled.",
    },
    flavor: "The Vanguard had armories scattered throughout the land.",
    qty: 2,
  },

  {
    id: "raid_traxon_factory",
    name: "Raid TRAXON Factory",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 4,
    reqDef: 0,
    scrapReward: 2,
    atkReward: 0,
    defReward: 0,
    actionReward: 2,
    vp: 3,
    ability: {
      // Bonus: if the active player has a Vehicle Garage in their settlement,
      // they gain +1 additional Action on resolution (total: +3 Actions).
      type: "building_enhanced",
      requiresBuilding: "vehicle_garage",
      bonus: {
        actionRewardBonus: 1,
      },
      description: "Gain +1 additional Action if you have a Vehicle Garage.",
    },
    flavor: "TRAXON made large and powerful vehicles. No doubt you can use some components.",
    qty: 2,
  },

  {
    id: "discover_neptune_cargo",
    name: "Discover Neptune Cargo",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 4,
    atkReward: 0,
    defReward: 0,
    actionReward: 1,
    vp: 3,
    ability: {
      // Optional trade-off on resolution: player may choose to reduce their
      // Scrap reward by 2 (gaining 2 Scrap instead of 4) to receive +1 additional Action.
      // This is the player's choice at resolution time.
      type: "on_resolve_choice",
      options: [
        { label: "Take full Scrap (+4 Scrap, +1 Action)", scrapModifier: 0, actionModifier: 0 },
        { label: "Trade 2 Scrap for 1 Action (+2 Scrap, +2 Actions)", scrapModifier: -2, actionModifier: 1 },
      ],
      description: "Reduce Scrap reward by 2 to gain +1 additional Action.",
    },
    flavor: "Almost all Neptune Relay cargo was in transit before their tech went offline.",
    qty: 2,
  },

  {
    id: "manipulate_marauders",
    name: "Manipulate Marauders",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: {
      // Additional requirement: player must discard 1 Intrigue card from their hand
      // to resolve this card. If the player has no Intrigue cards, they cannot resolve.
      // The Scrap cost (0) still applies. The discard is mandatory, not optional.
      type: "additional_requirement",
      requireDiscard: "intrigue",
      discardCount: 1,
      description: "Must discard 1 Intrigue card to resolve.",
    },
    flavor: "Marauders may be tough, but they aren't the smartest.",
    qty: 1,
  },

  {
    id: "discover_recon_drone",
    name: "Discover Recon Drone",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 1,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution: reveal the top 3 cards of the Exploration deck to all players.
      // The active player may then return them in any order they choose.
      // Then: draw the new top card and resolve it without spending an additional Action.
      // That card must still meet its Scrap/Attack/Defense requirements.
      type: "on_resolve",
      effect: "peek_reorder_then_draw",
      peekCount: 3,
      thenDrawAndResolve: true,
      description: "Reveal top 3 Exploration cards, return in any order, draw top card without spending an Action.",
    },
    flavor: "Our boys found this drone in the Ash. The info on it is still good. — 1st Scout Yeats",
    qty: 1,
  },

  {
    id: "encounter_looters",
    name: "Encounter Looters",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 4,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: null,
    flavor: "Not all threats are as vicious as the marauders, but they have strength in numbers.",
    qty: 4,
  },

  {
    id: "scout_highways",
    name: "Scout Highways",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 2,
    vp: 3,
    ability: null,
    flavor: "The value of a competent recon team is clear to all.",
    qty: 2,
  },

  {
    id: "encounter_pilgrimage",
    name: "Encounter Pilgrimage",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution, the player chooses one of two rewards.
      // Only one may be claimed.
      type: "on_resolve_choice",
      options: [
        { label: "+4 Scrap", scrapModifier: 4, atkModifier: 0 },
        { label: "+4 Attack (permanent)", scrapModifier: 0, atkModifier: 4 },
      ],
      description: "Choose +4 Scrap or +4 Attack as reward.",
    },
    flavor: "Some have expressed wanting to abandon their pilgrimage. What should we do? — Lt. Tusk",
    qty: 2,
  },

  {
    id: "scavenge_collapsed_mall",
    name: "Scavenge Collapsed Mall",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 4,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: null,
    flavor: "The old world's temples to consumerism are still out there, slowly falling apart.",
    qty: 4,
  },

  {
    id: "abandoned_clinic",
    name: "Abandoned Clinic",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 2,
    reqDef: 0,
    scrapReward: 5,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // Leader bonus: if Doc Brawlins is the active player's leader,
      // they gain +2 additional Scrap on resolution (total: +7 Scrap).
      // NOTE: Doc Brawlins is a narrative reward leader — not in the base leader set.
      // His leaderId in the system will be "doc_brawlins" when implemented.
      type: "leader_enhanced",
      leaderId: "doc_brawlins",
      leaderBonus: {
        scrapRewardBonus: 2,
      },
      description: "If Doc Brawlins is leader, gain +2 additional Scrap.",
    },
    flavor: "A pre-collapse medical facility sits partially intact on the edge of your territory.",
    qty: 2,
  },

  {
    id: "drifter_caravan",
    name: "Drifter Caravan",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 4,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution: the player to the active player's left gains +1 Scrap.
      // Additionally, the active player draws 1 Intrigue card.
      // Both effects happen automatically on resolution.
      type: "on_resolve",
      effects: [
        { effect: "give_scrap_to_player", target: "left", amount: 1 },
        { effect: "draw_intrigue", intrigueDraw: 1 },
      ],
      description: "Player to your left gains 1 Scrap. Draw 1 Intrigue card.",
    },
    flavor: "A Drifter caravan has made camp nearby. They have goods to trade and stories to tell.",
    qty: 3,
  },

  {
    id: "marauder_skirmish",
    name: "Marauder Skirmish",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 4,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 2,
    ability: {
      // On resolution: the active player immediately draws the next card from the
      // Exploration deck and resolves it without spending an additional Action.
      // That card must still meet its Scrap/Attack/Defense requirements.
      // If the drawn card is an Event, it resolves normally (affecting all players).
      type: "on_resolve",
      effect: "draw_and_resolve_next",
      description: "On resolution, draw next Exploration card without spending an Action.",
    },
    flavor: "A small marauder band has been testing your perimeter looking for weaknesses.",
    qty: 2,
  },

  {
    id: "salvage_the_highway",
    name: "Salvage the Highway",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 5,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 4,
    ability: {
      // On resolution: the active player gains +2 Actions on each of their
      // next 3 turns. This is tracked as a temporary recurring bonus.
      // IMPLEMENTATION NOTE: add { turnsRemaining: 3, bonusActions: 2 }
      // to player.temporaryBonuses array. Evaluate during each resource collection.
      type: "on_resolve",
      effect: "recurring_action_bonus",
      bonusActions: 2,
      forNextNTurns: 3,
      description: "Gain +2 Actions on each of your next 3 turns.",
    },
    flavor: "Securing a stretch of old world highway would open up movement considerably.",
    qty: 2,
  },

  {
    id: "collapsed_data_tower",
    name: "Collapsed Data Tower",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 2,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution: the active player looks at the top 5 cards of the
      // Exploration deck and returns them in any order they choose.
      // No cards are drawn — only reordering occurs.
      type: "on_resolve",
      effect: "peek_and_reorder",
      peekCount: 5,
      description: "Look at top 5 Exploration cards and return in any order.",
    },
    flavor: "A Neptune Relay data tower has finally come down. A few DataPaks might still be readable.",
    qty: 2,
  },

  {
    id: "negotiate_passage",
    name: "Negotiate Passage",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 4,
    reqAtk: 0,
    reqDef: 4,
    scrapReward: 6,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // Leader discount: if Lt. Tusk is the active player's leader,
      // reduce the Scrap cost by 2 (pay 2 Scrap instead of 4).
      // NOTE: Lt. Tusk is a narrative reward leader — leaderId "lt_tusk".
      type: "leader_enhanced",
      leaderId: "lt_tusk",
      leaderBonus: {
        scrapCostReduction: 2,
      },
      description: "If Lt. Tusk is leader, reduce Scrap cost by 2.",
    },
    flavor: "A Vanguard Remnant cell is controlling access to a resource-rich area.",
    qty: 2,
  },

  {
    id: "stranded_drifter",
    name: "Stranded Drifter",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 5,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution: the active player gains a special one-use item called
      // "Drifter Contact." This functions as a held card in the player's possession
      // (not in their Intrigue hand — it does not count toward the 3-card limit).
      // At any point in any future turn, the player may use Drifter Contact to
      // draw 2 Intrigue cards immediately without spending an Action.
      // Drifter Contact is consumed on use.
      // IMPLEMENTATION NOTE: store as player.specialItems array.
      type: "on_resolve",
      effect: "gain_special_item",
      item: {
        id: "drifter_contact",
        name: "Drifter Contact",
        useEffect: { effect: "draw_intrigue", intrigueDraw: 2 },
        useCost: { action: 0, scrap: 0 },
        consumeOnUse: true,
      },
      description: "Gain 'Drifter Contact' — draw 2 Intrigue cards at any point (no Action cost).",
    },
    flavor: "A lone Drifter is stranded with a damaged vehicle and a load of goods they can't move.",
    qty: 2,
  },

  {
    id: "corrupted_servobot",
    name: "Corrupted ServoCo Bot",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 4,
    actionReward: 0,
    vp: 4,
    ability: {
      // The Defense reward (+4) from this card is permanent.
      // It is added to player.bonusDef and is not a temporary boost.
      // This is already implied by defReward in the base schema but noted
      // explicitly here because it's unusually large.
      type: "note",
      description: "On resolution, gain +4 Defense permanently.",
    },
    flavor: "A ServoCo bot wanders in circles nearby, its navigation corrupted but systems functional.",
    qty: 2,
  },

  {
    id: "mountain_cult_boundary_marker",
    name: "Mountain Cult Boundary Marker",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 4,
    reqDef: 4,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // The player chooses which requirement to use — Attack OR Defense — not both.
      // If using Attack (reqAtk 4): reward is +3 Scrap.
      // If using Defense (reqDef 4): reward is +1 Intrigue card + 1 free Exploration draw.
      // Only the chosen path's requirement needs to be met.
      type: "on_resolve_choice",
      options: [
        {
          label: "Use Attack (req 4 Atk): +3 Scrap",
          requirement: { reqAtk: 4, reqDef: 0 },
          rewards: { scrap: 3, intrigue: 0, freeExplore: false },
        },
        {
          label: "Use Defense (req 4 Def): +1 Intrigue + free Explore draw",
          requirement: { reqAtk: 0, reqDef: 4 },
          rewards: { scrap: 0, intrigue: 1, freeExplore: true },
        },
      ],
      description: "Choose Attack or Defense path. Atk: +3 Scrap. Def: +1 Intrigue + free Exploration draw.",
    },
    flavor: "Someone has placed Mountain Cult markers on land your settlement considers its own.",
    qty: 2,
  },

  {
    id: "raid_marauder_cache",
    name: "Raid Marauder Cache",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 5,
    reqDef: 0,
    scrapReward: 7,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: null,
    flavor: "A Drifter points to a temporarily unguarded marauder supply cache. The window is narrow.",
    qty: 2,
  },

  {
    id: "old_world_bunker",
    name: "Old World Bunker",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 4,
    reqAtk: 4,
    reqDef: 0,
    scrapReward: 6,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 4,
    ability: {
      // On resolution: the active player draws 2 Intrigue cards.
      // If drawing 2 would exceed hand limit, player must discard down to 3.
      type: "on_resolve",
      effect: "draw_intrigue",
      intrigueDraw: 2,
      description: "Draw 2 Intrigue cards on resolution.",
    },
    flavor: "Your scouts have found a sealed pre-collapse bunker, untouched since before the disease.",
    qty: 2,
  },

  {
    id: "fuel_cache",
    name: "Fuel Cache",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 5,
    reqDef: 0,
    scrapReward: 3,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // On resolution: the active player gains +2 Actions on their NEXT turn only.
      // IMPLEMENTATION NOTE: add { turnsRemaining: 1, bonusActions: 2 }
      // to player.temporaryBonuses array.
      type: "on_resolve",
      effect: "recurring_action_bonus",
      bonusActions: 2,
      forNextNTurns: 1,
      description: "Gain +2 Actions on your next turn.",
    },
    flavor: "Someone hid a significant fuel reserve in the Ash before the collapse and never came back.",
    qty: 2,
  },

  {
    id: "recruit_wastelanders",
    name: "Recruit Wastelanders",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 0,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 2,
    defReward: 2,
    actionReward: 0,
    vp: 4,
    ability: {
      // Both the Attack and Defense rewards are permanent bonuses.
      // Already implied by atkReward and defReward — noted explicitly
      // because both apply simultaneously, which is unusual.
      type: "note",
      description: "Gain +2 Attack and +2 Defense permanently.",
    },
    flavor: "A group of unaffiliated survivors is looking for a settlement to call home.",
    qty: 2,
  },

  {
    id: "intercept_soluxian_shipment",
    name: "Intercept Soluxian Shipment",
    type: "Challenge",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 6,
    reqDef: 0,
    scrapReward: 8,
    atkReward: 0,
    defReward: 0,
    actionReward: 0,
    vp: 3,
    ability: {
      // Permanent global effect on resolution: all Exploration cards tagged with
      // faction "soluxian" become Surprise type for the rest of the game.
      // This affects all players, not just the resolving player.
      // IMPLEMENTATION NOTE: set gameState.globalFlags.soluxianCardsAreSurprise = true.
      // During card resolution, check this flag and apply surprise rules if true.
      type: "on_resolve",
      effect: "set_global_flag",
      flag: "soluxianCardsAreSurprise",
      value: true,
      description: "All future Soluxian faction Exploration cards become Surprise type for the rest of the game.",
    },
    flavor: "A Soluxian supply caravan is moving through the area. Intercepting it would be profitable.",
    qty: 2,
  },
];


// ─── PROGRESSION CHALLENGES ───────────────────────────────────────────────────
// Special challenges that trigger Age 2 when all three are resolved.
// "Resolved" means: the challenge was completed AND the associated building was
// constructed AND the associated leader card was revealed in any settlement.
// This is a collective milestone — all three tracks must be met across all players.

export const PROGRESSION_CHALLENGES = [

  {
    id: "secure_servotech_factory",
    name: "Secure ServoCo Factory",
    type: "Challenge (Progression)",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 4,
    reqDef: 0,
    scrapReward: 6,
    atkReward: 4,
    defReward: 0,
    actionReward: 0,
    vp: 6,
    progressionTrack: "servotech",
    ability: {
      // On resolution: add this card to the resolving player's hand (as a held card,
      // not in their settlement). It is kept to track that this progression is met.
      // Also: unlocks "ServoCo Assembly" building in the Unlockable Deck.
      // ServoCo Assembly is an Age 2 building — its data is in the Age 2 card file.
      type: "on_resolve",
      effects: [
        { effect: "add_to_hand_as_token" },
        { effect: "unlock_unlockable", unlockableId: "servotech_assembly" },
      ],
      description: "On resolution, add to hand. Unlocks ServoCo Assembly building.",
    },
    flavor: "ServoCo's factories are treasure troves of old-world tech that you can repurpose.",
    qty: 1,
  },

  {
    id: "secure_nova9_tower",
    name: "Secure Nova9 Tower",
    type: "Challenge (Progression)",
    age: 1,
    surprise: false,
    scrapCost: 3,
    reqAtk: 5,
    reqDef: 0,
    scrapReward: 0,
    atkReward: 0,
    defReward: 0,
    actionReward: 2,
    vp: 6,
    progressionTrack: "nova9",
    ability: {
      // On resolution: the active player draws +2 Intrigue cards.
      // Also: unlocks "Nova9 Broadcast Station" building in the Unlockable Deck.
      type: "on_resolve",
      effects: [
        { effect: "draw_intrigue", intrigueDraw: 2 },
        { effect: "unlock_unlockable", unlockableId: "nova9_broadcast_station" },
      ],
      description: "Draw +2 Intrigue cards. Unlocks Nova9 Broadcast Station.",
    },
    flavor: "Somehow the old Nova9 tower is still broadcasting. Learning its secrets could prove valuable.",
    qty: 1,
  },

  {
    id: "activate_neptune_mainframe",
    name: "Activate Neptune Mainframe",
    type: "Challenge (Progression)",
    age: 1,
    surprise: false,
    scrapCost: 5,
    reqAtk: 3,
    reqDef: 0,
    scrapReward: 2,
    atkReward: 0,
    defReward: 0,
    actionReward: 3,
    vp: 6,
    progressionTrack: "neptune",
    ability: {
      // On resolution: add this card to the resolving player's hand as a held token.
      // Also: unlocks "Neptune HQ" building in the Unlockable Deck.
      type: "on_resolve",
      effects: [
        { effect: "add_to_hand_as_token" },
        { effect: "unlock_unlockable", unlockableId: "neptune_hq" },
      ],
      description: "On resolution, add to hand. Unlocks Neptune HQ building.",
    },
    flavor: "The Neptune Relay mainframe still has access to live recon drones out in the Ashlands.",
    qty: 1,
  },
];


// ─── EVENTS ───────────────────────────────────────────────────────────────────
// Events affect all players simultaneously when drawn.
// They are not optional. The drawing player resolves them immediately.
// Surprise events: no player may boost Attack or Defense in response.

export const EVENTS = [

  {
    id: "minefield",
    name: "Minefield",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 4,
    reqDef: 0,
    vp: 3,
    ability: {
      // Persistent blocking event: no cards may be drawn from the Exploration deck
      // until this event is resolved by any player meeting the Attack requirement.
      // The event stays face-up in play until someone resolves it.
      // Once resolved, the block is lifted and normal Exploration resumes.
      // IMPLEMENTATION NOTE: set gameState.globalFlags.explorationBlocked = true.
      // Clear when resolved.
      type: "persistent_event",
      effect: "block_exploration",
      resolveCondition: { reqAtk: 4 },
      onResolve: { effect: "clear_flag", flag: "explorationBlocked" },
      description: "No cards may be drawn from the Exploration deck until this Event is resolved. Cannot boost.",
    },
    flavor: "Who knows if it was the marauders or leftover from the old world.",
    qty: 1,
  },

  {
    id: "marauder_ambush",
    name: "Marauder Ambush",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 3,
    reqDef: 0,
    vp: 3,
    ability: {
      // All players must resolve this event individually.
      // Each player checks whether they meet the Attack requirement (3 Attack).
      // If they meet it: no penalty.
      // If they do not: they lose 5 Scrap (minimum 0).
      // No boosting allowed (Surprise type).
      // Resolved in turn order starting from the drawing player.
      type: "all_players",
      perPlayer: {
        checkRequirement: { reqAtk: 3 },
        onFail: { effect: "lose_scrap", amount: 5, minimum: 0 },
      },
      description: "All players must resolve. If unable to meet Attack requirement, lose 5 Scrap. Cannot boost.",
    },
    flavor: "I've never seen marauders this organized... — Lt. Tusk",
    qty: 1,
  },

  {
    id: "nova9_broadcast",
    name: "Nova9 Broadcast",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players gain +1 Action on their next turn.
      // The player who drew this card gains +2 Actions on their next turn instead.
      // IMPLEMENTATION NOTE: for each player, add to temporaryBonuses:
      // { turnsRemaining: 1, bonusActions: 1 }
      // For the drawing player: bonusActions: 2.
      type: "all_players",
      allPlayerEffect: { effect: "bonus_actions_next_turn", amount: 1 },
      drawerBonus: { effect: "bonus_actions_next_turn", amount: 2 },
      description: "All players gain +1 Action next turn. Player who drew gains +2 Actions next turn.",
    },
    flavor: "The Nova9 signal warned us of an upcoming storm. We should prepare. — Rita, 1st Engineer",
    qty: 1,
  },

  {
    id: "mountain_cult_extortion",
    name: "Mountain Cult Extortion",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 3,
    reqAtk: 0,
    reqDef: 0,
    vp: 3,
    ability: {
      // All players must pay 3 Scrap.
      // If a player cannot pay (insufficient Scrap), they lose 5 Attack permanently instead.
      // No boosting allowed (Surprise type).
      type: "all_players",
      perPlayer: {
        effect: "pay_or_lose",
        cost: { scrap: 3 },
        onFail: { effect: "lose_atk_permanent", amount: 5, minimum: 0 },
      },
      description: "All players must pay 3 Scrap or lose 5 Attack permanently. Cannot boost.",
    },
    flavor: "The Cult of the Mountain may seem benign, but their preachers are convincing.",
    qty: 1,
  },

  {
    id: "harvest",
    name: "Harvest",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // Simple positive event: all players receive +6 Scrap immediately.
      type: "all_players",
      allPlayerEffect: { effect: "gain_scrap", amount: 6 },
      description: "All players receive +6 Scrap.",
    },
    flavor: "The toil in the gardens is all worth it when it comes time to harvest.",
    qty: 2,
  },

  {
    id: "ash_storm",
    name: "Ash Storm",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players must skip their Exploration Action on their next turn.
      // Exception: players who own a Greenhouse in their settlement are unaffected.
      // IMPLEMENTATION NOTE: for each player without a Greenhouse,
      // set player.skipExploreNextTurn = true.
      type: "all_players",
      perPlayer: {
        effect: "skip_explore_next_turn",
        exemptIf: { hasBuilding: "greenhouse" },
      },
      description: "All players skip their Exploration Action next turn. Greenhouse owners unaffected.",
    },
    flavor: "A particularly severe ash storm rolls through the Ashlands.",
    qty: 1,
  },

  {
    id: "drifter_intelligence",
    name: "Drifter Intelligence",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players reveal the top 2 cards of the Exploration deck.
      // Each player may return them in any order (each player for their own view).
      // In practice (single shared deck): the active player sees the top 2 cards
      // and returns them in any order, then all players are informed of the results.
      type: "all_players",
      allPlayerEffect: { effect: "peek_explore_deck", peekCount: 2, mayReorder: true },
      description: "All players reveal top 2 Exploration cards and return in any order.",
    },
    flavor: "A Drifter passing through brings unusually reliable information about what's out in the Ash.",
    qty: 1,
  },

  {
    id: "solar_flare",
    name: "Solar Flare",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All instances of Antenna Array, Drone Lab, and Signal Jammers across
      // all players' settlements are disabled until the start of each owner's next turn.
      // This means each player's copies of these buildings recover at the start of their own turn.
      // The buildings provide no passive bonuses or activated abilities while disabled.
      type: "all_players",
      allPlayerEffect: {
        effect: "disable_buildings_by_id",
        buildingIds: ["antenna_array", "drone_lab", "signal_jammers"],
        recoverOn: "owner_turn_start",
      },
      description: "Antenna Array, Drone Lab, and Signal Jammers disabled until each player's next turn.",
    },
    flavor: "A strong solar event disrupts hardwired communications and automated systems.",
    qty: 1,
  },

  {
    id: "scrap_rush",
    name: "Scrap Rush",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players gain +4 Scrap.
      // Players who own a Scavenger's Hut gain +2 additional Scrap (total: +6).
      type: "all_players",
      allPlayerEffect: { effect: "gain_scrap", amount: 4 },
      perPlayerBonus: {
        condition: { hasBuilding: "scavengers_hut" },
        effect: { effect: "gain_scrap", amount: 2 },
      },
      description: "All players gain +4 Scrap. Scavenger's Hut owners gain +2 additional Scrap.",
    },
    flavor: "Word spreads of a particularly rich scavenging site nearby. Everyone is moving on it.",
    qty: 1,
  },

  {
    id: "mountain_cult_sermon",
    name: "Mountain Cult Sermon",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players lose 1 Action on their next turn.
      // Exception: players who have previously completed a Mountain Cult challenge
      // (tracked via player.flags.completedMountainCult) are unaffected.
      type: "all_players",
      perPlayer: {
        effect: "lose_action_next_turn",
        amount: 1,
        exemptIf: { hasFlag: "completedMountainCult" },
      },
      description: "All players lose 1 Action next turn. Unaffected if you completed a Mountain Cult challenge.",
    },
    flavor: "A Mountain Cult preacher draws crowds away from settlement work.",
    qty: 1,
  },

  {
    id: "marauder_territory_war",
    name: "Marauder Territory War",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players draw 1 Exploration card for free (no Action cost).
      // If the drawn card is a Marauder-tagged Challenge, it is discarded without resolving.
      // Cards tagged as Marauder: "negotiate_with_marauders", "infiltrate_marauder_camp",
      // "marauder_skirmish", "raid_marauder_cache", "manipulate_marauders".
      // Non-Marauder cards are resolved normally (costs still apply).
      type: "all_players",
      allPlayerEffect: {
        effect: "draw_explore_free",
        discardIfTagged: "marauder",
      },
      marauderTaggedCards: [
        "negotiate_with_marauders",
        "infiltrate_marauder_camp",
        "marauder_skirmish",
        "raid_marauder_cache",
        "manipulate_marauders",
      ],
      description: "All players draw 1 Exploration card free. Marauder challenges drawn this way are discarded.",
    },
    flavor: "Two marauder bands have gone to war with each other nearby.",
    qty: 1,
  },

  {
    id: "drifter_market",
    name: "Drifter Market",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players may purchase Intrigue cards at 2 Scrap each, up to 2 cards.
      // Each purchase is optional. Players choose how many to buy (0, 1, or 2).
      // Cards come from the top of the Intrigue deck.
      // Normal hand limit (3) applies — players must discard if over limit.
      type: "all_players",
      allPlayerEffect: {
        effect: "buy_intrigue_optional",
        scrapCostPer: 2,
        maxPurchase: 2,
      },
      description: "All players may spend 2 Scrap per Intrigue card, up to 2 cards.",
    },
    flavor: "A rare convergence of Drifter caravans has created a temporary market.",
    qty: 1,
  },

  {
    id: "vanguard_remnant_patrol",
    name: "Vanguard Remnant Patrol",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // Global effect for the remainder of the current round: no raids may be initiated.
      // Set gameState.globalFlags.raidsBlocked = true for this round.
      // Clear at end of round.
      // Additional effect: players who have Lt. Tusk as their leader gain +2 Scrap.
      type: "mixed",
      globalEffect: {
        effect: "set_flag_until_round_end",
        flag: "raidsBlocked",
        value: true,
      },
      perPlayerBonus: {
        condition: { hasLeader: "lt_tusk" },
        effect: { effect: "gain_scrap", amount: 2 },
      },
      description: "No raids may be initiated this round. Lt. Tusk owners gain +2 Scrap.",
    },
    flavor: "A Vanguard Remnant cell moves through the area in force.",
    qty: 1,
  },

  {
    id: "corporate_relic",
    name: "Corporate Relic",
    type: "Event",
    age: 1,
    surprise: false,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 3,
    ability: {
      // Auction mechanic: players bid Scrap in turn order starting from drawing player.
      // Minimum bid: 2 Scrap.
      // Each player may pass or bid higher than the current highest bid.
      // Highest bidder pays their bid and receives 3 VP + 1 Intrigue card.
      // Bid Scrap is removed from the winner's pool (no one else gains it).
      // If all players pass without bidding, no one wins and the event is discarded.
      // IMPLEMENTATION NOTE: requires a bidding UI flow — show current bid,
      // allow each player to bid or pass in order.
      type: "auction",
      minimumBid: 2,
      winner: {
        effects: [
          { effect: "gain_vp", amount: 3 },
          { effect: "draw_intrigue", intrigueDraw: 1 },
        ],
      },
      description: "Players bid Scrap in turn order (min 2). Highest bidder gains 3 VP + 1 Intrigue card.",
    },
    flavor: "A pre-collapse corporate promotional item surfaces in the area.",
    qty: 1,
  },

  {
    id: "disease_scare",
    name: "Disease Scare",
    type: "Event",
    age: 1,
    surprise: true,
    scrapCost: 0,
    reqAtk: 0,
    reqDef: 0,
    vp: 2,
    ability: {
      // All players lose 2 Attack until the start of their next turn (temporary debuff).
      // Exception: players who have Doc Brawlins as their leader OR own a Medic Tent
      // are unaffected.
      // IMPLEMENTATION NOTE: for affected players, add a temporary debuff:
      // { stat: "atk", amount: -2, expiresOn: "owner_turn_start" }
      type: "all_players",
      perPlayer: {
        effect: "temporary_stat_debuff",
        stat: "atk",
        amount: -2,
        expiresOn: "owner_turn_start",
        exemptIf: [
          { hasLeader: "doc_brawlins" },
          { hasBuilding: "medic_tent" },
        ],
      },
      description: "All players lose 2 Attack until their next turn. Doc Brawlins or Medic Tent owners unaffected.",
    },
    flavor: "A minor outbreak moves through the Ashlands. Not the collapse, but disruptive.",
    qty: 1,
  },
];


// ─── INTRIGUE CARDS ───────────────────────────────────────────────────────────
// Players hold up to 3 Intrigue cards. Playing one costs 1 Action unless marked immediate.
// Immediate cards can be played outside the active player's turn in response to a trigger.

export const INTRIGUE_CARDS = [

  {
    id: "sabotage",
    name: "Sabotage",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Requirements: the playing player must have at least 2 Attack.
      // Effect: choose one building in any other player's settlement. That building
      // is disabled until the start of that player's next turn.
      // A disabled building provides no passive bonuses or activated abilities.
      // Recovery: 1 Action + 2 Scrap at start of the owner's next turn (standard disable recovery).
      type: "targeted",
      requirement: { minAtk: 2 },
      target: "opponent_building",
      effect: "disable_building",
      recoveryCost: { action: 1, scrap: 2 },
      recoveryOn: "owner_turn_start",
      description: "Requires 2 Attack. Disable a building of your choice in another player's settlement.",
    },
    flavor: "Most systems these days are fragile, and that's great for us. — Agent Peck",
    qty: 5,
  },

  {
    id: "advanced_software",
    name: "Advanced Software",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: for each Scrap-producing building in the playing player's settlement,
      // gain +2 Scrap. A Scrap-producing building is any building where passiveScrap > 0.
      // This Scrap is gained immediately.
      // No cap — unlike Scrap Yard's passive (which caps at +4), this card has no stated limit.
      type: "self",
      effect: "gain_scrap_per_building",
      scalesOn: "passiveScrap",
      scrapPerBuilding: 2,
      description: "Gain +2 Scrap per Scrap-producing building in your settlement.",
    },
    flavor: "Improving your system subroutines could allow for much greater efficiency.",
    qty: 4,
  },

  {
    id: "training_regimen",
    name: "Training Regimen",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: for each Attack-producing building in the playing player's settlement,
      // gain +2 permanent Attack bonus.
      // An Attack-producing building is any building where passiveAtk > 0.
      // No cap stated — unlike Training Grounds' passive (which caps at +4).
      type: "self",
      effect: "gain_atk_per_building",
      scalesOn: "passiveAtk",
      atkPerBuilding: 2,
      description: "Gain +2 Attack per Attack-producing building in your settlement.",
    },
    flavor: "Your agents are only as good as their training. Who needs fancy equipment when you have skill?",
    qty: 4,
  },

  {
    id: "caravan_ambush",
    name: "Caravan Ambush",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "opponent_initiates_trade",
    vp: 1,
    ability: {
      // Trigger: another player activates the Trading Post ability.
      // Effect: the playing player receives ALL the Scrap from that trade.
      // The trading player receives nothing. The chosen partner receives nothing.
      // The playing player plays this card in response, before the trade resolves.
      type: "reactive",
      trigger: "opponent_activates_trading_post",
      effect: "intercept_trade_scrap",
      description: "IMMEDIATE: When another player initiates a trade action, you receive all the Scrap.",
    },
    flavor: "Anticipating marauder ambushes is easy. Knowing when trained agents will strike is near impossible.",
    qty: 2,
  },

  {
    id: "vulture",
    name: "Vulture",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "opponent_resolves_challenge",
    vp: 1,
    ability: {
      // Trigger: another player successfully resolves an Exploration Challenge.
      // Effect: the playing player steals the entire reward from that resolution.
      // The original resolving player receives nothing (they still pay costs).
      // The Vulture player receives: scrapReward, atkReward, defReward, actionReward, vp.
      // Can only be played in response to Challenge resolution — not Events or Discoveries.
      type: "reactive",
      trigger: "opponent_resolves_challenge",
      effect: "steal_challenge_reward",
      description: "IMMEDIATE: When another player resolves a Challenge, steal the reward.",
    },
    flavor: "Let them do the dangerous work. We'll reap the reward once they're weakened. — Agent G.",
    qty: 3,
  },

  {
    id: "stolen_maps",
    name: "Stolen Maps",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. On that player's next turn, they lose 1 Action.
      // Simultaneously: the playing player gains +2 Actions immediately (this turn).
      // IMPLEMENTATION NOTE: set target.loseActionsNextTurn += 1.
      // Add +2 to current player's actionsLeft.
      type: "targeted_with_self_benefit",
      target: "opponent",
      targetEffect: { effect: "lose_action_next_turn", amount: 1 },
      selfEffect: { effect: "gain_actions_now", amount: 2 },
      description: "Choose a player. On their next turn they lose 1 Action. You gain +2 Actions immediately.",
    },
    flavor: "Good reconnaissance takes time and resources. Stealing the data takes much less.",
    qty: 3,
  },

  {
    id: "infected_hardware",
    name: "Infected Hardware",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. That player's Defense score is reduced by 4
      // until the start of their next turn (temporary debuff).
      // Minimum effective Defense: 0.
      // IMPLEMENTATION NOTE: add { stat: "def", amount: -4, expiresOn: "target_turn_start" }
      // to target.temporaryDebuffs.
      type: "targeted",
      target: "opponent",
      effect: "temporary_stat_debuff",
      stat: "def",
      amount: -4,
      minimum: 0,
      expiresOn: "target_turn_start",
      description: "Choose a player. They lose 4 Defense until their next turn.",
    },
    flavor: "Automated defenses rely solely on software. Corrupting it yields huge advantages.",
    qty: 2,
  },

  {
    id: "diverted_resources",
    name: "Diverted Resources",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. On that player's next turn, when they collect
      // resources, all Scrap generated by their buildings and leader goes to the
      // playing player instead of to the target.
      // The target receives 0 Scrap from their passive income that turn.
      // Only passive income is diverted — Scrap from card rewards is unaffected.
      type: "targeted",
      target: "opponent",
      effect: "divert_passive_scrap_next_turn",
      beneficiary: "self",
      description: "Choose a player. On their next turn you receive all Scrap their buildings and leader generate.",
    },
    flavor: "Convincing them to simply hand over their scrap was the easy part. — Agent Peck",
    qty: 2,
  },

  {
    id: "trapped_road",
    name: "Trapped Road",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "opponent_draws_explore",
    vp: 1,
    ability: {
      // Trigger: another player draws a card from the Exploration deck.
      // Effect: prevent that card from being resolved. The card is discarded.
      // Exception: this card cannot prevent Events — Events resolve regardless.
      // The Action spent by the drawing player is consumed (not refunded).
      type: "reactive",
      trigger: "opponent_draws_exploration_card",
      effect: "prevent_resolution",
      exception: "events_are_immune",
      description: "IMMEDIATE: When another player draws from the Exploration deck, prevent resolution. Not Events.",
    },
    flavor: "Inhibiting movement through the Ashlands is a great way to set your enemies back.",
    qty: 2,
  },

  {
    id: "dead_drop",
    name: "Dead Drop",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: draw 2 Intrigue cards from the deck.
      // Then discard 1 of any card in hand (player's choice — can be either new card or existing).
      // Additionally: the hand limit for the playing player increases to 4 until the start
      // of their next turn. (Standard limit is 3.)
      // IMPLEMENTATION NOTE: set player.handLimit = 4 temporarily.
      // Reset at start of next turn.
      type: "self",
      effects: [
        { effect: "draw_intrigue", intrigueDraw: 2 },
        { effect: "discard_intrigue", discardCount: 1, playerChoice: true },
        { effect: "temporary_hand_limit", limit: 4, expiresOn: "self_turn_start" },
      ],
      description: "Draw 2 Intrigue cards. Discard 1. Hand limit increases to 4 until your next turn.",
    },
    flavor: "Someone left something valuable where only the right people would find it.",
    qty: 3,
  },

  {
    id: "false_flag",
    name: "False Flag",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose two opponents (distinct players).
      // Each of those players must either spend 2 Scrap or lose 1 Attack permanently.
      // Each player makes their choice independently.
      // Both effects are applied simultaneously.
      type: "multi_targeted",
      targetCount: 2,
      perTarget: {
        effect: "pay_or_lose",
        cost: { scrap: 2 },
        onFail: { effect: "lose_atk_permanent", amount: 1, minimum: 0 },
      },
      description: "Choose two players. Each must spend 2 Scrap or lose 1 Attack until their next turn.",
    },
    flavor: "Making your enemies fight each other is always preferable to fighting them yourself.",
    qty: 2,
  },

  {
    id: "emergency_protocols",
    name: "Emergency Protocols",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "raid_declared_against_self",
    vp: 1,
    ability: {
      // Trigger: another player declares a raid targeting the card holder.
      // Effect: the attacker must choose — either spend 3 Scrap to continue the raid,
      // or abandon the raid (losing the Action they spent to initiate it).
      // If they abandon, no raid resolution occurs.
      // If they continue (paying 3 Scrap), the raid resolves normally.
      type: "reactive",
      trigger: "raid_declared_against_self",
      effect: "force_attacker_choice",
      options: [
        { label: "Spend 3 Scrap to continue", cost: { scrap: 3 }, outcome: "raid_continues" },
        { label: "Abandon raid (lose Action)", cost: {}, outcome: "raid_cancelled" },
      ],
      description: "IMMEDIATE when raid declared against you. Attacker must spend 3 Scrap to continue or abandon.",
    },
    flavor: "Sometimes the best defense is making your settlement look like a terrible target.",
    qty: 3,
  },

  {
    id: "scrap_fence",
    name: "Scrap Fence",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: gain 5 Scrap immediately.
      // This card cannot be countered or negated by any other card or building ability.
      // (e.g., Trapped Road cannot prevent this card's effect from resolving.)
      // IMPLEMENTATION NOTE: mark this card's effect as uncounterable during resolution.
      type: "self",
      effect: "gain_scrap",
      amount: 5,
      uncounterable: true,
      description: "Gain 5 Scrap. Cannot be countered or negated by any card or building ability.",
    },
    flavor: "Not everything that passes through your settlement needs to be declared.",
    qty: 2,
  },

  {
    id: "borrowed_time",
    name: "Borrowed Time",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "event_drawn",
    vp: 1,
    ability: {
      // Trigger: any Event card is drawn this round.
      // Effect: the playing player is completely unaffected by that Event's effects.
      // This applies to one Event per play — does not grant immunity for the whole round.
      // Other players still resolve the Event normally.
      type: "reactive",
      trigger: "event_drawn",
      effect: "grant_event_immunity",
      scope: "one_event",
      description: "IMMEDIATE: Prevent any single Event card effect from applying to you this round.",
    },
    flavor: "Delaying the inevitable is still delaying it.",
    qty: 2,
  },

  {
    id: "inside_man",
    name: "Inside Man",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. Until the start of the playing player's next turn,
      // whenever that opponent draws any card (Exploration or Intrigue), the playing player
      // sees the drawn card before it is resolved or added to hand.
      // The opponent is not informed that this is happening.
      // IMPLEMENTATION NOTE: set target.isBeingWatched = { watcherId: playerId }.
      // During any draw action for the target, display the card to the watcher first.
      type: "targeted",
      target: "opponent",
      effect: "watch_opponent_draws",
      duration: { expiresOn: "self_turn_start" },
      description: "Choose a player. Until your next turn, see every card they draw before they resolve it.",
    },
    flavor: "Having someone on the inside changes everything.",
    qty: 2,
  },

  {
    id: "misinformation",
    name: "Misinformation",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. The next Exploration card that player draws
      // is treated as Surprise type, regardless of its actual type.
      // This means they cannot boost Attack or Defense before resolving it.
      // IMPLEMENTATION NOTE: set target.nextExploreIsSurprise = true.
      // Clear this flag after their next Exploration draw.
      type: "targeted",
      target: "opponent",
      effect: "force_next_explore_as_surprise",
      description: "Choose a player. They must resolve their next Exploration card as Surprise type.",
    },
    flavor: "Bad intelligence is almost as useful as good intelligence.",
    qty: 2,
  },

  {
    id: "salvage_rights",
    name: "Salvage Rights",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "opponent_resolves_challenge",
    vp: 1,
    ability: {
      // Trigger: another player completes an Exploration Challenge.
      // Effect: the playing player claims half of the Scrap reward from that resolution,
      // rounded down. The resolving player still receives their half.
      // Example: challenge has scrapReward 6. Playing player gets 3, resolving player gets 3.
      // Only applies to Scrap reward — VP and other rewards go to the resolving player.
      type: "reactive",
      trigger: "opponent_resolves_challenge",
      effect: "claim_half_scrap_reward",
      rounding: "down",
      description: "IMMEDIATE: When another player completes a Challenge, claim half the Scrap reward (rounded down).",
    },
    flavor: "First come first served has always been the law of the Ashlands.",
    qty: 2,
  },

  {
    id: "blackout",
    name: "Blackout",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. Until the start of their next turn,
      // all passive bonuses from their buildings do not apply.
      // This means: passiveScrap, passiveAtk, passDef, passActions from buildings
      // are all set to 0 for resource collection.
      // Leader passives are NOT affected — only buildings.
      // Activated abilities are also disabled.
      type: "targeted",
      target: "opponent",
      effect: "disable_all_building_passives",
      duration: { expiresOn: "target_turn_start" },
      scope: "buildings_only",
      description: "Choose a player. Their building passive bonuses do not apply until the start of their next turn.",
    },
    flavor: "Cutting power to a settlement's systems at the right moment can be decisive.",
    qty: 2,
  },

  {
    id: "decoy_caravan",
    name: "Decoy Caravan",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "self_targeted_by_raid",
    vp: 1,
    ability: {
      // Trigger: the card holder is targeted by a raid.
      // Effect: redirect the raid to any other player the card holder chooses.
      // The new target must be a different player — cannot redirect back to attacker.
      // Raid resolution proceeds normally against the new target.
      // The playing player is no longer involved in the raid.
      type: "reactive",
      trigger: "self_targeted_by_raid",
      effect: "redirect_raid",
      newTargetConstraint: "not_attacker",
      description: "IMMEDIATE when targeted by a raid. Redirect the raid to a player of your choice.",
    },
    flavor: "Sending out a false caravan is a classic misdirection technique.",
    qty: 2,
  },

  {
    id: "requisition",
    name: "Requisition",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. Randomly take 1 Intrigue card from their hand.
      // If their hand is empty (0 cards): gain 3 Scrap instead.
      type: "targeted",
      target: "opponent",
      effects: [
        {
          condition: "target_has_intrigue_cards",
          effect: "steal_random_intrigue",
        },
        {
          condition: "target_has_no_intrigue_cards",
          effect: "gain_scrap",
          amount: 3,
        },
      ],
      description: "Steal 1 Intrigue card from a player of your choice. If their hand is empty, gain 3 Scrap instead.",
    },
    flavor: "In the Ashlands, possession is ten tenths of the law.",
    qty: 2,
  },

  {
    id: "forced_march",
    name: "Forced March",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: gain +2 Actions immediately (this turn).
      // Trade-off: lose 2 Attack until the start of your next turn (temporary debuff).
      // The Action gain and Attack loss both apply together — cannot take one without the other.
      type: "self",
      effects: [
        { effect: "gain_actions_now", amount: 2 },
        { effect: "temporary_stat_debuff", stat: "atk", amount: -2, expiresOn: "self_turn_start" },
      ],
      description: "Gain 2 additional Actions this turn. Lose 2 Attack until your next turn.",
    },
    flavor: "Sometimes you need results faster than the situation allows.",
    qty: 2,
  },

  {
    id: "data_spike",
    name: "Data Spike",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: choose one opponent. The next building they construct costs 3 additional Scrap.
      // This surcharge applies once — to the very next building purchase that player makes.
      // After that purchase (or if they skip purchasing for multiple turns), the effect expires.
      // IMPLEMENTATION NOTE: set target.nextBuildingScrapSurcharge = 3.
      // Apply during their next build action, then clear.
      type: "targeted",
      target: "opponent",
      effect: "surcharge_next_build",
      scrapSurcharge: 3,
      description: "Choose a player. Their next building construction costs 3 additional Scrap.",
    },
    flavor: "Injecting corrupted data into an enemy's systems buys valuable time.",
    qty: 2,
  },

  {
    id: "calculated_retreat",
    name: "Calculated Retreat",
    type: "Intrigue",
    age: 1,
    immediate: true,
    trigger: "self_fails_challenge",
    vp: 1,
    ability: {
      // Trigger: the card holder fails to resolve an Exploration Challenge
      // (either cannot meet requirements or chooses not to).
      // Effect: the failure penalty listed on that challenge card does not apply.
      // The card is also not left as an Incomplete Challenge — it is discarded normally.
      // The playing player still loses the Action they spent to attempt the challenge.
      // This card is consumed on play (discarded after use).
      type: "reactive",
      trigger: "self_fails_challenge",
      effect: "negate_failure_penalty_and_discard_challenge",
      description: "IMMEDIATE when you fail a Challenge. Do not suffer the failure penalty.",
    },
    flavor: "Knowing when not to fight is its own kind of victory.",
    qty: 2,
  },

  {
    id: "whisper_network",
    name: "Whisper Network",
    type: "Intrigue",
    age: 1,
    immediate: false,
    vp: 1,
    ability: {
      // Effect: look at the top 4 cards of the Exploration deck.
      // Return them in any order you choose.
      // Then: draw 1 Intrigue card.
      // All effects happen in sequence as described.
      type: "self",
      effects: [
        { effect: "peek_and_reorder", deckType: "exploration", peekCount: 4 },
        { effect: "draw_intrigue", intrigueDraw: 1 },
      ],
      description: "Look at top 4 Exploration cards. Return in any order. Draw 1 Intrigue card.",
    },
    flavor: "Information moves faster through the Ashlands than most people realize.",
    qty: 2,
  },
];


// ─── NARRATIVE CHAINS ─────────────────────────────────────────────────────────
// Multi-beat story sequences embedded in the Exploration deck.
// Each beat is a separate card. Completing a beat draws the next.
// Final beat rewards come from the Unlockable Deck.
// Narrative chain cards are shuffled into the Exploration deck normally.
// Beat 1 cards are the only ones in the starting deck — subsequent beats are drawn
// when the prior beat is resolved.

export const NARRATIVE_CHAINS = [

  {
    id: "the_old_lieutenant",
    name: "The Old Lieutenant",
    finalReward: "Lt. Tusk leader card + Vanguard Outpost unique building",
    beats: [
      {
        beat: 1,
        name: "Vanguard Patrol",
        inStartingDeck: true,
        scrapCost: 2,
        reqAtk: 4,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 2,
          description: "Make contact without triggering a confrontation. Draw Beat 2.",
        },
        flavor: "Your scouts report a small disciplined group moving with military precision. Unlike marauders, they haven't attacked — but they're sizing up settlements.",
      },
      {
        beat: 2,
        name: "Tusk's Terms",
        inStartingDeck: false,
        scrapCost: 4,
        reqAtk: 0,
        reqDef: 5,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 3,
          description: "Demonstrate your settlement's resources and organization. Draw Beat 3.",
        },
        flavor: "The group's leader is an old man in faded Vanguard gear. He introduces himself as Tusk. Suspicious and proud, a handful of aging veterans watch silently behind him.",
      },
      {
        beat: 3,
        name: "Old Soldiers",
        inStartingDeck: false,
        scrapCost: 5,
        reqAtk: 6,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "chain_complete",
          rewards: [
            { effect: "gain_leader_card", leaderId: "lt_tusk" },
            { effect: "unlock_unique_building", buildingId: "vanguard_outpost" },
          ],
          description: "Formally integrate Tusk and his veterans. Gain Lt. Tusk Leader card. Unlocks Vanguard Outpost.",
        },
        flavor: "Tusk has seen enough. These men haven't been soldiers for years — they've just never learned to be anything else. They ask to stay.",
      },
    ],
  },

  {
    id: "the_engineers_daughter",
    name: "The Engineer's Daughter",
    finalReward: "Rita leader card + Rita's Workshop unique building",
    beats: [
      {
        beat: 1,
        name: "Distress Signal",
        inStartingDeck: true,
        scrapCost: 2,
        reqAtk: 5,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 2,
          description: "Reach and secure the substation. Draw Beat 2.",
        },
        flavor: "A hardwired distress signal pulses from an abandoned SOLUX substation. It's automated — but the facility could be valuable. Opportunistic scavengers are already moving.",
      },
      {
        beat: 2,
        name: "Squatter's Rights",
        inStartingDeck: false,
        scrapCost: 5,
        reqAtk: 0,
        reqDef: 4,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 3,
          description: "Convince her your settlement is worth talking to. Draw Beat 3.",
        },
        flavor: "The substation isn't empty. A young woman has been living there for months, methodically restoring its systems. She's hostile and has booby-trapped the approaches.",
      },
      {
        beat: 3,
        name: "Her Mother's Tools",
        inStartingDeck: false,
        scrapCost: 6,
        reqAtk: 0,
        reqDef: 6,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "chain_complete",
          rewards: [
            { effect: "gain_leader_card", leaderId: "rita" },
            { effect: "unlock_unique_building", buildingId: "ritas_workshop" },
          ],
          description: "Establish a formal arrangement that meets her terms. Gain Rita Leader card. Unlocks Rita's Workshop.",
        },
        flavor: "Rita's knowledge of SOLUX systems goes beyond salvage expertise. Her arrangement is strictly professional — resources and protection in exchange for her skills.",
      },
    ],
  },

  {
    id: "the_information_broker",
    name: "The Information Broker",
    finalReward: "Neptune Relay Station unique building + 2 Intrigue cards",
    beats: [
      {
        beat: 1,
        name: "Stranger at the Gate",
        inStartingDeck: true,
        scrapCost: 3,
        reqAtk: 0,
        reqDef: 4,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effects: [
            { effect: "draw_next_beat", nextBeat: 2 },
            { effect: "peek_and_reorder", deckType: "exploration", peekCount: 3 },
          ],
          description: "Open negotiations and assess what he's carrying. Draw Beat 2. Reveal top 3 Exploration cards, return in any order.",
        },
        flavor: "A quiet figure in a coat covered in hand-drawn notations arrives asking to trade. He introduces himself only as Fold. His DataPaks look legitimate. His evasiveness does not.",
      },
      {
        beat: 2,
        name: "The Price of Good Maps",
        inStartingDeck: false,
        scrapCost: 8,
        reqAtk: 0,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "chain_complete",
          rewards: [
            { effect: "draw_intrigue", intrigueDraw: 2 },
            { effect: "unlock_unique_building", buildingId: "neptune_relay_station" },
          ],
          description: "Purchase Fold's full intelligence package. Gain 2 Intrigue cards. Unlocks Neptune Relay Station.",
        },
        flavor: "Fold's intelligence is extraordinary. Maps, cache locations, threat patterns. He knows exactly what it's worth. So do you.",
      },
    ],
  },

  {
    id: "the_wandering_medic",
    name: "The Wandering Medic",
    finalReward: "Brawlins' Circuit permanent bonus (+1 Attack recovery per round)",
    beats: [
      {
        beat: 1,
        name: "Field Surgery",
        inStartingDeck: true,
        scrapCost: 3,
        reqAtk: 2,
        reqDef: 4,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 2,
          description: "Send a proper envoy and make formal contact. Draw Beat 2.",
        },
        flavor: "Word reaches your settlement of a doctor working out of a makeshift clinic nearby. He treats anyone regardless of faction. A scout returns patched up — he asked for nothing in return.",
      },
      {
        beat: 2,
        name: "Brawlins' Price",
        inStartingDeck: false,
        scrapCost: 6,
        reqAtk: 0,
        reqDef: 5,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "chain_complete",
          rewards: [
            {
              effect: "gain_permanent_bonus",
              bonusId: "brawlins_circuit",
              description: "Permanently recover +1 Attack at the start of each round.",
              mechanic: { trigger: "round_start", effect: "recover_atk", amount: 1 },
            },
          ],
          description: "Establish a medical supply arrangement. Gain Brawlins' Circuit — permanently recover +1 Attack each round.",
        },
        flavor: "Brawlins won't commit permanently — he's seen too many settlements try to own their doctor. Regular visits in exchange for supplies and protection. Strictly transactional.",
      },
    ],
  },

  {
    id: "the_demolitions_contractor",
    name: "The Demolitions Contractor",
    finalReward: "6 Scrap + Benny's Schematics unique Intrigue card",
    beats: [
      {
        beat: 1,
        name: "Controlled Demolition",
        inStartingDeck: true,
        scrapCost: 4,
        reqAtk: 0,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effects: [
            { effect: "draw_next_beat", nextBeat: 2 },
            { effect: "gain_scrap", amount: 3 },
          ],
          description: "Hire him and secure the perimeter. Draw Beat 2. Gain 3 Scrap from initial salvage.",
        },
        flavor: "An enthusiastic stranger offers to clear a collapsed structure blocking a supply cache. He produces references — mostly testimonials scrawled on paper — and seems delighted by the prospect.",
      },
      {
        beat: 2,
        name: "Benny's Special",
        inStartingDeck: false,
        scrapCost: 3,
        reqAtk: 6,
        reqDef: 0,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "chain_complete",
          rewards: [
            { effect: "gain_scrap", amount: 6 },
            {
              effect: "gain_unique_intrigue",
              cardId: "bennys_schematics",
              name: "Benny's Schematics",
              description: "When targeted by a raid, reduce attacker's Attack by 5 until their next turn.",
              immediate: true,
              trigger: "self_targeted_by_raid",
            },
          ],
          description: "Secure the cache site. Gain 6 Scrap. Gain Benny's Schematics unique Intrigue card.",
        },
        flavor: "The demolition works spectacularly. Perhaps more than necessary. The cache is accessible and Benny is already pointing out three other structures. The noise has drawn attention.",
      },
    ],
  },

  {
    id: "the_faith_and_the_factory",
    name: "The Faith and the Factory",
    finalReward: "Varies by player choice (see Beat 2 branches)",
    beats: [
      {
        beat: 1,
        name: "Soluxian Delegation",
        inStartingDeck: true,
        scrapCost: 4,
        reqAtk: 0,
        reqDef: 5,
        vp: 0,
        surprise: false,
        ability: {
          type: "narrative_beat",
          effect: "draw_next_beat",
          nextBeat: 2,
          description: "Host them appropriately and agree to a meeting. Draw Beat 2.",
        },
        flavor: "A formal delegation from a Soluxian community arrives bearing trade goods and a carefully worded invitation. They are polite, well-equipped, and clearly assessing your strength.",
      },
      {
        beat: 2,
        name: "Daine's Offer",
        inStartingDeck: false,
        scrapCost: 0,
        reqAtk: 0,
        reqDef: 0,
        vp: 0,
        surprise: false,
        branches: true,
        ability: {
          type: "narrative_beat_branching",
          effect: "chain_complete",
          options: [
            {
              label: "A — Accept",
              requirements: { scrap: 3 },
              rewards: [
                { effect: "gain_scrap_per_turn", amount: 3, permanent: true },
                { effect: "set_global_flag", flag: "soluxianCardsAreSurprise", value: true },
              ],
              description: "Spend 3 Scrap. Gain +3 Scrap/turn permanently. Soluxian faction cards become hostile (Surprise type).",
            },
            {
              label: "B — Decline",
              requirements: { reqDef: 6 },
              rewards: [
                { effect: "draw_intrigue", intrigueDraw: 2 },
                { effect: "gain_vp", amount: 3 },
              ],
              description: "Requires 6 Defense. Draw 2 Intrigue cards + gain 3 VP.",
            },
            {
              label: "C — Raid",
              requirements: { reqAtk: 8, scrap: 4 },
              rewards: [
                { effect: "gain_scrap", amount: 8 },
                { effect: "unlock_unique_building", buildingId: "solux_manufacturing_core" },
              ],
              description: "Requires 8 Attack + 4 Scrap. Gain 8 Scrap + unlock SOLUX Manufacturing Core building.",
            },
          ],
          description: "Choose: Accept (A), Decline (B), or Raid (C). Each path has different requirements and rewards.",
        },
        flavor: "Overseer Daine is sharp and pragmatic. Her proposed arrangement benefits both settlements but comes with implicit Soluxian alignment. Choose carefully.",
      },
    ],
  },
];


// ─── CONVENIENCE EXPORTS ──────────────────────────────────────────────────────
// Flattened and tagged collections for deck building.

export const ALL_EXPLORATION_CARDS = [
  ...CHALLENGES,
  ...PROGRESSION_CHALLENGES,
  ...EVENTS,
  // Narrative Beat 1 cards are included here — they enter the starting Exploration deck.
  // Beats 2+ are kept out of the deck and drawn procedurally when prior beats complete.
  ...NARRATIVE_CHAINS.flatMap(chain =>
    chain.beats.filter(b => b.inStartingDeck).map(b => ({
      id: `${chain.id}_beat_${b.beat}`,
      name: b.name,
      type: "Challenge (Narrative)",
      chainId: chain.id,
      chainName: chain.name,
      beat: b.beat,
      age: 1,
      surprise: b.surprise,
      scrapCost: b.scrapCost,
      reqAtk: b.reqAtk,
      reqDef: b.reqDef,
      scrapReward: 0,
      atkReward: 0,
      defReward: 0,
      actionReward: 0,
      vp: b.vp,
      ability: b.ability,
      flavor: b.flavor,
    }))
  ),
];

export const ALL_PURCHASABLE_BUILDINGS = BUILDINGS.filter(b => b.type === "Building");
export const STARTER_BUILDINGS = BUILDINGS.filter(b => b.type === "Starter");
export const STARTER_LEADERS = LEADERS.filter(l => l.type === "Leader (Starter)");
export const DISCOVERABLE_LEADERS = LEADERS.filter(l => l.type === "Leader");

// Deck qty helpers — returns an array with each card repeated by its qty value.
export function expandByQty(cards) {
  return cards.flatMap(card =>
    Array.from({ length: card.qty || 1 }, (_, i) => ({
      ...card,
      uid: `${card.id}_${i}`,
    }))
  );
}
