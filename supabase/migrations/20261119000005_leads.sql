-- Phase 2: leads, timeline, transfers, imports. Same-org composite keys everywhere.
create extension if not exists pg_trgm with schema extensions;

-- Same-org keys on parents (closes Phase 1 review minor: cross-org references).
alter table public.teams add constraint teams_id_org unique (id, org_id);
alter table public.processes add constraint processes_id_org unique (id, org_id);
alter table public.products add constraint products_id_org unique (id, org_id);
alter table public.product_categories add constraint product_categories_id_org unique (id, org_id);
alter table public.lead_types add constraint lead_types_id_org unique (id, org_id);
alter table public.dispositions add constraint dispositions_id_org unique (id, org_id);
alter table public.profiles add constraint profiles_user_org unique (user_id, org_id);

alter table public.profiles add constraint profiles_team_same_org
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete set null (team_id);
alter table public.teams add constraint teams_leader_same_org
  foreign key (team_leader_id, org_id) references public.profiles (user_id, org_id) on delete set null (team_leader_id);
alter table public.products add constraint products_category_same_org
  foreign key (category_id, org_id) references public.product_categories (id, org_id) on delete set null (category_id);
alter table public.team_processes add constraint tp_team_same_org
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade;
alter table public.team_processes add constraint tp_process_same_org
  foreign key (process_id, org_id) references public.processes (id, org_id) on delete cascade;
alter table public.dispositions add constraint dispositions_process_same_org
  foreign key (process_id, org_id) references public.processes (id, org_id) on delete cascade;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  phone_enc text not null,
  phone_hash text not null,
  phone_last4 text not null,
  alt_phone_enc text, alt_phone_hash text, alt_phone_last4 text,
  name text,
  email_enc text, email_hash text, email_mask text,
  city text,
  process_id uuid, product_id uuid, lead_type_id uuid, source_id uuid, disposition_id uuid,
  status text not null default 'new' check (status in ('new','in_progress','won','lost')),
  assigned_to uuid,
  extra jsonb not null default '{}',
  sensitive_enc text,
  next_followup_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (process_id, org_id) references public.processes (id, org_id) on delete set null (process_id),
  foreign key (product_id, org_id) references public.products (id, org_id) on delete set null (product_id),
  foreign key (lead_type_id, org_id) references public.lead_types (id, org_id) on delete set null (lead_type_id),
  foreign key (source_id, org_id) references public.lead_sources (id, org_id) on delete set null (source_id),
  foreign key (disposition_id, org_id) references public.dispositions (id, org_id) on delete set null (disposition_id),
  foreign key (assigned_to, org_id) references public.profiles (user_id, org_id) on delete set null (assigned_to)
);
create index on public.leads (org_id, phone_hash);
create index on public.leads (org_id, alt_phone_hash);
create index on public.leads (org_id, assigned_to);
create index on public.leads (org_id, status);
create index on public.leads (org_id, created_at desc);
create index on public.leads (org_id, phone_last4);
create index leads_name_trgm on public.leads using gin (name extensions.gin_trgm_ops);

create or replace function app.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger leads_touch before update on public.leads for each row execute function app.touch_updated_at();

create table public.lead_events (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  actor_id uuid,
  at timestamptz not null default now()
);
create index on public.lead_events (lead_id, at desc);

create table public.lead_status_history (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_status text, to_status text not null, disposition_id uuid,
  actor_id uuid,
  at timestamptz not null default now()
);
create index on public.lead_status_history (lead_id, at desc);
create index on public.lead_status_history (org_id, at desc);

create table public.lead_transfers (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_user uuid, to_user uuid not null, reason text not null default '',
  by_user uuid not null,
  at timestamptz not null default now()
);
create index on public.lead_transfers (org_id, at desc);

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_name text not null,
  headers text[] not null,
  mapping jsonb not null,
  sensitive text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (org_id, source_name)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_id uuid,
  file_name text not null,
  total int not null default 0, imported int not null default 0, skipped int not null default 0, invalid int not null default 0,
  status text not null default 'running' check (status in ('running','done','failed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (source_id, org_id) references public.lead_sources (id, org_id) on delete set null (source_id)
);

-- Helpers for team scoping (respect the MFA gate via app.active_profile()).
create or replace function app.team_member_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.user_id from public.profiles p
  where p.status = 'active' and p.team_id is not null
    and p.team_id = app.team_id() and p.org_id = app.org_id()
$$;
create or replace function app.my_process_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select tp.process_id from public.team_processes tp
  where tp.team_id = app.team_id() and tp.org_id = app.org_id()
$$;
grant execute on all functions in schema app to authenticated;

alter table public.leads enable row level security;
create policy lead_read on public.leads for select to authenticated using (
  org_id = app.org_id() and (
    app.is_role('super_admin','admin')
    or (app.is_role('team_leader') and (assigned_to = auth.uid() or assigned_to in (select app.team_member_ids())))
    or (app.is_role('caller') and assigned_to = auth.uid()
        and (process_id is null or process_id in (select app.my_process_ids())))
  )
);
create policy lead_admin_insert on public.leads for insert to authenticated
  with check (org_id = app.org_id() and app.is_role('super_admin','admin'));
create policy lead_admin_delete on public.leads for delete to authenticated
  using (org_id = app.org_id() and app.is_role('super_admin','admin'));
create policy lead_admin_update on public.leads for update to authenticated
  using (org_id = app.org_id() and app.is_role('super_admin','admin'))
  with check (org_id = app.org_id());
create policy lead_tl_update on public.leads for update to authenticated
  using (org_id = app.org_id() and app.is_role('team_leader')
         and (assigned_to = auth.uid() or assigned_to in (select app.team_member_ids())))
  with check (org_id = app.org_id()
         and (assigned_to is null or assigned_to = auth.uid() or assigned_to in (select app.team_member_ids())));

-- Timeline tables: visible with their lead; written only by the server (service role).
do $$ declare t text; begin
  foreach t in array array['lead_events','lead_status_history','lead_transfers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy with_lead on public.%I for select to authenticated using (org_id = app.org_id() and exists (select 1 from public.leads l where l.id = lead_id))', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

alter table public.lead_sources enable row level security;
create policy member_read on public.lead_sources for select to authenticated using (org_id = app.org_id());
create policy admin_write on public.lead_sources for all to authenticated
  using (org_id = app.org_id() and app.is_role('super_admin','admin'))
  with check (org_id = app.org_id() and app.is_role('super_admin','admin'));

do $$ declare t text; begin
  foreach t in array array['import_mappings','import_batches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy admin_all on public.%I for all to authenticated
      using (org_id = app.org_id() and app.is_role('super_admin','admin'))
      with check (org_id = app.org_id() and app.is_role('super_admin','admin'))$p$, t);
  end loop;
end $$;

grant select, insert, update, delete on public.leads, public.lead_sources, public.import_mappings, public.import_batches to authenticated;
grant select on public.lead_events, public.lead_status_history, public.lead_transfers to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
