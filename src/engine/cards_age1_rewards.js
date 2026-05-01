// src/engine/cards_age1_rewards.js
// Ashland Conquest — Age 1 Reward Cards
//
// These cards are never in the standard Building Row or starting decks.
// They are earned exclusively through:
//   - Completing Narrative Chains (unique buildings + narrative leaders)
//   - Resolving Progression Challenges (progression unique buildings)
//
// All cards here live in the Unlockable Deck until earned.
// Import and merge into your Unlockable Deck array in gameState.js.
//
// Narrative leaders (lt_tusk, rita, doc_brawlins) follow the same leader
// schema as LEADERS in cards.js. They are situationally stronger than
// purchasable leaders — powerful in the right build, mediocre otherwise.
//
// See README.md > Card Data Reference for full schema documentation.


// ─── NARRATIVE CHAIN UNIQUE BUILDINGS ────────────────────────────────────────
// Earned by completing a Narrative Chain's final beat.
// Do not consume a building slot unless noted.
// Each is unique — only one copy exists.

export const NARRATIVE_UNIQUE_BUILDINGS = [

  {
    id: "vanguard_outpost",
    name: "Vanguard Outpost",
    type: "Unique Building",
    age: 1,
    source: "narrative_chain",
    chainId: "the_old_lieutenant",
    unique: true,
    scrapCost: 0,       // Free — earned as reward, not purchased
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 3,         // Significant passive Defense reflecting Tusk's veterans on watch
    passActions: 0,
    vp: 5,
    ability: {
      // Passive: the Vanguard Outpost cannot be targeted by the Destroy Building
      // raid outcome. Attackers may still raid the settlement, but must choose
      // a different outcome (Steal Intrigue or Disable Leader).
      // If it is the only building in the settlement, Destroy Building raids
      // against this player automatically become Disable Leader instead.
      // Additionally: once per round (not per turn), when this player is raided,
      // they may force the attacker to re-declare their raid outcome.
      // The attacker cannot choose the same outcome twice in the same raid.
      type: "compound",
      abilities: [
        {
          type: "passive_immunity",
          immuneTo: "raid_outcome_destroy_building",
          fallback: "disable_leader",
          description: "Cannot be targeted by Destroy Building raid outcome.",
        },
        {
          type: "reactive",
          trigger: "raid_declared_against_owner",
          optional: true,
          maxPerRound: 1,
          effect: "force_attacker_redeclare_outcome",
          constraint: "cannot_repeat_same_outcome",
          description: "Once per round when raided, force attacker to redeclare raid outcome. Cannot repeat same choice.",
        },
      ],
      description: "Cannot be destroyed by raids. Once per round when raided, force the attacker to redeclare their raid outcome — they cannot choose the same outcome twice.",
    },
    flavor: "Tusk's veterans don't need orders. They've held positions like this for thirty years.",
    qty: 1,
  },

  {
    id: "ritas_workshop",
    name: "Rita's Workshop",
    type: "Unique Building",
    age: 1,
    source: "narrative_chain",
    chainId: "the_engineers_daughter",
    unique: true,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 5,
    ability: {
      // Passive: all upgrade costs (Scrap + Attack) for the owning player are
      // reduced by 2 Scrap. Minimum cost after reduction: 0. Attack cost is unaffected.
      // Activated: once per turn, the player may repair a disabled building without
      // spending an Action. They still pay the Scrap cost (2 Scrap standard recovery cost).
      // This does not stack with other free-repair effects — it only waives the Action.
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "owner_purchases_upgrade",
          effect: "reduce_upgrade_scrap_cost",
          reduction: 2,
          minimum: 0,
          description: "All upgrade Scrap costs reduced by 2.",
        },
        {
          type: "activated",
          trigger: "free",
          effect: "repair_disabled_building_no_action",
          scrapCost: 2,
          maxPerTurn: 1,
          description: "Once per turn, repair a disabled building without spending an Action (still costs 2 Scrap).",
        },
      ],
      description: "All upgrade Scrap costs reduced by 2. Once per turn, repair a disabled building without spending an Action (still costs 2 Scrap).",
    },
    flavor: "Half the tools in here don't have names anymore. Rita calls them by what they do.",
    qty: 1,
  },

  {
    id: "neptune_relay_station",
    name: "Neptune Relay Station",
    type: "Unique Building",
    age: 1,
    source: "narrative_chain",
    chainId: "the_information_broker",
    unique: true,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 5,
    ability: {
      // Passive: at the start of the owning player's turn (during resource collection),
      // they draw 1 Intrigue card for free. No Action or Scrap cost.
      // Normal hand limit applies — if already at 3, must discard before receiving.
      // Activated: once per turn, the player may look at the top 2 cards of the
      // Intrigue deck (not draw — just look) and return them in any order.
      // This represents Fold's network feeding the player curated intelligence.
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "collect_resources",
          effect: "draw_intrigue",
          intrigueDraw: 1,
          description: "Draw 1 Intrigue card at the start of your turn for free.",
        },
        {
          type: "activated",
          trigger: "free",
          effect: "peek_and_reorder",
          deckType: "intrigue",
          peekCount: 2,
          maxPerTurn: 1,
          description: "Once per turn, look at the top 2 Intrigue deck cards and return them in any order.",
        },
      ],
      description: "Draw 1 Intrigue card for free at the start of each turn. Once per turn, look at the top 2 cards of the Intrigue deck and return in any order.",
    },
    flavor: "Most of what Fold sends is fragments. Enough fragments and you start to see the shape of things.",
    qty: 1,
  },

  {
    id: "solux_manufacturing_core",
    name: "SOLUX Manufacturing Core",
    type: "Unique Building",
    age: 1,
    source: "narrative_chain",
    chainId: "the_faith_and_the_factory",
    chainBranch: "C",
    unique: true,
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 2,
    passiveAtk: 1,
    passDef: 0,
    passActions: 0,
    vp: 5,
    ability: {
      // Activated: once per turn, the player may spend any combination of
      // Scrap and Attack (minimum total: 4) to produce one of the following:
      //   - Gain VP equal to half the amount spent, rounded down (min 2 VP)
      //   - Gain Scrap equal to double the Attack spent (Attack is not consumed —
      //     the player must have the Attack score, but only Scrap is paid)
      //   - Draw 1 Intrigue card + gain 2 Scrap
      // Only one option may be chosen per activation.
      // This represents the SOLUX factory's ability to convert raw resources
      // into whatever the settlement needs most.
      // IMPLEMENTATION NOTE: show a choice modal with the three options when activated.
      // Validate the minimum spend before allowing activation.
      type: "activated",
      trigger: "spend_resources",
      minimumSpend: 4,
      spendTypes: ["scrap", "atk_score_check"],
      maxPerTurn: 1,
      options: [
        {
          label: "Convert to VP",
          effect: "gain_vp",
          formula: "floor(amountSpent / 2)",
          minimum: 2,
          description: "Gain VP equal to half the Scrap spent (rounded down, min 2).",
        },
        {
          label: "Convert Attack to Scrap",
          effect: "gain_scrap",
          formula: "atkSpent * 2",
          note: "Attack score is checked, not consumed. Only Scrap is paid.",
          description: "Gain Scrap equal to double your Attack score contribution. Only Scrap is paid.",
        },
        {
          label: "Intelligence Run",
          effect: "compound",
          effects: [
            { effect: "draw_intrigue", intrigueDraw: 1 },
            { effect: "gain_scrap", amount: 2 },
          ],
          fixedCost: { scrap: 4 },
          description: "Spend 4 Scrap to draw 1 Intrigue card and gain 2 Scrap.",
        },
      ],
      description: "Once per turn, spend at least 4 Scrap to choose one: gain VP (half spent, rounded down) / gain double Scrap from Attack contribution / draw 1 Intrigue + gain 2 Scrap.",
    },
    flavor: "The Soluxians built this place to make everything. You intend to hold them to that.",
    qty: 1,
  },

];


