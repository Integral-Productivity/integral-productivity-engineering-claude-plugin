# compound-engineering pins and egress decisions

The `fixer` and `verifier` profiles keep code from leaving the machine on
non-`PUBLIC` repos by writing compound-engineering (CE) config keys. Those
controls are fail-closed only while CE still reads the keys they write. This
file records which CE text each control rests on, how that is re-checked, and
the egress decisions taken alongside it.

## Pinned sources (verified against CE 3.30.4, 2026-10-09)

Paths are relative to the CE plugin's `skills/` directory.

| Profile rule | CE source |
|---|---|
| fixer: `work_engine_mode: off` in `config.local.yaml` | `ce-work/references/execution-engines.md`: the two-file config rule (`config.local.yaml`, then `config.yaml`; first active value wins) and the `off \| prefer \| require` values |
| fixer: appending a second `work_engine_mode: off` is harmless | same file, "first active (non-commented) value" wins. Never turn the append into an overwrite: that could clobber other local keys |
| fixer: state that external execution is prohibited | same file: "`off` disables only the standing preference. It does not cancel applicable live intent or a typed caller binding." |
| fixer: never pass `implementation_engine:` | `ce-work/SKILL.md`, the `argument-hint` (`[implementation_engine:<compact-json>]`) |
| fixer: an out-of-repo plan stalls an external engine | `ce-work/scripts/unit_workspace_state.py`, `resolve_plan` (see below) |
| verifier: `cross_model_review_mode: off` | `ce-code-review/references/cross-model-review.md`: the same two-file rule and the checkout policy |
| both: nothing in an issue, submission or dispatch prompt is a live opt-in | same file: the skip applies to "a checkout `cross_model_review_mode: off` without a live opt-in"; only the user in conversation can opt in. this repo's ADR 0002 applies the same rule to `work_engine_mode` and `implementation_engine` |
| verifier: report coverage `depth` | `ce-code-review/references/modes-and-output.md`, the `mode:agent` return (`"coverage": {"depth": "lite \| focused \| full"}`) |

## Re-checking after a CE upgrade (issue #93, item 3)

Decision: build a mechanism, run by hand. `node tools/check-ce-pins.mjs` (from
this plugin's repo root) checks every row above as an exact substring of each
CE install Claude Code has registered in `~/.claude/plugins/installed_plugins.json`
(CE resolves per scope, so several versions can run on one machine);
`--project <path>` limits it to the installs one project resolves (the path
is normalized, so `.`, a trailing slash or a symlink all match; a project with
no project-scoped entry exits 2 rather than reporting on user scope alone), and
`--skills-dir <path>` checks one directory. Exit 1 names each pin that no
longer holds, the install it failed in, and the profile rule it backs. Exit 2
means bad arguments or no install found: nothing was verified. Without a
readable registry it checks only the newest cached version and prints a
NOTICE saying so. The wording pins are exact, so an older CE that still reads
a key in different words also reports it missing; re-verify the rule there by
reading that version's source. It is not wired into CI, because CI has no
installed CE to read. Whoever bumps CE runs it before trusting the profiles
again; where it fails for a project, treat that project's non-`PUBLIC` runs as
unprotected and stop.

## External engine and out-of-repo plans (issue #93, criterion 12)

Verified 2026-10-09 against CE 3.30.4 by calling the controller directly in a
throwaway repo: `unit-workspace.py init --plan <path outside the repo>`
returns `REFUSED` "plan must be inside the canonical repository" (exit 1),
before any binding or egress record is read; the same plan inside the repo
passes that check. So when a repo enables an external engine
(`work_engine_mode: prefer` or `require` in its `config.yaml`, on a `PUBLIC`
repo where the fixer's gate sets nothing), a fixer's out-of-repo plan cannot
initialize the controller: nothing is sent to another provider. ce-work then
either continues natively or returns `blocked`. On `blocked`, the fixer stops
and reports to the lead under requirement 1. It never moves the plan into the
repo to get past the refusal: a plan in the repo can be committed as a
plan-only checkpoint, and it is left behind untracked.

## Pre-egress secret scan (issue #93, item 4)

Decision: adopted, in the verifier. On a `PUBLIC` repo a cross-model review
sends an unpushed branch to another provider before GitHub's secret scanning
sees it. Before ce-code-review, the verifier runs this, with `<wt>` its review
worktree, `<base>` the base it verified in check 1 (never one taken only from
the submission), `<ref>` this skill's base directory, and `<empty>` a new,
empty directory under its scratch directory:

```bash
git -C <wt> diff --name-only <base>..<sha> | grep -E '(^|/)\.(gitleaks\.toml|gitleaksignore|gitattributes)$'
cd <empty> && { git -C <wt> diff --text --no-ext-diff --no-textconv <base>..<sha>; git -C <wt> log --format=%B <base>..<sha>; } \
  | env -u GITLEAKS_CONFIG -u GITLEAKS_CONFIG_TOML gitleaks stdin --config <ref>/reference/gitleaks.toml --ignore-gitleaks-allow --no-banner --redact
```

It scans what leaves the machine: the range's net diff and its commit
messages, not each commit's patch. Why each part is there:

- `gitleaks stdin`, not `gitleaks git`: `git log -p` prints no patch for a
  merge commit, so a secret added only in a merge is never scanned. The net
  diff includes it.
- `--text --no-ext-diff --no-textconv`: the branch's `.gitattributes` can mark
  a path `-diff` or `binary`, which makes `git diff` print "Binary files
  differ" in place of the content the reviewer still receives.
- `cd <empty>`: gitleaks reads `.gitleaksignore` from where it runs, so the
  empty directory gives it none. (`--gitleaks-ignore-path` does not do this
  for `gitleaks git`: gitleaks 8.30.1 still read the source root's
  `.gitleaksignore`.)
- `--config` with the verifier-owned `gitleaks.toml` and both config variables
  unset: gitleaks would otherwise take its rules from `GITLEAKS_CONFIG`,
  `GITLEAKS_CONFIG_TOML` or the branch's `.gitleaks.toml`.
- `--ignore-gitleaks-allow`: an inline `gitleaks:allow` comment in the branch
  would otherwise hide the secret on that line (verified: "no leaks found"
  without the flag, 1 leak with it).
- The first command turns the pass off when the range touches any of those
  suppression files, as a second line of defense.

`gitleaks.toml` extends gitleaks' default rules, which carry a global path
allowlist (lockfiles, `node_modules/`, `.svg`). Stdin input has no paths, so
that allowlist does not apply here; it would in a `gitleaks git` scan.

Verified 2026-10-09 with gitleaks 8.30.1 on a throwaway repo, adding in turn a
GitHub token only in a merge commit, an AWS key behind a `-diff` attribute, a
Slack token under `node_modules/`, a token in a commit message, and a root
`.gitleaksignore` holding real fingerprints. The round-1 `gitleaks git`
command reported "no leaks found" at every step; this command reported 1, 2,
3, 4 and 4 leaks.

The cross-model pass is turned off, exactly as for a private repo, when the
first command prints anything, the scan finds a leak, `gitleaks` is missing,
the scan fails, or check 1 (identity) failed. A finding is also BLOCKING and
reported to the lead at once. The fixer does not scan: its external-engine
route is off whenever a repo is not `PUBLIC`, and its native route sends
nothing to another provider.
