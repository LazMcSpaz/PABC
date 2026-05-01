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
