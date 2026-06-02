// Hex tile dimensions, shared by the renderer (Hex.jsx / HexBoard) and the
// replay geometry (aiReplay/CameraController) so both agree on the grid. Kept
// in a JSX-free module so the pure geometry math stays importable headless.
export const HEX_W = 150;
export const HEX_H = Math.round(HEX_W * 1.1547);
