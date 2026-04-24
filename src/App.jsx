import SetupScreen from "./components/SetupScreen.jsx";
import GameBoard from "./components/GameBoard.jsx";
import NotificationToasts from "./components/NotificationToasts.jsx";
import PromptModal from "./components/PromptModal.jsx";
import WinScreen from "./components/WinScreen.jsx";
import { useGameEngine } from "./hooks/useGameEngine.js";

export default function App() {
  const engine = useGameEngine();
  const { state, startGame, reset, resolvePrompt } = engine;

  if (!state) return <SetupScreen onStart={startGame} />;
  if (state.winnerId != null) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return (
      <>
        <WinScreen winner={winner} onReset={reset} />
        <NotificationToasts state={state} />
      </>
    );
  }
  return (
    <>
      <GameBoard state={state} engine={engine} />
      <PromptModal state={state} onResolve={resolvePrompt} />
      <NotificationToasts state={state} />
    </>
  );
}
