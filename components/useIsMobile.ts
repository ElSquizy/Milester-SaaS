"use client";
import { useEffect, useState } from "react";

/**
 * True below the app's mobile breakpoint (768px). SSR-safe: starts false and
 * resolves on mount, so it never mismatches during hydration for layout that
 * only branches after the first client render.
 */
export function useIsMobile(breakpoint = 767): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}
