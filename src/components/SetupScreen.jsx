import { useState } from "react";
import { AI_PERSONALITIES } from "../engine/ai.js";

const shellStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  color: "#f5f5f5",
  background: "#1a1a1a",
  fontFamily: "system-ui, sans-serif",
};

export default function SetupScreen({ onStart }) {
  const [playerName, setPlayerName] = useState("Player");
  const [opponentIds, setOpponentIds] = useState(
    AI_PERSONALITIES.slice(0, 2).map((p) => p.id),
  );

  const start = () => {
    onStart({
      players: [
        { name: playerName, kind: "human" },
        ...opponentIds.map((id) => ({
          name: AI_PERSONALITIES.find((p) => p.id === id)?.name ?? id,
          kind: "ai",
          personalityId: id,
        })),
      ],
    });
  };

  return (
    <div style={shellStyle}>
      <h1>Ashland Conquest</h1>
      <p style={{ opacity: 0.7 }}>Prototype v0.1 — AI Playtest Build</p>
      <label style={{ margin: "1rem 0" }}>
        Your name:{" "}
        <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
      </label>
      <div style={{ opacity: 0.7, fontSize: 14 }}>
        AI opponents: {opponentIds.join(", ") || "(none)"}
      </div>
      <button onClick={start} style={{ marginTop: "1.5rem", padding: "0.75rem 1.5rem" }}>
        Start Game
      </button>
    </div>
  );
}
