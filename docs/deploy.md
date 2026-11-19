# Going live

CallOpps runs on **Vercel** (the app, Mumbai region `bom1`) and **Supabase** (database, sign-in, realtime, Mumbai).
Follow these steps in order; each says who does it. Plan on about an hour.

## 0. Before you start

- **Plans (owner):** Supabase **Pro** (~$25/month: daily backups, leaked-password check, no pausing) and
  Vercel **Pro** (~$20/month: Vercel's free plan forbids commercial use). Add Supabase point-in-time recovery if you
  want restores to the minute.
- **Use a new Supabase project for production.** The development project's keys were pasted into a chat during setup,
  it holds demo data, and its sign-in settings are shared with another app. Starting clean avoids all three.

## 1. Production database (owner, ~10 min)

1. Create a project at supabase.com: **region South Asia (Mumbai)**, a strong database password saved in a password
   manager.
2. In this folder, apply every migration to it. This creates all tables, security rules, the auto-logout job and realtime:
   ```powershell
   npx supabase link --project-ref NEW-PROJECT-REF
   npx supabase db push
   ```
3. Apply the sign-in settings. The script prints a dry run first, then applies them with `--apply`. It turns public
   sign-up off, sets the site address and redirect, turns on authenticator apps and the leaked-password check, and sets
   a 10-character minimum:
   ```powershell
   $env:SUPABASE_ACCESS_TOKEN="your-personal-access-token"; npx tsx scripts/configure-auth.ts NEW-PROJECT-REF https://app.yourdomain.in
   ```
   Re-run it with `--apply` at the end once the dry run looks right.
4. **Email (SMTP):** in Supabase → Authentication → SMTP, add a sender such as Amazon SES, Resend or Zoho.
   Supabase's built-in mailer sends only a few emails an hour, which isn't enough for invites.
5. Generate the master key and **store it in your password manager before anything else**:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## 2. Code on GitHub (owner, ~5 min)

Create a **private** GitHub repository and push `main`. `.env.local`, screenshots and zips are git-ignored and stay
on this computer.

## 3. Vercel (owner, ~10 min)

1. Vercel → Add New → Project → import the GitHub repo. Framework: Next.js (detected). The region comes from
   `vercel.json` (`bom1`, next to the database).
2. Environment variables (Production), from `.env.example`:

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the new project's URL | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the new project's publishable key | |
   | `SUPABASE_SERVICE_ROLE_KEY` | the new project's secret key | mark **Sensitive** |
   | `CALLOPPS_MASTER_KEY` | from step 1.5 | mark **Sensitive** |
   | `NEXT_PUBLIC_SITE_URL` | `https://app.yourdomain.in` | must be https |
   | `ANTHROPIC_API_KEY` | optional, for Ops AI | mark **Sensitive** |

   Never put `SUPABASE_ACCESS_TOKEN` in Vercel. If a required value is missing, the app refuses to start and the
   Vercel log says which one.
3. Deploy, then add your domain (Settings → Domains) and the DNS record Vercel shows.

## 4. First centre (owner + builder, ~5 min)

With `.env.local` pointing at the **production** project (and its master key), create the real centre and its
Super Admin. The owner gets an invite email:
```powershell
npm run create-centre -- --name "Your Centre" --email owner@yourdomain.in --owner "Owner Name"
```
Never run `npm run seed:demo` against production: it creates the demo centre and demo logins.

## 5. Check it (builder, ~10 min)

- Open `https://app.yourdomain.in/api/health`. It should say `{"ok":true}`. Point an uptime monitor at it.
- Accept the invite, set a password, enrol the authenticator app, and land on Reports.
- In CRM Setup: add processes, dispositions, teams and users. Import a small lead file. Call one lead from a phone and
  save the outcome. Download a Basic report.
- Check the security headers at securityheaders.com.

## 6. Retire the development secrets (owner)

In the **development** Supabase project, rotate the secret key and revoke the personal access token that were pasted
into chat. Then update this computer's `.env.local`.

## Day-two

- **Rollback:** Vercel → Deployments → previous deployment → Promote. Database migrations only move forward. To undo
  one, write a new migration.
- **New migrations:** `npx supabase db push` against production, then deploy the code.
- **Backups:** Supabase Pro keeps daily backups. Keep the master key backed up separately: a database backup is
  useless without it.
- **Before launch:** an independent security test, as promised in the PRD wording (`docs/security.md`).
