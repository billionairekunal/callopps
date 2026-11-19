-- Full Data exports: optionally return the ids of the leads in the report.
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

  -- The agents in play (callers and team leaders), after agent / TL / status / scope filters.
  create temp table r_agents on commit drop as
    select p.user_id, p.full_name, p.status, p.team_id, tl.full_name as tl_name
    from public.profiles p
    left join public.teams t on t.id = p.team_id
    left join public.profiles tl on tl.user_id = t.team_leader_id
    where p.org_id = org and p.role in ('caller', 'team_leader')
      and (scope is null or p.user_id = any(scope))
      and (cardinality(agents) = 0 or p.user_id = any(agents))
      and (cardinality(tls) = 0 or t.team_leader_id = any(tls) or p.user_id = any(tls))
      and (v_agent_status is null or p.status = v_agent_status);

  -- Leads in the filter (dimension filters; agent filter only when one applies).
  create temp table r_leads on commit drop as
    select l.id, l.process_id, l.product_id, pr.category_id, l.lead_type_id, l.disposition_id, l.assigned_to,
           l.status, l.created_at, l.next_followup_at,
           (select max(h.at) from public.lead_status_history h where h.lead_id = l.id) as changed_at
    from public.leads l
    left join public.products pr on pr.id = l.product_id
    where l.org_id = org
      and (not agent_filtered or l.assigned_to in (select user_id from r_agents))
      and (cardinality(processes) = 0 or l.process_id = any(processes))
      and (cardinality(products) = 0 or l.product_id = any(products))
      and (cardinality(categories) = 0 or pr.category_id = any(categories))
      and (cardinality(lead_types) = 0 or l.lead_type_id = any(lead_types))
      and (cardinality(dispositions) = 0 or l.disposition_id = any(dispositions))
      and (cardinality(sources) = 0 or l.source_id = any(sources))
      and (cardinality(v_statuses) = 0 or l.status = any(v_statuses))
      and (v_city is null or l.city ilike '%' || replace(replace(v_city, '%', ''), '_', '') || '%');
  create index on r_leads (id);

  -- Saved calls in range on those leads (by agents in play when an agent filter applies).
  create temp table r_calls on commit drop as
    select c.id, c.lead_id, c.caller_id, c.saved_at, c.connected, c.is_followup, c.disposition_id,
           coalesce(d.counts_presentation, false) as presentation,
           (c.connected and not exists (select 1 from public.calls e where e.lead_id = c.lead_id and e.connected
              and e.saved_at is not null and e.saved_at < c.saved_at)) as fresh,
           l.process_id
    from public.calls c
    join r_leads l on l.id = c.lead_id
    left join public.dispositions d on d.id = c.disposition_id
    where c.org_id = org and c.saved_at >= t0 and c.saved_at < t1
      and (not agent_filtered or c.caller_id in (select user_id from r_agents));

  -- Status changes in range on those leads.
  create temp table r_hist on commit drop as
    select h.lead_id, h.to_status, h.actor_id, h.at
    from public.lead_status_history h join r_leads l on l.id = h.lead_id
    where h.org_id = org and h.at >= t0 and h.at < t1 and h.from_status is not null
      and (not agent_filtered or h.actor_id in (select user_id from r_agents));

  -- Per-lead facts for breakdowns: leads touched in range by creation, status change or calls.
  create temp table r_facts on commit drop as
    select l.*, (l.created_at >= t0 and l.created_at < t1) as created_in,
           (l.changed_at >= t0 and l.changed_at < t1) as changed_in,
           coalesce((select count(*) from r_calls c where c.lead_id = l.id and c.is_followup), 0) as followups
    from r_leads l
    where (l.created_at >= t0 and l.created_at < t1) or (l.changed_at >= t0 and l.changed_at < t1)
       or exists (select 1 from r_calls c where c.lead_id = l.id);

  create temp table r_att on commit drop as
    select s.* from public.attendance_sessions s
    where s.org_id = org and s.punch_in >= t0 and s.punch_in < t1 and s.user_id in (select user_id from r_agents);

  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from r_facts where created_in),
      'in_progress', (select count(*) from r_facts where changed_in and status = 'in_progress'),
      'won', (select count(*) from r_facts where changed_in and status = 'won'),
      'lost', (select count(*) from r_facts where changed_in and status = 'lost'),
      'overdue', (select count(*) from r_leads where status in ('new','in_progress') and next_followup_at < now()),
      'due_today', (select count(*) from r_leads where status in ('new','in_progress') and next_followup_at >= now() and next_followup_at < day_end),
      'active_agents', (select count(*) from (select caller_id from r_calls union select user_id from r_att) a),
      'followups', (select count(*) from r_calls where is_followup),
      'attendance', (select count(distinct (user_id, day)) from r_att),
      'calls', (select count(*) from r_calls),
      'connected', (select count(*) from r_calls where connected)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'followups', fu, 'wins', w, 'calls', cl) order by d) from (
      select d::date as d,
        (select count(*) from r_calls c where c.is_followup and (c.saved_at at time zone 'Asia/Kolkata')::date = d::date) as fu,
        (select count(*) from r_calls c where (c.saved_at at time zone 'Asia/Kolkata')::date = d::date) as cl,
        (select count(*) from r_hist h where h.to_status = 'won' and (h.at at time zone 'Asia/Kolkata')::date = d::date) as w
      from generate_series((t0 at time zone 'Asia/Kolkata')::date, ((t1 - interval '1 second') at time zone 'Asia/Kolkata')::date, interval '1 day') d
    ) x), '[]'),
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
        'calls', (select count(*) from r_calls c where c.caller_id = a.user_id),
        'connected', (select count(*) from r_calls c where c.caller_id = a.user_id and c.connected),
        'followup_calls', (select count(*) from r_calls c where c.caller_id = a.user_id and c.is_followup),
        'fresh_connected', (select count(*) from r_calls c where c.caller_id = a.user_id and c.fresh),
        'presentations', (select count(*) from r_calls c where c.caller_id = a.user_id and c.presentation),
        'leads', (select count(*) from r_leads l where l.assigned_to = a.user_id and l.created_at >= t0 and l.created_at < t1),
        'closures', (select count(*) from r_hist h where h.actor_id = a.user_id and h.to_status = 'won'),
        'lost', (select count(*) from r_hist h where h.actor_id = a.user_id and h.to_status = 'lost'),
        'seconds', coalesce((select sum(extract(epoch from coalesce(s.punch_out, s.last_activity) - s.punch_in)) from r_att s where s.user_id = a.user_id), 0)::bigint
      ) order by a.full_name) from r_agents a), '[]'),
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
                       and s.user_id in (select user_id from r_agents)),
      'first_login', (select min(punch_in) from r_att),
      'last_activity', (select max(last_activity) from r_att)
    )
  ) into out;
  return out;
end $$;
revoke execute on function public.report_data(jsonb) from public, anon, authenticated;
grant execute on function public.report_data(jsonb) to service_role;
