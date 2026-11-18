# CallOpps Phase 2: Leads and Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lead Management with encrypted phone numbers and emails, role-scoped
visibility, a no-template CSV and Excel import with auto-detection, manual add,
assignment, Lead Transfers, and Global Search.

**Architecture:**
- **Pure modules**, unit tested: phone cleaning, column detection, preview
  and dedupe, lead row building, and search routing.
- **Encryption** of fields happens only in server actions.
- **Visibility** is enforced by RLS on `leads`:
  - Callers see only leads assigned to them, in processes their team works.
  - Team leaders see their team's leads.
  - Super Admins and Admins see every lead in the org.
- **Import:** files are parsed in the browser. Rows go to the server in
  chunks of 500.

**Tech Stack:** Phase 1 stack plus `papaparse` (CSV) and `exceljs` (XLSX,
loaded on the client with a dynamic import).

**Spec:** `docs/superpowers/specs/2026-11-19-callopps-design.md`. The
relevant sections are §7 items 1, 3 and 4, §9, §10, §14 and §15.

## Global Constraints

- **Only `super_admin` sees unmasked phone numbers, emails and Sensitive
  fields** (spec §15).
  - Everyone else sees phones as `•••• •• 1234` and email as `a•••@domain`.
  - Each page where a Super Admin sees unmasked data writes the audit row
    `lead.view_unmasked`.
- **Only `super_admin` and `admin` can:**
  - import (D12)
  - add a lead
  - assign or delete leads
- **Transfers:** a team leader can transfer only within their team.
- **Required fields:** only the phone (D4).
- **What counts as a valid number:** after cleaning, an Indian mobile number
  is `^[6-9]\d{9}$`.
- **Phone cleaning:**
  - strip spaces, `-`, `.`, `(` and `)`
  - remove the prefixes `+91`, `0091`, `91` (only when 12 digits) and a
    leading `0` (only when 11 digits)
  - split a cell on `/`, `,`, `;` or `|`, or when it holds two 10-digit
    runs; the first part is the primary number, the second the alternate
- **Duplicates** are checked per org by `phone_hash`.
  - A duplicate of an existing lead **in the same process** is offered as
    skip (the default) or import anyway.
  - A duplicate in a different process is only a flag; it imports by default.
- **Columns:**
  - Unknown columns go to `extra` (jsonb, plain text, shown to callers) —
    D5.
  - Columns ticked "Sensitive" go to `sensitive_enc`: one AES-GCM blob of a
    JSON object, visible to Super Admins only.
- **Every import** creates a `lead_sources` row named by the owner, for
  example "Bank X list 19 Nov" (D12).
- **Saved mappings:** one per source name (D6). A new file whose headers
  match a saved mapping preselects it.
- **Status values:** `new`, `in_progress`, `won`, `lost`. Every lead starts
  as `new`, and every status change writes `lead_status_history`.
- **Same-org references:** every reference column on `leads` (process,
  product, lead type, source, assignee) must belong to the same org. This
  closes the Phase 1 review minor about cross-org ids.

## Review Focus

1. **A caller pasting another lead's id into `/leads/<id>`:** they get the
   403 page, and RLS returns no row.
2. **A file of 20,000 rows:**
   - the browser parses it without freezing; it shows progress
   - chunks are sent one after another
   - a failed chunk is reported with its row range, and the rows already
     imported stay imported
3. **Excel cells that hold numbers as numbers** (`9876543210` or
   `9.87654321E9`): they still clean to the right 10 digits.
4. **Header row variants:**
   - blank headers become `Column N`
   - duplicate headers get suffixes
   - a header row that isn't the first row is not attempted (the owner picks
     the header row number, default 1)
5. **A team leader transferring a lead to someone outside their team:** it's
   rejected by the action and by RLS.

---

### Task 1: Leads schema and RLS

**Files:**
- Create: `supabase/migrations/20261119000005_leads.sql`
- Modify: `tests/rls/helpers.ts` (add a `makeLead` helper that uses the
  service client), `tests/rls/rls.test.ts`

