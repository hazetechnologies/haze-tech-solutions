# Website delivery: deploy, preview, approve

**Date:** 2026-10-08
**Status:** design
**Blocks:** `2026-10-08-website-template-system-design.md` — the experiential
line cannot be sold until a client can see what they bought.

## The gap

Live products: **Website — Starter $1,500, Growth $3,500, Pro $7,500**, the
Website + Social bundle at **$14,000**, and Website Maintenance at
**$99 / $199 / $399 per month**.

What the funnel does at the end of a paid build:

| Step | Reality |
|---|---|
| Deploy | No deploy step exists anywhere in `api/website.js` or the scaffold function. |
| Handover | No repo transfer, collaborator invite or domain logic exists. The repo is created `private` in `hazetechnologies` and stays there. |
| What the client sees | `PortalDashboard.jsx:152` — **"Ready — your dev team has your files."** |
| What the client is emailed | `website.done` in the registry — *"Your website project has finished generating. Reach out to your team for next steps."* |

A client pays up to $7,500 and is told somebody else has their files. There is
no URL, no screenshot, no approval, and no way to ask for a change.

Every template concept in the sibling spec makes this worse rather than better:
the more striking the build, the larger the distance between what was sold and
what was handed over.

## Hosting model

The maintenance products ($99–$399/mo, recurring) only have something to
maintain if Haze Tech hosts. So:

**Deploy under the Haze Tech Vercel team. The client gets a live URL. The repo
stays in the org.** Maintenance is the recurring line on a site we operate, not
a support contract on code someone else holds.

This is a business decision encoded in the architecture — if the intent is to
hand repos over at the end of a build, the deploy target, the domain flow and
the upgrade path all change, and this spec needs reworking before it is built.

Operating cost follows the same logic: N client sites are N Vercel projects on
the team, consuming build minutes and bandwidth. That cost is what the
maintenance tier covers. A site with no maintenance plan is a cost with no
offsetting revenue, which is an argument for maintenance being attached rather
than optional.

## Flow

```
scaffold done (repo + content.json exist)
  → deploying        create Vercel project linked to the repo; first build runs
  → preview_ready    preview_url stored; client emailed; portal shows the site
      ├── client clicks Approve          → approved  → operator attaches domain → live
      └── client requests changes + note → changes_requested
            → operator (or AI) edits content → push → redeploy → preview_ready
```

## Schema

New statuses — extends the `website_projects_status_check` CHECK constraint.
`done` is retained so existing rows stay valid:

```
intake_pending, intake_submitted, generating, done,
deploying, preview_ready, changes_requested, approved, live, failed
```

New columns on `website_projects`:

| Column | Purpose |
|---|---|
| `vercel_project_id` | the Vercel project this site deploys to |
| `preview_url` | the `*.vercel.app` URL the client reviews |
| `live_url` | the custom domain once attached |
| `approved_at` | when the client signed off |

New table `website_revisions` — one row per change request, so the history is
a record rather than a field that gets overwritten:

```
id, project_id, note, requested_by, created_at, resolved_at
```

**Migrations are applied by hand** in the Supabase SQL editor. The Management
API is blocked by the auto-mode classifier in this environment, so the
migration ships as a `.sql` file for the operator to run, the way
`_manual_2026_08_08_fix_admin_rls.sql` did.

## Credentials

Two settings, DB-first in `admin_settings` per the repo convention, so they are
rotatable from `/admin/settings` without a redeploy:

- `vercel_api_token` — scoped to the Haze Tech team
- `vercel_team_id`

**Neither exists today** (`admin_settings` currently holds Stripe, SMTP, OpenAI
and chatbot keys and nothing Vercel). This is the one thing in this spec that
cannot be built without the operator: an API token is a credential.

Everything else is built so that it degrades honestly — with no token, the
deploy action returns `vercel_not_configured` and the project stays at `done`
exactly as it does now. Nothing regresses while the token is missing.

## API actions

Added to the `api/website.js` router rather than new files, per the existing
convention:

| Action | Caller | Does |
|---|---|---|
| `deploy` | admin | create or reuse the Vercel project for the repo, trigger a build, set `deploying` |
| `deploy-status` | admin | poll the Vercel deployment; on READY store `preview_url` and set `preview_ready` |
| `approve-site` | client or admin | set `approved`, stamp `approved_at`, notify admin |
| `request-changes` | client | insert a `website_revisions` row, set `changes_requested`, notify admin |
| `attach-domain` | admin | add the client's domain to the Vercel project, store `live_url`, set `live` |

