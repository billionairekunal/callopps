-- Phase 3: calls and attendance. Rows are written only by the server (service role).

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  caller_id uuid not null,
  started_at timestamptz not null default now(),
  saved_at timestamptz,
  connected boolean,
  duration_s int check (duration_s between 0 and 86400),
  disposition_id uuid,
  notes text not null default '',
  followup_at timestamptz,
  is_followup boolean not null default false, -- the lead already had a saved call before this one
  foreign key (caller_id, org_id) references public.profiles (user_id, org_id) on delete cascade,
  foreign key (disposition_id, org_id) references public.dispositions (id, org_id) on delete set null (disposition_id)
);
create index on public.calls (org_id, saved_at desc);
create index on public.calls (lead_id, started_at desc);
create index on public.calls (org_id, caller_id, saved_at desc);
create index on public.leads (org_id, assigned_to, next_followup_at);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  punch_in timestamptz not null default now(),
  punch_out timestamptz,
  last_activity timestamptz not null default now(),
  end_reason text check (end_reason in ('punch_out', 'auto')),
  foreign key (user_id, org_id) references public.profiles (user_id, org_id) on delete cascade
);
create unique index attendance_one_open on public.attendance_sessions (user_id) where punch_out is null;
create index on public.attendance_sessions (org_id, day desc);

alter table public.calls enable row level security;
create policy calls_read on public.calls for select to authenticated using (
  org_id = app.org_id() and (
    app.is_role('super_admin')
    or (app.is_role('team_leader') and (caller_id = auth.uid() or caller_id in (select app.team_member_ids())))
    or (app.is_role('caller') and caller_id = auth.uid())
  )
);
alter table public.attendance_sessions enable row level security;
create policy attendance_read on public.attendance_sessions for select to authenticated using (
  org_id = app.org_id() and (
    app.is_role('super_admin', 'admin')
    or (app.is_role('team_leader') and (user_id = auth.uid() or user_id in (select app.team_member_ids())))
    or user_id = auth.uid()
  )
);
grant select on public.calls, public.attendance_sessions to authenticated;
revoke insert, update, delete on public.calls, public.attendance_sessions from authenticated, anon;
grant all on public.calls, public.attendance_sessions to service_role;

-- Close open sessions idle longer than the org's timeout ("Auto Logged Out").
create or replace function app.close_stale_attendance(only_user uuid default null) returns int
language sql security definer set search_path = '' as $$
  with closed as (
    update public.attendance_sessions s set punch_out = s.last_activity, end_reason = 'auto'
    from public.orgs o
    where o.id = s.org_id and s.punch_out is null
      and s.last_activity < now() - make_interval(mins => o.idle_timeout_minutes)
      and (only_user is null or s.user_id = only_user)
    returning 1
  ) select count(*)::int from closed
$$;

-- Record activity: close a stale session, extend the open one, or open a new one.
-- After a manual punch-out today, nothing reopens until the user punches in (force = true).
create or replace function app.touch_attendance(uid uuid, org uuid, force boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform app.close_stale_attendance(uid);
  update public.attendance_sessions set last_activity = now()
    where user_id = uid and punch_out is null and last_activity < now() - interval '30 seconds';
  if found or exists (select 1 from public.attendance_sessions where user_id = uid and punch_out is null) then return; end if;
  if not force and exists (select 1 from public.attendance_sessions
      where user_id = uid and day = today and end_reason = 'punch_out') then return; end if;
  insert into public.attendance_sessions (org_id, user_id, day) values (org, uid, today)
    on conflict do nothing;
end $$;

create or replace function app.punch_out(uid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.attendance_sessions set punch_out = now(), last_activity = now(), end_reason = 'punch_out'
  where user_id = uid and punch_out is null
$$;

revoke execute on function app.close_stale_attendance(uuid), app.touch_attendance(uuid, uuid, boolean), app.punch_out(uuid)
  from public, anon, authenticated;
grant execute on function app.close_stale_attendance(uuid), app.touch_attendance(uuid, uuid, boolean), app.punch_out(uuid)
  to service_role;

-- PostgREST only exposes the public schema: thin service-role wrappers.
create or replace function public.touch_attendance(uid uuid, org uuid, force boolean default false) returns void
language sql security definer set search_path = '' as $$ select app.touch_attendance(uid, org, force) $$;
create or replace function public.punch_out(uid uuid) returns void
language sql security definer set search_path = '' as $$ select app.punch_out(uid) $$;
revoke execute on function public.touch_attendance(uuid, uuid, boolean), public.punch_out(uuid) from public, anon, authenticated;
grant execute on function public.touch_attendance(uuid, uuid, boolean), public.punch_out(uuid) to service_role;

-- Every 5 minutes (spec §14). The touch above also closes lazily, so this is a backstop.
create extension if not exists pg_cron;
select cron.schedule('callopps-auto-logout', '*/5 * * * *', $$select app.close_stale_attendance()$$);
