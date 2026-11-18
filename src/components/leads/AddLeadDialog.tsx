"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addLead } from "@/app/(app)/leads/actions";
import type { LeadOptions } from "@/lib/leads/queries";

const sel = "h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

export function AddLeadDialog({ opts }: { opts: LeadOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<{ k: string; v: string }[]>([]);
  const [dup, setDup] = useState<{ form: Record<string, unknown>; id: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (payload: Record<string, unknown>) => start(async () => {
    const r = await addLead(payload);
    if (!r.ok) return void toast.error(r.error);
    if ("duplicateOf" in r.data) return setDup({ form: payload, id: r.data.duplicateOf });
    toast.success("Lead added");
    setOpen(false); setExtra([]); setDup(null);
    router.push(`/leads/${r.data.id}`);
  });

  function onSubmit(f: FormData) {
    const v = (k: string) => String(f.get(k) ?? "").trim();
    submit({
      phone: v("phone"), alt: v("alt") || undefined, name: v("name") || undefined, email: v("email") || undefined, city: v("city") || undefined,
      process_id: v("process_id") || null, product_id: v("product_id") || null, lead_type_id: v("lead_type_id") || null,
      assigned_to: v("assigned_to") || null,
      extra: Object.fromEntries(extra.filter((e) => e.k.trim()).map((e) => [e.k.trim(), e.v])),
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add lead</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDup(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a customer</DialogTitle>
            <DialogDescription>Only the phone number is required.</DialogDescription>
          </DialogHeader>
          {dup ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">This number is already a lead in the same process.</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => router.push(`/leads/${dup.id}`)}>Open existing lead</Button>
                <Button disabled={pending} onClick={() => submit({ ...dup.form, force: true })}>Add anyway</Button>
              </DialogFooter>
            </div>
          ) : (
            <form action={onSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="phone">Phone *</Label><Input id="phone" name="phone" inputMode="tel" required placeholder="98765 43210" /></div>
                <div className="space-y-1.5"><Label htmlFor="alt">Alternate phone</Label><Input id="alt" name="alt" inputMode="tel" /></div>
                <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" /></div>
                <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
                <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" name="city" /></div>
                <div className="space-y-1.5"><Label htmlFor="process_id">Process</Label>
                  <select id="process_id" name="process_id" className={sel}><option value="">None</option>{opts.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="product_id">Product / course</Label>
                  <select id="product_id" name="product_id" className={sel}><option value="">None</option>{opts.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="lead_type_id">Lead type</Label>
                  <select id="lead_type_id" name="lead_type_id" className={sel}><option value="">None</option>{opts.leadTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="assigned_to">Assign to</Label>
                  <select id="assigned_to" name="assigned_to" className={sel}><option value="">Leave unassigned</option>{opts.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Extra fields</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExtra([...extra, { k: "", v: "" }])}><Plus className="size-3.5" />Add field</Button></div>
                {extra.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Field, e.g. Loan amount" value={e.k} aria-label="Field name" onChange={(x) => setExtra(extra.map((y, j) => j === i ? { ...y, k: x.target.value } : y))} />
                    <Input placeholder="Value" value={e.v} aria-label="Field value" onChange={(x) => setExtra(extra.map((y, j) => j === i ? { ...y, v: x.target.value } : y))} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove field" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X className="size-4" /></Button>
                  </div>
                ))}
              </div>
              <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add lead"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
