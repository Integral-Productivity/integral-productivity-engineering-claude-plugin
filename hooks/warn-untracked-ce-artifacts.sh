#!/usr/bin/env bash
# Name compound-engineering artifacts that are not yet committed.
# Fires on Stop. When the project repository holds files in the configured artifact directories
# that are not in HEAD (untracked and not ignored, or staged as added), it prints one
# {"systemMessage": ...} that counts and lists them; otherwise it prints nothing (ADR-0006).
#
# Why: the backstop to stage-ce-artifact.sh. That hook fires only on Write and Edit; an artifact
# made another way (a shell heredoc, an editor, a subagent) slips past it. And a staged artifact
# is still local to one index: it is lost with the worktree or container just as an untracked
# one is. So this hook reads the actual git state at the end of a turn and names both kinds.
# It is scoped to the artifact directories on purpose: a repo-wide check fires on every scratch
# file, and a warning that fires constantly is one nobody reads.
#
# The message reaches the user, not the model: a Stop hook reaches the model only by blocking
# the stop, and this hook never blocks.
#
# Project repository: CLAUDE_PROJECT_DIR, else the payload cwd, resolved to its top level so the
# directories stay repo-relative. When that directory is not inside a work tree (a multi-repo
# session root holding several clones), each immediate child directory that is a repository's
# top level is checked instead, and its paths are prefixed with the child's name.
# Directories and the IPE_CE_ARTIFACT_HOOKS / IPE_CE_ARTIFACT_DIRS variables are as in
# stage-ce-artifact.sh.
#
# Never blocks: every failure exits 0 with no output. No jq: names are read NUL-delimited and
# the message is JSON-escaped with builtins, as in standing-lfg.sh. Needs only bash and git;
# runs on bash 3.2 and bash 5.

exec 2>/dev/null
LC_ALL=C # byte-wise pattern substitution; UTF-8 passes through untouched

case ${IPE_CE_ARTIFACT_HOOKS-} in [Oo][Ff][Ff] | 0 | [Ff][Aa][Ll][Ss][Ee]) exit 0 ;; esac

proj=${CLAUDE_PROJECT_DIR-}
if [ -z "$proj" ]; then
  IFS= read -r -d '' input
  re='"cwd"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
  [[ $input =~ $re ]] || exit 0
  proj=${BASH_REMATCH[1]}
  case $proj in *\\*) exit 0 ;; esac
fi
[ -n "$proj" ] && [ -d "$proj" ] || exit 0

# Configured directories, normalized.
dirs=()
IFS=, read -r -a parts <<<"${IPE_CE_ARTIFACT_DIRS-docs/plans,docs/ideation,docs/brainstorms,docs/adr,docs/solutions}"
for d in "${parts[@]}"; do
  d=${d#"${d%%[![:space:]]*}"}
  d=${d%"${d##*[![:space:]]}"}
  d=${d%/}
  case $d in '' | /* | .. | ../* | */.. | */../*) continue ;; esac
  dirs+=("$d")
done
[ ${#dirs[@]} -gt 0 ] || exit 0

lines=()
collect() { # TOP LABEL-PREFIX
  local f
  while IFS= read -r -d '' f; do
    lines+=("  · $2$f (untracked)")
  done < <(git -C "$1" -c core.quotePath=false ls-files -z --others --exclude-standard -- "${dirs[@]}")
  while IFS= read -r -d '' f; do
    lines+=("  · $2$f (staged, not committed)")
  done < <(git -C "$1" -c core.quotePath=false diff --cached --no-renames --name-only -z --diff-filter=A -- "${dirs[@]}")
}

if top=$(git -C "$proj" rev-parse --show-toplevel) && [ -n "$top" ]; then
  collect "$top" ""
else
  for c in "$proj"/*/; do
    c=${c%/}
    [ -d "$c" ] || continue
    prefix=$(git -C "$c" rev-parse --show-prefix) && [ -z "$prefix" ] || continue
    collect "$c" "${c##*/}/"
  done
fi
[ ${#lines[@]} -gt 0 ] || exit 0

nl=$'\n'
text="${#lines[@]} uncommitted compound-engineering artifact(s). They exist only in this working tree:$nl"
for l in "${lines[@]}"; do text=$text$l$nl; done
text="$text${nl}Commit them, or they are lost to everyone but this worktree. Write and Edit stage new artifacts automatically (stage-ce-artifact.sh); untracked ones bypassed that."

# JSON string escaping, as in standing-lfg.sh. Patterns and replacements are quoted variables so
# bash 3.2 and 5.2 (patsub_replacement) treat them literally. Backslash first.
bs='\'
q='"'
cr=$'\r'
tab=$'\t'
text=${text//"$bs"/"$bs$bs"}
text=${text//"$q"/"$bs$q"}
text=${text//"$nl"/"${bs}n"}
text=${text//"$cr"/"${bs}r"}
text=${text//"$tab"/"${bs}t"}
for o in 001 002 003 004 005 006 007 010 013 014 016 017 020 021 022 023 024 025 026 027 030 031 032 033 034 035 036 037; do
  printf -v c "\\$o"
  case $text in
    *"$c"*)
      printf -v u '\\u%04x' "$((8#$o))"
      text=${text//"$c"/"$u"}
      ;;
  esac
done

printf '{"systemMessage":"%s"}\n' "$text"
exit 0
