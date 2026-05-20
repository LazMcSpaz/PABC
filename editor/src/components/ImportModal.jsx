import { useState } from "react";
import {
  IMPORT_TABLES,
  parseImport,
  prepareRows,
  detectConflicts,
  applyImport,
} from "../lib/import.js";

const STAGES = {
  PASTE: "paste",
  PREVIEW: "preview",
  DONE: "done",
};

export function ImportModal({ open, onClose, onImported }) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState(STAGES.PASTE);
  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState([]);
  const [conflicts, setConflicts] = useState({});
  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState(null);
  const [parseError, setParseError] = useState(null);

  if (!open) return null;

  const reset = () => {
    setText("");
    setStage(STAGES.PASTE);
    setRows(null);
    setErrors([]);
    setConflicts({});
    setSummary(null);
    setParseError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file) => {
    if (!file) return;
    const body = await file.text();
    setText(body);
  };

  const handlePreview = async () => {
    setParseError(null);
    const parsed = parseImport(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    const { rows: prepped, errors: prepErrors } = prepareRows(parsed.groups);
    setRows(prepped);
    setErrors(prepErrors);
    setWorking(true);
    try {
      const c = await detectConflicts(prepped);
      setConflicts(c);
      setStage(STAGES.PREVIEW);
    } catch (e) {
      setParseError(`conflict check failed: ${e.message}`);
    } finally {
      setWorking(false);
    }
  };

  const handleApply = async () => {
    setWorking(true);
    try {
      const s = await applyImport(rows);
      setSummary(s);
      setStage(STAGES.DONE);
      onImported?.();
    } catch (e) {
      setParseError(`import failed: ${e.message}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-20 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center">
          <h2 className="text-sm font-semibold text-slate-200">
            Import content
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto text-slate-400 hover:text-slate-200 text-sm"
          >
            close
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          {stage === STAGES.PASTE && (
            <PasteStage
              text={text}
              onTextChange={setText}
              onFile={handleFile}
              parseError={parseError}
            />
          )}

          {stage === STAGES.PREVIEW && (
            <PreviewStage
              rows={rows}
              conflicts={conflicts}
              errors={errors}
              parseError={parseError}
            />
          )}

          {stage === STAGES.DONE && <DoneStage summary={summary} />}
        </div>

        <footer className="px-4 py-3 border-t border-slate-800 flex items-center gap-2">
          <span className="text-xs text-slate-500">
            existing rows with matching ids will be <strong>overwritten</strong>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {stage === STAGES.PASTE && (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-1 text-sm rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  cancel
                </button>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!text || working}
                  className="px-3 py-1 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400 disabled:opacity-50"
                >
                  {working ? "checking…" : "preview"}
                </button>
              </>
            )}
            {stage === STAGES.PREVIEW && (
              <>
                <button
                  type="button"
                  onClick={() => setStage(STAGES.PASTE)}
                  className="px-3 py-1 text-sm rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  back
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={working || (errors.length > 0 && !rowsHaveAny(rows))}
                  className="px-3 py-1 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400 disabled:opacity-50"
                >
                  {working ? "importing…" : `import ${totalRows(rows)} rows`}
                </button>
              </>
            )}
            {stage === STAGES.DONE && (
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1 text-sm rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border border-amber-400"
              >
                done
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PasteStage({ text, onTextChange, onFile, parseError }) {
  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  };

  return (
    <>
      <div className="text-xs text-slate-400 leading-relaxed">
        Paste a JSON document with any of these top-level keys:{" "}
        <code className="text-slate-300">
          {IMPORT_TABLES.join(", ")}
        </code>
        . Each value is an array of full row objects whose keys match the
        DB column names (camelCase, exactly as in{" "}
        <code className="text-slate-300">docs/content-schema-v0.1.md §1</code>
        ).
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-slate-700 rounded p-3 text-xs text-slate-400"
      >
        Drop a <code>.json</code> file here, or
        <label className="ml-1 underline cursor-pointer text-slate-200">
          choose a file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        .
      </div>

      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={14}
        placeholder='{"field_encounters": [ ... ], "choices": [ ... ], "effects": [ ... ]}'
        className="w-full font-mono text-xs"
      />

      {parseError && (
        <div className="text-xs text-rose-400 whitespace-pre-wrap">
          {parseError}
        </div>
      )}
    </>
  );
}

function PreviewStage({ rows, conflicts, errors, parseError }) {
  return (
    <>
      <div className="text-xs text-slate-400">
        Review the row counts. Existing rows with matching ids will be
        overwritten on import.
      </div>

      <table className="text-sm w-full">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="text-left py-1">Table</th>
            <th className="text-right py-1">Total</th>
            <th className="text-right py-1">Overwrite</th>
            <th className="text-right py-1">New</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {IMPORT_TABLES.map((t) => {
            const n = rows?.[t]?.length ?? 0;
            const overwrite = conflicts?.[t] ?? 0;
            if (n === 0 && overwrite === 0) return null;
            return (
              <tr key={t} className="border-b border-slate-900">
                <td className="py-1">
                  <code>{t}</code>
                </td>
                <td className="py-1 text-right">{n}</td>
                <td className={`py-1 text-right ${overwrite > 0 ? "text-amber-300" : ""}`}>
                  {overwrite}
                </td>
                <td className="py-1 text-right text-emerald-300">{n - overwrite}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {errors.length > 0 && (
        <div className="rounded bg-rose-950/60 border border-rose-900 text-rose-200 text-xs p-3">
          <div className="font-semibold mb-1">
            {errors.length} validation error{errors.length === 1 ? "" : "s"} — these rows were skipped:
          </div>
          <ul className="list-disc list-inside space-y-0.5 max-h-40 overflow-auto">
            {errors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 50 && <li>… {errors.length - 50} more</li>}
          </ul>
        </div>
      )}

      {parseError && (
        <div className="text-xs text-rose-400 whitespace-pre-wrap">
          {parseError}
        </div>
      )}
    </>
  );
}

function DoneStage({ summary }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-emerald-400 font-semibold">
        Import complete.
      </div>
      <ul className="text-xs text-slate-300 list-disc list-inside">
        {Object.entries(summary ?? {}).map(([t, n]) => (
          <li key={t}>
            <code>{t}</code>: {n} row{n === 1 ? "" : "s"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function totalRows(rows) {
  if (!rows) return 0;
  return Object.values(rows).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
}

function rowsHaveAny(rows) {
  return totalRows(rows) > 0;
}