Authorisation mirrors `approveLogo`: bearer token, resolve the caller, allow
the owning client or an admin. Not a new auth pattern.

## Notifications

Extends the existing registry, which already carries `website.intake_requested`,
`website.intake_submitted`, `website.done` and `website.failed`:

| Event | Audience |
|---|---|
| `website.preview_ready` | client — "your site is ready to review", links to the preview |
| `website.changes_requested` | admin — carries the client's note |
| `website.approved` | admin — ready to attach the domain |
| `website.live` | client — the real URL |

`website.done`'s copy is rewritten. Telling a client their project "finished
generating — reach out to your team" is the text version of the same gap.

## Portal

`PortalDashboard.jsx:152` stops saying "your dev team has your files" and
becomes the review surface: the preview in an iframe with an **Open in a new
tab** link, an **Approve** button, and a **Request changes** box.

One honest constraint: the preview iframe is a live third-party page, so it
gets `sandbox` and a visible fallback link. A 3D or video template will not
feel right in a small frame — for the experiential line the primary action is
the new-tab link, with the iframe as a thumbnail rather than the main event.

## Revision loop

A change request stores the client's note. Two ways to service it:

1. **Operator edits `content.json`** and pushes. Vercel redeploys; the webhook
   or the next poll returns the project to `preview_ready`.
2. **Targeted regeneration** — the note is fed back to the generator for the
   specific sections it concerns, rather than regenerating the whole site. This
   only works once the per-template contract from the sibling spec lands, since
   that is what makes sections individually addressable.

Build (1) now; (2) follows the contract work.

## Unverified: the Vercel API surface

No Vercel token exists yet, so **not one call in `api/_lib/vercel.js` has ever
been executed.** The endpoint versions (`/v9/projects`, `/v11/projects`,
`/v6/deployments`, `/v10/.../domains`) and the response shapes this code reads
are taken from Vercel's documentation, not from a live response. The pure
helpers around them are tested; the HTTP layer is not, and cannot be until a
token is saved.

First run with a real token is therefore a verification step, not a formality,
and the first client site must not be the thing it is verified on.

**The preview URL must come from the API, never be constructed.**
`<project>.vercel.app` is a global namespace and project names are derived from
`slugify(client.name)`, so `acme-website` may already belong to someone else.
`resolvePreviewUrl` returns `{ url, confirmed }` and a project only reaches
`preview_ready` when `confirmed` is true — an unconfirmed guess is held back
rather than emailed to a client who would land on a 404 or a stranger's site.

## Failure behaviour

- No Vercel token → `vercel_not_configured`, project stays at `done`. No
  regression against today's behaviour.
- Vercel project creation fails → `failed` with the Vercel error, same as the
  scaffold's existing failure path.
- Build fails on Vercel → `failed` carrying the deployment's error, with a link
  to the Vercel build log. A client must never see a broken preview — the
  status gate is what keeps `preview_ready` honest.
- Domain already attached elsewhere → surfaced to the operator, not the client.
- `deploy` called twice → reuses the existing `vercel_project_id` rather than
  creating a duplicate project. The action is idempotent on the project, and
  re-running it triggers a fresh deployment. Two *concurrent* calls both miss
  on the read and both create; the loser catches the conflict and re-reads,
  because check-then-create is a race and the project it wanted now exists.
- Vercel reports no production alias → the project stays out of
  `preview_ready`. A guessed URL is never presented to a client.

## Build order

1. Migration SQL + `admin_settings` entries for the two Vercel keys.
2. `api/_lib/vercel.js` — create project, trigger deploy, read deployment
   status, attach domain. Behind a `vercelConfigured()` check throughout.
3. `deploy` / `deploy-status` actions, wired to run after a successful scaffold.
4. Portal review surface + `approve-site` / `request-changes`.
5. `attach-domain` and the `live` state.

## Out of scope

- Transferring repos to clients. If that becomes the model, this spec changes.
- Staging vs production environments per client site. One preview URL that
  becomes the live site is the right amount of machinery at this size.
- Automated visual QA of generated sites. The `website-testing-agent` skill
  already covers post-deploy testing and is the natural follow-up once sites
  actually deploy.
