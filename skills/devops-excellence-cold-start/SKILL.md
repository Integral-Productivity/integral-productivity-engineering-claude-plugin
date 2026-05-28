---
name: devops-excellence-cold-start
description: >
  Router for cold-starting a new Integral-Productivity repo against the
  org's standard. Use when: the user mentions building a new IP repo
  (phrases like "new MCP server", "new SDK", "new IP repo", "new claude
  plugin", "new omnifocus plugin", "scaffold a new <work-type>",
  "create a new repo for X"); OR the current working directory is an
  Integral-Productivity repo whose `.github/workflows/` does not call
  reusable workflows from `Integral-Productivity/devops-excellence` and
  whose root has no CLAUDE.md (the empty-IP-repo signal). Walks the
  tier/work-type decision tree, recommends the right `template-*` repo
  and `type-<workType>` topic per ADR-025 and ADR-027, delegates the
  application scaffold to the matching sibling skill
  (bootstrap-mcp-server, bootstrap-private-sdk), and verifies the new
  repo classifies via `classifyRepo()` post-creation. Never duplicates
  application-scaffold knowledge — always delegates.
status: draft
version: 0.1.0
---

# devops-excellence cold-start router

This skill closes the gap between "I want to start a new IP repo" and
"the repo conforms to the org standard from minute one." It does not
re-implement scaffolding — it routes you to the right combination of
template repo, sibling skill, and `devops-excellence` CLI invocation,
then verifies you landed where you intended.

## When to use

- **Pre-creation:** the user says they want a new MCP server, SDK,
  Claude plugin, or OmniFocus plugin for IP — or any phrasing that
  implies a new IP repo.
- **Post-creation empty-repo state:** the current working directory is
  an Integral-Productivity repo with no caller workflows and no
  CLAUDE.md. Activate to bring it to standard.
- **Explicit:** the user invokes `/devops-cold-start`.

If none of the above, this skill is the wrong tool. Do not activate
defensively in arbitrary IP repos that already conform — the
`unclassified-repo` fitness check in devops-excellence is the safety
net for general drift.

## Hard constraints

- **The four templates are the only supported work-types in V1.**
  ADR-025 ships templates for `mcp-server`, `typescript-sdk`,
  `claude-plugin`, `omnifocus-plugin` only. If the user wants a new
  work-type, do not improvise — instead, redirect them to file an ADR
  and a new template repo first per ADR-025's YAGNI gate (≥2 known
  instances).
- **Naming follows ADR-030 + ADR-025 suffix conventions.** Repo names
  must match the corresponding suffix:
  - `<topic>-mcp-server`
  - `<topic>-sdk`
  - `<topic>-claude-plugin`
  - `<topic>-omnifocus-plugin`
  Validate the proposed name against the suffix before proceeding.
  Reject and recommend the correct form if the user proposes a
  non-conforming name.
- **Tier is derived from work-type, not chosen.** The mapping is
  policy, set by `classifyRepo()` in
  `Integral-Productivity/devops-excellence` at `fitness/tier-config.ts`:
  - `mcp-server` → tier2
  - `typescript-sdk` → tier2
  - `claude-plugin` → tier3
  - `omnifocus-plugin` → tier3
  Do not ask the user; state the tier as a consequence of their
  work-type choice.
- **Shared-state actions require explicit user approval before each
  call.** Per the global "Executing actions with care" rule, surface
  the exact command and wait for confirmation before running
  `gh repo create`, `gh repo edit`, `pnpm migrate-repo --apply`, or
  `gh issue create`.

## Algorithm

### Step 1 — Confirm intent

Open with: "Looks like we're starting a new Integral-Productivity
repo, is that right?" If the user clarifies a different goal, exit
and let them redirect.

### Step 2 — Decision walk

Ask in this order (each with an inferred recommendation when possible):

1. **Work-type:** one of `mcp-server`, `typescript-sdk`,
   `claude-plugin`, `omnifocus-plugin`. Infer from the user's
   description (e.g., "wrapping the Foo API" → likely `typescript-sdk`;
   "exposing Foo as MCP tools" → `mcp-server`).
2. **Repo name (`<topic>-<workType-suffix>`):** propose a topic based
   on the described service or surface. Validate against the suffix
   pattern. Reject any name that doesn't end in the work-type's
   canonical suffix.
3. **Visibility (public/private):** default per work-type from existing
   org examples — `claude-plugin` defaults public (matches
   `holacracy-claude-plugin`, `software-architecture-claude-plugin`);
   `mcp-server` and `typescript-sdk` default per the user's stated
   distribution intent.

### Step 3 — Compute tier from work-type

