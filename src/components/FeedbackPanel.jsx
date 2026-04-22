import { useEffect, useState } from "react";

const STORAGE_KEY = "ashland_feedback";

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function FeedbackPanel({ state }) {
  const [entries, setEntries] = useState([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  const save = () => {
    if (!note.trim()) return;
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      round: state?.round ?? 0,
      gameState: {
        playerVPs: state?.players?.map((p) => p.earnedVP ?? 0) ?? [],
        age: state?.age ?? 1,
        progressionResolved: state?.progressionResolved ?? [],
      },
      note: note.trim(),
    };
    const next = [...entries, entry];
    setEntries(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setNote("");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedback-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h3 style={{ margin: "0 0 0.5rem" }}>Feedback ({entries.length})</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        style={{ width: "100%" }}
        placeholder="Balance note, surprising moment, observed issue..."
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button onClick={save}>Save note</button>
        <button onClick={exportJson} disabled={entries.length === 0}>
          Export JSON
        </button>
      </div>
    </section>
  );
}
