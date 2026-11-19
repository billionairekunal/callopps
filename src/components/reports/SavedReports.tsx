"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saveReport, deleteReport } from "@/app/(app)/reports/actions";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

/** Report history (R5): saved filter sets with their dates, reopened by link. */
export function SavedReports({ saved, query }: { saved: { id: string; name: string; query: string; created_at: string }[]; query: string }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><History className="size-4" />Report history</PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await saveReport(name, query);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved"); setName("");
        }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view, e.g. Oct SGI" maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-md border px-2 text-sm" aria-label="Report name" />
          <button disabled={pending || !name.trim()} className="h-8 rounded-md bg-slate-900 px-3 text-sm text-white disabled:opacity-50">Save</button>
        </form>
        <ul className="max-h-72 overflow-y-auto">
          {saved.length === 0 && <li className="py-2 text-sm text-slate-500">No saved reports yet.</li>}
          {saved.map((s) => (
            <li key={s.id} className="flex items-center gap-2 border-t py-1.5 first:border-0">
              <Link href={`/reports?${s.query}`} className="min-w-0 flex-1 hover:text-rose-700">
                <div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-slate-500">Saved {fmt.format(new Date(s.created_at))}</div>
              </Link>
              <button aria-label={`Delete ${s.name}`} onClick={() => start(async () => { await deleteReport(s.id); })} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
