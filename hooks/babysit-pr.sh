#!/bin/sh
# PostToolUse hook: after an agent opens a pull request, tell it to babysit the
# PR to a merge-ready state (ADR-0004). Logic lives in babysit-pr.mjs.
#
# Silent exit 0 on every no-match path: opt-out, no node, or input that cannot
# be a PR-create call. The case filter keeps node off ordinary Bash calls.

case "${IPE_BABYSIT_PR_HOOK:-}" in off|0|false) exit 0 ;; esac
command -v node >/dev/null 2>&1 || exit 0

input=$(cat) || exit 0
case "$input" in
  *create_pull_request*|*"pr create"*) ;;
  *) exit 0 ;;
esac

dir=${0%/*}
printf '%s' "$input" | node "$dir/babysit-pr.mjs" 2>/dev/null || exit 0
