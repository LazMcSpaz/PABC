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
        recoverOn: "owner_turn_end",
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
      // { stat: "atk", amount: -2, expiresOn: "owner_turn_end" }
      type: "all_players",
      perPlayer: {
        effect: "temporary_stat_debuff",
        stat: "atk",
        amount: -2,
        expiresOn: "owner_turn_end",
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
