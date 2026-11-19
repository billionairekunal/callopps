-- Save a call whose lead was moved to someone else mid-call (lead left unchanged).
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
      where id = c.lead_id and org_id = c.org_id;
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
