#!/usr/bin/env bash
# Tests for hooks/stage-ce-artifact.sh, the PostToolUse(Write|Edit) hook that stages a new
# compound-engineering artifact in its own repository.
#
# Usage: bash hooks/stage-ce-artifact.test.sh [BASH]
#   BASH (first argument) is the interpreter the hook runs under. It defaults to the bash
#   running this script, so `/bin/bash hooks/stage-ce-artifact.test.sh` tests bash 3.2 on macOS
#   and `/opt/homebrew/bin/bash hooks/stage-ce-artifact.test.sh /opt/homebrew/bin/bash` tests bash 5.
# Every check runs against a fresh temporary git repository; the user's git config is ignored.
# Prints a pass/fail summary and exits nonzero when any check fails.

here=$(cd "$(dirname "$0")" && pwd)
hook_bash=${1:-$BASH}
hook="$here/stage-ce-artifact.sh"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
not_ok() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; [ -n "$2" ] && printf '       %s\n' "$2"; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/stage-ce-artifact-test.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com
unset IPE_CE_ARTIFACT_HOOKS IPE_CE_ARTIFACT_DIRS

n=0
newrepo() { # -> $repo, an empty repository with one commit
  n=$((n + 1))
  repo=$tmp/r$n
  mkdir -p "$repo" && git -C "$repo" init -q && git -C "$repo" commit -q --allow-empty -m init
}
mk() { mkdir -p "$(dirname "$1")" && printf 'x\n' >"$1"; }

payload() { # FILE_PATH CWD
  printf '{"session_id":"s","cwd":"%s","hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"%s","content":"say \\"file_path\\": \\"decoy\\""},"tool_response":{"type":"create"}}' "$2" "$1"
}

run() { # STDIN [ENV=VALUE ...]
  local in=$1
  shift
  printf '%s' "$in" | env "$@" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
  rc=$?
}

quiet() { [ "$rc" -eq 0 ] && [ ! -s "$tmp/out" ] && [ ! -s "$tmp/err" ]; }
why() { printf 'exit %s; stdout: %s; stderr: %s' "$rc" "$(head -c 150 "$tmp/out")" "$(head -c 150 "$tmp/err")"; }
staged() { git -C "$1" diff --cached --name-only -- "$2" | grep -qx -- "$2"; }

expect_staged() { # NAME REPO REL
  if ! quiet; then not_ok "$1" "$(why)"; elif staged "$2" "$3"; then ok "$1"; else not_ok "$1" "$3 not staged"; fi
}
expect_unstaged() { # NAME REPO REL
  if ! quiet; then not_ok "$1" "$(why)"; elif staged "$2" "$3"; then not_ok "$1" "$3 was staged"; else ok "$1"; fi
}

printf '# hook interpreter: %s (%s)\n' "$hook_bash" "$("$hook_bash" -c 'echo "$BASH_VERSION"')"

# 1. Absolute path under docs/plans/.
newrepo
mk "$repo/docs/plans/a.md"
run "$(payload "$repo/docs/plans/a.md" /elsewhere)"
expect_staged "new file under docs/plans/ (absolute path) is staged" "$repo" docs/plans/a.md

# 2. Relative path resolved against cwd; every default directory.
newrepo
for d in docs/plans docs/ideation docs/brainstorms docs/adr docs/solutions; do
  mk "$repo/$d/rel.md"
  run "$(payload "$d/rel.md" "$repo")"
  expect_staged "relative path under $d/ with cwd at the repo is staged" "$repo" "$d/rel.md"
done

# 3. Outside the configured directories.
newrepo
mk "$repo/src/a.md"
run "$(payload "$repo/src/a.md" "$repo")"
expect_unstaged "file under src/ is not staged" "$repo" src/a.md
mk "$repo/mydocs/plans/x.md"
run "$(payload "$repo/mydocs/plans/x.md" "$repo")"
expect_unstaged "mydocs/plans/x.md is not staged (anchored match)" "$repo" mydocs/plans/x.md

# 4. Ignored file.
newrepo
printf 'docs/plans/secret.md\n' >"$repo/.gitignore"
mk "$repo/docs/plans/secret.md"
run "$(payload "$repo/docs/plans/secret.md" "$repo")"
expect_unstaged "git-ignored file under docs/plans/ is not staged" "$repo" docs/plans/secret.md

# 5. Missing file, and a file outside any repository.
newrepo
run "$(payload "$repo/docs/plans/missing.md" "$repo")"
if quiet && [ -z "$(git -C "$repo" diff --cached --name-only)" ]; then ok "missing file: exit 0, nothing staged"; else not_ok "missing file: exit 0, nothing staged" "$(why)"; fi
mk "$tmp/norepo/docs/plans/a.md"
run "$(payload "$tmp/norepo/docs/plans/a.md" "$tmp/norepo")"
if quiet; then ok "file outside any repository: exit 0, silent"; else not_ok "file outside any repository: exit 0, silent" "$(why)"; fi

# 6. Opt-out values.
for v in off 0 FALSE False; do
  newrepo
  mk "$repo/docs/adr/a.md"
  run "$(payload "$repo/docs/adr/a.md" "$repo")" IPE_CE_ARTIFACT_HOOKS="$v"
  expect_unstaged "IPE_CE_ARTIFACT_HOOKS=$v leaves a matching file unstaged" "$repo" docs/adr/a.md
done
newrepo
mk "$repo/docs/adr/a.md"
run "$(payload "$repo/docs/adr/a.md" "$repo")" IPE_CE_ARTIFACT_HOOKS=on
expect_staged "IPE_CE_ARTIFACT_HOOKS=on still stages" "$repo" docs/adr/a.md

