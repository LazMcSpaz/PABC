// Modal that pops when a Move would draw a field-encounter card, and the
// same window quest beats are delivered through (quests.js dispatches each
// beat as an encounter). By the time the player sees this, the move is
// already committed (the pre-move confirm overlay handles their last-chance
// to back out); the modal is just choose-your-resolution.
//
// Art is optional and always will be: only some encounters and beats carry
// an `imagePath`. So there are two first-class layouts, not one layout with
// a hole in it —
//
//   with art     720px, display frame beside the narrative + choices
//   without art  520px, single column, prose on a holo rail
//
// The narrow width matters: 13px prose across the full 720px runs to ~110
// characters a line, which is a punishing measure to read. Dropping to 520
// puts it back near 70.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { C, CornerBrackets, useEscClose } from "./HudChrome.jsx";
import { RichText } from "./RichText.jsx";
import { useIsPhone } from "./useViewport.js";
import EncounterOutcome from "./EncounterOutcome.jsx";

// The image goes in here at a 2:3 ratio. The outer chrome is a slightly
// raised holo bezel; the inner display is recessed (inset shadows + dark
// fill) so the whole thing reads as a screen mounted in a device, with
// real depth, rather than a flat rectangle. Only rendered when there is
// actually art to put in it.
function ImageFrame({ imageUrl, onError }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      aspectRatio: "2 / 3",
      // Outer chrome — light at top + dark at bottom for a subtle bezel
      padding: 8,
      borderRadius: 8,
      background: "linear-gradient(160deg, rgba(28,46,48,0.86) 0%, rgba(10,20,22,0.92) 100%)",
      border: `1px solid ${C.holo}cc`,
      boxShadow: `
        0 0 22px rgba(86,211,198,0.28),
        inset 0 1px 0 rgba(143,246,234,0.18),
        inset 0 -1px 0 rgba(0,0,0,0.55),
        inset 0 0 14px rgba(86,211,198,0.06)
      `,
    }}>
      <CornerBrackets color={C.holoHi} len={12} inset={4} w={1.5} />

      {/* Inset display screen — visibly recessed inside the chrome */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "linear-gradient(170deg, rgba(8,16,17,0.97), rgba(3,7,8,0.99))",
        border: `1px solid rgba(86,211,198,0.55)`,
        borderRadius: 3,
        boxShadow: `
          inset 0 0 24px rgba(0,0,0,0.88),
          inset 0 2px 4px rgba(0,0,0,0.7),
          inset 0 0 8px rgba(86,211,198,0.16)
        `,
        overflow: "hidden",
      }}>
        <img
          src={imageUrl}
          alt=""
          onError={onError}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", filter: "brightness(0.95)",
          }}
        />
        {/* Always-on top/bottom HUD strips on the inner display */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 16,
          background: "linear-gradient(180deg, rgba(86,211,198,0.10), transparent)",
          borderBottom: "1px solid rgba(86,211,198,0.18)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 18,
          background: "linear-gradient(0deg, rgba(0,0,0,0.5), transparent)",
          borderTop: "1px solid rgba(86,211,198,0.18)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 7px",
          fontFamily: C.font, fontSize: 8, letterSpacing: 1.4,
          textTransform: "uppercase", color: "rgba(143,246,234,0.6)",
          pointerEvents: "none",
        }}>
          <span>CAM_01</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              display: "inline-block", width: 5, height: 5, borderRadius: "50%",
              background: "#e0654a", boxShadow: "0 0 5px #e0654a",
            }} />
            REC
          </span>
        </div>
      </div>
    </div>
  );
}

// Exported so the event feed titles an encounter exactly the way the modal
// that showed it did — the feed used to print the raw `fe_grain_silo` id.
//
// A quest beat's synthetic id (`quest:q_massacre:beat:qb_mas_compound`) is
// the case this cannot prettify into anything readable — it came out as
// "Quest:Q Massacre:Beat:Qb Mas Compound" — so it is only ever a fallback.
// Beats carry their quest's title now (quests.js `beatAsEncounter`); this
// keeps the id off the screen if one ever arrives without one.
export function displayName(id) {
  if (!id) return "Encounter";
  const beat = /^quest:([^:]+):beat:(.+)$/.exec(id);
  if (beat) return prettify(beat[2].replace(/^qb_/, ""));
  return prettify(id.replace(/^fe_/, "").replace(/^we_/, ""));
}

