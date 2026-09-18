---
name: writing-dispatch-prompts
description: >
  Use when handing a unit of work to another agent session — firing,
  spawning, or dispatching a session or chip at an issue ("fire a
  session for #123", "spawn sessions for these follow-ups", "kick off
  an agent on this"), writing the prompt that session will receive, or
  running several sessions against one repo at the same time, including
  writing the launch command and choosing which MCP servers the session
  loads. Also use when a dispatched session re-derived context you
  already had, re-litigated a settled decision, collided with a sibling
  in one file, reported "already claimed" ambiguously, or spawned a
  process tree or credential prompts its task did not need.
status: draft
version: 0.2.0
---

# Writing dispatch prompts

A dispatch prompt is a **contract**, not a summary. The receiving session can
read the issue itself; what it cannot get anywhere else is what *you* verified
and what *the fleet* is doing right now. That is the part worth writing.

## The contract

A dispatch prompt contains these parts, in this order:

1. **Claim instruction** — the exact command, plus the STOP condition if a claim
   already exists. Take it verbatim from the org-wide
   `Integral-Productivity/devops-excellence/docs/agents/agent-dispatch-claim-protocol.md`;
   do not paraphrase it, and do not invent a per-repo variant.
2. **The issue link**, and "read the body first."
3. **Ground truth verified beyond the issue body** — what you checked, what you
   found, and the date you checked it. Highest-value section: it is everything
   that changed since the issue was filed.
4. **Scope fence** — files this session owns; files it must not touch, each with
   the reason and the owning issue.
5. **Settled premises** — decisions already made, not to be re-litigated, with
   where the rationale lives.
6. **Verification** — the commands, their expected numbers, and "report actual
   numbers, not 'passing'."
7. **PR conventions** — closing keyword at creation time, branch naming, no drafts.
8. **MCP roster** — one line naming the servers the session was launched with
   (usually "none") and "use `gh` for GitHub." A session that does not know its
   roster was scoped will read a missing tool as a broken environment.

## The launch command: scope the MCP roster

A chip launched as plain `claude -n <name> -w <worktree>` inherits the
**ambient** roster — every user-scope server, every plugin server, and every
claude.ai connector on the machine. None of that is chosen for the task. It
costs memory and startup handshakes per chip, it multiplies any server that
resolves a secret at spawn (one 1Password prompt per chip), and it hands a code
chip write authority over systems its task never touches.

Launch with a declared roster instead. The default for a code chip is **empty**:

```bash
claude -n <name> -w <worktree> \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  -- "<dispatch prompt>"
```

**Keep the `--` before the prompt.** `--mcp-config` takes a variable number of
values, so it treats a prompt placed after it as one more config path. The
launch then fails with `Invalid MCP configuration: MCP config file not found:
<cwd>/<your prompt>`. The alternative is to put the prompt before the MCP flags.
For the same reason, give config files as absolute paths: a relative path is
resolved against the launch directory.

`--strict-mcp-config` drops every server not given by `--mcp-config` — user,
project, plugin, and claude.ai connectors alike. `--mcp-config` is repeatable,
so admit servers by adding files, never by dropping the flag:

| The task needs | Add |
|---|---|
| Nothing beyond code, shell, and GitHub | nothing — `gh` covers GitHub, built-in tools cover files |
| The servers the repo declares | `--mcp-config <absolute path to repo>/.mcp.json` (strict mode ignores it otherwise) |
| A specific named server | a JSON file holding just that server's entry (`claude mcp get <name>` shows its definition) |

**Name every admitted server in the dispatch prompt and say why.** An admitted
server is a scope decision, like a file in the fence. A personal or finance
connector in a code chip needs a reason written down, or it does not go in.

A claude.ai connector has no local server definition to put in a file. As of
2026-09-17, no way to admit one under strict mode has been tested. If a chip
needs one, the known fallback is to launch without `--strict-mcp-config`. That
brings back the whole ambient roster, not just the one connector, so record in
the dispatch prompt that this was a deliberate choice and why.

Measured on 2026-09-17: the ambient roster loaded 172 servers, 1,724 tools, and
9 child processes (253 MB RSS) into a headless session before it did any work;
the empty roster loaded 0, 27, and 0. See
[`reference/mcp-roster-measurement.md`](reference/mcp-roster-measurement.md) for
the recipe to re-measure.

## Two rules earned the hard way

**Claim by label, never by assignment**, wherever an automation triggers on
`issues: [assigned]`. Assigning to claim spawns another session — the claim step
becomes the runaway it was meant to prevent. This is why the claim protocol's
release-at-merge and reaper halves touch labels and refs only.

**When the work product mutates the coordination substrate** — a reaper that
deletes claim locks, a sweep that strips claim labels — fence it to dry-run by
default and fixture-based tests. Otherwise one exploratory run against the live
repo unlocks the sessions those locks are currently protecting.

## Naming a sibling in a fence

Reference siblings by **issue number, never by a filename they have not chosen
yet**. A fence that names `claim-lock-reaper.yml` is wrong the moment the
sibling picks a different name; a fence that says "#1164 owns the reaper
workflow" stays true regardless of merge order.

## Checking a claim before you dispatch

The two available signals fail in opposite directions, so one is a coin flip:

| Signal | Property | Fails by |
|---|---|---|
| Issue label / claim ref | Authoritative, cross-machine | **Lagging** — a live claim has no PR or branch for its first minutes, so it looks identical to a stale one |
| Live session list | Real-time, leading | **Machine-local**, title-keyed — misses claims from other machines |

A running session naming the issue is a real claim. An aged lock with no running
session, no branch, and no PR is decayed. On a confirmed duplicate, leave the
label alone — removing it strips the owner's claim.

## Common mistakes

**Summarizing the issue back.** The session can read it. Spend the words on what
you verified instead.

**A fence with no "do not touch" list** when a sibling is running. Ownership is
decided before dispatch or not at all.

**Omitting the date** from ground truth. "Verified against `origin/main`" is
unfalsifiable; "verified 2026-07-31" tells the session when to re-check.
