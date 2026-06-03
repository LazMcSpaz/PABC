import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header.jsx";
import { WorldEncounterEditor } from "./components/WorldEncounterEditor.jsx";
import { FieldEncounterEditor } from "./components/FieldEncounterEditor.jsx";
import { QuestEditor } from "./components/QuestEditor.jsx";
import { WikiEntryEditor } from "./components/WikiEntryEditor.jsx";
import { ImportModal } from "./components/ImportModal.jsx";
import {
  listAll,
  loadQuest, saveQuest, deleteQuest,
  loadWikiEntry, saveWikiEntry, deleteWikiEntry,
} from "./lib/api.js";
import {
  loadStory,
  saveStory,
  deleteStory,
} from "./lib/story.js";
import { supabaseConfigured } from "./lib/supabase.js";
import {
  validateWorldEncounter,
  validateFieldEncounter,
  validateQuest,
  validateWikiEntry,
} from "./lib/validation.js";
import { newId } from "./lib/id.js";
import {
  pushContentSnapshot,
  githubConfigured,
  githubSettings,
} from "./lib/sync.js";

export default function App() {
  const [index, setIndex] = useState({
    worldEncounters: [],
    fieldEncounters: [],
    quests: [],
  });
  const [current, setCurrent] = useState(null); // { kind, id, key }
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [syncState, setSyncState] = useState(() => ({
    configured: githubConfigured(),
    status: "idle",
    branch: githubConfigured() ? githubSettings().branch : null,
    lastCommit: null,
    error: null,
  }));

  const runSync = async (reason) => {
    if (!githubConfigured()) return;
    setSyncState((s) => ({ ...s, status: "syncing", error: null }));
    try {
      const result = await pushContentSnapshot({ reason });
      setSyncState((s) => ({
        ...s,
        status: "ok",
        lastCommit: result.commitSha,
        branch: result.branch,
        error: null,
      }));
      setMessage({
        tone: "ok",
        text: `synced to ${result.branch} @ ${result.commitSha.slice(0, 7)}${result.created ? " (branch created)" : ""}`,
      });
    } catch (e) {
      setSyncState((s) => ({ ...s, status: "error", error: e.message }));
      setMessage({ tone: "error", text: `sync failed: ${e.message}` });
    }
  };

  const refreshIndex = async () => {
    if (!supabaseConfigured) return;
    try {
      const idx = await listAll();
      setIndex(idx);
    } catch (e) {
      setMessage({ tone: "error", text: `index load failed: ${e.message}` });
    }
  };

  useEffect(() => {
    refreshIndex();
  }, []);

  useEffect(() => {
    if (!current) {
      setDraft(null);
      setDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadForKind(current.kind, current.id);
        if (cancelled) return;
        setDraft(loaded);
        setDirty(false);
        setValidationErrors([]);
        setMessage(null);
      } catch (e) {
        if (cancelled) return;
        setMessage({ tone: "error", text: `load failed: ${e.message}` });
        setDraft(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.key]);

  const context = useMemo(
    () => ({
      worldEncounterIds: new Set((index.worldEncounters ?? []).map((e) => e.id)),
      quests: index.quests ?? [],
      currentBeatIds:
        current?.kind === "quest"
          ? new Set((draft?.beats ?? []).map((b) => b.id))
          : new Set(),
    }),
    [index, draft, current],
  );

  const updateDraft = (next) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
    setValidationErrors([]);
  };

  const handleNew = async (kind) => {
    const id = prompt(`New ${kind} id?`, `${kind}-${newId("").slice(1)}`);
    if (!id) return;
    if (await idExists(kind, id)) {
      alert(`A ${kind} with id '${id}' already exists.`);
      return;
    }
    const blank = blankForKind(kind, id);
    setCurrent({ kind, id, key: `${kindKey(kind)}:${id}` });
    setDraft(blank);
    setDirty(true);
    setMessage({ tone: "ok", text: `new ${kind} draft — save to persist` });
  };

  const handleSelect = ({ kind, id }) => {
    const k = canonicalKind(kind);
    setCurrent({ kind: k, id, key: `${kindKey(k)}:${id}` });
  };

  const handleSave = async () => {
    if (!draft || !current) return;
    const errors = validate(current.kind, draft, context);
    if (errors.length) {
      setValidationErrors(errors);
      setMessage({ tone: "error", text: `${errors.length} validation error(s)` });
      return;
    }
    setSaving(true);
    try {
      await saveForKind(current.kind, draft);
      setDirty(false);
      setMessage({ tone: "ok", text: "saved" });
      await refreshIndex();
      if (githubConfigured()) {
        runSync(`save ${current.kind}:${current.id}`);
      }
    } catch (e) {
      setMessage({ tone: "error", text: `save failed: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!confirm(`Delete ${current.kind} '${current.id}'? This cannot be undone.`))
      return;
    try {
      await deleteForKind(current.kind, current.id);
      setCurrent(null);
      setDraft(null);
      setDirty(false);
      await refreshIndex();
      setMessage({ tone: "ok", text: "deleted" });
      if (githubConfigured()) {
        runSync(`delete ${current.kind}:${current.id}`);
      }
    } catch (e) {
      setMessage({ tone: "error", text: `delete failed: ${e.message}` });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        index={index}
        current={current}
        onSelect={handleSelect}
        onNew={handleNew}
        onImport={() => setImportOpen(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        onSync={() => runSync("manual")}
        saving={saving}
        dirty={dirty}
        supabaseConfigured={supabaseConfigured}
        message={message}
        syncState={syncState}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async () => {
          await refreshIndex();
          setMessage({ tone: "ok", text: "imported" });
          if (githubConfigured()) {
            runSync("import");
          }
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {!supabaseConfigured && (
          <div className="mb-4 p-3 rounded bg-rose-950/60 border border-rose-900 text-rose-200 text-sm">
            <strong>Supabase isn't configured.</strong> Set{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{" "}
            (Netlify env or <code>.env.local</code>). Editor UI runs but
            load/save calls will throw.
          </div>
        )}

        {!current && (
          <div className="text-slate-400 text-sm">
            Pick an item from the navigator, or create a new one.
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="mb-4 p-3 rounded bg-rose-950/60 border border-rose-900 text-rose-200 text-xs">
            <div className="font-semibold mb-1">Validation errors:</div>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {current && draft && (
          <EditorForKind
            kind={current.kind}
            draft={draft}
            onChange={updateDraft}
            context={context}
          />
        )}
      </main>
    </div>
  );
}

function EditorForKind({ kind, draft, onChange, context }) {
  switch (kind) {
    case "world":
      return <WorldEncounterEditor value={draft} onChange={onChange} context={context} />;
    case "field":
      return <FieldEncounterEditor value={draft} onChange={onChange} context={context} />;
    case "quest":
      return <QuestEditor value={draft} onChange={onChange} context={context} />;
    case "wiki":
      return <WikiEntryEditor value={draft} onChange={onChange} />;
    default:
      return null;
  }
}

function canonicalKind(kind) {
  if (kind === "world" || kind === "world_encounter") return "world";
  if (kind === "field" || kind === "field_encounter") return "field";
  if (kind === "quest") return "quest";
  if (kind === "wiki" || kind === "wiki_entry") return "wiki";
  return kind;
}

function kindKey(kind) {
  return canonicalKind(kind);
}

async function loadForKind(kind, id) {
  if (kind === "world" || kind === "field") return loadStory(kind, id);
  if (kind === "quest") return loadQuest(id);
  if (kind === "wiki") return loadWikiEntry(id);
  throw new Error(`unknown kind ${kind}`);
}

async function saveForKind(kind, draft) {
  if (kind === "world" || kind === "field") return saveStory(draft);
  if (kind === "quest") return saveQuest(draft);
  if (kind === "wiki") return saveWikiEntry(draft);
  throw new Error(`unknown kind ${kind}`);
}

async function deleteForKind(kind, id) {
  if (kind === "world" || kind === "field") return deleteStory(kind, id);
  if (kind === "quest") return deleteQuest(id);
  if (kind === "wiki") return deleteWikiEntry(id);
  throw new Error(`unknown kind ${kind}`);
}

async function idExists(kind, id) {
  try {
    await loadForKind(kind, id);
    return true;
  } catch {
    return false;
  }
}

function validate(kind, draft, ctx) {
  if (kind === "world") return validateWorldEncounter(draft, ctx);
  if (kind === "field") return validateFieldEncounter(draft, ctx);
  if (kind === "quest") return validateQuest(draft, ctx);
  if (kind === "wiki") return validateWikiEntry(draft, ctx);
  return [];
}

function blankForKind(kind, id) {
  if (kind === "world") {
    return {
      kind: "world",
      id,
      title: "",
      mode: "private",
      recipient: "active",
      expiresIn: null,
      publicGroupChoice: false,
      triggerCondition: { op: "eq", left: 0, right: 0 },
      triggerStrength: 1,
      triggerCooldown: 4,
      placementFilter: null,
      beats: [blankBeat(id, true)],
    };
  }
  if (kind === "field") {
    return {
      kind: "field",
      id,
      title: "",
      copies: 1,
      beats: [blankBeat(id, true)],
    };
  }
  if (kind === "quest") {
    return {
      id,
      title: "",
      mode: "single-player",
      beats: [],
      prereqs: [],
      claimRewards: [],
      sharedRewards: [],
    };
  }
  if (kind === "wiki") {
    return {
      kind: "wiki",
      id,
      term: "",
      aliases: [],
      category: "Mechanics",
      body: "",
      imagePath: null,
    };
  }
  return null;
}

function blankBeat(id, isHead = false) {
  return {
    id,
    isHead,
    art: "",
    imagePath: null,
    text: "",
    choices: [],
  };
}
