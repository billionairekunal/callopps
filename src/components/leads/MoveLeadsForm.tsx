"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveLeads } from "@/app/(app)/lead-transfers/actions";

type Person = { user_id: string; full_name: string; open: number };
const sel = "h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

export function MoveLeadsForm({ people }: { people: Person[] }) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [pending, start] = useTransition();
  const open = people.find((p) => p.user_id === from)?.open ?? 0;

  return (
    <form className="space-y-3 rounded-xl border bg-white p-5 shadow-sm" action={(f) => start(async () => {
      const howMany = String(f.get("howMany"));
      const r = await moveLeads({
        fromUser: f.get("from"), toUser: f.get("to"), reason: f.get("reason"),
        limit: howMany === "all" ? null : Math.max(1, Number(f.get("count")) || 1),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.data.moved} lead${r.data.moved === 1 ? "" : "s"} moved`);
      router.refresh();
    })}>
      <h2 className="font-semibold text-slate-900">Move leads</h2>
      <p className="text-sm text-slate-500">Move a caller&apos;s open leads (New and In progress) to someone else, for leave or to balance the work.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="from">From</Label>
          <select id="from" name="from" required className={sel} value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Pick a person</option>
            {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name} ({p.open} open)</option>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="to">To</Label>
          <select id="to" name="to" required className={sel} defaultValue="">
            <option value="">Pick a person</option>
            {people.filter((p) => p.user_id !== from).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select></div>
      </div>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="sr-only">How many</legend>
        <label className="flex items-center gap-2"><input type="radio" name="howMany" value="all" defaultChecked />All {from ? `${open} ` : ""}open leads</label>
        <label className="flex items-center gap-2"><input type="radio" name="howMany" value="some" />The oldest
          <Input name="count" type="number" min={1} defaultValue={50} className="h-8 w-20" aria-label="Number of leads" /></label>
      </fieldset>
      <div className="space-y-1.5"><Label htmlFor="reason">Reason</Label><Input id="reason" name="reason" required placeholder="e.g. On leave this week" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Moving…" : "Move leads"}</Button>
    </form>
  );
}
