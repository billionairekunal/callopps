-- Lets the timeline show which disposition caused each status change.
alter table public.lead_status_history add constraint lsh_disposition_same_org
  foreign key (disposition_id, org_id) references public.dispositions (id, org_id) on delete set null (disposition_id);
