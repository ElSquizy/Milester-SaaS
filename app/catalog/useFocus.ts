"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * The "focus" set: a working list of products you curate before editing them
 * one after another. Lives in this browser only (localStorage) — it's a
 * scratchpad, not store data, so it never touches Tienda Nube.
 *
 * It stores **only product ids**, never a copy of the product. Everything is
 * read fresh from the database on each render, so if someone edits a product in
 * Tienda Nube you see their version, not a stale snapshot.
 */
const KEY = "milester.focus";
const EVENT = "milester-focus-change";

export function readFocus(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch { return []; }
}

export function writeFocus(ids: number[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* quota/private mode */ }
  // Notify every listener in this tab (the `storage` event only fires in others).
  window.dispatchEvent(new Event(EVENT));
}

export function toggleFocus(id: number): boolean {
  const ids = readFocus();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  writeFocus(next);
  return next.includes(id);
}

export function isInFocus(id: number): boolean {
  return readFocus().includes(id);
}

/** Reactive view of the focus set. */
export function useFocus() {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    const sync = () => setIds(readFocus());
    sync(); // after mount only — avoids an SSR/client hydration mismatch
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((id: number) => { const c = readFocus(); if (!c.includes(id)) writeFocus([...c, id]); }, []);
  const remove = useCallback((id: number) => writeFocus(readFocus().filter((x) => x !== id)), []);
  const clear = useCallback(() => writeFocus([]), []);

  return { ids, count: ids.length, add, remove, clear };
}
