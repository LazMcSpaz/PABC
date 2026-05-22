// Pre-save validation. Matches the responsibilities listed in
// docs/content-schema-v0.1.md §"Editor-side validation responsibilities".

import {
  EFFECT_TYPES,
  HEX_FILTER_KEYS,
  HEX_TYPE_OPTIONS,
  STRATEGIC_VALUE_OPTIONS,
  TERRAIN_OPTIONS,
  FACTION_IDS,
} from "./schema.js";
import { validateCond, validateStrength } from "./dsl.js";
import { isValidRecipient } from "./recipient.js";

export function validateHexFilter(filter, errors = [], path = "hexFilter") {
  if (filter == null) return errors;
  if (typeof filter !== "object" || Array.isArray(filter)) {
    errors.push(`${path}: must be an object`);
    return errors;
  }
  for (const key of Object.keys(filter)) {
    if (!HEX_FILTER_KEYS.includes(key)) {
      errors.push(`${path}: unknown key '${key}'`);
    }
  }
  if (filter.type != null && !HEX_TYPE_OPTIONS.includes(filter.type)) {
    errors.push(`${path}.type: must be one of ${HEX_TYPE_OPTIONS.join(", ")}`);
  }
  if (
    filter.strategicValue != null &&
    !STRATEGIC_VALUE_OPTIONS.includes(filter.strategicValue)
  ) {
    errors.push(
      `${path}.strategicValue: must be one of ${STRATEGIC_VALUE_OPTIONS.join(", ")}`,
    );
  }
  if (filter.terrain != null && !TERRAIN_OPTIONS.includes(filter.terrain)) {
    errors.push(
      `${path}.terrain: must be one of ${TERRAIN_OPTIONS.join(", ")}`,
    );
  }
  for (const k of ["withinHexesOf", "outsideHexesOf"]) {
    if (filter[k] != null) {
      if (!filter[k].hex) errors.push(`${path}.${k}.hex required`);
      if (
        filter[k].range == null ||
        !Number.isInteger(Number(filter[k].range))
      ) {
        errors.push(`${path}.${k}.range must be an integer`);
      }
    }
  }
  return errors;
}

