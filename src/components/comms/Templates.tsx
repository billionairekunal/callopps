"use client";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplate, deleteTemplate } from "@/app/(app)/communications/actions";

export function Templates({ templates, canEdit }: { templates: { id: string; name: string; channel: string; body: string }[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Message templates</h2>
      <p className="mb-4 text-xs text-slate-500">Placeholders: {"{name}"} (the lead), {"{agent}"} (the person sending), {"{centre}"}.</p>
      <ul className="mb-4 divide-y">
        {templates.length === 0 && <li className="py-2 text-sm text-slate-500">No templates yet.</li>}
        {templates.map((t) => (
          <li key={t.id} className="flex items-start gap-3 py-2.5">
            <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.channel === "whatsapp" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{t.channel === "whatsapp" ? "WhatsApp" : "SMS"}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-900">{t.name}</div><p className="whitespace-pre-wrap text-sm text-slate-600">{t.body}</p></div>
            {canEdit && <button aria-label={`Delete ${t.name}`} disabled={pending} onClick={() => start(async () => { const r = await deleteTemplate(t.id); if (!r.ok) toast.error(r.error); })} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="size-4" /></button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_9rem]" action={(f) => start(async () => {
          const r = await saveTemplate({ name: f.get("name"), channel: f.get("channel"), body: f.get("body") });
          if (r.ok) toast.success("Template added"); else toast.error(r.error);
        })}>
          <Input name="name" placeholder="Template name, e.g. Admission follow-up" required maxLength={80} />
          <select name="channel" className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
          <Textarea name="body" required maxLength={1000} rows={3} className="sm:col-span-2" placeholder="Hi {name}, this is {agent} from {centre}…" />
          <Button disabled={pending} className="sm:col-span-2 sm:justify-self-end">Add template</Button>
        </form>
      )}
    </section>
  );
}
