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
//
// Canon note: the author's rulings in docs/wiki-rfi-response.md's follow-up
// govern this file. A landship is the recovered hovering old-world platform,
// operated by all four factions in this era; "land vessel" is retired and the
// manufactured class is [[Faction Vehicles]]. The era is ~200 years after the
// shift. The Dambarans are a distinct people, not a lineage inside Versari
// society.

import { WIKI_ENTRIES as EXPORTED_WIKI_ENTRIES } from "./wiki.js";
import { RULES_GLOSSARY } from "./rules-glossary.js";

const TECH = "Technology & Vehicles";
const LAND = "The Land";
const CITIES = "Cities & Settlements";
const MONUMENTS = "Monuments & Structures";
const HISTORY = "History";
const MAJOR = "Major Factions";
const MINOR = "Minor Factions";
const GIFTS = "Perceptive Gifts";
const TITLES = "Titles & Roles";
const INST = "Institutions & Instruments";
const CUSTOMS = "Customs & Places";

export const REPO_WIKI_ENTRIES = {
  // ── Technology & Vehicles ─────────────────────────────────────────────────

  "landship": {
    id: "landship",
    term: "Landship",
    aliases: ["landships"],
    category: TECH,
    imagePath: null,
    body: `A landship is a vessel of the old world, riding a few feet above the ground on nothing anyone can see. It is not built; it is found. The handful that still move were recovered from the wreckage of the old age, and no smith, foundry, or scholar alive can make another. Their power does not run out. A landship that runs today has run since before [[The Pole Shift|the shift]] and shows no sign of stopping, though what feeds it is a question few can even frame.

The hull is the tell. It is seamless and matte, curved and planed with an exactness nobody now can reproduce, without fasteners, panel lines, or any visible way in. It carries no maker's signature of any kind, because no living people made it. That a thing so large hovers is signaled not by light but by cost: scorch and heat discoloration around the emitters, and heavy armored conduit feeding them. Nothing glows.

They are prized above anything built. A landship crosses ground that stops wagons, hauls what a train of haulers would carry, and makes a moving platform for whatever its holder chooses to mount on it. In this era no one people controls them. They are recovered by whoever finds one, and all four factions field the few that run.

What distinguishes one faction's landship from another's is entirely what has been bolted to it. The hull beneath is identical and older than anyone arguing over it. Rarer than the landships themselves are [[specialist|the people who can wake one]].`,
  },

  "specialist": {
    id: "specialist",
    term: "Specialist",
    aliases: ["specialists"],
    category: TECH,
    imagePath: null,
    body: `A specialist is a person who understands the machines of the old world as no one else does, the sort who can coax a dead console to light, restore a stalled engine, or rouse a [[landship]] that has sat silent for a lifetime. They belong to no faction. A specialist asked how they came by the knowledge will say only that they wanted it: that they went looking, chased down old texts, and learned what others could not be bothered to.

Because there are so few of them, and so much depends on them, a specialist is among the most valuable people alive, and among the least free. Many are held rather than employed, passed from one holder to the next the way a possession is passed. Around each moves a small retinue of hired guards, an [[escort]] paid out of the specialist's own earnings and charged with delivering them intact to whoever has claimed them next.`,
  },

  "faction-vehicles": {
    id: "faction-vehicles",
    term: "Faction Vehicles",
    aliases: ["faction vehicle", "vehicles", "vehicle"],
    category: TECH,
    imagePath: null,
    body: `Everything that moves on the ground that a living people actually built or restored, as against the recovered [[landship|landships]] of the old world. What a faction drives says nearly as much about it as what it eats, and the three answers are entirely different problems.

[[The Versari Korad|Versari]] vehicles run on the sun. They are light by necessity, since every pound is a pound the panels must carry, and they falter under long cloud and carry little. The Versari name the whole line for what drives it, from the single rider [[The Sunrunner|Sunrunner]] up to the cargo carrying Sunhauler, and their fabrication yards and panel fields are named the same way.

[[The Grand Lakers|Laker]] vehicles are the preserved machines of the old manufacturing cities: lacquered classic bodywork with the roof and doors cut away, crude welded roll bar and plate, lifted suspension, knobby tires on cast steel wheels. They are rebuilt rather than replaced, and a Laker column's reach is bound to what it can keep them running on.

The [[The Goldgrass Coalition|Goldgrass]] and the [[The Free Plainers|Free Plainers]] keep to horse and wagon. Both stage relays of spare animals along the routes they use most, so that a rider changes mounts rather than resting one, and both run stage and freight lines on that principle. It is slower than an engine and fed by grass that grows back.

All of them move at the pace of the worst ground between here and there. Overland travel is measured in patience, and a [[Waystation and Ford|ford]] or an [[The Grade|old roadbed]] can decide a season.`,
  },

  "sunrunner": {
    id: "sunrunner",
    term: "The Sunrunner",
    aliases: ["sunrunner", "sunrunners", "sunhauler"],
    category: TECH,
    imagePath: null,
    body: `The Sunrunner is the lightest of the [[The Versari Korad|Versari]] solar [[Faction Vehicles|vehicles]], a three wheeled machine that carries one rider and little else, built around a spread of old world panels and almost nothing besides. It is the first vehicle most Versari in the field are given: quick over open ground, silent, and useless the moment the sky closes over or the load grows.

Its heavier kin, the Sunhauler, trades that speed for a bed and a frame that can carry cargo, the same principle and the same power shaped to a different purpose. A rider on the horizon in a low, humming trike, going faster than a horse and raising no dust, is a sight the plains have learned to know.`,
  },

  "fuel-and-feed": {
    id: "fuel-and-feed",
    term: "Fuel and Feed",
    aliases: ["fuel", "feed"],
    category: TECH,
    imagePath: null,
    body: `Nothing that moves is free to move, and each people pays differently.

The [[The Versari Korad|Versari]] pay in daylight and in weight. Their [[Faction Vehicles|vehicles]] ask nothing but sun and give nothing under cloud, which makes their range a question of season and sky rather than supply.

The [[The Grand Lakers|Lakers]] pay in fuel. The old machines they prize will not run without it, and unlike sunlight it does not simply arrive. It has to be made, which ties a Laker column's reach to its supply as surely as an army is tied to its bread. A well supplied Laker vehicle outpaces and outlasts a solar one. A Laker vehicle run dry is [[scrap]] that happens to be shaped like a car.

The plains peoples pay in grass, water, and time. Horses must be fed, rested, and replaced, and a relay of fresh animals is the whole reason a stage line can keep a pace no single animal could. Of the three, it is the only cost the country itself renews.`,
  },

  "old-world-technology": {
    id: "old-world-technology",
    term: "Old-world Technology",
    aliases: ["old world technology", "old-world tech", "old world knowledge"],
    category: TECH,
    imagePath: null,
    body: `Most of what the old world made can be used but not remade. Its tools pass from hand to hand and are kept working by people who understand what a thing does without understanding how, so that a restored machine is often a patchwork of real parts, guessed repairs, and a good deal of hope, and it runs anyway.

The recovery has been uneven in a particular way. Metallurgy and optics are excellent. Chemistry is gone. Nothing can be made small. Above all there is no ammunition industry: firearms were common enough in the first years while the stockpiles held, but the making of cartridges was never recovered, and what remains is spent and not replaced. A firearm today is a prestige object carried by someone important rather than a weapon an army is built around. Fighting is done at arm's length, with edged weapons, by nearly everyone.

Some knowledge did survive whole. Wireless speech across distance has worked since the first generation and works still. The generating of power is grasped, at least in its bones, by some. Old computers have been coaxed back to use here and there.`,
  },

  "scrap": {
    id: "scrap",
    term: "Scrap",
    aliases: [],
    category: TECH,
    imagePath: null,
    body: `Scrap is the salvage the whole era is built on, the metal, wire, glass, and working parts pulled from the ruins and the wrecks. It is the base of every trade that matters and the measure of nearly every price: what a smith reforges, what a [[specialist]] reworks, what a faction spends to better its [[holding|holdings]], its [[Faction Vehicles|vehicles]], and its tools. Wealth is counted in it from one end of the continent to the other.

It is also finite. Nothing new is being made, only found, and the easy finds are long gone, so scrap is hoarded, fought over, and paid out carefully. Every people gathers it and every people names the gathering differently, from breaker yards on the lakes to gleaning yards in the grass country, but the work is the same work and the pile is getting smaller.`,
  },

  // ── The Land ──────────────────────────────────────────────────────────────

  "remnant-continent": {
    id: "remnant-continent",
    term: "The Remnant Continent",
    aliases: ["remnant continent", "the continent"],
    category: LAND,
    imagePath: null,
    body: `The continent is what is left of the middle of the old world's western land, and in this region it is not as changed as the stories suggest. The grass country still grows grain. The lakes are still fresh water. The high country in the west is still high, still dry, and still hard on the people living in it.

What did change is legible to anyone who looks. [[The Grand Lakes|The lakes in the north]] ran together into fewer and larger bodies. The western ranges show raw rock and fresh faces where they broke. Fissures cross open country in places, though no one can say for certain which of them are new. Whole cities stand too broken to reoccupy, and that is the plainest evidence there is that the ground moved. Here and there a road runs level into standing water and continues under it, which tells anyone who thinks about it that the water was not always there.

The climate is warmer than the old records describe, and the seasons do not arrive quite when the old almanacs say they should. This is noted and worked around rather than explained.`,
  },

  "western-high-country": {
    id: "western-high-country",
    term: "The Western High Country",
    aliases: ["western high country", "the high west", "high country"],
    category: LAND,
    imagePath: null,
    body: `The country of the far west: high altitude, semi arid foothills running up to broken mountains, pale and thin grassed, with the peaks always standing to the west of anyone crossing it. Water is the constant question here and always has been. Weather arrives hard and with little warning.

It is the least forgiving ground on the continent that anyone has chosen to live on in numbers, and it has shaped [[The Dambarans|the people who did]]. What that country demands is that neighbors hold together, and the communities of the high west do.`,
  },

  "goldgrass-plains": {
    id: "goldgrass-plains",
    term: "The Goldgrass Plains",
    aliases: ["goldgrass plains", "grass country", "the plains"],
    category: LAND,
    imagePath: null,
    body: `The grass country of the middle continent is the food of the world and has been since there was anyone left to feed. It shook less than the west and flooded less than the coasts, and that accident of geography is the reason so many people came through [[The Pole Shift|the shift]] here on their own.

It is dark soiled, green and gold in season, humid in summer, and there is nothing on any horizon. Sightlines run to the edge of the world, which shapes how people travel, trade, and fight across it, and there is very little cover anywhere that someone did not plant. Settlements sit low and squat against the weather. The exceptions are the grain elevators and [[The Silos|silos]], which stand tall over everything and can be seen from a long way off.

The country is worked in a patchwork of village [[holding|holdings]], cropland, and grazing, tied together by routes that follow water and [[The Grade|old grade]]. It has no natural defenses of any kind. Everything about it that makes it valuable also makes it difficult to keep, and that fact sits underneath the whole history of [[The Goldgrass Coalition|the people living on it]].`,
  },

  "grand-lakes": {
    id: "grand-lakes",
    term: "The Grand Lakes",
    aliases: ["grand lakes", "the lakes"],
    category: LAND,
    imagePath: null,
    body: `The Grand Lakes are the great fresh waters of the north, which were five in the old world and are now two, the old channels between them having widened and drowned until the separations stopped mattering. What remains is an inland sea in two parts, large enough that a crossing is a serious undertaking and the far shore is a rumor to most people who live on it.

The lakes feed the people around them and kill a portion of them every year. They give fish, fresh water, and the fastest movement available to anyone in the region, and they raise weather that turns lethal faster than a pilot can always answer. [[The Grand Lakers|The Lakers]] regard them accordingly, as a living thing that provides and punishes, and the respect paid to [[Water sense|those who work the water]] follows from that.

Behind the shore stand the old manufacturing cities, broken but far from empty. The metal, the [[The Foundry and the Cast Mark|foundry sites]], and the machines in them are the material basis of everything the Lakers make, and the reason their casting is what it is. Where a lake settlement is built on a slope, the pattern repeats itself: the town on the upper terrace, the working waterfront below it, and what grain country there is above.`,
  },

  "shortgrass": {
    id: "shortgrass",
    term: "The Shortgrass",
    aliases: ["shortgrass"],
    category: LAND,
    imagePath: null,
    body: `West of the good cropland the grass shortens and the country dries out, running up toward [[The Western High Country|the high ground]]. It will graze stock and will not reliably grow grain, and the settlements in it are fewer, further apart, and more self reliant than those to the east.

It is the ground between [[The Goldgrass Plains|the grass country]] and the western high country, which means everything moving between the two crosses it, and that traffic is most of what happens there.`,
  },

  "frontier": {
    id: "frontier",
    term: "The Frontier",
    aliases: ["frontier"],
    category: LAND,
    imagePath: null,
    body: `The frontier is not a line. It is the general condition of country beyond where any faction's arrangements reach, and it exists in every direction at once, most extensively to the south and west.

People live in it who answer to nobody. Some are there because they were pushed out, some because they went looking, and some because their settlement was simply never worth anyone's trouble to bring in. Survival without protection requires competence, and the frontier accordingly produces some of the most capable individuals on the continent along with a great many of its most dangerous. Every faction treats it as both a recruiting ground and a problem.

Word travels slowly out of the frontier and arrives incomplete. A settlement can go quiet for a season without anyone noticing, and it is not unusual for people to go out and not come back, which is remarked upon locally and rarely further.`,
  },

  // ── Cities & Settlements ──────────────────────────────────────────────────

  "korad": {
    id: "korad",
    term: "Korad",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The seat of [[The Versari Korad|the Versari Korad]], in [[The Western High Country|the western foothills]], and the place the faction takes its name from along with the old sign it was misread off. It is where the Versari keep their best work and their worst secrets, and both descriptions are used by people who have been there.`,
  },

  "dambar": {
    id: "dambar",
    term: "Dambar",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The largest city of [[The Western High Country|the western high country]], built into and over the ruins of an old world city of a similar name. It is the continent's brain and knows this about itself.

Dambar is the great prize of the west and the great question of it. [[The Versari Korad|The Versari]] are established here and their interests run through the place thoroughly, while the country around it is Dambaran ground and [[The Dambarans|Dambaran people]], who did not invite them and have never warmed to them. The two are neighbors in the closest and most uncomfortable sense: sharing a city, a watershed, and a mutual conviction that the other is the problem.

Feeding the place has never been simple and has lately been harder. Whatever Dambar cannot produce it must obtain, and the nearest source of anything is rarely one its people trust.`,
  },

  "kansit": {
    id: "kansit",
    term: "Kansit",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The commercial center of [[The Goldgrass Plains|the grass country]] and the seat of [[The Goldgrass Coalition]]. Every trade route on the plains runs through here eventually, and the city charges accordingly.`,
  },

  "omara": {
    id: "omara",
    term: "Omara",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `A northern [[The Goldgrass Coalition|Goldgrass]] city, far enough north to feel the [[The Grand Lakers|Laker]] wind and close enough to the west to feel the other kind. Its position between two spheres is the whole of its character and most of its difficulty.`,
  },

  "droit": {
    id: "droit",
    term: "Droit",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The [[The Grand Lakers|Laker]] capital, set on the straits. Whoever holds the straits holds the conversation between east and west, which is the reason the city matters and the reason it is never quite left alone.`,
  },

  "chigan": {
    id: "chigan",
    term: "Chigan",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The great industrial city of [[The Grand Lakes|the lakes]]. The factories never fully stopped, and neither did the people who depend on them. It is the source of a large share of what [[The Grand Lakers|the Lakers]] make and therefore of what the Lakers are.`,
  },

  "tin-town": {
    id: "tin-town",
    term: "Tin Town",
    aliases: ["tintown"],
    category: CITIES,
    imagePath: null,
    body: `The principal [[The Free Plainers|Free Plainer]] settlement. It looks like nothing, and that is the first mistake people make about it.`,
  },

  "the-shelf": {
    id: "the-shelf",
    term: "The Shelf",
    aliases: ["shelf"],
    category: CITIES,
    imagePath: null,
    body: `A [[The Free Plainers|Free Plainer]] [[holding]] built where it is because the ground could be defended. Someone is always trying to prove that judgment wrong.`,
  },

  "ironside": {
    id: "ironside",
    term: "Ironside",
    aliases: [],
    category: CITIES,
    imagePath: null,
    body: `The one fixed settlement of [[The Steel Traders]], and the only ground they hold outright. It is built out of what they have dragged to it: old world wrecks and hauler bodies cut apart and welded into walls, added to whenever something worth taking is brought in.

It has no market worth the name, no authority anyone would recognize, and no arrangement with anybody. What it has is walls and the people behind them. Everyone in the region knows roughly where it is, which tells you something about how much anyone fears it, and nobody has yet judged it worth the cost of finishing.`,
  },

  "unaffiliated-settlements": {
    id: "unaffiliated-settlements",
    term: "Unaffiliated Settlements",
    aliases: ["unaffiliated settlement", "unaffiliated"],
    category: CITIES,
    imagePath: null,
    body: `A number of settlements belong to no faction. Some are too small to be worth the trouble, some sit too far out, and some have simply declined every offer made to them, which is not the same thing as never having been asked.

The largest of them are known quantities on the map. One is unaffiliated by choice rather than by accident and has had offers. Another is the last stop before open water, or the first, depending which way a person is running.`,
  },

  // ── Monuments & Structures ────────────────────────────────────────────────

  "reading-spire": {
    id: "reading-spire",
    term: "The Reading Spire",
    aliases: ["reading spire"],
    category: MONUMENTS,
    imagePath: null,
    body: `The monumental structure of [[The Versari Korad|the Versari]]. It is what a people who keep and interpret the written past build when they build something meant to be looked at.`,
  },

  "elevator-range": {
    id: "elevator-range",
    term: "The Elevator Range",
    aliases: ["elevator range"],
    category: MONUMENTS,
    imagePath: null,
    body: `The [[The Goldgrass Coalition|Goldgrass]] monument, which is a working thing before it is a monument: the line of grain elevators standing over [[The Goldgrass Plains|flat country]], visible from further than anything else on the plains.`,
  },

  "pillar-of-engines": {
    id: "pillar-of-engines",
    term: "The Pillar of Engines",
    aliases: ["pillar of engines"],
    category: MONUMENTS,
    imagePath: null,
    body: `The [[The Grand Lakers|Laker]] monument, and the clearest statement any faction makes about the old world. A tall cast iron column with restored pre collapse automobiles mounted around it at intervals, spiraling upward, each one polished and lacquered. It is part trophy and part shrine, and the Lakers do not find that combination strange.`,
  },

  "hull-post": {
    id: "hull-post",
    term: "The Hull Post",
    aliases: ["hull post"],
    category: MONUMENTS,
    imagePath: null,
    body: `The [[The Free Plainers|Free Plainer]] monument: the hull of a captured [[landship]] stood upright on end and braced with cable. It is a marker, a claim, and a boast at once, and it says exactly what the Plainers think a recovered old world machine is for.`,
  },

  "silos": {
    id: "silos",
    term: "The Silos",
    aliases: ["silo", "silos", "grain silos"],
    category: MONUMENTS,
    imagePath: null,
    body: `The grain silos of [[The Goldgrass Plains|the plains]] are old world structures and the most conspicuous thing standing in flat country. Many are still sound. Some still held grain when the world ended, and fed people who would otherwise have had nothing, which is the beginning of the regard in which they are held.

They are treated as more than buildings now. Travelers mark their names on them, leave small offerings at the base, or spend a night inside when passing. None of this is organized and no one administers it. It is the ordinary way people acknowledge a thing that stood when almost nothing else did, in country where standing tall is itself remarkable.`,
  },

  // ── History ───────────────────────────────────────────────────────────────

  "pole-shift": {
    id: "pole-shift",
    term: "The Pole Shift",
    aliases: ["pole shift", "the shift", "shift"],
    category: HISTORY,
    imagePath: null,
    body: `Some two hundred years ago the world moved. What is agreed is that the ground shook hard enough to break cities past any use, that the sea rose against the far coasts, and that afterward nothing worked as it had.

What is believed, and believed almost everywhere, is that the old world did it to itself. Its people had grown so capable and so proud that their own tools turned on them. The spiritual among the plains hold this as a judgment, a wrath called down on those who reached past what people were meant to hold. [[The Versari Korad|The Versari]] say much the same thing in colder language, that the technology slipped its keepers and was not brought back under hand in time. The difference is in the vocabulary and not in the verdict.

No one holds that it might simply have been the world's own turning, arriving on a schedule that had nothing to do with anyone.`,
  },

  "after-the-shift": {
    id: "after-the-shift",
    term: "After the Shift",
    aliases: [],
    category: HISTORY,
    imagePath: null,
    body: `The dying was not mostly done by the shaking. It was done by the stopping. Food had come from far away and stopped coming, water had come from a tap and stopped running, and light and heat had come from a wire that went dark. Most people had no skill for a world without those things, and most people did not last long in it.

Those who did last had either a skill or a shelter. [[The Goldgrass Plains|The farming country of the middle continent]], which shook and flooded less than most places, kept a great many people alive on the plain fact that they knew how to feed themselves. Elsewhere, people came up out of [[The Shelters|prepared places]], some months after and some years.

Two centuries is not long, but it is long enough. The first generation or two remembered the old world and could say what a thing had been for. Everyone after that had only the stories. What survived was the habit of holding on, the restoring of buildings and machines and offices, carried forward by people who no longer knew what they were holding.`,
  },

  "shelters": {
    id: "shelters",
    term: "The Shelters",
    aliases: ["shelters", "shelter"],
    category: HISTORY,
    imagePath: null,
    body: `It is common knowledge that some saw [[The Pole Shift|the shift]] coming and built against it. Sealed places were dug and stocked, meant to carry people and seed and knowledge through to the other side. Their doors and their ruins can still be found, and a good deal of what the old world knew came back up through them.

Not all of them held. Of those that did, no two put out the same kind of people, and what a shelter contained shaped whatever grew out of it afterward. Some held soldiers and officers. Some held people of the old world's learning, with texts and machines and the training to use them. Some held those who had been powerful under the old order and expected to be powerful again.

Years underground in cramped quarters, on hard rations, with every decision heavy, tends to leave a mark on how people arrange themselves. Those marks did not stay underground.`,
  },

  "reapers": {
    id: "reapers",
    term: "The Reapers",
    aliases: ["reapers"],
    category: HISTORY,
    imagePath: null,
    body: `Two or three generations ago [[The Goldgrass Coalition]] was raided repeatedly by [[The Grand Lakers|Grand Laker]] clans and had to defend itself. In the fighting, some of its own found they had more appetite for violence than for the labor their society was built around. When the raids ended they did not go back to it. They formed a company, called themselves the Reapers, and pressed the Coalition to keep them on.

The arrangement did not last. Reaper values and Coalition values pulled apart until the two could not work together, and the Reapers began treating the towns where they were strongest as theirs to rule. They absorbed those towns more than they conquered them, and in doing so took on the townsmen who became their first men of letters and counsel.

The Reapers no longer exist under that name. What they became are [[The Free Plainers]] and [[The Steel Traders]], who share an ancestor and very little else.`,
  },

  // ── Major Factions ────────────────────────────────────────────────────────

  "versari-korad": {
    id: "versari-korad",
    term: "The Versari Korad",
    aliases: ["versari korad", "versari"],
    category: MAJOR,
    imagePath: null,
    body: `The Versari Korad are the keepers and restorers of [[Old-world Technology|old world knowledge]], seated in [[The Western High Country|the high country of the west]]. Their name comes from a sign, from the university of Colorado, read by survivors who did not entirely understand what they were reading and passed on as a name rather than a phrase. The Korad spelling is theirs; they take C and K to be the same sound and use them as they please.

Their society is ranked and the ranks are permanent, worn as tattoos that cannot be removed or hidden. Seniority carries authority, and a scholar long established is heeded over one newly raised. There is a growing sense among them that a scholar's worth can be counted in the number who follow him, though this is not yet how the faction settles its questions.

Their strength is knowledge. No other people can read the old world as they can, restore what it left, or teach it onward. Their weakness is the field. They are not many, they are not warriors, and they cannot hold ground by force against people who can. In dealing they are indirect and often underhanded, preferring [[debt|an obligation quietly held]] to a bargain plainly struck, which makes them useful to everyone and trusted by no one.`,
  },

  "grand-lakers": {
    id: "grand-lakers",
    term: "The Grand Lakers",
    aliases: ["grand lakers", "lakers", "laker"],
    category: MAJOR,
    imagePath: null,
    body: `The Grand Lakers hold the shores of [[The Grand Lakes|the merged lakes]] and the old manufacturing cities behind them. They came through [[The Pole Shift|the shift]] on the surface, in cold country, among people who already understood hard work as the price of getting through a winter.

They hold that there are two roads to honor, mastery of a craft and sheer toughness, and they respect both. Long hours, physical labor, and refusal to give in to weakness or idleness are counted as virtue in themselves. Leadership follows recognized greatness rather than office, because in the years after the shift the only people worth following were the ones who actually kept others fed and defended. They organize in clans, described in their own entry.

Their society is split between the water and the land. The lake gives food and fresh water and kills people every season with its weather, and is regarded accordingly, as something living that both provides and punishes. Those who make their lives on it are the most respected among them. Those who work the land are respected less.

Their strength is what they make and what they can endure. Their [[The Foundry and the Cast Mark|casting and metalwork]] are the finest on the continent, their arms and fortifications close to unmatched, and their fighters are produced by the culture rather than trained into it. Their weakness is each other. Clans built around great figures collide, sometimes for no better reason than to settle which is greater, and the Lakers are rarely all pointed the same way at once. United, they are the most dangerous thing in the world. They are seldom united.`,
  },

  "goldgrass-coalition": {
    id: "goldgrass-coalition",
    term: "The Goldgrass Coalition",
    aliases: ["goldgrass coalition", "goldgrass", "the coalition"],
    category: MAJOR,
    imagePath: null,
    body: `The Goldgrass Coalition is an alliance of farming communities across [[The Goldgrass Plains|the grass country of the middle continent]], and it is the food of the continent. It came together out of settlements that survived [[The Pole Shift|the shift]] largely on their own, in country that shook and flooded less than most, on the strength of knowing how to work land and feed themselves.

They take that survival as the proof of their way of living. Their culture is communal because getting through those years required neighbors, and it holds labor, provision, and good dealing as the things that matter. They are a coalition and not a state: member communities keep their own affairs, and what binds them is agreement rather than command. Their [[hall|mercantile halls]], their [[Notes, Tallies, and Barter|notes and tallies]], and their [[headwoman|village offices]] are described in their own entries.

Their strength is that everyone needs them. They produce food and fine handcraft at a scale no one else approaches, which makes them the ally every faction would like to have. Their weakness is that they cannot defend it. Their fighting men are [[levy|levied]] farmers rather than soldiers, and their neighbors know it, so the same abundance that makes them desirable as friends makes them worth taking from. Being needed has never protected them from being pressed.`,
  },

  "free-plainers": {
    id: "free-plainers",
    term: "The Free Plainers",
    aliases: ["free plainers", "plainers", "free plainer"],
    category: MAJOR,
    imagePath: null,
    body: `The Free Plainers hold scattered country across the plains under [[baron|barons]] and lords, in something close to a feudal arrangement, and they are less a faction than a great many local powers wearing one name.

Their stock is mixed. Some of their holders descend from the powerful of the old world, who came up from [[The Shelters|their shelters]] expecting authority and found that the offices and machinery that had granted it were gone, so that they had to become personal and cunning about power instead. Their descendants inherited the estates without necessarily inheriting the edge that won them, and a baron who never had to fight for what he holds is often blunt where his grandfather was sharp. Others rose the other way, mercenary captains out of [[The Reapers|the Reapers]] who gathered enough followers to take a [[holding]] and keep it. Both roads end at the same chair and the two are long since blended.

What they hold in common is the conviction that freedom comes before everything and that those with strength and cunning ought to rule. They celebrate the individual over the group and produce champions rather than institutions. Their strength is that they cannot be pinned down, being everywhere and answerable to no center. Their weakness is the same fact. They have no unity to call on, no body that can commit them to anything, and they will fight enemies and betray allies alike rather than let themselves be put under anyone.`,
  },

  // ── Minor Factions ────────────────────────────────────────────────────────

  "dambarans": {
    id: "dambarans",
    term: "The Dambarans",
    aliases: ["dambarans", "dambaran"],
    category: MINOR,
    imagePath: null,
    body: `The Dambarans are the people of [[The Western High Country|the western high country]], holding the hard ground around [[Dambar]] and a share of the city itself, near neighbors to [[The Versari Korad|the Versari]] and their opposites in nearly every respect.

They are a distinct people in this era and insist on it. The Versari are established in Dambar and their interests run all through it, which the Dambarans did not consent to and have not accepted. What the later world will make of that arrangement is not yet decided here. At present there are two peoples in one city, and only one of them thinks the matter is settled.

They are a mixed people by origin. Their martial tradition and their sense of rank came up out of [[The Shelters|the military shelters]] of that region, carried by officers who meant to keep the old codes of service alive. That met a surface population who had endured the same brutal country above ground, and who had watched the Versari emerge and disliked what they saw. Much of what the Dambarans are was formed in answer to that, so that where the Versari are indirect the Dambarans are plain, and where the Versari deal in what is useful the Dambarans deal in what is true.

They hold honor and truth above advantage. Their country is dry, harsh, and unforgiving, which has made them tough and bound them tightly together, since survival there has always required a community that holds. They are deeply distrustful of outsiders, and of the Versari most of all.

Their strength is martial skill and reliability. Few peoples fight as well, and a Dambaran's word is taken seriously by those who would take no one else's. Their weakness is numbers and reach. There are not many of them, they hold little sway over the larger powers, and there are gaps in what they can do for themselves that they cannot close alone.`,
  },

  "clan-tempest": {
    id: "clan-tempest",
    term: "Clan Tempest",
    aliases: ["tempest"],
    category: MINOR,
    imagePath: null,
    body: `Clan Tempest is among the most powerful of the [[The Grand Lakers|Grand Laker]] clans, and by the reckoning of many the first among them.

Their name rests on deeds in each of the things Lakers value. Their forges are credited with casting work no one since has matched, held up as the standard other smiths are measured against. They are said to have broken a major incursion at a lakeside chokepoint, holding against numbers that should have rolled over them. One of their captains is said to have made a crossing between the far waters through weather that ought to have killed the crew, proving a passage others use now. And they are known for having taken in a beaten rival band whole, turning enemies into clan, which is the thing a Laker clan is supposed to be able to do and which many cannot.

They are brash in a way that makes proud people look modest, and that brashness is at once the source of their standing and the reason so many will not accept it. Their strength is genuine accomplishment across craft, war, and water, and a name that draws capable people to them. Their weakness is that their manner divides the very people whose recognition their claim depends on.`,
  },

  "croppers": {
    id: "croppers",
    term: "The Croppers",
    aliases: ["croppers", "cropper"],
    category: MINOR,
    imagePath: null,
    body: `The Croppers are the communities of [[The Goldgrass Plains|the grass country]] that never joined [[The Goldgrass Coalition|the Coalition]]. When the Goldgrass began drawing together, those settlements that had leaned furthest into the spiritual stayed out, and every generation since has carried them further in that direction.

They put harmony with the land and the life of the spirit above material matters, and their way of working the ground feeds them well, so that they are seldom hungry in a country where others are. They keep the older practices the Coalition has drifted from and say so loudly, being outspoken about that drift and not easy company for anyone who disagrees.

They are consulted for counsel and for visions, and people travel to them for it. Their standing is a grudging one all the same. Their [[The Gifts|gifts]] are real enough that their neighbors put up with them, which is roughly where they sit: tolerated for what they can see, endured for what they will say. They are not violent, and among neighbors who prefer the sword to the hoe that leaves them exposed.`,
  },

  "steel-traders": {
    id: "steel-traders",
    term: "The Steel Traders",
    aliases: ["steel traders", "steel trader"],
    category: MINOR,
    imagePath: null,
    body: `The Steel Traders are the other half of what [[The Reapers|the Reapers]] became, the ones with no use for philosophy, faith, custom, or any of the rest of it. Their name comes from the demand they make of everyone they meet, that steel be traded for steel.

They live in scattered bands, settled rather than wandering, holding what they have taken and fortifying it out of whatever the old world left lying about. One place is theirs outright: [[Ironside]], a fixed settlement and a byword for disorder. They live by violence because they have never built the means to live any other way, and they eat and clothe themselves chiefly because the larger powers occasionally need brutal men and will pay for them.

They are shrinking. Any child of theirs born with sense leaves at the first chance for the nearest [[The Free Plainers|Free Plainer]] settlement, which leaves behind the hardest and least reflective to carry on. Their strength is that they are dangerous and willing, and cheap to hire. Their weakness is everything else. It is widely assumed they will be finished before long, whether by their own hand or someone else's.`,
  },

  // ── Perceptive Gifts ──────────────────────────────────────────────────────

  "the-gifts": {
    id: "the-gifts",
    term: "The Gifts",
    aliases: ["gifts", "gift", "perceptive gifts", "the perceptive gifts"],
    category: GIFTS,
    imagePath: null,
    body: `Across the continent there are people who perceive more than they should be able to. They sense what is coming, read what is not shown, and know things they cannot account for having learned. This is not regarded as miraculous. It is taken as a human capacity unevenly given out, the way some people see further or hear better, and the argument is over how much weight to put on it rather than whether it exists.

Every people has its own name for it and its own way of holding it, shaped by what that people does. Where a culture leans openly on the gift it names it plainly. Where a culture would rather not admit to relying on such a thing, it goes by quieter words and is spoken of as experience or instinct. Those who have it tend to recognize each other, whatever they are called and wherever they were born.`,
  },

  "readers": {
    id: "readers",
    term: "Readers",
    aliases: ["reader"],
    category: GIFTS,
    imagePath: null,
    body: `Readers are the practitioners of the plains, and among the plains peoples they operate in the open. A Reader perceives at distance: the mood of an approaching party, the character of a place before reaching it, the disturbance in a stretch of country that has something wrong with it.

They are consulted before decisions the way one consults anyone with a skill worth having, and their word is taken seriously without being taken as sacred. Communities keep them, feed them, and are careful with them. [[The Croppers]] are the extreme case of the same current, a whole people organized around it, but the Reader tradition itself is broader and older than any one settlement's version of it.`,
  },

  "water-sense": {
    id: "water-sense",
    term: "Water sense",
    aliases: ["watersense"],
    category: GIFTS,
    imagePath: null,
    body: `Water sense is the [[The Grand Lakers|Laker]] gift, and it belongs to [[The Grand Lakes|the lake]]. The people who move on that water in fog, ice, and sudden weather come to know things about it they cannot demonstrate: a storm read out of a sky that shows nothing, a safe course held through conditions that hide the shore.

Lakers do not usually call it a [[The Gifts|gift]]. A pilot who has it will say he pays attention. The claim is modest and the results are not, and among a people who revere the lake as a living thing that provides and punishes, a pilot with water sense is treated with a respect that borders on the religious even by those who would deny believing in anything of the sort.`,
  },

  "deep-reading": {
    id: "deep-reading",
    term: "Deep reading",
    aliases: [],
    category: GIFTS,
    imagePath: null,
    body: `Deep reading is the [[The Versari Korad|Versari]] term, used among themselves and rarely outside. It grew out of the work: years spent over damaged and incomplete texts breeds in the best of them a knack for sensing the shape of what is missing, for knowing which reading is the right one before the evidence has settled it.

The same capacity turns up in those who spend their lives reading rooms and negotiating partners, and it is put to that use as often as to scholarship. The Versari have never formally acknowledged any of this, which has not stopped them relying on it. A scholar known to be right more often than his evidence explains accumulates a reputation of a particular kind, and among themselves they have a quiet vocabulary of understatement for saying so.`,
  },

  "field-reading": {
    id: "field-reading",
    term: "Field reading",
    aliases: [],
    category: GIFTS,
    imagePath: null,
    body: `Field reading is the warrior's version, kept chiefly by [[The Dambarans|the Dambarans]] and honored openly in [[The Grand Lakers|Laker]] military culture. It is the sense of violence before it arrives: knowing where a room is about to break, reading the shape of a fight while it is still forming, standing in the right place a moment before there is any reason to.

Warrior traditions have carried something like it for as long as anyone has records of, and it is taught as much as it is inherited, in the sense that the training brings it out in those who have it. Commanders whose decisions look prophetic afterward are the celebrated cases. The Dambarans regard it as inseparable from the rest of their discipline and do not make a mystery of it.`,
  },

  // ── Titles & Roles ────────────────────────────────────────────────────────

  "factor": {
    id: "factor",
    term: "Factor",
    aliases: ["factors"],
    category: TITLES,
    imagePath: null,
    body: `A factor is a [[hall]]'s agent in the field, carrying delegated authority to price goods, make contracts, and settle accounts on the hall's behalf without sending back for approval. What the factor commits, the hall is held to.

The office covers an enormous range. A junior factor may work a folding table at the edge of a market, buying grain in small lots against a book. A senior one may arrive in person, with an [[escort]], to conclude something a hall has been arranging for a season. Both bind the hall equally in principle, though a counterparty who cannot tell the difference will usually find out.

The appointment is made by the hall and can be withdrawn by it. A factor's word binds the hall for as long as the appointment stands, which is why the ending of one is announced as carefully as the making.`,
  },

  "baron": {
    id: "baron",
    term: "Baron",
    aliases: ["barons", "barony", "baronies"],
    category: TITLES,
    imagePath: null,
    body: `A baron is a [[The Free Plainers|Free Plainer]] holder who has taken the title rather than received it. There is no body among the Plainers that grants it, no authority that could withhold it, and none that could take it away. A man is a baron because he says so and because enough armed men agree.

What stands behind the title is the [[holding]]: a walled estate, the ground around it, and more men than the word itself would suggest. That is the whole of it. The interesting thing about a Plainer barony is not that the title is empty, which everyone knows, but that it is honored anyway. In country with no court and no crown, a title backed by a wall and a garrison is as good as one backed by a charter, and rather more reliable.`,
  },

  "colonel": {
    id: "colonel",
    term: "Colonel",
    aliases: [],
    category: TITLES,
    imagePath: null,
    body: `Colonel is a rank from an organization that no longer exists. Where it survives, it survives in one of two ways: carried down from the old service structures that came up out of [[The Shelters|the shelters]], or given informally to a man whose conduct has earned it from the people around him.

It is worth setting beside the Plainer [[baron|baronies]]. One title is claimed by the man who holds it and honored by others because he can enforce it. The other is often refused by the man it is applied to and used by everyone else regardless. Which of the two commands more actual obedience is not a settled question, and the answer tends to depend on which side of a wall you are standing.`,
  },

  "headwoman": {
    id: "headwoman",
    term: "Headwoman",
    aliases: ["headwomen"],
    category: TITLES,
    imagePath: null,
    body: `A headwoman is the authority of a single [[The Goldgrass Coalition|Goldgrass]] village, either elected by it or simply grown into the position through the community's consent. Her power over her own village is real. She holds its common fund, speaks for it in dealings with [[hall|halls]] and neighbors, and settles what needs settling within it.

Her power ends at the village boundary and it ends at the bottom of the fund. A village fund is one fund, and it will do one thing. A headwoman choosing to spend it has chosen against every other thing it might have done, and she will hear about that choice for years. The office carries a great deal of responsibility and very little reach, which is the ordinary shape of authority in a coalition of communities that have not surrendered anything to a center.`,
  },

  "steward": {
    id: "steward",
    term: "Steward",
    aliases: ["stewards"],
    category: TITLES,
    imagePath: null,
    body: `A steward keeps a household's or a granary's accounts, holds the stores, and records what comes in and goes out.

In practice the office decides far more than its description suggests. The steward controls what is written down, in what quantity, and in which currency it is reckoned. A store recorded in [[Notes, Tallies, and Barter|notes]] and a store recorded in [[scrap]] are the same grain and not the same asset. A steward who is trusted is rarely checked, and a steward who is checked is usually being checked too late. Households that have learned this the hard way keep the counting and the holding in separate hands, and most households have not learned it.`,
  },

  "the-trades": {
    id: "the-trades",
    term: "The Trades",
    aliases: ["trades"],
    category: TITLES,
    imagePath: null,
    body: `Certain trades are not background in this era. They make decisions, and they are dealt with as powers in their own right.

A settlement with one smith has a strategic asset and a man who knows he is one. The same is true of a joiner where timber work must hold, and of a quartermaster who knows what a column actually has rather than what its commander believes it has. These people are courted, retained, and occasionally taken. What separates a trade from a mere occupation here is whether the thing can be done by someone else within reach, and for a great many settlements the answer is no.`,
  },

  // ── Institutions & Instruments ────────────────────────────────────────────

  "hall": {
    id: "hall",
    term: "Hall",
    aliases: ["halls", "mercantile hall", "mercantile halls"],
    category: INST,
    imagePath: null,
    body: `A hall is a [[The Goldgrass Coalition|Goldgrass]] mercantile institution, and it is the most commonly used and least explained term in [[The Goldgrass Plains|the grass country]]. A hall issues currency, extends credit, holds contracts, hires labor and armed men, and stands behind the word of its [[factor|factors]].

It is not a government. It commands no territory and no allegiance, and it cannot compel a village to do anything. It is also not a guild, since it is not an association of one trade protecting its own. It is closer to a house that deals in obligation: it makes promises that are good, and its whole standing rests on their continuing to be good.

Halls are the practical machinery of the Coalition, doing much of what a state would do in a place that has no state. A Coalition that cannot [[levy]] effectively can still move grain across the continent, because the halls move it.`,
  },

  "the-seat": {
    id: "the-seat",
    term: "The Seat",
    aliases: ["seat"],
    category: INST,
    imagePath: null,
    body: `The seat is where a holder's rulings are handed down. It is not a building and not a room. It is the office itself, and a holder carries it wherever he happens to be sitting when he decides something.

Because the seat is an office rather than a place, it can be contested by anyone who begins doing the same work and is heeded. A woman hearing disputes in her own front room for a fee is not committing an offense against anything. She is offering the same service in competition, and if people bring their disputes to her instead, the practical content of the seat has moved regardless of who holds the name of it.`,
  },

  "assize": {
    id: "assize",
    term: "Assize",
    aliases: ["assizes"],
    category: INST,
    imagePath: null,
    body: `An assize is a sitting at which disputes are heard, called for the purpose and ended when the business is done. It gathers the parties, whatever witnesses can be produced, and whoever will be doing the deciding.

There is no standing court anywhere on the continent, which is why the word describes an event rather than an institution. An assize happens because someone with enough standing calls one and enough people agree to attend.`,
  },

  "holding": {
    id: "holding",
    term: "Holding",
    aliases: ["holdings"],
    category: INST,
    imagePath: null,
    body: `A holding is the basic unit of land tenure: the ground, what stands on it, and what is owed on account of it.

The obligations travel with the ground. A holding that passes to a new hand passes with its [[debt|debts]], its standing contracts, and whatever was promised by whoever held it before, and the new holder inherits the lot whether or not he knew of them. This is the ordinary way arrangements outlive the people who made them, and it is a common way for a person to find himself bound to a bargain he never struck and would never have made.`,
  },

  "notes-tallies-barter": {
    id: "notes-tallies-barter",
    term: "Notes, Tallies, and Barter",
    aliases: ["notes", "note", "tally", "tallies", "barter"],
    category: INST,
    imagePath: null,
    body: `Three ways of settling a debt, used side by side.

[[Scrap]] is what everything is actually worth. It is the measure every people reckons in, the thing a price is quoted in whether or not any metal changes hands, and the only settlement anyone will take without knowing who is offering it. Most of the continent barters directly, goods against goods, with scrap as the yardstick.

The instruments below are conveniences laid over that, used where the parties know each other well enough to accept paper. They save carrying weight. They do not replace what the weight is worth.

The [[The Goldgrass Coalition|Goldgrass]] [[hall|halls]] issue printed notes. A note is a promise by the hall that issued it, redeemable at that hall for goods or scrap, and worth what people believe about that hall. Notes circulate in the grass country because they are light and because hall credit has generally been good. They travel poorly. The further from the issuing hall a note gets, the more it is discounted, and outside Coalition country most people will not take one at all.

A tally is written by a holder against a reserve kept with a hall. It is a private instrument backed by someone else's stock, and its worth depends on two beliefs holding at once: that the holder is good for it, and that the reserve exists as claimed. When a tally is presented and the reserve is not there, what happens next is a matter between the holder and whoever is holding the paper, and there is no court to take it to.`,
  },

  "debt": {
    id: "debt",
    term: "Debt",
    aliases: ["debts"],
    category: INST,
    imagePath: null,
    body: `Debt means two different things depending on who is owed.

The [[The Goldgrass Coalition|Goldgrass]] kind is written. It is entered in a book, it has terms, and it can be sold, inherited, or presented for payment by someone the debtor has never met.

The [[The Versari Korad|Versari]] kind is not written anywhere. Nothing is recorded, no term is set, and no sum is named. The obligation is simply remembered, by people whose profession is remembering, and it is called in at a moment of the creditor's choosing for an amount the creditor decides is proportionate. A written debt can be discharged. An unwritten one is discharged when the holder says it is.`,
  },

  "levy": {
    id: "levy",
    term: "Levy",
    aliases: ["levies", "levied"],
    category: INST,
    imagePath: null,
    body: `A levy is how a coalition without an army raises men. Villages send what they can spare, for a season or for a stated purpose, and the men come as they are.

It shows. A levy carries farm tools as often as arms, knows the ground it grew up on and none beyond it, and counts the weeks until harvest the entire time it is away. Levied men will fight hard for their own country and are difficult to keep in the field once the immediate danger has passed, because every one of them has work waiting that no one else is doing. This is the reason [[The Goldgrass Coalition|the Coalition]]'s numbers on paper and its strength in the field are two different figures.`,
  },

  "claim": {
    id: "claim",
    term: "Claim",
    aliases: ["claims"],
    category: INST,
    imagePath: null,
    body: `A claim is a [[The Free Plainers|Free Plainer]] assertion of right to land. It is made by declaring it, and it is maintained by holding the ground.

There is no court to hear a claim, no register to record it, and no body with authority to decide between two of them. Three legitimate claims can therefore exist over the same quarter section at once, each perfectly sound by its own account, and all three claimants may be entirely sincere. Such matters are settled by negotiation, purchase, marriage, or force, and the settlement lasts exactly as long as the party who won it can keep it.`,
  },

  "escort": {
    id: "escort",
    term: "Escort",
    aliases: ["escorts"],
    category: INST,
    imagePath: null,
    body: `An escort is the retained guard that moves with a [[specialist]]. It is not usually hired by the specialist.

The arrangement runs the other way: the party currently holding a specialist's services hires the escort, retains it until the specialist is delivered to whoever has them next, and takes the cost out of the specialist's earnings. The escort's duty is to deliver its charge intact, which means protecting the specialist from harm and from departure with equal diligence. A great deal of the continent's most valuable knowledge travels in this fashion, guarded and not free.`,
  },

  // ── Customs & Places ──────────────────────────────────────────────────────

  "hollow": {
    id: "hollow",
    term: "The Hollow",
    aliases: ["hollow", "hollows"],
    category: CUSTOMS,
    imagePath: null,
    body: `A hollow is the [[The Croppers|Cropper]] settlement form: a community set into low ground rather than raised on it, worked outward from the center. The arrangement suits how they hold land and how they gather, and it makes their settlements notably hard to see across flat country until one is nearly in among them.`,
  },

  "the-rite": {
    id: "the-rite",
    term: "The Rite",
    aliases: ["rite"],
    category: CUSTOMS,
    imagePath: null,
    body: `[[The Croppers]]' central observance. It has a season and an hour, both fixed, and the hour is not the one an outsider would guess. There is a second hour that can be named if someone asks properly, and asking properly is most of the difficulty.

The rite is conducted in the open and is not concealed, but it is not performed for observers either, and interrupting one is taken seriously. Those who have watched from a distance generally report that nothing much appears to happen.`,
  },

  "numerals-not-words": {
    id: "numerals-not-words",
    term: "Numerals, Not Words",
    aliases: [],
    category: CUSTOMS,
    imagePath: null,
    body: `A building convention: a crew cuts its count into the ridge beam and never its names. A beam reading nine means nine hands raised the roof, and that is the whole of the record.

The reason given is that the building outlasts the names and it is dishonest to put on it a claim it cannot keep. What lasts is the fact of the work and the number who did it. Reading old beams is one of the few ways to judge how large a settlement's working population was at the time a thing was built, which makes the convention useful to more people than intended it.`,
  },

  "the-grade": {
    id: "the-grade",
    term: "The Grade",
    aliases: ["grade"],
    category: CUSTOMS,
    imagePath: null,
    body: `The grade is old road, treated as a resource class rather than a route. Where the surface has gone the bed beneath it often has not: still level, still draining, still holding a line across country that would otherwise have to be fought through.

It is used in three ways at once. It is traveled, because a column on grade moves faster than a column off it. It is quarried, for the stone and material in it. And it is fought over, since a stretch of good grade is worth more than the ground on either side of it. Quarrying a grade destroys it for travel, which is a decision someone makes locally and everyone downstream lives with.`,
  },

  "waystation-and-ford": {
    id: "waystation-and-ford",
    term: "Waystation and Ford",
    aliases: ["waystation", "waystations", "ford", "fords"],
    category: CUSTOMS,
    imagePath: null,
    body: `The two pieces of infrastructure that shape overland movement.

A waystation is a fixed stopping point on a route, holding water, shelter, and whatever an operator provides. Routes exist where waystations exist, because the distance between them sets what a day's travel can be.

A ford is where a crossing is possible, and crossings are rare enough that they decide the shape of a campaign. Everything moving through a region converges on the same few, which makes a ford the natural place to trade, to [[levy]] a toll, or to wait for someone. A column that cannot cross where it intended may lose a great deal of time going to where it can.`,
  },

  "foundry-cast-mark": {
    id: "foundry-cast-mark",
    term: "The Foundry and the Cast Mark",
    aliases: ["foundry", "foundries", "cast mark"],
    category: CUSTOMS,
    imagePath: null,
    body: `[[The Grand Lakers|Laker]] manufacturing identity, and a matter of pride rather than record keeping.

A foundry forms its numerals raised in the mold itself rather than stamping them afterward, so the mark is part of the casting and cannot be removed without destroying the piece. The seam is left unground. A Laker will tell you that grinding a seam is hiding the work, and that a piece with its seam showing is a piece whose maker is willing to be known by it. The practical consequence is that Laker work is identifiable to its foundry across the continent and long after the people who cast it are gone.`,
  },
};

// The merged view every screen consumes. Three sources, and the order is the
// precedence: repo lore first, then the editor's export (which wins on an id
// collision, so an entry migrated into the editor can be retired here at
// leisure), then the rules glossary LAST.
//
// The rules glossary goes last on purpose. Its ids are all `r-` prefixed and
// scripts/check-glossary.mjs asserts it shares no term or alias with the lore,
// so in practice it collides with nothing — being last means that if somebody
// ever authors lore that does collide, the mechanics entry is the one the
// screen's own underlined word still resolves to.
export const WIKI_ENTRIES = {
  ...REPO_WIKI_ENTRIES,
  ...EXPORTED_WIKI_ENTRIES,
  ...RULES_GLOSSARY,
};
