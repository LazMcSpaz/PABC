// Touch-friendly content navigator. Replaces the native <select> +
// <optgroup> layout (whose group labels aren't tappable on mobile) with
// a sheet that drills from category → item.
//
// Trigger button shows the current selection; tapping it opens a sheet
// listing the four categories. Tap a category to expand its items; tap
// an item to select it (and close the sheet). Empty categories say so
// instead of dead-ending the user.

import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  { key: "quest", label: "Quests",           field: "quests",           render: (q) => q.title ? `${q.title} (${q.id})` : q.id },
  { key: "world", label: "World Encounters", field: "worldEncounters",  render: (e) => `${e.title ? `${e.title} (${e.id})` : e.id} · ${e.mode}` },
  { key: "field", label: "Field Encounters", field: "fieldEncounters",  render: (e) => e.title ? `${e.title} (${e.id})` : e.id },
  { key: "wiki",  label: "Wiki",             field: "wikiEntries",      render: (w) => `${w.term}${w.category ? ` · ${w.category}` : ""}` },
];

export function ContentPicker({ index, current, onSelect }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => current?.kind ?? null);
  const [filter, setFilter] = useState("");

  // Resolve display text for the trigger button.
  const triggerLabel = useMemo(() => {
    if (!current) return "— select content —";
    const cat = CATEGORIES.find((c) => c.key === currentKindToCatKey(current.kind));
    if (!cat) return current.id;
    const item = (index?.[cat.field] ?? []).find((x) => x.id === current.id);
    if (!item) return current.id;
    return cat.render(item);
  }, [current, index]);

  // Lock body scroll while sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset filter / focus on open.
  useEffect(() => {
    if (open) {
      setFilter("");
      if (current?.kind) setExpanded(currentKindToCatKey(current.kind));
    }
  }, [open, current]);

  const filterLower = filter.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-72 text-left text-sm bg-slate-900 border border-slate-700 rounded px-3 py-2 hover:border-slate-600 flex items-center justify-between gap-2"
        style={{ fontSize: 16 }}
      >
        <span className={current ? "text-slate-100 truncate" : "text-slate-500"}>
          {triggerLabel}
        </span>
        <span className="text-slate-500 text-xs flex-shrink-0">▾</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-6"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 sm:rounded-lg w-full sm:max-w-md flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="search…"
                className="flex-1"
                style={{ fontSize: 16 }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
              >
                close
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {CATEGORIES.map((cat) => {
                const all = index?.[cat.field] ?? [];
                const visible = filterLower
                  ? all.filter((x) =>
                      JSON.stringify(x).toLowerCase().includes(filterLower),
                    )
                  : all;
                // If there's a filter, force-expand any category with matches.
                const isOpen = filterLower
                  ? visible.length > 0
                  : expanded === cat.key;

                return (
                  <div key={cat.key} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((cur) => (cur === cat.key ? null : cat.key))
                      }
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/60"
                    >
                      <span className="text-slate-100 font-semibold">{cat.label}</span>
                      <span className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{visible.length}{filterLower && visible.length !== all.length ? `/${all.length}` : ""}</span>
                        <span>{isOpen ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="pb-1">
                        {visible.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-slate-500">
                            {filterLower ? "no match" : "no entries yet — use the + button above"}
                          </div>
                        ) : (
                          visible.map((item) => {
                            const isCurrent =
                              current?.id === item.id &&
                              currentKindToCatKey(current.kind) === cat.key;
                            return (
                              <button
                                key={`${cat.key}:${item.id}`}
                                type="button"
                                onClick={() => {
                                  onSelect({ kind: cat.key, id: item.id });
                                  setOpen(false);
                                }}
                                className={`block w-full text-left px-4 py-2.5 text-sm border-l-2 ${
                                  isCurrent
                                    ? "border-amber-400 bg-amber-500/10 text-amber-200"
                                    : "border-transparent text-slate-200 hover:bg-slate-800/60"
                                }`}
                                style={{ minHeight: 44 }}
                              >
                                {cat.render(item)}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function currentKindToCatKey(kind) {
  if (kind === "world" || kind === "world_encounter") return "world";
  if (kind === "field" || kind === "field_encounter") return "field";
  if (kind === "wiki" || kind === "wiki_entry") return "wiki";
  return "quest";
}
