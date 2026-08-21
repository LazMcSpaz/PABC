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
const HISTORY = "History";
const MAJOR = "Major Factions";
const MINOR = "Minor Factions";
const GIFTS = "Perceptive Gifts";

export const REPO_WIKI_ENTRIES = {
  // ── Technology & Vehicles ─────────────────────────────────────────────────

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

[[Versari]] vessels run on the sun. They are light by necessity, since every pound is a pound the panels must carry, and they falter under long cloud and carry little. [[Grand Lakers|Laker]] vessels are old machines of the manufacturing cities, stripped and rebuilt and kept running on [[ethanol]] the Lakers distill themselves, which binds how far they range to how much fuel they can make. The [[Goldgrass Coalition|Goldgrass]] and the [[Free Plainers]] keep to horse and wagon, with relays of fresh animals staged along the routes they use most. This is slower than an engine, but fed by grass that grows back.

All of them move at the pace of the worst ground between here and there. Overland travel is measured in patience, and a ford or an old roadbed can decide a season.`,
  },

  "sun-runner": {
    id: "sun-runner",
    term: "Sun Runner",
    aliases: ["sun runners", "sunrunner"],
    category: TECH,
    imagePath: null,
    body: `The Sun Runner is the lightest of the [[Versari]] solar [[land vessel|vessels]], a three-wheeled machine that carries one rider and little else, built around a spread of old-world panels and almost nothing besides. It is the first vessel most Versari agents in the field are given: quick over open ground, silent, and useless the moment the sky closes over or the load grows.

Its heavier kin, the haulers, trade that speed for a bed and a frame that can carry cargo, the same principle and the same power shaped to a different purpose. The Versari name the whole line for the sun that drives it. A rider on the horizon in a low, humming trike, going faster than a horse and raising no dust, is a sight the plains have learned to know.`,
  },

  "ethanol": {
    id: "ethanol",
    term: "Ethanol",
    aliases: [],
    category: TECH,
    imagePath: null,
    body: `Ethanol is the fuel the [[Grand Lakers]] make to run their vehicles. The old machines they prize will not move without it, and unlike the sun it does not simply arrive. It must be grown, fermented, and distilled, which ties a Laker column's reach to its supply as surely as an army is tied to its bread. A well-fueled Laker [[land vessel|vessel]] outpaces and outlasts a solar one; a Laker vessel run dry is [[scrap]] that happens to be shaped like a car.`,
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
    body: `Scrap is the salvage the whole era is built on, the metal, wire, glass, and working parts pulled from the ruins and the wrecks. It is the base of every trade that matters: what a smith reforges, what a [[specialist]] reworks, what a faction spends to better its [[land vessel|vessels]] and its tools. It is also finite. Nothing new is being made, only found, and the easy finds are long gone, so scrap is hoarded, fought over, and paid out carefully. Where the [[Goldgrass Coalition|Goldgrass]] halls keep wealth in printed notes, most of the continent keeps it in scrap.`,
  },

  // ── History ───────────────────────────────────────────────────────────────

  "pole-shift": {
    id: "pole-shift",
    term: "The Pole Shift",
    aliases: ["pole shift", "the shift", "shift"],
    category: HISTORY,
    imagePath: null,
    body: `Some two hundred years ago the world moved. What is agreed is that the ground shook hard enough to break cities past any use, that the sea rose against the far coasts, and that afterward nothing worked as it had.

What is believed, and believed almost everywhere, is that the old world did it to itself. Its people had grown so capable and so proud that their own tools turned on them. The spiritual among the plains hold this as a judgment, a wrath called down on those who reached past what people were meant to hold. The [[Versari]] say much the same thing in colder language, that the technology slipped its keepers and was not brought back under hand in time. The difference is in the vocabulary and not in the verdict.

No one holds that it might simply have been the world's own turning, arriving on a schedule that had nothing to do with anyone.`,
  },

  "after-the-shift": {
    id: "after-the-shift",
    term: "After the Shift",
    aliases: [],
    category: HISTORY,
    imagePath: null,
    body: `The dying was not mostly done by the shaking. It was done by the stopping. Food had come from far away and stopped coming, water had come from a tap and stopped running, and light and heat had come from a wire that went dark. Most people had no skill for a world without those things, and most people did not last long in it.

Those who did last had either a skill or a shelter. The farming country of the middle continent, which shook and flooded less than most places, kept a great many people alive on the plain fact that they knew how to feed themselves. Elsewhere, people came up out of [[The Shelters|prepared places]], some months after and some years.

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
    body: `Two or three generations ago the [[Goldgrass Coalition]] was raided repeatedly by [[Grand Lakers|Grand Laker]] clans and had to defend itself. In the fighting, some of its own found they had more appetite for violence than for the labor their society was built around. When the raids ended they did not go back to it. They formed a company, called themselves the Reapers, and pressed the Coalition to keep them on.

The arrangement did not last. Reaper values and Coalition values pulled apart until the two could not work together, and the Reapers began treating the towns where they were strongest as theirs to rule. They absorbed those towns more than they conquered them, and in doing so took on the townsmen who became their first men of letters and counsel.

The Reapers no longer exist under that name. What they became are the [[Free Plainers]] and the [[Steel Traders]], who share an ancestor and very little else.`,
  },

  // ── Major Factions ────────────────────────────────────────────────────────

  "versari-korad": {
    id: "versari-korad",
    term: "The Versari Korad",
    aliases: ["versari korad", "versari", "korad"],
    category: MAJOR,
    imagePath: null,
    body: `The Versari Korad are the keepers and restorers of [[old-world technology|old world knowledge]], seated in the high country of the west. Their name comes from a sign, from the university of Colorado, read by survivors who did not entirely understand what they were reading and passed on as a name rather than a phrase. The Korad spelling is theirs; they take C and K to be the same sound and use them as they please.

Their society is ranked and the ranks are permanent, worn as tattoos that cannot be removed or hidden. Seniority carries authority, and a scholar long established is heeded over one newly raised. There is a growing sense among them that a scholar's worth can be counted in the number who follow him, though this is not yet how the faction settles its questions.

Their strength is knowledge. No other people can read the old world as they can, restore what it left, or teach it onward. Their weakness is the field. They are not many, they are not warriors, and they cannot hold ground by force against people who can. In dealing they are indirect and often underhanded, preferring an obligation quietly held to a bargain plainly struck, which makes them useful to everyone and trusted by no one.`,
  },

  "grand-lakers": {
    id: "grand-lakers",
    term: "The Grand Lakers",
    aliases: ["grand lakers", "lakers", "laker"],
    category: MAJOR,
    imagePath: null,
    body: `The Grand Lakers hold the shores of the merged lakes and the old manufacturing cities behind them. They came through [[The Pole Shift|the shift]] on the surface, in cold country, among people who already understood hard work as the price of getting through a winter.

They hold that there are two roads to honor, mastery of a craft and sheer toughness, and they respect both. Long hours, physical labor, and refusal to give in to weakness or idleness are counted as virtue in themselves. Leadership follows recognized greatness rather than office, because in the years after the shift the only people worth following were the ones who actually kept others fed and defended. They organize in clans, described in their own entry.

Their society is split between the water and the land. The lake gives food and fresh water and kills people every season with its weather, and is regarded accordingly, as something living that both provides and punishes. Those who make their lives on it are the most respected among them. Those who work the land are respected less.

Their strength is what they make and what they can endure. Their casting and metalwork are the finest on the continent, their arms and fortifications close to unmatched, and their fighters are produced by the culture rather than trained into it. Their weakness is each other. Clans built around great figures collide, sometimes for no better reason than to settle which is greater, and the Lakers are rarely all pointed the same way at once. United, they are the most dangerous thing in the world. They are seldom united.`,
  },

  "goldgrass-coalition": {
    id: "goldgrass-coalition",
    term: "The Goldgrass Coalition",
    aliases: ["goldgrass coalition", "goldgrass", "the coalition"],
    category: MAJOR,
    imagePath: null,
    body: `The Goldgrass Coalition is an alliance of farming communities across the grass country of the middle continent, and it is the food of the continent. It came together out of settlements that survived [[The Pole Shift|the shift]] largely on their own, in country that shook and flooded less than most, on the strength of knowing how to work land and feed themselves.

They take that survival as the proof of their way of living. Their culture is communal because getting through those years required neighbors, and it holds labor, provision, and good dealing as the things that matter. They are a coalition and not a state: member communities keep their own affairs, and what binds them is agreement rather than command. Their mercantile halls, their notes and tallies, and their village offices are described in their own entries.

Their strength is that everyone needs them. They produce food and fine handcraft at a scale no one else approaches, which makes them the ally every faction would like to have. Their weakness is that they cannot defend it. Their fighting men are levied farmers rather than soldiers, and their neighbors know it, so the same abundance that makes them desirable as friends makes them worth taking from. Being needed has never protected them from being pressed.`,
  },

  "free-plainers": {
    id: "free-plainers",
    term: "The Free Plainers",
    aliases: ["free plainers", "plainers", "free plainer"],
    category: MAJOR,
    imagePath: null,
    body: `The Free Plainers hold scattered country across the plains under barons and lords, in something close to a feudal arrangement, and they are less a faction than a great many local powers wearing one name.

Their stock is mixed. Some of their holders descend from the powerful of the old world, who came up from [[The Shelters|their shelters]] expecting authority and found that the offices and machinery that had granted it were gone, so that they had to become personal and cunning about power instead. Their descendants inherited the estates without necessarily inheriting the edge that won them, and a baron who never had to fight for what he holds is often blunt where his grandfather was sharp. Others rose the other way, mercenary captains out of [[The Reapers|the Reapers]] who gathered enough followers to take a holding and keep it. Both roads end at the same chair and the two are long since blended.

What they hold in common is the conviction that freedom comes before everything and that those with strength and cunning ought to rule. They celebrate the individual over the group and produce champions rather than institutions. Their strength is that they cannot be pinned down, being everywhere and answerable to no center. Their weakness is the same fact. They have no unity to call on, no body that can commit them to anything, and they will fight enemies and betray allies alike rather than let themselves be put under anyone.`,
  },

  // ── Minor Factions ────────────────────────────────────────────────────────

  "dambarans": {
    id: "dambarans",
    term: "The Dambarans",
    aliases: ["dambarans", "dambaran"],
    category: MINOR,
    imagePath: null,
    body: `The Dambarans hold Dambar and the hard high country around it, near neighbors to the [[Versari]] and their opposites in nearly every respect.

They are a mixed people by origin. Their martial tradition and their sense of rank came up out of the [[The Shelters|military shelters]] of that region, carried by officers who meant to keep the old codes of service alive. That met a surface population who had endured the same brutal country above ground, and who had watched the Versari emerge and disliked what they saw. Much of what the Dambarans are was formed in answer to that, so that where the Versari are indirect the Dambarans are plain, and where the Versari deal in what is useful the Dambarans deal in what is true.

They hold honor and truth above advantage. Their country is dry, harsh, and unforgiving, which has made them tough and bound them tightly together, since survival there has always required a community that holds. They are deeply distrustful of outsiders, and of the Versari most of all.

Their strength is martial skill and reliability. Few peoples fight as well, and a Dambaran's word is taken seriously by those who would take no one else's. Their weakness is numbers and reach. There are not many of them, they hold little sway over the larger powers, and there are gaps in what they can do for themselves that they cannot close alone.`,
  },

  "clan-tempest": {
    id: "clan-tempest",
    term: "Clan Tempest",
    aliases: ["tempest"],
    category: MINOR,
    imagePath: null,
    body: `Clan Tempest is among the most powerful of the [[Grand Lakers|Grand Laker]] clans, and by the reckoning of many the first among them.

Their name rests on deeds in each of the things Lakers value. Their forges are credited with casting work no one since has matched, held up as the standard other smiths are measured against. They are said to have broken a major incursion at a lakeside chokepoint, holding against numbers that should have rolled over them. One of their captains is said to have made a crossing between the far waters through weather that ought to have killed the crew, proving a passage others use now. And they are known for having taken in a beaten rival band whole, turning enemies into clan, which is the thing a Laker clan is supposed to be able to do and which many cannot.

They are brash in a way that makes proud people look modest, and that brashness is at once the source of their standing and the reason so many will not accept it. Their strength is genuine accomplishment across craft, war, and water, and a name that draws capable people to them. Their weakness is that their manner divides the very people whose recognition their claim depends on.`,
  },

  "croppers": {
    id: "croppers",
    term: "The Croppers",
    aliases: ["croppers", "cropper"],
    category: MINOR,
    imagePath: null,
    body: `The Croppers are the communities of the grass country that never joined [[Goldgrass Coalition|the Coalition]]. When the Goldgrass began drawing together, those settlements that had leaned furthest into the spiritual stayed out, and every generation since has carried them further in that direction.

They put harmony with the land and the life of the spirit above material matters, and their way of working the ground feeds them well, so that they are seldom hungry in a country where others are. They keep the older practices the Coalition has drifted from and say so loudly, being outspoken about that drift and not easy company for anyone who disagrees.

They are consulted for counsel and for visions, and people travel to them for it. Their standing is a grudging one all the same. Their [[The Gifts|gifts]] are real enough that their neighbors put up with them, which is roughly where they sit: tolerated for what they can see, endured for what they will say. They are not violent, and among neighbors who prefer the sword to the hoe that leaves them exposed.`,
  },

  "steel-traders": {
    id: "steel-traders",
    term: "The Steel Traders",
    aliases: ["steel traders"],
    category: MINOR,
    imagePath: null,
    body: `The Steel Traders are the other half of what [[The Reapers|the Reapers]] became, the ones with no use for philosophy, faith, custom, or any of the rest of it. Their name comes from the demand they make of everyone they meet, that steel be traded for steel.

They live in scattered bands, settled rather than wandering, holding what they have taken and fortifying it out of whatever the old world left lying about. One settlement of theirs is a fixed place and a byword for disorder. They live by violence because they have never built the means to live any other way, and they eat and clothe themselves chiefly because the larger powers occasionally need brutal men and will pay for them.

They are shrinking. Any child of theirs born with sense leaves at the first chance for the nearest [[Free Plainers|Free Plainer]] settlement, which leaves behind the hardest and least reflective to carry on. Their strength is that they are dangerous and willing, and cheap to hire. Their weakness is everything else. It is widely assumed they will be finished before long, whether by their own hand or someone else's.`,
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

They are consulted before decisions the way one consults anyone with a skill worth having, and their word is taken seriously without being taken as sacred. Communities keep them, feed them, and are careful with them. The [[Croppers]] are the extreme case of the same current, a whole people organized around it, but the Reader tradition itself is broader and older than any one settlement's version of it.`,
  },

  "water-sense": {
    id: "water-sense",
    term: "Water sense",
    aliases: ["watersense"],
    category: GIFTS,
    imagePath: null,
    body: `Water sense is the [[Grand Lakers|Laker]] gift, and it belongs to the lake. The people who move on that water in fog, ice, and sudden weather come to know things about it they cannot demonstrate: a storm read out of a sky that shows nothing, a safe course held through conditions that hide the shore.

Lakers do not usually call it a [[The Gifts|gift]]. A pilot who has it will say he pays attention. The claim is modest and the results are not, and among a people who revere the lake as a living thing that provides and punishes, a pilot with water sense is treated with a respect that borders on the religious even by those who would deny believing in anything of the sort.`,
  },

  "deep-reading": {
    id: "deep-reading",
    term: "Deep reading",
    aliases: [],
    category: GIFTS,
    imagePath: null,
    body: `Deep reading is the [[Versari]] term, used among themselves and rarely outside. It grew out of the work: years spent over damaged and incomplete texts breeds in the best of them a knack for sensing the shape of what is missing, for knowing which reading is the right one before the evidence has settled it.

The same capacity turns up in those who spend their lives reading rooms and negotiating partners, and it is put to that use as often as to scholarship. The Versari have never formally acknowledged any of this, which has not stopped them relying on it. A scholar known to be right more often than his evidence explains accumulates a reputation of a particular kind, and among themselves they have a quiet vocabulary of understatement for saying so.`,
  },

  "field-reading": {
    id: "field-reading",
    term: "Field reading",
    aliases: [],
    category: GIFTS,
    imagePath: null,
    body: `Field reading is the warrior's version, kept chiefly by the [[Dambarans]] and honored openly in [[Grand Lakers|Laker]] military culture. It is the sense of violence before it arrives: knowing where a room is about to break, reading the shape of a fight while it is still forming, standing in the right place a moment before there is any reason to.

Warrior traditions have carried something like it for as long as anyone has records of, and it is taught as much as it is inherited, in the sense that the training brings it out in those who have it. Commanders whose decisions look prophetic afterward are the celebrated cases. The Dambarans regard it as inseparable from the rest of their discipline and do not make a mystery of it.`,
  },
};

export const WIKI_ENTRIES = { ...REPO_WIKI_ENTRIES, ...EXPORTED_WIKI_ENTRIES };
