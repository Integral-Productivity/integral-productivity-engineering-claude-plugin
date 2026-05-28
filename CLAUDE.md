# integral-productivity-engineering-claude-plugin — Claude Code Context

## Purpose

Engineering practice for Integral Productivity, packaged as a Claude Code plugin. Contains the cold-start router (`devops-excellence-cold-start`) plus the work-type scaffolding skills (`bootstrap-mcp-server`, `bootstrap-private-sdk`) that the router delegates to.

This plugin is the agent-side companion to [`devops-excellence`](https://github.com/Integral-Productivity/devops-excellence). The standard lives there; the orchestration that helps agents reach for it lives here.

## Adopts the devops-excellence standard

This repo consumes reusable workflows and follows the conventions defined in [`Integral-Productivity/devops-excellence`](https://github.com/Integral-Productivity/devops-excellence). When adding or modifying CI workflows, prefer extending the reusable workflow there and calling it here rather than implementing logic locally. DevOps ADRs belong in devops-excellence, not in this repo.

Tier: tier3 (work-type: `claude-plugin`, per ADR-025 and ADR-030)

## Branch and PR Conventions

- Branch naming: `claude/<slug>` for Claude-authored branches (auto-merges on green CI)
- Default merge: squash only. PR title becomes the commit subject.
- PR template enforces: `Closes #`, summary bullets, test plan checklist
- Do NOT create draft PRs — auto-merge only fires on ready-for-review PRs

## Commit Conventions

Conventional Commits: `feat:`, `fix:`, `chore(scope):`, `docs:`, `ci:`

## Plugin layout

```
.claude-plugin/plugin.json          # Plugin manifest (name, version, description)
skills/<skill-name>/SKILL.md        # One directory per skill
skills/<skill-name>/reference/...   # Reference files bundled with the skill
commands/<command>.md               # Slash commands
```

## Repo conventions specific to this plugin

- **The router never duplicates application-scaffold knowledge.** When adding capability that overlaps with a work-type sibling skill, extend the sibling skill — don't grow the router.
- **Sibling skills must remain composable.** If `bootstrap-mcp-server` needs invocation steps that only make sense after the router has run, surface that in the router; don't bake router assumptions into the sibling.
- **`description` field is the activation contract.** When editing any SKILL.md's frontmatter `description`, treat it as a load-bearing API — be deliberate about which phrases and contexts make the skill fire.

## Credentials Required

Org variables (no repo-level config needed):
- `AUTOMERGE_APP_ID`, `AUTOMERGE_APP_CLIENT_ID` — org variables, visibility ALL.

Org secrets (no repo-level config needed):
- `OP_SERVICE_ACCOUNT_TOKEN` — org-level, Actions scope. 1Password service-account token; the reusable auto-merge workflow reads the App PEM from 1P at `op://ip-automation/ip-automerge-bot/private_key`.
- `CLAUDE_CODE_OAUTH_TOKEN` — org-level.
