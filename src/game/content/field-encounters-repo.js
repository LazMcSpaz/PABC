// Hand-authored field encounters that live in the repo itself — as opposed to
// ./field-encounters.js, which the content editor's export pipeline
// overwrites on every save.
//
// Same seam, same reasoning as ./wiki-repo.js. Add or edit cards here
// directly; the exporter never touches this file.
//
// WHY THESE EXIST. The authored field deck is 11 cards, and 8 of them have no
// effect on any branch — measured, not guessed. Every choice on
// fe_the_hulk, fe_the_silo, fe_goldgrass_notes, fe_ashfall_year,
// fe_no_answer, fe_tattooed_man, fe_wrong_water and fe_foundry_boy resolves
// to nothing at all. That is a deliberate register — the road is mostly the
// road — but at 8 of 11 it means the field reads as pure decoration, which is
// exactly how it read in the 2026-08-25 playtest.
//
// So these are the other register: a small decision with a small consequence.
// Not a quest, not a windfall. THE SHAPE IS FIXED AND DELIBERATE — three
// choices, two of which pay something modest and one of which is walking
// away, and walking away is always live and never punished. A card the
// player can lose by reading it is a card they learn to dread; a card they
// can only gain from is a card they stop reading. Two doors and a shrug keeps
// it a decision without making it a tax.
//
// SCALE. A benefit here is 1–3 scrap, a point of Honor, a look at the next
// two cards, or one point of Strength on the column that stopped. Anything
// larger belongs to a quest, which is the system that can ask for something
// back. The one exception is permanent Research, which is genuinely strong —
// it is on two cards, at 1, and both charge for it.
//
// Effects are written in the ENGINE-NATIVE flat shape (`{type, ...params}`)
// rather than the editor's `{type, params:{}}`. `normalizeEffect` accepts
// both; flat is what a human should have to type.

import { FIELD_ENCOUNTERS as EXPORTED_FIELD_ENCOUNTERS } from "./field-encounters.js";

// `walkAway` is the third door on every card. Its own helper because it is
// the same door every time and it must STAY the same: no cost, no flag, no
// quiet penalty for declining. The label changes, the nothing does not.
const walkAway = (id, label, outcomeText) => ({
  id, label, ordinal: 2, condition: null, effects: [], outcomeText,
});

