#!/usr/bin/env bash
# Tests for hooks/standing-lfg.sh, the SessionStart hook that states the standing lfg rule.
#
# Usage: bash hooks/standing-lfg.test.sh [BASH]
#   BASH (first argument) is the interpreter the hook runs under. It defaults to the bash
#   running this script, so `/bin/bash hooks/standing-lfg.test.sh` tests bash 3.2 on macOS
#   and `/opt/homebrew/bin/bash hooks/standing-lfg.test.sh /opt/homebrew/bin/bash` tests bash 5.
# Needs python3 to parse the hook's JSON (the hook itself uses bash builtins only).
# Prints a pass/fail summary and exits nonzero when any check fails.

here=$(cd "$(dirname "$0")" && pwd)
hook_bash=${1:-$BASH}
hook="$here/standing-lfg.sh"
rule="$here/standing-lfg.md"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
not_ok() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; [ -n "$2" ] && printf '       %s\n' "$2"; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/standing-lfg-test.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT

# check NAME EXPECTED_EVENT EXPECTED_TEXT_FILE STDOUT_FILE
# Parses the hook output as JSON and compares the event name and the context text byte for byte.
check_json() {
  python3 -I - "$2" "$3" "$4" <<'PY'
import json, sys
event, text_file, out_file = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(out_file, 'rb').read().decode('utf-8')
try:
    doc = json.loads(raw)
except Exception as e:
    print('output is not JSON: %s: %r' % (e, raw[:200])); sys.exit(1)
want = open(text_file, 'rb').read().decode('utf-8')
if set(doc) != {'hookSpecificOutput'}:
    print('top-level keys: %r' % sorted(doc)); sys.exit(1)
hso = doc['hookSpecificOutput']
if set(hso) != {'hookEventName', 'additionalContext'}:
    print('hookSpecificOutput keys: %r' % sorted(hso)); sys.exit(1)
if hso['hookEventName'] != event:
    print('hookEventName %r, want %r' % (hso['hookEventName'], event)); sys.exit(1)
if hso['additionalContext'] != want:
    print('additionalContext differs from the vendored file (got %d chars, want %d)' % (len(hso['additionalContext']), len(want))); sys.exit(1)
PY
}

# run_hook DIR ARGS... : runs the hook from DIR, stdout to $tmp/out, stderr to $tmp/err, status in $rc.
run_hook() {
  local dir=$1; shift
  (cd "$dir" && CLAUDE_PROJECT_DIR="$dir" "$hook_bash" "$hook" "$@" >"$tmp/out" 2>"$tmp/err" </dev/null)
  rc=$?
}

expect_rule() { # NAME EVENT TEXT_FILE
  if [ "$rc" -ne 0 ]; then not_ok "$1" "exit $rc"; return; fi
  if [ -s "$tmp/err" ]; then not_ok "$1" "stderr: $(head -c 200 "$tmp/err")"; return; fi
  if msg=$(check_json "$1" "$2" "$3" "$tmp/out"); then ok "$1"; else not_ok "$1" "$msg"; fi
}

expect_silent() { # NAME
  if [ "$rc" -ne 0 ]; then not_ok "$1" "exit $rc"; return; fi
  if [ -s "$tmp/out" ]; then not_ok "$1" "stdout: $(head -c 200 "$tmp/out")"; return; fi
  if [ -s "$tmp/err" ]; then not_ok "$1" "stderr: $(head -c 200 "$tmp/err")"; return; fi
  ok "$1"
}

printf '# hook interpreter: %s (%s)\n' "$hook_bash" "$("$hook_bash" -c 'echo "$BASH_VERSION"')"

# 1. Normal start.
mkdir -p "$tmp/plain"
run_hook "$tmp/plain" SessionStart
expect_rule "SessionStart emits the vendored rule as valid JSON" SessionStart "$rule"
cp "$tmp/out" "$tmp/baseline.json" 2>/dev/null

# 2. Start directory has .lfg-opt-out: the hook does not look; the session checks the target repo.
mkdir -p "$tmp/optout" && : >"$tmp/optout/.lfg-opt-out"
run_hook "$tmp/optout" SessionStart
if [ "$rc" -eq 0 ] && cmp -s "$tmp/out" "$tmp/baseline.json" && [ -s "$tmp/out" ]; then
  ok ".lfg-opt-out in the start directory leaves the output unchanged"
else
  not_ok ".lfg-opt-out in the start directory leaves the output unchanged" "exit $rc"
fi

# 3. The event name comes from the argument.
run_hook "$tmp/plain" UserPromptSubmit
expect_rule "UserPromptSubmit argument sets hookEventName" UserPromptSubmit "$rule"

# 4. Hard text round-trips: run a temp copy of the handler next to a temp vendored file.
mkdir -p "$tmp/copy"
cp "$hook" "$tmp/copy/standing-lfg.sh"
printf 'quote " and \\" backslash \\ and \\\\n literal\n\ttab\r\ncr-lf, ctrl \001\002\037 bell \a, brace } bracket ], slash /, amp & pct %% dollar $HOME, unicode caf\303\251 \342\200\224\n\n\n' >"$tmp/copy/standing-lfg.md"
(cd "$tmp/plain" && "$hook_bash" "$tmp/copy/standing-lfg.sh" SessionStart >"$tmp/out" 2>"$tmp/err" </dev/null)
rc=$?
expect_rule "quotes, backslashes, tabs, CR, control chars and trailing newlines round-trip" SessionStart "$tmp/copy/standing-lfg.md"

# 5. Vendored file missing.
rm -f "$tmp/copy/standing-lfg.md"
(cd "$tmp/plain" && "$hook_bash" "$tmp/copy/standing-lfg.sh" SessionStart >"$tmp/out" 2>"$tmp/err" </dev/null)
rc=$?
expect_silent "missing vendored file: exit 0, no stdout, no stderr"

# 6. Vendored file unreadable (skipped as root, who can read anything).
printf 'x\n' >"$tmp/copy/standing-lfg.md" && chmod 000 "$tmp/copy/standing-lfg.md"
if [ -r "$tmp/copy/standing-lfg.md" ]; then
  printf 'skip - unreadable vendored file (running as root)\n'
else
  (cd "$tmp/plain" && "$hook_bash" "$tmp/copy/standing-lfg.sh" SessionStart >"$tmp/out" 2>"$tmp/err" </dev/null)
  rc=$?
  expect_silent "unreadable vendored file: exit 0, no stdout, no stderr"
fi
chmod 600 "$tmp/copy/standing-lfg.md"

# 7. No argument.
run_hook "$tmp/plain"
expect_silent "no event argument: exit 0, no stdout, no stderr"

# 8. No jq (or anything else) on PATH: an empty bin directory.
mkdir -p "$tmp/emptybin"
(cd "$tmp/plain" && PATH="$tmp/emptybin" "$hook_bash" "$hook" SessionStart >"$tmp/out" 2>"$tmp/err" </dev/null)
rc=$?
if [ "$rc" -eq 0 ] && [ ! -s "$tmp/err" ] && cmp -s "$tmp/out" "$tmp/baseline.json" && [ -s "$tmp/out" ]; then
  ok "no jq on PATH (empty PATH) leaves the output unchanged"
else
  not_ok "no jq on PATH (empty PATH) leaves the output unchanged" "exit $rc; stderr: $(head -c 200 "$tmp/err")"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
