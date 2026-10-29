# 6. Stage compound-engineering artifacts at write time from the engineering plugin

Date: 2026-10-29

## Status

Proposed

## Context

Compound-engineering skills write durable artifacts to `docs/plans/`, `docs/ideation/`,
`docs/brainstorms/`, `docs/adr/` and `docs/solutions/`. The commit is a later, separate step.
When a session pivots (a new request arrives, context compacts, the branch merges), that step is
often skipped, and the artifact stays untracked in one worktree, invisible to everyone else.

On 2026-08-10 the praxis product repository found two such artifacts (a requirements plan and
an ideation document) stranded three days after creation, although a merged ADR and four open
issues already cited them. Praxis then added two repository-local Claude Code hooks:

- a `PostToolUse` hook on `Write|Edit` that runs `git add` on a file written inside those five
  directories, and
- a `Stop` hook that prints a `systemMessage` listing untracked files in those directories.

Nothing in either hook is specific to praxis. Every other engineering repository that uses
compound-engineering has the same gap.

The praxis originals also have three defects:

1. The stage hook runs `git add` from the shell directory, so a write into another clone in a
   multi-repo session is staged in the wrong repository or not at all.
2. The Stop hook lists only untracked files. A file the stage hook staged is no longer
   untracked, so the backstop goes silent for exactly the artifacts it exists to protect,
   although a staged-only file is lost with the worktree or container just as an untracked one
   is.
3. Both depend on `jq`.

## Decision

This plugin ships both hooks, generalized.

1. **`hooks/stage-ce-artifact.sh`, `PostToolUse` on `Write|Edit`.** When the written file is
   inside a configured directory of a git repository, is not yet in that repository's `HEAD`,
   and is not ignored, the hook runs `git add` on it in the file's own repository. The
   repository is found from the file's directory; the repo-relative path comes from
   `git rev-parse --show-prefix`, so a path through a symlink still matches. A file already in
   `HEAD` is left alone, so an edit to an existing ADR does not overwrite partial staging or
   ride into an unrelated commit.
2. **`hooks/warn-untracked-ce-artifacts.sh`, `Stop`.** It lists files in the configured
   directories that are not in `HEAD`: untracked and not ignored, or staged as added. It checks
   the project repository (`CLAUDE_PROJECT_DIR`, else the payload `cwd`, resolved to its top
   level). When that directory is not a repository, as in a cloud session root that holds
   several clones, it checks each immediate child repository and prefixes its paths. The
   message reaches the user, not the model: a `Stop` hook reaches the model only by blocking,
   and this hook never blocks.
3. **Configuration.** The default directories are the five above. `IPE_CE_ARTIFACT_DIRS`
   (comma-separated, repo-relative) replaces them; empty, absolute and `..` entries are dropped.
   `IPE_CE_ARTIFACT_HOOKS=off` (also `0` or `false`, any case) disables both hooks, following
   `IPE_BABYSIT_PR_HOOK` in [ADR-0004](0004-babysit-every-agent-opened-pull-request-through-a-posttooluse-hook.md).
4. **Safety.** Neither hook blocks or fails a tool call or a turn: every failure exits 0 with
   no output. Both need only `bash` and `git`, read the hook JSON with bash pattern matching as
   `hooks/skill-call-log.sh` does, and run on `/bin/bash` 3.2 and bash 5. Tests sit beside each
   hook and run in CI under both interpreters.

### Homes considered

| Home | Verdict | Reason |
|---|---|---|
| Keep them local to praxis | Rejected | Every other engineering repository keeps the gap, and each would copy the scripts. |
| The compound-engineering plugin | Not possible | The org consumes it as a mirror pinned by commit SHA (a devops-excellence ADR), so it cannot be edited locally. The hooks can be proposed upstream later. |
| The software-architecture plugin | Rejected | Its scope is architecture decisions and fitness functions, not the mechanics of a unit of work. |
| This plugin | Chosen | Its purpose is the life of a repository and of a unit of work, and its compounding-automation strategy names it the home for in-session compound-engineering hooks. |

### Placement fit check

Under the org's placement fit check for new capabilities (software-architecture-excellence
SAE-027), the verdict for this plugin is **Strong**: the capability serves every engineering
repository, depends on no domain, and extends the plugin's existing hook set.

## Consequences

- An artifact written through `Write` or `Edit` is in the index at once, and one that is still
  uncommitted at the end of a turn is named to the user.
- Overlap. The praxis copies stay until a praxis cloud session shows this plugin's hooks firing.
  This plugin comes from a private marketplace, and praxis records that private-marketplace
  plugins often do not load in cloud containers (praxis ADR-0167). Until then a praxis session
  that loads both sees two Stop messages, and staging runs twice, which is harmless.
- Removal. A later praxis pull request deletes its two scripts and their `settings.json`
  entries, after that check.
- The Stop message does not reach the model, so the session is not made to commit. A
  dispatched session that nobody watches can still strand an artifact; the stage hook narrows
  that to artifacts made outside `Write` and `Edit`.
- Not covered: a repository deeper than one level below a non-repository project directory, and
  compound-engineering's `docs_root` setting (no consuming repository sets it;
  `IPE_CE_ARTIFACT_DIRS` covers one that does).
- Under [ADR-0003](0003-split-engineering-practice-into-a-software-engineering-core-and-domain-plugins.md)
  these hooks are not yet assigned to a cluster. They serve sessions that use compound-engineering,
  like the agent-engineering cluster, but depend on it only by directory convention, not by
  invoking it. The extraction of that cluster decides whether they move with it.
