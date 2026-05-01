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
