# Phase 1 Deploy Runbook
*Pairs with [`2026-05-31-haze-social-post-integration-phase1.md`](2026-05-31-haze-social-post-integration-phase1.md)*

Step-by-step to bring the haze-social-post ↔ HTS integration online. Pre-req: both PRs reviewed and approved.

- [hazetechnologies/haze-social-post#41](https://github.com/hazetechnologies/haze-social-post/pull/41) — schema + middleware + tenant CRUD + brand/FAQ push
- [hazetechnologies/haze-tech-solutions#39](https://github.com/hazetechnologies/haze-tech-solutions/pull/39) — HTS schema + proxy + activate-social + Setup tab

The two PRs **must be deployed in order** because the HTS side calls endpoints that only exist after the haze-social-post side ships AND the seed has been run.

## 1. Schema push on haze-social-post

The PR adds three Prisma models / one nullable column / one extension column. haze-social-post uses `prisma db push`, not migration files.

```bash
ssh root@srv934577.hstgr.cloud
cd /root/haze-social-post
git fetch origin
git checkout ext-api-phase1-schema   # or merge to main first then checkout main
npm install                          # pulls zod if added (it should already be present)
npx prisma db push                   # safe — all additions are nullable or have defaults
npx prisma generate                  # regenerate client for the new fields
pm2 restart haze-social-post-worker  # so the worker picks up the new client
```

Expected `db push` output: 3 tables created (`Integrator`, `ExternalApiKey`), 1 column added to `User` (`integrator_id`), 1 column added to `BrandProfile` (`extraJson`), 2 indexes.

## 2. Mint the HTS bearer key

Still on the VPS:

```bash
cd /root/haze-social-post
npx tsx scripts/seed-hts-integrator.ts
```

The script prints the plaintext token **exactly once** in a bordered block. Copy it immediately — there's no way to recover it later (only the sha256 hash lives in the DB).

To rotate later:

```bash
REVOKE_EXISTING=1 npx tsx scripts/seed-hts-integrator.ts
```

That revokes all current keys for HTS and prints a fresh one.

## 3. Paste into HTS admin/secrets

1. Sign into HTS as admin.
2. Open `/admin/secrets`.
3. Find the `HSP_EXTERNAL_API_KEY` row (created by the migration in PR #39 — empty by default).
4. Paste the plaintext token. Save.

The `getSetting('HSP_EXTERNAL_API_KEY')` helper used by `api/website?action=hsp-proxy` and `action=activate-social` caches for 60s, so allow up to a minute for the change to take effect on warm Vercel instances.

## 4. Merge the PRs

Once schema + key are in place, merge in this order:

```bash
gh pr merge 41 -R hazetechnologies/haze-social-post --squash --delete-branch
gh pr merge 39 -R hazetechnologies/haze-tech-solutions --squash --delete-branch
```

Vercel auto-deploys both.

## 5. Smoke test

On Vercel preview (or production after merge):

1. `/admin/clients/<segula-id>` → "Social Media" tab.
2. Click **Activate social media**.
3. Expected response within ~2 seconds: green "Activated" banner with the haze-social-post tenant id; "Brand kit synced" confirmation.
4. Verify on haze-social-post (admin → users): a new User with email `info@mysegulamanagement.com`, plan=PRO, integrator_id matching the HTS Integrator row. BrandProfile row populated with palette, voice tone, logo URL.

## 6. Common failures & fixes

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `not_configured: HSP_EXTERNAL_API_KEY not set` | Step 3 was skipped or the cached null value hasn't expired | Confirm the row in admin_settings has a value; wait 60s or restart Vercel function |
| `tenant_create_failed: invalid or revoked key` | Plaintext mismatch (typo on paste) or key was revoked | Re-run step 2 with `REVOKE_EXISTING=1`, repaste |
| `tenant_create_failed: email already in use by a non-integrator user` | A real haze-social-post self-signup user has the same email as the HTS client | Either change the HTS client's `email` field or manually migrate the existing User by setting `integrator_id` on it |
| Brand push succeeds but BrandProfile fields look empty in haze-social-post | HTS brand kit has no `assets` yet | Generate a brand kit on HTS first, then re-click Activate (it's idempotent — re-push is safe) |
| Activate succeeds but the next click 500s | Likely a stale Vercel function with the old api/website.js | Trigger a fresh deploy: `vercel --prod` or push a no-op commit |

## 7. Rollback

If Phase 1 needs to be reverted in a hurry:

1. Revert the merge of PR #41 + PR #39 (or revert just one — the HTS side fails open if it can't reach the haze-social-post endpoint).
2. On the VPS, run the rollback SQL:
   ```sql
   ALTER TABLE "User" DROP COLUMN "integrator_id";
   ALTER TABLE "BrandProfile" DROP COLUMN "extraJson";
   DROP TABLE "ExternalApiKey";
   DROP TABLE "Integrator";
   ```
3. On HTS, drop the column:
   ```sql
   ALTER TABLE clients DROP COLUMN hsp_user_id;
   DELETE FROM admin_settings WHERE key = 'HSP_EXTERNAL_API_KEY';
   ```
4. Vercel auto-redeploys the reverted code.

All additions are nullable / new-table — no existing data is lost on either rollback.
