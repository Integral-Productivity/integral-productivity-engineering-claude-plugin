# integral-productivity-engineering

Engineering practice for Integral Productivity, packaged as a Claude Code plugin. Pairs with [`devops-excellence`](https://github.com/Integral-Productivity/devops-excellence) (the publisher of the org's CI/CD standard and the `template-*` repos) and with [`software-architecture-claude-plugin`](https://github.com/Integral-Productivity/software-architecture-claude-plugin) (the architecture practice).

## What's inside

| Component | Kind | Purpose |
|---|---|---|
| `devops-excellence-cold-start` | skill | Router. Activates on cold-start signals (new MCP server / SDK / plugin) and on the post-creation empty-IP-repo state. Walks tier/work-type decisions, recommends the right `template-*` repo + classification topic per [ADR-025](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-025-github-template-repositories.md) and [ADR-027](https://github.com/Integral-Productivity/devops-excellence/blob/main/docs/adr/ADR-027-org-custom-properties.md), delegates the application scaffold to the matching sibling skill, then verifies the new repo classifies under `classifyRepo()`. |
| `bootstrap-mcp-server` | skill | IP-specific MCP server scaffolding: project layout, Vercel HTTP entry point, dual-transport pattern, tool / service module organization. Renamed from `ip-mcp-builder` when moved out of the skills monorepo. |
| `bootstrap-private-sdk` | skill | TypeScript SDK on GitHub Packages scaffolding: scope/org naming, cross-platform lockfile gotcha, SAML SSO PATs, stacked-PR pitfall. |
| `writing-dispatch-prompts` | skill | The contract a dispatch prompt must satisfy when handing a unit of work to another agent session: claim instruction, verified ground truth, scope fence, settled premises, verification, PR conventions. Plus the two-signal claim check (lagging issue label vs. leading session list). |
| `/devops-cold-start` | slash command | Manual invocation of the cold-start router (for cases where phrase-detection misses). |

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
