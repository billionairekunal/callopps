-- report_data, set-based: no per-lead correlated subqueries (review: it timed out at 20k leads).
create index if not exists hist_lead_at on public.lead_status_history (org_id, lead_id, at);

create or replace function public.report_data(f jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := (f->>'org')::uuid;
  t0 timestamptz := (f->>'from')::timestamptz;
  t1 timestamptz := (f->>'to')::timestamptz;
  day_end timestamptz := (f->>'now_end')::timestamptz;
  ids_of constant text := 'select coalesce(array(select jsonb_array_elements_text(coalesce($1->%L, ''[]''))::uuid), ''{}'')';
  processes uuid[]; categories uuid[]; products uuid[]; tls uuid[]; agents uuid[]; lead_types uuid[];
  dispositions uuid[]; sources uuid[]; b_processes uuid[]; b_dispositions uuid[]; scope uuid[];
  v_statuses text[] := coalesce(array(select jsonb_array_elements_text(coalesce(f->'statuses', '[]'))), '{}');
  v_agent_status text := nullif(f->>'agent_status', '');
  v_city text := nullif(trim(f->>'city'), '');
  agent_filtered boolean;
  out jsonb;
begin
  execute format(ids_of, 'processes') using f into processes;
  execute format(ids_of, 'categories') using f into categories;
  execute format(ids_of, 'products') using f into products;
  execute format(ids_of, 'tls') using f into tls;
  execute format(ids_of, 'agents') using f into agents;
  execute format(ids_of, 'lead_types') using f into lead_types;
  execute format(ids_of, 'dispositions') using f into dispositions;
  execute format(ids_of, 'sources') using f into sources;
  execute format(ids_of, 'b_processes') using f into b_processes;
  execute format(ids_of, 'b_dispositions') using f into b_dispositions;
  if jsonb_typeof(f->'scope') = 'array' then execute format(ids_of, 'scope') using f into scope; end if;
  agent_filtered := scope is not null or cardinality(agents) > 0 or cardinality(tls) > 0 or v_agent_status is not null;

  create temp table r_agents on commit drop as
    select p.user_id, p.full_name, p.status, tl.full_name as tl_name
    from public.profiles p
    left join public.teams t on t.id = p.team_id
    left join public.profiles tl on tl.user_id = t.team_leader_id
    where p.org_id = org and p.role in ('caller', 'team_leader')
      and (scope is null or p.user_id = any(scope))
      and (cardinality(agents) = 0 or p.user_id = any(agents))
      and (cardinality(tls) = 0 or t.team_leader_id = any(tls) or p.user_id = any(tls))
      and (v_agent_status is null or p.status = v_agent_status);
  create unique index on r_agents (user_id);

  create temp table r_leads on commit drop as
    select l.id, l.process_id, l.product_id, pr.category_id, l.lead_type_id, l.disposition_id, l.assigned_to,
           l.status, l.created_at, l.next_followup_at, h.changed_at
    from public.leads l
    left join public.products pr on pr.id = l.product_id
    left join (select lead_id, max(at) as changed_at from public.lead_status_history where org_id = org group by lead_id) h on h.lead_id = l.id
    where l.org_id = org
      and (not agent_filtered or exists (select 1 from r_agents a where a.user_id = l.assigned_to))
      and (cardinality(processes) = 0 or l.process_id = any(processes))
      and (cardinality(products) = 0 or l.product_id = any(products))
      and (cardinality(categories) = 0 or pr.category_id = any(categories))
      and (cardinality(lead_types) = 0 or l.lead_type_id = any(lead_types))
      and (cardinality(dispositions) = 0 or l.disposition_id = any(dispositions))
      and (cardinality(sources) = 0 or l.source_id = any(sources))
      and (cardinality(v_statuses) = 0 or l.status = any(v_statuses))
      and (v_city is null or l.city ilike '%' || replace(replace(v_city, '%', ''), '_', '') || '%');
  create unique index on r_leads (id);
  analyze r_leads;

  -- Saved calls in range on those leads; "fresh" = the lead's first connected call ever.
  create temp table r_calls on commit drop as
    select c.id, c.lead_id, c.caller_id, c.saved_at, c.connected, c.is_followup, c.disposition_id,
           coalesce(d.counts_presentation, false) as presentation,
           (c.connected and c.id = fc.first_id) as fresh, l.process_id
    from public.calls c
    join r_leads l on l.id = c.lead_id
    left join public.dispositions d on d.id = c.disposition_id
    left join lateral (select e.id as first_id from public.calls e where e.lead_id = c.lead_id and e.connected and e.saved_at is not null
                       order by e.saved_at, e.id limit 1) fc on c.connected
    where c.org_id = org and c.saved_at >= t0 and c.saved_at < t1
      and (not agent_filtered or exists (select 1 from r_agents a where a.user_id = c.caller_id));
  create index on r_calls (lead_id);
  analyze r_calls;

  create temp table r_hist on commit drop as
    select h.lead_id, h.to_status, h.actor_id, h.at
    from public.lead_status_history h join r_leads l on l.id = h.lead_id
    where h.org_id = org and h.at >= t0 and h.at < t1 and h.from_status is not null
      and (not agent_filtered or exists (select 1 from r_agents a where a.user_id = h.actor_id));

  create temp table r_facts on commit drop as
    select l.*, (l.created_at >= t0 and l.created_at < t1) as created_in,
           coalesce(l.changed_at >= t0 and l.changed_at < t1, false) as changed_in, coalesce(c.fu, 0) as followups
    from r_leads l
    left join (select lead_id, count(*) filter (where is_followup) as fu from r_calls group by lead_id) c on c.lead_id = l.id
    where (l.created_at >= t0 and l.created_at < t1) or (l.changed_at >= t0 and l.changed_at < t1) or c.lead_id is not null;

  create temp table r_att on commit drop as
    select s.* from public.attendance_sessions s
    where s.org_id = org and s.punch_in >= t0 and s.punch_in < t1 and exists (select 1 from r_agents a where a.user_id = s.user_id);

  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from r_facts where created_in),
      'in_progress', (select count(*) from r_facts where changed_in and status = 'in_progress'),
      'won', (select count(*) from r_facts where changed_in and status = 'won'),
      'lost', (select count(*) from r_facts where changed_in and status = 'lost'),
      'overdue', (select count(*) from r_leads where status in ('new','in_progress') and next_followup_at < now()),
      'due_today', (select count(*) from r_leads where status in ('new','in_progress') and next_followup_at >= now() and next_followup_at < day_end),
      'active_agents', (select count(*) from r_agents a where exists (select 1 from r_calls c where c.caller_id = a.user_id)
                          or exists (select 1 from r_att s where s.user_id = a.user_id)),
      'followups', (select count(*) from r_calls where is_followup),
      'attendance', (select count(distinct (user_id, day)) from r_att),
      'calls', (select count(*) from r_calls),
      'connected', (select count(*) from r_calls where connected)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.d, 'followups', coalesce(c.fu, 0), 'wins', coalesce(w.n, 0), 'calls', coalesce(c.cl, 0)) order by d.d)
      from (select g::date as d from generate_series((t0 at time zone 'Asia/Kolkata')::date, ((t1 - interval '1 second') at time zone 'Asia/Kolkata')::date, interval '1 day') g) d
      left join (select (saved_at at time zone 'Asia/Kolkata')::date as d, count(*) as cl, count(*) filter (where is_followup) as fu from r_calls group by 1) c on c.d = d.d
      left join (select (at at time zone 'Asia/Kolkata')::date as d, count(*) as n from r_hist where to_status = 'won' group by 1) w on w.d = d.d), '[]'),
    'groups', coalesce((select jsonb_agg(g) from (
      select jsonb_build_object(
        'dim', case
          when grouping(process_id) = 0 and grouping(disposition_id) = 0 then 'process_disposition'
          when grouping(assigned_to) = 0 and grouping(disposition_id) = 0 then 'agent_disposition'
          when grouping(category_id) = 0 then 'category'
          when grouping(product_id) = 0 then 'product'
          when grouping(assigned_to) = 0 then 'agent'
          when grouping(status) = 0 then 'status'
          when grouping(lead_type_id) = 0 then 'lead_type'
          when grouping(process_id) = 0 then 'process'
          when grouping(disposition_id) = 0 then 'disposition'
          else 'total' end,
        'a', coalesce(category_id, product_id, lead_type_id, process_id, assigned_to,
               case when grouping(disposition_id) = 0 and grouping(process_id) = 1 and grouping(assigned_to) = 1 then disposition_id end)::text,
        's', case when grouping(status) = 0 then status end,
        'b', case when grouping(disposition_id) = 0 and (grouping(process_id) = 0 or grouping(assigned_to) = 0) then disposition_id::text end,
        'leads', count(*) filter (where created_in),
        'followups', coalesce(sum(followups), 0),
        'in_progress', count(*) filter (where changed_in and status = 'in_progress'),
        'won', count(*) filter (where changed_in and status = 'won'),
        'lost', count(*) filter (where changed_in and status = 'lost')) as g
      from r_facts
      group by grouping sets ((category_id), (product_id), (assigned_to), (status), (lead_type_id), (process_id), (disposition_id),
                              (process_id, disposition_id), (assigned_to, disposition_id), ())
    ) x), '[]'),
    'dispositions', coalesce((select jsonb_agg(jsonb_build_object('id', disposition_id, 'count', n) order by n desc) from (
      select disposition_id, count(*) as n from r_calls
      where disposition_id is not null
        and (cardinality(b_processes) = 0 or process_id = any(b_processes))
        and (cardinality(b_dispositions) = 0 or disposition_id = any(b_dispositions))
      group by disposition_id
    ) x), '[]'),
    'agents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.user_id, 'name', a.full_name, 'tl', a.tl_name, 'status', a.status,
        'calls', coalesce(c.calls, 0), 'connected', coalesce(c.connected, 0), 'followup_calls', coalesce(c.fu, 0),
        'fresh_connected', coalesce(c.fresh, 0), 'presentations', coalesce(c.pres, 0),
        'leads', coalesce(l.n, 0), 'closures', coalesce(h.won, 0), 'lost', coalesce(h.lost, 0), 'seconds', coalesce(s.secs, 0)
      ) order by a.full_name)
      from r_agents a
      left join (select caller_id, count(*) as calls, count(*) filter (where connected) as connected, count(*) filter (where is_followup) as fu,
                        count(*) filter (where fresh) as fresh, count(*) filter (where presentation) as pres from r_calls group by caller_id) c on c.caller_id = a.user_id
      left join (select assigned_to, count(*) as n from r_leads where created_at >= t0 and created_at < t1 group by assigned_to) l on l.assigned_to = a.user_id
      left join (select actor_id, count(*) filter (where to_status = 'won') as won, count(*) filter (where to_status = 'lost') as lost from r_hist group by actor_id) h on h.actor_id = a.user_id
      left join (select user_id, sum(extract(epoch from coalesce(punch_out, last_activity) - punch_in))::bigint as secs from r_att group by user_id) s on s.user_id = a.user_id
    ), '[]'),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'day', day, 'punch_in', pin, 'punch_out', pout, 'last_activity', last, 'seconds', secs, 'status', st
      ) order by day desc, pin) from (
      select s.user_id, s.day, min(s.punch_in) as pin,
        case when bool_or(s.punch_out is null) then null else max(s.punch_out) end as pout,
        max(s.last_activity) as last,
        sum(extract(epoch from coalesce(s.punch_out, s.last_activity) - s.punch_in))::bigint as secs,
        case when bool_or(s.punch_out is null) then 'active'
             when (array_agg(s.end_reason order by s.punch_in desc))[1] = 'auto' then 'auto' else 'logged_out' end as st
      from r_att s group by s.user_id, s.day
    ) x), '[]'),
    'lead_ids', case when (f->>'with_ids')::boolean then coalesce((select jsonb_agg(id) from r_facts), '[]') end,
    'hours', jsonb_build_object(
      'seconds', coalesce((select sum(extract(epoch from coalesce(punch_out, last_activity) - punch_in)) from r_att), 0)::bigint,
      'active_now', (select count(distinct s.user_id) from public.attendance_sessions s
                     where s.org_id = org and s.punch_out is null and s.last_activity > now() - interval '15 minutes'
                       and exists (select 1 from r_agents a where a.user_id = s.user_id)),
      'first_login', (select min(punch_in) from r_att),
      'last_activity', (select max(last_activity) from r_att)
    )
  ) into out;
  return out;
end $$;
revoke execute on function public.report_data(jsonb) from public, anon, authenticated;
grant execute on function public.report_data(jsonb) to service_role;
