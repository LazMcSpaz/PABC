# Ashland Conquest

> **Build. Explore. Conquer.**

A post-apocalyptic strategy card game for 2–4 players. This repository contains the full prototype and, eventually, the production mobile application.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Game Overview](#game-overview)
3. [Current Status](#current-status)
4. [Prototype Goals](#prototype-goals)
5. [Architecture](#architecture)
6. [Tech Stack & Rationale](#tech-stack--rationale)
7. [Getting Started](#getting-started)
8. [Repository Structure](#repository-structure)
9. [Game Rules Reference](#game-rules-reference)
10. [Card Data Reference](#card-data-reference)
11. [AI Opponent System](#ai-opponent-system)
12. [Playtester Feedback System](#playtester-feedback-system)
13. [Roadmap to Production](#roadmap-to-production)
14. [Development Notes & Known Issues](#development-notes--known-issues)
15. [Design Document](#design-document)

---

## Project Overview

This project has two phases with a single codebase:

**Phase 1 (current): Functional Prototype**
A fully playable browser-based implementation of the game used to playtest all card effects, balance the economy, and refine rules before anything is locked in. The prototype supports human vs. AI play (powered by the Claude API) and includes a feedback logging system for capturing balance notes and design observations during live sessions.

**Phase 2: Production Mobile App**
The prototype is intentionally built so that it can evolve into a released mobile app on iOS and Android via [Capacitor](https://capacitorjs.com/). No rewrite required — the game engine is framework-agnostic and the UI is standard React. When Phase 2 begins, Capacitor is added and the project is compiled into a native shell.

---

## Game Overview

Ashland Conquest is a **2–4 player post-apocalyptic strategy card game**. Each player leads a faction rebuilding a settlement in the Ashlands — a devastated retro-futuristic world destroyed by a simultaneous global disease and solar catastrophe.

**Win condition:** First player to reach **30 Victory Points** wins immediately.

**Core loop each turn:**
1. Collect passive Scrap from your settlement
2. Declare any Attack or Defense boosts (costs 2 Scrap per +1)
3. Spend Actions to: Build, Explore, Raid, or play Intrigue cards
4. End turn

**The four main systems:**
- **Building** — Purchase buildings from a shared row to grow your settlement's Scrap income, Attack, Defense, and special abilities. Settlement holds up to 5 buildings + 1 leader.
- **Exploration** — Draw from a shared deck of challenges, events, and discoveries. Challenges award VP, resources, and unlock narrative content when resolved.
- **Raiding** — Spend an action to attack another player's settlement. Your Attack score vs. their Defense score. Defender wins ties. Successful raids yield Scrap and one declared outcome (destroy a building, steal an Intrigue card, or disable their leader).
- **Intrigue** — A hand of up to 3 covert operation cards. Some play on your turn, some are Immediate (reactive, played on any turn).

**Age Progression:** The game spans three Ages. Age 1 transitions to Age 2 when all three Progression Challenges (Secure ServoCo Factory, Secure Nova9 Tower, Activate Neptune Mainframe) are resolved collectively across all players. Age 2 transitions to Age 3 via similar conditions. New cards are added to all decks at each transition.

---

## Current Status

**Prototype version:** 0.1 — AI Playtest Build

**What exists:**
- Full Age 1 card set implemented (buildings, upgrades, leaders, exploration challenges, events, intrigue cards, narrative chains)
- Human vs. 2 AI opponents (Claude API-powered, each with distinct strategic personality)
- Turn structure, resource collection, boost system, Action economy
- Building row with mandatory end-of-round refresh
- Exploration deck draw and challenge resolution
- Raid system with declared outcomes
- Intrigue hand management
- Age 1 Progression Challenge tracking
- Narrative chain progression (beat-by-beat)
- Playtester feedback log (persistent within session, exportable)
- Capacitor-ready architecture (engine separated from UI)

**What is NOT yet implemented (known gaps for next development session):**
- Full automated Intrigue card effect resolution (currently flagged as manual-apply)
- Event card effects auto-applying to all players simultaneously
- Narrative chain cards integrated into the live Exploration deck (currently in separate UI tab only)
- Raid outcome execution in state (building destroy, leader disable, intrigue steal need to actually mutate state)
- Upgrade system (Unlockable Deck) — upgrades are defined in data but not purchasable in-game yet
- Leader replacement flow (acquiring and swapping leaders mid-game)
- Age 2 and Age 3 card sets (data pending)
- Age transition logic (unlock and shuffle new cards into decks)
- Persistent feedback storage (currently session-only; needs localStorage or file export)
- Multiplayer (pass-and-play for physical testing, or network for remote)
- Sound, animation, visual polish

See [Development Notes](#development-notes--known-issues) for more detail on each gap.

---

## Prototype Goals

The prototype must be functional enough to answer the following questions through play:

1. **Economy balance** — Is the Scrap economy generating the right amount of purchasing power per turn? Do players feel like they can afford meaningful things, or are they always starved / always flush?
2. **Action economy** — Is 2 base Actions per turn the right number? Do buildings that grant extra actions feel broken or essential?
3. **Attack/Defense balance** — Do raids happen at a reasonable rate? Is the defensive baseline (base 1 Defense) too easy to overcome or too hard?
4. **VP curve** — Is 30 VP the right threshold? Can games complete in a reasonable session (target: 45–90 minutes for 2 players)?
5. **Card power outliers** — Are any individual cards obviously too strong (snowballing, game-warping) or too weak (never worth purchasing/playing)?
6. **Narrative chain balance** — Are the costs for each narrative beat appropriate for the rewards they provide? Are the rewards compelling enough to pursue chains over other strategies?
7. **Boost system feel** — Does the requirement to declare boosts on your own turn create good forward-planning decisions, or does it feel arbitrary and punishing?
8. **Age 1 Progression timing** — How long does it take to trigger the Age 1 → Age 2 transition? Does it feel too early, too late, or variable in interesting ways?

Every playtest session should produce written feedback addressing as many of these as possible.

---

## Architecture

The codebase is deliberately structured so that the game engine has zero dependency on React or any UI framework. This means:

- The engine can be unit tested independently
- The engine ports to React Native trivially if that becomes necessary
- Capacitor can wrap the React UI without touching game logic
- AI prompt generation (which serializes game state) is also UI-independent

```
src/
├── engine/                   # Pure JS — no React imports anywhere in this directory
│   ├── cards.js              # All card data (buildings, leaders, exploration, intrigue, narrative chains)
│   ├── gameState.js          # makePlayer(), makeInitialState(), deck builders
│   ├── calculations.js       # calcAttack(), calcDefense(), calcVP(), calcPassiveScrap(), calcActions()
│   ├── actions.js            # build(), demolish(), explore(), resolveCard(), raid(), boost(), endTurn()
│   ├── resolution.js         # Per-card effect resolution — one function per card ID
│   ├── events.js             # Event card effects (applied to all players)
│   ├── intrigue.js           # Intrigue card effects (targeted, immediate, reactive)
│   ├── narrative.js          # Narrative chain state management
│   └── ai.js                 # AI decision engine + Claude API integration
├── hooks/
│   └── useGameEngine.js      # The ONLY place React state connects to the engine
│                             # Wraps engine functions in setState calls
├── components/               # Pure presentational components — receive props, emit events
│   ├── SetupScreen.jsx
│   ├── GameBoard.jsx
│   ├── PlayerPanel.jsx
│   ├── SettlementView.jsx
│   ├── BuildingRow.jsx
│   ├── ExploreView.jsx
│   ├── IntrigueView.jsx
│   ├── RaidView.jsx
│   ├── NarrativeView.jsx
│   ├── CardModal.jsx
│   ├── FeedbackPanel.jsx
│   └── WinScreen.jsx
├── App.jsx                   # Root component — wires useGameEngine to components
└── main.jsx                  # Entry point
```

### The Critical Rule

**Nothing inside `engine/` imports from React.** If you find yourself writing `import { useState }` inside `engine/`, stop and move that logic to `hooks/useGameEngine.js` instead. This boundary is what keeps the production path clean.

### Data Flow

```
User Action (tap button)
    ↓
Component emits callback (e.g., onBuild(cardId))
    ↓
useGameEngine.js calls engine function (e.g., actions.build(state, cardId))
    ↓
Engine returns new state (pure function — no mutation)
    ↓
useGameEngine calls setState(newState)
    ↓
React re-renders components with new state
```

---

## Tech Stack & Rationale

| Layer | Technology | Why |
|---|---|---|
| UI Framework | React (Vite) | Fast iteration, massive ecosystem, directly wrappable by Capacitor |
| Game Engine | Vanilla JS | No framework dependency — portable to any future target |
| AI Opponents | Anthropic Claude API (`claude-sonnet-4-20250514`) | Provides genuine strategic reasoning vs. scripted behavior |
| Native Wrapping | Capacitor (when ready) | Wraps existing React app for iOS/Android with no rewrite |
| State Management | React useState + custom hook | Sufficient for this complexity; no Redux needed |
| Persistence | localStorage (feedback log) + JSON export | Simple, works in browser and Capacitor |
| Styling | Inline styles / CSS-in-JS | Avoids build complexity for prototype phase |

### Why Not React Native?

React Native was considered and rejected for the prototype phase. The game engine logic is the core intellectual work of this project. That logic is the same regardless of UI framework. Building in web React allows faster iteration with simpler tooling, and Capacitor allows the same codebase to ship natively without a rewrite. For a card game (no high-performance rendering requirements), there is no meaningful performance argument for React Native over Capacitor.

### Why Capacitor Over Cordova?

Capacitor is the modern successor to Cordova, maintained by the Ionic team. It has first-class support for current iOS and Android SDK versions, better plugin ecosystem, and cleaner integration with modern JS build tools (Vite).

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- An Anthropic API key (for AI opponent functionality)

### Installation

```bash
git clone https://github.com/your-org/ashland-conquest.git
cd ashland-conquest
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```
VITE_ANTHROPIC_API_KEY=your_api_key_here
```

> **Note:** In the current prototype, the API key is used client-side directly. This is acceptable for a local playtest tool but must be moved server-side before any public release.

### Running the Prototype

```bash
npm run dev
```

Opens at `http://localhost:5173`. Designed for mobile viewport — use browser DevTools device emulation (iPhone size) for the most accurate experience.

### Building for Production

```bash
npm run build
```

### Adding Capacitor (when ready for native)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Ashland Conquest" "com.ashlandconquest.app"
npx cap add ios
npx cap add android
npm run build
npx cap sync
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio
```

---

## Repository Structure

```
ashland-conquest/
├── src/
│   ├── engine/
│   ├── hooks/
│   ├── components/
│   ├── App.jsx
│   └── main.jsx
├── public/
│   └── assets/           # Card art, icons (future)
├── docs/
│   ├── design-doc-v0.1.md   # Full game design document (source of truth)
│   └── playtesting-log.md   # Running notes from playtest sessions
├── feedback/
│   └── .gitkeep          # Exported feedback JSON files land here
├── .env.example
├── capacitor.config.json     # Added when Capacitor is initialized
├── vite.config.js
├── package.json
└── README.md
```

---

## Game Rules Reference

This section summarizes the rules as they should be implemented in the engine. The full design document (see `/docs/design-doc-v0.1.md`) is the authoritative source.

### Resources

| Resource | Type | Notes |
|---|---|---|
| Scrap | Spendable pool | Spent on buildings, boosts, and card costs. Earned passively each turn. |
| Attack | Static score | Built from buildings + leader. NOT spent — checked against requirements. |
| Defense | Static score | Same. Base passive Defense of 1 applies to all players always. |
| Actions | Per-turn economy | Base 2/turn. Spent on Build, Explore, Raid, Play Intrigue, or specific abilities. |
| Victory Points | Cumulative | Earned from buildings, leaders, completed challenges, narrative rewards. First to 30 wins immediately. |

### Boost Rules

- Cost: **2 Scrap = +1 Attack or Defense**
- Must be declared **on your own turn**
- Persists until the **start of your next turn**
- **Cannot boost in response to Surprise-type cards** — your static score is all you have

### Turn Order

1. Collect Resources (gain all passive Scrap; recalculate Attack/Defense; previous boosts expire)
2. Declare Boosts (optional — spend Scrap now if you want boosted scores this turn)
3. Take Actions (spend Actions in any order)
4. End of Turn Effects

### Building Row

- 5 face-up cards available for purchase at all times
- When purchased, immediately replaced by top of Building deck
- At end of every round (after last player's turn), **one card is removed and replaced** regardless of purchases
- Upgrades do NOT appear in the Building row — they come from the Unlockable Deck

### Raid Resolution

1. Attacker declares target and raid type (Destroy Building / Steal Intrigue / Disable Leader)
2. Compare Attacker's Attack vs. Defender's Defense
3. **Defender wins ties**
4. Success: Attacker gains declared outcome + half defender's current Scrap (rounded down)
5. Failure: No reward
6. Same player cannot be raided by the same attacker more than once per round

### Exploration Card Types

| Type | Behavior |
|---|---|
| Challenge | Active player attempts to resolve. Remains in play if failed/skipped — any player may attempt on their turn (costs 1 Action). |
| Event | Affects all players immediately when drawn. Not optional. |
| Discovery | One-time benefit for drawer. Resolved immediately, then discarded. |
| Challenge (Progression) | Special challenges that trigger Age transition when all three in a set are resolved. |
| Narrative (Beat) | Multi-step story cards. Completing a beat draws the next beat in the chain. |

**Surprise Type:** Marked cards that prevent any player from boosting Attack or Defense in response.

### Intrigue Cards

- Hand limit: 3 cards
- Playing an Intrigue card costs 1 Action (unless marked Immediate)
- **Immediate** cards can be played outside your turn in direct response to a trigger
- Exceeding hand limit: must immediately discard down to 3

### Disabling Buildings

- Certain Intrigue cards and failed Exploration challenges can disable buildings
- Disabled buildings provide no passive bonuses or abilities
- Re-enabling costs **1 Action + 2 Scrap** at the start of the owning player's turn (unless the disabling effect specifies different recovery)

---

## Card Data Reference

All card data lives in `src/engine/cards.js`. The schemas are:

### Building / Leader

```js
{
  id: string,           // unique snake_case identifier
  name: string,
  type: string,         // "Starter" | "Building" | "Upgrade" | "Leader (Starter)" | "Leader"
  scrapCost: number,    // Scrap spent to purchase
  atkCost: number,      // Attack score required (not spent — checked against score)
  passiveScrap: number, // Scrap generated per turn
  passiveAtk: number,   // Attack score contributed per turn
  passDef: number,      // Defense score contributed per turn
  passActions: number,  // Additional actions per turn
  vp: number,           // Victory Points when in settlement
  ability: string|null, // Text description of special ability
  upgradable: string,   // Name of upgrade, "Yes", or "No"
  requires: string,     // For upgrades: name of parent building required
  qty: number,          // Number of copies in the deck
}
```

### Exploration Card

```js
{
  id: string,
  name: string,
  type: string,         // "Challenge" | "Challenge (Progression)" | "Event" | "Discovery"
  scrapCost: number,    // Scrap spent to resolve (consumed)
  reqAtk: number,       // Attack score required (checked, not spent)
  reqDef: number,       // Defense score required (checked, not spent)
  scrapReward: number,
  atkReward: number,    // Permanent Attack bonus gained on resolution
  defReward: number,    // Permanent Defense bonus gained on resolution
  actionReward: number, // Actions gained on resolution
  vp: number,
  surprise: boolean,    // If true — no boosting allowed in response
  ability: string|null, // Full text of special effect
  qty: number,
}
```

### Intrigue Card

```js
{
  id: string,
  name: string,
  immediate: boolean,   // If true, can be played outside active turn
  vp: number,
  ability: string,      // Full text of effect
  qty: number,
}
```

### Narrative Chain Beat

```js
{
  chainId: string,
  chainName: string,
  beat: number,         // 1-indexed beat number within chain
  name: string,
  scrapCost: number,
  reqAtk: number,
  reqDef: number,
  ability: string,      // What the player does
  reward: string,       // What they receive
  branches: boolean,    // If true, this beat has multiple outcome paths
  branchOptions: [      // Only present if branches: true
    { label: string, requirements: {...}, reward: string }
  ]
}
```

---

## AI Opponent System

The AI system is in `src/engine/ai.js`. Each AI opponent has a **personality** defined by:

- A `systemPrompt` that shapes its strategic priorities and style
- A unique name and color for the UI

### Current Personalities

**The Warlord AI** (`#e74c3c`)
Aggressive raider. Prioritizes Attack-producing buildings. Raids whenever Attack exceeds a target's Defense. Will preferentially target the human player if they're ahead on VP. Uses Intrigue cards aggressively for sabotage.

**The Builder AI** (`#27ae60`)
Economic engine. Prioritizes Scrap-producing buildings, then explores constantly. Builds defensive structures rather than raiding. Wins through VP accumulation from completed challenges.

### How AI Decisions Work

On each AI turn, `getAIDecision()` is called with:
- Full serialized game state for that AI player (scores, settlement, hand, scrap)
- Available building row (filtered to what they can afford)
- Raidable targets (filtered to whom they can beat)
- Top exploration card (with canResolve flag pre-calculated)
- All opponents' visible stats

This is sent to the Claude API (`claude-sonnet-4-20250514`) with the personality system prompt. The model returns a structured JSON action plan:

```json
{
  "reasoning": "Brief explanation of strategy this turn",
  "actions": [
    { "type": "build", "buildingId": "forge" },
    { "type": "explore" },
    { "type": "raid", "targetId": 0, "raidType": "Destroy Building" },
    { "type": "boost", "stat": "def" },
    { "type": "play_intrigue", "cardName": "Sabotage", "targetId": 1 }
  ]
}
```

Actions are executed sequentially with a short delay for readability. The AI reasoning is logged and visible in the AI Log tab during play.

### Adding New AI Personalities

In `src/engine/ai.js`, add to the `AI_PERSONALITIES` array:

```js
{
  id: "diplomat",
  name: "The Diplomat AI",
  color: "#8e44ad",
  description: "Trading-focused. Prefers negotiation over conflict.",
  systemPrompt: `You are playing Ashland Conquest as a Diplomat faction...`
}
```

---

## Playtester Feedback System

The prototype includes a **Feedback Panel** accessible from the main navigation. During any point in a game session, any player can open it and enter free-form notes.

### How It Works

- Feedback entries are timestamped with the current round and game state summary (VP scores, round number)
- All entries are stored in `localStorage` under the key `ashland_feedback`
- Entries persist across browser sessions
- An **Export** button generates a downloadable `feedback-YYYY-MM-DD.json` file
- The JSON export can be committed to `/feedback/` in the repo for tracking across sessions

### Feedback Entry Schema

```json
{
  "id": "uuid",
  "timestamp": "ISO 8601",
  "round": 4,
  "gameState": {
    "playerVPs": [12, 8, 15],
    "age": 1,
    "progressionResolved": ["secure_servotech"]
  },
  "note": "Free-form text entered by the playtester"
}
```

### What to Note

Good feedback entries are specific. Examples of useful notes:

- *"Round 3 — Scrap Yard feels extremely strong in 2-player. Bought it turn 1 and have had surplus Scrap every turn since. May need to cap its bonus lower or raise its cost."*
- *"Raid TRAXON Factory — the +2 Actions on resolution is really swinging turns. Two players hit it back-to-back in Round 4 and it felt swingy."*
- *"The Old Lieutenant chain Beat 3 requirement (6 Attack) feels too high in Age 1. We couldn't meet it by Round 6 with any reasonable build."*
- *"Infected Hardware Intrigue: -4 Defense until next turn is devastating. Cost should probably be higher or the effect smaller."*

---

## Roadmap to Production

### Milestone 1: Functional Prototype (in progress)
- [ ] All Intrigue card effects fully automated in engine
- [ ] All Event card effects auto-applied to all players
- [ ] Raid outcomes mutate state correctly (building removal, leader disable, intrigue steal)
- [ ] Upgrade system working (Unlockable Deck, upgrade replaces parent building)
- [ ] Leader acquisition and replacement flow
- [ ] Narrative chain cards seeded into the Exploration deck
- [ ] Branching narrative outcomes implemented
- [ ] Persistent feedback log with JSON export
- [ ] Age transition logic (new cards shuffled in, UI updated)
- [ ] Age 2 and Age 3 card data added
- [ ] Pass-and-play mode (human vs. human, same device)

### Milestone 2: Playtesting & Balance
- [ ] Multiple complete sessions logged
- [ ] VP threshold confirmed or adjusted
- [ ] Economy tuning complete
- [ ] All card costs validated
- [ ] Narrative chain requirements tuned
- [ ] AI difficulty and personality feel right

### Milestone 3: Visual Design
- [ ] Custom card art (or placeholder art system)
- [ ] Proper typography and layout
- [ ] Card animations
- [ ] Sound design
- [ ] Onboarding / tutorial flow

### Milestone 4: Native Wrapper
- [ ] Capacitor added and configured
- [ ] iOS build compiling and running on device
- [ ] Android build compiling and running on device
- [ ] Native APIs integrated as needed (haptics, etc.)
- [ ] App Store assets prepared (icon, screenshots, description)

### Milestone 5: Release
- [ ] Apple App Store submission
- [ ] Google Play submission
- [ ] Multiplayer via network (optional — could ship without)

---

## Development Notes & Known Issues

### Intrigue Card Automation (HIGH PRIORITY)

Currently all Intrigue card effects show the card text and prompt the human player to "apply effects manually." This is the most significant gap for playtest accuracy. Each card needs a dedicated function in `src/engine/intrigue.js` that takes `(gameState, playerId, targetId)` and returns the new state.

The tricky ones are the **Immediate** cards — they need to hook into the game's event system so they can fire reactively (e.g., Emergency Protocols fires when a raid is declared, not on the player's turn). This requires an event bus or middleware pattern in the engine.

Suggested pattern:
```js
// engine/intrigue.js
export const INTRIGUE_EFFECTS = {
  sabotage: (state, playerId, targetBuildingUid) => {
    return disableBuilding(state, targetBuildingUid);
  },
  emergency_protocols: {
    immediate: true,
    trigger: "raid_declared_against",
    effect: (state, defenderId, attackerId) => {
      // Force attacker to spend 3 Scrap or abandon raid
    }
  },
  // ...
};
```

### Event Card Automation (HIGH PRIORITY)

Events need to apply effects to all players simultaneously. The current prototype resolves only the drawing player's interaction. Each event needs a function in `src/engine/events.js`:

```js
export const EVENT_EFFECTS = {
  harvest: (state) => {
    return {
      ...state,
      players: state.players.map(p => ({ ...p, scrap: p.scrap + 6 }))
    };
  },
  ash_storm: (state) => {
    return {
      ...state,
      players: state.players.map(p => ({
        ...p,
        skipExploreNextTurn: !p.settlement.find(b => b.id === "greenhouse"),
      }))
    };
  },
  // ...
};
```

### Raid Outcome Execution (HIGH PRIORITY)

The raid resolution currently calculates success/failure and transfers Scrap, but does not execute the declared outcome:
- **Destroy Building** — remove a specific building from defender's settlement (need UI to let attacker choose which building)
- **Steal Intrigue** — take a random card from defender's hand and add to attacker's hand
- **Disable Leader** — set `leader.disabled = true` on defender; cleared at start of their next turn

### Upgrade System

Upgrades are defined in card data but the purchase flow isn't implemented. When a player meets the upgrade conditions (owns the parent building, has sufficient resources), they should be able to trigger an upgrade. This removes the parent building card and inserts the upgrade card in the same settlement slot — no additional slot consumed.

The Unlockable Deck is a numbered deck kept separate. In the digital prototype this means maintaining a separate `unlockableDeck` array in game state that cards are pulled from (rather than the main building deck).

### AI API Key Security

The current implementation calls the Anthropic API client-side with the API key in the environment. This is fine for a local prototype tool. Before any public deployment, this must move to a server-side proxy. Options:
- Simple Express/Fastify server that proxies requests
- Cloudflare Worker or similar edge function
- Firebase/Supabase Function

### Pass-and-Play Mode

The current setup defaults to Human vs. 2 AI. For playtesting with multiple humans in a room, a pass-and-play mode is needed where each "player" is human and the device is physically handed around. This is a simple configuration change — replace AI personality slots with "Human" type and remove the AI turn logic.

### Multiplayer

Out of scope for the prototype but noted for Phase 2. Real-time multiplayer would require a backend with shared game state (WebSocket or polling). Supabase Realtime or Firebase RTDB are reasonable options. The engine's pure-function architecture makes this tractable — server holds canonical state, clients send actions and receive state updates.

---

## Design Document

The full game design document (version 0.1) is in `/docs/design-doc-v0.1.md`. It covers:

- Complete world lore and setting
- All six factions of the Ashlands
- Full rules for every system
- All named characters and their backgrounds
- Design principles and balance philosophy
- Known open questions (VP threshold, exact card values, Age 2/3 progression conditions)
- Planned expansions

The design document is the **source of truth for rules**. When this README and the design document conflict, the design document wins. When the engine and the design document conflict, it's a bug in the engine.

---

## Contributing

This is a private development project. All development sessions should begin by reviewing the current status section of this README and the open issues list to understand what work is in progress.

When starting a new coding session (especially in an AI-assisted environment without access to prior chat history), the recommended approach is:

1. Read this README fully
2. Read `/docs/design-doc-v0.1.md` for rules context
3. Check `/feedback/` for the latest exported playtest notes
4. Review open issues for current priorities
5. Start with the highest-priority item in [Development Notes](#development-notes--known-issues)

---

*Ashland Conquest — Design Document v0.1 / Prototype v0.1*
*Working draft — not for distribution*
