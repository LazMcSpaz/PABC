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

// An offer is somebody's job, not a head of state's, so the person who
// brings it talks like a professional doing it.
const OFFER_OPENER = {
  warlord: (n) => `${n} sends terms, and the messenger stands like a man who expects to be refused.`,
  honorable: (n) => `${n} sends an envoy with a formal proposal.`,
  pacifist: (n) => `${n} sends someone eager, with papers already drawn up.`,
  opportunist: (n) => `${n} sends a broker who opens with the numbers.`,
};
const OFFER_CLOSER = {
  warlord: "Take it or don't. We have other business.",
  honorable: "Consider it properly. We will hold the offer open.",
  pacifist: "We would very much like this to work.",
  opportunist: "The terms are good today. They may not be next week.",
};
const ULTIMATUM_OPENER = {
  warlord: (n) => `${n} did not send a diplomat. They sent a deadline.`,
  honorable: (n) => `${n} sends an envoy to state a demand, formally and once.`,
  pacifist: (n) => `${n} sends someone who plainly wishes they had been sent anywhere else.`,
  opportunist: (n) => `${n} sends a broker, and this time there is nothing to negotiate.`,
};

export default function EnvoyModal({ audience, onRespond }) {
  // The envoy's arrival gets a cue. This modal seizes the whole screen, and a
  // player mid-board-scan should hear it land rather than discover it. Keyed
  // on the audience id so a second one queued behind the first announces
  // itself too, while re-renders of the same one stay silent.
  //
  // It sits on the SHARED entry point rather than on the warning face alone,
  // which is where it arrived from main: an offer and a demand seize the
  // screen exactly as hard as a protest does.
  // Called before the early return — a hook may not be conditional.
  useSfxOn(audience?.id ?? audience?.offer?.id ?? audience?.ultimatum?.id ?? null, "envoyArrival");

  if (!audience) return null;
  const kind = audience.kind === "offer" || audience.kind === "ultimatum" ? audience.kind : "warning";
  if (kind === "offer") return <OfferAudience o={audience.offer} onRespond={onRespond} />;
  if (kind === "ultimatum") return <UltimatumAudience u={audience.ultimatum} onRespond={onRespond} />;
  return <WarningAudience warning={audience} onRespond={onRespond} />;
}

