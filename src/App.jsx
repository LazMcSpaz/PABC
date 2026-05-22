// The project is pivoting to the spatial-board redesign (see
// docs/mechanical-spec-v0.1.md). App owns the top-level flow between
// the setup screen and the playable prototype.
import { useEffect, useState } from "react";
import Prototype from "./prototype/Prototype.jsx";
import SetupScreen from "./prototype/SetupScreen.jsx";
import HudShowcase from "./prototype/HudShowcase.jsx";

export default function App() {
  const [config, setConfig] = useState(null);

  // Look-pass: visit /#hud to preview the radial HUD redesign.
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (hash === "#hud") {
    return <HudShowcase onExit={() => { window.location.hash = ""; }} />;
  }

  if (!config) return <SetupScreen onStart={setConfig} />;
  return (
    <Prototype
      key={config.key}
      config={config}
      onNewGame={() => setConfig(null)}
    />
  );
}
