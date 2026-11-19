-- Phase 3 review fixes.

-- 1. Admins see leads (masked) but no call content: hide call events from them.
drop policy with_lead on public.lead_events;
create policy with_lead on public.lead_events for select to authenticated using (
  org_id = app.org_id() and exists (select 1 from public.leads l where l.id = lead_id)
  and (type not in ('call', 'call_started') or not app.is_role('admin'))
);

-- 2. Punching out after midnight still sticks (check the punch-out day, not the punch-in day).
--    5. A call in progress counts as activity, so a long call is not auto logged out.
create or replace function app.close_stale_attendance(only_user uuid default null) returns int
language sql security definer set search_path = '' as $$
  with closed as (
    update public.attendance_sessions s set punch_out = s.last_activity, end_reason = 'auto'
    from public.orgs o
    where o.id = s.org_id and s.punch_out is null
      and s.last_activity < now() - make_interval(mins => o.idle_timeout_minutes)
      and (only_user is null or s.user_id = only_user)
      -- ponytail: an abandoned unsaved call keeps the session open for at most 2 hours
      and not exists (select 1 from public.calls c where c.caller_id = s.user_id and c.saved_at is null
                      and c.started_at > now() - interval '2 hours')
    returning 1
  ) select count(*)::int from closed
$$;

create or replace function app.touch_attendance(uid uuid, org uuid, force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform app.close_stale_attendance(uid);
  update public.attendance_sessions set last_activity = now()
    where user_id = uid and punch_out is null and last_activity < now() - interval '30 seconds';
  if found or exists (select 1 from public.attendance_sessions where user_id = uid and punch_out is null) then return; end if;
  if not force and exists (select 1 from public.attendance_sessions
      where user_id = uid and end_reason = 'punch_out' and (punch_out at time zone 'Asia/Kolkata')::date = today) then return; end if;
  insert into public.attendance_sessions (org_id, user_id, day) values (org, uid, today)
    on conflict do nothing;
end $$;
revoke execute on function app.close_stale_attendance(uuid), app.touch_attendance(uuid, uuid, boolean) from public, anon, authenticated;

-- 4. Saving a call outcome is one transaction; a second save of the same call returns false.
create or replace function public.save_call_outcome(p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.calls; earlier boolean;
begin
  select * into c from public.calls
    where id = (p->>'callId')::uuid and caller_id = (p->>'actorId')::uuid and saved_at is null
    for update;
  if not found then return false; end if;
  earlier := exists (select 1 from public.calls where lead_id = c.lead_id and saved_at is not null);
  update public.calls set saved_at = now(), connected = (p->>'connected')::boolean,
    disposition_id = (p->>'dispositionId')::uuid, notes = coalesce(p->>'notes', ''),
    followup_at = (p->>'followupAt')::timestamptz, duration_s = (p->>'durationS')::int, is_followup = earlier
    where id = c.id;
  update public.leads set status = p->>'status', disposition_id = (p->>'leadDispositionId')::uuid,
    next_followup_at = (p->>'followupAt')::timestamptz
    where id = c.lead_id and org_id = c.org_id;
  if (p->>'fromStatus') is distinct from (p->>'status') then
    insert into public.lead_status_history (org_id, lead_id, from_status, to_status, disposition_id, actor_id)
    values (c.org_id, c.lead_id, p->>'fromStatus', p->>'status', (p->>'dispositionId')::uuid, c.caller_id);
  end if;
  insert into public.lead_events (org_id, lead_id, type, payload, actor_id)
  values (c.org_id, c.lead_id, 'call', jsonb_build_object(
    'call_id', c.id, 'connected', (p->>'connected')::boolean, 'disposition_id', p->'dispositionId',
    'notes', coalesce(p->>'notes', ''), 'followup_at', p->'followupAt', 'duration_s', p->'durationS'), c.caller_id);
  return true;
end $$;
revoke execute on function public.save_call_outcome(jsonb) from public, anon, authenticated;
grant execute on function public.save_call_outcome(jsonb) to service_role;
