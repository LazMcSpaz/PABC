// In-game wiki / glossary. Opens when the player clicks a [[term]] in
// any RichText. The body itself can contain [[cross-links]] — clicking
// one swaps the displayed entry without closing the modal, building a
// short back-stack so the player can navigate a small graph of
// definitions before returning to play.
//
// Mounted at the top level (Prototype.jsx) so it can sit above any other
// modal — the encounter card stays visible behind it.

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WikiContext, RichText } from "./RichText.jsx";
import { useIsPhone } from "./useViewport.js";

const C = {
  font: "'Inter', system-ui, sans-serif",
  panel: "rgba(14, 18, 22, 0.96)",
  border: "rgba(245, 208, 111, 0.4)",
  borderDim: "rgba(245, 208, 111, 0.18)",
  text: "#e9ecf1",
  textDim: "#9aa3ad",
  accent: "#f5d06f",
};

export default function WikiModal({ openEntryId, history, onClose, onNavigate, onBack }) {
  const wiki = useContext(WikiContext);
  // PHONE LAYOUT. The desktop modal is a fixed 220px term list beside the
  // body. At 94vw of a ~390px screen that leaves about 145px for the entry
  // itself, which is why the thing read as cut off: the body was being
  // squeezed to a column two or three words wide.
  //
  // The fix is not a narrower sidebar — a term list narrow enough to leave
  // room is a term list you cannot read either. On a phone the two panes take
  // turns: the entry gets the whole width, and the list is a screen you go to
  // and come back from. `showList` is which of the two is on screen, and it is
  // ignored entirely above phone width, where both fit and always have.
  const isPhone = useIsPhone();
  const [showList, setShowList] = useState(false);

  // Scroll the term list to whatever entry is open. Categories are sorted
  // alphabetically and there are a hundred entries, so a rules term opened
  // from the diplomacy screen lands the sidebar somewhere in the C's with the
  // highlighted row far below the fold — the list looks like it failed to
  // track the article.
  //
  // This sets the sidebar's own scrollTop rather than calling
  // `scrollIntoView`, which was the first attempt: scrollIntoView walks every
  // scrollable ancestor, so it scrolled the modal itself as well and left the
  // entry body blank with the header off the top. Nudging one container's
  // scrollTop cannot do that.

  // Group entries by category for the left sidebar.
  const byCategory = useMemo(() => {
    const m = new Map();
    for (const e of Object.values(wiki.entries)) {
      const k = e.category || "Uncategorized";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => String(a.term).localeCompare(String(b.term)));
    }
    return m;
  }, [wiki.entries]);

  const [filter, setFilter] = useState("");
  const entry = openEntryId ? wiki.entries[openEntryId] : null;
  const filterLower = filter.trim().toLowerCase();

  const listRef = useRef(null);
  const activeRow = useRef(null);
  useEffect(() => {
    const box = listRef.current;
    const node = activeRow.current;
    if (!box || !node) return;
    const n = node.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (n.top < b.top || n.bottom > b.bottom) {
      box.scrollTop += n.top - b.top - box.clientHeight / 3;
    }
  }, [openEntryId, showList, filter]);

  return (
    <AnimatePresence>
      {openEntryId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 80,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0, 0, 0, 0.72)",
          }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isPhone ? "96vw" : "min(880px, 94vw)",
              maxHeight: isPhone ? "88vh" : "82vh",
              height: isPhone ? "88vh" : undefined,
              display: "grid",
              gridTemplateColumns: isPhone ? "1fr" : "220px 1fr",
              // A grid row defaults to `auto`, which means "as tall as the
              // content" — so the term list grew to its full 2700px, the
              // modal's `overflow: hidden` clipped it, and the inner
              // `overflow-y: auto` never had anything to scroll. The list
              // looked cut off because it WAS cut off: every entry past the
              // fold was unreachable. minmax(0, 1fr) makes the row shrink to
              // the modal instead, which is what hands the scroll back.
              gridTemplateRows: "minmax(0, 1fr)",
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              fontFamily: C.font, color: C.text,
            }}
          >
            {/* sidebar: search + categorized term list */}
            <div style={{
              borderRight: isPhone ? "none" : `1px solid ${C.borderDim}`,
              padding: "10px 8px",
              display: isPhone && !showList ? "none" : "flex",
              flexDirection: "column", minHeight: 0,
            }}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="search…"
                style={{
                  width: "100%", padding: "6px 8px",
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${C.borderDim}`,
                  borderRadius: 4, color: C.text, fontSize: 12,
                  outline: "none", marginBottom: 8,
                }}
              />
              <div ref={listRef} style={{ overflowY: "auto", minHeight: 0 }}>
                {[...byCategory.entries()].sort().map(([cat, entries]) => {
                  const visible = entries.filter((e) =>
                    !filterLower
                    || e.term.toLowerCase().includes(filterLower)
                    || (e.aliases ?? []).some((a) => a.toLowerCase().includes(filterLower)),
                  );
                  if (!visible.length) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{
                        fontSize: 9, letterSpacing: 1.4,
                        textTransform: "uppercase", color: C.textDim,
                        padding: "2px 4px",
                      }}>{cat}</div>
                      {visible.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          ref={e.id === openEntryId ? activeRow : null}
                          onClick={() => { setShowList(false); onNavigate(e.id); }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "4px 6px", border: "none",
                            background: e.id === openEntryId ? "rgba(245,208,111,0.14)" : "transparent",
                            color: e.id === openEntryId ? C.accent : C.text,
                            fontSize: 12, cursor: "pointer", borderRadius: 3,
                          }}
                        >
                          {e.term}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {byCategory.size === 0 && (
                  <div style={{ fontSize: 11, color: C.textDim, padding: 4 }}>
                    No wiki entries yet. Author them in the content editor.
                  </div>
                )}
              </div>
            </div>

            {/* body */}
            <div style={{
              display: isPhone && showList ? "none" : "flex",
              flexDirection: "column", minHeight: 0,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderBottom: `1px solid ${C.borderDim}`,
              }}>
                {isPhone && (
                  <button
                    type="button"
                    onClick={() => setShowList(true)}
                    title="all terms"
                    style={{
                      background: "transparent", border: `1px solid ${C.borderDim}`,
                      color: C.text, borderRadius: 3, fontSize: 11,
                      padding: "2px 8px", cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    ☰
                  </button>
                )}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={onBack}
                    title="back"
                    style={{
                      background: "transparent", border: `1px solid ${C.borderDim}`,
                      color: C.text, borderRadius: 3, fontSize: 11,
                      padding: "2px 8px", cursor: "pointer",
                    }}
                  >
                    ← back
                  </button>
                )}
                <div style={{
                  flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: C.accent,
                }}>
                  {entry ? entry.term : "—"}
                </div>
                {entry?.category && !isPhone && (
                  <span style={{ fontSize: 10, color: C.textDim, letterSpacing: 0.8 }}>
                    {entry.category}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: "transparent", border: "none",
                    color: C.textDim, fontSize: 18, cursor: "pointer",
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{
                padding: "12px 16px", overflowY: "auto",
                fontSize: 13, lineHeight: 1.6, color: C.text,
                whiteSpace: "pre-wrap", overflowWrap: "anywhere",
              }}>
                {entry ? (
                  <RichText>{entry.body}</RichText>
                ) : (
                  <span style={{ color: C.textDim, fontSize: 12 }}>
                    Entry not found.
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
