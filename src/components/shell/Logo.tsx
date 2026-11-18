import { cn } from "@/lib/utils";

/** CallOpps wordmark: a phone-wave mark + name. `dark` = for light backgrounds. */
export function Logo({ dark, collapsed, className }: { dark?: boolean; collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#e11d48" />
        <path d="M11.6 8.5c.5-.5 1.3-.5 1.8 0l2 2c.5.5.5 1.3 0 1.8l-1.2 1.2a10 10 0 0 0 4.3 4.3l1.2-1.2c.5-.5 1.3-.5 1.8 0l2 2c.5.5.5 1.3 0 1.8l-1.3 1.3c-.9.9-2.3 1.2-3.5.7A16 16 0 0 1 10.2 14c-.5-1.2-.2-2.6.7-3.5z" fill="#fff" />
        <path d="M19 8.5a5 5 0 0 1 4.5 4.5M19 5.5a8 8 0 0 1 7.5 7.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
      {!collapsed && (
        <div className="leading-tight">
          <div className={cn("text-lg font-semibold tracking-tight", dark ? "text-slate-900" : "text-white")}>
            Call<span className="text-rose-500">Opps</span>
          </div>
          <div className={cn("text-[10px]", dark ? "text-slate-500" : "text-slate-400")}>Calling &amp; lead management</div>
        </div>
      )}
    </div>
  );
}