# 7. Directory override.
newrepo
mk "$repo/notes/a.md"
mk "$repo/docs/plans/a.md"
run "$(payload "$repo/notes/a.md" "$repo")" IPE_CE_ARTIFACT_DIRS=' notes/ , other'
expect_staged "IPE_CE_ARTIFACT_DIRS=' notes/ , other' stages notes/a.md" "$repo" notes/a.md
run "$(payload "$repo/docs/plans/a.md" "$repo")" IPE_CE_ARTIFACT_DIRS=notes
expect_unstaged "IPE_CE_ARTIFACT_DIRS=notes no longer stages docs/plans/a.md" "$repo" docs/plans/a.md
newrepo
mk "$repo/x/a.md"
mk "$repo/docs/plans/a.md"
for v in '/abs,../x,,' '' 'x/../x'; do
  run "$(payload "$repo/x/a.md" "$repo")" IPE_CE_ARTIFACT_DIRS="$v"
  expect_unstaged "IPE_CE_ARTIFACT_DIRS=$(printf '%q' "$v") (no valid entry) stages nothing" "$repo" x/a.md
  run "$(payload "$repo/docs/plans/a.md" "$repo")" IPE_CE_ARTIFACT_DIRS="$v"
  expect_unstaged "IPE_CE_ARTIFACT_DIRS=$(printf '%q' "$v") does not fall back to the defaults" "$repo" docs/plans/a.md
done

# 8. Malformed stdin.
newrepo
mk "$repo/docs/plans/a.md"
for bad in 'not json' '' '{"cwd":"x"}' '{"tool_input":{}}' '{"tool_input":{"file_path":"unterminated' "{\"tool_input\":{\"file_path\":\"$repo/docs/plans/a\\u002emd\"}}"; do
  run "$bad"
  expect_unstaged "malformed stdin $(printf '%q' "$bad"): exit 0, silent, nothing staged" "$repo" docs/plans/a.md
done

# 8b. A JSON escape is skipped, not taken literally: a file whose name is the undecoded
# escape stays unstaged.
lit='docs/plans/b\u002emd'
mk "$repo/$lit"
run "{\"tool_input\":{\"file_path\":\"$repo/docs/plans/b\\u002emd\"}}"
# staged() cannot see this name (quotePath and grep both treat the backslash specially), so
# ask the index directly with a literal pathspec.
if quiet && [ -z "$(git --literal-pathspecs -C "$repo" ls-files -- "$lit")" ]; then ok "file_path with a JSON escape: the literal-named file is not staged"; else not_ok "file_path with a JSON escape: the literal-named file is not staged" "$(why)"; fi

# 8c. A decoy file_path inside content that precedes the real key does not win.
newrepo
mk "$repo/docs/plans/real.md"
mk "$repo/docs/plans/decoy.md"
run "{\"cwd\":\"$repo\",\"tool_input\":{\"content\":\"\\\"file_path\\\": \\\"$repo/docs/plans/decoy.md\\\"\",\"file_path\":\"$repo/docs/plans/real.md\"}}"
expect_staged "content before file_path: the real file is staged" "$repo" docs/plans/real.md
expect_unstaged "content before file_path: the decoy is not staged" "$repo" docs/plans/decoy.md

# 9. The file's repository differs from the session directory.
newrepo
session=$repo
newrepo
mk "$repo/docs/solutions/a.md"
run "$(payload "$repo/docs/solutions/a.md" "$session")"
expect_staged "file in another repository is staged in its own repository" "$repo" docs/solutions/a.md
if [ -z "$(git -C "$session" diff --cached --name-only)" ]; then ok "session directory's repository is unchanged"; else not_ok "session directory's repository is unchanged"; fi

# 10. Path through a symlinked directory.
newrepo
ln -s "$repo" "$tmp/link$n"
mk "$repo/docs/plans/l.md"
run "$(payload "$tmp/link$n/docs/plans/l.md" /)"
expect_staged "path through a symlinked directory is staged" "$repo" docs/plans/l.md

# 11. An already-tracked file keeps its unstaged edit out of the index.
newrepo
mk "$repo/docs/adr/t.md"
git -C "$repo" add docs/adr/t.md && git -C "$repo" commit -q -m t
printf 'edited\n' >>"$repo/docs/adr/t.md"
run "$(payload "$repo/docs/adr/t.md" "$repo")"
expect_unstaged "edit to a tracked file under docs/adr/ leaves the index unchanged" "$repo" docs/adr/t.md

# 12. A new file edited after it was staged: the index gets the new content.
newrepo
mk "$repo/docs/plans/e.md"
run "$(payload "$repo/docs/plans/e.md" "$repo")"
printf 'second\n' >>"$repo/docs/plans/e.md"
run "$(payload "$repo/docs/plans/e.md" "$repo")"
if quiet && [ -z "$(git -C "$repo" diff --name-only -- docs/plans/e.md)" ]; then ok "a staged new file is restaged after an Edit"; else not_ok "a staged new file is restaged after an Edit" "$(why)"; fi

# 13. A repository with no commits yet.
n=$((n + 1))
repo=$tmp/r$n
mkdir -p "$repo" && git -C "$repo" init -q
mk "$repo/docs/plans/first.md"
run "$(payload "$repo/docs/plans/first.md" "$repo")"
expect_staged "file in a repository with no commits is staged" "$repo" docs/plans/first.md

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
