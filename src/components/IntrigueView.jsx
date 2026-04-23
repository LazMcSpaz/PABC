import { useState } from "react";
import Card from "./Card.jsx";
import IntriguePlayModal from "./IntriguePlayModal.jsx";
import { INTRIGUE_EFFECTS } from "../engine/intrigue.js";

export default function IntrigueView({ state, activePlayer, onInspect, onPlay }) {
  const hand = activePlayer?.intrigueHand ?? [];
  const [playing, setPlaying] = useState(null);

  const isPlayable = (card) => {
    if (card.immediate) return false;
    const entry = INTRIGUE_EFFECTS[card.id];
    if (!entry) return false;
    if (activePlayer.actionsRemaining < 1) return false;
    return true;
  };

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Intrigue Hand (max 3)</h3>
      {hand.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.6 }}>Empty hand</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hand.map((c) => (
            <Card
              key={c.uid}
              card={c}
              onClick={() => onInspect(c)}
              action={
                c.immediate ? (
                  <span style={{ fontSize: 11, opacity: 0.65 }}>Immediate · fires on trigger</span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaying(c);
                    }}
                    disabled={!isPlayable(c)}
                  >
                    Play (1⚡)
                  </button>
                )
              }
            />
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
        {Object.keys(INTRIGUE_EFFECTS).length} active Intrigue effects wired ·
        Immediate / reactive cards are pending an event bus.
      </div>
      {playing ? (
        <IntriguePlayModal
          card={playing}
          state={state}
          activePlayer={activePlayer}
          onCancel={() => setPlaying(null)}
          onConfirm={(opts) => {
            onPlay(playing.uid, opts);
            setPlaying(null);
          }}
        />
      ) : null}
    </section>
  );
}
