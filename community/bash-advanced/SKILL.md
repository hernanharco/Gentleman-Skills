---
name: bash-advanced
description: >
  Advanced shell scripting: strict mode, safe quoting, traps, portability, and structured CLI output.
  Trigger: When writing or reviewing shell scripts, when a script breaks on edge cases or paths with spaces, when adding cleanup/traps, when scripting git, docker, or CI pipelines.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Writing or reviewing any non-trivial bash script
- A script fails only on some paths, names with spaces, or under CI
- Adding temp files, background jobs, or cleanup logic
- Building CLIs that other scripts or humans parse

---

## Critical Patterns

- **Strict mode is mandatory** in every script:
  `set -euo pipefail`. Without it, errors are silently swallowed and unset
  variables expand to empty strings that overwrite data.
- **Quote every variable expansion**: `"$var"`, `"${arr[@]}"`, `"$(cmd)"`. Unquoted
  expansions split on whitespace and glob-expand — the root cause of most script bugs.
- **Use `$(...)`, never backticks**; prefer `[[ ]]` over `[ ]` (no word-splitting,
  regex support); arithmetic via `(( ))` or `$(( ))`.
- **Trap cleanup**: `trap 'rm -f "$tmpfile"' EXIT` guarantees cleanup on success,
  error, and signal; `ERR` trap with line number gives instant failure context.
- **Validate inputs at the top**: check argument count, required flags, and that
  commands exist (`command -v git >/dev/null || die "git required"`).
- **Fail with messages**: `die() { echo "ERROR: $*" >&2; exit 1; }` — stderr for
  errors, stdout for data, always.
- **Temp files via `mktemp`**, never predictable names in `/tmp` (symlink attacks and
  parallel-run collisions).
- **No `ls | while read`** for file iteration: `find ... -print0 | while IFS= read -r
  -d '' f` or glob arrays handle spaces/newlines correctly.

## Script Skeleton

```bash
#!/usr/bin/env bash
# deploy.sh — deploy app to target env.
# Usage: ./deploy.sh --env staging <service>
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename -- "$0")"

die()  { echo "ERROR: ${SCRIPT_NAME}: $*" >&2; exit 1; }
log()  { echo "[$(date +'%H:%M:%S')] $*" >&2; }

usage() {
  cat >&2 <<EOF
Usage: ${SCRIPT_NAME} --env <staging|prod> <service>
  --env   Target environment (required)
  <service>  Service name to deploy
EOF
  exit 2
}

# --- argument parsing -------------------------------------------------------
env=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)  [[ $# -ge 2 ]] || usage; env="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*)     die "unknown flag: $1" ;;
    *)      break ;;
  esac
done
[[ -n "$env" ]] || usage
[[ $# -eq 1 ]] || usage
service="$1"

case "$env" in
  staging|prod) log "target=$env service=$service" ;;
  *) die "invalid --env '$env' (expected staging|prod)" ;;
esac

command -v docker >/dev/null 2>&1 || die "docker not found in PATH"

# --- work with guaranteed cleanup -------------------------------------------
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
trap 'die "failed at line $LINENO"' ERR

# --- main -------------------------------------------------------------------
docker build -t "${service}:${env}" "$SCRIPT_DIR"
log "built ${service}:${env}"
```

## Quoting Reference

```bash
files=("$dir"/*)            # glob into array; empty glob handled explicitly
for f in "${files[@]}"; do  # iterate safely, spaces preserved
  process -- "$f"           # -- ends flags; file named "-rf" is not an option
done

count="${#files[@]}"        # array length
first="${files[0]-}"        # default if unset (not ${files[0]} under set -u)
```

| Wrong | Right | Failure mode |
|---|---|---|
| `rm $file` | `rm -- "$file"` | word-splitting; `-rf`-named file runs as flag |
| `if [ $x = a ]` | `if [[ "$x" == a ]]` | empty `$x` breaks syntax |
| `` out=`cmd` `` | `out="$(cmd)"` | nesting and quoting break |
| `for f in $(ls)` | `for f in *.txt` | spaces/newlines split names |
| `echo $? \|\| true` | `if ! cmd; then` | unreadable, wrong precedence |

## Traps and Exit Codes

- `trap cleanup EXIT` — runs on every exit path; cleanup must not itself fail the
  script (`rm -f`, not `rm`).
- `trap 'echo "line $LINENO failed" >&2' ERR` — instant failure location under
  `set -e`.
- Meaningful exit codes: `0` ok, `1` runtime error, `2` usage error (convention).
- Reset traps inside functions that must not trigger the outer handler.

## Portability Notes

- Target `bash` explicitly (`#!/usr/bin/env bash`); do not assume `/bin/sh` is bash.
- `${var,,}` / `${var^}` / arrays / `[[ ]]` are bashisms — fine under bash, never
  claim POSIX sh compatibility while using them.
- `set -o pipefail` is bash/ksh; POSIX `sh` scripts must check pipelines manually.
- Prefer `command -v` over `which` (not portable, no reliable exit code).

## Anti-Patterns

- No `set -e`/`pipefail`: failures continue silently overwriting state.
- `cd` without returning: scripts leave the caller in a changed directory; use
  subshells `( cd "$dir" && cmd )`.
- Unquoted `$@` (`$@` vs `"$@"`): the unquoted form is almost never what you want.
- Parsing `ls -l` output: format is not a stable interface.
- `eval` on constructed strings: injection and quoting bugs by construction.
- Background jobs without waiting: script exits before work finishes; use `wait` or
  document why detachment is intentional.
