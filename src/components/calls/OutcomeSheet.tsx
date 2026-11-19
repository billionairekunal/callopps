"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { outcomeOptions, saveOutcome } from "@/app/(app)/my-tasks/actions";
import { awaySeconds } from "@/lib/calls/time";
import type { DispositionOption } from "@/lib/calls/queries";
import { EVENT, readPending, writePending, type PendingCall } from "./callStore";

const sel = "h-10 w-full rounded-md border border-input bg-white px-2 text-sm";
const pad = (n: number) => String(n).padStart(2, "0");
/** Value for <input type="datetime-local"> in the browser's own time zone. */
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };

/** §8.3: opens as soon as a call starts and is waiting when the caller comes back from the phone app. */
export function OutcomeSheet() {
  const router = useRouter();
  const [call, setCall] = useState<PendingCall | null>(null);
  const [opts, setOpts] = useState<DispositionOption[] | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [disp, setDisp] = useState("");
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const sync = () => setCall(readPending());
    const vis = () => {
      const p = readPending();
      if (!p) return;
      if (document.visibilityState === "hidden") { if (p.hiddenAt == null) writePending({ ...p, hiddenAt: Date.now() }); }
      else if (p.hiddenAt != null) {
        const s = awaySeconds(p.hiddenAt, Date.now());
        if (s != null) setMinutes((m) => m || String(Math.max(1, Math.round(s / 60))));
      }
    };
    sync();
    window.addEventListener(EVENT, sync);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener(EVENT, sync); document.removeEventListener("visibilitychange", vis); };
  }, []);

  useEffect(() => {
    if (call && !opts) outcomeOptions().then((r) => setOpts(r.ok ? r.data : []));
  }, [call, opts]);

  const list = useMemo(() => (opts ?? []).filter((d) => !d.process_id || d.process_id === call?.processId), [opts, call]);

  const reset = () => { setConnected(null); setDisp(""); setNotes(""); setFollowup(""); setMinutes(""); };
  const save = () => start(async () => {
    if (!call || connected == null) return;
    const r = await saveOutcome({
      callId: call.callId, connected, dispositionId: disp || null, notes,
      followupAt: followup ? new Date(followup).toISOString() : null,
      durationS: minutes ? Math.round(Number(minutes) * 60) : null,
    });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Call saved");
    writePending(null); reset(); router.refresh();
  });
  const discard = () => {
    if (!confirm("Discard this call without saving an outcome?")) return;
    writePending(null); reset();
  };

  return (
    <Dialog open={!!call} onOpenChange={() => { /* stays open until saved or discarded */ }}>
      <DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did the call go?</DialogTitle>
          <DialogDescription>Call with {call?.name}. Save the outcome when you hang up.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Connected?</Label>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" onClick={() => setConnected(v)} aria-pressed={connected === v}
                  className={`h-11 rounded-md border text-sm font-medium ${connected === v ? (v ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-rose-600 bg-rose-50 text-rose-800") : "bg-white text-slate-700"}`}>
                  {v ? "Yes, connected" : "No answer / busy"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disp">Disposition{connected ? " *" : ""}</Label>
            <select id="disp" className={sel} value={disp} onChange={(e) => setDisp(e.target.value)}>
              <option value="">{opts ? "Choose…" : "Loading…"}</option>
              {list.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="What did they say?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fu">Next follow-up</Label>
            <input id="fu" type="datetime-local" className={sel} value={followup} min={local(new Date())} onChange={(e) => setFollowup(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {([["In 2 hours", new Date(Date.now() + 7_200_000)], ["Tomorrow 10 am", at(1, 10)], ["In 3 days", at(3, 10)]] as const).map(([l, d]) => (
                <button key={l} type="button" onClick={() => setFollowup(local(d))} className="rounded-full border px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{l}</button>
              ))}
              {followup && <button type="button" onClick={() => setFollowup("")} className="px-2 py-1 text-xs text-slate-500 underline">Clear</button>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dur">Duration (minutes, optional)</Label>
            <input id="dur" type="number" min={0} max={600} inputMode="numeric" className={sel} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            {call?.hiddenAt != null && <p className="text-xs text-slate-500">Filled from the time you were away from the app. Change it if it&apos;s off.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={discard} disabled={pending}>Discard</Button>
          <Button onClick={save} disabled={pending || connected == null || (connected && !disp)}>{pending ? "Saving…" : "Save outcome"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
