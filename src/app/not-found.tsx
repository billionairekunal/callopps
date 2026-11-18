import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <p className="text-5xl font-semibold text-rose-600">404</p>
      <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-slate-500">It may have been removed, or you may not have access to it.</p>
      <Link href="/" className="text-sm font-medium text-rose-600 hover:underline">Go to your home page</Link>
    </div>
  );
}
