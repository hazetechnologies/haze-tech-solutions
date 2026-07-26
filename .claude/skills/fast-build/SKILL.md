---
name: fast-build
description: >-
  Speed playbook for agents working in this repo. Use at the start of any
  non-trivial task — a multi-file change, a feature, a refactor, a broad
  search, a review, or anything that touches several parts of the codebase.
  Teaches how to parallelize work across subagents, isolate concurrent
  edits with worktrees, batch tool calls, and use the project's known
  build/lint/dev commands instead of rediscovering them.
---

# fast-build

A playbook for finishing work in this repo faster. The core idea: **do
independent things at the same time, and stop rediscovering things the
project already knows.**

## 1. Parallelize independent work

If two pieces of work don't depend on each other, run them at the same time
instead of one after another.

- **Fan out subagents in a single message.** When you launch multiple
  `Agent` calls in one response, they run concurrently. Launching them in
  separate turns runs them serially — don't do that for independent work.
- **Pick the right agent type:**
  - `Explore` — read-only fan-out searches ("where is X used", "find all
    files matching Y"). Returns conclusions, not file dumps. Use it instead
    of running many `Grep`/`Glob` calls yourself.
  - `general-purpose` — multi-step work that includes edits.
  - `Plan` — designing an implementation strategy before you write code.
- **Delegate to keep your own context clean.** A subagent's file reads and
  search output stay in *its* context; you get back only the conclusion.
  Reach for one whenever answering would mean reading across many files.

### When NOT to parallelize

- Steps with a real dependency (B needs A's output). Run those in order.
- A single-file lookup where you already know the file — just read it.
- More than ~3–4 agents editing overlapping code (see worktrees below).

## 2. Isolate concurrent edits with worktrees

If you fan out subagents that **write to files**, they can clobber each
other. Give each one its own git worktree so they work on isolated copies:

- Use `isolation: "worktree"` on the `Agent` call (or the `EnterWorktree`
  tool for interactive isolation).
- Worktrees cost ~200–500ms of setup each — only use them when agents
  actually mutate files in parallel. For read-only fan-out, skip it.
- After parallel edits, review and merge the results back yourself.

## 3. Batch independent tool calls

Within a single response, put independent tool calls together so they
execute in parallel. Example: reading three unrelated files, or running
`git status` + `git branch` + `ls` at once. Only serialize when a later
call depends on an earlier call's result.

## 4. Use the project's fast paths (don't rediscover them)

This is a **Vite + React 19 + Supabase** project. Scripts from `package.json`:

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` (eslint) |
| Preview built app | `npm run preview` |

Notes for moving quickly:

- After a code change, verify with `npm run lint` and `npm run build`
  rather than manually reasoning about breakage.
- There is **no `npm test`** script and no CI test job. The `*.test.js`
  files in `api/_lib/` are **Deno** tests — run with `deno test api/_lib/`
  only if Deno is present. Don't hunt for `npm test`; default verification
  here is lint + build (+ running the app when a change is visual).
- Supabase schema lives in the root `supabase-*.sql` files and the
  `supabase/` directory. Env vars are documented in `.env.example` — read
  it before touching anything that needs config.
- To confirm a UI change actually works, use the `run` skill or launch the
  dev server and screenshot with Playwright (Chromium is pre-installed).

## 5. Don't stall on permission prompts

Common safe commands in this repo are pre-approved in
`.claude/settings.json` (lint, build, git reads, installs), so they run
without interrupting you. If you hit a prompt for a command that's clearly
safe and repeated often, mention that it can be added to the allowlist —
don't just work around it silently.

## Quick decision guide

- Broad "where / find / how is this used" question → one or more `Explore`
  agents, in a single message.
- Several independent edits (e.g. three unrelated components) → fan out
  `general-purpose` agents with `isolation: "worktree"`.
- One focused change you understand → just do it inline; don't over-engineer
  the orchestration.
- Verifying your change → `npm run lint && npm run build`.
