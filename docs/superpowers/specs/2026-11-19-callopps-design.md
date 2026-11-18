# CallOpps — Design

Date: 2026-11-19 · Status: draft for approval

## 1. Intent

CallOpps is calling and lead-management software for Indian call centres
(first customers: Andromeda, loans, Pimpri; Reliable Communication, which
runs admissions calling for colleges). Owners told us three things decide
whether they adopt it: **their customer data is safe**, **they can load any
lead file fast**, and **they get clear reports**. Reliable already uses a CRM
called EngageOne AI. The owner asked that CallOpps match its screens (layout,
fields, every sidebar section) and beat it on security and import.

Source material:
- `PRD_v0.1_prolead_release1.docx` (requirements S1–S13, D1–D12, R1–R10)
- screenshots of EngageOne in `software_steps/` and `software_steps_2/`

## 2. Goals, non-goals, anti-goals

**Goals**
- Every requirement marked "Must" in the PRD.
- The same information architecture as the screenshots: every sidebar item,
  KPI card, filter, chart, table and report-download option seen there.
- Callers dial from their own phone (web app + `tel:` links). A browser
  dialer comes later, so the code keeps a clean place for it.

**Non-goals for the first release**
- Browser/VoIP dialer, call recording, automatic call duration, native
  mobile app, CRM integrations, scheduled report emails.

**Anti-goals** (it fails even if it technically works)
- Customer phone numbers or emails leak to a caller, to another centre, or
  to an outside AI service without the owner turning it on.
- An owner has to reformat their Excel file before it imports.
- A report number the owner can't explain (every formula is shown).
- Copying EngageOne's name, logo or branding. We copy the layout and
  fields, not the brand. CallOpps has its own name and logo.

## 3. Competitors (what to match, what to beat)

