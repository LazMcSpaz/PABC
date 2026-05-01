// Shared scaffold for in-game modals. Renders a fixed full-screen overlay
// with a centered card. Two flavors are expressed as props:
//   - Dismissible (CardModal, IntriguePlayModal, PartnerModal, RaidLauncherModal):
//       pass `onClose` to close on backdrop click.
//   - Decision-prompt (PromptModal, PeekReorderModal):
//       omit `onClose` (no backdrop dismiss) and pass `ownerColor` to draw
//       the player's color border + shadow.
//
// The .modal-shell / --narrow / --wide CSS classes (in src/index.css) handle
// width and vertical scroll. Background, padding, border-radius and text
// color are applied here so individual call sites stop reinventing them.

export default function ModalShell({
  onClose,
  zIndex = 50,
  variant,
  overlayAlpha = 0.7,
  ownerColor,
  innerStyle,
  children,
}) {
  const shellClass = variant ? `modal-shell modal-shell--${variant}` : "modal-shell";
  const decoratedShell = ownerColor
    ? {
        border: `1px solid ${ownerColor}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      }
    : null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${overlayAlpha})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={shellClass}
        style={{
          background: "#222",
          padding: "1rem",
          borderRadius: 6,
          color: "#f5f5f5",
          ...decoratedShell,
          ...innerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