**Interfaces:**
- **Same-org keys:** add `unique (id, org_id)` to `teams`, `processes`,
  `products`, `product_categories`, `lead_types` and `lead_sources`. Then
  add composite FKs `(x_id, org_id)` from `leads`, `products.category_id`,
  `team_processes`, `profiles.team_id` and `dispositions.process_id`.
- **Tables:**
  - `lead_sources(id, org_id, name, created_by, created_at)`
  - `leads(id uuid pk, org_id, phone_enc text not null, phone_hash text not
    null, phone_last4 text not null, alt_phone_enc, alt_phone_hash,
    alt_phone_last4, name text, email_enc, email_hash, email_mask, city,
    process_id, product_id, lead_type_id, source_id, status text not null
    default 'new' check in (new, in_progress, won, lost), disposition_id,
    assigned_to uuid, extra jsonb not null default '{}', sensitive_enc
    text, next_followup_at timestamptz, created_by, created_at, updated_at)`
    - indexes: `(org_id, phone_hash)`, `(org_id, assigned_to)`,
      `(org_id, status)`, `(org_id, created_at desc)`, and a trigram index
      on `name` via `pg_trgm`
  - `lead_events(id bigserial, org_id, lead_id, type text, payload jsonb,
    actor_id, at)`
  - `lead_status_history(id bigserial, org_id, lead_id, from_status,
    to_status, disposition_id, actor_id, at)`
  - `lead_transfers(id bigserial, org_id, lead_id, from_user, to_user,
    reason, by_user, at)`
  - `import_mappings(id, org_id, source_name, headers text[], mapping
    jsonb, updated_at)`, with `unique(org_id, source_name)`
  - `import_batches(id, org_id, source_id, file_name, total int, imported
    int, skipped int, invalid int, status text, created_by, created_at)`
- **Helpers:**
  - `app.team_member_ids() returns setof uuid`: the active profiles in the
    caller's team
  - `app.my_process_ids() returns setof uuid`: processes linked to the
    caller's team
- **RLS on `leads` (select):** `org_id = app.org_id()` and any one of:
  - `app.is_role('super_admin','admin')`
  - `app.is_role('team_leader')` and (`assigned_to = auth.uid()` or
    `assigned_to in (select app.team_member_ids())`)
  - `app.is_role('caller')` and `assigned_to = auth.uid()` and
    (`process_id is null` or `process_id in (select app.my_process_ids())`)
- **RLS on `leads` (insert/delete):** `super_admin` and `admin` only.
- **RLS on `leads` (update):**
  - `super_admin` and `admin`: any lead in the org.
  - `team_leader`: leads they can see, with the check `assigned_to is null`
    or `assigned_to in (team_member_ids() ∪ self)`.
- **Child tables** (`lead_events`, `lead_status_history`, `lead_transfers`):
  select when the parent lead is visible (`exists (select 1 from leads l
  where l.id = lead_id)`). No client writes: the server writes them with the
  service client after `requireRole`.
- **`import_mappings`, `import_batches`, `lead_sources`:** read and write
  for `super_admin` and `admin`. `lead_sources` is also readable by all
  members.

- [ ] **Step 1: Add failing RLS tests**
  - `caller sees only own assigned leads`
  - `caller does not see own lead in a process outside their team`
  - `team leader sees team leads, not other team's`
  - `admin sees all org leads; other org admin sees none`
  - `caller cannot insert or update leads`
  - `team leader cannot reassign lead to someone outside team`
  - `cross-org process_id on lead insert is rejected` (the composite FK
    raises error 23503)
- [ ] **Step 2:** Run `npm run test:rls`. Expected: FAIL.
- [ ] **Step 3:** Write the migration, then run `npx supabase db push`.
- [ ] **Step 4:** Run `npm run test:rls`. Expected: all pass.
- [ ] **Step 5:** Commit with the message `feat: leads schema with
  role-scoped RLS and same-org keys`.

### Task 2: Pure lead logic

**Files:**
- Create: `src/lib/leads/phone.ts`, `src/lib/leads/detect.ts`,
  `src/lib/leads/preview.ts`, `src/lib/leads/row.ts`,
  `src/lib/leads/search.ts`
