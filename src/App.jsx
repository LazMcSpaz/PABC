// The project is pivoting to the spatial-board redesign (see
// docs/mechanical-spec-v0.1.md). App owns the top-level flow between
// the setup screen and the playable prototype.
import { useState } from "react";
import Prototype from "./prototype/Prototype.jsx";
import SetupScreen from "./prototype/SetupScreen.jsx";

export default function App() {
  const [config, setConfig] = useState(null);
  if (!config) return <SetupScreen onStart={setConfig} />;
  return (
    <Prototype
      key={config.key}
      config={config}
      onNewGame={() => setConfig(null)}
    />
  );
}
