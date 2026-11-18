import { Clock } from "lucide-react";
import { navItem } from "@/lib/nav";
import { PageHeader } from "./PageHeader";

export function ComingSoon({ href }: { href: string }) {
  const item = navItem(href)!;
  return (
    <>
      <PageHeader title={item.label} subtitle={`Coming in phase ${item.phase}`} />
      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Clock className="size-5" /></div>
        <h2 className="font-semibold">What this page will do</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          {item.soon?.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </div>
    </>
  );
}
