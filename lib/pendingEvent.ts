"use client";

/**
 * In-tab signal that the pending-push counter probably changed (an edit, a bulk
 * action, a revert…). The sidebar used to poll the count every 10 seconds
 * instead — a full-table count 8.640 times a day per open tab, which is what
 * blew through Turso's read quota. Event-driven refresh reads only when
 * something actually happened.
 */
export const PENDING_EVENT = "milester-pending-changed";

export function notifyPendingChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PENDING_EVENT));
}
