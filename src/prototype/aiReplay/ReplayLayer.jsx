// The cinematic overlay layer, mounted inside BoardViewport's transformed
// content (so it pans / zooms with the board). Renders the sliding pawns and
// the fade-up/down annotation popups the driver schedules. Pointer-transparent
// — it never steals board interaction.
import { AnimatePresence } from "framer-motion";
import AnimatedPawn from "./AnimatedPawn.jsx";
import ContestPopup from "./overlays/ContestPopup.jsx";
import LocationPopup from "./overlays/LocationPopup.jsx";
import EncounterPopup from "./overlays/EncounterPopup.jsx";

export default function ReplayLayer({ pawns, overlays }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}>
      {pawns.map((p) => (
        <AnimatedPawn
          key={p.key}
          fromCenter={p.fromCenter}
          toCenter={p.toCenter}
          fadeIn={p.fadeIn}
          fadeOut={p.fadeOut}
          durationMs={p.durationMs}
          color={p.color}
          label={p.label}
        />
      ))}
      <AnimatePresence>
        {overlays.map((o) => {
          if (o.kind === "contest") return <ContestPopup key={o.id} {...o} />;
          if (o.kind === "location") return <LocationPopup key={o.id} {...o} />;
          if (o.kind === "encounter") return <EncounterPopup key={o.id} {...o} />;
          return null;
        })}
      </AnimatePresence>
    </div>
  );
}
