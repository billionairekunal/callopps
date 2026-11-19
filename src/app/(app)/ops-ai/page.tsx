import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { OpsChat } from "@/components/ai/OpsChat";

export const maxDuration = 90; // the Ops AI server action runs in this route

export default async function OpsAi() {
  const s = await requireRole("super_admin", "admin");
  const { data: org } = await (await createClient()).from("orgs").select("ai_enabled").single();
  return (
    <>
      <PageHeader title="Ops AI" subtitle="Ask questions about your reports. It sees totals only — never phone numbers, emails or customer names." />
      {org?.ai_enabled ? <OpsChat /> : (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600 shadow-sm">
          <p className="font-medium text-slate-900">Ops AI is turned off.</p>
          <p className="mt-1">When on, report totals (counts, rates and agent names) are sent to Claude to answer questions. Customer details never leave CallOpps.</p>
          {s.role === "super_admin" ? <Link href="/crm-setup" className="mt-3 inline-block text-rose-700 hover:underline">Turn it on in CRM Setup → Security</Link>
            : <p className="mt-3 text-slate-500">Ask your Super Admin to turn it on.</p>}
        </div>
      )}
    </>
  );
}
