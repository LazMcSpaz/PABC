// Parses `[[term]]` and `[[term|display]]` markup in flavor text and
// renders the matched runs as clickable spans that open the wiki modal.
// Falls back to plain text if no wiki entry resolves — authors get a
// visible "unresolved link" hint in dev (faded amber) so typos are
// easy to spot without the renderer eating them silently.
//
// Lookup order: alias map → entry.term (case-insensitive) → entry.id.

import { useContext, createContext } from "react";

export const WikiContext = createContext({
  entries: {},
  aliasIndex: {},
  openEntry: () => {},
});

// Tokens like `{faction:lowest-standing-with-active}` get resolved before
// the [[wiki]] parser runs. Provider passes a resolver bound to current
// state; if none is provided, tokens render verbatim (which is fine for
// the editor preview where state-resolution doesn't apply).
export const TokenContext = createContext({
  resolve: (text) => text,
});

export function TokenProvider({ resolve, children }) {
  return <TokenContext.Provider value={{ resolve }}>{children}</TokenContext.Provider>;
}

export function WikiProvider({ entries, openEntry, children }) {
  // Build the alias-and-term lookup once per entries change. Lower-case
  // for case-insensitive matching.
  const aliasIndex = {};
  for (const e of Object.values(entries ?? {})) {
    aliasIndex[String(e.id).toLowerCase()] = e.id;
    if (e.term) aliasIndex[String(e.term).toLowerCase()] = e.id;
    for (const a of e.aliases ?? []) {
      aliasIndex[String(a).toLowerCase()] = e.id;
    }
  }
  const value = { entries: entries ?? {}, aliasIndex, openEntry };
  return <WikiContext.Provider value={value}>{children}</WikiContext.Provider>;
}

export function RichText({ children, style }) {
  const raw = typeof children === "string" ? children : "";
  const wiki = useContext(WikiContext);
  const tokens = useContext(TokenContext);
  // Resolve {kind:selector} tokens first so the [[wiki]] parser sees
  // already-substituted text. Resolution failures fall back to a
  // generic word in the engine — never blank.
  const text = tokens.resolve ? tokens.resolve(raw) : raw;
  const parts = splitMarkup(text);

  return (
    <span style={style}>
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.text}</span>;
        const resolved = wiki.aliasIndex[p.target.toLowerCase()] ?? null;
        if (resolved) {
          return (
            <span
              key={i}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                wiki.openEntry(resolved);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  wiki.openEntry(resolved);
                }
              }}
              style={{
                color: "#f5d06f",
                textDecoration: "underline dotted",
                textUnderlineOffset: 2,
                cursor: "pointer",
              }}
            >
              {p.text}
            </span>
          );
        }
        // Unresolved — render with a subtle visual hint so the author
        // can spot it; clicking does nothing.
        return (
          <span
            key={i}
            title={`No wiki entry for "${p.target}"`}
            style={{ color: "#d2913c", opacity: 0.7 }}
          >
            {p.text}
          </span>
        );
      })}
    </span>
  );
}

function splitMarkup(text) {
  const out = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) != null) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    const target = m[1].trim();
    const display = (m[2] ?? m[1]).trim();
    out.push({ kind: "link", text: display, target });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
