"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveChecklist } from "@/app/(app)/qa-audit/actions";

export function ChecklistEditor({ items }: { items: { label: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <form action={(f) => start(async () => { const r = await saveChecklist(String(f.get("items") ?? "")); if (r.ok) toast.success("Checklist saved"); else toast.error(r.error); })}>
      <Textarea name="items" rows={8} defaultValue={items.map((i) => i.label).join("\n")} aria-label="Checklist items, one per line" />
      <div className="mt-2 flex items-center justify-between"><p className="text-xs text-slate-500">One item per line. Each is scored Pass, Fail or N/A.</p><Button size="sm" disabled={pending}>Save checklist</Button></div>
    </form>
  );
}
