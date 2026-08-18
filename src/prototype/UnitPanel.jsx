// Persistent floating panel for the currently-selected unit. Holographic
// chrome matching the rest of the redesign — corner brackets, a faction-
// colour top accent, glowing icon nodes for the stats, a holo close × and
// a holo Reinforce action. Bottom-left anchored, ~2:1 wide-and-short so
// it stays out of the way of the inspector and the event feed.
import { useState } from "react";
import { motion } from "framer-motion";
import { FACTIONS as UI_FACTIONS, UNIT_UPGRADES, CHIP_COLOR } from "./data.js";
import { C, CornerBrackets } from "./HudChrome.jsx";
import { useIsPhone } from "./useViewport.js";

const BAY_SLOTS = 2;

const A = import.meta.env.BASE_URL;
const ICON_STRENGTH = `${A}assets/ui/icons/stats/unit_strength_icon.png`;

const STR_COLOR = "#e0654a";  // coral — military / combat
const MOV_COLOR = C.gold;     // gold — logistics / mobility
const READY = "#7bb255";      // green — ready
const STOPPED = "#d2453f";    // warning red — held

// Compact chevron glyph — two parallel arrowheads pointing right.
function MovementGlyph({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7 L13 12 L5 17" />
      <path d="M11 7 L19 12 L11 17" />
    </svg>
  );
}

function StatusGlyph({ color, blocked, size = 18 }) {
  if (blocked) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M6 18 L18 6" />
      </svg>
    );
  }
  // Ready — sized to read cleanly inside the bubble.
  const dot = Math.round(size * 0.7);
  return (
    <motion.div
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: dot, height: dot, borderRadius: "50%",
        background: color, boxShadow: `0 0 9px ${color}, 0 0 16px ${color}99`,
      }}
    />
  );
}

// All icon-node bubbles use this — guarantees the icon ends up centred
// both horizontally and vertically regardless of source asset proportions.
function IconBubble({ color, size = 32, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: "radial-gradient(circle at 50% 40%, rgba(19,42,44,0.95), rgba(4,10,11,0.96))",
      border: `1px solid ${color}`,
      boxShadow: `0 0 9px ${color}77, inset 0 0 6px rgba(0,0,0,0.5)`,
      flexShrink: 0,
      overflow: "hidden",
    }}>
      {children}
    </span>
  );
}

function StatCell({ color, icon, label, value, delta }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", gap: 7, minWidth: 0,
    }}>
      <IconBubble color={color} size={38}>{icon}</IconBubble>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
        <span style={{
          fontFamily: C.font, fontSize: 17, fontWeight: 700,
          color: "#f4efe2", textShadow: `0 0 9px ${color}`, whiteSpace: "nowrap",
        }}>{value}</span>
        {delta > 0 && (
          <span style={{ fontFamily: C.font, fontSize: 10, color: READY, fontWeight: 700 }}>+{delta}</span>
        )}
      </div>
      <span style={{
        fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.8, textTransform: "uppercase",
        color, fontWeight: 600,
      }}>{label}</span>
    </div>
  );
}

// Phone-only stat chip — icon, value and label all inline in one row
// instead of StatCell's stacked icon/value/label column. Three of these
// side by side take roughly a third the vertical space of three
// StatCells, which is the point: the panel eats into board space on a
// phone screen, so "smaller" means flattening this, not just shrinking
// the same layout's fonts.
function PhoneStatChip({ color, icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <IconBubble color={color} size={18}>{icon}</IconBubble>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, minWidth: 0 }}>
        <span style={{
          fontFamily: C.font, fontSize: 11, fontWeight: 700,
          color: "#f4efe2", whiteSpace: "nowrap",
        }}>{value}</span>
        <span style={{
          fontFamily: C.font, fontSize: 6, letterSpacing: 1, textTransform: "uppercase",
          color, fontWeight: 600, whiteSpace: "nowrap",
        }}>{label}</span>
      </div>
    </div>
  );
}

