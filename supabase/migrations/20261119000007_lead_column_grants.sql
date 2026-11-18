-- Review fix I5: users may only change workflow columns on leads. Encrypted fields, hashes,
-- extra/sensitive data, process and org are written by the server (service role) only.
revoke update on public.leads from authenticated;
grant update (assigned_to, status, disposition_id, next_followup_at) on public.leads to authenticated;
