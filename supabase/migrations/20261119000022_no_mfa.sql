-- Owner's decision: Super Admin / Admin sign in with email + password only (no authenticator code).
-- To require it again, restore the aal2 condition from 20261119000004_mfa_in_rls.sql in a new migration.
create or replace function app.active_profile() returns public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p
  where p.user_id = auth.uid() and p.status = 'active'
$$;