// ─── PROGRESSION UNIQUE BUILDINGS ────────────────────────────────────────────
// Unlocked when a Progression Challenge is resolved.
// Must still be constructed (costs Scrap/Attack) — they don't auto-enter the settlement.
// They are pulled from the Unlockable Deck and added to the Building Row immediately
// when their associated Progression Challenge is resolved, replacing a normal row card.

export const PROGRESSION_UNIQUE_BUILDINGS = [

  {
    id: "servotech_assembly",
    name: "ServoCo Assembly",
    type: "Unique Building",
    age: 1,
    source: "progression_challenge",
    progressionTrack: "servotech",
    unique: true,
    scrapCost: 6,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 6,
    ability: {
      // Passive: the owning player's building purchases cost 1 less Scrap (minimum 0).
      // This applies to all purchasable buildings — standard Age 1, Age 2, and Age 3.
      // Does not apply to upgrade costs (use Rita's Workshop for that).
      // Activated: once per round (not per turn), the player may construct one
      // building from the Building Row without spending an Action.
      // They still pay the full Scrap and Attack costs.
      // The free-build limit is once per round — even if the player has multiple
      // ServoCo Assembly copies (which cannot happen — unique), it would still be once.
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "owner_purchases_building",
          effect: "reduce_building_scrap_cost",
          reduction: 1,
          minimum: 0,
          appliesTo: "all_buildings",
          excludes: "upgrades",
          description: "All building purchases cost 1 less Scrap.",
        },
        {
          type: "activated",
          trigger: "free",
          effect: "build_without_action",
          maxPerRound: 1,
          note: "Full Scrap and Attack costs still apply.",
          description: "Once per round, construct one building from the Building Row without spending an Action.",
        },
      ],
      description: "All building purchases cost 1 less Scrap. Once per round, construct one building from the Building Row without spending an Action (costs still apply).",
    },
    flavor: "The assembly line doesn't care what you need. It only knows how to make things faster.",
    qty: 1,
  },

  {
    id: "nova9_broadcast_station",
    name: "Nova9 Broadcast Station",
    type: "Unique Building",
    age: 1,
    source: "progression_challenge",
    progressionTrack: "nova9",
    unique: true,
    scrapCost: 5,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 6,
    ability: {
      // Passive: at the end of every round, the owning player looks at the top 3
      // cards of the Exploration deck and may discard up to 1 of them.
      // Remaining cards are returned in any order.
      // This triggers once per round during the Building Row refresh step,
      // giving the owner ongoing editorial control over upcoming Exploration draws.
      // Activated: once per turn, spend 2 Scrap to draw the top card of the
      // Exploration deck and add it to a personal "broadcast queue" visible only
      // to this player. On any future turn (including other players' turns),
      // the player may replace the current top Exploration card with the queued card.
      // Only one card may be held in the queue at a time.
      // If unused, the queued card is discarded at the start of Age 2.
      // IMPLEMENTATION NOTE: add player.broadcastQueue = card | null to game state.
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "round_end",
          effect: "peek_reorder_discard",
          deckType: "exploration",
          peekCount: 3,
          mayDiscard: 1,
          description: "At end of each round, look at top 3 Exploration cards, discard up to 1, return rest in any order.",
        },
        {
          type: "activated",
          trigger: "spend_scrap",
          scrapCost: 2,
          effect: "queue_exploration_card",
          queueLimit: 1,
          maxPerTurn: 1,
          description: "Once per turn, spend 2 Scrap to draw the top Exploration card into a private queue. Play it as the next Exploration card at any time.",
        },
      ],
      description: "At end of each round, look at top 3 Exploration cards — discard 1, return rest in any order. Once per turn, spend 2 Scrap to secretly queue the top Exploration card and play it at any time.",
    },
    flavor: "Nova9 didn't just broadcast the news. It decided which news was worth broadcasting.",
    qty: 1,
  },

  {
    id: "neptune_hq",
    name: "Neptune HQ",
    type: "Unique Building",
    age: 1,
    source: "progression_challenge",
    progressionTrack: "neptune",
    unique: true,
    scrapCost: 7,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 0,
    passDef: 0,
    passActions: 2,     // The most powerful Action generator in Age 1 — reflects Neptune's
                        // logistical dominance. Balanced by high Scrap cost and no combat stats.
    vp: 6,
    ability: {
      // Passive: the owning player's base Action count per turn is treated as
      // 4 instead of 2 before any building/leader bonuses are added.
      // This replaces the base — it is not additive with the base 2.
      // Combined with the passActions: 2 above, the effective base becomes 4
      // before any other bonuses (buildings/leaders) are calculated.
      // IMPLEMENTATION NOTE: in calcActions(), check for neptune_hq in settlement.
      // If present, use base of 4 instead of 2.
      //
      // Activated: once per turn, the player may spend 3 Scrap to copy the
      // effect of any activated building ability in their settlement (not leaders).
      // This represents Neptune's network routing resources through existing infrastructure.
      // The copied ability follows all its normal rules (costs, limits, etc.) —
      // only the Action cost of activating it is waived.
      // Cannot copy unique building abilities from this file (no infinite loops).
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "calculate_actions",
          effect: "set_action_base",
          base: 4,
          description: "Base Actions per turn is 4 instead of 2 (before building/leader bonuses).",
        },
        {
          type: "activated",
          trigger: "spend_scrap",
          scrapCost: 3,
          effect: "copy_building_activated_ability",
          excludes: "unique_buildings",
          maxPerTurn: 1,
          description: "Once per turn, spend 3 Scrap to copy any activated building ability in your settlement (Action cost waived, all other costs apply).",
        },
      ],
      description: "Base Actions per turn becomes 4. Once per turn, spend 3 Scrap to copy any activated building ability in your settlement without spending an Action.",
    },
    flavor: "The old Neptune network ran on time, on budget, and without complaint. You intend to restore that.",
    qty: 1,
  },

];


