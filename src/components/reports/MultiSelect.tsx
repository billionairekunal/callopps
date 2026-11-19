"use client";
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Opt = { value: string; label: string };

/** Multi-select with search, Select all and Clear (screenshot filter bar). Applies when it closes. */
export function MultiSelect({ label, options, value, onChange }: { label: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState(value);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const text = value.length === 0 ? label : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? "1 selected" : `${value.length} selected`;
  const toggle = (v: string) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) { setDraft(value); setQ(""); }
      else if (draft.join() !== value.join()) onChange(draft);
    }}>
      <PopoverTrigger className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm ${value.length ? "border-rose-300 text-slate-900" : "border-input text-slate-500"}`}>
        <span className="truncate">{text}</span><ChevronDown className="size-4 shrink-0 text-slate-400" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 text-slate-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-sm outline-none" aria-label={`Search ${label}`} />
        </div>
        <div className="flex justify-between border-b px-3 py-1.5 text-xs">
          <button type="button" className="text-rose-700 hover:underline" onClick={() => setDraft([...new Set([...draft, ...shown.map((o) => o.value)])])}>Select all</button>
          <button type="button" className="text-slate-500 hover:underline" onClick={() => setDraft([])}>Clear</button>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
          {shown.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="accent-rose-600" checked={draft.includes(o.value)} onChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
