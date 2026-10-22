#!/usr/bin/env bash
# Tests for hooks/skill-call-log.sh, the PreToolUse(Skill) hook that logs one JSON line per skill call.
#
# Usage: bash hooks/skill-call-log.test.sh [BASH]
#   BASH (first argument) is the interpreter the hook runs under. It defaults to the bash
#   running this script, so `/bin/bash hooks/skill-call-log.test.sh` tests bash 3.2 on macOS
#   and `/opt/homebrew/bin/bash hooks/skill-call-log.test.sh /opt/homebrew/bin/bash` tests bash 5.
# The project-folder root is redirected with IPE_PROJECT_FILES_ROOT, so the tests never write
# to a real /mnt/project-files. Needs python3 to parse the logged lines.
# Prints a pass/fail summary and exits nonzero when any check fails.

here=$(cd "$(dirname "$0")" && pwd)
hook_bash=${1:-$BASH}
hook="$here/skill-call-log.sh"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
not_ok() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; [ -n "$2" ] && printf '       %s\n' "$2"; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/skill-call-log-test.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT

input() { # SESSION SKILL
  printf '{"session_id":"%s","transcript_path":"/home/u/.claude/projects/x/%s.jsonl","cwd":"/work/repo \\"q\\"","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Skill","tool_input":{"skill":"%s","args":"say \\"skill\\": \\"decoy\\""},"tool_use_id":"toolu_1"}' "$1" "$1" "$2"
}

