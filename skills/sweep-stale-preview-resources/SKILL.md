---
name: sweep-stale-preview-resources
description: >
  Find and clean up leftover preview environments that CI, agents or people
  created and never removed: Supabase preview branches and Vercel Sandbox
  sessions (billed while they exist or run), plus stale Vercel preview
  deployments (clutter). Use when asked to "find stale branches", "what preview
  environments are still running", "why is the Supabase bill up", "clean up
  leftover branches", or "is it safe to delete this branch", and as a periodic
  hygiene sweep. Also use when a CI job that creates an ephemeral environment
  failed, because a failed create step is the usual way a teardown is skipped.
  Read-only until a person approves each deletion.
status: draft
version: 0.1.0
---

# Sweep stale preview resources

> **Status:** Draft, written from one leak found on 2026-10-20: a Supabase
> preview branch made by a failed CI run stayed active for about four and a
> half months. Promote to `tested` after the second sweep runs with it without
> significant correction.

An ephemeral environment is only ephemeral if its teardown works. A teardown
that hides its own failure turns every failed run into a resource that bills
by the hour and that nobody owns. This skill finds those resources, proves who
made them and that nothing still uses them, and fixes the teardown that leaked
them.

## Hard constraints

- **Read-only until approved.** Deleting a branch, a deployment or a sandbox
  cannot be undone. List, classify and report first. Delete one resource only
  after a person approves that resource by name, in this conversation.
- **Never touch a default, production or persistent resource.** Skip a
  Supabase branch with `is_default: true` or `persistent: true`, and any
  Vercel deployment that is the current production alias.
- **An owner beats an age.** Age alone never makes a resource stale. A
  resource is stale only when the checks below find no live owner.
- **Cost is an estimate.** Say which compute size you assumed, and point at
  the provider's usage page to confirm. Read current pricing from the
  provider's docs (for example the Supabase `search_docs` tool), not from
  memory.

## Procedure

### 1. Inventory

| Provider | Read call | Billed while it exists? |
|---|---|---|
| Supabase preview branches | `list_projects`, then `list_branches` per project | Yes: branch compute is billed by the hour, and Compute Credits and the Spend Cap do not cover it |
| Vercel Sandbox sessions | `list_sessions` | While running; check the current Vercel pricing page |
| Vercel preview deployments | `list_deployments` with a preview target | No hourly compute when idle; treat as clutter, not cost |

For each resource record: name, id, created time, last updated time, status,
parent project, and the git branch or PR it is linked to, if any.

### 2. Find the creator

Match each resource to what made it, in this order:

1. **Naming convention.** Search the org's workflows for the name prefix (for
   example `ci-<job>-${GITHUB_RUN_ID}`). A run id in the name gives you the
   run: read its jobs and step conclusions with the GitHub Actions tools.
2. **Linked git branch or PR.** A Supabase branch with `git_branch`, or a
   Vercel deployment with a git ref, belongs to that branch or PR. Check
   whether it is still open.
3. **Person or agent.** If neither matches, the resource was made by hand or
   by an agent session. Search the issue tracker and project threads for its
   name before you call it orphaned.

Run logs expire. When a log returns HTTP 410, reason from the step timings
and conclusions, and label the cause as inferred.

### 3. Prove nothing uses it

A resource is safe to delete when all of these hold:

- No tracked file in the org's repos names its project ref, id or URL
  (`git grep` across the repos in scope).
- Its linked PR is merged or closed, or it has no linked PR.
- No environment variable points at it. If you cannot read env vars (for
  example a 403 from Vercel), say so: this check is then unverified.
- For a database branch: its tables hold no data that exists nowhere else
  (`list_tables` shows row counts).

### 4. Report and ask

Report one row per resource: name, creator, age, estimated cost to date and
per month, owner checks passed, and the recommendation. Then ask one question
per resource to delete, using the interface's decision or question tool.
Name the resource and say that the deletion cannot be undone.

### 5. Delete, then verify

Delete only the approved resources (Supabase `delete_branch`, or the Vercel
equivalent). Re-run the inventory call and confirm each one is gone. Report
what is left.

### 6. Fix the leak at its source

A leaked resource means a teardown failed silently. Find the teardown in the
creating workflow and check for these patterns:

| Pattern | Why it leaks | Fix |
|---|---|---|
| `curl ... -X DELETE ... \|\| true` | A refused delete passes as success | Retry with backoff until a `GET` returns 404; fail the job if the resource remains |
| Teardown gated on an id that is set late | A failure before the id is saved skips teardown | Save the id immediately after create, before any check that can fail |
| Delete sent seconds after create | The provider can refuse a delete while the resource is still provisioning | Wait for a terminal status before deleting, then retry |
| No sweep | One leak lives forever | Add a scheduled step that deletes resources with the job's prefix older than a few hours |

File or update an issue for the fix in the repo that owns the workflow. If an
open issue already covers that workflow, add the fix to it as acceptance
criteria instead of opening a second issue.

## Known connector behaviour

- Supabase connector: `list_branches`, `list_tables` and `delete_branch` work
  from cloud sessions. `create_branch` can return "cancelled" when its cost
  confirmation cannot reach the user; a person then creates the branch in the
  dashboard.
- Vercel connector: reading project environment variables can return 403 in
  cloud sessions. Report the env-var check as unverified rather than skipping
  it silently.
