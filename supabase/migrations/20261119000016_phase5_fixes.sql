-- Phase 5 review fixes.

-- Admins see leads masked but not call or message content.
drop policy with_lead on public.lead_events;
create policy with_lead on public.lead_events for select to authenticated using (
  org_id = app.org_id() and exists (select 1 from public.leads l where l.id = lead_id)
  and (type not in ('call', 'call_started', 'message') or not app.is_role('admin'))
);

-- Unread starts from when the user joined, so a new user isn't greeted with the whole history.
create or replace function public.chat_unread() returns table (channel_id uuid, unread bigint)
language sql stable security invoker set search_path = '' as $$
  select m.channel_id, count(*) from public.chat_messages m
  left join public.chat_reads r on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.user_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, (select p.created_at from public.profiles p where p.user_id = auth.uid()), '-infinity'::timestamptz)
  group by m.channel_id
$$;
