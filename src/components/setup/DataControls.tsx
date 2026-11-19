"use client";
import { useState, useTransition } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { purgeCustomerData } from "@/app/(app)/crm-setup/actions";

/** S13: export everything, or permanently delete customer data (Super Admin only). */
export function DataControls({ orgName }: { orgName: string }) {
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const phrase = `DELETE ${orgName}`;

  async function exportAll() {
    setExporting(true);
    try {
      const r = await fetch("/api/data/export", { method: "POST" });
      if (!r.ok) return void toast.error((await r.json().catch(() => null))?.error ?? "Export failed.");
      const url = URL.createObjectURL(await r.blob());
      Object.assign(document.createElement("a"), { href: url, download: `callopps-export-${new Date().toISOString().slice(0, 10)}.zip` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Export downloaded. It contains full phone numbers: store it securely.");
    } catch { toast.error("Could not reach the server."); } finally { setExporting(false); }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 text-sm shadow-sm">
      <div>
        <p className="font-medium text-slate-900">Export all data</p>
        <p className="mb-2 text-xs text-slate-500">Every lead (with full numbers), call, message, audit, attendance and setting, one CSV per table in a ZIP. Logged.</p>
        <Button variant="outline" size="sm" onClick={exportAll} disabled={exporting}><Download className="size-4" />{exporting ? "Preparing…" : "Export all data"}</Button>
      </div>
      <div className="border-t pt-4">
        <p className="font-medium text-rose-700">Delete all customer data</p>
        <p className="mb-2 text-xs text-slate-500">Permanently removes every lead and everything about them: calls, messages, timelines, QA audits and imports. Users, teams and setup stay. Export first.</p>
        <Button variant="outline" size="sm" className="border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => { setTyped(""); setOpen(true); }}><Trash2 className="size-4" />Delete customer data…</Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete all customer data?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Every lead, call, message and audit in {orgName} is deleted permanently.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm">Type <span className="font-mono font-semibold">{phrase}</span> to confirm
            <Input className="mt-1.5" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Confirmation phrase" /></label>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button className="bg-rose-700 text-white hover:bg-rose-800" disabled={pending || typed.trim() !== phrase} onClick={() => start(async () => {
              const r = await purgeCustomerData(typed);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Deleted ${r.data.leads.toLocaleString("en-IN")} leads and their history.`); setOpen(false);
            })}>{pending ? "Deleting…" : "Delete permanently"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
