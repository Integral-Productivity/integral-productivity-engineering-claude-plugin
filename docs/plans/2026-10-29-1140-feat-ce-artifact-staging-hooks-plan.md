---
title: Compound-engineering artifact staging hooks - Plan
type: feat
date: 2026-10-29
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Compound-engineering artifact staging hooks - Plan

## Goal Capsule

- **Objective:** In every engineering repository that enables this plugin, a compound-engineering artifact (plan, ideation, brainstorm, ADR or solution doc) that a session writes is tracked by git at once, and any such artifact not yet committed at the end of a turn is named to the user, so no artifact stays invisible in one worktree.
- **Means:** two plugin hooks ported from a sibling internal product repository (praxis) and generalized (KTD1, KTD2).
- **Authority:** this plan's Requirements, then KTDs, then units. Praxis ADR-0137/ADR-0167 and SAE-027 are context, not overrides.
- **Stop conditions:** stop if a plugin hook cannot receive the `Write`/`Edit` file path in its payload, or if a Stop hook cannot emit `systemMessage` without blocking.
- **Execution profile:** bash hooks plus bash test suites; no new runtime dependency.
- **Finishes and ships:** the implementing agent opens one pull request in this repo. Removing the praxis copies is a later praxis PR (Scope Boundaries).

---

## Product Contract

### Summary

Add `hooks/stage-ce-artifact.sh` (PostToolUse `Write|Edit`) and `hooks/warn-untracked-ce-artifacts.sh` (Stop) to the plugin, with tests, CI wiring, an opt-out variable, a configurable directory list, and ADR-0006.

### Problem Frame

Compound-engineering skills write durable artifacts to `docs/plans/`, `docs/ideation/`, `docs/brainstorms/`, `docs/adr/` and `docs/solutions/`, and the commit is a later step that a session often skips when it pivots. On 2026-08-10 praxis found two such artifacts stranded three days after creation, already cited by a merged ADR and four issues. Praxis fixed this with two repo-local hooks. Every other engineering repo still has the gap. The assessment at `/mnt/project-files/assessments/praxis-hooks-extraction-assessment.md` (machine-local, best effort) found both hooks generic and gave this plugin a Strong placement verdict under SAE-027.

### Key Decisions

- **Ship the two hooks from this plugin.** (session-settled: user-approved — chosen over keeping them repo-local in praxis or placing them in software-architecture-claude-plugin: SAE-027 gave Strong for this plugin, whose purpose is "the life of a repo and of a unit of work", and `docs/strategy/compounding-automation.md` names it the home for in-session CE hooks.) Governs R1, R2, R4.
- **One opt-out variable, `IPE_CE_ARTIFACT_HOOKS`.** (session-settled: user-approved — chosen over no opt-out: matches the `IPE_BABYSIT_PR_HOOK` precedent of ADR-0004, and some repos may not want auto-staging.) Governs R5.
- **Record the decision as ADR-0006.** (session-settled: user-approved — chosen over no ADR: the operator keeps decision provenance in ADRs.) Governs R8.
- **This change edits only this repo.** (session-settled: user-approved — chosen over removing the praxis copies now: the copies overlap until a praxis cloud session shows the plugin hook firing.) Governs R9.

### Requirements

**Staging**

- R1. After a `Write` or `Edit` creates or changes a file inside a configured artifact directory of a git repository, and git does not yet track that file, the file is staged in that repository. Edits to already-tracked files are left to the session, so partial staging and unrelated commits are not disturbed.
- R2. A file outside the configured directories, a git-ignored file, a missing file, or a file outside any git repository is left alone.
- R3. The configured directories default to `docs/plans`, `docs/ideation`, `docs/brainstorms`, `docs/adr` and `docs/solutions`, and `IPE_CE_ARTIFACT_DIRS` (comma-separated, repo-relative) replaces the default.

**End-of-turn warning**

- R4. At Stop, when the project repository (or, when the project directory is not a repository, any of its immediate child repositories) holds files in the configured directories that are not in `HEAD`, either untracked and non-ignored or staged as added, the user sees one message that counts and lists them; otherwise the hook prints nothing. The message reaches the user, not the model: a Stop hook can reach the model only by blocking, which R6 rules out.

