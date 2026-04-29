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

  const exportGameLog = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      round: state?.round ?? 0,
      age: state?.age ?? 1,
      players: (state?.players ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        personalityId: p.personalityId ?? null,
      })),
      progressionResolved: state?.progressionResolved ?? [],
      log: state?.log ?? [],
      aiLog: state?.aiLog ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `gamelog-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logCount = state?.log?.length ?? 0;

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
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <button onClick={save}>Save note</button>
        <button onClick={exportJson} disabled={entries.length === 0}>
          Export Notes
        </button>
        <button onClick={exportGameLog} disabled={logCount === 0}>
          Export Game Log ({logCount})
        </button>
      </div>
    </section>
  );
}
