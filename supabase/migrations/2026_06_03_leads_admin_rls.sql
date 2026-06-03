-- Tighten leads write/read for authenticated users.
-- Previously `leads_auth_all` granted ALL operations to ANY authenticated user,
-- so a logged-in client could read/update/DELETE arbitrary leads from the
-- browser (exposed by the new admin lead edit/delete UI). Restrict to admins
-- (public.is_admin() = the user has no clients row).
--
-- The public contact form's anon INSERT (and the post-insert SELECT it relies
-- on) are intentionally left in place. NOTE: `leads_anon_select` lets anon read
-- all leads — a separate pre-existing leak to close by routing the contact-form
-- insert through a service-role endpoint and dropping the anon SELECT.

drop policy if exists leads_auth_all on public.leads;

create policy leads_admin_select on public.leads
  for select to authenticated using (public.is_admin());

create policy leads_admin_update on public.leads
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy leads_admin_delete on public.leads
  for delete to authenticated using (public.is_admin());
