#!/bin/bash
#
# Ship one release: check out its tag and deploy it. Rolling back is the same
# command with the release before (README: "Rolling back a release").
#
#   ./ops/deploy/ship.sh            # the releases, and what ran here when
#   ./ops/deploy/ship.sh v1.4.0     # deploy exactly that release
#   ./ops/deploy/ship.sh --ssh      # the Deploy button: the deploy key's forced
#                                   # command, the version from what was sent
#
# Only a tag on main ships, so what runs is always a commit that went through
# a pull request and has a GitHub Release saying what it changed. Going back
# below a major version is refused: a major release's migrations changed data
# already stored, and older code needs the database from before them.

set -euo pipefail

fail() {
  echo "✗  $*" >&2
  exit 1
}

# Everything happens in here, and bash reads a function whole before running
# it. The checkout below replaces this very file, and a script bash is still
# reading line by line from disk would carry on in the middle of the new one.
main() {
  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$repo_root"

  # The Deploy button. Its key may only run `ship.sh --ssh`, and the version
  # the workflow sent arrives as the command it asked for. That text is never
  # run: it is taken as the version, and anything but a release name is
  # refused below, before it reaches git.
  if [[ "${1:-}" == "--ssh" ]]; then
    [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]] || fail "send the version to ship, e.g. v1.4.0"
    set -- "$SSH_ORIGINAL_COMMAND"
  fi

  git fetch --quiet --tags origin main

  # The release the checkout is at or past, and exactly where it is.
  local current was
  current="$(git describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null || true)"
  was="$(git describe --tags --match 'v[0-9]*' --always --dirty 2>/dev/null || true)"

  if [[ $# -eq 0 ]]; then
    echo "Releases, newest first:"
    git tag --list 'v[0-9]*' --sort=-v:refname | head -n 10 | sed 's/^/  /'
    if [[ -f ops/deploy/deploys.log ]]; then
      echo
      echo "Deployed here, last 10:"
      tail -n 10 ops/deploy/deploys.log | sed 's/^/  /'
    fi
    echo
    echo "Ship one with: ./ops/deploy/ship.sh <version>"
    return 0
  fi

  local tag="$1"
  [[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
    fail "'$tag' is not a release; releases are tags like v1.4.0"
  local target_major="${BASH_REMATCH[1]}"

  git rev-parse --quiet --verify "refs/tags/$tag^{commit}" >/dev/null ||
    fail "there is no $tag; publish it as a GitHub Release first"
  git merge-base --is-ancestor "$tag" origin/main ||
    fail "$tag is not on main; only merged work ships"

  # Tracked files only: .env, the deploy log and the backups are ignored.
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
    fail "files here differ from git (git status); checking out $tag would discard them"

  if [[ "$current" =~ ^v([0-9]+)\. ]] && ((target_major < BASH_REMATCH[1])); then
    fail "$current → $tag goes back below major version ${BASH_REMATCH[1]}, whose migrations changed stored data. Roll back with the pre-deploy dump instead: ops/deploy/README.md, \"Rolling back a release\""
  fi

  echo "→ shipping $tag (the checkout was at ${was:-an unknown commit})"
  git -c advice.detachedHead=false checkout --quiet --detach "$tag"

  if ! PB_VERSION="$tag" ./ops/deploy/deploy.sh; then
    echo >&2
    echo "✗  $tag did not deploy, and the checkout is on it now." >&2
    if [[ -n "$current" && "$current" != "$tag" ]]; then
      echo "   Back to the release before: ./ops/deploy/ship.sh $current" >&2
    fi
    exit 1
  fi

  # A plain `git pull` needs a branch; ship.sh itself does not.
  if [[ -z "${SSH_ORIGINAL_COMMAND:-}" ]]; then
    echo
    echo "   The checkout is on $tag. For a plain git pull: git checkout main first."
  fi
}

main "$@"; exit
