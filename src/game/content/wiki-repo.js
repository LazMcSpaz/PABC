// Hand-authored wiki entries that live in the repo itself — as opposed to
// ./wiki.js, which the content editor's export pipeline overwrites on every
// save. Add or edit entries here directly; the exporter never touches this
// file.
//
// Same shape as the exported entries (docs/content-schema-v0.1.md,
// `wiki_entries`): id, term, aliases, category, body, imagePath. Bodies
// support the same [[term]] / [[term|display]] cross-link markup, and
// paragraph breaks are literal blank lines (the wiki renders pre-wrap).
//
// `WIKI_ENTRIES` below is the merged view the game screens consume: repo
// entries plus whatever the editor pipeline has exported. Editor entries win
// on an id collision, so an entry migrated into the editor can be retired
// here at leisure without the two copies fighting.

import { WIKI_ENTRIES as EXPORTED_WIKI_ENTRIES } from "./wiki.js";

const TECH = "Technology & Vehicles";

export const REPO_WIKI_ENTRIES = {
  "landship": {
    id: "landship",
    term: "Landship",
    aliases: ["landships"],
    category: TECH,
    imagePath: null,
    body: `A landship is a vessel of the old world, riding a few feet above the ground on nothing anyone can see. It is not built; it is found. The handful that still move were woken from the wreckage of the old age, and no smith, foundry, or scholar alive can make another. Their power does not run out. A landship that runs today has run since before the shift and shows no sign of stopping, though what feeds it is a question few can even frame.

They are prized above any built thing. A landship crosses ground that stops wagons, hauls what a whole train of haulers would carry, and makes a moving platform for whatever a holder chooses to mount on it. Each dresses its landship in its own fashion, adding plating, rigging, guns, and banners, so that no two look alike, though the hull beneath is always older than the people arguing over it.

A landship should not be confused with a [[land vessel]], which is merely a vehicle someone made. The difference is the difference between a thing understood and a thing inherited. Rarer than the landships themselves are [[specialist|the people who can wake one]].`,
  },

  "specialist": {
    id: "specialist",
    term: "Specialist",
    aliases: ["specialists"],
    category: TECH,
    imagePath: null,
    body: `A specialist is a person who understands the machines of the old world as no one else does, the sort who can coax a dead console to light, restore a stalled engine, or rouse a [[landship]] that has sat silent for a lifetime. They belong to no faction. A specialist asked how they came by the knowledge will say only that they wanted it: that they went looking, chased down old texts, and learned what others could not be bothered to.

Because there are so few of them, and so much depends on them, a specialist is among the most valuable people alive, and among the least free. Many are held rather than employed, passed from one holder to the next the way a possession is passed. Around each moves a small retinue of hired guards, an escort paid out of the specialist's own earnings and charged with delivering them intact to whoever has claimed them next.`,
  },

  "land-vessel": {
    id: "land-vessel",
    term: "Land vessel",
    aliases: ["land vessels", "vessels"],
    category: TECH,
    imagePath: null,
    body: `Land vessel is the common name for any vehicle a living people has built or restored, as against the [[landship|landships]] of the old world. What a faction drives says nearly as much about it as what it eats.

Versari vessels run on the sun. They are light by necessity, since every pound is a pound the panels must carry, and they falter under long cloud and carry little. Laker vessels are old machines of the manufacturing cities, stripped and rebuilt and kept running on [[ethanol]] the Lakers distill themselves, which binds how far they range to how much fuel they can make. The Goldgrass and the Free Plainers keep to horse and wagon, with relays of fresh animals staged along the routes they use most. This is slower than an engine, but fed by grass that grows back.

All of them move at the pace of the worst ground between here and there. Overland travel is measured in patience, and a ford or an old roadbed can decide a season.`,
  },

  "sun-runner": {
    id: "sun-runner",
    term: "Sun Runner",
    aliases: ["sun runners", "sunrunner"],
    category: TECH,
    imagePath: null,
    body: `The Sun Runner is the lightest of the Versari solar [[land vessel|vessels]], a three-wheeled machine that carries one rider and little else, built around a spread of old-world panels and almost nothing besides. It is the first vessel most Versari agents in the field are given: quick over open ground, silent, and useless the moment the sky closes over or the load grows.

Its heavier kin, the haulers, trade that speed for a bed and a frame that can carry cargo, the same principle and the same power shaped to a different purpose. The Versari name the whole line for the sun that drives it. A rider on the horizon in a low, humming trike, going faster than a horse and raising no dust, is a sight the plains have learned to know.`,
  },

  "ethanol": {
    id: "ethanol",
    term: "Ethanol",
    aliases: [],
    category: TECH,
    imagePath: null,
    body: `Ethanol is the fuel the Grand Lakers make to run their vehicles. The old machines they prize will not move without it, and unlike the sun it does not simply arrive. It must be grown, fermented, and distilled, which ties a Laker column's reach to its supply as surely as an army is tied to its bread. A well-fueled Laker [[land vessel|vessel]] outpaces and outlasts a solar one; a Laker vessel run dry is [[scrap]] that happens to be shaped like a car.`,
  },

  "old-world-technology": {
    id: "old-world-technology",
    term: "Old-world technology",
    aliases: ["old world technology", "old-world tech"],
    category: TECH,
    imagePath: null,
    body: `Most of what the old world made can be used but not remade. Its tools pass from hand to hand and are kept working by people who understand what a thing does without understanding how, so that a restored machine is often a patchwork of real parts, guessed repairs, and a good deal of hope, and it runs anyway.

Some knowledge did survive whole. Wireless speech across distance has worked since the first generation and works still. The generating of power is grasped, at least in its bones, by some. Old computers have been coaxed back to use here and there. Other things drain away and do not return: firearms were common enough in the first years, while the stockpiles held, but the making of ammunition was never recovered, and by now a cartridge is a scarce and serious thing, with the powder and metal for more of them scarcer still.`,
  },

  "scrap": {
    id: "scrap",
    term: "Scrap",
    aliases: [],
    category: TECH,
    imagePath: null,
    body: `Scrap is the salvage the whole era is built on, the metal, wire, glass, and working parts pulled from the ruins and the wrecks. It is the base of every trade that matters: what a smith reforges, what a [[specialist]] reworks, what a faction spends to better its [[land vessel|vessels]] and its tools. It is also finite. Nothing new is being made, only found, and the easy finds are long gone, so scrap is hoarded, fought over, and paid out carefully. Where the Goldgrass halls keep wealth in printed notes, most of the continent keeps it in scrap.`,
  },
};

export const WIKI_ENTRIES = { ...REPO_WIKI_ENTRIES, ...EXPORTED_WIKI_ENTRIES };
