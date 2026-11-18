-- CallOpps foundation: tenancy, roles, setup tables, audit log. RLS on everything.
create schema if not exists app;

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  idle_timeout_minutes int not null default 30 check (idle_timeout_minutes between 5 and 240),
  ai_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.org_keys (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  key_id text not null,
  data_key_wrapped text not null,
  hash_key_wrapped text not null
);

create table public.platform_operators (user_id uuid primary key references auth.users(id) on delete cascade);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  team_leader_id uuid references auth.users(id) on delete set null
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  full_name text not null default '',
  role text not null check (role in ('super_admin','admin','team_leader','caller')),
  team_id uuid references public.teams(id) on delete set null,
  status text not null default 'active' check (status in ('active','deactivated')),
  created_at timestamptz not null default now()
);

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

create table public.team_processes (
  team_id uuid not null references public.teams(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  primary key (team_id, process_id)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null
);

create table public.lead_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null
);

create table public.dispositions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  process_id uuid references public.processes(id) on delete cascade,
  label text not null,
  outcome text not null check (outcome in ('in_progress','won','lost')),
  counts_presentation boolean not null default false,
  sort int not null default 0
);

create table public.login_attempts (
  id bigserial primary key,
  email text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index on public.login_attempts (email, attempted_at desc);

create table public.audit_log (
  id bigserial primary key,
  org_id uuid references public.orgs(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on public.audit_log (org_id, at desc);

do $$ declare t text; begin
  foreach t in array array['teams','profiles','processes','team_processes','product_categories','products','lead_types','dispositions'] loop
    execute format('create index on public.%I (org_id)', t);
  end loop;
end $$;

-- Helpers: read the caller's active profile. security definer avoids RLS recursion.
create or replace function app.org_id() returns uuid language sql stable security definer set search_path = '' as
$$ select org_id from public.profiles where user_id = auth.uid() and status = 'active' $$;
create or replace function app.role() returns text language sql stable security definer set search_path = '' as
$$ select role from public.profiles where user_id = auth.uid() and status = 'active' $$;
create or replace function app.team_id() returns uuid language sql stable security definer set search_path = '' as
$$ select team_id from public.profiles where user_id = auth.uid() and status = 'active' $$;
create or replace function app.is_role(variadic roles text[]) returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((select role from public.profiles where user_id = auth.uid() and status = 'active') = any(roles), false) $$;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

alter table public.orgs enable row level security;
alter table public.org_keys enable row level security;           -- no policies: service role only
alter table public.platform_operators enable row level security; -- no policies: service role only
alter table public.login_attempts enable row level security;     -- no policies: service role only
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Setup tables: members read, super_admin/admin write, always inside own org.
do $$ declare t text; begin
  foreach t in array array['teams','processes','team_processes','product_categories','products','lead_types','dispositions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_read on public.%I for select to authenticated using (org_id = app.org_id())', t);
    execute format($p$create policy admin_write on public.%I for all to authenticated
      using (org_id = app.org_id() and app.is_role('super_admin','admin'))
      with check (org_id = app.org_id() and app.is_role('super_admin','admin'))$p$, t);
  end loop;
end $$;

create policy own_org_read on public.orgs for select to authenticated using (id = app.org_id());
create policy super_admin_update on public.orgs for update to authenticated
  using (id = app.org_id() and app.is_role('super_admin')) with check (id = app.org_id());

-- Profiles: own row; admins see org; TLs see their team. Writes only via service role.
create policy profile_read on public.profiles for select to authenticated using (
  user_id = auth.uid()
  or (org_id = app.org_id() and (app.is_role('super_admin','admin')
      or (app.is_role('team_leader') and team_id = app.team_id())))
);

-- Audit log: append-only. Insert as yourself; only super_admin reads.
create policy audit_insert on public.audit_log for insert to authenticated
  with check (org_id = app.org_id() and actor_id = auth.uid());
create policy audit_read on public.audit_log for select to authenticated
  using (org_id = app.org_id() and app.is_role('super_admin'));
revoke update, delete, truncate on public.audit_log from authenticated, anon;
