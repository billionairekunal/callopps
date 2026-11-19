-- Phase 6 review fixes.

-- S13 delete in batches: PostgREST cuts every request off at 8s, so one big delete would always fail for a large
-- centre. The server calls this until remaining = 0; each call is one short transaction. The last call cleans the
-- import records and writes the audit row inside the database. Setup, users, saved reports and chat stay.
drop function if exists public.purge_org_data(uuid);
create or replace function public.purge_org_batch(org uuid, batch int, actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int; left_over bigint;
begin
  delete from public.leads where id in (select id from public.leads where org_id = org limit greatest(1, least(batch, 5000)));
  get diagnostics n = row_count; -- calls, messages, timelines, transfers and QA audits cascade with their lead
  select count(*) into left_over from public.leads where org_id = org;
  if left_over = 0 then
    delete from public.import_batches where org_id = org;
    delete from public.import_mappings where org_id = org;
    delete from public.lead_sources where org_id = org;
    insert into public.audit_log (org_id, actor_id, action, entity, entity_id, meta)
      values (org, actor, 'data.purge', 'orgs', org::text, jsonb_build_object('completed', true));
  end if;
  return jsonb_build_object('deleted', n, 'remaining', left_over);
end $$;
revoke execute on function public.purge_org_batch(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.purge_org_batch(uuid, int, uuid) to service_role;

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
  -- updateLead = false: the lead was moved to someone else mid-call; record the call, leave the lead alone.
  if coalesce((p->>'updateLead')::boolean, true) then
    update public.leads set status = p->>'status', disposition_id = (p->>'leadDispositionId')::uuid,
      next_followup_at = (p->>'followupAt')::timestamptz
      where id = c.lead_id and org_id = c.org_id
        -- re-checked here, inside the transaction, in case the lead moved after the server's check
        and (assigned_to = c.caller_id or coalesce((p->>'actorIsSuper')::boolean, false));
  end if;
  if coalesce((p->>'updateLead')::boolean, true) and (p->>'fromStatus') is distinct from (p->>'status') then
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