**Safety and control**

- R5. `IPE_CE_ARTIFACT_HOOKS=off` (also `0` or `false`, any case) disables both hooks.
- R6. Neither hook ever blocks or fails a tool call or a turn: every failure exits 0 with no output.
- R7. Both hooks run on `/bin/bash` 3.2 and bash 5 and need only bash and `git`.

**Records**

- R8. ADR-0006 records the decision, the SAE-027 verdict, the homes considered, and the overlap and removal plan.
- R9. The praxis repository is not changed.
- R10. `README.md`, `CLAUDE.md` and the `hooks/hooks.json` description list both hooks and the two variables.

### Scope Boundaries

- Not built: honoring compound-engineering's `docs_root` setting from `.compound-engineering/config.yaml`. No consuming repo sets it today; `IPE_CE_ARTIFACT_DIRS` covers a repo that does. Revisit when a repo sets `docs_root`.
- Not built: checking repositories other than the project repository at Stop, except the immediate child repositories of a project directory that is not itself a repository (the multi-repo cloud layout). A deeper or unrelated clone gets staging (R1) but no Stop backstop. Revisit if stranded artifacts appear there.
- Not built: a SubagentStop registration. Subagent writes are staged by R1, and the main session's Stop sees the shared working tree.

#### Deferred to Follow-Up Work

- A praxis PR that removes `.claude/hooks/stage-ce-artifact.sh`, `.claude/hooks/warn-untracked-ce-artifacts.sh` and their `settings.json` entries, after a praxis cloud session shows this plugin's hooks firing.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Stage in the file's own repository.** The hook resolves a relative `file_path` against the payload `cwd`, then derives the repo-relative path as `$(git -C <file's directory> rev-parse --show-prefix)<basename>` and uses `--show-toplevel` only as the `-C` target for `check-ignore` and `git add`. The prefix form avoids stripping a top-level prefix, which fails when the path goes through a symlink (macOS `/var` → `/private/var`), because `--show-toplevel` returns the resolved real path. This is correct for a multi-repo session, where the project directory, the shell directory and the file's repository can all differ; the praxis original ran `git add` from the shell directory.
- KTD2. **No jq; bash pattern matching, like `hooks/skill-call-log.sh`.** Fields are read from the hook JSON with the same `field` regex helper. A `file_path` whose JSON body holds a backslash escape is skipped rather than decoded, because a correct unescape needs code this hook does not otherwise need and such paths do not occur in CE artifact directories. The Stop message is JSON-escaped with the builtins-only escaping of `hooks/standing-lfg.sh`.
- KTD3. **The Stop hook checks the project repository:** `CLAUDE_PROJECT_DIR`, else the payload `cwd`, resolved to its top level with `git -C <dir> rev-parse --show-toplevel` so the configured directories stay repo-relative. When that directory is not inside a work tree, it checks each immediate child directory that is a git top level instead, and prefixes each listed path with the child's name. In each repository it lists two kinds: untracked files, and files staged as added but absent from `HEAD` (`git diff --cached --name-only -z --diff-filter=A -- <dirs>`, which also works before the first commit). For untracked files it runs `git -c core.quotePath=false ls-files -z --others --exclude-standard -- <dirs>` over the configured directories, which honors `.gitignore`; entries are split on NUL (`read -r -d ''`) so unusual names reach the JSON escaper verbatim instead of C-quoted.
- KTD4. **Directory list parsing.** `IPE_CE_ARTIFACT_DIRS` is split on commas, each entry trimmed of surrounding spaces and a trailing slash. An entry that is empty, absolute, or contains `..` is dropped; if no valid entry remains, the hook does nothing. A path matches when it equals `<dir>/` plus at least one more character.
- KTD5. **Respect `.gitignore` and never force-add.** `git check-ignore -q` before `git add --`, as in the praxis original.

### Assumptions

- The Claude Code PostToolUse payload for `Write` and `Edit` carries `tool_input.file_path` and `cwd`, as the praxis original and `skill-call-log.sh` rely on.
- A Stop hook's top-level `systemMessage` is shown to the user and does not block, as the praxis original relies on. The model does not receive it.
- `git` is on `PATH` in the CI macOS runner (it checks out the repo with it).

