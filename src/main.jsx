import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AudioProvider } from "./audio/AudioProvider.jsx";
import "./index.css";

// AudioProvider sits above App so the soundtrack survives every screen change
// — the title theme keeps playing from the title screen through setup, and
// only crosses over when a match actually starts. See src/audio/MusicPlayer.js.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AudioProvider>
      <App />
    </AudioProvider>
  </React.StrictMode>,
);
