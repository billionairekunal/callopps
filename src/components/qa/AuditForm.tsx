"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveAudit } from "@/app/(app)/qa-audit/actions";
import { scoreOf, type Answer, type Item } from "@/lib/qa/service";

const OPTS: [Answer, string, string][] = [["pass", "Pass", "border-emerald-600 bg-emerald-50 text-emerald-800"], ["fail", "Fail", "border-rose-600 bg-rose-50 text-rose-800"], ["na", "N/A", "border-slate-500 bg-slate-100 text-slate-700"]];

export function AuditForm({ callId, title, items }: { callId: string; title: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<Record<string, Answer>>({});
  const [remarks, setRemarks] = useState("");
  const [pending, start] = useTransition();
  const done = items.every((i) => scores[i.id]);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Audit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Audit call</DialogTitle><DialogDescription>{title}</DialogDescription></DialogHeader>
          <ol className="space-y-3">
            {items.map((it, n) => (
              <li key={it.id}>
                <p className="mb-1 text-sm text-slate-800">{n + 1}. {it.label}</p>
                <div className="flex gap-1.5">
                  {OPTS.map(([v, l, on]) => (
                    <button key={v} type="button" aria-pressed={scores[it.id] === v} onClick={() => setScores({ ...scores, [it.id]: v })}
                      className={`h-8 rounded-md border px-3 text-xs font-medium ${scores[it.id] === v ? on : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <Textarea aria-label="Remarks" rows={3} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks for the caller (what went well, what to improve)" />
          <DialogFooter className="items-center gap-3">
            <span className="text-sm text-slate-600">Score: <b>{scoreOf(items, scores)}%</b></span>
            <Button disabled={!done || pending} onClick={() => start(async () => {
              const r = await saveAudit({ callId, scores, remarks });
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Saved · ${r.data.score}%`); setOpen(false);
            })}>{pending ? "Saving…" : "Save audit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
