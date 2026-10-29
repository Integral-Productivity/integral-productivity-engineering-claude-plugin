#!/usr/bin/env bash
# Tests for hooks/warn-untracked-ce-artifacts.sh, the Stop hook that names compound-engineering
# artifacts not yet committed.
#
# Usage: bash hooks/warn-untracked-ce-artifacts.test.sh [BASH]
#   BASH (first argument) is the interpreter the hook runs under. It defaults to the bash
#   running this script, so `/bin/bash hooks/warn-untracked-ce-artifacts.test.sh` tests bash 3.2
#   on macOS and `/opt/homebrew/bin/bash hooks/warn-untracked-ce-artifacts.test.sh
#   /opt/homebrew/bin/bash` tests bash 5.
# Every check runs against fresh temporary git repositories; the user's git config is ignored.
# Needs python3 to parse the hook output. Prints a pass/fail summary and exits nonzero when any
# check fails.

here=$(cd "$(dirname "$0")" && pwd)
hook_bash=${1:-$BASH}
hook="$here/warn-untracked-ce-artifacts.sh"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
not_ok() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; [ -n "$2" ] && printf '       %s\n' "$2"; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/warn-untracked-ce-test.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com
unset IPE_CE_ARTIFACT_HOOKS IPE_CE_ARTIFACT_DIRS CLAUDE_PROJECT_DIR

n=0
newrepo() { # [DIR] -> $repo, a repository with one commit
  n=$((n + 1))
  repo=${1:-$tmp/r$n}
  mkdir -p "$repo" && git -C "$repo" init -q && git -C "$repo" commit -q --allow-empty -m init
}
mk() { mkdir -p "$(dirname "$1")" && printf 'x\n' >"$1"; }

payload() { # CWD
  printf '{"session_id":"s","transcript_path":"/t.jsonl","cwd":"%s","hook_event_name":"Stop","stop_hook_active":false}' "$1"
}

run() { # PROJECT_DIR ("-" for unset) CWD [ENV=VALUE ...]
  local proj=$1 cwd=$2
  shift 2
  if [ "$proj" = - ]; then
    payload "$cwd" | env "$@" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
  else
    payload "$cwd" | env CLAUDE_PROJECT_DIR="$proj" "$@" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
  fi
  rc=$?
}

why() { printf 'exit %s; stdout: %s; stderr: %s' "$rc" "$(head -c 300 "$tmp/out")" "$(head -c 150 "$tmp/err")"; }

expect_silent() { # NAME
  if [ "$rc" -eq 0 ] && [ ! -s "$tmp/out" ] && [ ! -s "$tmp/err" ]; then ok "$1"; else not_ok "$1" "$(why)"; fi
}

# expect_msg NAME COUNT LINE... : stdout is one JSON object with only systemMessage, which
# opens with "COUNT uncommitted" and holds exactly the given "  · <path> (<kind>)" lines.
expect_msg() {
  local name=$1
  shift
  if [ "$rc" -ne 0 ] || [ -s "$tmp/err" ]; then not_ok "$name" "$(why)"; return; fi
  if msg=$(python3 -I - "$tmp/out" "$@" <<'PY'
import json, sys
out, count, want = sys.argv[1], sys.argv[2], sys.argv[3:]
data = open(out, 'rb').read().decode('utf-8')
try:
    obj = json.loads(data)
except Exception as e:
    print('not JSON: %s: %r' % (e, data[:200])); sys.exit(1)
if set(obj) != {'systemMessage'}:
    print('keys %r' % sorted(obj)); sys.exit(1)
m = obj['systemMessage']
if not m.startswith(count + ' uncommitted compound-engineering artifact'):
    print('opening %r' % m[:80]); sys.exit(1)
got = [l for l in m.split('\n') if l.startswith('  · ')]
if sorted(got) != sorted('  · ' + w for w in want):
    print('lines %r, want %r' % (got, want)); sys.exit(1)
PY
  ); then ok "$name"; else not_ok "$name" "$msg"; fi
}

printf '# hook interpreter: %s (%s)\n' "$hook_bash" "$("$hook_bash" -c 'echo "$BASH_VERSION"')"

# 1. Clean repository.
newrepo
run "$repo" /
expect_silent "clean repository: no output"

