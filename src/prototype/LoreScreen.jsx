// LoreScreen.jsx — full-screen Lore / in-game wiki browser for Ashland Conquest.
// Reads WIKI_ENTRIES from the auto-generated content file (currently empty {}).
// Renders a robust skeleton that degrades gracefully when empty and becomes a
// fully functional two-column wiki browser as entries are authored in the
// Encounter Builder.
//
// Props:
//   onBack — () => void — called when the player clicks ◂ Back to return to
//            the Title / calling screen.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { C, CornerBrackets } from "./HudChrome.jsx";
import { WikiProvider, RichText } from "./RichText.jsx";
import { WIKI_ENTRIES } from "../game/content/wiki.js";
import "./prototype.css";

// Amber accent used for entry title/term headings — matching the existing wiki
// modal convention while keeping the surrounding chrome teal-forward.
const AMBER = "#f5d06f";
const AMBER_DIM = "rgba(245,208,111,0.55)";
const BORDER = `rgba(86,211,198,0.28)`;
const BORDER_DIM = `rgba(86,211,198,0.14)`;
const PANEL_BG =
  "linear-gradient(158deg, rgba(16,28,29,0.92) 0%, rgba(9,17,18,0.95) 58%, rgba(6,11,12,0.97) 100%)";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Group entries Map<category, Entry[]>, sorted by category key then term. */
