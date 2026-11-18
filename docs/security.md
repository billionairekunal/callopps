# CallOpps security checklist

Status after Phase 1 (2026-11-19).

| ID | Requirement | Status |
|---|---|---|
| S1 | TLS 1.2+ in transit | Supabase and Vercel serve HTTPS only. Add an HSTS header when deploying. |
| S2 | Data and backups encrypted at rest (AES-256) | Supabase default (disk + backups). |
| S3 | Field-level encryption for phones and emails | Library done: AES-256-GCM with per-centre keys wrapped by `CALLOPPS_MASTER_KEY`, plus a blind index for search. Used for leads in Phase 2. |
| S4 | Passwords hashed | Supabase Auth (bcrypt). Our own password screen requires at least 10 characters and rejects common passwords. |
| S5 | Two-step login for admins | Done. TOTP is required for Super Admin and Admin, and checked in middleware and every server action. |
| S6 | Indian region, firewall, no public DB access | Supabase project in Mumbai. **To do before pilot:** turn on network restrictions in the Supabase dashboard, and pin Vercel functions to `bom1`. |
| S7 | Login limits and idle logout | Done. Lockout after 5 failures for 15 minutes; idle sign-out after 30 minutes by default (Super Admin can set 5 to 240). |
| S8 | Activity log | Done. The `audit_log` table is append-only: no update or delete for any user. Logins, logouts and every setup change are logged. Lead views, imports and exports are added in Phases 2 and 4. |
| S9 | Independent security test | **Pending.** Book it before the pilot. |
| S10 | Breach response plan | **Pending.** Needs a legal adviser on DPDP duties. |
| S11 | Three roles, callers see only assigned leads | Roles done (Super Admin, Admin, Team leader, Caller) and enforced by RLS. Lead rules come in Phase 2. |
| S12 | Only admins import or export | Enforced when import and export ship (Phases 2 and 4). |
| S13 | Centre can export or delete its data | Phase 4. |

## Before going live

1. **Rotate the Supabase secret key and access token.** Both were pasted into
   a chat during setup. Replace them in `.env.local`.
2. **Set up custom SMTP** in Supabase. The default mailer sends only a few
   invites per hour.
3. Set `NEXT_PUBLIC_SITE_URL` to the real domain, and add
   `<domain>/auth/callback` to Supabase Auth's allowed redirect URLs.
4. Back up `CALLOPPS_MASTER_KEY` somewhere safe, such as a password manager.
   If it's lost, the encrypted data can't be read.

## What we may tell owners (approved PRD wording)

> Data is encrypted in transit and at rest, stored on servers in India,
> access is controlled and logged, and an independent security test is done
> before launch.

Never claim "unhackable", "100% safe", or any certification we do not hold.
