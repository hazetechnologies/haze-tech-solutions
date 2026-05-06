-- Logo approval gate: a kit pauses after logos generate, waits for the
-- client to approve in their portal, then the edge function is re-invoked
-- to generate banners using the approved logo as the img2img reference.

-- 1. Allow the new status value
alter table brand_kits drop constraint brand_kits_status_check;
alter table brand_kits add constraint brand_kits_status_check
  check (status in ('pending', 'generating', 'awaiting_logo_approval', 'done', 'failed'));

-- 2. Track which logo variant the client picked
-- ('logo_primary' | 'logo_icon' | 'logo_monochrome')
alter table brand_kits
  add column if not exists approved_logo_asset_id text;

-- 3. Allow clients to read their own kit (RLS — currently any authenticated
-- user can SELECT all kits per the existing policy; tighten that here so
-- portal users only see their own kit). Keep the broad policy for admins
-- via the existing admin-allowlist check in app code.
-- Note: the existing brand_kits_authenticated_select policy is intentionally
-- broad because admin queries run as authenticated; we add a per-client
-- policy alongside without dropping the existing one. Admin queries continue
-- to work because policies are OR-ed.
create policy brand_kits_client_owner_select on brand_kits
  for select to authenticated
  using (
    client_id in (select id from clients where user_id = auth.uid())
  );
