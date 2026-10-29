#!/usr/bin/env bash
# Stage a compound-engineering artifact the moment it is written.
# Fires on PostToolUse for Write and Edit. When the file is inside a configured artifact
# directory of a git repository and is not yet in that repository's HEAD, it runs `git add` on
# the file in its own repository (ADR-0006).
#
# Why: compound-engineering skills write durable artifacts to docs/plans/, docs/ideation/,
# docs/brainstorms/, docs/adr/ and docs/solutions/, and the commit is a later step that a
# session often skips when it pivots, compacts or merges. The artifact then stays untracked in
# one worktree, invisible to everyone else. Staging at write time closes that window. Staging,
# not committing, is the chosen verb: it is reversible with `git restore --staged` and leaves
# the commit to the session. A file already in HEAD is left alone, so partial staging of an
# edited ADR is not overwritten and an unrelated `git commit` does not sweep the edit in.
#
# Directories: docs/plans, docs/ideation, docs/brainstorms, docs/adr and docs/solutions, or
# IPE_CE_ARTIFACT_DIRS (comma-separated, repo-relative) in their place. Empty, absolute and
# `..` entries are dropped; with no valid entry the hook does nothing.
# Opt out with IPE_CE_ARTIFACT_HOOKS=off (also 0 or false, any case); it disables
# warn-untracked-ce-artifacts.sh too.
#
# The repository is the file's own, found from the file's directory, not the shell or project
# directory: a multi-repo session can write into any clone. The repo-relative path comes from
# `rev-parse --show-prefix`, because `--show-toplevel` returns the symlink-resolved path and
# would not prefix-match a path that goes through a symlink (macOS /var is /private/var).
# .gitignore is respected; nothing is force-added.
#
# Never blocks and never prints: every failure (malformed input, missing file, no repository,
# git error) exits 0 silently, and it returns no decision. No jq: fields are read from the hook
# JSON with bash pattern matching, as in skill-call-log.sh, and a file_path holding a JSON
# escape is skipped rather than decoded. Needs only bash and git; runs on bash 3.2 and bash 5.

exec 2>/dev/null
LC_ALL=C

case ${IPE_CE_ARTIFACT_HOOKS-} in [Oo][Ff][Ff] | 0 | [Ff][Aa][Ll][Ss][Ee]) exit 0 ;; esac

IFS= read -r -d '' input
case $input in '{'*) ;; *) exit 0 ;; esac

str='"(([^"\\]|\\.)*)"' # a JSON string; group 1 is its escaped body
sep='[[:space:]]*:[[:space:]]*'

field() { # NAME HAYSTACK -> $val (escaped body), status 1 when absent
  local re="\"$1\"$sep$str"
  [[ $2 =~ $re ]] || return 1
  val=${BASH_REMATCH[1]}
}

after=${input#*\"tool_input\"}
[ "$after" != "$input" ] || exit 0
field file_path "$after" || exit 0
file=$val
[ -n "$file" ] || exit 0
case $file in *\\*) exit 0 ;; esac

case $file in
  /*) ;;
  *)
    field cwd "$input" || exit 0
    case $val in '' | *\\*) exit 0 ;; esac
    file=$val/$file
    ;;
esac
[ -f "$file" ] || exit 0

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

dir=${file%/*}
[ -n "$dir" ] || dir=/
# One call, two lines in argument order: the prefix (empty at the top level), then the top level.
out=$(git -C "$dir" rev-parse --show-prefix --show-toplevel) || exit 0
nl=$'\n'
prefix=${out%%"$nl"*}
top=${out#*"$nl"}
[ -n "$top" ] && [ "$top" != "$out" ] || exit 0
rel=$prefix${file##*/}

match=
for d in "${dirs[@]}"; do
  case $rel in "$d"/?*) match=1 && break ;; esac
done
[ -n "$match" ] || exit 0

git -C "$top" cat-file -e "HEAD:$rel" && exit 0
# Without -f, git add refuses an ignored path, so .gitignore needs no separate check.
git --literal-pathspecs -C "$top" add -- "$rel" >/dev/null
exit 0