- Test: one test file under `tests/leads/` for each module

**Interfaces:**
- `cleanPhone(raw: unknown): { primary: string | null; alternate: string |
  null; valid: boolean; reason?: 'blank' | 'too_short' | 'too_long' |
  'not_mobile' }`
- `type Field = 'phone' | 'alt_phone' | 'name' | 'email' | 'city' |
  'process' | 'product' | 'lead_type' | 'extra' | 'ignore'`
- `normalizeHeaders(raw: unknown[]): string[]`: blank headers become
  `Column N`, and duplicates become `Name (2)`.
- `detectColumns(headers: string[], sample: string[][]): Record<string,
  Field>`. Header synonyms are checked first, then the data pattern of the
  first 50 rows:
  - a header matching `mobile|phone|contact|cell|number|mob` →
    `phone`; a second such column → `alt_phone`
  - `name|customer|student|candidate|full name` → `name`
  - `email|e-mail|mail` → `email`
  - `city|town|location|district` → `city`
  - `process|campaign|college|client` → `process`
  - `course|product|program|programme` → `product`
  - `lead type|temperature|priority|hot/warm` → `lead_type`
  - **Pattern:** a column where 60% or more of the non-blank samples pass
    `cleanPhone(...).valid` → `phone` (or `alt_phone` if `phone` is already
    taken). A column where 60% or more match an email regex → `email`.
  - Anything else → `extra`.
- `buildPreview(rows: string[][], headers: string[], mapping:
  Record<string, Field>, existing: Map<string /*phone*/, { processName:
  string | null }>, targetProcess: string | null): PreviewRow[]`
  - `PreviewRow = { index: number; phone: string | null; alt: string |
    null; status: 'ok' | 'invalid' | 'blank' | 'dup_file' | 'dup_existing'
    | 'dup_other_process'; reason?: string; values: Record<string, string>
    }`
  - The first occurrence of a phone in the file wins, and later ones are
    `dup_file`.
- `buildLeadRow(input: LeadInput, keys: OrgKeys, orgId: string, sensitive:
  Record<string, string>): LeadInsert`
  - It encrypts the phone, alternate phone and email, and computes the
    hashes, last-4 and email mask.
  - `sensitive_enc` is null when there's nothing sensitive.
- `maskEmail('rahul.k@gmail.com') === 'r•••@gmail.com'`
- `searchKind(q: string): { kind: 'phone'; phone: string } | { kind:
  'last4'; digits: string } | { kind: 'name'; text: string } | { kind:
  'none' }`. It returns phone when `cleanPhone` is valid, last4 for exactly
  4 digits, name for 2 or more characters, and none otherwise.

- [ ] **Step 1: Write the failing tests.** Exact cases:
  - **Phone cleaning:**
    - `'+91 98765-43210'` → `9876543210`
    - `'09876543210'` → `9876543210`
    - `'919876543210'` → `9876543210`
    - `9876543210` as a number → `9876543210`
    - `9.87654321E9` as a number → `9876543210`
    - `'98765 43210 / 91234 56789'` → primary `9876543210`, alternate
      `9123456789`
    - `'9876543210,9123456789'` splits the same way
    - `'12345'` → invalid, `too_short`
    - `'5876543210'` → invalid, `not_mobile`
    - `''` → `blank`
  - **Header cleanup:** `['', 'Name', 'Name']` →
    `['Column 1', 'Name', 'Name (2)']`
  - **Column detection:**
    - the headers `['Mobile No', 'Student Name', 'Loan Amount']` map to
      phone, name, extra
    - a header `'Col A'` whose data is phone numbers maps to phone
  - **Preview:**
    - a dup in the file is marked `dup_file`
    - an existing lead in the same process is `dup_existing`
    - an existing lead in another process is `dup_other_process`
  - **Lead row:**
    - the row round-trips through `decryptField`
    - `phone_hash` equals `blindIndex('9876543210')`
    - `sensitive_enc` is null when sensitive is empty
  - **Search kind:**
    - `searchKind('98765 43210')` → phone
    - `'3210'` → last4
    - `'ra'` → name
    - `'r'` → none
