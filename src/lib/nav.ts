import {
  LayoutGrid, CalendarClock, ArrowLeftRight, Inbox, ClipboardCheck, BarChart3, Briefcase, CalendarDays,
  Target, Activity, ShieldCheck, Sparkles, MessagesSquare, MessageCircle, MessageSquareText, Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/roles";

export type NavItem = { label: string; href: string; icon: LucideIcon; roles: Role[]; phase: 1 | 2 | 3 | 4 | 5; soon?: string[] };
export type NavSection = { section: "WORKSPACE" | "ANALYTICS & PERFORMANCE" | "COMMUNICATION"; items: NavItem[] };

const ALL: Role[] = ["super_admin", "admin", "team_leader", "caller"];
const MGMT: Role[] = ["super_admin", "admin", "team_leader"];
const ADMINS: Role[] = ["super_admin", "admin"];

export const NAV: NavSection[] = [
  { section: "WORKSPACE", items: [
    { label: "Pipeline / Overview", href: "/pipeline", icon: LayoutGrid, roles: ALL, phase: 3,
      soon: ["Kanban of leads by status: New, In progress, Won, Lost", "Today's summary for your filters"] },
    { label: "Follow-Ups", href: "/follow-ups", icon: CalendarClock, roles: ALL, phase: 3,
      soon: ["Due, overdue and upcoming follow-ups", "One-tap call from the list"] },
    { label: "Lead Transfers", href: "/lead-transfers", icon: ArrowLeftRight, roles: MGMT, phase: 2,
      soon: ["Move leads between callers, one at a time or in bulk", "Full history: who moved what, when and why"] },
    { label: "Lead Management", href: "/leads", icon: Inbox, roles: MGMT, phase: 2,
      soon: ["Lead table with filters", "Lead timeline of calls, outcomes and notes", "Import any CSV or Excel file with auto column detection", "Add a customer by hand"] },
    { label: "My tasks", href: "/my-tasks", icon: ClipboardCheck, roles: ALL, phase: 3,
      soon: ["Your call queue: due follow-ups first, then newest leads", "Tap Call, then save the outcome"] },
  ] },
  { section: "ANALYTICS & PERFORMANCE", items: [
    { label: "Reports and Analytics", href: "/reports", icon: BarChart3, roles: MGMT, phase: 4,
      soon: ["Total, In Progress, Won, Lost, Overdue, Win Rate and more", "Lead funnel, Target vs Achievement, Disposition breakdown", "Attendance summary", "Download as XLSX, CSV or PDF"] },
    { label: "Process Business", href: "/process-business", icon: Briefcase, roles: MGMT, phase: 4,
      soon: ["Breakdown tables per process"] },
    { label: "Daily Reports", href: "/daily-reports", icon: CalendarDays, roles: MGMT, phase: 4,
      soon: ["Per-day, per-agent calls, connected, follow-ups, won and lost"] },
    { label: "Targets", href: "/targets", icon: Target, roles: MGMT, phase: 4,
      soon: ["Monthly targets per agent: Fresh Connected, Follow-up Calls, Presentations, WhatsApp Sent, Leads, Closures"] },
    { label: "Performance", href: "/performance", icon: Activity, roles: ALL, phase: 4,
      soon: ["Agent leaderboard and trends", "Callers see their own numbers"] },
    { label: "QA Audit", href: "/qa-audit", icon: ShieldCheck, roles: ALL, phase: 5,
      soon: ["Score calls and dispositions against a checklist", "Callers see their own scores"] },
  ] },
  { section: "COMMUNICATION", items: [
    { label: "Ops AI", href: "/ops-ai", icon: Sparkles, roles: ADMINS, phase: 5,
      soon: ["Ask questions about your reports", "Off by default; never sees phone numbers or emails"] },
    { label: "Communications", href: "/communications", icon: MessagesSquare, roles: ALL, phase: 5,
      soon: ["Click-to-WhatsApp and SMS, logged on the lead", "Saved message templates"] },
    { label: "Internal Chat", href: "/chat", icon: MessageCircle, roles: ALL, phase: 5,
      soon: ["Team channels and direct messages"] },
    { label: "WhatsApp Reports", href: "/whatsapp-reports", icon: MessageSquareText, roles: MGMT, phase: 5,
      soon: ["WhatsApp actions per agent and per day"] },
    { label: "CRM Setup", href: "/crm-setup", icon: Settings, roles: ADMINS, phase: 1 },
  ] },
];

/** Routes not in the sidebar but role-gated. */
const EXTRA: { href: string; roles: Role[] }[] = [{ href: "/audit-log", roles: ["super_admin"] }];

export const navFor = (role: Role): NavSection[] =>
  NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length);

export const navItem = (href: string) => NAV.flatMap((s) => s.items).find((i) => i.href === href);

export function canAccess(role: Role, pathname: string): boolean {
  const rule = [...NAV.flatMap((s) => s.items), ...EXTRA].find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  return rule ? rule.roles.includes(role) : true;
}

export const homeFor = (role: Role) => (role === "caller" ? "/my-tasks" : "/reports");
