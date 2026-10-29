# 3. Split engineering practice into a software engineering core and domain plugins

Date: 2026-10-20

## Status

Proposed

## Context

This plugin has grown by the learnings that many sessions compounded into it. It now holds four
clusters of work with different audiences:

| Cluster | Components | File changes, 2026-09-19 to 2026-10-19 |
|---|---|---|
| Agent engineering | `writing-dispatch-prompts`, `fixer`, `verifier`, `workflows/fix-queue.js`, `fix-queue`, `tools/check-ce-pins` | 46 |
| Repo and work-type scaffolding | `devops-excellence-cold-start`, `bootstrap-mcp-server`, `bootstrap-private-sdk`, `bootstrap-sync-connector` | 13 |
| Work intake | `issue-triage` | 9 |
| Workspace and artifact scaffolding | `bootstrap-shared-drive`, `bootstrap-live-artifact` | 13 |

The agent-engineering cluster is about two thirds of recent change. It is also the only cluster
that depends on `compound-engineering` ([ADR-0002](0002-per-fix-ce-toolchain-and-the-lead-fixer-verifier-agent-team-pattern.md)).
`bootstrap-shared-drive` writes agent instructions for coaching and Holacracy drives, which is
digital workspace work rather than software engineering.

Claude Code lets a plugin declare other plugins in a `dependencies` array of `plugin.json`, and it
installs them with the plugin ([Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies)).
Three limits apply here:

1. A version range resolves only against git tags named `<plugin-name>--v<version>`. These repos
   tag `vX.Y.Z` with release-please, so only a bare-name dependency resolves today.
2. A dependency from another marketplace installs only when the root marketplace lists that
   marketplace in `allowCrossMarketplaceDependenciesOn`. When it is declared only in `plugin.json`
   and is not allowed, the install completes without it and the plugin fails to load.
3. A dependency is a whole plugin. Its skills are reached by namespace, not by a relative path.

It is not verified whether the Claude Desktop zip upload resolves `dependencies`.

Decisions already made by the operator on 2026-10-20:

- The short brand is **Integral**: "Integral Software Engineering" and "Integral Agent Engineering".
- This repository stays the general software engineering plugin (Productboard product
  "Integral Software Engineering Agent Plugin").
- Agent engineering, the engineering of agents, becomes a separate plugin.
- Developmental engineering means engineering support for adult-development work in general, not
  only for products such as Praxis.
- `bootstrap-shared-drive` belongs in a Digital Workspace Management plugin.

## Decision

### The split rule

Extract a cluster of skills, agents, commands or workflows into its own plugin when **at least two**
of these are true. Record in the extracting pull request which ones are true.

1. **Audience.** A different person or session invokes it, or a different set of repositories
   installs it.
2. **External dependency.** It needs a plugin, MCP server or tool that the rest of the plugin does
   not need.
3. **Change rate.** It holds more than half of the plugin's file changes over the last 30 days.
4. **Self-contained files.** No file outside the cluster loads a file inside it by relative path,
   and the reverse. The cluster can move as one unit.

Do not create a plugin that has no content. A domain plugin is created when at least two skills
want to live in it.

### Dependencies between the plugins

- A domain plugin declares the core as a dependency only when one of its components calls a core
  component. A dependency with no use is not added.
- Dependencies use a bare plugin name until release-please also writes `<plugin-name>--v<version>`
  tags.
- A dependency on a plugin in another marketplace is declared in the marketplace entry as well as
  in `plugin.json`, and the root marketplace lists the other marketplace in
  `allowCrossMarketplaceDependenciesOn`. Then a blocked install is refused with a message instead
  of a plugin that does not load.

### Application, as of this record

| Cluster | Rule result | Home |
|---|---|---|
| Agent engineering | All four criteria true | New plugin, Integral Agent Engineering |
| Repo and work-type scaffolding | None true | This plugin (core) |
| Work intake | None true | This plugin (core) |
| `bootstrap-shared-drive` | Audience true; a home exists in name only | Digital Workspace Management plugin, when that plugin has a second skill |
| `bootstrap-live-artifact` | Not assessed here | This plugin until assessed |
| Developmental engineering | No content | No plugin yet |

### Order of work

1. Test whether a Desktop zip upload installs a declared dependency. Use a plugin that already
   declares one (`product` declares `productboard`).
2. Extract agent engineering into its own repository, keeping history, and update every reference
   to the old namespace.
3. Rename the core and publish the old name `integral-productivity-engineering` as a bundle plugin
   (`name` and `dependencies` only), so existing installs keep working through one update. This
   step is a separate decision.

## Consequences

- Each extracted plugin costs one repository with the standard CI, release-please and a
  marketplace entry.
- Moving a component changes its namespace, for example `integral-productivity-engineering:fixer`
  becomes a name in the new plugin. Prompts, workflows and project memory that use the old name
  break unless they are updated. A check like `tools/check-internal-refs.mjs` should fail CI on the
  old namespace after the move.
- The core becomes small. Most general practice lives in sibling plugins already
  (`software-architecture`, `lean-management`, `devops-excellence`). That is expected; the core is
  the entry point for starting and maintaining repositories.
- If the Desktop upload ignores `dependencies`, Desktop users must install each plugin by hand,
  and the split loses part of its value for them.
- The rule is mechanical enough to check later. A script could report the change-rate criterion
  from `git log`.
