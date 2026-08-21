// The Rainmaker, from the player's side.
//
// This is the only place a human can actually PLAY the line, so every beat that
// asks the player for a decision has to have its button here — commit to the
// myth, pull the device out early, buy or take the engineer, throw the switch,
// and pick up (or destroy) a device lying in the open. Without it the third way
// to win would be something only the AI could do.
//
// What it deliberately does NOT show: anything the adapter withheld. The site's
// position before it is found, a convoy the viewer has no sight of, a backup
// engineer that does not exist yet. The panel draws what it is handed, so the
// information design lives in one place rather than in every component that
// happens to render some of it.
import { theme as T, FACTIONS as UI_FACTIONS } from "./data.js";

const STAGE_NAMES = [
  "The myth",
  "The research",
  "The region",
  "The search",
  "The site",
  "The haul",
  "The installation",
  "The engineer",
  "The rain",
];

// What the player is actually being asked to do at each beat, in a line.
const STAGE_BLURB = [
  "Word of a machine that made rain. Put people on it, or don't — you can pick the story back up any time.",
  "Understanding it means building a laboratory. Build one, or take one off somebody who did.",
  "Somewhere on this landmass. That is genuinely all the research gives you.",
  "Walk the ground. Every unit you have out there narrows it, and standing on the right hex finds it outright.",
  "Three turns holding the hex while the whole board watches you do it.",
  "One hex a turn, all the way home. Nothing makes a convoy faster.",
  "Four turns of fitting — and it does not start until there is a lab in this capital.",
  "One engineer can finish it. Buy them, or take them.",
  "Throw the switch and hold what happens next.",
];

