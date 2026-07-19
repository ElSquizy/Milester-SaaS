"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { notifyPendingChanged } from "@/lib/pendingEvent";

/**
 * Coalesces `router.refresh()` calls from inline edits.
 *
 * The catalog route is `force-dynamic`, so every refresh re-runs the count +
 * findMany over ~1.9k products and re-renders the whole page. Committing each
 * field used to trigger one immediately, which meant editing 20 prices cost 20
 * full server round-trips while the user was still typing.
 *
 * The edited value is already correct on screen (each field keeps local state),
 * so the refresh only exists to pick up derived data — sync status, totals,
 * pending counts. That can wait for a pause in the editing.
 */
export function useDeferredRefresh(delay = 1500) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; router.refresh(); notifyPendingChanged(); }, delay);
  }, [router, delay]);
}