# run ROOT PLUGIN_DATA STDIN : PLUGIN_DATA "-" means unset. Captures stdout/stderr/status.
run() {
  if [ "$2" = "-" ]; then
    printf '%s' "$3" | (unset CLAUDE_PLUGIN_DATA; IPE_PROJECT_FILES_ROOT="$1" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err")
  else
    printf '%s' "$3" | IPE_PROJECT_FILES_ROOT="$1" CLAUDE_PLUGIN_DATA="$2" "$hook_bash" "$hook" >"$tmp/out" 2>"$tmp/err"
  fi
  rc=$?
}

quiet() { [ "$rc" -eq 0 ] && [ ! -s "$tmp/out" ] && [ ! -s "$tmp/err" ]; }
why() { printf 'exit %s; stdout: %s; stderr: %s' "$rc" "$(head -c 150 "$tmp/out")" "$(head -c 150 "$tmp/err")"; }

# check_log FILE N SESSION SKILL : FILE has exactly N lines, each a JSON object with the five
# fields, and line N carries SESSION and SKILL.
check_log() {
  python3 -I - "$@" <<'PY'
import json, re, sys
path, n, session, skill = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
try:
    data = open(path, 'rb').read().decode('utf-8')
except Exception as e:
    print('cannot read %s: %s' % (path, e)); sys.exit(1)
if not data.endswith('\n'):
    print('log does not end with a newline'); sys.exit(1)
lines = data.split('\n')[:-1]
if len(lines) != n:
    print('%d lines, want %d' % (len(lines), n)); sys.exit(1)
for i, line in enumerate(lines):
    try:
        rec = json.loads(line)
    except Exception as e:
        print('line %d is not JSON: %s: %r' % (i + 1, e, line)); sys.exit(1)
    if set(rec) != {'session_id', 'skill', 'time', 'cwd', 'transcript_path'}:
        print('line %d keys %r' % (i + 1, sorted(rec))); sys.exit(1)
    if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', rec['time']):
        print('line %d time %r is not UTC ISO 8601' % (i + 1, rec['time'])); sys.exit(1)
    if rec['cwd'] != '/work/repo "q"':
        print('line %d cwd %r' % (i + 1, rec['cwd'])); sys.exit(1)
    if not rec['transcript_path'].endswith('/%s.jsonl' % rec['session_id']):
        print('line %d transcript_path %r' % (i + 1, rec['transcript_path'])); sys.exit(1)
last = json.loads(lines[-1])
if (last['session_id'], last['skill']) != (session, skill):
    print('last line has %r/%r, want %r/%r' % (last['session_id'], last['skill'], session, skill)); sys.exit(1)
PY
}

expect_log() { # NAME FILE N SESSION SKILL
  if ! quiet; then not_ok "$1" "$(why)"; return; fi
  if msg=$(check_log "$2" "$3" "$4" "$5"); then ok "$1"; else not_ok "$1" "$msg"; fi
}

printf '# hook interpreter: %s (%s)\n' "$hook_bash" "$("$hook_bash" -c 'echo "$BASH_VERSION"')"

# 1. Project folder present with logs/: one line with all five fields.
mkdir -p "$tmp/p1/logs" "$tmp/data1"
run "$tmp/p1" "$tmp/data1" "$(input s-1 compound-engineering:lfg)"
expect_log "project folder present: one line with all five fields" "$tmp/p1/logs/skill-calls.jsonl" 1 s-1 compound-engineering:lfg
if [ -e "$tmp/data1/skill-calls.jsonl" ]; then not_ok "project folder wins over the plugin data dir" "plugin data log written too"; else ok "project folder wins over the plugin data dir"; fi

# 2. Project root present, logs/ absent: logs/ is created.
mkdir -p "$tmp/p2"
run "$tmp/p2" - "$(input s-2 ce-plan)"
expect_log "logs/ absent: created, holds one line" "$tmp/p2/logs/skill-calls.jsonl" 1 s-2 ce-plan

# 3. Only the plugin data dir is set.
mkdir -p "$tmp/data3"
run "$tmp/no-such-root" "$tmp/data3" "$(input s-3 compound-engineering:ce-work)"
expect_log "only plugin data dir set: line goes there" "$tmp/data3/skill-calls.jsonl" 1 s-3 compound-engineering:ce-work
if [ -e "$tmp/no-such-root" ]; then not_ok "absent project root is not created" "it was"; else ok "absent project root is not created"; fi

# 4. Neither: no file anywhere, exit 0.
mkdir -p "$tmp/p4cwd"
(cd "$tmp/p4cwd" && run "$tmp/no-such-root" - "$(input s-4 lfg)")
run "$tmp/no-such-root" - "$(input s-4 lfg)"
if quiet && [ ! -e "$tmp/no-such-root" ] && [ -z "$(ls -A "$tmp/p4cwd")" ]; then
  ok "neither present: nothing written, exit 0"
else
  not_ok "neither present: nothing written, exit 0" "$(why)"
fi

# 5. Malformed stdin: exit 0, no line.
mkdir -p "$tmp/p5"
for bad in 'not json' '' '{"session_id":"s-5","tool_input":{}}' '{"tool_input":{"skill":"x"}}' '{"session_id":"s-5","tool_input":{"skill":"unterminated'; do
  run "$tmp/p5" - "$bad"
  if ! quiet; then not_ok "malformed stdin $(printf '%q' "$bad"): exit 0, silent" "$(why)"; continue; fi
  if [ -s "$tmp/p5/logs/skill-calls.jsonl" ]; then
    not_ok "malformed stdin $(printf '%q' "$bad"): no line" "$(cat "$tmp/p5/logs/skill-calls.jsonl")"
    : >"$tmp/p5/logs/skill-calls.jsonl"
  else
    ok "malformed stdin $(printf '%q' "$bad"): exit 0, no line"
  fi
done

# 6. Two calls: two lines, the first intact.
mkdir -p "$tmp/p6"
run "$tmp/p6" - "$(input s-6a ce-brainstorm)"
cp "$tmp/p6/logs/skill-calls.jsonl" "$tmp/first" 2>/dev/null
run "$tmp/p6" - "$(input s-6b compound-engineering:lfg)"
expect_log "two calls: two valid lines" "$tmp/p6/logs/skill-calls.jsonl" 2 s-6b compound-engineering:lfg
if [ -s "$tmp/first" ] && [ "$(head -n 1 "$tmp/p6/logs/skill-calls.jsonl")" = "$(cat "$tmp/first")" ]; then
  ok "two calls: first line intact"
else
  not_ok "two calls: first line intact"
fi

# 7. A subagent's call (agent_id present): exit 0, silent, no line.
mkdir -p "$tmp/p7"
run "$tmp/p7" - "$(input s-7 compound-engineering:lfg | sed 's/^{/{"agent_id":"a0d1","agent_type":"general-purpose",/')"
if quiet && [ ! -s "$tmp/p7/logs/skill-calls.jsonl" ]; then
  ok "subagent call: exit 0, no line"
else
  not_ok "subagent call: exit 0, no line" "$(why); log: $(cat "$tmp/p7/logs/skill-calls.jsonl" 2>/dev/null)"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
