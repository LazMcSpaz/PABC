// Shared responsive-breakpoint hook. The game has one "compact" layout
// switch — phone-width portrait — used by the HUD, board zoom controls,
// event feed, radial menu, tech wheel, and floating panels to swap from
// the desktop/iPad chrome (unchanged) to a layout that actually fits a
// ~360-430px-wide screen. Landscape phones and anything iPad-sized or
// larger keep the existing (already-verified) layout.
import { useEffect, useState } from "react";

export const PHONE_MAX_WIDTH = 480;

function readSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewportSize() {
  const [size, setSize] = useState(readSize);
  useEffect(() => {
    const onResize = () => setSize(readSize());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return size;
}

export function useIsPhone() {
  const { width } = useViewportSize();
  return width <= PHONE_MAX_WIDTH;
}