export const REPO_FIELD_ENCOUNTERS = {

  "fer_salvage_line": {
    id: "fer_salvage_line",
    title: "The Salvage Line",
    copies: 2,
    art: "A queue of croppers stripping a half-buried hauler, working in shifts, a foreman with a tally board.",
    text: `Forty people are taking a freight hauler apart where it went down, and they are doing it in shifts with a tally board, not a scramble. The foreman marks what each shift pulls and what it is owed. Nobody here is in a hurry and nobody is fighting over it.`,
    choices: [
      {
        id: "ch_sal_work", ordinal: 0, condition: null,
        label: "Put your people on the line for a shift",
        outcomeText: "Your column works a shift like anyone else's and is paid like anyone else's, in what they pulled out.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 2 }],
      },
      {
        id: "ch_sal_fittings", ordinal: 1, condition: null,
        label: "Buy the fittings they cannot use",
        outcomeText: "They sell you a crate of couplings nobody on the line has a use for. Your smiths spend a week working out how the seals were cut, and then they know.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: -1 },
          { type: "ADJUST_RESOURCE", target: "active", resource: "Research", amount: 1 },
        ],
      },
      walkAway("ch_sal_on", "Leave them to it",
        "You go around. The tally board is still going when you lose sight of it."),
    ],
  },

  "fer_waystation_ledger": {
    id: "fer_waystation_ledger",
    title: "The Waystation Ledger",
    copies: 2,
    art: "A bound ledger on a chain at a waystation counter, columns of names and hatch marks, a keeper who does not look up.",
    text: `The keeper's ledger is chained to the counter and open at the current page. Water, shelter, and feed are all on credit here, and the column of names runs back further than the waystation looks old. Two of the names have been open a long time.`,
    choices: [
      {
        id: "ch_way_settle", ordinal: 0, condition: null,
        label: "Settle the oldest open name",
        outcomeText: "You pay off a debt belonging to somebody you will never meet. The keeper writes your name beside the crossing-out, which is the whole point of a ledger that stays chained to the counter.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: -1 },
          { type: "ADJUST_HONOR", target: "active", amount: 1, cause: "encounter" },
        ],
      },
      {
        id: "ch_way_read", ordinal: 1, condition: null,
        label: "Read it back a few pages",
        outcomeText: "Who came through, in what order, and who they were travelling with. The road ahead is a known quantity for a while.",
        effects: [{ type: "PEEK", target: "active", scope: "field", count: 2, reorder: false }],
      },
      walkAway("ch_way_on", "Take your water and go",
        "You pay for what you take and put nothing in the book."),
    ],
  },

  "fer_dry_cistern": {
    id: "fer_dry_cistern",
    title: "The Dry Cistern",
    copies: 2,
    art: "A capped stone cistern in open country, its inspection plate rusted shut, dry grass all round it.",
    text: `An old-world cistern, capped and sealed, sitting in country that has not held water since anyone here was born. The plate is rusted but not broken. Whatever is under it has been under it a long time.`,
    choices: [
      {
        id: "ch_cis_read", ordinal: 0, condition: null,
        label: "Have your reader sound it before you open it",
        outcomeText: "There is water, and it is clean, and she can say so before a single bolt is turned. Your column drinks properly for the first time in a week.",
        effects: [{ type: "ADJUST_BASE_STRENGTH", target: "triggering_unit", amount: 1 }],
      },
      {
        id: "ch_cis_strip", ordinal: 1, condition: null,
        label: "Strip the plate and the fittings",
        outcomeText: "The cistern stays sealed. The bronze around its throat does not, and bronze is bronze.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 2 }],
      },
      walkAway("ch_cis_on", "Leave it capped",
        "It has kept whatever it is keeping for two hundred years. It can keep it a while longer."),
    ],
  },

  "fer_sunrunner_wake": {
    id: "fer_sunrunner_wake",
    title: "In the Sunrunner's Wake",
    copies: 2,
    art: "A landship crossing open ground at distance, the grass laid flat behind it in a long straight lane.",
    text: `A landship passes half a day out, running east, and lays the grass flat behind it in a lane you could drive a column down. Its crew are not stopping and are not unfriendly about it. Somebody aboard raises a hand.`,
    choices: [
      {
        id: "ch_wake_signal", ordinal: 0, condition: null,
        label: "Signal for a bearing",
        outcomeText: "They shout down a bearing and two landmarks and are gone before you can thank them. The country ahead stops being a rumour.",
        effects: [{ type: "REVEAL_REGION", target: "active", radius: 2 }],
      },
      {
        id: "ch_wake_follow", ordinal: 1, condition: null,
        label: "Follow the lane while it lasts",
        outcomeText: "Flattened grass is faster than standing grass, and your outriders use the hours they save going wide instead of forward.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 1 },
          { type: "REVEAL_REGION", target: "active", radius: 1 },
        ],
      },
      walkAway("ch_wake_on", "Hold your own line",
        "The lane bends off east and you do not. By evening the grass has started to stand back up."),
    ],
  },

  "fer_foundry_seconds": {
    id: "fer_foundry_seconds",
    title: "Foundry Seconds",
    copies: 2,
    art: "A pallet of cast fittings outside a foundry gate, raised numerals on every piece, the seams left unground.",
    text: `A pallet of castings outside the gate, every piece marked in raised numerals and every seam left showing, the way a foundry that is willing to be known by its work leaves them. These are the ones that came out wrong. They are still better than most things you could make.`,
    choices: [
      {
        id: "ch_fnd_weight", ordinal: 0, condition: null,
        label: "Take the pallet at scrap weight",
        outcomeText: "They are glad to see it go and you are glad to have it. Both of you know it is worth more than weight.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 3 }],
      },
      {
        id: "ch_fnd_ask", ordinal: 1, condition: null,
        label: "Ask which mould failed, and why",
        outcomeText: "The founder walks you along the pallet and shows you the fault in each piece and what it says about the mould. He is not giving anything away. He is showing off, which is better.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: -1 },
          { type: "ADJUST_RESOURCE", target: "active", resource: "Research", amount: 1 },
        ],
      },
      walkAway("ch_fnd_on", "Nothing you need today",
        "You go on past the gate. The pallet is gone by the time anyone comes back this way."),
    ],
  },
};

// The merged view the engine consumes. Repo cards LAST so that if the editor
// corpus ever grows a card with one of these ids, the hand-authored one is
// what plays — the same precedence wiki-repo.js uses for the rules glossary,
// and for the same reason: a silent shadowing is worse than either answer.
// The `fer_` prefix means it should never come up.
export const ALL_FIELD_ENCOUNTERS = {
  ...EXPORTED_FIELD_ENCOUNTERS,
  ...REPO_FIELD_ENCOUNTERS,
};