// ─── NARRATIVE LEADERS ───────────────────────────────────────────────────────
// Earned through Narrative Chains — never purchased from the Building Row.
// Situationally stronger than purchasable leaders in the right build.
// Follow the same schema as LEADERS in cards.js.
// scrapCost and atkCost reflect what the chain demanded to earn them,
// not a purchase price — these fields are 0 for reward leaders.

export const NARRATIVE_LEADERS = [

  {
    id: "lt_tusk",
    name: "Lt. Tusk",
    type: "Leader (Narrative)",
    age: 1,
    source: "narrative_chain",
    chainId: "the_old_lieutenant",
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 0,
    passiveAtk: 2,      // Strong Attack passive — his veterans are effective soldiers
    passDef: 1,
    passActions: 0,
    vp: 5,
    ability: {
      // Tusk's core identity: mentor and force multiplier for Attack-producing buildings.
      // Passive: each Attack-producing building in the owning player's settlement
      // generates +1 additional Attack per turn (on top of its printed passiveAtk).
      // An Attack-producing building is any building where passiveAtk > 0.
      // This does not stack with Training Grounds — if both are present, the player
      // chooses which scaling effect to apply (not both).
      // IMPLEMENTATION NOTE: in calcAttack(), check for lt_tusk AND training_grounds.
      // If both present, apply only the higher of the two bonuses for that turn.
      //
      // Additionally: Tusk already grants a discount on Negotiate Passage (defined in
      // that card's ability in cards.js). His leader card here does not restate that —
      // the Exploration card checks for leaderId: "lt_tusk" directly.
      //
      // Reactive: when any player (not just the owner) resolves a Vanguard-faction
      // Exploration card, the Tusk player gains +1 Scrap.
      // Vanguard-faction cards: "vanguard_patrol" (narrative beat), "rebuild_vanguard_armory",
      // "vanguard_remnant_patrol" (event).
      type: "compound",
      abilities: [
        {
          type: "passive_scaling",
          trigger: "collect_resources",
          effect: "bonus_atk_per_atk_building",
          bonusPerBuilding: 1,
          scalesOn: "passiveAtk",
          conflictsWith: "training_grounds",
          conflictResolution: "use_higher",
          description: "Each Attack-producing building generates +1 additional Attack per turn. Does not stack with Training Grounds — use the higher bonus.",
        },
        {
          type: "reactive",
          trigger: "any_player_resolves_vanguard_card",
          effect: "gain_scrap",
          amount: 1,
          vanguardCards: ["vanguard_patrol_beat_1", "rebuild_vanguard_armory", "vanguard_remnant_patrol"],
          description: "Whenever any player resolves a Vanguard-faction card, gain 1 Scrap.",
        },
      ],
      description: "Each Attack-producing building generates +1 additional Attack per turn (does not stack with Training Grounds — use higher). Gain 1 Scrap whenever any player resolves a Vanguard-faction card.",
    },
    flavor: "He drills the same routines he learned forty years ago. The difference is they work.",
    qty: 1,
  },

  {
    id: "rita",
    name: "Rita, 1st Engineer",
    type: "Leader (Narrative)",
    age: 1,
    source: "narrative_chain",
    chainId: "the_engineers_daughter",
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 2,    // Strong Scrap passive — she keeps the settlement running efficiently
    passiveAtk: 0,
    passDef: 0,
    passActions: 0,
    vp: 5,
    ability: {
      // Rita's core identity: engineering specialist who makes the building system
      // more efficient and keeps the settlement operational under pressure.
      //
      // Passive 1: when the owning player purchases a building, they may immediately
      // look at the top card of the Building Deck (not the Row — the deck itself)
      // before the replacement card is drawn into the Row. They may choose to either
      // accept the top card as normal (it enters the Row), or bury it at the bottom
      // of the Building Deck, revealing the next card instead.
      // This represents Rita pre-screening construction options.
      //
      // Passive 2: when the owning player's settlement has a disabled building,
      // Rita reduces the Scrap cost to re-enable it from 2 to 0.
      // The Action cost (1 Action) still applies.
      // This makes Rita extremely resilient to Sabotage and Solar Flare.
      //
      // Neither ability costs an Action or Scrap unless noted.
      type: "compound",
      abilities: [
        {
          type: "passive",
          trigger: "owner_purchases_building",
          effect: "screen_building_deck_top",
          mayBury: true,
          description: "When you purchase a building, look at the top card of the Building Deck. You may bury it and reveal the next card instead.",
        },
        {
          type: "passive",
          trigger: "owner_reenables_building",
          effect: "waive_reenable_scrap_cost",
          description: "Re-enabling disabled buildings costs 0 Scrap (Action cost unchanged).",
        },
      ],
      description: "When you purchase a building, screen the top of the Building Deck — accept or bury it. Re-enabling your disabled buildings costs 0 Scrap.",
    },
    flavor: "She doesn't fix things the way the manuals say. She fixes them the way they want to be fixed.",
    qty: 1,
  },

  {
    id: "doc_brawlins",
    name: "Doc Brawlins",
    type: "Leader (Narrative)",
    age: 1,
    source: "narrative_chain",
    chainId: "the_wandering_medic",
    scrapCost: 0,
    atkCost: 0,
    passiveScrap: 1,
    passiveAtk: 0,
    passDef: 1,
    passActions: 0,
    vp: 5,
    ability: {
      // Brawlins already has two effects defined in cards.js on other cards:
      // - Immunity to Disease Scare event (defined on that event card)
      // - +2 bonus Scrap on Abandoned Clinic (defined on that challenge card)
      // Both of those check for leaderId: "doc_brawlins" and apply automatically.
      // His leader card ability here is his primary gameplay identity: triage.
      //
      // Reactive (Triage): whenever the owning player suffers a negative effect
      // from any source — a failed challenge penalty, a raid loss, or an event
      // penalty — they may immediately recover resources equal to half the amount
      // lost, rounded up, in their choice of Scrap or Attack.
      // "Negative effect" is defined as: losing Scrap, losing permanent Attack,
      // having a building disabled, or losing an Action (temporary or permanent).
      // Recovery is applied after the loss, not instead of it.
      // Maximum recovery per trigger: 4 (either 4 Scrap, 4 Attack, or split).
      // Once per turn — if multiple negative effects happen in one turn, only
      // the first triggers Triage.
      //
      // Example: Marauder Ambush event forces the player to lose 5 Scrap.
      // Triage triggers — player recovers ceil(5/2) = 3, choosing Scrap or Attack.
      // Net loss: 2 Scrap instead of 5.
      //
      // IMPLEMENTATION NOTE: when any negative effect is applied to this player,
      // check for doc_brawlins leader and triageUsedThisTurn flag.
      // If not used: calculate recovery, show choice modal (Scrap or Attack),
      // apply recovery, set triageUsedThisTurn = true.
      // Reset triageUsedThisTurn at start of player's next turn.
      type: "compound",
      abilities: [
        {
          type: "reactive",
          trigger: "owner_suffers_negative_effect",
          triggers: [
            "lose_scrap",
            "lose_atk_permanent",
            "building_disabled",
            "lose_action",
          ],
          effect: "triage_recovery",
          recoveryFormula: "ceil(amountLost / 2)",
          maxRecovery: 4,
          recoveryType: "player_choice",
          recoveryOptions: ["scrap", "atk"],
          maxPerTurn: 1,
          description: "Triage: when you suffer any negative effect, recover half the loss (rounded up, max 4) in Scrap or Attack. Once per turn.",
        },
      ],
      description: "Triage: whenever you suffer a negative effect (lose Scrap, Attack, an Action, or have a building disabled), immediately recover half the amount lost rounded up (max 4) in your choice of Scrap or Attack. Once per turn.",
    },
    flavor: "He doesn't ask how it happened. He asks what can still be saved.",
    qty: 1,
  },

];