Apply the policy mapping above. Do not present this as a choice.

### Step 4 — Output the plan

Surface a concrete recipe before any execution. Example for
`mcp-server`:

```bash
# 1. Create the repo from the template (CONFIRM BEFORE RUNNING)
gh repo create Integral-Productivity/<name>-mcp-server \
  --template Integral-Productivity/template-mcp-server \
  --private  # or --public

# 2. Set the classification topic (belt-and-suspenders;
#    classifyRepo() also matches the name suffix, but the explicit
#    topic survives any future rename)
gh repo edit Integral-Productivity/<name>-mcp-server \
  --add-topic type-mcp-server

# 3. Stage the per-repo CLAUDE.md from devops-excellence
gh api repos/Integral-Productivity/devops-excellence/contents/templates/claude-md/per-repo-CLAUDE.md \
  --jq '.content' | base64 -d > CLAUDE.md
# (commit to the new repo via the next step's PR)

# 4. From a devops-excellence checkout: stamp Tier 2 standard
cd ~/GitHub/devops-excellence
pnpm migrate-repo <name>-mcp-server          # dry-run
pnpm migrate-repo <name>-mcp-server --apply  # opens the adopt PR
```

Then state: "Once that's done, I'll invoke `bootstrap-mcp-server` for
the application scaffold (project structure, Vercel entry point,
transport, tool modules)."

For `typescript-sdk`, substitute `template-typescript-sdk`,
`type-typescript-sdk`, and `bootstrap-private-sdk` for the downstream
skill.

For `claude-plugin` / `omnifocus-plugin`, no downstream scaffolding
skill exists in V1 — reference the template repo's README and proceed.

### Step 5 — Confirm before executing

For each shared-state command, ask the user explicitly:
- "Want me to run `gh repo create ...` now?"
- "Want me to run `pnpm migrate-repo <name> --apply` now?"

If the user wants to run them themselves, leave the recipe and skip
to Step 7 verification (which they can run on their own machine).

### Step 6 — Delegate the application scaffold

After the repo exists and is at-standard:
- `mcp-server` → invoke sibling skill `bootstrap-mcp-server`
- `typescript-sdk` → invoke sibling skill `bootstrap-private-sdk`
- `claude-plugin` / `omnifocus-plugin` → point at the template repo's
  README

Sibling skills carry the application-scaffold knowledge. This skill
must never replicate it.

### Step 7 — Verification

After execution, re-fetch state and assert:

```bash
# 1. Does the classifier see it?
gh api repos/Integral-Productivity/<name> --jq '.topics, .name'
# Confirm: topic includes `type-<workType>`, name matches suffix.

# 2. Does the standard infrastructure exist?
gh api repos/Integral-Productivity/<name>/contents/CLAUDE.md --jq '.path'
gh api repos/Integral-Productivity/<name>/contents/.github/workflows/ci.yml --jq '.path'

# 3. Is there drift remaining?
cd ~/GitHub/devops-excellence
pnpm migrate-repo <name>  # dry-run; empty diff = no drift
```

Report pass/fail per criterion. If anything fails, surface the gap and
recommend the fix (usually re-running `pnpm migrate-repo --apply`).

## Cross-references

- `Integral-Productivity/devops-excellence/docs/adr/ADR-021-bootstrap-and-migration-tooling.md`
  — the push path (`pnpm bootstrap-repo`, `pnpm migrate-repo`).
- `Integral-Productivity/devops-excellence/docs/adr/ADR-025-github-template-repositories.md`
  — the pull path (the four `template-*` repos), tier model, and
  `unclassified-repo` safety net.
- `Integral-Productivity/devops-excellence/docs/adr/ADR-027-org-custom-properties.md`
  — `type-<workType>` topic convention and `classifyRepo()`'s
  precedence chain.
- `Integral-Productivity/devops-excellence/docs/adr/ADR-030-claude-plugin-repo-naming-convention.md`
  — the `*-claude-plugin` suffix rule for plugin repos.
- `Integral-Productivity/devops-excellence/fitness/tier-config.ts` —
  source of truth for `classifyRepo()` and the work-type → tier
  mapping. The router's inference must match this exactly.

## Sibling skills in this plugin

- `bootstrap-mcp-server` — IP MCP-server scaffolding (project
  structure, Vercel entry, dual transport, tool modules, API client).
- `bootstrap-private-sdk` — TypeScript SDK on GitHub Packages
  scaffolding (scope/org naming, lockfile gotcha, SAML SSO PATs,
  stacked-PR pitfall).

## Promote to `tested` when

This skill has been used successfully on at least two distinct
cold-starts across at least two different work-types, with the
verification step passing on both.
