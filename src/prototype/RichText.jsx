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

// A single glossary-linked word, for screens that build their labels out of
// JSX rather than out of a body of prose.
//
// `RichText` covers authored text — flavor, encounter bodies, wiki entries —
// where the author can type `[[Menace]]` inline. The HUD cannot use that: its
// vocabulary lives in `label` props, section headings and status pills, which
// are strings assembled by the component, not prose. Wrapping those in
// `<Term id="r-menace">Menace</Term>` gets the same click-through without
// asking every label site to become a rich-text parser.
//
// TWO DELIBERATE DIFFERENCES FROM RichText'S LINKS.
//
// First, `id` and the display text are separate. The lore wiki already owns
// the short words (`scrap`, `gift`, `claim`), so the rules glossary is
// `r-` prefixed and addressed by id — which also frees the on-screen word to
// be whatever reads best in that spot. "Political Capacity" and "Sway held"
// can both point at `r-sway`.
//
// Second, it does NOT paint itself gold. RichText links sit in body prose
// where gold is the link colour; these sit inside a HUD whose colours already
// carry meaning — a red war pill, an amber Menace figure. Repainting them
// would destroy information to signal something a dotted underline signals
// just as well. So the underline inherits `currentColor` and the label keeps
// whatever colour its context gave it.
export function Term({ id, children, style, title }) {
  const wiki = useContext(WikiContext);
  const key = String(id ?? (typeof children === "string" ? children : "")).toLowerCase();
  const resolved = wiki.aliasIndex?.[key] ?? null;
  if (!resolved || !wiki.openEntry) return <span style={style}>{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      title={title ?? "What does this mean?"}
      onClick={(e) => {
        e.stopPropagation();
        wiki.openEntry(resolved);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          wiki.openEntry(resolved);
        }
      }}
      style={{
        textDecoration: "underline dotted",
        textDecorationColor: "currentColor",
        textUnderlineOffset: 3,
        textDecorationThickness: 1,
        cursor: "help",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
