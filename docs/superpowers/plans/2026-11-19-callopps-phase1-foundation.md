# CallOpps Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running CallOpps web app with secure login (MFA for Super Admin
and Admin), four roles enforced by Postgres RLS, per-centre encryption keys,
the full 16-item sidebar shell, CRM Setup, and an audit log.

**Architecture:**
- Next.js App Router. All sensitive work happens in server actions and
  route handlers.
- Supabase holds the data, with RLS on every table keyed by `org_id` and
  role.
- Field encryption is AES-256-GCM in server code. Each org has its own
  keys, wrapped by a master key held in an env var.

**Tech Stack:**
- Next.js 15, TypeScript, Tailwind CSS v4, shadcn/ui, lucide-react
- @supabase/ssr, @supabase/supabase-js
- Vitest, zod

**Spec:** `docs/superpowers/specs/2026-11-19-callopps-design.md`

**Later plans** (one each, written when the previous phase ships):
- Phase 2: Leads + Import
- Phase 3: Calling
- Phase 4: Reports
- Phase 5: Quality and Communication

## Prerequisites (owner does these; Claude can't create accounts)

- Docker is **not installed**, so there's no local Supabase stack.
- Create a free Supabase project named `callopps-dev` in the **Mumbai
  (ap-south-1)** region.
- Put its URL, anon key and service-role key in `.env.local` yourself.
- Run `npx supabase login` once.

## Global Constraints

- **Region:** Supabase `ap-south-1`. Vercel functions `bom1`.
- **Roles, exactly:**
  - per org: `super_admin`, `admin`, `team_leader`, `caller`
  - plus a separate `platform_operators` table, whose members cannot read
    org data
- **Only `super_admin`** sees:
  - unmasked phone numbers and sensitive fields
  - every call
  - the audit log
  - Full Data exports
- **`admin`** sees numbers masked, as `•••• •• 4321`.
- Every table has `org_id uuid not null` and RLS enabled. There are no
  tables without a policy.
- **MFA:** TOTP is required (`aal2`) for `super_admin` and `admin`, checked
  in middleware **and** in every server action guard.
- **Passwords:** at least 10 characters. Lockout after 5 failed attempts for
  15 minutes.
- **Idle sign-out:** an org setting `idle_timeout_minutes`, default `30`.
- **Ciphertext format:** `v1:<keyId>:<ivB64>:<tagB64>:<ctB64>`, with
  AES-256-GCM and a 12-byte IV.
