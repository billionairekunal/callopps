"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveLookup, deleteLookup } from "@/app/(app)/crm-setup/actions";
import type { LookupTable as Table } from "@/lib/setup/schemas";
import { useAction } from "./useAction";

export type LookupRow = { id: string; name: string; [k: string]: unknown };

/** Generic editable list: inline add, rename, delete with confirm. `extra` renders per-row controls (e.g. a category select). */
export function LookupTable({ table, rows, noun, canEdit, extra, defaults = {} }: {
  table: Table; rows: LookupRow[]; noun: string; canEdit: boolean;
  extra?: (row: LookupRow) => React.ReactNode; defaults?: Record<string, unknown>;
}) {
  const { pending, run } = useAction();
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<LookupRow | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => saveLookup(table, { name: adding, ...defaults }), `${noun} added`)) setAdding("");
  };
  const rename = async () => {
    if (!editing) return;
    const row = rows.find((r) => r.id === editing.id)!;
    const { id, name, ...rest } = row;
    void name;
    if (await run(() => saveLookup(table, { id, name: editing.name, ...pick(rest) }), "Saved")) setEditing(null);
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <ul className="divide-y">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No {noun.toLowerCase()}s yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            {editing?.id === r.id ? (
              <>
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(null); }}
                  className="h-8 max-w-xs" aria-label={`${noun} name`} />
                <Button size="icon" variant="ghost" onClick={rename} disabled={pending} aria-label="Save"><Check className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel"><X className="size-4" /></Button>
              </>
            ) : (
              <span className="min-w-40 flex-1 text-sm font-medium text-slate-800">{r.name}</span>
            )}
            {extra?.(r)}
            {canEdit && editing?.id !== r.id && (
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing({ id: r.id, name: r.name })} aria-label={`Rename ${r.name}`}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setConfirm(r)} aria-label={`Delete ${r.name}`}><Trash2 className="size-4 text-rose-600" /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2 border-t bg-slate-50/60 p-3">
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`New ${noun.toLowerCase()}`} className="h-9 max-w-xs bg-white" aria-label={`New ${noun}`} />
          <Button type="submit" size="sm" disabled={pending || !adding.trim()}><Plus className="size-4" />Add</Button>
        </form>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirm?.name}?</DialogTitle>
            <DialogDescription>This removes the {noun.toLowerCase()} for everyone in your centre.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending}
              onClick={async () => { if (confirm && (await run(() => deleteLookup(table, confirm.id), "Deleted"))) setConfirm(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const KEEP = ["category_id", "team_leader_id", "active"];
const pick = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => KEEP.includes(k)));