# 2. Two untracked artifacts.
mk "$repo/docs/adr/0001-x.md"
mk "$repo/docs/solutions/y.md"
run "$repo" /
expect_msg "two untracked files under docs/adr/ and docs/solutions/ are listed" 2 \
  "docs/adr/0001-x.md (untracked)" "docs/solutions/y.md (untracked)"

# 3. Committed, staged-new, ignored and out-of-scope files.
newrepo
mk "$repo/docs/plans/done.md"
git -C "$repo" add docs/plans/done.md && git -C "$repo" commit -q -m done
run "$repo" /
expect_silent "committed file in docs/plans/: not listed"
mk "$repo/docs/plans/new.md"
git -C "$repo" add docs/plans/new.md
run "$repo" /
expect_msg "staged but uncommitted new file is listed as staged" 1 "docs/plans/new.md (staged, not committed)"
newrepo
printf 'docs/plans/ignored.md\n' >"$repo/.gitignore"
git -C "$repo" add .gitignore && git -C "$repo" commit -q -m ignore
mk "$repo/docs/plans/ignored.md"
mk "$repo/src/x.md"
run "$repo" /
expect_silent "ignored file in docs/plans/ and untracked file under src/: no output"

# 4. Repository with no commits yet, staged file.
n=$((n + 1))
repo=$tmp/r$n
mkdir -p "$repo" && git -C "$repo" init -q
mk "$repo/docs/plans/first.md"
git -C "$repo" add docs/plans/first.md
run "$repo" /
expect_msg "staged file in a repository with no commits is listed" 1 "docs/plans/first.md (staged, not committed)"

# 5. Unusual file name.
newrepo
odd=$(printf 'docs/plans/q"t\tz caf\303\251.md')
mk "$repo/$odd"
run "$repo" /
expect_msg "name with a quote, a tab and UTF-8: valid JSON, name verbatim" 1 "$odd (untracked)"

# 6. CLAUDE_PROJECT_DIR unset: payload cwd is used.
newrepo
mk "$repo/docs/ideation/i.md"
run - "$repo"
expect_msg "CLAUDE_PROJECT_DIR unset: payload cwd is used" 1 "docs/ideation/i.md (untracked)"

# 7. Project directory is a subdirectory of the repository.
mkdir -p "$repo/src/deep"
run "$repo/src/deep" /
expect_msg "project directory inside the repository: repo-relative directories still checked" 1 "docs/ideation/i.md (untracked)"

# 8. Project directory is not a repository.
mkdir -p "$tmp/plain/empty"
run "$tmp/plain" /
expect_silent "non-repository project directory with no child repositories: no output"
newrepo "$tmp/parent/alpha"
mk "$repo/docs/brainstorms/b.md"
newrepo "$tmp/parent/beta"
mkdir -p "$tmp/parent/notrepo/docs/plans" && mk "$tmp/parent/notrepo/docs/plans/n.md"
run "$tmp/parent" /
expect_msg "non-repository project directory: child repositories are checked, prefixed" 1 "alpha/docs/brainstorms/b.md (untracked)"
run - /no/such/dir
expect_silent "missing project directory: no output"

# 9. Opt-out and directory override.
newrepo
mk "$repo/docs/plans/y.md"
mk "$repo/notes/x.md"
for v in off 0 False; do
  run "$repo" / IPE_CE_ARTIFACT_HOOKS="$v"
  expect_silent "IPE_CE_ARTIFACT_HOOKS=$v: no output"
done
run "$repo" / IPE_CE_ARTIFACT_DIRS=notes
expect_msg "IPE_CE_ARTIFACT_DIRS=notes: notes/x.md listed, docs/plans/y.md not" 1 "notes/x.md (untracked)"
run "$repo" / IPE_CE_ARTIFACT_DIRS='/abs,..,'
expect_silent "IPE_CE_ARTIFACT_DIRS with no valid entry: no output"

# 10. Malformed or empty stdin with CLAUDE_PROJECT_DIR set still checks the project.
printf 'not json' | env CLAUDE_PROJECT_DIR="$repo" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
rc=$?
expect_msg "malformed stdin with CLAUDE_PROJECT_DIR set: project still checked" 1 "docs/plans/y.md (untracked)"
printf 'not json' | "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
rc=$?
expect_silent "malformed stdin and no CLAUDE_PROJECT_DIR: no output"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
