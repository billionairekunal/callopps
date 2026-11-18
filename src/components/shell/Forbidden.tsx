import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export function Forbidden() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
      <ShieldAlert className="mx-auto size-10 text-rose-600" />
      <h1 className="mt-3 text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-slate-500">Error 403. Ask your Super Admin if you need it.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-rose-600 hover:underline">Go to your home page</Link>
    </div>
  );
}