- [ ] **Step 2:** Run `npx vitest run tests/leads`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules.
- [ ] **Step 4:** Run `npx vitest run tests/leads`. Expected: all pass.
- [ ] **Step 5:** Commit with the message `feat: phone cleaning, column
  detection, import preview, lead row encryption`.

### Task 3: Lead Management: list, detail, manual add, demo leads

**Files:**
- Create:
  - `src/lib/leads/queries.ts` (server-only)
  - `src/app/(app)/leads/page.tsx`
  - `src/app/(app)/leads/[id]/page.tsx`
  - `src/app/(app)/leads/actions.ts`
  - `src/components/leads/LeadTable.tsx`, `src/components/leads/LeadFilters.tsx`
  - `src/components/leads/AddLeadDialog.tsx`, `src/components/leads/LeadTimeline.tsx`
- Modify: `scripts/seed-demo.ts`, adding 300 fake leads across the 3
  processes and assigned to the demo caller and TL

**Interfaces:**
- `listLeads(filters: { q?, status?, processId?, assignedTo?, sourceId?,
  city?, page? }): Promise<{ rows: LeadListRow[]; total: number }>`
  - 50 rows per page, using the RLS client.
  - When the session is a `super_admin`, the phone and email are decrypted
    and the audit row is written.
- `getLead(id)`: returns the lead (or null), its timeline and status
  history. Sensitive fields are decrypted for `super_admin` only.
- `addLead(input)`: `requireRole('super_admin','admin')`.
  - Validates with zod; phone is required.
  - Returns `{ ok, duplicateOf?: string }` when the phone already exists in
    the same process, unless `force: true` is passed.
  - Writes a `lead_events` row of type `created`, and audits `lead.create`.
- **The list page** shows:
  - **Header:** "Lead Management", with the buttons **Add lead** and
    **Import** (both hidden from TLs).
  - **Filters:** search, status, process, assigned to, source, city.
  - **Columns:** checkbox, Name, Phone, City, Process, Product, Lead type,
    Status badge, Disposition, Assigned to, Source, Created.
  - **Bulk bar:** Assign to… (Task 5).
- **The detail page** has a two-column layout:
  - **Left card:** contact details and extra fields, plus Sensitive fields
    for Super Admins.
  - **Right card:** the timeline of events and status changes, newest
    first, with actor and IST time (R7).

- [ ] **Step 1:** Write the failing test `tests/leads/addLead.test.ts`. It
  uses the injected-deps pattern from Phase 1's setup service:
  - `phone required`
  - `caller/TL forbidden`
  - `duplicate in same process returns duplicateOf unless force`
  - `writes created event + audit`
- [ ] **Step 2:** Run the test and see it fail. Implement until it passes.
  Run `npm run seed:demo`.
