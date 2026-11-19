# CallOpps security checklist

Status after Phase 2 (2026-11-19).

| ID | Requirement | Status |
|---|---|---|
| S1 | TLS 1.2+ in transit | Supabase and Vercel serve HTTPS only. Add an HSTS header when deploying. |
| S2 | Data and backups encrypted at rest (AES-256) | Supabase default (disk + backups). |
| S3 | Field-level encryption for phones and emails | Done. Every lead's phone, alternate phone and email are encrypted with AES-256-GCM using per-centre keys wrapped by `CALLOPPS_MASTER_KEY`, plus a blind index for search and duplicate checks. Extra columns that contain phone numbers or emails, and any column the owner marks Sensitive, are encrypted too. Only Super Admins see them unmasked, and each unmasked view is logged. Full-number searches put a hash token in the URL, never the number. |
| S4 | Passwords hashed | Supabase Auth (bcrypt). Our own password screen requires at least 10 characters and rejects common passwords. |
| S5 | Two-step login for admins | Done. TOTP is required for Super Admin and Admin, and checked in middleware, in every server action **and in the database (RLS)**. A password-only admin session can read or change nothing. |
| S6 | Indian region, firewall, no public DB access | Supabase project in Mumbai. **To do before pilot:** turn on network restrictions in the Supabase dashboard, and pin Vercel functions to `bom1`. |
| S7 | Login limits and idle logout | **Partly done.** The CallOpps sign-in page locks an email for 15 minutes after 5 failures. Known gap: someone calling the Supabase auth API directly skips that lockout (only Supabase's own rate limits apply), and parallel attempts can slip past the count. Admin accounts are still protected by two-step login. To close it: a Supabase password-verification hook, before pilot. Idle sign-out after 30 minutes by default (Super Admin can set 5 to 240); it signs out only that device, and activity in any open tab counts. |
| S8 | Activity log | Done. The `audit_log` table is append-only: no update or delete for any user. Only the server writes entries, so users can't forge them. Logins, logouts and every setup change are logged. Unmasked lead views, imports, manual adds and transfers are logged too. Exports come in Phase 4. |
| S9 | Independent security test | **Pending.** Book it before the pilot. |
| S10 | Breach response plan | **Pending.** Needs a legal adviser on DPDP duties. |
| S11 | Three roles, callers see only assigned leads | Done and enforced in the database. Callers see only leads assigned to them, in their team's processes. Team leaders see their team's leads and can change only the assignee, status, disposition and follow-up. Every reference to another record must belong to the same centre. |
| S12 | Only admins import or export | Import: done (Super Admin and Admin only, checked in the action and the database). Export: Phase 4. |
| S13 | Centre can export or delete its data | Phase 4. |

## Before going live

The full step-by-step is in `docs/deploy.md`. In short:

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
