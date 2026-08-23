// The listening post on the board (economy brief §11).
//
// The post has a full concealment and reveal model, an upkeep, a Strength, a
// destruction path and a Vision footprint — and until now no icon at all. A
// player could not see their OWN, which meant the one covert structure in the
// game was a line item on the upkeep ledger and nothing else.
//
// Deliberately small and antenna-shaped rather than a building: a post is an
// eye, not a fortification, and it should not read like a blockade. Dormant
// (unpaid) posts render hollow — they see nothing until they are paid again,
// and that is the state the owner most needs to notice.
import { ownerColor, FACTIONS } from "./data.js";

export default function PostMark({ post, size = 18 }) {
  if (!post) return null;
  const col = ownerColor(post.owner);
  const dormant = post.dormant;
  const who = FACTIONS[post.owner]?.name || post.owner;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={false}
      role="img"
    >
      <title>
        {`Listening post — ${who}${dormant ? " (dormant: unpaid, seeing nothing)" : ""}`}
      </title>
      {/* mast */}
      <line
        x1="12" y1="20" x2="12" y2="7"
        stroke={col} strokeWidth="1.8" strokeLinecap="round"
        opacity={dormant ? 0.45 : 1}
      />
      {/* guy lines */}
      <line x1="12" y1="19" x2="7" y2="21.5" stroke={col} strokeWidth="1" opacity={dormant ? 0.3 : 0.7} />
      <line x1="12" y1="19" x2="17" y2="21.5" stroke={col} strokeWidth="1" opacity={dormant ? 0.3 : 0.7} />
      {/* dish */}
      <path
        d="M7.5 7 A 5.2 5.2 0 0 1 16.5 7 Z"
        fill={dormant ? "none" : col}
        fillOpacity={dormant ? 0 : 0.55}
        stroke={col}
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity={dormant ? 0.5 : 1}
      />
      {/* the signal — only when it is actually listening */}
      {!dormant && (
        <>
          <path d="M12 4.4 a 4 4 0 0 1 3.6 -2.2" fill="none" stroke={col} strokeWidth="1" opacity="0.6" />
          <circle cx="12" cy="6.4" r="1.1" fill={col} />
        </>
      )}
    </svg>
  );
}
