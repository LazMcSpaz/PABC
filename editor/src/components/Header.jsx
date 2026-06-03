import { useState } from "react";
import { ContentPicker } from "./ContentPicker.jsx";
import { DiagnosticsModal } from "./DiagnosticsModal.jsx";

export function Header({
  index,
  current,
  onSelect,
  onNew,
  onImport,
  onDelete,
  onSave,
  onSync,
  saving,
  dirty,
  supabaseConfigured,
  message,
  syncState,
}) {
  const [diagOpen, setDiagOpen] = useState(false);
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 py-3 flex flex-wrap items-center gap-2 sticky top-0 z-10">
      <div className="flex items-center gap-2 mr-auto sm:mr-0">
        <span className="text-amber-400 font-semibold tracking-tight">
          Ashland
        </span>
        <span className="text-slate-500 hidden sm:inline">·</span>
        <span className="text-slate-300 text-sm hidden sm:inline">Content Editor</span>
        <button
          type="button"
          onClick={() => setDiagOpen(true)}
          title="Database diagnostics — shows the Supabase host and per-table row counts"
          className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
        >
          db?
        </button>
      </div>
      <DiagnosticsModal open={diagOpen} onClose={() => setDiagOpen(false)} />

      <div className="sm:ml-4 w-full sm:w-72 order-3 sm:order-2">
        <ContentPicker index={index} current={current} onSelect={onSelect} />
      </div>

      <div className="order-4 sm:order-3 ml-0 sm:ml-2 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          className="px-2 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={() => onNew("quest")}
        >
          + quest
        </button>
        <button
          type="button"
          className="px-2 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={() => onNew("world")}
        >
          + world
        </button>
        <button
          type="button"
          className="px-2 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={() => onNew("field")}
        >
          + field
        </button>
        <button
          type="button"
          className="px-2 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={() => onNew("wiki")}
        >
          + wiki
        </button>
        <button
          type="button"
          className="px-2 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          onClick={onImport}
          title="Import JSON content"
        >
          import…
        </button>
      </div>

      <div className="order-2 sm:order-4 ml-auto flex items-center gap-2 flex-wrap">
        {!supabaseConfigured && (
          <span className="text-xs text-rose-400">supabase not configured</span>
        )}
        <SyncIndicator state={syncState} onSync={onSync} />
        {message && (
          <span
            className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-400"}`}
          >
            {message.text}
          </span>
        )}
        {current && (
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 text-xs rounded bg-rose-900/60 hover:bg-rose-800 border border-rose-800 text-rose-100"
          >
            delete
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!current || saving}
          className="px-3 py-1 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400 disabled:opacity-50"
        >
          {saving ? "saving…" : dirty ? "save" : "saved"}
        </button>
      </div>
    </header>
  );
}

function SyncIndicator({ state, onSync }) {
  if (!state || !state.configured) {
    return (
      <span
        className="text-xs text-slate-500"
        title="Set VITE_GITHUB_TOKEN and VITE_GITHUB_REPO to enable auto-export"
      >
        no sync
      </span>
    );
  }
  const tone = {
    idle: "text-slate-400",
    syncing: "text-amber-300",
    ok: "text-emerald-400",
    error: "text-rose-400",
  }[state.status] ?? "text-slate-400";
  const label = {
    idle: state.lastCommit ? "synced" : "not synced yet",
    syncing: "syncing…",
    ok: "synced",
    error: "sync failed",
  }[state.status] ?? state.status;
  const title = [
    `branch: ${state.branch}`,
    state.lastCommit ? `last commit: ${state.lastCommit.slice(0, 7)}` : null,
    state.error ?? null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onSync}
      title={title}
      disabled={state.status === "syncing"}
      className={`text-xs px-2 py-1 rounded border border-slate-800 hover:bg-slate-800 ${tone}`}
    >
      {label} ↻
    </button>
  );
}
