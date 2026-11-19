-- Phase 5: communications, templates, QA audits, internal chat.

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  channel text not null check (channel in ('whatsapp', 'sms')),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.communications (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'sms')),
  template_id uuid references public.message_templates(id) on delete set null,
  body text not null default '',
  at timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (user_id, org_id) on delete cascade
);
create index on public.communications (org_id, at desc);
create index on public.communications (org_id, user_id, channel, at);

create table public.qa_checklists (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  items jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.qa_audits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  call_id uuid not null unique references public.calls(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid not null,
  auditor_id uuid not null,
  scores jsonb not null,
  score int not null check (score between 0 and 100),
  remarks text not null default '',
  created_at timestamptz not null default now(),
  foreign key (agent_id, org_id) references public.profiles (user_id, org_id) on delete cascade
);
create index on public.qa_audits (org_id, created_at desc);
create index on public.qa_audits (org_id, agent_id);

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('org', 'team', 'dm')),
  name text not null,
  team_id uuid references public.teams(id) on delete cascade,
  dm_key text, -- "smaller-uuid:larger-uuid" for direct messages
  created_at timestamptz not null default now(),
  unique (org_id, dm_key)
);
create unique index chat_one_org_channel on public.chat_channels (org_id) where kind = 'org';
create unique index chat_one_team_channel on public.chat_channels (team_id) where kind = 'team';

create table public.chat_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table public.chat_messages (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.chat_messages (channel_id, created_at desc);

create table public.chat_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- Who may read/post in a channel: everyone in the org (org), the team plus super admins (team), members (dm).
create or replace function app.can_chat(ch uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels c
    where c.id = ch and c.org_id = app.org_id() and (
      c.kind = 'org'
      or (c.kind = 'team' and (c.team_id = app.team_id() or app.is_role('super_admin')))
      or (c.kind = 'dm' and exists (select 1 from public.chat_members m where m.channel_id = c.id and m.user_id = auth.uid()))
    )
  )
$$;
grant execute on function app.can_chat(uuid) to authenticated;

alter table public.message_templates enable row level security;
create policy member_read on public.message_templates for select to authenticated using (org_id = app.org_id());

alter table public.communications enable row level security;
create policy comms_read on public.communications for select to authenticated using (
  org_id = app.org_id() and (
    app.is_role('super_admin')
    or (app.is_role('team_leader') and (user_id = auth.uid() or user_id in (select app.team_member_ids())))
    or (app.is_role('caller') and user_id = auth.uid())
  )
);

alter table public.qa_checklists enable row level security;
create policy member_read on public.qa_checklists for select to authenticated using (org_id = app.org_id());

alter table public.qa_audits enable row level security;
create policy qa_read on public.qa_audits for select to authenticated using (
  org_id = app.org_id() and (
    app.is_role('super_admin', 'admin')
    or (app.is_role('team_leader') and (agent_id = auth.uid() or agent_id in (select app.team_member_ids())))
    or agent_id = auth.uid()
  )
);

alter table public.chat_channels enable row level security;
create policy chat_read on public.chat_channels for select to authenticated using (app.can_chat(id));
alter table public.chat_members enable row level security;
create policy chat_read on public.chat_members for select to authenticated using (app.can_chat(channel_id));
alter table public.chat_messages enable row level security;
create policy chat_read on public.chat_messages for select to authenticated using (app.can_chat(channel_id));
create policy chat_post on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and org_id = app.org_id() and app.can_chat(channel_id));
alter table public.chat_reads enable row level security;
create policy own_reads on public.chat_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and app.can_chat(channel_id));

grant select on public.message_templates, public.communications, public.qa_checklists, public.qa_audits,
  public.chat_channels, public.chat_members, public.chat_messages to authenticated;
grant insert (org_id, channel_id, body) on public.chat_messages to authenticated;
grant select, insert, update on public.chat_reads to authenticated;
grant usage on sequence public.chat_messages_id_seq to authenticated;
revoke insert, update, delete on public.message_templates, public.communications, public.qa_checklists, public.qa_audits,
  public.chat_channels, public.chat_members from authenticated, anon;
grant all on public.message_templates, public.communications, public.qa_checklists, public.qa_audits,
  public.chat_channels, public.chat_members, public.chat_messages, public.chat_reads to service_role;
grant all on all sequences in schema public to service_role;

-- Unread counts per channel for the current user (RLS applies: invoker).
create or replace function public.chat_unread() returns table (channel_id uuid, unread bigint)
language sql stable security invoker set search_path = '' as $$
  select m.channel_id, count(*) from public.chat_messages m
  left join public.chat_reads r on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.user_id <> auth.uid() and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by m.channel_id
$$;
grant execute on function public.chat_unread() to authenticated;

alter publication supabase_realtime add table public.chat_messages;