function prettify(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function EncounterModal({
  encounter, choices, eligibleIds, redrawsLeft = 0, onRedraw, onPick,
  // Set once the choice has been resolved: the card turns over and shows
  // what came of it (dice, authored outcome text, consequences) instead of
  // vanishing. `onClose` dismisses it from there.
  outcome = null, onClose,
}) {
  // Block Escape — the encounter must be resolved.
  useEscClose(() => {});
  const isPhone = useIsPhone();
  const title = encounter.title || displayName(encounter.id);
  // A beat titled after its quest gets the quest as its eyebrow only when it
  // has a title of its own to be distinct from — otherwise the header would
  // print the same string twice.
  const eyebrow = outcome ? "Outcome"
    : (encounter.questTitle && encounter.questTitle !== title ? encounter.questTitle : "Encounter");

  // A path that 404s falls back to the text-only layout rather than
  // leaving a broken-image box in the frame: authored art gets added over
  // time and a typo'd path shouldn't be the thing the player sees. Keyed
  // on `src` so Recon's discard-and-redraw, which swaps the card in place
  // without remounting, re-tries the next encounter's art.
  const src = encounter.imagePath || encounter.imageUrl || null;
  const [artBroken, setArtBroken] = useState(false);
  useEffect(() => setArtBroken(false), [src]);
  const hasArt = Boolean(src) && !artBroken;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.18 }}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(4,8,8,0.78)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className="hud-scratch"
        style={{
          position: "relative", width: hasArt ? 720 : 520, maxWidth: "94vw", maxHeight: "92vh",
          background: "linear-gradient(158deg, rgba(18,31,32,0.97), rgba(9,17,18,0.98) 58%, rgba(6,11,12,0.99))",
          border: `1px solid ${C.holo}`, borderRadius: 8,
          boxShadow: `inset 0 0 34px rgba(86,211,198,0.07), 0 0 0 1px rgba(86,211,198,0.12), 0 0 36px rgba(86,211,198,0.24), 0 26px 70px rgba(0,0,0,0.72)`,
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 2, background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`, opacity: 0.7, pointerEvents: "none" }} />
        <CornerBrackets />

        {/* Header — title at top, left-aligned */}
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid rgba(86,211,198,0.22)", position: "relative" }}>
          <div style={{
            fontFamily: C.font, fontSize: 10, fontWeight: 600,
            letterSpacing: 3, textTransform: "uppercase",
            color: C.holoHi, opacity: 0.75,
          }}>{eyebrow}</div>
          <div style={{
            fontFamily: C.font, fontSize: 22, fontWeight: 700,
            letterSpacing: 1.4, textTransform: "uppercase",
            color: C.holoHi, textShadow: `0 0 12px ${C.holo}88`,
            marginTop: 3,
          }}>{title}</div>
        </div>

        {/* Body — art beside the text on desktop/iPad; stacked (art on top,
            shrunk down) on phone, where a 220px-wide image plus its gap left
            only ~80px for text and squeezed every line of prose and every
            choice button down to one word per line. With no art the column
            is gone entirely rather than reserved, and the window narrows to
            match so the text isn't left rattling around in a 720px shell. */}
        <div style={{ display: "flex", flexDirection: isPhone ? "column" : "row", gap: hasArt ? (isPhone ? 12 : 18) : 0, padding: isPhone ? "14px 16px 16px" : "18px 24px 18px", flex: 1, minHeight: 0, overflowY: isPhone ? "auto" : "visible" }}>
          {hasArt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.32, ease: "easeOut" }}
              style={isPhone ? { width: "38%", maxWidth: 150, alignSelf: "center", flexShrink: 0 } : { width: 220, flexShrink: 0 }}
            >
              <ImageFrame imageUrl={src} onError={() => setArtBroken(true)} />
            </motion.div>
          )}

          <div className="pc-scroll" style={{
            flex: 1, display: "flex", flexDirection: "column", gap: 14,
            overflowY: isPhone ? "visible" : "auto", minHeight: 0,
          }}>
            {encounter.text && (
              <motion.div
                className="pc-prose"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.28 }}
                style={{
                  fontSize: 13, color: "#d0d7dd", lineHeight: 1.6, whiteSpace: "pre-wrap",
                  // With no art the prose is the only thing above the
                  // choices, so it takes the display frame's job of holding
                  // the left edge: a lit rail reads as a readout the same
                  // way the frame's bezel did.
                  ...(hasArt ? null : {
                    borderLeft: `2px solid ${C.holo}55`,
                    paddingLeft: 14,
                    boxShadow: `-6px 0 14px -8px ${C.holo}66`,
                  }),
                }}
              >
                <RichText>{encounter.text}</RichText>
              </motion.div>
            )}
            {/* The scene text stays above the aftermath rather than being
                replaced by it: read straight down, the card is now scene →
                what you chose → what came of it, which is the shape the
                writing was authored in. Only the buttons are swapped out. */}
            {outcome ? (
              <EncounterOutcome outcome={outcome} onClose={onClose} />
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {choices.map((c, i) => {
                const eligible = eligibleIds.includes(c.id);
                return (
                  <motion.button
                    key={c.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.22 + i * 0.07, duration: 0.26, ease: "easeOut" }}
                    disabled={!eligible}
                    onClick={() => onPick(c.id)}
                    whileHover={eligible ? { x: 2 } : undefined}
                    whileTap={eligible ? { scale: 0.985 } : undefined}
                    className="hud-int"
                    style={{
                      textAlign: "left",
                      background: eligible ? "rgba(86,211,198,0.08)" : "rgba(86,211,198,0.02)",
                      border: `1px solid ${eligible ? "rgba(86,211,198,0.4)" : "rgba(86,211,198,0.16)"}`,
                      borderRadius: 6,
                      padding: "11px 14px",
                      cursor: eligible ? "pointer" : "not-allowed",
                      color: eligible ? "#f4efe2" : "rgba(143,246,234,0.45)",
                      opacity: eligible ? 1 : 0.6,
                      boxShadow: eligible ? "0 0 8px rgba(86,211,198,0.12)" : "none",
                      transition: "background .14s ease, box-shadow .14s ease, border-color .14s ease",
                    }}
                  >
                    <div style={{
                      fontFamily: C.font, fontSize: 13.5, fontWeight: 700,
                      letterSpacing: 0.8, textTransform: "uppercase",
                    }}><RichText>{c.label}</RichText></div>
                    {!eligible && (
                      <div style={{
                        fontFamily: C.font, fontSize: 9, letterSpacing: 1.6,
                        color: "rgba(143,246,234,0.45)", marginTop: 4, textTransform: "uppercase",
                      }}>Not eligible</div>
                    )}
                  </motion.button>
                );
              })}
            </div>
            )}
          </div>
        </div>

        {/* Footer — only the optional Recon redraw; no Cancel any more */}
        {redrawsLeft > 0 && !outcome && (
          <div style={{ padding: "10px 22px 14px", borderTop: "1px solid rgba(86,211,198,0.18)" }}>
            <button
              className="hud-int"
              onClick={onRedraw}
              title="Recon: discard this card and draw the next"
              style={{
                fontFamily: C.font, fontSize: 11, fontWeight: 700,
                letterSpacing: 1.6, textTransform: "uppercase",
                padding: "8px 16px", borderRadius: 6,
                border: `1px solid ${C.holo}99`,
                background: "rgba(86,211,198,0.10)",
                color: C.holoHi, cursor: "pointer",
                boxShadow: `0 0 10px rgba(86,211,198,0.22)`,
              }}
            >
              Discard &amp; Redraw ({redrawsLeft})
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
