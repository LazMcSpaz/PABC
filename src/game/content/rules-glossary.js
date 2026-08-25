// The rules glossary — the entries behind the underlined words on the
// diplomacy screen.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT IN wiki.js. The lore wiki
// (./wiki.js) is AUTO-GENERATED from an off-repo authoring corpus and is
// overwritten wholesale on every content export, so nothing hand-written
// survives there. ./wiki-repo.js is the hand-authored seam beside it. This
// file is a third seam for a third kind of writing: not fiction about the
// world, but plain description of what the screen's own vocabulary means.
// Keeping it separate means a lore export can never eat a rules entry, and a
// rules rewrite can never touch the fiction.
//
// TWO RULES FOR AUTHORING HERE, both enforced by scripts/check-glossary.mjs:
//
//   1. NUMBERS COME FROM CONFIG, PROSE IS CURATED. Every figure in a body is
//      interpolated from the live config below. This is the same discipline as
//      docs/whats-in-the-game.md: an entry physically cannot quote a cost that
//      the engine has since changed. Do not type a number in by hand.
//
//   2. IDS ARE PREFIXED `r-`, AND CROSS-LINKS USE THE ID. The lore wiki
//      already owns short words — `scrap`, `gift`, `claim`, `levy` are all
//      taken — and the wiki's alias index is one flat namespace. Prefixing
//      keeps the two vocabularies from colliding, and linking by id
//      (`[[r-menace|Menace]]`) means the display text on screen is free to be
//      whatever reads best in that sentence.
//
// The audience is somebody who has never played and has never seen the code.
// Entries say what a thing is, what visible things it changes, and what makes
// its value move. They do NOT give formulas — a player should finish an entry
// knowing which direction to push and what it will cost them, not able to
// recompute the engine.

import { CONFIG } from "../config.js";

const D = CONFIG.diplomacy;
const S = CONFIG.sway;
const OPS = CONFIG.sway.ops;
const CO = D.coalition;
const H = D.honor;
const M = D.menace;
const POS = D.positions;
const INF = CONFIG.influence;
const V = CONFIG.victory;

// Categories. The `Rules ·` prefix sorts them together in the wiki sidebar,
// below the world lore, so a player browsing fiction is not interrupted by
// mechanics and vice versa.
const WIN = "Rules · Winning";
const REP = "Rules · Reputation";
const POL = "Rules · Politics";
const WAR = "Rules · War & Peace";
const GROUND = "Rules · Ground";
const QUIET = "Rules · Quiet Work";

// A percentage, for the odds an entry is allowed to state out loud.
const pct = (x) => `${Math.round(x * 100)}%`;
// "3 rounds" / "1 round" — small enough to be worth getting right, common
// enough that doing it by hand in forty places guarantees a stray "1 rounds".
const rounds = (n) => `${n} round${n === 1 ? "" : "s"}`;

