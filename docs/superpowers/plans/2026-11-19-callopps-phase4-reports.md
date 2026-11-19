# CallOpps Phase 4 — Reports

Spec: §7 items 6–10, §11 metric definitions, §14 counting rules, §15 (Full Data = Super Admin only). Screenshots:
`software_steps/` (dashboard) and `software_steps_2/` (download dialog and PDF).

## Decisions
- **One reporting engine.** `public.report_data(f jsonb)`: a service-role-only SQL function that returns every
  aggregate as JSON (KPIs, funnel, daily series, grouped breakdowns via GROUPING SETS, per-agent activity,
  attendance per agent-day, logged hours, disposition breakdown). The server computes the user's scope (super admin
  and admin: whole org; TL: their team; caller: themself) and passes it in. No lead rows leave the database for
  Basic reports.
- **Counting (§11, §14):** Total Leads = created in range. In Progress/Won/Lost = current status and last status
  change in range. Overdue / Due Today = open leads by `next_followup_at` (now, not range). Follow-Up Count = saved
  calls with `is_followup` in range. Attendance = agent-days with a punch-in. Active Agents = agents with a saved call
  or attendance in range.
- **Targets:** `targets(org, user, month, metric, value)`. Actuals per agent: Fresh Connected (first connected call
  on a lead), Follow-up Calls, Presentations (disposition flagged), WhatsApp Sent (0 until Phase 5), Leads (leads
  created in range assigned to the agent), Closures (status → Won by the agent). Targets are pro-rated by days of
  the range inside each month.
- **Downloads:** route handler `POST /api/reports/download`, built on the server. Basic (aggregates; admins and super
  admins) or Full Data (customer rows with numbers; super admin only). Current View = standard tables/columns;
  Detailed View = all breakdowns, daily series, attendance / all lead columns incl. extra and sensitive fields.
  XLSX (exceljs, one sheet per table), CSV (one file; sections stacked), PDF (jsPDF + autotable, "Analytics Hub
  Report" with cover + applied filters + breakdowns + footer). PDF of Full Data over 2,000 rows is refused.
  Every download goes to `report_exports` and the audit log (R9).
- **Report history (R5):** saved filter sets with the resolved date range, reopened by link. The "as of" replay of
  status history (§14) is deferred.
- Process Business, Daily Reports, Performance reuse `report_data`.
