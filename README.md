# integral-productivity-engineering

Engineering practice for Integral Productivity, packaged as a Claude Code plugin. Pairs with [`devops-excellence`](https://github.com/Integral-Productivity/devops-excellence) (the publisher of the org's CI/CD standard and the `template-*` repos) and with [`software-architecture-claude-plugin`](https://github.com/Integral-Productivity/software-architecture-claude-plugin) (the architecture practice).

## What's inside

| Component | Kind | Purpose |
|---|---|---|
| `devops-excellence-cold-start` | skill | Router. Activates on cold-start signals (new MCP server / SDK / plugin) and on the post-creation empty-IP-repo state. Walks tier/work-type decisions, recommends the right `template-*` repo + classification topic per [ADR-025](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-025-github-template-repositories.md) and [ADR-027](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-027-org-custom-properties.md), delegates the application scaffold to the matching sibling skill, then verifies the new repo classifies under `classifyRepo()`. |
| `bootstrap-mcp-server` | skill | IP-specific MCP server scaffolding: project layout, Vercel HTTP entry point, dual-transport pattern, tool / service module organization. Renamed from `ip-mcp-builder` when moved out of the skills monorepo. |
| `bootstrap-private-sdk` | skill | TypeScript SDK on GitHub Packages scaffolding: scope/org naming, cross-platform lockfile gotcha, SAML SSO PATs, stacked-PR pitfall. |
| `bootstrap-sync-connector` | skill | Design and scaffold of a service that synchronizes work items between a system of record and one or more third-party systems: the shape behind `reclaim-integrations` and any later HubSpot, Circle, or Linear sync. Carries the three failure modes that are expensive to retrofit (write loops, record-level conflict resolution, and event-driven-only designs with no reconciliation) and the vendor-capability audit that must run before the architecture is chosen. |
| `bootstrap-shared-drive` | skill | Generates or refreshes the `CLAUDE.md` for a Google Shared Drive opened as a Cowork project, from the drive's emoji-prefix type: 👤 client-centric (domain holder is Coaching; essential context is the Praxis Client, resolved through Praxis MCP tools, never raw HubSpot), ◉ Holacracy circle or role (domain holder is the matching GlassFrog role, resolved live), or a fallback template for an unrecognized prefix. |
| `bootstrap-live-artifact` | skill | Order of operations for building or migrating a published Claude artifact page that reads live data through the viewer's connectors: decide live versus static, map each source to a connector, verify arguments and response shape with one safe read before any page code, make failure visible (an unreadable response is an error, never an empty state), test with synthetic data in four connector conditions, and report what was not exercised. Written from the ten-artifact migration of 2026-10-05, and carries the traps found there ([glassfrog-mcp-server#255](https://github.com/Integral-Productivity/glassfrog-mcp-server/issues/255), [reclaim-mcp-server#29](https://github.com/Integral-Productivity/reclaim-mcp-server/issues/29)). Defers to `artifact-capabilities` and `artifact-design` for the runtime contract. |
| `writing-dispatch-prompts` | skill | The contract a dispatch prompt must satisfy when handing a unit of work to another agent session: claim instruction, verified ground truth, scope fence, settled premises, verification, PR conventions. Plus the two-signal claim check (lagging issue label vs. leading session list), and the launch command that scopes a chip's MCP roster (`--strict-mcp-config`, empty by default). |
| `issue-triage` | skill | Triages GitHub issues to a state, a category, and the `handling:route:*` role accountable for the work. Ground-truths each issue against live `main` / ADRs / cross-referenced issues before assigning state, then infers the accountable GlassFrog role per [SAE-009](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-009-role-derived-issue-routing-labels.md) — applying when one role clearly owns it, escalating to `needs-triage-decision` when it doesn't. Hardcodes no label vocabulary; reads it live from the repo and from GlassFrog. Implements the decision in [praxis#1202](https://github.com/Integral-Productivity/praxis/issues/1202). |
| `/devops-cold-start` | slash command | Manual invocation of the cold-start router (for cases where phrase-detection misses). |
| `/issue-triage` | slash command | Manual invocation of the triage skill against an issue number or a backlog scope. |

## Install

```bash
# In Claude Code:
/plugin add Integral-Productivity/integral-productivity-engineering-claude-plugin
```

## When to install

You're working in the Integral-Productivity org and you regularly create or maintain repos in it. The cold-start router will reach for the right `template-*` repo and scaffolding skill so new repos land at-standard without re-inventing.

## How it composes with `devops-excellence`

- **`devops-excellence`** owns the standard: the `template-*` repos (pull path), the `bootstrap/` CLI (push path / drift remediation), the fitness checks (audit), and the ADRs that define tier and work-type.
- **This plugin** is the *agent-side companion*: the cold-start router routes Claude Code sessions to the right `devops-excellence` asset at the right moment, and the work-type skills carry the application-scaffold knowledge that `devops-excellence` deliberately leaves to the template repos.

If you're contributing to the standard itself (new tier, new fitness check, new template), work in `devops-excellence`. If you're starting a new repo against the standard, this plugin is the entry point.

## Cross-references

- [ADR-021 — Bootstrap + Migration Tooling](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-021-bootstrap-and-migration-tooling.md)
- [ADR-025 — GitHub Template Repositories](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-025-github-template-repositories.md)
- [ADR-027 — Org Custom Properties](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-027-org-custom-properties.md)
- [ADR-030 — Claude Plugin Repo Naming Convention](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-030-claude-plugin-repo-naming-convention.md)

## License

Internal — Integral Productivity.
