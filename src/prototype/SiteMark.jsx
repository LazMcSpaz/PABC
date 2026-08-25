// A quest site on the board — somewhere you have been told to go.
//
// WHY THIS EXISTS. Every quest beat with `deliver: "discovered"` drops a
// marker on a hex and waits for a unit to walk onto it. The board drew none
// of them, so a nine-round playtest put roughly twenty invisible sites on a
// fifty-nine-hex map, and the player reached four — by accident. The quests
// with real choices were firing; they simply could not be found.
//
// WHY IT IS NOT DRAWN FOR EVERY SITE. Marking every available site would turn
// the map into a checklist and answer a question the fiction never asked:
// how would you know to go there? The engine decides who has a reason (a
// scene that pointed you onward, a reader who read the road) and only those
// players get the mark. A quest nobody has mentioned to you stays a thing you
// stumble on.
//
// Drawn as a waypoint rather than an exclamation mark: this is a place
// somebody named to you, not an errand the game is assigning. The ring reads
// at a glance without competing with a Location's own art, and the dashed
// stroke says "reported" rather than "surveyed" — you have been told it is
// here, you have not been yet.
import { C } from "./HudChrome.jsx";

export default function SiteMark({ site, size = 22 }) {
  if (!site) return null;
  const many = (site.count ?? 1) > 1;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img">
      <title>
        {many
          ? `${site.count} places you have been told about — go here to find out what is waiting`
          : "A place you have been told about — go here to find out what is waiting"}
      </title>
      {/* A DARK BACKING DISC, and it is not decoration. The first version was
          a bare dashed ring in `C.gold`, which vanished outright against the
          red of a held tile — gold on bright terrain at this size is a rumour,
          not a mark. Every other thing the board puts ON the ground solves
          this the same way: the Location icons sit their gold on a dark ring.
          So does this. */}
      <circle cx="12" cy="12" r="10" fill="rgba(6,10,12,0.86)" />
      <circle
        cx="12" cy="12" r="10"
        fill="none" stroke={C.gold} strokeWidth="1.4" opacity="0.5"
      />
      <circle
        cx="12" cy="12" r="6.6"
        fill="none"
        stroke={C.gold}
        strokeWidth="2"
        strokeDasharray="3.2 2.6"
        opacity="0.98"
      />
      <circle cx="12" cy="12" r="2.2" fill={C.gold} />
      {/* A second dash ring for a hex holding more than one. The count lives
          in the tooltip rather than as a numeral, which at this size would be
          competing with the Location's own labels for the same few pixels. */}
      {many && (
        <circle
          cx="12" cy="12" r="8.6"
          fill="none" stroke={C.gold} strokeWidth="1"
          strokeDasharray="1.6 2.6" opacity="0.7"
        />
      )}
    </svg>
  );
}