export function validateEffect(effect, ctx, errors = [], path = "effect") {
  if (!effect.type) {
    errors.push(`${path}.type required`);
    return errors;
  }
  if (!EFFECT_TYPES.includes(effect.type)) {
    errors.push(`${path}.type: '${effect.type}' is not in the locked list of 22`);
    return errors;
  }
  const p = effect.params ?? {};
  switch (effect.type) {
    case "ADJUST_RESOURCE":
      if (!p.resource) errors.push(`${path}.resource required`);
      if (!Number.isFinite(Number(p.amount))) errors.push(`${path}.amount must be a number`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "MODIFY_STAT":
      if (!p.stat) errors.push(`${path}.stat required`);
      if (!Number.isFinite(Number(p.amount))) errors.push(`${path}.amount must be a number`);
      if (!p.duration) errors.push(`${path}.duration required`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "GRANT_ACTIONS":
      if (!Number.isFinite(Number(p.amount))) errors.push(`${path}.amount must be a number`);
      if (!p.when) errors.push(`${path}.when required`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "MOVE_CARD":
      if (!p.from) errors.push(`${path}.from required`);
      if (!p.to) errors.push(`${path}.to required`);
      if (!p.selector) errors.push(`${path}.selector required`);
      break;
    case "SET_FLAG":
      if (!p.flag) errors.push(`${path}.flag required`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "TRANSFER":
      if (!p.what) errors.push(`${path}.what required`);
      requireRecipient(p.from, errors, `${path}.from`);
      requireRecipient(p.to, errors, `${path}.to`);
      break;
    case "CONVERT":
      if (!p.from) errors.push(`${path}.from required`);
      if (!p.to) errors.push(`${path}.to required`);
      if (!p.rate || p.rate.cost == null || p.rate.gain == null) {
        errors.push(`${path}.rate.cost and .rate.gain required`);
      }
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "SPAWN":
      if (!p.source) errors.push(`${path}.source required`);
      if (!p.zone) errors.push(`${path}.zone required`);
      break;
    case "PEEK":
      if (!p.deck) errors.push(`${path}.deck required`);
      if (!Number.isInteger(Number(p.count))) errors.push(`${path}.count must be integer`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "FORCE_CHOICE":
      requireRecipient(p.chooser, errors, `${path}.chooser`);
      requireRecipient(p.target, errors, `${path}.target`);
      if (!Array.isArray(p.options) || p.options.length === 0) {
        errors.push(`${path}.options must be a non-empty list`);
      }
      break;
    case "SURCHARGE":
      if (!p.action) errors.push(`${path}.action required`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "REDIRECT":
      if (!p.field) errors.push(`${path}.field required`);
      if (!p.operation) errors.push(`${path}.operation required`);
      break;
    case "CANCEL":
      if (p.condition != null) validateCond(p.condition, errors, `${path}.condition`);
      break;
    case "ADJUST_TRACK":
      if (!p.track) errors.push(`${path}.track required`);
      if (!Number.isFinite(Number(p.amount))) errors.push(`${path}.amount must be a number`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "ADJUST_STANDING":
      if (!FACTION_IDS.includes(p.faction))
        errors.push(`${path}.faction must be one of ${FACTION_IDS.join(", ")}`);
      requireRecipient(p.player, errors, `${path}.player`);
      if (!Number.isFinite(Number(p.amount))) errors.push(`${path}.amount must be a number`);
      break;
    case "SET_PLAYER_FLAG":
      if (!p.flag) errors.push(`${path}.flag required`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "QUEUE_DEFERRED":
      if (!Array.isArray(p.effects)) errors.push(`${path}.effects required`);
      else {
        p.effects.forEach((sub, i) =>
          validateEffect(sub, ctx, errors, `${path}.effects[${i}]`),
        );
      }
      if (!Number.isInteger(Number(p.delayRounds)))
        errors.push(`${path}.delayRounds must be integer`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    case "START_QUEST":
      if (!p.questId) errors.push(`${path}.questId required`);
      requireRecipient(p.claimant, errors, `${path}.claimant`);
      break;
    case "ADVANCE_QUEST":
      if (!p.questId) errors.push(`${path}.questId required`);
      if (!p.beatId) errors.push(`${path}.beatId required`);
      break;
    case "COMPLETE_QUEST":
      if (!p.questId) errors.push(`${path}.questId required`);
      break;
    case "PLACE_ENCOUNTER":
      if (!p.encounterId) errors.push(`${path}.encounterId required`);
      else if (ctx?.worldEncounterIds && !ctx.worldEncounterIds.has(p.encounterId)) {
        errors.push(`${path}.encounterId: '${p.encounterId}' is not an existing world_encounter`);
      }
      if (p.hexFilter != null) validateHexFilter(p.hexFilter, errors, `${path}.hexFilter`);
      break;
    case "DELIVER_ENCOUNTER":
      if (!p.encounterId) errors.push(`${path}.encounterId required`);
      else if (ctx?.worldEncounterIds && !ctx.worldEncounterIds.has(p.encounterId)) {
        errors.push(`${path}.encounterId: '${p.encounterId}' is not an existing world_encounter`);
      }
      if (p.recipient != null && p.recipient !== "")
        requireRecipient(p.recipient, errors, `${path}.recipient`);
      break;
    case "ADJUST_BASE_STRENGTH":
      if (!Number.isFinite(Number(p.amount)))
        errors.push(`${path}.amount must be a number`);
      requireRecipient(p.target, errors, `${path}.target`);
      break;
    default:
      errors.push(`${path}.type: unknown effect type ${effect.type}`);
  }
  return errors;
}

function requireRecipient(value, errors, path) {
  if (!isValidRecipient(value)) errors.push(`${path}: invalid recipient '${value ?? ""}'`);
}

export function validateChoice(choice, ctx, errors = [], path = "choice") {
  if (!choice.label) errors.push(`${path}.label required`);
  if (choice.condition != null) validateCond(choice.condition, errors, `${path}.condition`);
  if (choice.deferredDelay != null && !Number.isInteger(Number(choice.deferredDelay))) {
    errors.push(`${path}.deferredDelay must be an integer`);
  }
  (choice.effects ?? []).forEach((e, i) =>
    validateEffect(e, ctx, errors, `${path}.effects[${i}]`),
  );
  return errors;
}

// Validates a multi-beat story (kind = "world" | "field"). Head-level
// metadata + an ordered array of beats (each with id, text, choices).
function validateStoryBeats(story, errors, ctx) {
  const beats = story.beats ?? [];
  if (beats.length === 0) {
    errors.push("story.beats: at least one beat required");
    return;
  }
  beats.forEach((b, i) => {
    if (!b.id) errors.push(`beat[${i}].id required`);
    if (!b.text) errors.push(`beat[${i}].text required`);
    (b.choices ?? []).forEach((c, j) =>
      validateChoice(c, ctx, errors, `beat[${i}].choice[${j}]`),
    );
    if ((b.choices ?? []).length > 3) {
      errors.push(`beat[${i}]: at most 3 choices`);
    }
  });
}

export function validateWorldEncounter(story, ctx) {
  const errors = [];
  if (!story.id) errors.push("world_encounter.id required");
  if (!story.mode) errors.push("world_encounter.mode required");
  if (story.mode !== "placement") {
    if (!story.recipient) {
      errors.push(
        "world_encounter.recipient required for non-placement modes",
      );
    } else if (!isValidRecipient(story.recipient)) {
      errors.push(`world_encounter.recipient: invalid '${story.recipient}'`);
    }
  }
  if (story.triggerCondition != null)
    validateCond(story.triggerCondition, errors, "triggerCondition");
  else errors.push("world_encounter.triggerCondition required");
  if (story.triggerStrength != null)
    validateStrength(story.triggerStrength, errors, "triggerStrength");
  else errors.push("world_encounter.triggerStrength required");
  if (
    story.triggerCooldown == null ||
    !Number.isInteger(Number(story.triggerCooldown))
  ) {
    errors.push("world_encounter.triggerCooldown must be integer");
  }
  if (story.mode === "placement" && story.placementFilter != null) {
    validateHexFilter(story.placementFilter, errors, "placementFilter");
  }
  if (
    story.mode === "placement" &&
    story.expiresIn != null &&
    !Number.isInteger(Number(story.expiresIn))
  ) {
    errors.push("world_encounter.expiresIn must be integer");
  }
  validateStoryBeats(story, errors, ctx);
  return errors;
}

export function validateFieldEncounter(story, ctx) {
  const errors = [];
  if (!story.id) errors.push("field_encounter.id required");
  if (
    story.copies == null ||
    !Number.isInteger(Number(story.copies)) ||
    Number(story.copies) < 1
  ) {
    errors.push("field_encounter.copies must be a positive integer");
  }
  validateStoryBeats(story, errors, ctx);
  return errors;
}

export function validateQuest(quest, ctx) {
  const errors = [];
  if (!quest.id) errors.push("quest.id required");
  if (!quest.mode) errors.push("quest.mode required");
  const beatIds = new Set((quest.beats ?? []).map((b) => b.id));
  (quest.beats ?? []).forEach((b, i) => {
    if (!b.id) errors.push(`beat[${i}].id required`);
    if (!b.deliver) errors.push(`beat[${i}].deliver required`);
    if (b.deliver === "conditional") {
      if (b.deliverCondition == null) {
        errors.push(`beat[${i}].deliverCondition required for conditional delivery`);
      } else {
        validateCond(b.deliverCondition, errors, `beat[${i}].deliverCondition`);
      }
    }
    if (b.deliver === "discovered") {
      if (b.placementFilter == null) {
        errors.push(`beat[${i}].placementFilter required for discovered delivery`);
      } else {
        validateHexFilter(b.placementFilter, errors, `beat[${i}].placementFilter`);
      }
    }
    if (b.mode === "private" && b.recipient && !isValidRecipient(b.recipient)) {
      errors.push(`beat[${i}].recipient: invalid '${b.recipient}'`);
    }
    if (!b.text) errors.push(`beat[${i}].text required`);
    (b.choices ?? []).forEach((c, j) =>
      validateChoice(c, ctx, errors, `beat[${i}].choice[${j}]`),
    );
    if ((b.choices ?? []).length > 3) {
      errors.push(`beat[${i}]: at most 3 choices`);
    }
  });
  (quest.prereqs ?? []).forEach((p, i) => {
    if (!beatIds.has(p.beatId)) errors.push(`prereq[${i}].beatId references unknown beat`);
    if (!beatIds.has(p.prereqBeatId))
      errors.push(`prereq[${i}].prereqBeatId references unknown beat`);
    if (p.beatId === p.prereqBeatId) errors.push(`prereq[${i}] cannot reference itself`);
  });
  (quest.claimRewards ?? []).forEach((e, i) =>
    validateEffect(e, ctx, errors, `claimReward[${i}]`),
  );
  (quest.sharedRewards ?? []).forEach((e, i) =>
    validateEffect(e, ctx, errors, `sharedReward[${i}]`),
  );
  return errors;
}