function groupEntries(entries) {
  const m = new Map();
  for (const e of Object.values(entries ?? {})) {
    const k = e.category || "Uncategorized";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.term).localeCompare(String(b.term)));
  }
  // Return entries sorted by category key
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Return the first entry alphabetically across all categories, or null. */
function firstEntry(byCategory) {
  for (const entries of byCategory.values()) {
    if (entries.length > 0) return entries[0];
  }
  return null;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function LoreScreen({ onBack }) {
  const byCategory = useMemo(() => groupEntries(WIKI_ENTRIES), []);
  const isEmpty = byCategory.size === 0;

  // Default-select first entry when data is present
  const [selectedId, setSelectedId] = useState(() => {
    if (isEmpty) return null;
    return firstEntry(byCategory)?.id ?? null;
  });

  // Small navigation back-stack so cross-links can be un-done
  const [backStack, setBackStack] = useState([]);

  const [filter, setFilter] = useState("");
  const filterLower = filter.trim().toLowerCase();

  const selectedEntry = selectedId ? WIKI_ENTRIES[selectedId] ?? null : null;

  function selectEntry(id) {
    if (id === selectedId) return;
    if (selectedId) setBackStack((prev) => [...prev, selectedId]);
    setSelectedId(id);
  }

  function navigateBack() {
    if (backStack.length === 0) return;
    const prev = backStack[backStack.length - 1];
    setBackStack((s) => s.slice(0, -1));
    setSelectedId(prev);
  }

  return (
    // Full-screen wrapper — same radial bg as SetupScreen / TitleScreen.
    // NOTE: hud-screen-scan must be a SEPARATE pointer-events:none overlay
    // child — applying it to the root would disable clicks on the whole
    // screen (it sets pointer-events: none).
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background:
          "radial-gradient(ellipse at 50% 28%, #163132 0%, #0a1718 38%, #050a0b 78%, #03080a 100%)",
        color: C.text,
        fontFamily: C.font,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      {/* whole-screen subtle CRT scan — separate overlay so it never blocks clicks */}
      <div className="hud-screen-scan" style={{ zIndex: 0, opacity: 0.55, position: "fixed" }} />

      {/* ── page header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={{
          textAlign: "center",
          marginBottom: 20,
          zIndex: 1,
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: C.font,
            fontSize: 10,
            letterSpacing: 4.4,
            textTransform: "uppercase",
            color: C.holoHi,
            opacity: 0.6,
            fontWeight: 600,
          }}
        >
          ◇ Ashland Conquest · Intelligence Archive ◇
        </div>
        <div
          style={{
            fontFamily: C.font,
            fontSize: 38,
            fontWeight: 800,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginTop: 4,
            color: "#f4efe2",
            textShadow: `0 0 18px ${C.holo}66, 0 0 32px ${C.holo}38`,
          }}
        >
          Lore{" "}
          <span style={{ color: C.holo }}>Archive</span>
        </div>
        <div
          style={{
            fontFamily: C.font,
            fontSize: 10.5,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: `rgba(143,246,234,0.48)`,
            marginTop: 6,
          }}
        >
          Field glossary · faction histories · encounter codex
        </div>
      </motion.div>

      {/* ── main framed panel ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(1160px, 96vw)",
          // Fill the remaining vertical space up to a comfortable max
          height: "min(76vh, 820px)",
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          background: PANEL_BG,
          border: `1px solid ${C.holo}`,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: `inset 0 0 32px rgba(86,211,198,0.06), 0 0 28px rgba(86,211,198,0.20), 0 18px 48px rgba(0,0,0,0.60)`,
          flexShrink: 1,
          minHeight: 0,
        }}
      >
        {/* top holo accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 20,
            right: 20,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${C.holoHi}, transparent)`,
            opacity: 0.75,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <CornerBrackets color={C.holo} len={16} inset={7} w={1.8} />
        <div
          className="hud-scanlines"
          style={{ position: "absolute", inset: 0, borderRadius: 10, zIndex: 0 }}
        />

        {/* ── LEFT: sidebar ─────────────────────────────────────────────── */}
        <Sidebar
          byCategory={byCategory}
          isEmpty={isEmpty}
          filter={filter}
          filterLower={filterLower}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={selectEntry}
        />

        {/* ── RIGHT: reader pane ────────────────────────────────────────── */}
        <ReaderPane
          entry={selectedEntry}
          isEmpty={isEmpty}
          backStack={backStack}
          onBack={navigateBack}
          onSelectEntry={selectEntry}
        />
      </motion.div>

      {/* ── back button ─────────────────────────────────────────────────── */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.35 }}
        onClick={onBack}
        className="hud-int"
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          zIndex: 10,
          fontFamily: C.font,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.holoHi,
          background: "rgba(6,14,15,0.80)",
          border: `1px solid ${C.holo}66`,
          borderRadius: 5,
          padding: "7px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: `0 0 10px rgba(86,211,198,0.18)`,
          transition: "border-color .15s ease, box-shadow .15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = C.holoHi;
          e.currentTarget.style.boxShadow = `0 0 14px ${C.holo}55`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `${C.holo}66`;
          e.currentTarget.style.boxShadow = `0 0 10px rgba(86,211,198,0.18)`;
        }}
      >
        ◂ Back
      </motion.button>

      {/* footer */}
      <div
        style={{
          marginTop: 14,
          fontFamily: C.font,
          fontSize: 9,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: "rgba(143,246,234,0.28)",
          zIndex: 1,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        ▸ Ashland Conquest · Lore Archive · Intelligence Database
      </div>
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ byCategory, isEmpty, filter, filterLower, onFilterChange, selectedId, onSelect }) {
  const totalCount = Object.keys(WIKI_ENTRIES).length;

  return (
    <div
      style={{
        position: "relative",
        borderRight: `1px solid ${BORDER_DIM}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        zIndex: 1,
      }}
    >
      {/* sidebar header */}
      <div
        style={{
          padding: "14px 12px 8px",
          borderBottom: `1px solid ${BORDER_DIM}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: C.font,
            fontSize: 9.5,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: C.holoHi,
            fontWeight: 600,
            opacity: 0.7,
            marginBottom: 8,
          }}
        >
          ▸ Entries{totalCount > 0 ? ` · ${totalCount}` : ""}
        </div>

        {/* search input — styled like SetupScreen seed input */}
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search entries…"
          disabled={isEmpty}
          style={{
            width: "100%",
            padding: "8px 10px",
            background: "rgba(6,12,13,0.85)",
            border: `1px solid ${C.holo}66`,
            borderRadius: 5,
            color: "#f4efe2",
            fontFamily: C.font,
            fontSize: 12,
            letterSpacing: 1.2,
            outline: "none",
            boxSizing: "border-box",
            boxShadow: `inset 0 0 6px rgba(86,211,198,0.07)`,
            opacity: isEmpty ? 0.4 : 1,
            transition: "border-color .15s ease",
          }}
          onFocus={(e) => {
            if (!isEmpty) e.target.style.borderColor = C.holoHi;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = `${C.holo}66`;
          }}
        />
      </div>

      {/* entry list */}
      <div
        className="pc-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          padding: "8px 8px 12px",
        }}
      >
        {isEmpty ? (
          <EmptySidebarNote />
        ) : (
          <CategoryList
            byCategory={byCategory}
            filterLower={filterLower}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

function EmptySidebarNote() {
  return (
    <div
      style={{
        padding: "18px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.textFaint,
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ◇
      </div>
      <div
        style={{
          fontFamily: C.font,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: C.textFaint,
          lineHeight: 1.6,
        }}
      >
        No entries yet
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: C.textDim,
          lineHeight: 1.55,
          letterSpacing: 0.3,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        Categories appear here as entries are authored in the Encounter
        Builder.
      </div>
    </div>
  );
}

function CategoryList({ byCategory, filterLower, selectedId, onSelect }) {
  let anyVisible = false;

  const groups = [...byCategory.entries()].map(([cat, entries]) => {
    const visible = filterLower
      ? entries.filter(
          (e) =>
            e.term.toLowerCase().includes(filterLower) ||
            (e.aliases ?? []).some((a) => a.toLowerCase().includes(filterLower))
        )
      : entries;
    if (visible.length > 0) anyVisible = true;
    return { cat, visible };
  });

  if (!anyVisible) {
    return (
      <div
        style={{
          padding: "14px 8px",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11,
          color: C.textDim,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        No entries match "{filterLower}"
      </div>
    );
  }

  return (
    <>
      {groups.map(({ cat, visible }) => {
        if (!visible.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 12 }}>
            {/* category header */}
            <div
              style={{
                fontFamily: C.font,
                fontSize: 9,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: C.textDim,
                padding: "3px 6px 2px",
                borderBottom: `1px solid ${BORDER_DIM}`,
                marginBottom: 3,
                userSelect: "none",
              }}
            >
              {cat}
            </div>
            {visible.map((e) => {
              const active = e.id === selectedId;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(e.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 8px",
                    border: "none",
                    background: active
                      ? `rgba(86,211,198,0.13)`
                      : "transparent",
                    color: active ? C.holoHi : C.text,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 12.5,
                    cursor: "pointer",
                    borderRadius: 4,
                    borderLeft: active
                      ? `2px solid ${C.holo}`
                      : "2px solid transparent",
                    transition:
                      "background .12s ease, color .12s ease, border-color .12s ease",
                    lineHeight: 1.35,
                  }}
                  onMouseEnter={(el) => {
                    if (!active) {
                      el.currentTarget.style.background = `rgba(86,211,198,0.07)`;
                      el.currentTarget.style.color = C.holoHi;
                    }
                  }}
                  onMouseLeave={(el) => {
                    if (!active) {
                      el.currentTarget.style.background = "transparent";
                      el.currentTarget.style.color = C.text;
                    }
                  }}
                >
                  {e.term}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ─── ReaderPane ─────────────────────────────────────────────────────────────

function ReaderPane({ entry, isEmpty, backStack, onBack, onSelectEntry }) {
  return (
    <WikiProvider entries={WIKI_ENTRIES} openEntry={onSelectEntry}>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          zIndex: 1,
        }}
      >
        {/* reader header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px 10px",
            borderBottom: `1px solid ${BORDER_DIM}`,
            flexShrink: 0,
            minHeight: 52,
          }}
        >
          {/* within-reader back button (cross-link history) */}
          <AnimatePresence>
            {backStack.length > 0 && (
              <motion.button
                type="button"
                key="wiki-back"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                onClick={onBack}
                title="Navigate back"
                style={{
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  color: C.text,
                  borderRadius: 4,
                  fontFamily: C.font,
                  fontSize: 10.5,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ← back
              </motion.button>
            )}
          </AnimatePresence>

          {/* entry term title */}
          <div
            style={{
              flex: 1,
              fontFamily: C.font,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: entry ? AMBER : C.textFaint,
              textShadow: entry ? `0 0 12px ${AMBER_DIM}` : "none",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            {entry ? entry.term : isEmpty ? "Lore Archive" : "—"}
          </div>

          {/* category badge */}
          {entry?.category && (
            <span
              style={{
                fontFamily: C.font,
                fontSize: 9,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: C.textDim,
                background: `rgba(86,211,198,0.08)`,
                border: `1px solid ${BORDER_DIM}`,
                borderRadius: 3,
                padding: "2px 7px",
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              {entry.category}
            </span>
          )}

          {/* alias tags (if any) */}
          {entry?.aliases?.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                flexShrink: 0,
              }}
            >
              {entry.aliases.map((a) => (
                <span
                  key={a}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 9,
                    color: C.textFaint,
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid rgba(86,211,198,0.1)`,
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* reader body */}
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 40px",
                gap: 14,
                textAlign: "center",
              }}
            >
              {/* decorative diamond grid ornament */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                  opacity: 0.25,
                  marginBottom: 6,
                }}
              >
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background:
                        i % 2 === 0 ? C.holo : "transparent",
                      border: `1px solid ${C.holo}`,
                      transform: "rotate(45deg)",
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  fontFamily: C.font,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.textDim,
                }}
              >
                ◇ No Lore Entries Yet ◇
              </div>
              <div
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: C.textFaint,
                  maxWidth: 460,
                  letterSpacing: 0.3,
                }}
              >
                Entries are authored in the{" "}
                <span style={{ color: C.textDim }}>
                  Encounter Builder
                </span>{" "}
                and will appear here once published. The archive is
                skeleton-ready — add entries and they will populate the
                sidebar and reader automatically.
              </div>

              {/* decorative rule */}
              <div
                style={{
                  width: 200,
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${C.holo}55, transparent)`,
                  marginTop: 8,
                }}
              />

              <div
                style={{
                  fontFamily: C.font,
                  fontSize: 9,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: C.textFaint,
                  opacity: 0.6,
                }}
              >
                ▸ Archive awaiting content ingestion
              </div>
            </motion.div>
          ) : entry ? (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="pc-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                minHeight: 0,
                padding: "16px 20px 24px",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13.5,
                lineHeight: 1.7,
                color: C.text,
                whiteSpace: "pre-wrap",
              }}
            >
              <RichText>{entry.body}</RichText>
            </motion.div>
          ) : (
            <motion.div
              key="no-selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                fontFamily: C.font,
                fontSize: 11,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: C.textFaint,
              }}
            >
              ◇ Select an entry from the sidebar
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </WikiProvider>
  );
}