| Product | Strength | Gap CallOpps targets |
|---|---|---|
| EngageOne AI (Reliable's CRM) | Rich analytics hub, disposition breakdowns, branded PDF reports, attendance | No visible import mapping or data-security story |
| TeleCRM | SIM-based calling, WhatsApp, lead capture from 16+ portals; ~₹599–1,099/user/month | Generic, weak reporting reviews |
| LeadSquared | Enterprise depth, strong in education and BFSI | Expensive, heavy to set up for a 20-caller centre |
| Kylas | Flat price, unlimited users, well reviewed | General sales CRM, not built around telecalling outcomes |
| Callyzer | Reads phone call logs (duration, connected) via Android app | A call tracker, not a CRM; no reports at owner level |

What we lead on: no-template import with column auto-detection; field-level
encryption with an activity log the owner can read; win rate with the
formula on screen; data stored in India. Later: an Android wrapper for
automatic call duration (Callyzer's edge), then a browser dialer.

Note: pricing comes from vendor and review sites. Check it with each
vendor before using it in sales material.

## 4. Approaches considered

1. **Next.js + Supabase, both hosted in Mumbai — chosen.** Server code does
   the encryption, file parsing and report building, so keys never reach
   the browser. Supabase does Postgres, auth, two-step login (TOTP), row
   level security and storage.
2. React single-page app + Supabase only. Rejected: encryption and import
   would have to live in Edge Functions, which are harder to build and debug.
3. Flutter web. Rejected: weak for the big tables, import mapping screen and
   dashboards that owners judge us on.

The owner picked option 1.

## 5. Tech stack

- **App:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
  components, lucide icons. Server Actions and Route Handlers hold all
  sensitive logic.
- **Data:** Supabase Postgres (region `ap-south-1`, Mumbai), Supabase Auth
  (email + password, TOTP MFA required for Admins), RLS on every table,
  private Storage bucket for uploaded files.
- **Hosting:** Vercel with functions pinned to `bom1` (Mumbai). Supabase
  network restrictions on, no public direct DB access (S6).
- **Files:** `papaparse` (CSV), `exceljs` (XLSX read/write). PDF reports
  with `@react-pdf/renderer`.
- **Charts:** the funnel and the disposition bars are plain CSS. Recharts
  only for the time-series charts.
- **Tests:** Vitest for pure logic (phone cleaning, column detection, win
  rate, encryption round trip). One SQL script checks RLS per role.
- **Local dev:** Supabase CLI (Docker is installed) runs a local stack. A
  hosted Mumbai project for the pilot is created by the owner (account
  creation is theirs to do).

## 6. Security design (PRD S1–S13)

- TLS everywhere (Vercel/Supabase default, HSTS header) — S1. Supabase
  encrypts the disk and backups with AES-256 — S2.
- **Field-level encryption (S3):** phone and email are encrypted with
  AES-256-GCM in server code. The key comes from an env var
  (`CALLOPPS_DATA_KEY`, rotatable via a key id stored with each value).
  Each value is stored as:
  - `phone_enc`: the ciphertext
  - `phone_hash`: HMAC-SHA256 of the normalised number, used for duplicate
    checks and search
  - `phone_last4`: used for masked display
  - Callers see `•••• •• 4321`. The full number is decrypted only when the
    caller taps Call on a lead assigned to them, and that is logged.
- Passwords: Supabase Auth (bcrypt) — S4. Admin TOTP enforced through
  `aal2` checks in middleware and RLS — S5. Password policy: at least 10
  characters, not on a common-password list.
- Login limits: Supabase rate limits plus a lockout after 5 failures.
  Idle logout after 30 minutes (owners can change this in CRM Setup) — S7.
- `audit_log` table, append-only (no update or delete grants). It records
  logins, lead views, number reveals, imports, exports and setting changes,
  and admins can see it in CRM Setup — S8.
- Roles: `admin`, `team_leader`, `caller`. RLS rules:
  - callers read only leads where `assigned_to = auth.uid()`
  - team leaders read their team's leads
  - admins read everything in their org
  - only admins may import, export or download — S11, S12, R8
- Multi-tenant: every row has `org_id`, and every RLS policy checks it.
- Data export and permanent delete for the whole org (admin, typed
  confirmation) — S13.
- S9 (independent security test) and S10 (breach plan) are process work.
  They are tracked in `docs/security.md`, not in code.
- The public "security" wording sticks to the PRD's approved text. Never
  "unhackable".

## 7. Screens (sidebar = navigation, all items present)

The app shell matches the screenshots:
- **Sidebar:** dark, with the CallOpps logo at the top, three section
  labels, a crimson pill on the active item, an unread badge on Internal
  Chat, and a collapse arrow.
- **Top bar:** breadcrumb, a **Global Search** box (Ctrl+K) searching name,
  last 4 digits or the full number (looked up by hash), a notifications
  bell, and a user menu.

**WORKSPACE**
1. **Pipeline / Overview:** a kanban view of leads by status (New, In
   progress, Won, Lost) for the current filters, plus today's summary.
2. **Follow-Ups:** follow-ups due, overdue and upcoming, with one-tap call.
3. **Lead Transfers:** move leads between callers, singly or in bulk, with
   history (who moved what, when, and why).
4. **Lead Management:** the lead table with filters and columns, lead detail
   with timeline (R7), manual add (D10), **Import** wizard (D1–D9, D12),
   and assign.
5. **My tasks:** the caller's queue: assigned leads to call now, sorted by
   due follow-up then newest. This is the main caller screen. On a phone
   it is the home page.

**ANALYTICS & PERFORMANCE**
6. **Reports and Analytics** (the screenshots' main page). Header: "Reports
   and Analytics — Unified reporting — pipeline, conversion &
   productivity", with a **Download Report** button for admins only.
   - **Filters:** date preset (Today, Yesterday, This week, This Month,
     Last month, Custom), All Processes, All Product Categories, All
     Products, Team Leaders, All Agents, Agent Status, All Statuses, All
     lead types, All Dispositions, Reset. The multi-selects have search,
     Select all and Clear.
   - **KPI cards**, each with "View details ↗" leading to the filtered lead
     list: Total Leads, In Progress, Won, Lost, Overdue, Win Rate, Active
     Agents, Follow-Up Count, Attendance, Due Today.
   - **Lead Funnel:** Total Leads → Touched Follow-up → In Progress → Won,
     with the count and % of total shown.
   - **Follow-ups vs Wins chart.**
   - **Target vs Achievement:** Fresh Connected, Follow-up Calls,
     Presentations, WhatsApp Sent, Leads, Closures. Each shows actual
     against target with a % and a bar; targets are pro-rated over the
     selected range. Plus an "Agent-wise breakdown" expander.
   - **Breakdown filters** (process, disposition) and **Disposition
     Breakdown:** horizontal bars. Clicking a row opens its leads.
   - **Logged-hours stats:** Total Logged Hours, Active Now (in last 15
     min), First Login, Last Activity.
   - **Attendance Summary:** one row per agent per day: Agent, TL, Date,
     Punch In, Punch Out, Last Activity, Duration, Status (Active, Logged
     Out, Auto Logged Out).
   - **Download Report dialog:**
     - Access level: Basic (aggregates, no customer names or numbers) or
       Full Data (customer-level records, admin only, logged)
     - View type: Current View or Detailed View
     - File format: XLSX, CSV or PDF
     - The file is built on the server.
   - **PDF "Analytics Hub Report"**, with the CallOpps logo:
     - cover page with Applied filters
     - breakdowns by Product Category, Product, Agent, Status, Lead Type,
       Process × Disposition and Agent × Disposition
     - every breakdown has the columns Leads, Follow-ups, In Progress, Won,
       Lost, Win Rate, with a Total row
     - page footer
   - **Report history (R5):** saved filter sets with a date, which can be
     reopened.
7. **Process Business:** the same breakdown tables per process (campaign),
   on screen.
8. **Daily Reports:** a per-day, per-agent summary of calls, connected,
   follow-ups, won and lost, for a picked date.
9. **Targets:** admins and TLs set the six target metrics per agent per
   month.
10. **Performance:** agent leaderboard and per-agent trend.
11. **QA Audit:** a TL or admin reviews a sample of calls and dispositions
    and scores them against a checklist, with remarks. The caller sees
    their scores.

**COMMUNICATION**
12. **AI assistant** (named "Ops AI"; the screenshot's "ENARA AI" is their
    brand):
    - answers questions about the reports ("win rate by caller this
      month")
    - turned **off** by default
    - when on, it receives aggregates only, never phone numbers or emails
    - turning it on is an admin setting, and that is logged
13. **Communications:** a log of messages sent to leads (SMS/WhatsApp/email
    templates) and saved templates. First release: click-to-WhatsApp
    (`wa.me` link) and click-to-SMS, recorded as an activity.
14. **Internal Chat:** team chat with channels and direct messages
    (Supabase Realtime), and an unread badge.
15. **WhatsApp Reports:** counts of WhatsApp actions logged per agent and
    per day. This feeds the "WhatsApp Sent" target.
16. **CRM Setup** (admin):
    - organisation details
    - users and roles
    - teams
    - processes (campaigns)
    - product categories and products
    - lead types (Hot, Warm, Cold)
    - dispositions per process, each mapped to an outcome (Won, Lost or
      In progress) and to target flags such as "counts as Presentation"
      (R2)
    - saved import mappings
    - security settings (idle timeout, AI on/off)
    - audit log viewer
    - data export and delete

## 8. Calling flow (phone dialer)

1. A caller opens **My tasks** on their phone and taps a lead.
2. Tapping **Call** logs a `call_started` event, reveals the number on the
   server, and opens `tel:+91XXXXXXXXXX`.
3. When the caller returns to the browser (the `visibilitychange` event),
   an **Outcome sheet** opens on its own. It has:
   - Connected? (yes/no)
   - Disposition: the process's list
   - Notes
   - Next follow-up date and time
   - Duration: an optional manual entry, with a hint from the time spent
     away from the app
4. Saving writes a `calls` row, updates the lead's status and disposition,
   and adds to the timeline.
5. The dialer is an interface (`placeCall(lead)`). Today it is implemented
   with `tel:`; a browser dialer is a second implementation later.

Attendance: the first activity of the day punches the caller in, and
**Punch out** is a button. If there's no activity for 30 minutes, the
caller is auto logged out, and their status is marked "Auto Logged Out".

## 9. Import (PRD D1–D12)

The wizard has five steps:

1. **Upload:** CSV or XLSX, up to 50 MB (raised if the pilot needs more).
   The file goes to private storage.
2. **Detect and map:** columns are matched by header name using synonyms
   (mobile/phone/contact/number…) and by data pattern (a 10-digit Indian
   mobile number is a phone, @ means email, and so on).
   - The owner confirms or changes each match.
   - Columns we don't recognise become extra fields, shown to the caller.
   - A mapping can be saved per source, such as "Bank X list" (D6).
3. **Clean** (D7):
   - remove spaces, dashes and the +91 or 0 prefix
   - check the number is a valid 10-digit mobile starting 6 to 9
   - split cells that hold two numbers into a primary and an alternate
4. **Preview** (D8, D9): counts of OK, invalid, blank-phone, duplicate in
   the file, and duplicate of an existing lead (by `phone_hash`). Each
   group can be imported, skipped or fixed inline.
5. **Import:**
   - rows are inserted in batches, in a server job
   - each import is tagged with its source and date (D12)
   - the result is written to the import log
   - an optional step auto-assigns leads round-robin to the chosen callers

Word tables (D11) come later.

## 10. Data model (core tables)

All tables carry `org_id`, and all have RLS.

- `orgs`, `profiles` (user_id, role, team_id, status), `teams`
  (team_leader_id)
- `processes`, `product_categories`, `products`, `lead_types`
- `dispositions` (process_id, label, outcome won/lost/in_progress, target
  flags)
- `leads`:
  - phone_enc, phone_hash, phone_last4
  - alt_phone fields (same three)
  - name, email_enc, email_hash, city
  - process_id, product_id, lead_type_id
  - status, disposition_id, assigned_to, source_id
  - extra jsonb, next_followup_at
  - created_at, updated_at
- `lead_sources` (name, imported_at, batch)
- `lead_events`, the timeline (type, payload, actor, at)
- `calls` (lead, caller, started_at, connected, duration_s,
  disposition_id, notes)
- `followups` (lead, assignee, due_at, done_at), `tasks`
- `lead_transfers` (from, to, reason, by)
- `targets` (agent, month, metric, value)
- `attendance_sessions` (agent, day, punch_in, punch_out, last_activity,
  end_reason)
- `import_batches`, `import_mappings`
- `qa_audits`, `qa_checklists`
- `chat_channels`, `chat_messages`, `communications`, `message_templates`
- `saved_reports`, `report_exports`, `audit_log`

## 11. Metric definitions (shown as tooltips on each card)

All counts are within the filters and date range.

| Metric | Definition |
|---|---|
| Total Leads | Leads in the filter, counted by created date or activity in range |
| In Progress / Won / Lost | Count of leads by their current status |
| Win Rate | Won ÷ (Won + Lost), shown as a % |
| Overdue | Open follow-ups whose due time has already passed |
| Due Today | Open follow-ups due today |
| Active Agents | Agents with at least one activity in range |
| Follow-Up Count | Calls logged on leads that already had an earlier call |
| Attendance | Agent-days with a punch-in |
| Touched Follow-up (funnel) | Count of follow-up calls |
| Fresh Connected | First connected call on a lead |
| Presentations | Calls whose disposition is flagged "presentation" |
| Leads | New leads created by the agent |
| Closures | Won |

The funnel's "Touched Follow-up" can show more than 100% of total because it
counts calls. That matches EngageOne, and the label says so.

## 12. Build phases (each one shippable)

1. **Foundation:**
   - scaffold, the Supabase schema with RLS, auth with admin MFA
   - the app shell with the full sidebar
   - CRM Setup (users, teams, processes, dispositions, products, lead
     types)
   - the audit log
2. **Leads:**
   - Lead Management: list, detail, timeline, manual add
   - the Import wizard
   - assignment and Lead Transfers
   - Global Search
3. **Calling:** My tasks, the phone dialer with the outcome sheet,
   Follow-Ups, attendance, and Pipeline / Overview.
4. **Reports:**
   - Reports and Analytics in full: filters, KPIs, funnel, targets,
     disposition breakdown, attendance
   - the Download dialog (XLSX, CSV, PDF) and report history
   - Process Business, Daily Reports, Targets, Performance
5. **Quality and communication:** QA Audit, Internal Chat, Communications,
   WhatsApp Reports, and the AI assistant.

Until its phase lands, a sidebar item opens a real page that says what is
coming. No dead links.

## 13. PRD requirements in scope

The PRD lives at `C:\Users\Admin\Downloads\PRD_v0.1_prolead_release1.docx`.

- **Must:** S1–S12, D1–D5, D7–D10, R1–R9.
- **Should:** S13, D6, D12.
- **Later:** D11 (Word tables), R10 (scheduled reports and custom reports).

The reports requirements, for reference:
- R1: lead statuses New, In progress, Won and Lost.
- R3: KPI cards with the win-rate formula shown.
- R4: filters by date, caller, team, source and city. Add Source and City
  to the filter bar.
- R6: Excel download.
- R9: every download is logged.

## 14. Decisions from the review (builder's calls unless marked)

- **Screens with no screenshot.** Only Reports and Analytics and the
  download/PDF flow were filmed. We design the other 14 sidebar pages
  ourselves in the same visual language: the same shell, card style,
  filter bar and table style.
- **Status logic.**
  - A lead is **New** until its first call is saved.
  - After that, its status follows its latest disposition's outcome.
  - Every change is written to `lead_status_history`.
- **Counting in reports.**
  - Total Leads = leads created in the range.
  - In Progress / Won / Lost = leads whose current status is that value
    and whose last status change falls in the range.
  - So the cards can add up to more than Total Leads (EngageOne's do too),
    and the tooltip explains why.
  - Report history replays the status history "as of" a saved date.
- **Sensitive columns.**
  - On the import mapping screen, the owner can tick any column as
    **Sensitive**, for example PAN, Aadhaar, income or address.
  - Sensitive columns are encrypted like phone numbers, hidden from callers,
    and included only in Full Data exports.
  - Admins and TLs can tap to reveal a number on screen, and each reveal is
    logged.
- **Tenancy and keys.**
  - One shared system for many centres, with a platform-operator role that
    creates centres and their first admin. There is no public sign-up.
  - Each org gets its own data key and hash key. Both are wrapped by one
    master key held in an env var.
  - Duplicate checks run per org. Duplicates in other processes are flagged,
    not blocked, because an admissions centre may call the same student for
    several colleges.
- **Activity and auto logout.**
  - Activity means any app request or a saved call. The time between Call
    and saving the outcome counts as active.
  - "Auto Logged Out" closes the attendance session only; the login stays.
    A separate idle sign-out comes from the same setting, default 30 min.
  - A `pg_cron` job closes stale sessions every 5 minutes.
- **Import runtime.**
  - The file is parsed **in the browser** (papaparse/exceljs).
  - The server receives rows in chunks of 500. It cleans, encrypts and
    inserts them, so no single function call holds a 50 MB file.
- **Hosting tiers (owner to confirm cost).** Supabase Pro (~$25/month) and
  Vercel Pro (~$20/month). Vercel's Hobby plan forbids commercial use.
  Local development needs neither.
- **Write rules.**
  - Admins assign and transfer any lead. TLs do it within their own team.
  - Callers can only request a transfer.
  - TLs can also hold and call leads.
  - Callers see only the processes their team is linked to.

## 15. Owner decisions (2026-11-19)

- **Phone dialer accepted for release 1.** Numbers stay in callers' phone
  call history. Masked calling comes with the browser dialer later.
- **Super Admin role.** Each centre has a `super_admin` (the owner), and
  only Super Admins see everything:
  - every call and every lead
  - full phone numbers and sensitive fields, unmasked
  - the audit log, and Full Data exports
- **The other roles:**
  - `admin` keeps setup, import, assignment and Basic reports, but sees
    numbers masked.
  - TLs and callers stay as described in section 14.
- **Platform operator.** A separate role, run by us, that only creates
  centres and can't read their leads.

## 16. Left to the builder

- Folder structure, component split, and exact query and SQL-view shapes.
- Seed data: a demo org with fake admissions-style leads, used for
  development and demos.
- Exact colours (a dark navy sidebar and a crimson accent, matching the
  look of the screenshots) and spacing.
