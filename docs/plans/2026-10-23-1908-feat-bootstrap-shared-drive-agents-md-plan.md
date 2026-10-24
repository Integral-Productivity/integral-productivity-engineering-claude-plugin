---
title: bootstrap-shared-drive writes AGENTS.md as the canonical drive context - Plan
type: feat
date: 2026-10-23
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# bootstrap-shared-drive writes AGENTS.md as the canonical drive context - Plan

## Goal Capsule

- Objective: Any agent that opens a Shared Drive bootstrapped by this skill (Claude in a local session, Claude through the Drive connector, or another coding agent) reads the same, single set of drive rules, and the Claude Project pointer the human pastes still finds those rules after the file is revised.
- Means: the skill generates `AGENTS.md` from the existing templates, writes a stub `CLAUDE.md` that imports it, migrates drives with a full `CLAUDE.md`, and prints pointer text that names `AGENTS.md` by drive ID and location (KTD1, KTD2, KTD3).
- Authority: SAE-023 (Proposed, software-architecture-excellence PR #116) > SAE-020 (Accepted) > this plan. The stacked base, PR #167, implements SAE-020.
- Stop conditions: stop if a change would need a new private-repo name in a file that `tools/check-internal-refs.mjs` checks; stop if SAE-023 text contradicts a step here.
- Execution profile: prose-only skill files (SKILL.md and templates). No runtime code. Verification is the repo checks plus a rendered-template read.
- Finishes and ships: lfg pipeline opens a PR against `review/bootstrap-shared-drive-connector-access` with the `hold-for-review` label. No merge.

## Product Contract

### Summary

Move the skill's output from one `CLAUDE.md` to `AGENTS.md` plus a stub `CLAUDE.md`, per SAE-023.

### Problem Frame

SAE-015 and SAE-020 make `CLAUDE.md` the drive context file. Only Claude reads that name by convention. Kraig chose `AGENTS.md` as the canonical file on 2026-10-23 so that every agent reads one file. Claude Code reads `CLAUDE.md` over `AGENTS.md` when both exist, and the documented bridge is a `CLAUDE.md` that imports `@AGENTS.md`. The `◉ Product` drive was changed to this shape by hand. The skill must now produce the same shape, or the next regeneration writes a full `CLAUDE.md` again.

### Requirements

- R1. The generated canonical file is `AGENTS.md` at the drive root. Its self-references (title query, "keep this file current", regeneration note) name `AGENTS.md`.
- R2. The skill writes a stub `CLAUDE.md` at the drive root: one sentence that names `AGENTS.md` as canonical, then the line `@AGENTS.md`, and nothing else.
- R3. On a drive with a full `CLAUDE.md` and no `AGENTS.md`, the skill moves the content to `AGENTS.md`, keeps hand-added "Working in this drive" bullets, replaces `CLAUDE.md` with the stub, and asks before it writes either drive-root file.
- R4. The Project pointer text names the Shared Drive ID and the file titled `AGENTS.md` whose parent is the drive root. It never names a file ID.
- R5. The connector write path (create, trash old, one-file check with `nextPageToken`) covers both files.
- R6. Hard constraints from SAE-016 and SAE-017 (no role text, Praxis-only Client data, zones) apply to `AGENTS.md`, and a new constraint forbids rules in the stub.
- R7. The skill's description still fires on "generate a CLAUDE.md for this drive" and also fires on AGENTS.md wording.

### Scope Boundaries

- Out: changing overlay content rules (SAE-016, SAE-017), the 👤 zone layout, or the folder map step from #167.
- Out: renaming or excluding template files in `tools/internal-refs.config.json`.
- Out: migrating real drives other than through the skill's own migration step.

### Sources

- SAE-023 draft: software-architecture-excellence PR #116.
- Stacked base: PR #167 in this repo (SAE-020 implementation).
- Claude Code memory docs, AGENTS.md and imports: https://code.claude.com/docs/en/memory#agents-md

## Planning Contract

### Key Technical Decisions

- KTD1. `AGENTS.md` is the generated canonical file. (session-settled: user-directed — chosen over keeping `CLAUDE.md` canonical: one file any agent reads, not only Claude.) Governs R1.
- KTD2. `CLAUDE.md` is a stub with one sentence and `@AGENTS.md`. (session-settled: user-approved — chosen over `AGENTS.md` only with no `CLAUDE.md`: Claude Code reads `AGENTS.md` natively only from v2.1.277 and not in every session.) Governs R2.
- KTD3. The Project pointer names `AGENTS.md` by drive ID, title, and parent. (session-settled: user-approved — chosen over a file-ID pointer: connector revisions give the file a new ID.) Governs R4.
- KTD4. Keep the template file names (`base-CLAUDE.md` and siblings) and state in SKILL.md that their rendered output is `AGENTS.md`. Renaming creates new paths that `tools/check-internal-refs.mjs` checks by default; the templates name a non-public repo, so a rename would fail CI or need new exclusions, which the config comment discourages. Governs R1.
- KTD5. Add the stub as a new template file `templates/stub-CLAUDE.md` with no repo names, so it passes the internal-refs check without an exclusion. Governs R2.
- KTD6. Fix #167's SAE links while editing the same lines: #167 cites `SAE-019-shared-drive-context-is-reached-through-the-drive-connector.md`, but that ADR merged as SAE-020 (SAE-019 is a different ADR). Governs R4, R5.

### Assumptions

- The `@AGENTS.md` import resolves on a Google Drive for desktop mount the same as in a git repo (relative to the importing file). SAE-023 lists this as an acceptance test.
- Bumping the SKILL.md frontmatter `version` from 0.1.0 to 0.2.0 is the expected signal; plugin version is release-please's job.

### Risks

- SAE-023 links use `blob/main` and return 404 until software-architecture-excellence PR #116 merges. Both PRs are held for review; merge #116 first.

### Sequencing

U1 then U2 then U3. All edit the same skill directory.

## Implementation Units

### U1. Templates render AGENTS.md and a stub CLAUDE.md

- Goal: rendered output is `AGENTS.md`; a stub template exists.
- Requirements: R1, R2, R4, R6.
- Files: `skills/bootstrap-shared-drive/templates/base-CLAUDE.md`, `skills/bootstrap-shared-drive/templates/circle-role-CLAUDE.md`, `skills/bootstrap-shared-drive/templates/client-CLAUDE.md` and `fallback-CLAUDE.md` (only if they self-reference the file name), new `skills/bootstrap-shared-drive/templates/stub-CLAUDE.md`.
- Approach: retitle the base heading to "Agent Context"; add a line that `CLAUDE.md` imports this file; change "This file" query to `title = 'AGENTS.md'`; the Project pointer bullet names `AGENTS.md`; "Keep this AGENTS.md current"; circle-role regeneration note names `AGENTS.md`; provenance links point to SAE-020 (KTD6) and SAE-023.
- Test scenarios: render the ◉ overlay mentally with `◉ Product` values and compare with the hand-made drive `AGENTS.md`; grep templates for `CLAUDE.md` and confirm each remaining mention is intended (the import note only); stub file has exactly two non-empty lines: one sentence naming `AGENTS.md` as canonical, then `@AGENTS.md`. No heading.
- Verification: `node tools/check-internal-refs.mjs skills/bootstrap-shared-drive/templates/stub-CLAUDE.md` prints `ok` (an untracked file is not scanned by the no-argument run), and the no-argument run also passes after the file is staged.

### U2. SKILL.md steps write both files, migrate, and print the pointer

- Goal: the algorithm produces the SAE-023 shape.
- Requirements: R2, R3, R4, R5, R6, R7.
- Files: `skills/bootstrap-shared-drive/SKILL.md`.
- Approach: description and title name AGENTS.md and keep the CLAUDE.md trigger phrases; hard constraints apply to `AGENTS.md` and add "never put rules in the stub"; Step 3 says templates render to `AGENTS.md`; Step 4 writes `AGENTS.md` then the stub, with a migration sub-step for a full `CLAUDE.md` and no `AGENTS.md`, asking before drive-root writes; connector path and one-file check cover both titles; Step 5 pointer text names `AGENTS.md`; cross-references add SAE-023 and fix SAE-019 → SAE-020; "Promote to tested" adds a migration criterion; version 0.2.0.
- Test scenarios: read Step 4 against five drive states and confirm each has one defined action: (a) no files: write both; (b) full `CLAUDE.md`, no `AGENTS.md`: migrate per R3; (c) both files in SAE-023 shape: regenerate `AGENTS.md` header sections only; (d) `AGENTS.md` plus a `CLAUDE.md` that is not the stub (an interrupted migration, or an old-skill regeneration): treat `AGENTS.md` as canonical, show the human the "Working in this drive" bullets found only in `CLAUDE.md`, ask, merge the approved bullets into `AGENTS.md`, then replace `CLAUDE.md` with the stub; (e) `AGENTS.md`, no `CLAUDE.md`: write the stub. Confirm no step names a file ID.
- Verification: `node --test tools/*.test.mjs` passes; grep SKILL.md for `SAE-019-shared-drive` returns nothing.

### U3. README row reflects AGENTS.md

- Goal: the plugin README describes current output.
- Requirements: R7.
- Files: `README.md`.
- Approach: change the `bootstrap-shared-drive` row to say it generates `AGENTS.md` plus a `CLAUDE.md` stub.
- Test scenarios: none beyond the internal-refs check.
- Verification: `node tools/check-internal-refs.mjs` passes.

## Verification Contract

- `node tools/check-internal-refs.mjs` — must print `ok`.
- `node --test tools/*.test.mjs` — 0 fail.
- `grep -rn "SAE-019-shared-drive" skills/bootstrap-shared-drive` — no output.
- Manual: a rendered ◉ `AGENTS.md` matches the `◉ Product` drive file (title `AGENTS.md`, parent Shared Drive `0AO5T4ti-USGQUk9PVA`, read through the Drive connector or the local mount) in the template-generated sections only: heading, Domain holder, Essential context, standard "Working in this drive" bullets, Finding things in this drive, Provenance. Hand-added sections are out of the comparison.

## Definition of Done

- U1–U3 done and each Verification line passes.
- No template or step names a `CLAUDE.md` or `AGENTS.md` file ID.
- No abandoned edits or experimental files left in the diff.
- PR opened against `review/bootstrap-shared-drive-connector-access`, labeled `hold-for-review`, not merged.