export const RULES_GLOSSARY = {

  // ── Winning ───────────────────────────────────────────────────────────────

  "r-dominion": {
    id: "r-dominion",
    term: "Dominion",
    aliases: ["path to dominion"],
    category: WIN,
    imagePath: null,
    body: `Dominion is how you win. There is no other way to win.

You hold Dominion when every faction still standing on the continent is one of three things to you: your ally, your vassal, or gone. Minor factions count the same as major ones. Once that is true you must keep it true for ${rounds(V.holdRounds)} in a row — long enough that it has to be a settled position and not one lucky turn.

The three faces are worth the same. Conquering everyone wins. Allying with everyone wins. Any mix of conquest, alliance and vassalage wins. The game does not prefer one road, and nothing in it is designed to close a road off.

WHAT IT AFFECTS
· The Path to Dominion card on the diplomacy screen lists every surviving faction and tells you which of the three faces, if any, you currently have on them.
· It is the only scoreboard that decides the game. Victory Points, territory and army size all matter only as far as they help you reach one of the three faces.

WHAT MOVES IT
· Making an [[r-alliance|ally]], taking a [[r-vassalage|vassal]], or removing a faction from the board — each converts one name on that list.
· Losing an ally or a vassal converts one back, and the hold counter starts over from zero.`,
  },

  "r-alliance": {
    id: "r-alliance",
    term: "Ally",
    aliases: ["allied", "alliance"],
    category: WIN,
    imagePath: null,
    body: `An ally is a faction whose [[r-standing|Standing]] with you has reached the top tier and who has a [[r-pact|pact]] with you. It is one of the three faces of [[r-dominion|Dominion]].

Getting there is not a purchase. A faction will not sign a pact with somebody it merely tolerates, and it will not warm to you because you handed it goods. The road runs through a [[r-courtship|courtship]]: you state what you want of them, you pay the upkeep every round it runs, and you act like somebody worth signing with while it runs.

WHAT IT AFFECTS
· Allies can be called into your wars, share sight of the board with you, and by default let your columns cross their ground.
· An ally counts toward Dominion. Their [[r-standing|Standing]] falling back below the alliance line takes that away again.
· Allies are also the factions most likely to join a [[r-coalition|coalition]] against somebody who has wronged you — and least likely to join one against you.

WHAT MOVES IT
· Standing at or above ${D.tiers.allied} makes the alliance tier possible; a pact needs at least ${D.pactStandingReq}.
· Everything that moves Standing moves this. Breaking a pact, attacking without warning, or letting your [[r-menace|Menace]] climb past what they will tolerate can end it.`,
  },

  // ── Reputation ────────────────────────────────────────────────────────────

  "r-standing": {
    id: "r-standing",
    term: "Standing",
    aliases: ["regard", "standing tier"],
    category: REP,
    imagePath: null,
    body: `Standing is what one particular faction thinks of you. Every pair of factions has its own Standing, so the Grand Lakers can love you while the Plainers want you dead, and neither figure has anything to do with the other.

It runs from ${D.standingMin} at the bottom to ${D.standingMax} at the top, and the screen shows it as a named tier rather than a raw number: Hostile below ${D.tiers.hostile}, Wary below ${D.tiers.wary}, Neutral, Friendly from ${D.tiers.friendly}, Allied from ${D.tiers.allied}. Their exact figure is something you can buy with espionage; which way it has been moving is always free to read.

WHAT IT AFFECTS
· It is the single number the win condition reads. [[r-dominion|Dominion]] through diplomacy means driving Standing to the alliance tier and keeping it there.
· It gates what they will even discuss. A pact needs Standing of at least ${D.pactStandingReq}; a faction that dislikes you will refuse deals it would take from somebody it liked.
· It weights almost every decision they make about you — whether to accept an offer, whether to join a [[r-coalition|coalition]], whether to answer a call to arms.

WHAT MOVES IT
· [[r-courtship|Courtship]] is the reliable road: roughly ${D.posture.courtStandingGain} every ${rounds(D.posture.courtRounds)} while it runs.
· [[r-gift-diplomacy|Gifts]] bought with political capacity, and deals they thought were fair.
· Downward: attacking them, [[r-trespass|trespassing]] on their ground, breaking your word, pestering them with offers they keep refusing, and simply being feared.
· Left alone, Standing drifts about ${D.driftPerRound} a round back toward where the two of you naturally sit. Warmth you stop paying for does not stay bought.
· The "How you got here" list on their card names the causes in order, so you can always tell which of your own acts did it.`,
  },

  "r-menace": {
    id: "r-menace",
    term: "Menace",
    aliases: ["aggression weight"],
    category: REP,
    imagePath: null,
    body: `Menace is how dangerous the continent thinks you are. Unlike [[r-standing|Standing]] there is only one figure, and everybody reads the same one.

It is a reputation for violence, not a record of it — and reputations need witnesses. An attack nobody saw barely moves it (about ${pct(M.unwitnessedShare)} of the usual amount). Being [[r-denounce|denounced]] afterward drags a share of the hidden part into the light. This is deliberate: quiet, distant, deniable violence is genuinely cheaper than the same violence in front of an audience.

WHAT IT AFFECTS
· Every faction has a [[r-tolerance|tolerance]] for Menace. Past theirs, they cool on you whether or not you have ever touched them, and the warning triangle appears on their card.
· It is a large part of the [[r-threat|Threat]] figure that decides whether a [[r-coalition|coalition]] forms against you.
· A high Menace makes a faction that would otherwise court you refuse to.

WHAT MOVES IT
· Declaring war raises it at once — by more if you had no [[r-grievance|grievance]] on record to justify it.
· Attacking without warning, breaking a [[r-truce|truce]], breaking a [[r-position|declared position]], and being caught at [[r-intrigue|quiet work]].
· Downward: it decays on its own, about ${M.decayPerRound} a round, with no action from you. Menace is a debt that pays itself off if you stop borrowing.`,
  },

  "r-honor": {
    id: "r-honor",
    term: "Honor",
    aliases: ["kept your word"],
    category: REP,
    imagePath: null,
    body: `Honor is whether your word is worth anything. Like [[r-menace|Menace]] it is one figure the whole continent reads, and it runs from ${H.min} to ${H.max}. Everyone starts at ${H.start}.

Honor and Menace are not opposites. Menace asks "would you hurt me?"; Honor asks "if you told me you wouldn't, could I believe you?" A feared faction that keeps every promise it makes is a very different neighbour from a feared faction that does not, and the board treats them differently.

WHAT IT AFFECTS
· Factions have a floor below which they will not sign anything with you. Under it, the skull appears on their card and the deals stop, regardless of how warm they feel.
· It is your cover for [[r-intrigue|quiet work]]. An honourable faction is likelier to be believed and less likely to be suspected, so the same lie is safer told by somebody with a clean record.
· It weights whether allies answer your calls to arms and whether anybody believes your accusations.

WHAT MOVES IT
· Up: keeping promises, honouring a call to arms, [[r-mediate|mediating]] somebody else's war, freeing a [[r-vassalage|vassal]].
· Down hard: breaking a pact (about ${H.breakLoss}), attacking without warning (about ${H.surpriseAttackLoss}), issuing an [[r-ultimatum|ultimatum]] and then backing down, [[r-denounce|denouncing]] somebody with no grounds, breaking a [[r-position|position]] you declared, and being caught at quiet work.
· It recovers slowly on its own, about ${H.decayPerRound} a round, drifting back toward ${H.decayToward}. Recovering from a betrayal takes a very long time — that is the point of it.`,
  },

  "r-threat": {
    id: "r-threat",
    term: "Threat",
    aliases: ["coalition risk"],
    category: REP,
    imagePath: null,
    body: `Threat is the continent's estimate of how much of a problem you are becoming. It is not a thing you do; it is a reading taken off things you have done and things you own.

It combines your [[r-menace|Menace]] with how far ahead of the field you are — Victory Points, territory, the size of the lead itself. A quiet faction that is simply winning will accumulate Threat. So will a small faction that is behaving appallingly.

WHAT IT AFFECTS
· It is the number a [[r-coalition|coalition]] forms on. Above about ${CO.threshold} the other powers start looking for partners; a coalition already running dissolves when it falls back under about ${CO.dissolve}.
· The diplomacy screen shows it in red once it is high enough to be dangerous.

WHAT MOVES IT
· Up: raising Menace, taking territory, gaining Victory Points, and pulling further ahead of the second-strongest faction.
· Down: letting Menace decay, and the field catching up with you.
· Note that being ahead is not on its own enough. A coalition also needs grounds — see [[r-coalition|Coalition]].`,
  },

  "r-tolerance": {
    id: "r-tolerance",
    term: "Tolerance",
    aliases: ["their tolerance"],
    category: REP,
    imagePath: null,
    body: `Tolerance is how much [[r-menace|Menace]] one particular faction will put up with from you before it starts holding your reputation against you personally.

It is not the same for everybody. A faction that already likes you will forgive a great deal; one that barely knows you will not. A peaceable faction has a lower bar than a warlike one.

WHAT IT AFFECTS
· While your Menace is under their tolerance, your violence elsewhere costs you nothing with them.
· Past it, their [[r-standing|Standing]] with you starts bleeding every round, and the warning triangle appears on their card — a signal that you are losing a relationship without doing anything to that faction at all.

WHAT MOVES IT
· It rises with their Standing toward you, at roughly ${D.tolerance.perStanding} per point, from a base near ${D.tolerance.base}. Friends really do give you more rope.
· It falls as they cool on you, which is why a spiral is possible: Menace costs you Standing, and lost Standing lowers the bar you already crossed.
· A [[r-spy-ring|Spy Ring]] shows you their exact tolerance next to your exact Menace, which turns a guess into a plan.`,
  },

  "r-grievance": {
    id: "r-grievance",
    term: "Grievance",
    aliases: ["grievances", "grievance ledger"],
    category: REP,
    imagePath: null,
    body: `A grievance is a specific thing you did to a specific faction, written down and kept. The Grievance Ledger on their card is the list.

Grievances are not the same as low [[r-standing|Standing]]. Standing is a mood and it drifts; a grievance is a fact and it does not. It sits on the record until it is settled or it ages out, and it can be pointed at later by anyone who wants a reason.

Things that go in the ledger include attacking without warning, breaking a [[r-truce|truce]] or a pact, breaking a promise, [[r-occupation|occupying]] their ground, defying an [[r-ultimatum|ultimatum]], and breaking a [[r-position|position]] you declared. They carry different weights — a broken pact weighs more than a broken promise.

WHAT IT AFFECTS
· A grievance is grounds. It lets a faction join a [[r-coalition|coalition]] against you, and it lets them declare war on you without the [[r-menace|Menace]] cost an unprovoked declaration carries.
· It makes them much likelier to answer somebody else's call to arms against you.
· It works for you as well as against you: a grievance you hold against a rival is what makes your own war on them a [[r-just-war|just war]].

WHAT MOVES IT
· You add one by doing one of the listed things. No more than ${D.grievance.maxPerPair} accumulate between any one pair.
· You clear one by settling it — paying it off as part of a deal, which also earns you a little [[r-honor|Honor]] for having done so.
· Old grievances stop counting as grounds for a fresh war after about ${rounds(D.justWar.grievanceWindowRounds)}. They are still in the ledger; they simply stop being an excuse.`,
  },

  "r-denounce": {
    id: "r-denounce",
    term: "Denounce",
    aliases: ["denunciation"],
    category: REP,
    imagePath: null,
    body: `Denouncing is naming a faction publicly for something they did.

The important thing about it is that the board judges the accusation, not the accused. If the thing you are pointing at is real and recent, the denunciation lands: their [[r-standing|Standing]] with third parties drops, some of the [[r-menace|Menace]] they earned quietly comes into the open, and you gain a little [[r-honor|Honor]] for having said it out loud.

If there is nothing behind it, you are the one who is marked. Everyone can see there were no grounds, and your Honor takes the damage instead.

WHAT IT AFFECTS
· A warranted denunciation drags roughly ${pct(M.denouncedShare)} of the target's hidden Menace into daylight — this is the main way violence nobody witnessed becomes violence everybody knows about.
· It cools third parties on the target and warms some of them to you.
· Their allies may take your side against you rather than believe it.

WHAT MOVES IT
· Grounds means a [[r-grievance|grievance]] on record, or something a piece of [[r-expose|quiet work]] uncovered, within roughly the last ${rounds(D.justWar.denounceWindowRounds)}.
· You cannot lean on it: there is a cooldown of about ${rounds(D.justWar.denounceCooldownRounds)} before you can denounce again.`,
  },

  // ── Politics ──────────────────────────────────────────────────────────────

  "r-sway": {
    id: "r-sway",
    term: "Sway",
    aliases: ["political capacity", "sway held"],
    category: POL,
    imagePath: null,
    body: `Sway is your political capacity — the attention, envoys and standing at court you can put behind persuading people. It is the currency of the diplomacy screen, and it is the second of the two things you spend.

The one rule that matters most: SCRAP BUYS WHAT A FACTION HAS. SWAY BUYS WHAT A FACTION THINKS. Nothing converts between them, at any rate, in either direction, for you or for anyone else. You cannot get rich and buy friends, and you cannot be beloved and buy an army.

Sway is a FLOW, NOT A WAR CHEST. It is capped at ${S.cap}, and income above the cap is simply lost. Saving it up is not a strategy; spending it is the strategy.

WHAT IT AFFECTS
· [[r-courtship|Courtships]] cost ${S.courtUpkeep} every round they run — the only road to an alliance.
· [[r-gift-diplomacy|Gifts]] cost about ${S.perStanding} for each point of warmth.
· [[r-intrigue|Quiet work]] costs ${S.ops.opCost ?? S.opCost} an operation.

WHAT MOVES IT
· Every faction gets a floor of ${S.floor} a round, always, so nobody is ever locked out of politics entirely. That floor is exactly one courtship, which is the design: even a faction reduced to nothing can still be courting somebody.
· Territory you dominate pays about ${S.perHex} a hex, counted up to ${S.hexCap}.
· Agreements pay about ${S.perAgreement} each — [[r-pact|pacts]], [[r-trading-pact|trade routes]] and [[r-vassalage|vassals]]. Diplomacy funds diplomacy.
· Some buildings add to it.
· Being [[r-occupation|occupied]] costs you heavily, about ${S.occupation} a round, and hands very little of it to the occupier.`,
  },

  "r-courtship": {
    id: "r-courtship",
    term: "Courtship",
    aliases: ["courting", "open a courtship"],
    category: POL,
    imagePath: null,
    body: `A courtship is an open, declared, expensive campaign to win a faction over. It is the only road to a [[r-pact|pact]] and therefore the only road to an [[r-alliance|alliance]].

It is an act, not a mood. You choose one faction and commit to them; you are not quietly warming toward everybody at once. The screen shows who you are courting and how many rounds it has run.

WHAT IT AFFECTS
· While it runs, their [[r-standing|Standing]] with you rises by about ${D.posture.courtStandingGain} every ${rounds(D.posture.courtRounds)}, and the usual drift back toward neutral is suspended.
· It is a precondition for a pact. A faction will not sign with somebody who has not courted them, however much they happen to like you.
· It is public. Rivals can see who you are cultivating, and act on it.

WHAT MOVES IT
· It costs ${S.courtUpkeep} [[r-sway|Sway]] every single round it runs, forever, and stops the moment you cannot pay. Running two at once is a real budget decision.
· Calling it off frees the capacity immediately and costs you nothing but the progress.
· Attacking, trespassing on, or betraying the faction you are courting ends the pretence in the obvious way.`,
  },

  "r-posture": {
    id: "r-posture",
    term: "Posture",
    aliases: ["postures", "stance"],
    category: POL,
    imagePath: null,
    body: `A posture is the stance one faction has taken toward another, and it is the closest thing the game has to a faction telling you what it is about to do.

There are five, in rising order of consequence: Indifferent, Watching, Courting, Warning and Committed. Indifferent is genuinely nothing. Watching means you are on their mind. Courting and Warning mean they have picked a direction. Committed means they have stopped considering alternatives.

A posture usually comes with a [[r-condition|condition]] — the specific thing they want from you attached to it.

WHAT IT AFFECTS
· It is your warning. A faction does not go from friendly to at war without passing through a stated posture first, so a Warning on their card is a real chance to change course.
· It shapes what they will accept. A faction Courting you will take a deal it would refuse from a stranger; a faction Warning you will not.
· It tells you where their attention is, which is worth as much as what they think of you.

WHAT MOVES IT
· They set it themselves, from their own [[r-interests|interests]] and from what you have been doing.
· Postures they have not said out loud are marked as unstated on the card, and A FACTION DOES NOT ACT ON A POSTURE IT HAS NOT STATED — there is always at least a round between the declaration and the consequence.
· Meeting the attached condition, or making it irrelevant, is what stands a posture down.`,
  },

  "r-condition": {
    id: "r-condition",
    term: "Condition",
    aliases: ["conditions"],
    category: POL,
    imagePath: null,
    body: `A condition is the sentence attached to a [[r-posture|posture]] — the specific, nameable thing a faction wants from you, quoted in their own words on their card.

Conditions exist to stop diplomacy reading as arbitrary. "They are Warning you" tells you very little. "They are Warning you, and the condition is that you get off their eastern border" tells you exactly what to do about it, and whether you are willing.

WHAT IT AFFECTS
· It is the price of standing the posture down. Meet the condition and the posture relaxes; ignore it and the posture escalates.
· It tells you what they will pay for. A condition is a live statement of what a faction values right now, which is the best guide you have to what they will accept in a deal.

WHAT MOVES IT
· It is drawn from their [[r-interests|interests]] — what they actually want, given where they sit and what has happened to them.
· They give you a round of grace after stating it before they act on it being unmet.
· Change the underlying situation and the condition changes with it. Withdraw from the border and the border condition goes away on its own.`,
  },

  "r-interests": {
    id: "r-interests",
    term: "Interests",
    aliases: ["what they are after", "their interests"],
    category: POL,
    imagePath: null,
    body: `Interests are what a faction actually wants, as opposed to how it happens to feel about you. The "What they are after" panel lists them.

There are six kinds, and every faction's list is derived from its real situation rather than from a personality it was handed at setup:

· RECLAIM — land they used to hold and want back.
· REDRESS — a [[r-grievance|grievance]] they want settled.
· WAR HELP — a war they are in and would like company for.
· ROUTES — trade and passage they need and cannot get.
· QUIET — a border they want left alone.
· ISOLATE — a rival they want cut off from friends.

WHAT IT AFFECTS
· Deals that serve an interest are valued much more highly than the same goods offered blind. Giving a faction something they specifically want is worth several times giving them something merely valuable.
· Interests are where [[r-condition|conditions]] and [[r-posture|postures]] come from.
· They are the honest answer to "why won't they take this?" — usually because it addresses nothing they care about.

WHAT MOVES IT
· They shift as the board shifts. Take a city and somebody acquires a reclaim interest in it. End a war and the war-help interest disappears.
· You cannot change a faction's interests by being liked. You change them by changing the situation that produced them.
· Reading a rival's interests in full requires espionage — a [[r-spy-ring|Spy Ring]] shows you their list.`,
  },

  "r-pact": {
    id: "r-pact",
    term: "Pact",
    aliases: ["pacted", "pacts"],
    category: POL,
    imagePath: null,
    body: `A pact is a mutual defence agreement, and the formal thing that makes a faction your [[r-alliance|ally]].

It is not a deal you can simply propose to anybody. It needs [[r-standing|Standing]] of at least ${D.pactStandingReq}, and it needs a [[r-courtship|courtship]] behind it. Warmth alone is not enough; somebody has to have done the work.

WHAT IT AFFECTS
· Both sides gain Standing for having signed, and continue to gain it for keeping it.
· It lets either side make a [[r-pact-call|call to arms]] on the other.
· By default it shares sight of the board and opens borders both ways, and either can be switched off — at a small cost in Standing, because switching it off is a statement.
· It counts toward [[r-dominion|Dominion]], and it pays [[r-sway|Sway]] every round as an agreement.

WHAT MOVES IT
· Breaking a pact is one of the most expensive things you can do: roughly ${H.breakLoss} [[r-honor|Honor]], a heavy Standing collapse, and a permanent [[r-grievance|grievance]] on the record.
· It can also end because Standing fell far enough that it no longer holds.`,
  },

  "r-position": {
    id: "r-position",
    term: "Position",
    aliases: ["positions", "your word", "declared position"],
    category: POL,
    imagePath: null,
    body: `A position is a public commitment you make and everybody can see — "I will not attack the Lakers", "this border is closed", "I stand with the Plainers". The "Your Word" card is where you declare them.

Declaring a position costs nothing up front. That is the point: it is a promise, and promises are free to make and expensive to break. You may hold up to ${POS.max} at a time, and each must stand for at least ${rounds(POS.minRounds)} before you can take it back.

WHAT IT AFFECTS
· A position can be CITED. If somebody does the thing your position was against, you can point at your own declaration as grounds — for a [[r-denounce|denunciation]], for a [[r-just-war|just war]], for joining a [[r-coalition|coalition]]. A promise you made ${rounds(POS.citeWithinRounds)} ago is worth more than an opinion you formed today.
· It blocks you. While a position stands, the game will not quietly let you do the thing you promised not to do; it tells you which of your own words is in the way.
· Other factions read your positions and factor them into whether you can be relied on.

WHAT MOVES IT
· Standing a position down honestly costs about ${POS.withdrawHonorLoss} [[r-honor|Honor]] — a real price, but a small one.
· Being caught breaking one costs about ${POS.breakHonorLoss} Honor and ${POS.breakMenace} [[r-menace|Menace]], AND THE BOARD WILL NAME IT. It is roughly three times worse than admitting you changed your mind.
· Some events break your positions for you — if you promised not to fight somebody and they attack you, that promise is gone.`,
  },

  "r-coalition": {
    id: "r-coalition",
    term: "Coalition",
    aliases: ["coalitions", "coalition against you"],
    category: POL,
    imagePath: null,
    body: `A coalition is several factions agreeing, at once, that one faction has become the problem — and going to war about it together.

It is the game's answer to a runaway leader, and it is the single most dangerous thing that can happen to you diplomatically. But it is not automatic, and this is important: BEING AHEAD IS NOT ENOUGH ON ITS OWN. A coalition needs GROUNDS.

Grounds means one of three things: your [[r-menace|Menace]] is genuinely high (about ${CO.menaceGrounds} or more), somebody holds a real [[r-grievance|grievance]] against you, or your lead over the SECOND-STRONGEST faction has become frightening in itself. A spotless faction quietly winning is much harder to gang up on than a bloody one — which is a real strategic choice, not a loophole.

WHAT IT AFFECTS
· Every member is at war with you at once, and they will not be picked off one at a time.
· Your [[r-standing|Standing]] with every member collapses on formation, by about ${CO.standingHit}.
· It must run for at least ${rounds(CO.minRounds)}, and cannot immediately re-form once it dissolves.

WHAT MOVES IT
· Your [[r-threat|Threat]] going above about ${CO.threshold} while grounds exist is what starts one.
· It dissolves when Threat falls back under about ${CO.dissolve} — so letting Menace decay and making peace genuinely ends it.
· Factions will not be drafted into one against a faction they are friendly with: below about ${CO.draftStandingFloor} Standing is where the drafting starts. Every alliance you hold is one fewer body available to a coalition.
· Making peace with a member removes them from it.`,
  },

  "r-offer": {
    id: "r-offer",
    term: "Offer",
    aliases: ["on the table", "counter-offer", "custom deal"],
    category: POL,
    imagePath: null,
    body: `An offer is a proposed exchange — scrap, income streams, territory, borders, alliances, promises — built out of whatever the two of you can actually put on a table. The "On the Table" card holds offers waiting on your answer.

Factions value an offer by what it does for them, which is mostly a question of their [[r-interests|interests]] rather than of raw worth. They will also COUNTER: if what you asked for is close to something they would accept, they send back the version they would sign instead of simply refusing.

WHAT IT AFFECTS
· A deal both sides thought was fair warms [[r-standing|Standing]] a little. There is a cap on how much per round, so trading in circles does not pump the relationship.
· Offers expire after about ${rounds(D.offers.expiryRounds)}.

WHAT MOVES IT
· You get about ${D.offers.freeAsksPerRound} asks a round per faction before it starts reading as pestering, and pestering costs Standing.
· Their willingness moves with Standing, with [[r-honor|Honor]] (below their floor they will not sign at all), and with whether the deal touches something they want.
· A faction cannot accept what it cannot afford, and it will not counter with terms outside its means.`,
  },

  "r-gift-diplomacy": {
    id: "r-gift-diplomacy",
    term: "Sending a Gift",
    aliases: ["send word", "gifting"],
    category: POL,
    imagePath: null,
    body: `A gift is warmth bought directly with [[r-sway|Sway]]: you spend political capacity and their [[r-standing|Standing]] with you goes up.

It is worth being clear about what this is NOT. It is not sending scrap. Scrap moves goods, and you can still hand a faction scrap in a deal with nothing asked in return — but goods no longer move opinions. Opinion is bought with attention, and attention is Sway.

WHAT IT AFFECTS
· Standing with that faction, immediately, at a published rate of about ${S.perStanding} Sway per point.

WHAT MOVES IT
· There are diminishing returns inside a window of about ${rounds(D.gift.windowRounds)}. Leaning on the same faction repeatedly pays less each time.
· It is the fastest way to move Standing, and the least durable — gifted warmth drifts back like any other, whereas a [[r-courtship|courtship]] suspends the drift while it runs. Gifts are for getting over a line this turn; courtship is for staying over it.`,
  },

  "r-ultimatum": {
    id: "r-ultimatum",
    term: "Ultimatum",
    aliases: ["or else", "ultimatums"],
    category: POL,
    imagePath: null,
    body: `An ultimatum is a demand with a deadline attached: give me this within ${rounds(D.ultimatum.deadlineRounds)} or there will be consequences.

It is the honest way to start a war. An unprovoked declaration is expensive in [[r-menace|Menace]]; a declaration against somebody who publicly defied your stated demand is not, because everybody watched them refuse.

The catch is that it binds you too. Issuing one and then not following through is the definition of a bluff, and the board prices bluffing.

WHAT IT AFFECTS
· Complying earns them a little [[r-standing|Standing]] with you and ends it.
· Defiance goes on the record as a [[r-grievance|grievance]] and makes your subsequent war a [[r-just-war|just war]].
· Issuing one raises your Menace slightly straight away, before anything happens.

WHAT MOVES IT
· Backing down after issuing costs about ${D.ultimatum.bluffHonorLoss} [[r-honor|Honor]].
· They weigh their answer on how much stronger you actually are, how much they mind the demand, and how brave they are feeling.
· There is a cooldown of about ${rounds(D.ultimatum.cooldownRounds)} before you can issue another.`,
  },

  "r-pact-call": {
    id: "r-pact-call",
    term: "Call to Arms",
    aliases: ["calls to arms", "call to pact", "pact call"],
    category: POL,
    imagePath: null,
    body: `A call to arms is asking an ally to join a war you are already fighting. It is what a [[r-pact|pact]] is FOR, and it is the moment an alliance stops being decorative.

WHAT IT AFFECTS
· Honouring a call puts them into your war and earns them [[r-honor|Honor]] for having kept their word.
· Refusing costs them Standing with you (about ${D.pactCall.declineStandingHit}) and costs them Honor publicly — a refused call is visible to everybody, not just to you.
· A call expires after about ${rounds(D.pactCall.callExpiryRounds)} if unanswered.

WHAT MOVES IT
· Whether they answer depends on how much they dislike your enemy, how loyal they are to you, and how frightening the target is. Asking an ally to march on somebody far stronger than them is asking a lot.
· Their [[r-position|positions]] can make it impossible — a faction that publicly swore not to fight your enemy cannot honour the call without breaking its own word.
· You can only call an ally into a war you are already in. It is not a way to start one.`,
  },

  "r-mediate": {
    id: "r-mediate",
    term: "Mediate",
    aliases: ["mediation"],
    category: POL,
    imagePath: null,
    body: `Mediating is brokering peace between two other factions who are at war with each other. You are not a party to it; you are the one standing in the middle.

WHAT IT AFFECTS
· If it takes, the war ends and both parties warm to you.
· You gain about ${H.mediateGain} [[r-honor|Honor]] for having done it, which is one of the few reliable ways to repair a damaged reputation without waiting for it to decay.
· A war you ended is a war that is not producing a [[r-coalition|coalition]] you might end up in.

WHAT MOVES IT
· Both sides have to be willing to stop. A war somebody is winning decisively is not mediable.
· Your [[r-standing|Standing]] with both parties matters — somebody neither side trusts cannot broker anything.
· There is a cooldown of about ${rounds(D.ai.mediateCooldownRounds)} between attempts.`,
  },

  "r-open-borders": {
    id: "r-open-borders",
    term: "Open Borders",
    aliases: ["border agreement", "transit rights"],
    category: POL,
    imagePath: null,
    body: `Open borders is permission for another faction's columns to cross your territory without it counting as [[r-trespass|trespass]].

It is two separate halves. You can open yours without theirs being open, and either side can shut its half at any time. A [[r-pact|pact]] opens both by default.

WHAT IT AFFECTS
· Their units can move through your ground freely, and yours through theirs if their half is open.
· It removes the Standing and reputation damage that crossing would otherwise cause.
· Practically, it is what makes a joint war possible — an ally who cannot cross your land cannot help you fight on it.

WHAT MOVES IT
· You grant it, or they do, in a deal or as part of a pact.
· Closing your half costs a little [[r-standing|Standing]] (about ${D.pact.toggleBordersStandingHit}), because shutting a border is a statement about how you now feel.
· It is also the obvious thing to demand from somebody weaker than you, and the obvious thing to regret granting to somebody who turns out not to be a friend.`,
  },

  "r-trading-pact": {
    id: "r-trading-pact",
    term: "Trading Pact",
    aliases: ["trade route", "trade pact"],
    category: POL,
    imagePath: null,
    body: `A trading pact opens a trade route between the two of you. It needs a real route on the map: some city of yours must actually reach some city of theirs.

WHAT IT AFFECTS
· Both sides get scrap every round the route runs.
· Forming one grants a PERMANENT rise in your Research floor, on the spot — permanent meaning it survives the pact ending. Opening a trade route teaches you something you do not unlearn.
· It counts as an agreement, so it pays [[r-sway|Sway]] every round.

WHAT MOVES IT
· The route has to physically exist and stay connected. Cut the road — or let somebody blockade it — and the income suspends, with about ${rounds(D.tradingPact.suspendGraceRounds)} of grace before it lapses.
· Closing it deliberately stops the scrap but keeps the Research floor.
· War between you obviously ends it.`,
  },

  "r-tribute": {
    id: "r-tribute",
    term: "Demand Tribute",
    aliases: ["tribute demand"],
    category: POL,
    imagePath: null,
    body: `Demanding tribute is taking rather than asking: you tell a weaker faction to hand over scrap because you are stronger than they are.

WHAT IT AFFECTS
· If they cave, you get the scrap and they get a [[r-grievance|grievance]] against you that will be there for a long time.
· If they refuse, your [[r-honor|Honor]] takes damage for having demanded it, their Standing with you drops several tiers, and it can escalate straight to war.

WHAT MOVES IT
· They will only be intimidated if you are meaningfully stronger — about ${D.demandTribute.minPowerRatio} times their power is the neighbourhood where it starts working at all.
· Their bravery matters. A faction with allies, or with nothing left to lose, refuses demands it "should" accept.
· It is the cheapest way to convert military superiority into scrap, and the most reliable way to convert it into enemies.`,
  },

  // ── War & Peace ───────────────────────────────────────────────────────────

  "r-war": {
    id: "r-war",
    term: "War",
    aliases: ["at war", "declare war"],
    category: WAR,
    imagePath: null,
    body: `War is open hostilities between two factions. Units fight, territory changes hands, and every diplomatic channel between you narrows to peace terms.

Declaring is a diplomatic act with a diplomatic price, paid before a single shot lands.

WHAT IT AFFECTS
· [[r-standing|Standing]] with the target collapses immediately.
· Your [[r-menace|Menace]] rises at once — and rises MORE if you had no [[r-grievance|grievance]] on record, because an unprovoked declaration is a different thing from a justified one. See [[r-just-war|Just War]].
· Their allies may be called in against you, and third parties re-weigh you as a neighbour.
· It ends trade routes, open borders and any pact between you.

WHAT MOVES IT
· It ends by [[r-truce|ceasefire]], by negotiated peace with terms attached, by [[r-mediate|mediation]] from a third party, or by one side ceasing to exist.
· Attacking somebody you are NOT at war with is worse than declaring first: a surprise attack costs about ${H.surpriseAttackLoss} [[r-honor|Honor]] and writes a grievance that outlasts the war.
· Defending your own ground carries none of these costs. The prices here are for the faction that chose the fight.`,
  },

  "r-just-war": {
    id: "r-just-war",
    term: "Just War",
    aliases: ["grounds", "justified war", "warranted"],
    category: WAR,
    imagePath: null,
    body: `A just war is one you can point at a reason for. The game does not judge whether your reason is good; it checks whether one exists and is recent.

Grounds means a [[r-grievance|grievance]] they gave you within about the last ${rounds(D.justWar.grievanceWindowRounds)}, a [[r-position|position]] you declared that they went and violated, or an [[r-ultimatum|ultimatum]] they publicly defied.

WHAT IT AFFECTS
· It is the difference between a declaration that costs you a lot of [[r-menace|Menace]] and one that costs you comparatively little.
· It changes how third parties read the war. A justified war does not frighten neutrals the way an opportunistic one does.
· It affects whether allies will honour a [[r-pact-call|call to arms]] into it — people will fight for a cause more readily than for a land grab.

WHAT MOVES IT
· You acquire grounds by being wronged, or by declaring a position and waiting for somebody to cross it.
· Grounds age out. A grievance from twenty rounds ago is still in the ledger but no longer excuses a war today.
· This is why [[r-position|positions]] and [[r-ultimatum|ultimatums]] are worth issuing before you fight: both manufacture legitimate grounds in advance, in the open, at a price you choose to pay.`,
  },

  "r-truce": {
    id: "r-truce",
    term: "Truce",
    aliases: ["ceasefire", "truces"],
    category: WAR,
    imagePath: null,
    body: `A truce is stopping the fighting with nothing else attached — no terms, no payment, no concessions. It runs for about ${rounds(D.truce.rounds)}.

It is the cheap way out of a war, and the other side takes it only if they actually want out. A faction that is winning will not.

WHAT IT AFFECTS
· Fighting stops and [[r-standing|Standing]] between you stops falling; there is a floor it will not sink below while the truce holds.
· It does not settle any [[r-grievance|grievance]]. Everything either of you did is still on the record.

WHAT MOVES IT
· Breaking one is severe — about ${D.truce.breakHonorLoss} [[r-honor|Honor]], ${D.truce.breakMenace} [[r-menace|Menace]], and a heavy grievance. Attacking somebody who agreed to stop shooting is treated as worse than never having agreed.
· When it lapses you are not automatically back at war, but nothing prevents it either. A truce buys time to make peace properly; it is not peace.`,
  },

  "r-vassalage": {
    id: "r-vassalage",
    term: "Vassal",
    aliases: ["vassalage", "vassals", "sworn to", "your vassal"],
    category: WAR,
    imagePath: null,
    body: `A vassal is a faction bound under your banner. They still exist, still hold their ground, and still have opinions — but they pay you tribute and they are counted as yours.

It is one of the three faces of [[r-dominion|Dominion]], and it is the middle road between an [[r-alliance|alliance]] and a conquest: cheaper than killing them, and available where friendship is not.

WHAT IT AFFECTS
· They pay you [[r-tribute|tribute]] — about ${D.vassal.tributeScrap} scrap a round, taken rather than negotiated.
· They count toward Dominion, and they count as an agreement for [[r-sway|Sway]] purposes.
· They can be dragged into your wars.

WHAT MOVES IT
· RESENTMENT builds the entire time, roughly ${D.vassal.resentmentPerRound} a round, and builds faster while you look weak. Past about ${D.vassal.rebellionThreshold} they rebel. A vassal is not a settled position; it is a clock.
· Being strong slows the clock. Being visibly beaten by somebody else speeds it up sharply.
· Freeing a vassal deliberately earns you about ${D.freeVassal.honorGain} [[r-honor|Honor]] and turns them friendly — which is sometimes worth more than the tribute, especially if they were about to rebel anyway.`,
  },

  // ── Ground ────────────────────────────────────────────────────────────────

  "r-loyalty": {
    id: "r-loyalty",
    term: "Loyalty",
    aliases: ["loyal"],
    category: GROUND,
    imagePath: null,
    body: `Loyalty is how much a settlement you hold actually belongs to you, as opposed to merely being garrisoned by you. It runs from 0 up to ${CONFIG.loyalty.ceiling}, and a place you have just taken starts near ${CONFIG.loyalty.start}.

WHAT IT AFFECTS
· It is the main input to [[r-influence|influence]], which is what projects your control outward onto the map. This is the chain that matters: LOYALTY MAKES INFLUENCE, INFLUENCE MAKES TERRITORY, TERRITORY MAKES [[r-sway|SWAY]] AND [[r-actions|ACTIONS]].
· Above about ${CONFIG.economy.bonusSlotLoyalty} it unlocks an extra building slot.
· Low loyalty makes a place vulnerable — below the danger line, neighbours can peel it away from you.

WHAT MOVES IT
· Paying a settlement's upkeep raises it, about ${CONFIG.loyalty.risePerUpkeep} a round. Not paying it lowers it by the same.
· It falls when you take a place by force and rises as you hold it.
· Ceding territory in a deal hands the receiving faction a little loyalty with it — land given is held better than land taken.
· BE WARNED THAT LOYALTY DOES NOT PAY OFF SMOOTHLY. See [[r-influence|Influence]] for why a point can be worth nothing or worth twelve hexes.
· A place you neglect all the way to 0 does not merely go quiet — it starts shedding sections to nobody, and once it belongs to nobody a neighbour can [[r-claim|absorb]] it without a fight.`,
  },

  "r-claim": {
    id: "r-claim",
    term: "Absorbing a Place",
    aliases: ["absorb", "absorbed", "claiming ground"],
    category: GROUND,
    imagePath: null,
    body: `A settlement nobody holds does not stay nobody's. It drifts toward whichever faction surrounds it — by the ordinary business of trading with them, marrying into them and answering to their courts — until it is simply theirs.

This is the third way onto the map, beside conquest and diplomacy, and the only one that costs neither soldiers nor [[r-sway|Sway]]. It costs patience and a border.

WHAT IT AFFECTS
· A place with no holder and one faction's [[r-influence|influence]] over it gives up one of its three sections each round, and after three rounds it belongs to them outright — with all the Victory Points, income and [[r-actions|Actions]] any other holding brings.
· A place absorbed this way is not sacked. Nothing in it is destroyed, no promise about seizing ground is broken, and it opens at low [[r-loyalty|Loyalty]] like anywhere newly held.
· It is how a rival you hollowed out stops being a hole in the map. Bleeding somebody's city to nothing turns it neutral, not yours — this is the part that finishes the job.

WHAT MOVES IT
· You must ENCLOSE the place, not merely border it. The bar is high enough that one neighbouring town is not sufficient — it takes two, or one and a garrison on the ground.
· A rival column standing in the town stops it dead, however strong your influence. A garrison in the square outranks the border on the map.
· A rival holding even one section stops it too. Ground somebody is standing on changes hands by fighting for it, not by drifting.
· Two factions pulling at the same town cancel out and it stays where it is. That is a real outcome, not a stalemate — out-project them and it starts moving again.`,
  },

  "r-influence": {
    id: "r-influence",
    term: "Influence",
    aliases: ["dominated", "dominance"],
    category: GROUND,
    imagePath: null,
    body: `Influence is how far your control reaches out from the places you hold. Every settlement projects it into the hexes around it, weakening with distance, and whoever has the most influence in a hex — above a minimum — DOMINATES it.

Domination is what "your territory" means on this map. It is not drawn by borders; it is computed from what you hold and how well you hold it.

THE ONE THING TO UNDERSTAND: IT IS A STEP FUNCTION, NOT A SLOPE. A settlement's reach is a ring, and rings come in whole numbers. Below roughly ${INF.factionBase + INF.loyaltyScale * 4} projected strength you dominate only your own hex. Cross that and you take the ring around it — seven hexes. Cross the next line and you take the ring beyond — nineteen. Between the lines, another point of [[r-loyalty|Loyalty]] buys you literally nothing; at a line, one point buys twelve hexes.

WHAT IT AFFECTS
· Territory dominated is what pays [[r-sway|Sway]], and what your [[r-zone-of-control|Zone of Control]] is made of.
· Influence pressing on somebody else's ground bleeds their hold on it and costs you [[r-standing|Standing]] with them for the pressure.
· Press hard enough on unclaimed ground and it becomes yours — see [[r-claim|Absorbing a Place]]. This is the slow road onto the map that costs no soldiers.

WHAT MOVES IT
· Loyalty in the settlement, chiefly. Units in the field project a little of their own.
· Distance. Reach falls by half each hex out, which is why the rings are so sharp.
· The influence overlay on the board shows you where the lines actually fall. Use it before spending on loyalty — it is the difference between a wasted round and a twelve-hex round.`,
  },

  "r-zone-of-control": {
    id: "r-zone-of-control",
    term: "Zone of Control",
    aliases: ["zoc", "zone of control"],
    category: GROUND,
    imagePath: null,
    body: `A Zone of Control is the ground a faction dominates, considered as an obstacle. Moving through territory somebody else controls is slower than moving through open country.

WHAT IT AFFECTS
· Enemy-controlled hexes cost extra movement to cross, so a well-held region genuinely slows an invasion rather than just changing colour.
· It makes [[r-open-borders|open borders]] worth something concrete. An ally's ground is not merely permitted, it is passable.
· It is why [[r-influence|influence]] is a military asset and not only an economic one.

WHAT MOVES IT
· It is exactly the ground you dominate, so everything that moves influence moves this.
· Open borders remove the penalty for the faction you granted them to.`,
  },

  "r-occupation": {
    id: "r-occupation",
    term: "Occupation",
    aliases: ["occupied", "occupying"],
    category: GROUND,
    imagePath: null,
    body: `Occupation is holding somebody else's settlement by force without it having become yours.

WHAT IT AFFECTS
· It is enormously expensive for the occupied faction — about ${S.occupation} [[r-sway|Sway]] a round, which is more than their entire floor. A faction under occupation is very nearly locked out of politics.
· It hands the occupier almost none of that. Occupation destroys political capacity rather than transferring it, which is deliberate: taking somebody's capital does not make you popular.
· It writes a [[r-grievance|grievance]] every round it continues, so it is a growing justification for everybody else.

WHAT MOVES IT
· It ends when the place is returned, when it becomes genuinely yours through [[r-loyalty|loyalty]], or when they take it back.
· It is one of the strongest [[r-coalition|coalition]] grounds in the game. An occupied faction is a faction actively shopping for partners.`,
  },

  "r-trespass": {
    id: "r-trespass",
    term: "Trespass",
    aliases: ["trespassing"],
    category: GROUND,
    imagePath: null,
    body: `Trespass is moving your units onto ground another faction dominates without [[r-open-borders|open borders]] from them.

It is not an attack and it does not start a war on its own. It is a diplomatic incident, and the game shows you the price before you commit the move.

WHAT IT AFFECTS
· Their [[r-standing|Standing]] with you drops (about ${D.trespass.standingPenalty}), and your reputation takes a smaller general knock.
· It escalates. The second and third incursions cost more than the first — a border violation is a mistake, a pattern of them is a policy.

WHAT MOVES IT
· Good relations soften it. A friendly faction shrugs off a crossing that a wary one will not.
· It stops mattering entirely once they open their borders to you, which is often the cheapest thing to negotiate before a campaign rather than after it.`,
  },

  "r-actions": {
    id: "r-actions",
    term: "Actions",
    aliases: ["action", "actions per round"],
    category: GROUND,
    imagePath: null,
    body: `Actions are what you spend to do things on the board in a round. THIS IS THE RULE PLAYERS MISS MOST OFTEN, SO IT IS WORTH SAYING PLAINLY: YOU GET NO ACTIONS FOR EXISTING.

You get one Action per Location you hold. A faction with two Locations gets two Actions. A faction that has lost its Locations gets none and can do nothing on the board at all, however much scrap it is sitting on.

WHAT IT AFFECTS
· Every board action — building, moving with intent, acting on a site — comes out of this pool.
· It means territory is not merely income. It is your capacity to act, and losing ground reduces what you are able to attempt as well as what you can afford.
· It is why an army that cannot take ground is a much worse investment than it looks.

WHAT MOVES IT
· Taking a Location. That is the whole mechanism.
· Note that diplomacy does NOT come out of this pool — political acts are paid for in [[r-sway|Sway]]. A faction reduced to no Locations can still court, gift and negotiate. Politics is the one thing you cannot be driven off the board out of.`,
  },

  // ── Quiet work ────────────────────────────────────────────────────────────

  "r-intrigue": {
    id: "r-intrigue",
    term: "Quiet Work",
    aliases: ["intrigue", "covert"],
    category: QUIET,
    imagePath: null,
    body: `Quiet work is what you do to a faction's reputation instead of to its army. There are three operations, each costing ${S.opCost} [[r-sway|Sway]]:

· [[r-expose|EXPOSE]] — publish something true that somebody did quietly.
· [[r-forge|FORGE]] — publish something false about a third party.
· [[r-fabricate|FABRICATE]] — publish something false about yourself, to be seen a certain way.

WHAT IT AFFECTS
· All three move [[r-menace|Menace]], [[r-honor|Honor]] and [[r-standing|Standing]] — the same levers open war moves, reached without moving a unit.
· They are the cheapest way to manufacture [[r-just-war|grounds]], or to deny them to somebody else.

WHAT MOVES IT
· EVERY COVERT ACT IS ROLLED AGAINST BEING SEEN THROUGH, and the same roll applies to everybody — you, the factions, the ones you like. There is no asymmetry to exploit here.
· Your [[r-honor|Honor]] is your cover. A faction with a clean record is believed; one with a bad one is suspected before the roll is made.
· Their counter-intelligence works against you: a [[r-spy-ring|Spy Ring]] of their own, or listening posts near where you are working.
· Being caught costs about ${OPS.caughtHonorLoss} Honor and ${OPS.caughtMenace} Menace, AND EVERYONE IT TOUCHED HOLDS IT AGAINST YOU. It is one of the most expensive single outcomes in the game.
· Lies decay. After about ${rounds(OPS.lieDecaysAfterRounds)} a fabrication stops being believed on its own.`,
  },

  "r-expose": {
    id: "r-expose",
    term: "Expose",
    aliases: ["exposing"],
    category: QUIET,
    imagePath: null,
    body: `Exposing is publishing something TRUE that a faction did quietly — a surprise attack nobody witnessed, a broken promise, work done in the dark.

It is the only one of the three operations whose subject is a real event, which is why it needs something real to work from and why it is the safest of them.

WHAT IT AFFECTS
· It converts hidden [[r-menace|Menace]] into public Menace. Violence that cost the perpetrator almost nothing because nobody saw it starts costing them properly.
· It creates [[r-just-war|grounds]] — for you and for everybody else who was wronged.
· It cools third parties on the target.

WHAT MOVES IT
· YOU CANNOT EXPOSE WHAT YOU HAVE NO WAY OF KNOWING. This is the important limit. You need EARS on it — see [[r-spy-ring|Ears]] — and without them the option is simply not offered, however obvious the crime seems from the outside.
· Only recent acts qualify, roughly the last ${rounds(OPS.exposeWindowRounds)}.
· Because it is true, it is far harder to catch you at than a lie. Exposing is the low-risk operation; the cost is that it needs both a real crime and real ears.`,
  },

  "r-forge": {
    id: "r-forge",
    term: "Forge",
    aliases: ["forgery", "forging"],
    category: QUIET,
    imagePath: null,
    body: `Forging is manufacturing evidence that a THIRD PARTY did something they did not do. It is how you make two other factions hate each other.

WHAT IT AFFECTS
· The target takes reputation damage as though the invented act were real, and third parties act on it.
· It can manufacture [[r-just-war|grounds]] for a war between two people who are not you, which is the whole appeal.
· It can be swept for and disproved later, at which point it stops working.

WHAT MOVES IT
· It is a lie, so it is rolled against detection — starting around ${pct(OPS.lieBaseDetection)} and moving from there.
· Your [[r-honor|Honor]] is your cover: each point of it makes you meaningfully harder to catch, and a bad record makes you easier.
· Their counter-intelligence pushes the other way.
· It decays after about ${rounds(OPS.lieDecaysAfterRounds)} whether or not anybody catches it. A forgery is a temporary condition you are paying to create.
· Being caught costs about ${OPS.caughtHonorLoss} Honor and ${OPS.caughtMenace} [[r-menace|Menace]], and the faction you framed will know exactly who did it.`,
  },

  "r-fabricate": {
    id: "r-fabricate",
    term: "Fabricate",
    aliases: ["fabrication", "fabricating"],
    category: QUIET,
    imagePath: null,
    body: `Fabricating is planting something false about YOURSELF — a reputation you have not earned, in either direction.

You might fabricate strength to frighten a neighbour out of attacking, or fabricate restraint to keep your [[r-menace|Menace]] from reading as high as it really is while you finish a war.

WHAT IT AFFECTS
· How other factions read your reputation, and therefore what they will sign, whether they will court you, and whether they will join a [[r-coalition|coalition]] against you.
· It is the only operation that works on the [[r-threat|Threat]] you present without changing anything you have actually done.

WHAT MOVES IT
· Same detection roll as a [[r-forge|forgery]], starting around ${pct(OPS.lieBaseDetection)}, with your [[r-honor|Honor]] as cover and their counter-intelligence against you.
· It decays after about ${rounds(OPS.lieDecaysAfterRounds)}.
· Being caught fabricating about yourself is the worst version of being caught: it costs the usual ${OPS.caughtHonorLoss} Honor, and it confirms to everybody watching that your record was worth lying about.`,
  },

  "r-spy-ring": {
    id: "r-spy-ring",
    term: "Ears",
    aliases: ["spy ring", "listening post", "apparatus", "espionage"],
    category: QUIET,
    imagePath: null,
    body: `"Ears" is the shorthand for having some way of knowing what happened somewhere you were not. Several operations and readings are simply unavailable without it, and the screen tells you which apparatus is carrying each one.

There are three, in descending order of reach:

· SPY RING — an Intelligence tech node. It hears everything, everywhere, and it is the only one that also reads the political layer: a rival's exact [[r-standing|Standing]], their [[r-interests|interests]], their [[r-position|positions]], their [[r-sway|Sway]].
· LISTENING POST — a building. It hears its own hex and the ones next to it, and only while you are paying its upkeep. An unpaid post is deaf.
· SCOUTS — an early Intelligence node. It hears only what you can currently see.

WHAT IT AFFECTS
· [[r-expose|Exposing]] requires ears on the place the act happened. Without them the verb is not offered.
· Exact figures on the Path to Dominion card — their tolerance, their floor, their real Standing — are Spy Ring readings. Without one you get direction and tier, never numbers.
· Ears also work defensively: your own apparatus is your counter-intelligence, and makes other factions' [[r-intrigue|quiet work]] against you likelier to be caught.

WHAT MOVES IT
· Research on the Intelligence branch of the tech wheel, or building and PAYING FOR listening posts near where you expect things to happen.
· Losing the ground a post sits on, or letting its upkeep lapse, takes the ears away again.`,
  },
};

export default RULES_GLOSSARY;
