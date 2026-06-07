// The project is pivoting to the spatial-board redesign (see
// docs/mechanical-spec-v0.1.md). App owns the top-level flow:
//
//   TitleScreen ─▶ SetupScreen (New Game) ─▶ Prototype (the game)
//             └──▶ LoreScreen (in-game wiki)
//
// `config` (set by SetupScreen → onStart) hands control to the playable
// prototype; `screen` routes between the pre-game menu screens. Greyed-out
// title options (Continue / Load Game / Settings) are simply handlers we
// don't pass yet — TitleScreen disables any item whose handler is absent.
import { useEffect, useState } from "react";
import Prototype from "./prototype/Prototype.jsx";
import SetupScreen from "./prototype/SetupScreen.jsx";
import TitleScreen from "./prototype/TitleScreen.jsx";
import LoreScreen from "./prototype/LoreScreen.jsx";
import HudShowcase from "./prototype/HudShowcase.jsx";

export default function App() {
  const [config, setConfig] = useState(null);
  const [screen, setScreen] = useState("title"); // "title" | "setup" | "lore"

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

  // In-game: a started match supersedes the menu screens.
  if (config) {
    return (
      <Prototype
        key={config.key}
        config={config}
        onNewGame={() => { setConfig(null); setScreen("title"); }}
      />
    );
  }

  // Pre-game menu flow.
  if (screen === "setup") {
    return <SetupScreen onStart={setConfig} onBack={() => setScreen("title")} />;
  }
  if (screen === "lore") {
    return <LoreScreen onBack={() => setScreen("title")} />;
  }
  // Default: the title / main-menu screen. Continue, Load Game and Settings
  // have no backing systems yet, so we pass no handlers and TitleScreen
  // renders them greyed out.
  return (
    <TitleScreen
      onNewGame={() => setScreen("setup")}
      onLore={() => setScreen("lore")}
      version="v0.2 demo"
    />
  );
}
