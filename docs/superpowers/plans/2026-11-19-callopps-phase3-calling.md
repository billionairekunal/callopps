# CallOpps Phase 3 — Calling

Spec: `docs/superpowers/specs/2026-11-19-callopps-design.md` §7 (items 1, 2, 5), §8, §14 (status logic, activity), §15.

## Scope
My tasks (caller queue + lead panel), phone dialer (`tel:`) with the outcome sheet, Follow-Ups, attendance
(auto punch-in, Punch out, auto logout via pg_cron), Pipeline / Overview.

## Decisions
- **No `followups` table.** The open follow-up of a lead is `leads.next_followup_at` (set or cleared on every saved
  call). Overdue / Due Today read it directly; Follow-Up Count reads `calls`. Add a table only if multiple open
  follow-ups per lead are ever needed.
- **Calls visibility (§15):** `super_admin` reads every call; team leaders their team's; callers their own.
  `admin` gets no call rows (reports in Phase 4 use server-side aggregates).
- **Who can call:** the lead's assignee (caller or TL), or a super admin. The server reveals the number only to them,
  writes a `calls` row (pending) and a `call_started` event, and audits `call.start`.
- **Status:** saved call with a disposition → the disposition's outcome; without one → `in_progress`. Changes go to
  `lead_status_history`. Disposition is required when connected.
- **Attendance:** callers and TLs. Every app page load and call action calls `app.touch_attendance`: it auto-closes a
  stale open session (`end_reason='auto'`, punch_out = last_activity), updates the open one, or opens a new one —
  except after a manual Punch out today (then the user taps Punch in). A pg_cron job runs
  `app.close_stale_attendance()` every 5 minutes; the touch also does it lazily, so it is correct without cron.
- **Dialer interface:** `Dialer.placeCall(phone)`; `telDialer` today, browser dialer later.

## Tasks
1. Migration `..08_calling.sql`: `calls`, `attendance_sessions`, RLS, `touch_attendance`, `close_stale_attendance`,
   pg_cron schedule. RLS tests in `tests/rls/calling.test.ts`.
2. `src/lib/calls/service.ts` (startCall, saveOutcome, statusFor) with vitest fakes; repo + actions.
3. `src/lib/dialer.ts`, `OutcomeSheet` (visibilitychange, sessionStorage recovery, duration hint).
4. Pages: My tasks, Follow-Ups, Pipeline; nav phases updated; caller lead panel.
5. Attendance: layout touch, TopBar punch chip + Punch in/out actions.
6. Browser check as caller and super admin; final review; fixes; merge.
