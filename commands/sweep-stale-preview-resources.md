---
description: Find leftover Supabase preview branches, Vercel Sandbox sessions and stale Vercel preview deployments, prove who made each one and that nothing uses it, ask before deleting any, and fix the teardown that leaked it.
---

Invoke the `sweep-stale-preview-resources` skill to inventory preview resources, match each to its creator, prove it has no live owner, report estimated cost, ask for approval per resource before any deletion, verify the deletions, and fix the leaking teardown at its source.

Scope (provider, project, or resource name), if any: $ARGUMENTS
