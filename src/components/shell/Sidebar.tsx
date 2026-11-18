"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { navFor } from "@/lib/nav";
import type { Role } from "@/lib/auth/roles";
import { Logo } from "./Logo";

export function SidebarNav({ role, collapsed = false, unreadChat = 0, onNavigate }: {
  role: Role; collapsed?: boolean; unreadChat?: number; onNavigate?: () => void;
}) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {navFor(role).map((s) => (
        <div key={s.section}>
          {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-slate-500">{s.section}</p>}
          <ul className="space-y-0.5">
            {s.items.map((i) => {
              const active = path === i.href || path.startsWith(i.href + "/");
              const Icon = i.icon;
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={onNavigate} title={collapsed ? i.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      active ? "bg-sidebar-primary text-white shadow-sm shadow-rose-900/40"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
                      collapsed && "justify-center px-0",
                    )}>
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
                    {!collapsed && i.href === "/chat" && unreadChat > 0 && (
                      <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{unreadChat > 99 ? "99+" : unreadChat}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar md:flex", collapsed ? "w-[68px]" : "w-60")}>
      <div className={cn("border-b border-sidebar-border px-4 py-4", collapsed && "px-3")}>
        <Logo collapsed={collapsed} />
      </div>
      <SidebarNav role={role} collapsed={collapsed} />
      <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center justify-center border-t border-sidebar-border py-3 text-slate-400 hover:text-white">
        <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
      </button>
    </aside>
  );
}