- **Env vars:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CALLOPPS_MASTER_KEY`: 32 bytes, base64. This replaces the
    `CALLOPPS_DATA_KEY` named in spec §6, per spec §14.
- **Branding:** the CallOpps name and logo. Never EngageOne or ENARA. The AI
  item is labelled "Ops AI".
- The `audit_log` table is append-only: no update or delete grants for any
  role.
- **Public security wording:** only the PRD's approved text. Never
  "unhackable" or "100% safe".

## Review Focus

1. **A signed-in user with no `profiles` row** (invite not finished): they
   get a clean "account not set up" page, never a crash or an empty app.
   Covered in Task 5.
2. **An Admin who skips MFA and posts to a server action directly:** the
   action rejects with `aal2 required`, not just the page redirect. Covered
   in Task 5.
3. **A Caller typing `/crm-setup` or `/audit-log` into the address bar:**
   they get a 403 page, and RLS rejects the write too. Covered in Tasks 6
   and 7.
4. **Tampered ciphertext, or ciphertext from another org's key:**
   `decryptField` throws. It never returns garbage. Covered in Task 2.
5. **A deactivated user with a live session:** they're blocked on their next
   request. Covered in Task 5.

---

### Task 1: Scaffold the app

**Files:**
- Create: the Next.js app at repo root (`E:\caallops`), plus
  `vitest.config.ts`, `.env.example`, `.gitignore` (which must include
  `.env.local`), `tests/smoke.test.ts`
- Keep: the existing `docs/`, `software_steps*/` and zips. Add the zips and
  `software_steps*/` to `.gitignore`.

**Interfaces:**
- Produces: `npm run dev`, `npm test` (vitest run), `npm run lint`, and the
  `@/` → `src/` path alias.

- [ ] **Step 1:** `git init`. Create the Next.js app into a temp folder
  with `npx create-next-app@15 callopps-tmp --ts --tailwind --eslint --app
  --src-dir --import-alias "@/*" --use-npm`, then move its contents to the
  repo root. The root isn't empty, so create-next-app refuses to run there.
- [ ] **Step 2:** `npx shadcn@latest init` (neutral base). Add the
  components `button input label card dialog dropdown-menu select table
  badge tabs sheet form sonner checkbox popover command separator tooltip`.
- [ ] **Step 3:** Install the runtime deps `@supabase/ssr
  @supabase/supabase-js zod lucide-react` and the dev deps `vitest
  vite-tsconfig-paths`. Add `"test": "vitest run"` to package.json.
- [ ] **Step 4:** Write `tests/smoke.test.ts` asserting `1 + 1 === 2`. Run
  `npm test`. Expected: 1 passed.
- [ ] **Step 5:** `npm run build`. Expected: the build succeeds.
- [ ] **Step 6:** Commit with the message `chore: scaffold CallOpps
  (Next.js, Tailwind, shadcn, Vitest)`.

### Task 2: Field encryption library

**Files:**
- Create: `src/lib/crypto/fieldCrypto.ts`, `src/lib/crypto/orgKeys.ts`
- Test: `tests/crypto/fieldCrypto.test.ts`, `tests/crypto/orgKeys.test.ts`

**Interfaces:**
- Produces:
  - `encryptField(plain: string, key: Buffer, keyId: string): string`
  - `decryptField(blob: string, keyFor: (keyId: string) => Buffer): string`
    throws `Error('decrypt failed')` on a bad tag, wrong key or bad format
  - `blindIndex(value: string, hashKey: Buffer): string`: lowercase hex
    HMAC-SHA256
  - `last4(digits: string): string`
  - `maskPhone(last4: string): string`: returns `'•••• •• ' + last4`
  - `generateKey(): Buffer`: 32 random bytes
  - `wrapKey(key: Buffer, master: Buffer): string` and
    `unwrapKey(wrapped: string, master: Buffer): Buffer`. Both reuse the
    `encryptField` format with keyId `master`.
  - `getOrgKeys(orgId: string): Promise<{ keyId: string; dataKey: Buffer;
    hashKey: Buffer }>`: server-only (`import 'server-only'`). It reads the
    `org_keys` table with the service client, unwraps the keys with
    `CALLOPPS_MASTER_KEY`, and caches the result per orgId in memory.

- [ ] **Step 1: Write the failing tests**
  - `roundtrips` checks that `decryptField(encryptField('9876543210', k,
    'k1'), () => k) === '9876543210'`.
  - `ciphertext differs each call` encrypts the same plaintext twice and
    expects different output (random IV).
  - `throws on tampered ciphertext` flips one char of the ct segment, and
    `decryptField` should throw `/decrypt failed/`.
  - `throws with another org key` decrypts using a different
    `generateKey()`, and that should throw.
  - `throws on malformed blob`: `decryptField('garbage', …)` throws.
  - `blindIndex is deterministic and key-dependent`: the same value and key
    give the same output, and a different key gives a different output.
  - `maskPhone('4321') === '•••• •• 4321'`.
  - `wrap/unwrap roundtrip` in `orgKeys.test.ts`.
- [ ] **Step 2:** `npm test -- crypto`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement with `node:crypto` `createCipheriv('aes-256-gcm',
  …)`, a 12-byte IV and the 16-byte auth tag. Wrap every decrypt error as
  `Error('decrypt failed')`.
- [ ] **Step 4:** `npm test -- crypto`. Expected: all pass.
- [ ] **Step 5:** Commit with the message `feat: AES-256-GCM field
  encryption with per-org wrapped keys`.

### Task 3: Database schema and RLS (setup tables)

**Files:**
- Create:
  - `supabase/config.toml` (from `npx supabase init`)
  - `supabase/migrations/0001_foundation.sql`
  - `supabase/seed.sql`
  - `tests/rls/rls.test.ts`
  - `tests/rls/helpers.ts`

**Interfaces:**
- Produces these tables:
  - `orgs(id, name, idle_timeout_minutes int default 30, ai_enabled bool
    default false, created_at)`
  - `org_keys(org_id pk, key_id text, data_key_wrapped text,
    hash_key_wrapped text)`. RLS is on with **no policies**, so only the
    service role can read it.
  - `platform_operators(user_id pk)`
  - `profiles(user_id pk references auth.users, org_id, full_name, role
    text check in
    ('super_admin','admin','team_leader','caller'), team_id null, status
    text check in ('active','deactivated') default 'active', created_at)`
  - `teams(id, org_id, name, team_leader_id null)`
  - `processes(id, org_id, name, active bool)`
  - `team_processes(team_id, process_id, org_id)`
  - `product_categories(id, org_id, name)`
  - `products(id, org_id, category_id, name)`
  - `lead_types(id, org_id, name)`
  - `dispositions(id, org_id, process_id, label, outcome text check in
    ('in_progress','won','lost'), counts_presentation bool default false,
    sort int)`
  - `login_attempts(email text, attempted_at, success bool)`: service-role
    only
  - `audit_log(id bigserial, org_id, actor_id, action text, entity text,
    entity_id text, meta jsonb, at timestamptz default now())`
- Produces these SQL helpers (`security definer`, `stable`, in schema
  `app`), all reading `profiles` where `status='active'`:
  - `app.org_id() returns uuid`
  - `app.role() returns text`
  - `app.is_role(variadic text[]) returns bool`
- RLS rules:
  - **Setup tables** (teams, processes, team_processes, product
    categories, products, lead types, dispositions): `select` for any
    active member of the org; `insert/update/delete` only when
    `app.is_role('super_admin','admin')`.
  - **`profiles`:**
    - Anyone may select their own row.
    - Super Admins and Admins may select the whole org.
    - Team leaders may select their team.
    - Writes go through server actions using the service client, so there
      are no client write policies.
  - **`audit_log`:**
    - `insert` is allowed for any active member with
      `org_id = app.org_id()` and `actor_id = auth.uid()`.
    - `select` only when `app.is_role('super_admin')`.
    - Revoke `update` and `delete` on it from `authenticated` and `anon`.
  - **`orgs`:** members select their own org, and only `super_admin` may
    update it.

- [ ] **Step 1: Write the failing RLS tests** (they're skipped unless
  `RLS_TEST=1` and the Supabase env vars are set):
  - `helpers.ts` creates throwaway users with the service client: one
    super_admin, one admin and one caller in org A, plus one admin in
    org B. It signs each in with the anon client.
  - Test cases:
    - `caller cannot insert process`: error code `42501` or a null result.
    - `admin can insert process in own org`.
    - `org B admin sees zero org A processes`.
    - `admin cannot read audit_log`: 0 rows.
    - `super_admin reads audit_log`.
    - `nobody can update audit_log`, not even a super_admin; the row is
      unchanged.
    - `deactivated user gets app.org_id() null`, so their selects return 0
      rows.
    - `nobody but service role reads org_keys`.
- [ ] **Step 2:** Run `npx supabase link --project-ref <ref>`, then `npx
  supabase db push`, then `RLS_TEST=1 npm test -- rls`. Expected: FAIL,
  because the tables don't exist yet.
- [ ] **Step 3:** Write `0001_foundation.sql` with the tables, indexes on
  `org_id`, the helpers and the policies listed above.
- [ ] **Step 4:** `npx supabase db push`, then `RLS_TEST=1 npm test -- rls`.
  Expected: all pass. Delete the test users in `afterAll`.
- [ ] **Step 5:** Commit with the message `feat: foundation schema with
  per-org RLS and append-only audit log`.

### Task 4: Create a centre (platform operator) and demo seed

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/orgs/createCentre.ts`,
  `scripts/create-centre.ts`, `scripts/seed-demo.ts`
