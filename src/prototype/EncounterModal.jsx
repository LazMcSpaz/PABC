// Modal that pops when a Move would land on a field-encounter hex.
// The engine asks for the choice via ctx.interact synchronously; we
// satisfy that by pre-collecting the answer here, then calling
// performAction with the picked id baked into ctx.interact.
import { theme } from "./data.js";
import { Btn } from "./kit.jsx";

export default function EncounterModal({ encounter, choices, eligibleIds, onPick, onCancel }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: "94vw",
          maxHeight: "90vh",
          background: theme.plate,
          border: `1px solid ${theme.borderLit}`,
          borderRadius: 10,
          boxShadow: theme.shadowDeep,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(0,0,0,0.3)",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: theme.textFaint,
              fontWeight: 600,
            }}
          >
            Encounter
          </div>
          <div
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 19,
              fontWeight: 700,
              color: theme.text,
              marginTop: 2,
            }}
          >
            {encounter.title || encounter.id}
          </div>
        </div>
        <div
          className="pc-scroll"
          style={{
            padding: 16,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {encounter.text && (
            <div
              className="pc-prose"
              style={{
                fontSize: 12.5,
                color: theme.textDim,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {encounter.text}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {choices.map((c) => {
              const eligible = eligibleIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  className="pc-int"
                  disabled={!eligible}
                  onClick={() => onPick(c.id)}
                  style={{
                    textAlign: "left",
                    background: eligible ? theme.panel2 : "rgba(0,0,0,0.2)",
                    border: `1px solid ${eligible ? theme.borderLit : theme.border}`,
                    borderRadius: 7,
                    padding: "10px 12px",
                    cursor: eligible ? "pointer" : "not-allowed",
                    color: eligible ? theme.text : theme.textFaint,
                    opacity: eligible ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      fontFamily: theme.fontDisplay,
                      fontSize: 13.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                    }}
                  >
                    {c.label}
                  </div>
                  {c.outcomeText && (
                    <div
                      style={{
                        fontSize: 11,
                        color: theme.textDim,
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {c.outcomeText}
                    </div>
                  )}
                  {!eligible && (
                    <div
                      style={{
                        fontSize: 9.5,
                        color: theme.textFaint,
                        marginTop: 4,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                      }}
                    >
                      Not eligible
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div
          style={{
            padding: "10px 16px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            borderTop: `1px solid ${theme.border}`,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <Btn variant="ghost" onClick={onCancel}>
            Cancel move
          </Btn>
        </div>
      </div>
    </div>
  );
}