---

## Implementation Units

### U1. Stage hook

- **Goal:** stage a CE artifact the moment it is written.
- **Requirements:** R1, R2, R3, R5, R6, R7.
- **Dependencies:** none.
- **Files:** `hooks/stage-ce-artifact.sh`, `hooks/stage-ce-artifact.test.sh`.
- **Approach:**
  1. Opt-out check (R5), then read stdin with the `skill-call-log.sh` pattern; require `tool_input` and a non-empty `file_path` with no backslash (KTD2).
  2. Resolve a relative path against `cwd`; skip when the file does not exist.
  3. Find the repo top level from the file's directory and derive the repo-relative path from `--show-prefix` plus the basename (KTD1); match it against the directory list (KTD4).
  4. Skip when `git ls-files --error-unmatch` shows the file is already tracked (R1); otherwise `check-ignore`, then `git add --` (KTD5). All stderr discarded; exit 0.
- **Patterns to follow:** `hooks/skill-call-log.sh` (header comment, `exec 2>/dev/null`, `field` helper), praxis `stage-ce-artifact.sh` (rationale comment).
- **Test scenarios:** each runs the hook against a fresh temporary git repository.
  - A new file under `docs/plans/` given as an absolute path is staged.
  - A relative `file_path` with `cwd` set to the repo is staged.
  - A file under `src/` is not staged.
  - A path `mydocs/plans/x.md` is not staged (anchored match).
  - A file under `docs/plans/` that `.gitignore` excludes is not staged.
  - A `file_path` naming a missing file: exit 0, nothing staged.
  - A file outside any git repository: exit 0, no error output.
  - `IPE_CE_ARTIFACT_HOOKS=off`, `0` and `FALSE` each leave a matching file unstaged.
  - `IPE_CE_ARTIFACT_DIRS=notes` stages `notes/a.md` and no longer stages `docs/plans/a.md`.
  - `IPE_CE_ARTIFACT_DIRS` with only invalid entries (`/abs`, `../x`, empty) stages nothing.
  - Malformed stdin (not JSON, empty, no `tool_input`, unterminated string): exit 0, no output.
  - Session directory differs from the file's repository: the file is staged in its own repository, and the session directory's repository is unchanged.
  - The file path goes through a symlinked directory: the file is still staged.
  - An Edit to an already-tracked file under `docs/adr/` with unstaged changes leaves the index unchanged.
  - Every run prints nothing on stdout or stderr.
- **Verification:** the suite passes under `/bin/bash` 3.2 and bash 5.

### U2. Stop warning hook

- **Goal:** name uncommitted CE artifacts at the end of each turn.
- **Requirements:** R3, R4, R5, R6, R7.
- **Dependencies:** none (shares the directory-list rule with U1 by KTD4; the two scripts each carry the small parser).
- **Files:** `hooks/warn-untracked-ce-artifacts.sh`, `hooks/warn-untracked-ce-artifacts.test.sh`.
- **Approach:**
  1. Opt-out check, then resolve the project directory to its repository top level, or to its immediate child repositories when it is not a work tree (KTD3); exit 0 when there is none.
  2. In each repository, list untracked files and files staged as added but not in `HEAD` over the valid configured directories, NUL-delimited with quoting off (KTD3); exit 0 silently when none.
  3. Build the message (count, one `  · <path>` line per file marked untracked or staged, then the commit instruction), JSON-escape it (KTD2) and print `{"systemMessage": "..."}`.
