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
    passDef: 1,
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
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 4,
    ability: {
      // Passive scaling, evaluated during resource collection each turn.
      // Scrap Yard contributes +1 base Scrap (passiveScrap above) and an
      // additional +1 per Scrap-producing building in the player's
      // settlement — including itself. No hard cap (the 5-slot
      // settlement limit is the natural ceiling).
      type: "passive_scaling",
      trigger: "collect_resources",
      scalesOn: "passiveScrap",
      bonusPerBuilding: 1,
      bonusStat: "scrap",
      description: "+1 Scrap base, plus +1 Scrap per Scrap-producing building in your settlement (Scrap Yard counts itself).",
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
    passDef: 1,
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
      // Grants +1 Attack per Attack-producing building in the player's
      // settlement. An Attack-producing building is any building where
      // passiveAtk > 0. No hard cap (the 5-slot settlement limit is the
      // natural ceiling).
      type: "passive_scaling",
      trigger: "collect_resources",
      scalesOn: "passiveAtk",
      bonusPerBuilding: 1,
      bonusStat: "atk",
      description: "Each turn, gain +1 Attack per Attack-producing building in your settlement.",
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
    passDef: 1,
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
