-- S13: permanently delete a centre's customer data (leads and everything hanging off them). Setup, users and the
-- audit log stay. One transaction; service role only (the server checks Super Admin + typed confirmation).
create or replace function public.purge_org_data(org uuid) returns jsonb
language plpgsql security definer set search_path = '' set statement_timeout = '10min' as $$
declare n_leads bigint;
begin
  select count(*) into n_leads from public.leads where org_id = org;
  delete from public.qa_audits where org_id = org;
  delete from public.communications where org_id = org;
  delete from public.calls where org_id = org;
  delete from public.lead_transfers where org_id = org;
  delete from public.lead_status_history where org_id = org;
  delete from public.lead_events where org_id = org;
  delete from public.leads where org_id = org;
  delete from public.import_batches where org_id = org;
  delete from public.import_mappings where org_id = org;
  delete from public.lead_sources where org_id = org;
  delete from public.saved_reports where org_id = org;
  return jsonb_build_object('leads', n_leads);
end $$;
revoke execute on function public.purge_org_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_org_data(uuid) to service_role;
