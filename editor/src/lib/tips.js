// One-stop tooltip strings for the content editor. Hover any "?" icon
// throughout the editor and the tip with the matching key shows up.
// Keep tips ≤ ~2 short sentences — they fit on hover and answer
// "what does this field do" without sending the author elsewhere.

export const TIPS = {
  // --- encounter top-level fields ---
  "encounter.id":
    "Stable identifier the engine uses to reference this encounter from triggers and DELIVER_ENCOUNTER effects. Lower-case, underscores or dashes; can't be changed without rewiring callers.",
  "encounter.title":
    "Player-facing name shown on the encounter card. Leave blank to auto-generate from the id.",
  "encounter.mode.private":
    "Fires to one player only — no hex on the map. Use for governance events (e.g. 'a delegation arrives at your capital').",
  "encounter.mode.public":
    "All players see it at once and either each choose individually or one player chooses for the group (the publicGroupChoice toggle).",
  "encounter.mode.placement":
    "Lands on a hex matching the placement filter. Stays there until expiresIn rounds elapse or a unit triggers it.",
  "encounter.recipient":
    "Who receives the encounter. 'active' = the player whose turn produced it. The parameterized forms (controller-of, lowest-standing-with) compute the recipient from current state.",
  "encounter.publicGroupChoice":
    "When ON, only one player (the active player) picks the outcome for everyone. OFF = every player picks for themselves.",

  // --- trigger section ---
  "trigger.condition":
    "Evaluated at end-of-round. If false, the encounter doesn't compete to fire this round. Empty = always eligible.",
  "trigger.strength":
    "How urgent / important this encounter is right now. The top 2 highest-scoring eligible triggers fire each round. Use the if-cascade for context-aware strength (e.g. higher strength when the player owns a particular Location).",
  "trigger.weight":
    "Rarity multiplier on strength. A 'Mythic' encounter (0.1×) at strength 5 scores 0.5 — only fires if no peer beats it. Use Normal (1.0) unless this should be a deliberate occasional event.",
  "trigger.cooldown":
    "Rounds before this trigger can fire again after it fires once. 0 = no cooldown.",

  // --- placement ---
  "placement.expiresIn":
    "After this many rounds on the board, the placed encounter is removed even if no one triggered it.",
  "placement.hexFilter":
    "All fields ANDed; empty matches any hex. Use to restrict placement to e.g. wasteland hexes within 2 of a capital.",
  "hexFilter.type":
    "Hex's high-level kind. 'location' = has a Location, 'encounter' = pre-seeded encounter marker, 'terrain' = wasteland / mountain / etc.",
  "hexFilter.terrain":
    "Specific terrain sub-type (mountain, forest, rubble, wetland). Free-text accepted for future terrains.",
  "hexFilter.hasRoad":
    "Restrict to hexes that lie on a road (true) or off-road (false). Roads are laid as MST between capitals at setup.",
  "hexFilter.hasChip":
    "Only match if the hex has this specific installed chip (looks at loc.chips). Use 'capital' for capital hexes, etc.",
  "hexFilter.controlledBy":
    "Who must own the location on this hex. 'any-player' = any faction; 'neutral' = unowned.",
  "hexFilter.strategicValue":
    "Location's importance tier. 'veryHigh' = capitals; others are scaled.",

  // --- DSL builder ---
  "dsl.op":
    "Compare two values. Either side can be a literal number, a dotted state path (e.g. 'players.versari.resource'), or another DSL form that returns an integer (controls_count, unit_count, score).",
  "dsl.has_flag":
    "Player-flag check. Flags are set by SET_PLAYER_FLAG effects in earlier encounters — this is how you remember 'they helped the courier' across sessions.",
  "dsl.has_chip":
    "True if a chip with this id is installed in the requested scope. Use to gate choices on 'do you have a Medic Bay anywhere' or 'does this hex's garrison have armor plating'.",
  "dsl.unit_count":
    "Integer count of units the player owns (optionally filtered by unitType). Combine with op() to gate on 'has at least 3 units'.",
  "dsl.score":
    "Reputation / diplomacy scalar. menace and honor are global per-player; standing is from-faction × to-faction; tolerance is observer's patience with subject's menace.",
  "dsl.controls_count":
    "Integer count of locations the player controls (optionally filtered by strategicValue).",
  "dsl.control_duration":
    "Integer rounds the player has continuously controlled a specific hex (a Location). 0 if they don't control it. Gate on 'held the relay for 3 rounds'.",
  "dsl.unit_on_hex_duration":
    "Integer rounds a unit has sat on a hex — 0 the round it arrives. Player form returns the longest dwell among that player's units on the hex (blank hex = the encounter hex). Use with op() to gate the next beat on 'park a unit here for N rounds'.",

  // --- choices / effects ---
  "choice.label":
    "Button text the player clicks. Keep under ~30 chars — long labels truncate in the in-game card.",
  "choice.condition":
    "If false, the choice is hidden from the player. Empty = always available.",
  "choice.deferredDelay":
    "If set, the choice's effects don't resolve immediately — they queue and fire this many rounds later. Use for delayed consequences.",
  "effect.condition":
    "Optional gate on this specific effect. Useful on DELIVER_ENCOUNTER to route to different beats based on current state.",
  "deliver.condition":
    "If false, the next beat is silently skipped. Other effects on the same choice still run. Chain two DELIVER_ENCOUNTER effects with opposite conditions to route 'success path / fallback path'.",

  // --- decision tree / beats ---
  "beat.id":
    "Sub-beat ids look like 'parentId/2'. The head beat shares the encounter id. The engine routes to beats by id via DELIVER_ENCOUNTER.",
  "beat.text":
    "Body text the player reads. Wiki cross-links can use [[term]] markup once the wiki feature lands.",
  "beat.art":
    "Free-text art direction notes — for your reference, not shown in-game.",

  // --- wiki ---
  "wiki.id":
    "Stable identifier the [[term]] markup falls back to if the displayed term doesn't match. Lower-case, dash-separated.",
  "wiki.term":
    "What the entry is called. The renderer looks up `[[term]]` first by exact match on this field, then by id, then by alias.",
  "wiki.aliases":
    "Alternate spellings the [[markup]] resolver treats as pointing to this same entry. Comma-separated.",
  "wiki.category":
    "Grouping shown in the in-game wiki's left sidebar. Free-text; pick from the starter buttons or type your own.",
  "wiki.body":
    "Body text. Use [[term]] to cross-link to another entry, or [[term|display]] to show different visible text. Plain newlines are preserved.",

  // --- quest top-level ---
  "quest.id":
    "Stable identifier the engine uses to reference this quest (START_QUEST, ADVANCE_QUEST, COMPLETE_QUEST). Lower-case; can't be changed without rewiring callers.",
  "quest.title":
    "Player-facing name shown on the quest log. Leave blank to auto-generate from the id.",
  "quest.mode.single-player":
    "Only the claimant runs this quest's beats. Use for personal storylines.",
  "quest.mode.global":
    "All players experience the beats simultaneously. Use for world events (the rains stop, a comet falls).",

  // --- quest beat ---
  "beat.ordinal":
    "Display order among beats. Lower numbers come first. Has no effect on gating — use prerequisites for that.",
  "beat.deliver.auto":
    "The beat fires automatically when its prerequisites are met and the round-end pipeline reaches it.",
  "beat.deliver.discovered":
    "The beat sits on a hex (filtered by placementFilter) until a player's unit enters it.",
  "beat.deliver.conditional":
    "The beat only fires when the deliverCondition DSL evaluates true. Use for one-off triggers like 'when player has 5 alignment'.",
  "beat.mode.private":
    "Only the claimant (or chosen recipient) sees and resolves this beat.",
  "beat.mode.public":
    "All players see and resolve this beat together.",
  "beat.deliverCondition":
    "DSL gate evaluated at round-end. False = beat stays dormant. Only used with deliver=conditional.",
  "beat.placementFilter":
    "Hex constraints for where this beat appears. Only used with deliver=discovered. Empty = anywhere.",
  "beat.prereqs":
    "Other beats that must already be completed before this one becomes eligible. Engine-level gating, separate from the choice-driven decision tree.",

  // --- field encounter ---
  "field.id":
    "Stable identifier. Lower-case, prefixed `fe_` by convention. Referenced by PLACE_ENCOUNTER / DELIVER_ENCOUNTER.",
  "field.title":
    "Player-facing name on the encounter card. Leave blank to auto-generate from the id.",
  "field.copies":
    "How many copies of this card seed the field-encounter deck at game start. 0 marks a sub-beat that never appears standalone (set automatically when authoring sub-beats).",

  // --- weight tiers (per-row) ---
  "weight.common":
    "2.0× multiplier. Fires aggressively — wins ties at the cutoff.",
  "weight.normal":
    "1.0×. The default. Strength alone decides the ranking.",
  "weight.uncommon":
    "0.6×. Needs higher raw strength to compete with normal-weight peers.",
  "weight.rare":
    "0.3×. Only fires when its strength is very high relative to the field.",
  "weight.mythic":
    "0.1×. Effectively a 'special occasion' encounter — fires almost never unless the strength cascade pushes it to a 5 in a quiet round.",
};

export function tip(key) {
  return TIPS[key] ?? null;
}
