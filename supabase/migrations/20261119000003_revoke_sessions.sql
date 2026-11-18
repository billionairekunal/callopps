-- Revoke all refresh tokens / sessions for a user (used when a user is deactivated). Service role only.
create or replace function public.revoke_user_sessions(target uuid) returns void
language sql security definer set search_path = '' as
$$ delete from auth.sessions where user_id = target; $$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
