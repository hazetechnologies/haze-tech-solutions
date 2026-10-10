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

This is not a new decision. It is already what the published products say, and
the evidence is in the live product rows:

- **Website — Starter ($1,500)** lists *"Custom domain wired up + Vercel
  deploy"* as a feature. A managed deploy is the sold deliverable. (It is also
  a feature the funnel does not currently perform — see the gap above.)
- **No website product mentions source code, a repository, or code ownership
  in any bullet.** Nothing was ever sold that a handover would satisfy.
- Every maintenance tier reads *"Monthly retainer for sites built on
  Website — X"* and lists uptime monitoring, monthly Lighthouse reports and
  4/8/16 hours of edits. All of that presumes we operate the site.
- **Growth wires the client's contact form into the Haze Tech leads table**
  ("same place audit submissions land") and its CMS "into your admin". The
  generated site is a client of this platform, not a standalone artifact.
  Handing over the repo hands over something that stops working when it leaves.

The repo also contains the template itself. Handing it over hands over the
`template-<id>` source — and, for the experiential line, the 3D scene library
that is the differentiator.

**What the client owns outright, and should be told so plainly:** their domain,
their content and copy, their brand kit, and their leads. The domain must live
in the client's own registrar account pointed at our hosting — never held by
us. That single rule is what separates a hosting model from hostage-taking.

**Exit path.** A no-handover model is only fair with a way out. The clean one
is a paid **static export**: the rendered site as HTML/CSS/JS that the client
can host anywhere, which satisfies "do I own my site" without shipping the
template source. Price it deliberately; it is a product, not a favour.

Operating cost follows the same logic: N client sites are N Vercel projects on
the team, consuming build minutes and bandwidth. That cost is what the
maintenance tier covers. A site with no maintenance plan is a cost with no
offsetting revenue, which is an argument for maintenance being attached rather
than optional.

## Flow

```
scaffold done (repo + content.json exist)
  → [operator clicks Publish]
  → deploying        Vercel project created/reused; a production build is asked for
  → preview_ready    preview_url stored; client emailed; portal shows the site
      ├── client clicks Approve          → approved
      │     → operator enters the domain → DNS records returned
      │     → operator re-runs once DNS is added → live (only when Vercel verifies)
      └── client requests changes + note → changes_requested
            → operator (or AI) edits content → push → redeploy → preview_ready
```

**The deploy is operator-triggered, not automatic on scaffold completion.** The
copy on a generated site is AI-written, and the deploy is what emails a paying
client a link to it. One human read before that email is cheap; an unreviewed
hero headline in front of a client is not. The button lives in the same admin
tab the operator is already in when the scaffold finishes.

A Vercel build takes minutes and nobody is obliged to sit on the page, so
`cron-website-deploy-watch` (every 5 minutes) advances any project left in
`deploying`. The admin UI polls the same endpoint while it is open, so the two
race by design — see the concurrency rule below.

## Concurrency: one status change, one email

Every status write is a **compare-and-swap on the status that was read**, and
the notification fires only for the caller that won the swap. The admin UI poll
and the cron will both observe the same finished build; without the CAS they
would both email the client, and "your site is ready" arriving twice is the kind
of detail that makes a $7,500 deliverable feel amateur.

The delivery actions also write `notified_status` alongside `status`. The
existing `cron-notify-status` watcher emits events for transitions it discovers;
these actions emit their own immediately. Writing both keeps the watcher from
finding a pending transition, so the guarantee holds even if one of these
statuses is later added to `STATUS_EVENTS`.

One consequence worth stating: the stalled-alias timeout is measured from the
write that set `deploying`, so **a poll that changes nothing must not touch
`updated_at`** — otherwise the clock resets on every tick and the timeout can
never fire. The poller returns its progress message in the response instead of
persisting it.

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
| `attach-domain` | admin | add the client's domain, report its DNS records, and set `live` **only once Vercel reports it verified** |
| `resolve-changes` | admin | close open change requests serviced outside our deploy path, and tell the client |
| `cron-website-deploy-watch` | cron | advance any project stuck in `deploying` when nobody is watching |

