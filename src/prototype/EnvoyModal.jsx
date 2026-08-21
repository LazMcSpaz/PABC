// Envoy audience — the Civ-style dialogue box an AI opens when its regard
// for the player sinks toward war, or when the board starts murmuring
// about a coalition. A warning you can only read is just noise; this one
// takes an answer, so the player can actually maneuver out of the threat:
// hear them out, buy goodwill, or tell them where to put it.
import React from "react";
import { useSfxOn } from "../audio/AudioProvider.jsx";
import { C } from "./HudChrome.jsx";
import { portraitFor } from "./factionPortraits.js";

// What the envoy actually says. Keyed by temperament (how they say it)
// and grievance (what they say it about) so the flavor tracks the state
// of the world rather than repeating one line.
const OPENER = {
  warlord: (n) => `${n} did not send a diplomat. They sent a soldier.`,
  honorable: (n) => `${n} sends an envoy with a formal protest.`,
  pacifist: (n) => `${n} sends word, and the messenger looks frightened.`,
  opportunist: (n) => `${n} sends a broker, all smiles and arithmetic.`,
};
const GRIEVANCE = {
  menace: "Your armies have made a name for themselves, and it is not a good one. Every road you walk, someone counts the dead behind you.",
  honor: "You have given your word before. We have watched what it was worth. Understand that we now price your promises accordingly.",
  trespass: "Your troops stand on our ground. We have asked once. We are not in the habit of asking twice.",
  betrayal: "We remember what you did. Time has not softened it, and our patience is not endless.",
  standing: "Relations between us have soured badly. We would rather say this now than say it with rifles.",
};
const CLOSER = {
  warlord: "Change course, or we will change it for you.",
  honorable: "Correct this, and we will consider the matter closed.",
  pacifist: "Please. Give us a reason to keep our guns in the rack.",
  opportunist: "Everything is negotiable. For now.",
};

const overlay = {
  position: "fixed", inset: 0, zIndex: 320,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(4, 10, 12, 0.78)", padding: 16,
};
const btn = {
  fontFamily: C.font, fontSize: 11.5, fontWeight: 700, letterSpacing: 1,
  textTransform: "uppercase", padding: "9px 14px", borderRadius: 6,
  cursor: "pointer", flex: 1,
};

export default function EnvoyModal({ warning, onRespond }) {
  // The envoy's arrival gets a cue. This modal seizes the whole screen, and a
  // player mid-board-scan should hear it land rather than discover it. Keyed
  // on the warning id, so a second warning queued behind the first announces
  // itself too while re-renders and remounts of the same one stay silent.
  // Called before the early return — a hook may not be conditional.
  useSfxOn(warning?.id ?? null, "diplomacyAlert");

  if (!warning) return null;
  const coalition = warning.kind === "coalition";
  const temperament = warning.temperament || "honorable";
  const who = warning.fromName || "The powers";
  const portrait = warning.from ? portraitFor(warning.from) : null;

  const title = coalition ? "Whispers in the Ashlands" : "An Envoy Arrives";
  const opener = coalition
    ? "Word travels. Riders have been seen between the other capitals, and your name is in every conversation."
    : (OPENER[temperament] || OPENER.honorable)(who);
  const body = coalition
    ? "They are measuring your rise against their own. If this continues, they will stop measuring and start marching — together."
    : GRIEVANCE[warning.reason] || GRIEVANCE.standing;
  const closer = coalition
    ? "There is still time to look smaller than you are."
    : (CLOSER[temperament] || CLOSER.honorable);

  return (
    <div style={overlay}>
      <div style={{
        width: "min(96vw, 620px)", borderRadius: 10, overflow: "hidden",
        border: `1px solid ${C.holo}66`, background: "linear-gradient(180deg, #10201f, #08120f)",
        boxShadow: "0 12px 50px rgba(0,0,0,0.7), 0 0 30px rgba(86,211,198,0.12)",
        color: C.text, fontFamily: C.font,
      }}>
        {portrait && (
          <div style={{ position: "relative", height: 190, overflow: "hidden" }}>
            <img
              src={portrait.src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: portrait.pos, display: "block" }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(8,18,15,0) 45%, rgba(8,18,15,0.96) 100%)",
            }} />
            <div style={{
              position: "absolute", left: 18, bottom: 10,
              fontSize: 17, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
              color: "#f4efe2", textShadow: "0 2px 10px rgba(0,0,0,0.9)",
            }}>{who}</div>
          </div>
        )}

        <div style={{ padding: 18 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 2.4, textTransform: "uppercase",
            color: "#c9b24e", marginBottom: 10,
          }}>{title}</div>

          <div className="pc-prose" style={{ fontSize: 13, lineHeight: 1.65, color: C.text }}>
            <p style={{ margin: "0 0 10px", color: "#8fd8ce", fontStyle: "italic" }}>{opener}</p>
            <p style={{ margin: "0 0 10px" }}>“{body}”</p>
            <p style={{ margin: 0, color: "#efe3ae" }}>“{closer}”</p>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button
              className="hud-int"
              onClick={() => onRespond(warning, "hear")}
              style={{ ...btn, color: C.text, border: `1px solid ${C.holo}55`, background: "rgba(0,0,0,0.3)" }}
            >Hear them out</button>
            {!coalition && (
              <>
                <button
                  className="hud-int"
                  disabled={!warning.canPlacate}
                  onClick={warning.canPlacate ? () => onRespond(warning, "placate") : undefined}
                  title={warning.canPlacate ? undefined : `Needs ${warning.placateScrap} scrap`}
                  style={{
                    ...btn, color: "#08100f",
                    border: "1px solid #5fc27a",
                    background: "linear-gradient(180deg, #7bd496, #4faf6e)",
                    opacity: warning.canPlacate ? 1 : 0.45,
                    cursor: warning.canPlacate ? "pointer" : "not-allowed",
                  }}
                >Send {warning.placateScrap} scrap</button>
                <button
                  className="hud-int"
                  onClick={() => onRespond(warning, "defy")}
                  title={`−${warning.defyStandingHit} Standing with ${who}`}
                  style={{
                    ...btn, color: "#fff", border: "1px solid #6e1f12",
                    background: "linear-gradient(180deg, #d8553f, #a5331f)",
                  }}
                >Defy them</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
