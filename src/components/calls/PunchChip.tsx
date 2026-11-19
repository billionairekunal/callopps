"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { heartbeat, punchIn, punchOut } from "@/app/(app)/my-tasks/actions";
import { IDLE_KEY } from "@/lib/auth/idle";

export type Attendance = { open: boolean; punchIn: string | null; lastEnd: string | null };
const time = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Attendance in the top bar: the first activity punches in; Punch out is a button (§8). */
export function PunchChip({ a }: { a: Attendance }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Layouts don't re-render on client navigation, so report recent activity every few minutes.
  useEffect(() => {
    const t = setInterval(() => {
      let last = 0;
      try { last = Number(localStorage.getItem(IDLE_KEY)) || 0; } catch { /* storage blocked */ }
      if (Date.now() - last < 4 * 60_000) heartbeat().then((r) => { if (r.ok && r.data !== a.open) router.refresh(); });
    }, 4 * 60_000);
    return () => clearInterval(t);
  }, [a.open, router]);
  const act = (fn: typeof punchIn, msg: string) => start(async () => {
    const r = await fn();
    if (!r.ok) return void toast.error(r.error);
    toast.success(msg); router.refresh();
  });
  if (a.open) return (
    <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-3 pr-0.5 text-xs text-emerald-800 sm:flex">
      <span className="size-2 rounded-full bg-emerald-500" />In since {a.punchIn ? time.format(new Date(a.punchIn)) : "—"}
      <button disabled={pending} onClick={() => act(punchOut, "Punched out")} className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Punch out</button>
    </div>
  );
  return (
    <button disabled={pending} onClick={() => act(punchIn, "Punched in")}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      title={a.lastEnd === "auto" ? "You were auto logged out after inactivity" : undefined}>
      {a.lastEnd === "auto" ? "Auto logged out · Punch in" : "Punch in"}
    </button>
  );
}
