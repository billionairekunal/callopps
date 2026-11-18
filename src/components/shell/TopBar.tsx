"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { navFor, NAV } from "@/lib/nav";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { logout } from "@/app/(auth)/login/actions";
import { SidebarNav } from "./Sidebar";
import { Logo } from "./Logo";

export function TopBar({ role, fullName }: { role: Role; fullName: string }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const page = NAV.flatMap((s) => s.items).find((i) => path === i.href || path.startsWith(i.href + "/"))?.label
    ?? (path.startsWith("/audit-log") ? "Audit Log" : "");
  const initials = fullName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "U";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur md:px-6">
      <button className="md:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu className="size-5" /></button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <span className="font-medium text-slate-900">{ROLE_LABEL[role]}</span>
        <span className="text-slate-300">/</span>
        <span className="truncate text-slate-500">{page}</span>
      </nav>
      <button onClick={() => setSearch(true)}
        className="mx-auto flex w-full max-w-md items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-1.5 text-sm text-slate-400 shadow-sm hover:border-rose-300">
        <Search className="size-4 text-slate-500" />
        <span className="font-medium text-slate-700">Global Search</span>
        <span className="hidden truncate sm:inline">Search leads…</span>
        <kbd className="ml-auto rounded border border-rose-200 px-1.5 text-[10px] text-rose-500">Ctrl K</kbd>
      </button>
      <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
        <Bell className="size-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none">
          <span className="flex size-8 items-center justify-center rounded-full bg-rose-600 text-xs font-semibold text-white">{initials}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-sm font-medium text-slate-900">{fullName}</span>
            <span className="block text-[11px] text-slate-500">{ROLE_LABEL[role]}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout()}><LogOut className="size-4" />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="flex w-64 flex-col border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="border-b border-sidebar-border p-4"><Logo /></div>
          <SidebarNav role={role} onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>

      <CommandDialog open={search} onOpenChange={setSearch} title="Global Search" description="Search leads and pages">
        <CommandInput placeholder="Search leads by name or number, or jump to a page…" />
        <CommandList>
          <CommandEmpty>Lead search arrives with Lead Management (phase 2).</CommandEmpty>
          <CommandGroup heading="Pages">
            {navFor(role).flatMap((s) => s.items).map((i) => (
              <CommandItem key={i.href} onSelect={() => { setSearch(false); router.push(i.href); }}>
                <i.icon className="size-4" />{i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
