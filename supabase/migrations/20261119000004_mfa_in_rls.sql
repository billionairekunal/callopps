-- Review fix C1: Super Admin / Admin get no data access until their session is aal2 (TOTP verified).
-- Enforced in the helpers every policy uses, so it covers all tables at once.
create or replace function app.active_profile() returns public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p
  where p.user_id = auth.uid() and p.status = 'active'
    and (p.role not in ('super_admin','admin') or coalesce(auth.jwt()->>'aal','') = 'aal2')
$$;
create or replace function app.org_id() returns uuid language sql stable security definer set search_path = '' as
$$ select (app.active_profile()).org_id $$;
create or replace function app.role() returns text language sql stable security definer set search_path = '' as
$$ select (app.active_profile()).role $$;
create or replace function app.team_id() returns uuid language sql stable security definer set search_path = '' as
$$ select (app.active_profile()).team_id $$;
create or replace function app.is_role(variadic roles text[]) returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((app.active_profile()).role = any(roles), false) $$;
grant execute on all functions in schema app to authenticated;

-- Review fix: audit rows are written only by the server (service role); users can't forge entries.
drop policy if exists audit_insert on public.audit_log;
revoke insert on public.audit_log from authenticated, anon;