function Tag({ color, children }) {
  return (
    <span style={{
      fontFamily: C.font, fontSize: 9, letterSpacing: 1.3, textTransform: "uppercase",
      fontWeight: 700, color, padding: "2px 7px", borderRadius: 3,
      border: `1px solid ${color}cc`, background: `${color}22`,
      boxShadow: `0 0 6px ${color}55`,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// Compact chip-bay row — one pill per slot, faded dashed pill for empty slots.
function ChipBay({ chips, compact }) {
  const accent = CHIP_COLOR.unit;
  const installed = chips.length;
  const slotH = compact ? 17 : 30;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : 4 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontFamily: C.font, fontSize: compact ? 7.5 : 8.5, letterSpacing: 1.4,
        textTransform: "uppercase",
      }}>
        <span style={{ color: "rgba(143,246,234,0.55)" }}>Chip Bay</span>
        <span style={{ color: installed >= BAY_SLOTS ? C.gold : "rgba(143,246,234,0.55)" }}>
          {installed}/{BAY_SLOTS}
        </span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: BAY_SLOTS }).map((_, i) => {
          const chip = UNIT_UPGRADES[chips[i]];
          if (!chip) {
            return (
              <div key={i} style={{
                flex: 1, height: slotH, borderRadius: 3,
                border: `1px dashed rgba(86,211,198,0.25)`,
                background: "rgba(8,12,14,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: C.font, fontSize: compact ? 7.5 : 8.5, letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "rgba(143,246,234,0.35)",
              }}>Empty</div>
            );
          }
          return (
            <div key={i} title={`${chip.name} — ${chip.effect}`} style={{
              flex: 1, height: slotH, borderRadius: 3, padding: compact ? "2px 4px" : "3px 5px",
              border: `1px solid ${accent}cc`,
              background: `linear-gradient(180deg, ${accent}26, ${accent}10)`,
              boxShadow: `0 0 6px ${accent}33, inset 0 0 4px ${accent}1a`,
              display: "flex", flexDirection: "column", justifyContent: "center", gap: 1,
              minWidth: 0,
            }}>
              <span style={{
                fontFamily: C.font, fontSize: compact ? 8 : 9, fontWeight: 700,
                letterSpacing: 0.5, color: "#f4efe2", lineHeight: 1,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{chip.name}</span>
              {!compact && (
                <span style={{
                  fontFamily: C.font, fontSize: 8, fontWeight: 600,
                  letterSpacing: 0.6, color: accent, lineHeight: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{chip.effect}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rail doc §3 — the offer to BREAK GROUND on a blockade where this unit stands.
//
// Only this half is a unit action. Everything about a blockade that already
// exists — its chips, its upkeep, its supply — lives in the blockade's own
// window, because a structure that outlives its builder should be selected
// like a place rather than reached through whichever soldier is parked on it.
//
// `offer` is null on ground a blockade could never go on, so the panel does
// not grow a permanently-dead section.
function BlockadeOffer({ offer, canAct, onBuild }) {
  const live = canAct && offer.can;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 7 }}>
      <div style={{ fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700 }}>
        Blockade
      </div>
      <button
        className="hud-int"
        disabled={!live}
        onClick={live ? () => onBuild?.() : undefined}
        style={{
          fontFamily: C.font, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
          textTransform: "uppercase", color: "#08100f", padding: "6px 8px", borderRadius: 4,
          border: `1px solid ${C.holo}`,
          background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
          boxShadow: `0 0 10px ${C.holo}55`,
          cursor: live ? "pointer" : "not-allowed",
          opacity: live ? 1 : 0.5,
          textAlign: "center", lineHeight: 1.2,
        }}
      >
        Raise blockade · {offer.cost} scrap
      </button>
      <div style={{ fontSize: 9.5, color: C.textFaint, lineHeight: 1.4 }}>
        {offer.reason
          ? offer.reason
          : `Pins this unit ~${offer.turns} turns, then holds the road alone · −${offer.upkeep} scrap/turn.`}
      </div>
    </div>
  );
}

export default function UnitPanel({ unit, hex, owned = true, canAct, reinforce, scrap, raidTargets = [], blockade, post, onReinforce, onContest, onBuildBlockade, onBuildPost, onClose }) {
  const isPhone = useIsPhone();
  if (!unit) return null;
  const faction = UI_FACTIONS[unit.owner];
  const factionColor = faction?.color || C.holo;
  const eff = {
    strength: unit.effectiveStrength ?? unit.strength,
    movement: unit.effectiveMovement ?? unit.movement,
  };
  const canReinforce = canAct && reinforce && reinforce.deficit > 0;
  const affordable = reinforce && scrap >= reinforce.cost;
  const canRaid = canAct && raidTargets.length > 0;
  const locationLabel = hex?.locationId
    ? hex.locationId.replace(/[A-Z]/g, (c) => " " + c).trim()
    : hex?.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{
        position: "absolute",
        left: 14,
        right: isPhone ? 14 : "auto",
        bottom: isPhone ? 106 : 58, // clear the bottom-right MenuOrb once full-width
        width: isPhone ? "auto" : 440,
        minHeight: isPhone ? 0 : 220,
        zIndex: 45,
        background: "linear-gradient(158deg, rgba(18,31,32,0.93), rgba(9,17,18,0.95) 60%, rgba(6,11,12,0.97))",
        border: `1px solid ${C.holo}`,
        borderTop: `2px solid ${factionColor}`,
        borderRadius: 8,
        boxShadow: `inset 0 0 26px rgba(86,211,198,0.06), 0 0 20px rgba(86,211,198,0.18), 0 10px 22px rgba(0,0,0,0.5)`,
        color: "#cfd6dc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top faction-colour accent */}
      <div style={{
        position: "absolute", top: 0, left: 16, right: 16, height: 2,
        background: `linear-gradient(90deg, transparent, ${factionColor}, transparent)`,
        opacity: 0.85, pointerEvents: "none",
      }} />
      <CornerBrackets color={C.holo} len={11} inset={5} w={1.4} />

      {/* Header — full width */}
      <div style={{
        display: "flex", alignItems: "center", gap: isPhone ? 8 : 10,
        padding: isPhone ? "7px 11px 7px" : "9px 13px 9px",
        borderBottom: "1px solid rgba(86,211,198,0.22)",
      }}>
        <span style={{
          width: isPhone ? 22 : 28, height: isPhone ? 22 : 28, borderRadius: "50%",
          background: `radial-gradient(circle at 36% 30%, ${factionColor}, #14110c 145%)`,
          border: "1.5px solid #100d09",
          boxShadow: `0 0 10px ${factionColor}aa, inset 0 1px 2px rgba(255,255,255,0.3)`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: C.font, fontWeight: 700, color: "#fff", fontSize: 13,
          flexShrink: 0,
        }}>
          {unit.name?.[0] || "?"}
        </span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: C.font, fontSize: 13.5, fontWeight: 700,
            letterSpacing: 0.8, textTransform: "uppercase", color: "#f4efe2",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: `0 0 10px ${factionColor}66`,
          }}>{unit.name}</span>
          <span style={{
            fontFamily: C.font, fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase",
            color: factionColor, fontWeight: 600, marginTop: 2,
          }}>
            {faction?.short || unit.owner} · {owned ? "Selected" : "Enemy · View Only"}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Deselect"
          className="hud-int"
          style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "rgba(6,14,15,0.85)",
            border: `1px solid ${C.holo}aa`,
            color: C.holoHi, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: C.font, fontSize: 13, fontWeight: 700, lineHeight: 1,
            padding: 0, flexShrink: 0,
            boxShadow: `0 0 6px rgba(86,211,198,0.28)`,
          }}
        >×</button>
      </div>

      {/* Body — 2 columns on desktop/iPad (stats left, status/action right);
          stacked on phone, where there isn't width for both side by side. */}
      <div style={{ display: "flex", flexDirection: isPhone ? "column" : "row", padding: isPhone ? "7px 10px 8px" : "15px 16px 16px", gap: isPhone ? 5 : 16, alignItems: "stretch", flex: 1, minHeight: 0 }}>
        {/* Left: stats row — flattened to inline icon+value+label chips on
            phone (PhoneStatChip) instead of StatCell's stacked column,
            since three stacked columns is what was making the panel tall. */}
        {isPhone ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center" }}>
            <PhoneStatChip
              color={STR_COLOR}
              icon={<img src={ICON_STRENGTH} alt="" style={{
                width: 11, height: 11, objectFit: "contain", display: "block",
                filter: `brightness(1.1) drop-shadow(0 0 4px ${STR_COLOR}aa)`,
              }} />}
              label="Strength"
              value={eff.strength}
            />
            <PhoneStatChip
              color={MOV_COLOR}
              icon={<MovementGlyph color={MOV_COLOR} size={11} />}
              label="Moves"
              value={`${unit.moveRemaining ?? eff.movement}/${eff.movement}`}
            />
            <PhoneStatChip
              color={unit.immobilized ? STOPPED : READY}
              icon={<StatusGlyph color={unit.immobilized ? STOPPED : READY} blocked={unit.immobilized} size={9} />}
              label="Status"
              value={unit.immobilized ? "Held" : "Ready"}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
            <StatCell
              color={STR_COLOR}
              icon={<img src={ICON_STRENGTH} alt="" style={{
                width: 22, height: 22, objectFit: "contain", display: "block",
                filter: `brightness(1.1) drop-shadow(0 0 4px ${STR_COLOR}aa)`,
              }} />}
              label="Strength"
              value={eff.strength}
              delta={typeof eff.strength === "number" && typeof unit.strength === "number" ? eff.strength - unit.strength : 0}
            />
            <StatCell
              color={MOV_COLOR}
              icon={<MovementGlyph color={MOV_COLOR} size={22} />}
              label="Moves"
              value={`${unit.moveRemaining ?? eff.movement}/${eff.movement}`}
            />
            <StatCell
              color={unit.immobilized ? STOPPED : READY}
              icon={<StatusGlyph color={unit.immobilized ? STOPPED : READY} blocked={unit.immobilized} size={22} />}
              label="Status"
              value={unit.immobilized ? "Held" : "Ready"}
            />
          </div>
        )}

        {/* Divider — vertical between side-by-side columns, horizontal once stacked */}
        <div style={isPhone ? { height: 1, background: "rgba(86,211,198,0.18)" } : { width: 1, background: "rgba(86,211,198,0.18)" }} />

        {/* Right: tags + location + (reinforce when needed) + helper */}
        <div style={{
          width: isPhone ? "auto" : 158, display: "flex", flexDirection: "column", gap: isPhone ? 4 : 7, minWidth: 0,
        }}>
          {(unit.veteran || unit.fortified) && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {unit.veteran && <Tag color={C.gold}>Veteran</Tag>}
              {unit.fortified && <Tag color={READY}>Fortified</Tag>}
            </div>
          )}

          {hex && (
            <div style={{
              fontFamily: C.font, fontSize: isPhone ? 8.5 : 9.5, letterSpacing: 1.3, textTransform: "uppercase",
              color: "rgba(143,246,234,0.62)", display: "flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              <motion.span
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                  background: C.holo, boxShadow: `0 0 5px ${C.holo}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                On {locationLabel}{hex.id ? ` · ${hex.id}` : ""}
              </span>
            </div>
          )}

          {/* Chip bay — installed upgrades + remaining slots. */}
          <ChipBay chips={unit.chips || []} compact={isPhone} />

          {canReinforce && (
            <button
              onClick={() => onReinforce(unit.uid, reinforce.onFriendlyLoc ? "instant" : "field")}
              disabled={!affordable || (!reinforce.onFriendlyLoc && !reinforce.canField)}
              className="hud-int"
              style={{
                fontFamily: C.font, fontSize: 10, fontWeight: 700,
                letterSpacing: 1.2, textTransform: "uppercase",
                color: "#08100f", padding: "6px 8px", borderRadius: 4,
                border: `1px solid ${C.holo}`,
                background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
                boxShadow: `0 0 10px ${C.holo}55`,
                cursor: (affordable && (reinforce.onFriendlyLoc || reinforce.canField)) ? "pointer" : "not-allowed",
                opacity: (affordable && (reinforce.onFriendlyLoc || reinforce.canField)) ? 1 : 0.5,
                textAlign: "center", lineHeight: 1.2,
              }}
            >
              {reinforce.onFriendlyLoc
                ? `Reinforce · ${reinforce.cost} scrap`
                : reinforce.canField
                ? `Send · ${reinforce.cost} · ETA ${reinforce.eta}`
                : "No supply route"}
            </button>
          )}

          {/* Rail doc §3 — raise a blockade, or fit chips to one already here.
              A blockade sits on a plain road hex and a plain hex opens no
              window of its own, so the unit standing there is the only handle
              the player has on it: the whole lifecycle lives here. */}
          {owned && blockade && (
            <BlockadeOffer blockade={blockade} offer={blockade} canAct={canAct} onBuild={onBuildBlockade} />
          )}

          {/* §17.7 — dig in a listening post. Same reasoning as the blockade
              controls: it goes on a plain hex, which opens no window. Only
              rendered once the tech that unlocks it is in hand, so the panel
              does not carry a permanently-refused button. */}
          {owned && post && (post.can || post.mine || !/Intelligence A2/.test(post.reason || "")) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 7 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700 }}>
                Listening post
              </div>
              <button
                className="hud-int"
                disabled={!canAct || !post.can}
                onClick={canAct && post.can ? () => onBuildPost?.() : undefined}
                style={{
                  fontFamily: C.font, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: "uppercase", color: "#08100f", padding: "6px 8px", borderRadius: 4,
                  border: `1px solid ${C.holo}`,
                  background: `linear-gradient(180deg, ${C.holoHi}, ${C.holo})`,
                  boxShadow: `0 0 10px ${C.holo}55`,
                  cursor: canAct && post.can ? "pointer" : "not-allowed",
                  opacity: canAct && post.can ? 1 : 0.5,
                  textAlign: "center", lineHeight: 1.2,
                }}
              >
                Build post · {post.cost} scrap
              </button>
              <div style={{ fontSize: 9.5, color: C.textFaint, lineHeight: 1.4 }}>
                {post.reason || `Concealed sight, radius ${post.range} · ${post.upkeep} scrap each turn.`}
              </div>
            </div>
          )}

          {/* §16 field raid — attack an enemy unit sharing this hex. */}
          {canRaid && raidTargets.map((t) => {
            const tf = UI_FACTIONS[t.owner];
            return (
              <button
                key={t.uid}
                onClick={() => onContest?.({ unit: unit.uid, target: t.uid })}
                className="hud-int"
                style={{
                  fontFamily: C.font, fontSize: 10, fontWeight: 700,
                  letterSpacing: 1.2, textTransform: "uppercase",
                  color: "#fff", padding: "6px 8px", borderRadius: 4,
                  border: `1px solid ${STOPPED}`,
                  background: `linear-gradient(180deg, #e0654a, ${STOPPED})`,
                  boxShadow: `0 0 10px ${STOPPED}55`,
                  cursor: "pointer", textAlign: "center", lineHeight: 1.2,
                }}
              >
                Attack {tf?.short || t.owner} · Str {t.effectiveStrength ?? t.strength}
              </button>
            );
          })}

          <div style={{
            fontFamily: C.font, fontSize: isPhone ? 7.5 : 8.5, letterSpacing: 0.5, lineHeight: isPhone ? 1.3 : 1.45,
            color: "rgba(143,246,234,0.45)",
            marginTop: "auto",
          }}>
            {!owned ? (
              <>Spotted <span style={{ color: factionColor, fontWeight: 700 }}>{faction?.short || unit.owner}</span> unit — read-only intel. You can't command another faction's forces.</>
            ) : (
              <>
                <span style={{ color: READY, fontWeight: 700 }}>Green</span> hex to move ·
                {canRaid ? (
                  <> <span style={{ color: STOPPED }}>Attack</span> the enemy sharing this hex</>
                ) : (
                  <> location to <span style={{ color: C.holoHi }}>Contest / Activate / Recruit</span></>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