- Test: `tests/orgs/createCentre.test.ts` (mocks the admin client)

**Interfaces:**
- Consumes: `generateKey`, `wrapKey` (Task 2).
- Produces:
  - `createAdminClient(): SupabaseClient`, which uses the service role and
    is server-only.
  - `createCentre(input: { name: string; ownerEmail: string; ownerName:
    string }, deps?): Promise<{ orgId: string; ownerUserId: string }>`.
    Steps in order:
    1. insert `orgs`
    2. generate and wrap both keys, then insert `org_keys` with
       `key_id = 'k1'`
    3. `auth.admin.inviteUserByEmail`
    4. insert `profiles` with role `super_admin`
    5. write the audit row `centre.created`
  - `npm run create-centre -- --name "Reliable" --email x@y --owner "Name"`
  - `npm run seed:demo`. It creates the org "Demo Admissions Centre" with:
    - 2 teams, 3 processes (SGI, BNI Dynamic, EC Infosolution)
    - categories UG and PG, with 6 products from the PDF (BBA LLB, B.Sc
      Computer Science, Bachelor of Pharmacy…)
    - lead types Hot, Warm and Cold
    - the dispositions from the screenshots, each with an outcome:
      | Disposition | Outcome |
      |---|---|
      | INTERESTED FOLLOW-UP | in_progress |
      | Not Interested | lost |
      | Admission Done | won |
      | Already Admission Done In SGI | lost |
      | visit scheduled | in_progress, `counts_presentation=true` |
      | ALREADY ADMISSION TAKEN IN OTHER COLLEGE | lost |
      | Turned Not Interested - Other College | lost |
      | Turned Not Interested - Location not suitable | lost |
      | Visit Done Not Interested | lost |
      | Visit Done Follow Up For Admission | in_progress, `counts_presentation=true` |
    - one user per role, with passwords printed once to the console and
      written to `.env.local` as `DEMO_*` (gitignored)

