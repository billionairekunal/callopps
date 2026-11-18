import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { leadOptions } from "@/lib/leads/queries";
import { PageHeader } from "@/components/shell/PageHeader";
import { ImportWizard } from "@/components/import/ImportWizard";

export default async function ImportPage() {
  await requireRole("super_admin", "admin");
  const opts = await leadOptions();
  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Lead Management</Link>
      <PageHeader title="Import leads" subtitle="Any CSV or Excel file. No fixed template: we detect the columns, you confirm." />
      <ImportWizard processes={opts.processes} people={opts.people} />
    </>
  );
}
