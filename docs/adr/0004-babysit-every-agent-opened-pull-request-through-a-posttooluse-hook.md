# 4. Babysit every agent-opened pull request through a PostToolUse hook

Date: 2026-10-22

## Status

Accepted (2026-10-22, by the operator, after [#177](https://github.com/Integral-Productivity/integral-productivity-engineering-claude-plugin/pull/177) merged)

## Context

On 2026-10-22 the operator set a standing rule: every pull request that an agent opens is
babysat to a merge-ready state with `compound-engineering:ce-babysit-pr`. Pull requests opened
by agents were often left unwatched, or reported as done before CI and review had settled.

The rule was first kept as a memory note. A memory note depends on the agent reading it and
remembering it at the moment the pull request opens. That is the moment the agent is most
likely to report success and stop.

`ce-babysit-pr` needs the `gh` CLI and a live local session. A cloud session in a Claude
project thread can have no usable `gh`. There, the session's `subscribe_pr_activity` tool
delivers each PR event (CI result, review, comment, merge) as a new turn, so the same rules
apply event by event instead of in a loop.

Claude Code lets a plugin register hooks in `hooks/hooks.json`
([Hooks reference](https://code.claude.com/docs/en/hooks)). A `PostToolUse` hook receives the
tool name, its input and its response as JSON on stdin. It can add text to the agent's context
through `hookSpecificOutput.additionalContext`, without blocking the tool call.

A hook runs on every matching tool call, so it is the most invasive surface a plugin has.

## Decision

This plugin ships one `PostToolUse` hook, `hooks/babysit-pr.sh` with its logic in
`hooks/babysit-pr.mjs`.

1. **When it fires.** After a `Bash` call whose command contains `gh pr create`, or after an MCP
   tool whose name ends in `create_pull_request` (for example `mcp__github__create_pull_request`).
   `create_pull_request_with_copilot` does not match, because it starts a Copilot job and does
   not open a pull request itself.
2. **What it reads.** The first pull request URL in the tool response
   (`https://<host>/<owner>/<repo>/pull/<number>`). If there is no URL, the call failed or the
   shape is unknown, and the hook does nothing.
3. **What it injects.** One instruction, with the pull request filled in:
   - In a local session with `gh` on `PATH`: run
     `/compound-engineering:ce-babysit-pr <url>` with posture `target`.
   - In a cloud session (`CLAUDE_CODE_REMOTE=true`) or without `gh`: call
     `subscribe_pr_activity` for the owner, repository and number, then handle each event with
     the same rules (feedback before CI, fix and push, report a looks-ready line), without a
     polling loop.
   Both variants say that the agent never merges; merging stays with a human.
4. **Silence by default.** The hook exits 0 with no output when the call does not match, the
   input is malformed, no URL is found, `node` is missing, or any error occurs. The shell
   wrapper filters on the raw input before it starts `node`, so an ordinary `Bash` call costs
   one `case` statement.
5. **Opt-out.** `IPE_BABYSIT_PR_HOOK=off` (also `0` or `false`) disables the hook.

## Consequences

- The rule no longer depends on memory recall. An agent with this plugin installed is told to
  babysit at the moment the pull request exists.
- The hook only instructs. It cannot make the agent run the skill. A session that ignores
  injected context is not caught; the CI and review gates still apply.
- Pull requests opened outside these two paths (the GitHub web UI, `hub`, a raw API call) are
  not seen.
- The hook depends on `compound-engineering` only by name, in text. The plugin does not
  declare it in `dependencies`, so a session without `compound-engineering` gets an instruction
  it cannot follow. The `subscribe_pr_activity` variant does not need it.
- Under [ADR-0003](0003-split-engineering-practice-into-a-software-engineering-core-and-domain-plugins.md)
  this hook belongs to the agent-engineering cluster. It moves with that cluster when the
  cluster is extracted.
- `hooks/babysit-pr.test.mjs` pins the matching, the silence cases and both variants. CI runs it.