// ─── UNIQUE INTRIGUE ─────────────────────────────────────────────────────────
// Unique Intrigue cards earned through Narrative Chains.
// Follow the same schema as INTRIGUE_CARDS in cards.js.
// Not shuffled into the standard Intrigue deck — held by the earning player.

export const UNIQUE_INTRIGUE = [

  {
    id: "bennys_schematics",
    name: "Benny's Schematics",
    type: "Intrigue (Unique)",
    age: 1,
    source: "narrative_chain",
    chainId: "the_demolitions_contractor",
    unique: true,
    immediate: true,
    trigger: "raid_declared_against_self",
    vp: 2,
    ability: {
      // Benny's Schematics is a trap — literally.
      // Trigger: another player declares a raid against the card holder.
      // The card is played before raid resolution.
      //
      // Effect: the attacker must choose one of their own buildings and disable it
      // for the remainder of the current round (recovers at the start of their next turn).
      // This represents Benny's pre-rigged perimeter detonating during the raid approach.
      // The attacker chooses which of their own buildings is hit — they cannot choose
      // to have no buildings hit (if they have buildings).
      // If the attacker has no buildings, the effect is: they lose 3 Scrap instead.
      //
      // The raid still proceeds normally after this effect resolves.
      // Benny's Schematics does NOT cancel the raid — it punishes the attacker
      // regardless of whether the raid succeeds or fails.
      //
      // This is intentionally different from Emergency Protocols (which lets the
      // attacker pay Scrap to continue or abandon). Benny's Schematics always fires,
      // always hurts — the only question is which building takes the hit.
      //
      // Once played, this card is consumed. It is unique and cannot be replaced.
      // IMPLEMENTATION NOTE: when played, show attacker a modal with their settlement.
      // Require them to select one building to disable. Apply disable, then continue
      // raid resolution as normal.
      type: "reactive",
      trigger: "raid_declared_against_self",
      effect: "force_attacker_self_disable",
      attackerChooses: "own_building",
      fallbackIfNoBuildingsAtk: { effect: "lose_scrap", amount: 3 },
      raidContinues: true,
      consumeOnPlay: true,
      description: "IMMEDIATE when raided. The attacker must disable one of their own buildings for this round. If they have no buildings, they lose 3 Scrap instead. The raid still proceeds.",
    },
    flavor: "Benny had already wired the perimeter before you even asked him to. He looked pleased about it.",
    qty: 1,
  },

];


// ─── CONVENIENCE EXPORT ───────────────────────────────────────────────────────
// All Age 1 reward cards as a single array for building the Unlockable Deck.

export const ALL_AGE1_REWARD_CARDS = [
  ...NARRATIVE_UNIQUE_BUILDINGS,
  ...PROGRESSION_UNIQUE_BUILDINGS,
  ...NARRATIVE_LEADERS,
  ...UNIQUE_INTRIGUE,
];

// Lookup by id — useful in narrative.js and upgrades.js.
export const REWARD_CARD_MAP = Object.fromEntries(
  ALL_AGE1_REWARD_CARDS.map(card => [card.id, card])
);
