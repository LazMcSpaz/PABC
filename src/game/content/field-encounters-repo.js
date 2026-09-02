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
    art: "A long queue of workers stripping a half-buried hauler in shifts, a foreman with a tally board at the head of it.",
    text: `Forty people are taking a freight hauler apart, and they are doing it in shifts with a tally board rather than in a scramble. The foreman marks what each shift pulls and what it is owed, and the marks are honoured. Nobody here is in a hurry and nobody is fighting over it, which is not how any of this looked twenty years ago.`,
    choices: [
      {
        id: "ch_sal_work", ordinal: 0, condition: null,
        label: "Put your people on the line for a shift",
        outcomeText: "Your column works a shift like anyone else's and is paid like anyone else's, out of what came up.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 2 }],
      },
      {
        id: "ch_sal_board", ordinal: 1, condition: null,
        label: "Buy a look at the foreman's board",
        outcomeText: "Every wreck this crew has stripped, in order, with the ones still buried marked and the ones not worth the digging crossed out. It is the best map of this country anybody has made since the shift.",
        effects: [{ type: "REVEAL_REGION", target: "active", radius: 2 }],
      },
      walkAway("ch_sal_on", "Leave them to it",
        "You go around. The tally board is still going when you lose sight of it."),
    ],
  },

  "fer_waystation_ledger": {
    id: "fer_waystation_ledger",
    title: "The Waystation Ledger",
    copies: 2,
    art: "A bound ledger chained to a waystation counter, columns of names and hatch marks, a keeper who does not look up.",
    text: `The keeper's ledger is chained to the counter and open at the current page. Water, shelter and feed are all on credit here, and the column of names runs back further than the waystation looks old. Two of the names have been open a long time. Nobody has crossed them out and nobody has closed the book.`,
    choices: [
      {
        id: "ch_way_settle", ordinal: 0, condition: null,
        label: "Settle the oldest open name",
        outcomeText: "You pay off a debt belonging to somebody you will never meet. The keeper writes your name beside the crossing-out, which is the entire reason a ledger stays chained to a counter.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: -1 },
          { type: "ADJUST_HONOR", target: "active", amount: 1, cause: "encounter" },
        ],
      },
      {
        id: "ch_way_read", ordinal: 1, condition: null,
        label: "Read it back a few pages",
        outcomeText: "Who came through, in what order, and who they were travelling with. The road ahead stops being a guess for a while.",
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
    art: "A capped stone cistern standing alone in open country, its inspection plate rusted shut, dry grass all round it.",
    text: `An old-world cistern, capped and sealed, sitting in country that has not held standing water since anyone alive was born. The plate is rusted but not broken and the seal is intact. Whatever is under it has been under it for two hundred years, and whoever set it there expected somebody to come back.`,
    choices: [
      {
        id: "ch_cis_open", ordinal: 0, condition: null,
        label: "Open it properly and water the column",
        outcomeText: "It takes most of a day to do without breaking the seal past mending. The water is clean. Your people drink properly for the first time in a week and it shows in them.",
        effects: [{ type: "ADJUST_BASE_STRENGTH", target: "triggering_unit", amount: 1 }],
      },
      {
        id: "ch_cis_strip", ordinal: 1, condition: null,
        label: "Strip the bronze off its throat",
        outcomeText: "The cistern stays sealed. The fittings around its neck do not, and bronze is bronze.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 2 }],
      },
      walkAway("ch_cis_on", "Leave it capped",
        "It has kept whatever it is keeping for two hundred years. It can keep it a while longer."),
    ],
  },

  "fer_sealed_car": {
    id: "fer_sealed_car",
    title: "The Sealed Car",
    copies: 2,
    art: "A single rail car standing intact on a broken line, doors closed, seals unbroken, the track either side of it gone.",
    text: `One car, upright and closed, on a stretch of line that stops fifty yards either side of it. The seals are unbroken. Everything about how it is standing says it was shut deliberately rather than abandoned, and every crew that has passed it since has had the same argument about what that means.`,
    choices: [
      {
        id: "ch_car_cut", ordinal: 0, condition: null,
        label: "Cut it open and take what is inside",
        outcomeText: "The doors were the strongest part. What is inside is worth carrying, and whatever the seals were for stops being anybody's business.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 3 }],
      },
      {
        // THE ONE RESEARCH DOOR IN THE SET, and it is priced against the Lab
        // rather than against the other cards. A Lab costs 3 scrap, a chip
        // slot and a build action for +1 Research a round; this is the same
        // +1 a round with no slot, no slot cap pressure and nothing to build,
        // which makes it strictly the better deal at any equal price. So it
        // costs MORE than the Lab, and the gate is what makes that true —
        // ADJUST_RESOURCE floors at zero, so without it a faction holding 1
        // scrap paid 1 and got the same permanent stream.
        id: "ch_car_specialist", ordinal: 1,
        condition: { left: { score: { kind: "resource" } }, op: "gte", right: 4 },
        label: "Send for a specialist before anyone touches it",
        outcomeText: "She takes four days to arrive and most of your scrap to hire, and she opens it without cutting anything. What she explains while she works about how the seal was made is worth more than the car, and your people do not forget it.",
        effects: [
          { type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: -4 },
          { type: "ADJUST_RESOURCE", target: "active", resource: "Research", amount: 1 },
        ],
      },
      walkAway("ch_car_on", "Leave it standing",
        "You go on down the line. It was standing there before you and it is standing there after."),
    ],
  },

  "fer_the_hollow": {
    id: "fer_the_hollow",
    title: "The Hollow",
    copies: 2,
    art: "A sheltered depression out of the wind with three separate camps in it, fires apart, nobody watching anybody.",
    text: `A fold in the ground deep enough to break the wind, with three camps already in it and their fires kept well apart. Nobody here is friendly and nobody here is armed at the fire. The hollow is neutral by custom rather than by any agreement, and the custom holds because everybody needs it to on the way back.`,
    choices: [
      {
        id: "ch_hol_trade", ordinal: 0, condition: null,
        label: "Trade with whoever else is camped",
        outcomeText: "Nobody asks whose colours anybody is wearing. Things change hands at prices that would be insulting anywhere with a roof on it, and everybody goes back to their own fire.",
        effects: [{ type: "ADJUST_RESOURCE", target: "active", resource: "Resource", amount: 2 }],
      },
      {
        id: "ch_hol_watch", ordinal: 1, condition: null,
        label: "Stand a watch for the whole hollow",
        outcomeText: "You put two of yours on the rim all night, for everyone in it, and say so. It costs you a night's sleep and it is remembered a long way from here — the custom only holds because somebody keeps holding it.",
        effects: [{ type: "ADJUST_HONOR", target: "active", amount: 1, cause: "encounter" }],
      },
      walkAway("ch_hol_on", "Push on through the dark",
        "You camp cold and alone two miles further on. It is a worse night and it is nobody's business but yours."),
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
