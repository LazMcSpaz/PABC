// Mirror of the engine's TEXT_TOKENS registry (src/game/textTokens.js).
// Used by the VariablePicker so authors don't have to type or remember
// the token syntax. Keep this list in sync with the engine's resolver —
// adding a token here without a resolver there will silently fall back
// to "someone" / "a place" / "a unit" in-game.

export const TEXT_TOKENS = [
  {
    group: "Factions",
    items: [
      { token: "{faction:active}",                       label: "active player's faction" },
      { token: "{faction:recipient}",                    label: "encounter recipient's faction" },
      { token: "{faction:lowest-standing-with-active}",  label: "faction that likes active player least" },
      { token: "{faction:highest-standing-with-active}", label: "faction that likes active player most" },
      { token: "{faction:hostile-to-active}",            label: "a faction currently at war with active player" },
    ],
  },
  {
    group: "Locations",
    items: [
      { token: "{location:active-capital}",        label: "active player's capital" },
      { token: "{location:strategic-near-active}", label: "nearest strategic Location to active player" },
      { token: "{location:contested}",             label: "a Location currently being contested" },
    ],
  },
  {
    group: "Units",
    items: [
      { token: "{unit:strongest-active}", label: "active player's strongest unit" },
      { token: "{unit:weakest-active}",   label: "active player's weakest unit" },
    ],
  },
];