- [ ] **Step 1:** Write the failing test `createCentre writes org, keys,
  owner profile and audit in order`. The fake deps record calls; assert the
  order and that the `org_keys` values are not raw 32-byte base64 (they
  start with `v1:master:`).
- [ ] **Step 2:** `npm test -- createCentre`. Expected: FAIL.
- [ ] **Step 3:** Implement `createCentre` and both scripts (run with
  `npx tsx`). If any step after the org insert fails, delete the org row
  (cascade), so no half-made centre is left behind.
- [ ] **Step 4:** `npm test -- createCentre`. Expected: PASS. Then run
  `npm run seed:demo` against the dev project. Expected: it prints the
  demo credentials.
- [ ] **Step 5:** Commit with the message `feat: platform createCentre and
  demo seed`.

### Task 5: Auth, MFA, lockout, idle sign-out, guards

**Files:**
- Create:
  - `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`
  - `src/middleware.ts`
  - `src/lib/auth/session.ts`, `src/lib/auth/guard.ts`,
    `src/lib/auth/lockout.ts`
  - `src/lib/audit.ts`
  - `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/actions.ts`
  - `src/app/(auth)/mfa/page.tsx` (enrol with a QR code and verify)
  - `src/app/(auth)/not-set-up/page.tsx`
  - `src/components/IdleSignOut.tsx`
- Test: `tests/auth/guard.test.ts`, `tests/auth/lockout.test.ts`

**Interfaces:**
- Produces:
  - `type Role = 'super_admin'|'admin'|'team_leader'|'caller'`
  - `getSession(): Promise<{ userId: string; orgId: string; role: Role;
    teamId: string|null; aal: 'aal1'|'aal2'; fullName: string } | null>`.
    It returns null when there's no user, no profile, or the profile is
    deactivated.
  - `requireRole(...roles: Role[]): Promise<Session>`. This is used at the
    top of **every** server action and protected page. It throws
    `AuthError('unauthenticated'|'not-set-up'|'forbidden'|'aal2 required')`.
  - `needsMfa(role: Role): boolean`: true for `super_admin` and `admin`.
  - `logAudit(action: string, entity?: string, entityId?: string, meta?:
    Record<string, unknown>): Promise<void>`
  - `checkLockout(email: string, now?: Date): Promise<{ locked: boolean;
    retryAt?: Date }>` and `recordAttempt(email, success)`. The rule is 5
    failures within 15 minutes; a success resets the count.
- Middleware:
  - refreshes the session
  - sends signed-out users to `/login`
  - sends users without a profile to `/not-set-up`
  - sends `needsMfa` users at `aal1` to `/mfa`
- `IdleSignOut` is a client component in the app layout. It watches
  pointer, key and visibility events, and signs out after the org's
  `idle_timeout_minutes`. Time spent away from the tab while a call is in
  progress is handled in Phase 3.

