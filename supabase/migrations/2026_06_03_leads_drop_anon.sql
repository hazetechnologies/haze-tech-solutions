-- Close the anon read/insert hole on `leads`. The public contact form + audit
-- page now insert via the service-role endpoint api/submit-lead.js, so anon no
-- longer needs INSERT (and the over-broad anon SELECT that leaked every lead's
-- PII can go away entirely).
--
-- APPLY ONLY AFTER the api/submit-lead.js + Contact.jsx + AuditPage.jsx deploy
-- is live, otherwise an old cached frontend would fail to capture leads.
drop policy if exists leads_anon_insert on public.leads;
drop policy if exists leads_anon_select on public.leads;
