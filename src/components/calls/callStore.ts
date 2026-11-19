"use client";
/** The call in progress lives in sessionStorage so a reload (or the phone killing the tab) doesn't lose it. */
export type PendingCall = { callId: string; leadId: string; name: string; processId: string | null; startedAt: number; hiddenAt: number | null };
const KEY = "callopps.pendingCall";
export const EVENT = "callopps:call";

export function readPending(): PendingCall | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
export function writePending(p: PendingCall | null) {
  try { if (p) sessionStorage.setItem(KEY, JSON.stringify(p)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}
