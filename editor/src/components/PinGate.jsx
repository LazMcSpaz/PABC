import { useEffect, useState } from "react";

const STORAGE_KEY = "editor-auth";

export function PinGate({ children }) {
  const expected = import.meta.env.VITE_EDITOR_PIN;

  // No PIN configured -> no gate. Useful for local dev.
  const [unlocked, setUnlocked] = useState(() => {
    if (!expected) return true;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (unlocked) return children;
  return <PinScreen expected={expected} onUnlock={() => setUnlocked(true)} />;
}

function PinScreen({ expected, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (shake) {
      const id = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(id);
    }
  }, [shake]);

  const submit = (e) => {
    e.preventDefault();
    if (pin === String(expected)) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // sessionStorage may be unavailable — proceed anyway
      }
      onUnlock();
    } else {
      setError("incorrect pin");
      setShake(true);
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <form
        onSubmit={submit}
        className={`w-80 bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col gap-4 shadow-xl ${
          shake ? "animate-[shake_0.4s]" : ""
        }`}
        style={{
          transform: shake ? "translateX(0)" : undefined,
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="text-amber-400 font-semibold tracking-tight">
            Ashland Conquest
          </div>
          <div className="text-xs text-slate-400">Content Editor</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            pin
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              if (error) setError(null);
            }}
            className="w-full text-lg text-center tracking-[0.4em] bg-slate-900 text-slate-100 caret-amber-400"
          />
        </label>

        {error && <div className="text-xs text-rose-400">{error}</div>}

        <button
          type="submit"
          disabled={!pin}
          className="px-3 py-2 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400 disabled:opacity-50"
        >
          unlock
        </button>
      </form>
    </div>
  );
}
