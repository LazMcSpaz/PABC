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
    passiveAtk: 0,
    passDef: 2,
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
