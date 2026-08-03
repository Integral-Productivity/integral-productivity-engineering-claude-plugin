# Upstream provenance

`AGENT-BRIEF.md` and `OUT-OF-SCOPE.md` in this directory are **byte-verbatim copies** from
Matt Pocock's `triage` skill, used under the MIT License (see `../LICENSE.txt`).

| Field | Value |
|---|---|
| Source | [`mattpocock/skills`](https://github.com/mattpocock/skills) |
| Skill path | `skills/engineering/triage/` |
| Skill folder hash | `de4f182c30876a2460ca307e2f601b9b892527e5` |
| Copied from | `~/.agents/skills/triage/` (installed 2026-05-14) |
| Copied on | 2026-08-02 |

## Digests at copy time

```
1c71c747aa97d938f75ec7a4b8fe87451763b38a3ce6348acf2b222e5819b2e5  AGENT-BRIEF.md
8ed8cf27833444060c81b3961a83c0e3d8e6cf2fcb2ddf6f8b07c6655cbb0d85  OUT-OF-SCOPE.md
```

Verify with `shasum -a 256 AGENT-BRIEF.md OUT-OF-SCOPE.md` from this directory.

## Why only these two files

Matt's `SKILL.md` carries a label vocabulary — a 2-category × 6-state machine. That is
exactly the part that has **already diverged** across the org:

- `ip-agent-teams/skills/triage/SKILL.md` — vendored pre-`deferred` (5 states)
- praxis worktree copy — same, pre-`deferred`
- `ip-product-management-triager` MCP tools — still emit `category:*` / `state:*` and
  `route:lead-link` / `rep-link` / `secretary`, all retired by praxis ADR-0059 and ADR-0116

`issue-triage` does not take a fourth copy. It reads vocabulary live instead — see
[`vocabulary-discovery.md`](./vocabulary-discovery.md).

These two files are copied because they are **vocabulary-free**. `AGENT-BRIEF.md` is about
writing durable handoffs (behavioral, not procedural; no file paths or line numbers) and
`OUT-OF-SCOPE.md` is about a concept-keyed rejection knowledge base. Neither names a label,
so neither can rot against a vocabulary change.

## Re-syncing

These are reference material, not a dependency — there is no automated vendor script here
(the `pnpm vendor:triage-skill` pattern in `ip-agent-teams` produced a copy that is now
three months stale, which is the outcome this table exists to make visible).

To check for upstream changes:

```bash
gh api repos/mattpocock/skills/contents/skills/engineering/triage --jq '.[].name'
```

If either file changed upstream, re-read it and decide deliberately — do not auto-merge.
Update the digests and the "Copied on" date in this file when you do.
