import { cn } from "@/lib/utils";

const STYLE: Record<string, [string, string]> = {
  new: ["New", "bg-sky-50 text-sky-700 ring-sky-200"],
  in_progress: ["In progress", "bg-amber-50 text-amber-700 ring-amber-200"],
  won: ["Won", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  lost: ["Lost", "bg-rose-50 text-rose-700 ring-rose-200"],
};
export const STATUS_OPTIONS = Object.entries(STYLE).map(([value, [label]]) => ({ value, label }));

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STYLE[status] ?? [status, "bg-slate-100 text-slate-600 ring-slate-200"];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", cls)}>{label}</span>;
}