// The shell every audience shares: painted face, gradient, name, then prose
// and choices. Kept in one place so a warning, an offer and a demand all
// arrive looking like the same world talking to you.
function Audience({ who, portrait, title, lines, children }) {
  return (
    <div style={overlay}>
      <div style={{
        width: "min(96vw, 760px)", borderRadius: 10, overflow: "hidden",
        border: `1px solid ${C.holo}66`, background: "linear-gradient(180deg, #10201f, #08120f)",
        boxShadow: "0 12px 50px rgba(0,0,0,0.7), 0 0 30px rgba(86,211,198,0.12)",
        color: C.text, fontFamily: C.font,
      }}>
        {portrait && (
          // The paintings are 16:9 with the figure standing in the middle of
          // the room, so a short strip cropped away most of what was painted.
          // Show the frame whole and let it shrink with the viewport instead:
          // `contain` inside a 16:9 box means nothing is ever cut off, and on
          // a short screen the box gives up height rather than the picture
          // giving up its subject.
          <div style={{
            position: "relative", width: "100%", aspectRatio: "16 / 9",
            maxHeight: "52vh", overflow: "hidden", background: "#0b1512",
          }}>
            <img
              src={portrait.src}
              alt=""
              style={{
                width: "100%", height: "100%",
                objectFit: "contain", objectPosition: "50% 0%", display: "block",
              }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(8,18,15,0) 62%, rgba(8,18,15,0.94) 100%)",
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
          <div className="pc-prose" style={{ fontSize: 13, lineHeight: 1.65, color: C.text }}>{lines}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const ghostBtn = { ...btn, color: C.text, border: `1px solid ${C.holo}55`, background: "rgba(0,0,0,0.3)" };
const yesBtn = { ...btn, color: "#08100f", border: "1px solid #5fc27a", background: "linear-gradient(180deg, #7bd496, #4faf6e)" };
const noBtn = { ...btn, color: "#fff", border: "1px solid #6e1f12", background: "linear-gradient(180deg, #d8553f, #a5331f)" };

// Someone has put terms to you. The drawer keeps them too — this is the
// knock at the door, so "consider it" is a real answer.
function OfferAudience({ o, onRespond }) {
  const who = o.fromName;
  const t = o.temperament || "honorable";
  return (
    <Audience
      who={who}
      portrait={portraitFor(o.from, "envoy")}
      title={o.isCounter ? "They Answer With Terms" : "An Offer Is Put To You"}
      lines={(
        <>
          <p style={{ margin: "0 0 10px", color: "#8fd8ce", fontStyle: "italic" }}>
            {(OFFER_OPENER[t] || OFFER_OPENER.honorable)(who)}
          </p>
          {/* Why they came. The engine attaches a reason to every offer an AI
              opens — "Give it back and this ends.", "It would be a shame if
              anything happened." — and the audience box was the one place it
              never reached, so an envoy arrived with terms and no argument.
              The drawer's inbox has always shown it. */}
          {o.note && (
            <p style={{ margin: "0 0 10px", color: "#efe3ae" }}>{o.note}</p>
          )}
          <p style={{ margin: "0 0 10px" }}>
            <b style={{ color: "#efe3ae" }}>You receive:</b> {o.youGet.length ? o.youGet.join(" · ") : "nothing"}
            <br />
            <b style={{ color: "#efe3ae" }}>You give:</b> {o.youGive.length ? o.youGive.join(" · ") : "nothing"}
          </p>
          <p style={{ margin: 0, color: "#efe3ae" }}>“{OFFER_CLOSER[t] || OFFER_CLOSER.honorable}”</p>
        </>
      )}
    >
      <button
        className="hud-int"
        disabled={!o.affordable}
        onClick={o.affordable ? () => onRespond({ kind: "offer", offer: o }, "accept") : undefined}
        style={{ ...yesBtn, opacity: o.affordable ? 1 : 0.45, cursor: o.affordable ? "pointer" : "not-allowed" }}
      >{o.affordable ? "Agreed" : "You cannot cover it"}</button>
      <button className="hud-int" onClick={() => onRespond({ kind: "offer", offer: o }, "later")} style={ghostBtn}>
        Consider it
      </button>
      <button className="hud-int" onClick={() => onRespond({ kind: "offer", offer: o }, "decline")} style={noBtn}>
        Refuse
      </button>
    </Audience>
  );
}

// A demand with a deadline. No "consider it" — letting it stand IS the
// answer, and the modal should not pretend otherwise.
function UltimatumAudience({ u, onRespond }) {
  const who = u.fromName;
  const t = u.temperament || "warlord";
  return (
    <Audience
      who={who}
      portrait={portraitFor(u.from, "envoy")}
      title="A Demand, With A Date On It"
      lines={(
        <>
          <p style={{ margin: "0 0 10px", color: "#8fd8ce", fontStyle: "italic" }}>
            {(ULTIMATUM_OPENER[t] || ULTIMATUM_OPENER.warlord)(who)}
          </p>
          <p style={{ margin: "0 0 10px" }}>
            “We want <b style={{ color: "#efe3ae" }}>{u.demandText}</b>. You have{" "}
            <b style={{ color: "#efe3ae" }}>{u.roundsLeft} round{u.roundsLeft === 1 ? "" : "s"}</b>.”
          </p>
          <p style={{ margin: 0, color: "#ffb4ae" }}>{u.ifDefy}</p>
        </>
      )}
    >
      <button
        className="hud-int"
        disabled={!u.canComply}
        onClick={u.canComply ? () => onRespond({ kind: "ultimatum", ultimatum: u }, "comply") : undefined}
        style={{ ...ghostBtn, opacity: u.canComply ? 1 : 0.45, cursor: u.canComply ? "pointer" : "not-allowed" }}
      >{u.canComply ? "Give in" : (u.kind === "tribute" ? "You cannot cover it" : "Your units are still there")}</button>
      <button className="hud-int" onClick={() => onRespond({ kind: "ultimatum", ultimatum: u }, "defy")} style={noBtn}>
        Let it stand
      </button>
    </Audience>
  );
}

function WarningAudience({ warning, onRespond }) {

  const coalition = warning.kind === "coalition";
  const temperament = warning.temperament || "honorable";
  const who = warning.fromName || "The powers";
  const portrait = warning.from ? portraitFor(warning.from, "envoy") : null;

  const title = coalition ? "Whispers on the Continent" : "An Envoy Arrives";
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
        width: "min(96vw, 760px)", borderRadius: 10, overflow: "hidden",
        border: `1px solid ${C.holo}66`, background: "linear-gradient(180deg, #10201f, #08120f)",
        boxShadow: "0 12px 50px rgba(0,0,0,0.7), 0 0 30px rgba(86,211,198,0.12)",
        color: C.text, fontFamily: C.font,
      }}>
        {portrait && (
          // The paintings are 16:9 with the figure standing in the middle of
          // the room, so a short strip cropped away most of what was painted.
          // Show the frame whole and let it shrink with the viewport instead:
          // `contain` inside a 16:9 box means nothing is ever cut off, and on
          // a short screen the box gives up height rather than the picture
          // giving up its subject.
          <div style={{
            position: "relative", width: "100%", aspectRatio: "16 / 9",
            maxHeight: "52vh", overflow: "hidden", background: "#0b1512",
          }}>
            <img
              src={portrait.src}
              alt=""
              style={{
                width: "100%", height: "100%",
                objectFit: "contain", objectPosition: "50% 0%", display: "block",
              }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(8,18,15,0) 62%, rgba(8,18,15,0.94) 100%)",
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