function Row({ label, value, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, lineHeight: 1.7 }}>
      <span style={{ color: T.textDim }}>{label}</span>
      <span style={{ color: tone || T.text, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Btn({ onClick, disabled, reason, children, danger }) {
  return (
    <button
      className="hud-int"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={reason || undefined}
      style={{
        fontFamily: T.fontDisplay, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase",
        fontWeight: 700, padding: "8px 14px", borderRadius: 6,
        border: `1px solid ${danger ? T.accent2 : T.accent}`,
        background: "transparent",
        color: danger ? T.accent2 : T.accent,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function name(fid) {
  return UI_FACTIONS[fid]?.short || fid || "—";
}

export default function RainmakerPanel({ rm, you, onAct, standingOnDevice }) {
  if (!rm) return null;
  if (!rm.open) {
    return (
      <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: T.textDim }}>
        Nothing but rumour so far. Rain is a story people out here tell each
        other; if there is anything behind this one, word of it has not reached
        you yet.
      </p>
    );
  }
  if (rm.destroyed) {
    return (
      <p className="pc-prose" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: T.accent2 }}>
        {rm.destroyedBy ? `${name(rm.destroyedBy)} destroyed it.` : "It is destroyed."} There
        was one, and there is not another. Nobody wins this way now — not them,
        not you, not anyone.
      </p>
    );
  }

  const mine = rm.you;
  const stage = mine?.stage ?? 0;
  const hunting = !!mine?.hunting;
  const holder = rm.device?.owner || null;
  const sp = rm.specialist || {};
  const hold = rm.hold;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* The clock first when there is one. Somebody about to win is the only
          thing on this screen that cannot wait. */}
      {hold && (
        <div style={{
          border: `1px solid ${hold.by === you ? T.accent : T.accent2}`,
          borderRadius: 8, padding: "10px 12px",
          background: "rgba(0,0,0,0.25)",
        }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 13, letterSpacing: 1, color: hold.by === you ? T.accent : T.accent2 }}>
            {hold.by === you
              ? `It is raining. ${hold.roundsLeft} round${hold.roundsLeft === 1 ? "" : "s"} and the Ashlands are yours.`
              : `${name(hold.by)} switched it on. ${hold.roundsLeft} round${hold.roundsLeft === 1 ? "" : "s"} to take it off them.`}
          </div>
          {!!hold.besiegers?.length && (
            <div style={{ marginTop: 6, fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
              {/* Symmetrical on purpose: the holder sees what is coming, and
                  everyone coming sees they are not alone. */}
              Committed against them: {hold.besiegers.map((b) => `${name(b.fid)} (${b.weight})`).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Your own line. */}
      <div>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 14, letterSpacing: 0.6, color: T.text, marginBottom: 2 }}>
          {hunting ? "The hunt" : `${stage}. ${STAGE_NAMES[stage] || "—"}`}
        </div>
        <p className="pc-prose" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6, color: T.textDim }}>
          {hunting
            ? "Your line ended when somebody reached the machine. There is one of these, and it is not yours — so you are not looking for it any more. You are going to take it."
            : STAGE_BLURB[stage] || ""}
        </p>

        {!mine && (
          <Btn onClick={() => onAct("join")}>Put people on it</Btn>
        )}

        {mine && !hunting && stage === 3 && !rm.foundBy && (
          <Row label="Narrowed down to" value={`${mine.candidates?.length ?? "—"} hexes`} />
        )}
        {mine && stage === 4 && (
          <Row label="Days on site" value={`${mine.siteTurns} of ${mine.siteTurnsNeeded}`} />
        )}
        {mine && stage === 6 && (
          <>
            <Row label="Fitting" value={`${mine.installTurns} of ${mine.installTurnsNeeded}`} />
            {mine.installBlocker && (
              <Row label="Held up by" value={mine.installBlocker} tone={T.accent2} />
            )}
          </>
        )}
        {mine && (
          <div style={{ marginTop: 8 }}>
            <Row label="Kept whatever happens" value={
              [mine.retained.lab && "lab", mine.retained.sight && "survey data",
                mine.retained.vehicle && "salvaged vehicle"].filter(Boolean).join(", ") || "nothing yet"
            } />
          </div>
        )}
      </div>

      {/* The decisions. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {mine && stage === 4 && mine.siteTurns >= 1 && (
          <Btn onClick={() => onAct("extractEarly")}>
            Tear it loose now
          </Btn>
        )}
        {mine && (stage === 7 || (sp.engaged && sp.heldBy !== you)) && (
          <>
            <Btn onClick={() => onAct("hire")} disabled={sp.availableFrom > (rm.round ?? 0) && false}>
              {sp.heldBy && sp.heldBy !== you ? `Outbid ${name(sp.heldBy)} (${sp.cost})` : `Hire them (${sp.cost})`}
            </Btn>
            <Btn onClick={() => onAct("seize")}>Take them</Btn>
          </>
        )}
        {mine && stage === 8 && !hold && (
          <Btn onClick={() => onAct("activate")}>Throw the switch</Btn>
        )}
        {standingOnDevice && (
          <>
            <Btn onClick={() => onAct("takeDevice")}>Pick it up</Btn>
            {/* The pressure valve. It ends the line for EVERY faction and there
                is no second one, so it is deliberately the loudest button here
                and it asks before it fires. */}
            <Btn danger onClick={() => onAct("destroyDevice")}>Destroy it</Btn>
          </>
        )}
      </div>

      {/* Everyone else, at the resolution everyone else gets: a stage, and
          nothing about their garrison, their route or what is left of them. */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <div style={{
          fontFamily: T.fontDisplay, fontSize: 10, letterSpacing: 2,
          textTransform: "uppercase", color: T.textFaint, marginBottom: 6,
        }}>
          Who else is in it
        </div>
        {rm.holders.filter((h) => !h.you).length === 0 && (
          <span style={{ fontSize: 12.5, color: T.textDim }}>Nobody else has put anyone on it.</span>
        )}
        {rm.holders.filter((h) => !h.you).map((h) => (
          <Row
            key={h.fid}
            label={name(h.fid)}
            value={h.hunting ? "hunting it" : `${STAGE_NAMES[h.stage] || h.stage}`}
            tone={h.fid === holder ? T.accent : undefined}
          />
        ))}
        {sp.engaged && (
          <div style={{ marginTop: 8 }}>
            <Row
              label="The engineer"
              value={sp.heldBy ? (sp.heldBy === you ? "yours" : `with ${name(sp.heldBy)}`) : "unhired"}
            />
            {/* Only ever rendered once a second name exists at all. */}
            {sp.onBackup && (
              <Row label="Word of another" value="harder to reach, and dearer" tone={T.accent2} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
