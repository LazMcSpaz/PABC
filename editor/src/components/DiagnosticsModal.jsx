// Quick diagnostic overlay. Shows which Supabase project the editor is
// connecting to + the raw row count returned for each content table. Use
// this when the navigator says zero rows but you know the DB has data —
// it confirms whether the bundle is pointed at the right project, and
// whether RLS is blocking reads.

import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase.js";

const TABLES = [
  "world_encounters",
  "field_encounters",
  "quests",
  "quest_beats",
  "choices",
  "effects",
  "wiki_entries",
];

export function DiagnosticsModal({ open, onClose }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!supabaseConfigured) {
      setResults({ ok: false, error: "Supabase not configured." });
      return;
    }
    setRunning(true);
    (async () => {
      const out = {};
      for (const t of TABLES) {
        try {
          const { count, error } = await supabase
            .from(t)
            .select("*", { count: "exact", head: true });
          out[t] = { count: count ?? 0, error: error?.message ?? null };
        } catch (e) {
          out[t] = { count: 0, error: String(e?.message ?? e) };
        }
      }
      setResults(out);
      setRunning(false);
    })();
  }, [open]);

  if (!open) return null;

  // Strip the key out of the URL display — only show host + path.
  let host = "(unset)";
  try {
    if (import.meta.env.VITE_SUPABASE_URL) {
      host = new URL(import.meta.env.VITE_SUPABASE_URL).host;
    }
  } catch {}

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  const keyTail = anonKey ? `…${anonKey.slice(-8)}` : "(unset)";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 sm:rounded-lg w-full sm:max-w-lg flex flex-col"
        style={{ maxHeight: "92vh" }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <span className="text-amber-400 font-semibold">DB diagnostics</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-3 py-2 text-sm rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
          >
            close
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-3 text-sm text-slate-200">
          <section>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
              Connected to
            </div>
            <div className="font-mono text-xs break-all bg-slate-950/60 border border-slate-800 rounded p-2">
              <div><span className="text-slate-500">host:</span> {host}</div>
              <div><span className="text-slate-500">anon key:</span> {keyTail}</div>
            </div>
            <div className="text-xs text-slate-500 mt-2 leading-relaxed">
              If this host doesn't match the Supabase project you put your data
              in, the Netlify env vars are pointed at a different project.
              Update <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> in Netlify → Site settings →
              Environment variables, then redeploy.
            </div>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
              Row counts (via <code>count: 'exact', head: true</code>)
            </div>
            {running && <div className="text-xs text-slate-400">querying…</div>}
            {results && results.error && (
              <div className="text-xs text-rose-300">{results.error}</div>
            )}
            {results && !results.error && (
              <div className="font-mono text-xs bg-slate-950/60 border border-slate-800 rounded p-2 flex flex-col gap-0.5">
                {TABLES.map((t) => {
                  const r = results[t];
                  return (
                    <div key={t} className="flex items-center justify-between">
                      <span className="text-slate-400">{t}</span>
                      <span className={r.error ? "text-rose-300" : "text-slate-100"}>
                        {r.error ? `error: ${r.error}` : r.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2 leading-relaxed">
              Non-zero counts here while the navigator shows zero would mean a
              client-side bug. Zero counts here mean the rows aren't visible to
              the anon role — usually an RLS policy issue, or wrong project.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