- [ ] **Step 3:** Check in the browser:
  - the super admin sees full numbers
  - the admin sees them masked
  - the caller gets 403 on `/leads` (Lead Management isn't a caller page)
- [ ] **Step 4:** Commit with the message `feat: lead management list,
  detail timeline, manual add`.

### Task 4: Import wizard

**Files:**
- Create:
  - `src/app/(app)/leads/import/page.tsx`
  - `src/components/import/ImportWizard.tsx`
  - `src/lib/import/parseFile.ts` (client: papaparse, dynamic exceljs)
  - `src/app/(app)/leads/import/actions.ts`
- Test: `tests/leads/importChunk.test.ts`, using injected deps

**Interfaces:**
- `parseFile(file: File, headerRow = 1): Promise<{ headers: string[]; rows:
  string[][] }>`
  - XLSX: reads the first sheet. Number cells become strings; an integer
    number becomes its digits.
  - The size limit is 50 MB.
- `checkExisting(phones: string[], processName: string|null):
  Promise<Record<string, { processName: string|null }>>`: an admin-only
  server action. It hashes the phones server-side and looks them up by
  hash.
- `startImport({ sourceName, fileName, total, mapping, headers,
  saveMapping }): Promise<{ batchId, sourceId }>`
- `importChunk(batchId, rows: { values: Record<string,string>; phone;
  alt }[], opts: { processId|null, sensitiveHeaders: string[],
  assignTo: string[] /*round-robin*/, offset: number }): Promise<{
  imported, failed }>`
  - It resolves process, product and lead-type names to ids,
    case-insensitively. A name that isn't found is kept in `extra`.
  - It inserts in one statement per chunk.
  - Round-robin assignment uses `(offset + i) % assignTo.length`.
- `finishImport(batchId, counts)`: audits `import.complete`.
- **The 5 wizard steps** match spec §9:
  1. **Upload:** drag and drop a file, give the source name, choose the
     header row.
  2. **Map:** a table with one row per column. Each row shows the header,
     3 sample values, a field select, and a "Sensitive" checkbox. A saved
     mapping is preselected.
  3. **Clean and preview:** count cards for OK, Invalid, Blank, Duplicate
     in file, Already exists and Other process. There's a filter by
     status, and invalid rows can be edited inline and re-cleaned.
  4. **Options:** the target process, assigning to callers round-robin,
     and a choice for duplicates (skip or import).
  5. **Import:** a progress bar, then a summary with a link to the leads,
     filtered to this source.

- [ ] **Step 1:** Write the failing `importChunk` tests:
  - `admin only`
  - `encrypts phones (no plaintext phone in inserted row)`
  - `unknown process name kept in extra`
  - `sensitive headers go to sensitive_enc not extra`
  - `round-robin uses offset`
- [ ] **Step 2:** Run the tests and see them fail. Implement until they
  pass.
- [ ] **Step 3:** Check in the browser with a generated test CSV and XLSX
  of 1,000 rows that include bad phones, dups and a "Loan Amount" column.
- [ ] **Step 4:** Commit with the message `feat: no-template lead import
  wizard with mapping, preview and dedupe`.

### Task 5: Assignment, Lead Transfers, Global Search

**Files:**
- Create:
  - `src/lib/leads/transfer.ts`
  - `src/app/(app)/lead-transfers/page.tsx`, replacing the ComingSoon page
  - `src/components/leads/TransferForm.tsx`
  - `src/app/(app)/search/actions.ts`
- Modify: `src/components/shell/TopBar.tsx` (wire up search),
  `src/components/leads/LeadTable.tsx` (bulk assign)
- Test: `tests/leads/transfer.test.ts`

**Interfaces:**
- `transferLeads(ctx, { leadIds: string[]; toUser: string; reason: string
  })`
  - `super_admin` and `admin` can transfer any lead.
  - A `team_leader` can transfer only when both the current assignee and
    `toUser` are in their team; otherwise it throws `forbidden`.
  - It writes one `lead_transfers` row and one `lead_events` row per lead,
    then audits `lead.transfer` with a count.
- `assignLeads` is the same thing, with the reason "Assigned".
- `searchLeads(q): Promise<{ id, name, phoneMasked, status }[]>`: 8
  results via `searchKind`, using the RLS client, so callers only find
  their own leads.
- **The Lead Transfers page** has:
  - **A "Move leads" card:** from agent, to agent, which leads (all open
    leads, or the first N), and a reason.
  - **History:** a table of the last 100 transfers.

- [ ] **Step 1:** Write the failing tests:
  - `TL cannot move lead to user outside team`
  - `TL can move within team`
  - `admin any`
  - `writes transfer + event per lead`
  - `empty leadIds rejected`
- [ ] **Step 2:** Run the tests and see them fail. Implement until they
  pass.
- [ ] **Step 3:** Check in the browser:
  - Ctrl K, then type the last 4 digits of a demo lead, opens that lead
  - a bulk assign from the table works
  - the transfer history shows the move
- [ ] **Step 4:** Commit with the message `feat: lead assignment,
  transfers and global search`.

### Task 6: Verify and review

- [ ] **Step 1:** Run `npm run lint`, `npm test`, `npm run test:rls` and
  `npm run build`. Expected: all clean.
- [ ] **Step 2:** Run a fresh reviewer over `main..HEAD` with this plan's
  Review Focus, then make one fix pass.
- [ ] **Step 3:** Update `docs/security.md` for S3, S8, S11 and S12, then
  commit.
