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
this plugin's repo root) checks every row above as an exact substring of the
newest installed CE version, or of `--skills-dir <path>`. Exit 1 names each
pin that no longer holds and the profile rule it backs; exit 2 means no CE
install was found and nothing was verified. It is not wired into CI, because
CI has no installed CE to read. Whoever bumps CE runs it before trusting the
profiles again; until it passes, treat every non-`PUBLIC` run as unprotected
and stop.

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
sees it. Before ce-code-review the verifier runs
`gitleaks git --log-opts "<base>..<sha>" --no-banner --redact .` in its review
worktree. Any finding, a missing `gitleaks`, or a failed run turns the
cross-model pass off for that review, exactly as for a private repo, and a
finding is also BLOCKING and reported to the lead. The fixer does not scan:
its external-engine route is off whenever a repo is not `PUBLIC`, and its
native route sends nothing to another provider.
