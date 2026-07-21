# Executive Assistant

Design artifacts for Josiah's **Executive Assistant** — an AI coordinator that
manages operations across the Haze/Segula/CJW portfolio and Josiah's personal
life. It receives every request, routes it to the right business manager or
agent, manages his communication channels and documents, and proactively
executes due work.

These are **prompts and specifications**, not code — portable to whatever
platform runs the assistant.

## Contents

- **[`SPEC.md`](./SPEC.md)** — the full specification: architecture, routing
  logic, delegation contract, channels, document intelligence, proactive
  execution, task-list data model, operating principles, existing-asset reuse,
  and open items to confirm.
- **[`prompts/`](./prompts/)** — system prompts, one per role:
  - `executive-assistant.md` — the master orchestrator (start here)
  - `personal-assistant.md`
  - `segula-management-manager.md`
  - `haze-funding-manager.md`
  - `cjw-real-estate-manager.md`
  - `travel-agent.md`
  - `haze-family-managers.md` — Haze Tech, Haze SEO, Haze Social Post,
    My Haze Pro, Haze Clips

## How the pieces fit

1. The **Executive Assistant** prompt is the brain. Load it as the top-level
   agent that talks to Josiah.
2. Each **manager/agent** prompt defines a specialist the brain delegates to.
3. The **SPEC** defines the contracts between them (how a delegation is made,
   what a response must contain) and the shared services (calendar, email,
   Drive, task list).

## Key design decisions

- **Clean delegation** — the orchestrator sends plain requests to managers with
  no added SOPs/deadlines/formatting unless Josiah says so, and it always waits
  for a real response.
- **Reuse before rebuild** — where `hazetechsolutions.com`,
  `mysegulamanagement.com`, `hazesocialpost.com`, and `myhazepro.com` already
  provide functionality, managers use it instead of duplicating it (see
  SPEC §8).
- **Confirm the irreversible** — outward-facing/irreversible actions require
  Josiah's confirmation unless pre-authorized.

## Before implementing

See **SPEC §10 (Open items to confirm)** — pre-authorized actions, nightly-run
time zone, calendar IDs, how each manager is backed, and which existing-product
endpoints to connect first.
