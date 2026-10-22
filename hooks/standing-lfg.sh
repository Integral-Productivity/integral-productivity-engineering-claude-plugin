#!/usr/bin/env bash
# Standing lfg rule.
# Fires on SessionStart (no matcher: startup, resume, clear and compact). Prints the rule in
# standing-lfg.md, next to this script, as hookSpecificOutput.additionalContext, so a code
# change the account owner asks for runs through compound-engineering:lfg without the owner
# asking for it each time. The event name is the first argument (set in hooks.json), so moving
# the rule to every prompt is a hooks.json change to `... standing-lfg.sh UserPromptSubmit`.
#
# The hook emits the same text in every repo. It does not look for `.lfg-opt-out`: the rule
# tells the session to check the repo the change targets, which may not be the start directory.
#
# Never blocks and never asks: it only adds context, and every failure (no argument, file
# missing or unreadable) exits 0 with no output, so a broken hook costs the rule, never the
# session. Bash builtins only, one file read, no jq/node/python: a missing tool must not
# silently withhold the rule. Runs on bash 3.2 (macOS /bin/bash) and bash 5.

exec 2>/dev/null
LC_ALL=C # byte-wise pattern substitution; UTF-8 passes through untouched

event=$1
case $event in '' | *[!A-Za-z]*) exit 0 ;; esac

src=${BASH_SOURCE[0]}
case $src in */*) dir=${src%/*} ;; *) dir=. ;; esac
file=$dir/standing-lfg.md
[ -f "$file" ] && [ -r "$file" ] || exit 0

# read -d '' reads to EOF and keeps trailing newlines; it returns 1 at EOF, which is expected.
IFS= read -r -d '' text <"$file"
[ -n "$text" ] || exit 0

# JSON string escaping. Patterns and replacements are quoted variables so bash 3.2 and 5.2
# (patsub_replacement) treat them literally. Backslash first.
bs='\'
q='"'
nl=$'\n'
cr=$'\r'
tab=$'\t'
text=${text//"$bs"/"$bs$bs"}
text=${text//"$q"/"$bs$q"}
text=${text//"$nl"/"${bs}n"}
text=${text//"$cr"/"${bs}r"}
text=${text//"$tab"/"${bs}t"}
# Remaining control characters (U+0001..U+001F, less \t \n \r) become \u00XX; NUL cannot
# occur in a bash string. Each is checked first, so clean text pays only for 29 case tests.
for o in 001 002 003 004 005 006 007 010 013 014 016 017 020 021 022 023 024 025 026 027 030 031 032 033 034 035 036 037; do
  printf -v c "\\$o"
  case $text in
    *"$c"*)
      printf -v u '\\u%04x' "$((8#$o))"
      text=${text//"$c"/"$u"}
      ;;
  esac
done

printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$text"
exit 0