- [ ] **Step 1: Write the failing tests**
  - `guard.test.ts` uses a mocked `getSession`:
    - `caller hitting admin action → forbidden`
    - `admin at aal1 → aal2 required`
    - `admin at aal2 passes`
    - `team_leader at aal1 passes` (TLs don't need MFA)
    - `no profile → not-set-up`
    - `deactivated (getSession null with user present) → not-set-up`
  - `lockout.test.ts` uses an in-memory store:
    - `4 failures not locked`
    - `5th failure locks for 15 min`
    - `success resets`
    - `failures older than 15 min ignored`
- [ ] **Step 2:** `npm test -- auth`. Expected: FAIL.
- [ ] **Step 3:** Implement everything listed above. On the login page:
  - Run the lockout check before `signInWithPassword`.
  - Show "Invalid email or password", never which part was wrong.
  - Log the audit actions `auth.login`, `auth.login_failed` (no actor; use
    the service client), `auth.logout` and `auth.mfa_enrolled`.
- [ ] **Step 4:** `npm test -- auth`. Expected: pass. Then check by hand
  with `npm run dev` and the demo users:
  - The admin is asked to enrol MFA.
  - The caller lands in the app without MFA.
  - 5 wrong passwords lock the account.
- [ ] **Step 5:** Commit with the message `feat: login, admin MFA,
  lockout, idle sign-out, role guards`.

### Task 6: App shell with the full sidebar

**Files:**
- Create:
  - `src/lib/nav.ts`
  - `src/components/shell/Sidebar.tsx`, `src/components/shell/TopBar.tsx`
  - `src/components/shell/ComingSoon.tsx`
  - `src/app/(app)/layout.tsx`
  - `src/app/(app)/forbidden/page.tsx`
  - one `page.tsx` per nav route
  - `public/callopps-logo.svg`
- Modify: `src/app/globals.css` (theme tokens)
- Test: `tests/nav.test.ts`

**Interfaces:**
- Produces:
  - `NAV: { section: 'WORKSPACE'|'ANALYTICS & PERFORMANCE'|'COMMUNICATION';
    items: { label: string; href: string; icon: LucideIcon; roles: Role[];
    phase: 1|2|3|4|5 }[] }[]`
  - `navFor(role: Role): typeof NAV`, which drops items and sections the
    role can't see
  - `canAccess(role: Role, href: string): boolean`
- The labels and order are exactly these. The roles are listed after each
  arrow, where TL means team_leader and all means every role:
  - **WORKSPACE**
    - Pipeline / Overview `/pipeline` → all
    - Follow-Ups `/follow-ups` → all
    - Lead Transfers `/lead-transfers` → super_admin, admin, TL
    - Lead Management `/leads` → super_admin, admin, TL
    - My tasks `/my-tasks` → all
  - **ANALYTICS & PERFORMANCE**
    - Reports and Analytics `/reports` → super_admin, admin, TL
    - Process Business `/process-business` → super_admin, admin, TL
    - Daily Reports `/daily-reports` → super_admin, admin, TL
    - Targets `/targets` → super_admin, admin, TL
    - Performance `/performance` → all (callers see only their own)
    - QA Audit `/qa-audit` → all (callers see only their own scores)
  - **COMMUNICATION**
    - Ops AI `/ops-ai` → super_admin, admin
    - Communications `/communications` → all
    - Internal Chat `/chat` → all
    - WhatsApp Reports `/whatsapp-reports` → super_admin, admin, TL
    - CRM Setup `/crm-setup` → super_admin, admin
  - **Not in the sidebar:** Audit Log `/audit-log` → super_admin only.
    It's linked from CRM Setup.
- Look, taken from the screenshots:
  - **Sidebar:**
    - navy background `#0f172a`, with uppercase section labels in small
      grey letter-spaced text
    - the active item is a crimson pill `#e11d48` with white text
    - a collapse chevron at the bottom
    - an unread badge on Internal Chat; its count is wired in Phase 5,
      0 for now
  - **Top bar:**
    - breadcrumb `Role › Page`
    - a centred **Global Search** pill with a crimson border and a
      `Ctrl K` hint; it opens a command dialog, and the search is wired in
      Phase 2
    - a bell, and an avatar with name and role
  - **Content:** a light grey `#f6f7f9` background with white rounded-xl
    cards.
  - On screens under 768px the sidebar becomes a Sheet with a hamburger
    button. A Caller's home page is `/my-tasks`; everyone else's is
    `/reports`.
- Each page whose phase is greater than 1 renders `<ComingSoon
  phase={n} title=… bullets=[…from spec §7] />`, so there are no dead links.
- `(app)/layout.tsx` runs `requireRole()`. If `!canAccess(role,
  pathname)`, it renders the 403 page.

- [ ] **Step 1: Write the failing tests**
  - `nav order and labels match spec`: deep-equal against the label list
    above.
  - `caller sees no Lead Management, Reports, CRM Setup, Ops AI`.
  - `admin sees CRM Setup but canAccess('/audit-log') is false`.
  - `super_admin canAccess every href including /audit-log`.
- [ ] **Step 2:** `npm test -- nav`. Expected: FAIL.
- [ ] **Step 3:** Implement the nav config, the shell components, the
  pages and the theme.
- [ ] **Step 4:** `npm test -- nav` should pass. Then in `npm run dev`, as
  the demo caller and the demo admin:
  - check each role's sidebar
  - check that `/crm-setup` as the caller shows 403
  - check the layout at a 375px width
- [ ] **Step 5:** Commit with the message `feat: app shell with full
  CallOpps sidebar and role-aware nav`.

### Task 7: CRM Setup and the audit log viewer

**Files:**
- Create:
  - `src/app/(app)/crm-setup/page.tsx`, a tabbed page with the tabs
    Organisation, Users, Teams, Processes, Products, Lead Types,
    Dispositions, Security
  - `src/app/(app)/crm-setup/actions.ts`
  - `src/components/setup/LookupTable.tsx`
  - `src/lib/setup/schemas.ts` (zod)
  - `src/app/(app)/audit-log/page.tsx`
- Test: `tests/setup/schemas.test.ts`, `tests/setup/actions.test.ts`
  (mocks the guard and the db)

**Interfaces:**
- Consumes: `requireRole`, `logAudit`, `createAdminClient`.
- Produces these server actions. Each one starts with
  `requireRole('super_admin','admin')`, except where marked:
  - `saveLookup(table: 'processes'|'product_categories'|'products'|'lead_types'|'teams',
    row: unknown)` and `deleteLookup(table, id)`
  - `saveDisposition(row: unknown)`, where the row is `{ id?, process_id,
    label, outcome, counts_presentation, sort }`
  - `setTeamProcesses(teamId: string, processIds: string[])`
  - `inviteUser({ email, fullName, role, teamId? })`. An `admin` may not
    invite `super_admin` or `admin` (throws forbidden); only `super_admin`
    can.
  - `setUserStatus(userId, 'active'|'deactivated')`. This also calls
    `auth.admin.signOut(userId)` when deactivating.
  - `changeUserRole(userId, role)`: `super_admin` only. It refuses to demote
    the last active super_admin.
  - `updateOrgSettings({ name, idle_timeout_minutes })`: `super_admin` only.
    `idle_timeout_minutes` must be an int from 5 to 240.
- Every action validates its input with zod and calls `logAudit('setup.<thing>.<verb>',
  …)`.
- `LookupTable` is one generic editable table: inline add, rename and
  delete, plus a confirm dialog. Every simple tab reuses it.
- The audit log page is `super_admin` only. It has filters for actor,
  action and date range, shows 50 rows per page, and is read only.

- [ ] **Step 1: Write the failing tests**
  - **Schemas:**
    - `disposition outcome must be in_progress|won|lost`
    - `idle timeout 4 rejected, 5 and 240 accepted, 241 rejected`
    - `empty label rejected`
  - **Actions:**
    - `admin inviting admin → forbidden`
    - `super_admin inviting admin ok`
    - `demoting last super_admin → error 'last super admin'`
    - `deactivate calls auth.admin.signOut`
    - `every action writes an audit row`
- [ ] **Step 2:** `npm test -- setup`. Expected: FAIL.
- [ ] **Step 3:** Implement the actions, schemas, page tabs,
  `LookupTable` and the audit log page.
- [ ] **Step 4:** `npm test` should pass completely. Then in `npm run dev`
  as the demo super_admin:
  - add a process and a disposition
  - invite a caller
  - deactivate them, and check their open session is rejected
  - see all of it in Audit Log
  - as the demo admin, check that the Audit Log isn't visible
- [ ] **Step 5:** Commit with the message `feat: CRM Setup and super-admin
  audit log`.

### Task 8: Phase 1 verification

- [ ] **Step 1:** Run `npm run lint`, `npm test` and `RLS_TEST=1 npm test
  -- rls`. Expected: all clean.
- [ ] **Step 2:** Run `npm run build`. Expected: success.
- [ ] **Step 3:** Write `docs/security.md`:
  - the S1–S13 checklist, marking what Phase 1 delivers and what's pending
  - S9: pending the security test
  - S10: the breach plan, waiting on the legal adviser
  - the approved public wording, copied from the PRD
- [ ] **Step 4:** Commit with the message `docs: security checklist after
  phase 1`.