**`attach-domain` is re-runnable on purpose.** Attaching a domain and a domain
resolving are different events: Vercel accepts the name immediately but serves
the site only once DNS points at it. The first call returns the exact records
for the operator to add at the client's registrar; a later call finds the domain
verified and takes the site live. `live_url` stays unset until then, because a
stored URL appears in the client's portal and a link to a domain still pointing
at their old host is worse than no link.

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
| `website.changes_published` | client — the change they asked for has shipped |

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

## Post-launch edits go live, and the product says so

Once a custom domain is attached, a deploy IS the client's live site. Vercel
also rebuilds production on **any push to the linked repo**, so this is true
whether or not the deploy goes through our action — disabling that would mean
an ignored-build-step shim and a promote pipeline, i.e. the per-client staging
environment this spec has already ruled out.

The resolution is honesty rather than machinery:

- A change request on a `live` site records the note and emails the operator,
  but **does not move the project out of `live`.** A status of
  `changes_requested` would advertise a preview-and-approve cycle that does not
  run for a site already serving on the client's domain.
- The client's portal acknowledges the open request in place, so sending one
  visibly does something.
- The admin button reads **"Redeploy (updates the live site)"** once a domain is
  attached, instead of looking like a harmless preview refresh.

So the lifecycle has two halves, and the discriminator is whether a custom
domain is attached:

```
pre-launch:   done → deploying → preview_ready → approved → live
post-launch:  live → deploying → live
```

A post-launch redeploy returns to `live` rather than `preview_ready` — there is
no staging copy for a live site to be a preview *of*, and telling a client with
a running website that it is "ready to review" is nonsense. Arriving back at
`live` **resolves the open change requests**, because the build that just
shipped is what the client's visitors now see, and emits
`website.changes_published`: the only thing that tells a maintenance client
their edit went out. A redeploy that serviced nothing stays silent — re-sending
"your site is live" for routine rebuilds would train clients to ignore these.

`resolve-changes` (admin) is the escape hatch for work that went out another
way. **A direct push to the linked repo builds on Vercel without our code
running at all**, so nothing would close those requests and the operator's queue
would fill with work already done. One button, and the client is told, because
clicking it is the operator saying it is finished.

Revisit this if per-client staging is ever in scope. It is the right answer at a
larger size; it is not the right first thing to build on an API surface where no
call has yet been executed.

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

`triggerDeployment` is in this category and deserves calling out: creating a
Vercel project with `gitRepository` links the repo but does **not** build it, so
an existing repo with no new push would sit at zero deployments — from the
outside indistinguishable from a broken deploy. The build is therefore requested
explicitly via `POST /v13/deployments`. That request shape is from the docs and
has never been executed.

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

1. ✅ Migration SQL + `admin_settings` entries for the two Vercel keys.
2. ✅ `api/_lib/vercel.js` — create project, trigger deploy, read deployment
   status, attach domain. Behind a `vercelConfigured()` check throughout.
3. ✅ `deploy` / `deploy-status` actions + `cron-website-deploy-watch`.
4. ✅ Portal review surface + `approve-site` / `request-changes`.
5. ✅ `attach-domain` and the `live` state.

The state machine itself lives in `api/_lib/website-delivery.js` as pure
functions over plain values, Deno-tested. It decides whether a paying client
gets emailed a link, which is not a thing to leave untested because it happens
to sit inside a request handler.

**Still blocked on the operator, and only this:** the Vercel API token in
`/admin/settings`, and running
`supabase/migrations/_manual_2026_10_08_website_delivery.sql`. Until both land,
`deploy` answers `vercel_not_configured` and every project stays at `done`,
exactly as before.

## Out of scope

- Transferring repos to clients. Settled, not deferred: the published products
  sell a managed deploy and never mention source code, and a Growth site's
  contact form writes into *this* platform's leads table — a handed-over repo
  stops working when it leaves. The honest version of ownership is the
  domain-in-their-registrar rule and the paid static export above.
- Staging vs production environments per client site. One preview URL that
  becomes the live site is the right amount of machinery at this size.
- Automated visual QA of generated sites. The `website-testing-agent` skill
  already covers post-deploy testing and is the natural follow-up once sites
  actually deploy.
