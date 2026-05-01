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
