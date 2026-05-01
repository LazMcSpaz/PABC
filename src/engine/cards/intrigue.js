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
      recoveryOn: "owner_turn_end",
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
