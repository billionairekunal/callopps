"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType, Loader2, Lock, BarChart3, Table2, ListTree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Access = "basic" | "full"; type View = "current" | "detailed"; type Format = "xlsx" | "csv" | "pdf";

function Choice({ on, onClick, icon: Icon, title, text, disabled }: { on: boolean; onClick: () => void; icon: typeof Lock; title: string; text: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={on}
      className={`w-full rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-rose-500 bg-rose-50/60 ring-1 ring-rose-500" : "hover:bg-slate-50"}`}>
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900"><Icon className="size-4 text-rose-700" />{title}</div>
      <p className="mt-0.5 text-xs text-slate-500">{text}</p>
    </button>
  );
}

/** Download Report dialog (screenshots 03–05): access level, view type, format; the file is built on the server. */
export function DownloadDialog({ query, canFull }: { query: string; canFull: boolean }) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<Access>("basic");
  const [view, setView] = useState<View>("current");
  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const r = await fetch("/api/reports/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, access, view, format }) });
      if (!r.ok) return void toast.error((await r.json().catch(() => null))?.error ?? "The download failed. Try again.");
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `report.${format}`;
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Report downloaded"); setOpen(false);
    } catch { toast.error("Could not reach the server. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-rose-700 text-white hover:bg-rose-800"><Download className="size-4" />Download Report</Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Download Report</DialogTitle>
            <DialogDescription>Server-generated from the Analytics Hub data — admins only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <fieldset className="space-y-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Access level *</legend>
              <Choice on={access === "basic"} onClick={() => setAccess("basic")} icon={BarChart3} title="Basic Report"
                text="Management reporting: KPIs, funnel, follow-up counts and every breakdown with Won / Lost / Win Rate. No customer names or phone numbers." />
              <Choice on={access === "full"} onClick={() => setAccess("full")} icon={Lock} title="Full Data" disabled={!canFull}
                text={canFull ? "Adds customer-level records including phone numbers. Every Full Data download is logged." : "Customer-level records — Super Admin only."} />
            </fieldset>
            <fieldset><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">View type *</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice on={view === "current"} onClick={() => setView("current")} icon={Table2} title="Current View" text="The records matching the current filters with the standard report columns." />
                <Choice on={view === "detailed"} onClick={() => setView("detailed")} icon={ListTree} title="Detailed View" text="The complete detailed dataset with all exportable columns." />
              </div>
            </fieldset>
            <fieldset><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">File format *</legend>
              <div className="grid grid-cols-3 gap-2">
                {([["xlsx", "XLSX", FileSpreadsheet], ["csv", "CSV", FileText], ["pdf", "PDF", FileType]] as const).map(([v, l, I]) => (
                  <button key={v} type="button" onClick={() => setFormat(v)} aria-pressed={format === v}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm ${format === v ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-slate-50"}`}><I className="size-4" />{l}</button>
                ))}
              </div>
              {format === "pdf" && <p className="mt-2 text-xs text-slate-500">PDF carries the KPIs and aggregate breakdowns. Very large Full Data sets are refused — use XLSX or CSV for those.</p>}
            </fieldset>
            {busy && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" />Generating your report on the server. Keep this dialog open.</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={download} disabled={busy} className="bg-rose-700 text-white hover:bg-rose-800">{busy ? "Generating…" : "Download"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
