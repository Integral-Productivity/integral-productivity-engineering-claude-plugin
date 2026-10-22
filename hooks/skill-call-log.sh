#!/usr/bin/env bash
# Skill-call log.
# Fires on PreToolUse for the Skill tool. Appends one JSON line per skill call,
#   {"session_id","skill","time" (UTC ISO 8601),"cwd","transcript_path"}
# to <project files>/logs/skill-calls.jsonl when the Project shared folder exists (cloud Project
# threads), else to ${CLAUDE_PLUGIN_DATA}/skill-calls.jsonl when that is set, else nowhere.
# The project-files root is /mnt/project-files; IPE_PROJECT_FILES_ROOT overrides it (tests).
#
# Why: it measures adherence to the standing lfg rule (standing-lfg.sh) by recording which
# sessions actually invoke compound-engineering:lfg. Temporary: remove this hook and its
# hooks.json entry once the measurement window closes.
#
# Never blocks and never prints: it writes only to the log, every failure (malformed input,
# unwritable folder) exits 0 silently, and it returns no decision, so the Skill call always
# proceeds. No jq: fields are read from the single-line hook JSON with bash pattern matching,
# and their JSON-escaped values are copied through unchanged. Runs on bash 3.2 and bash 5.

exec 2>/dev/null
LC_ALL=C

IFS= read -r -d '' input
case $input in '{'*) ;; *) exit 0 ;; esac

str='"(([^"\\]|\\.)*)"' # a JSON string; group 1 is its escaped body
sep='[[:space:]]*:[[:space:]]*'

field() { # NAME HAYSTACK -> $val (escaped body), status 1 when absent
  local re="\"$1\"$sep$str"
  [[ $2 =~ $re ]] || return 1
  val=${BASH_REMATCH[1]}
}

field session_id "$input" || exit 0
session=$val
[ -n "$session" ] || exit 0

after=${input#*\"tool_input\"}
[ "$after" != "$input" ] || exit 0
field skill "$after" || exit 0
skill=$val
[ -n "$skill" ] || exit 0

val=
field cwd "$input"
cwd=$val
val=
field transcript_path "$input"
transcript=$val

now=$(date -u +%Y-%m-%dT%H:%M:%SZ) || exit 0
[ -n "$now" ] || exit 0

root=${IPE_PROJECT_FILES_ROOT:-/mnt/project-files}
if [ -d "$root" ]; then
  mkdir -p "$root/logs" || exit 0
  log=$root/logs/skill-calls.jsonl
elif [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
  mkdir -p "$CLAUDE_PLUGIN_DATA" || exit 0
  log=$CLAUDE_PLUGIN_DATA/skill-calls.jsonl
else
  exit 0
fi

printf '{"session_id":"%s","skill":"%s","time":"%s","cwd":"%s","transcript_path":"%s"}\n' \
  "$session" "$skill" "$now" "$cwd" "$transcript" >>"$log"
exit 0