- **Patterns to follow:** `hooks/standing-lfg.sh` escaping; praxis `warn-untracked-ce-artifacts.sh` message text.
- **Test scenarios:**
  - Clean repository: no output, exit 0.
  - Two untracked files under `docs/adr/` and `docs/solutions/`: output parses as JSON with only `systemMessage`, which says `2 untracked` and names both paths.
  - A committed file in `docs/plans/`: not listed.
  - A new file in `docs/plans/` that is staged but not committed: listed, marked staged, including in a repository with no commits yet.
  - An untracked but git-ignored file in `docs/plans/`: not listed.
  - An untracked file under `src/`: not listed, no output.
  - A file name containing a double quote and a tab: output is still valid JSON and carries the name.
  - `CLAUDE_PROJECT_DIR` unset: the payload `cwd` is used.
  - Project directory not a git repository and with no child repositories: no output, exit 0.
  - Project directory not a git repository, holding two child repositories, one with an untracked artifact: that artifact is listed with the child's name as prefix; the clean child adds nothing.
  - Project directory is a subdirectory of a repository: artifacts at the repository's `docs/plans/` are still listed.
  - `IPE_CE_ARTIFACT_HOOKS=off`: no output even with untracked artifacts.
  - `IPE_CE_ARTIFACT_DIRS=notes`: an untracked `notes/x.md` is listed and an untracked `docs/plans/y.md` is not.
- **Verification:** the suite passes under `/bin/bash` 3.2 and bash 5.

### U3. Registration, CI and docs

- **Goal:** make the hooks load from the plugin and keep them tested.
- **Requirements:** R10.
- **Dependencies:** U1, U2.
- **Files:** `hooks/hooks.json`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`.
- **Approach:**
  1. `hooks.json`: add a `PostToolUse` entry with matcher `Write|Edit` and a `Stop` entry, each `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>"` with `timeout: 10`; extend the description.
  2. `ci.yml` `bash-hook-tests`: run both new suites under `/bin/bash` and `$BASH5`; update the job comment.
  3. `README.md` hooks tables and `CLAUDE.md` plugin layout: add both hooks and their variables.
- **Patterns to follow:** the existing `babysit-pr` and `skill-call-log` entries.
- **Test expectation:** none -- configuration and documentation; `hooks.json` validity is checked by parsing it, and the CI job proves the wiring.
- **Verification:** `hooks.json` parses as JSON; CI runs four bash suites under each interpreter.

### U4. ADR-0006

- **Goal:** record the placement decision.
- **Requirements:** R8, R9.
- **Dependencies:** none.
- **Files:** `docs/adr/0006-stage-compound-engineering-artifacts-at-write-time-from-the-engineering-plugin.md`.
- **Approach:** follow the format of `docs/adr/0004-…`. Context: the stranded-artifact incident and the praxis hooks. Decision: the two hooks, KTD1 to KTD4 in brief, the two variables. Alternatives considered: praxis-local, the compound-engineering mirror (devops-excellence ADR-097 pins it by SHA, so local edits are not possible), software-architecture-claude-plugin. Placement: SAE-027 verdict Strong with its evidence. Consequences: overlap and removal plan, the private-marketplace risk from praxis ADR-0167, double Stop message during overlap. Status: Proposed. This plugin is public and CI's internal-refs check fails any org-prefixed name or URL of a non-public repo, so cite praxis, devops-excellence and software-architecture-excellence material by generic description (for example "the praxis repository's ADR-0137"), never by org/repo name or GitHub URL.
- **Test expectation:** none -- documentation.
- **Verification:** links resolve to existing repo paths or public URLs; `node tools/check-internal-refs.mjs` passes.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Stage hook suite | `/bin/bash hooks/stage-ce-artifact.test.sh /bin/bash` and the same under bash 5 | U1 |
| Stop hook suite | `/bin/bash hooks/warn-untracked-ce-artifacts.test.sh /bin/bash` and the same under bash 5 | U2 |
| Existing suites still pass | `hooks/standing-lfg.test.sh`, `hooks/skill-call-log.test.sh`, `node --test hooks/babysit-pr.test.mjs` | U3 |
| Manifest JSON | `python3 -m json.tool hooks/hooks.json` | U3 |
| Internal refs | `node tools/check-internal-refs.mjs` (CI runs it on every tracked file, this plan included) | U3, U4 |

Local runs may only have bash 5; CI covers 3.2 on macOS.

## Definition of Done

- R1 to R10 hold, each traced to a passing scenario or a reviewed document change.
- All suites in the Verification Contract pass locally under the available bash, and CI passes.
- No praxis file is changed.
- No dead code or abandoned approach remains in the diff.
