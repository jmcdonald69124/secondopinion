#!/usr/bin/env bash
# Behavioral smoke test for the second-opinion plugin.
#
# This is NOT a unit test. It runs the actual reviewer against a deliberately
# questionable change and asserts that the plugin produces a usable, parseable
# verdict. The model's prose is non-deterministic, so we do not assert on the
# *content* of the judgment — only that the machine-readable contract holds:
# a fenced json block with tool == "second-opinion" and a valid verdict value.
#
# Requirements: the `claude` CLI, authentication, and `jq`. It spends tokens.
#
# Usage:
#   test/smoke.sh                 # loads the plugin from this repo via --plugin-dir
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for bin in claude jq git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "smoke: '$bin' is required but not installed" >&2; exit 2; }
done

# Build a throwaway git repo with a change worth questioning: a hand-rolled,
# unbounded in-memory cache added to a tiny module — the kind of decision that
# should draw a right-path / operational / complexity finding, not a syntax nit.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q
git config user.email test@example.com
git config user.name "smoke test"

cat > store.js <<'EOF'
export function getUser(db, id) {
  return db.query("select * from users where id = ?", id);
}
EOF
git add -A
git commit -qm "baseline: fetch user from db"

cat > store.js <<'EOF'
const cache = {}; // grows forever, never invalidated, per-process

export function getUser(db, id) {
  if (cache[id]) return cache[id];
  const row = db.query("select * from users where id = ?", id);
  cache[id] = row;
  return row;
}
EOF
git add -A
git commit -qm "cache users in memory to cut db load"

echo "smoke: running the reviewer against the fixture change..." >&2
# Runs in a throwaway temp repo, so bypassing permission prompts is safe here
# and necessary — headless mode cannot answer the git / subagent prompts.
out="$(claude -p "/second-opinion:interrogate HEAD~1..HEAD" \
  --plugin-dir "$repo_root" \
  --permission-mode bypassPermissions 2>&1)" || {
    echo "smoke: claude invocation failed" >&2
    echo "$out" >&2
    exit 1
  }

echo "----- reviewer output -----" >&2
echo "$out" >&2
echo "---------------------------" >&2

# Extract the last fenced ```json block and validate the verdict contract.
verdict_json="$(printf '%s\n' "$out" \
  | awk '/^```json/{flag=1;buf="";next} /^```/{if(flag){last=buf;flag=0}} flag{buf=buf $0 "\n"} END{printf "%s", last}')"

if [ -z "$verdict_json" ]; then
  echo "FAILED: no machine-readable json verdict block found in output" >&2
  exit 1
fi

echo "$verdict_json" | jq -e '.' >/dev/null 2>&1 || {
  echo "FAILED: verdict block is not valid JSON" >&2
  echo "$verdict_json" >&2
  exit 1
}

tool="$(echo "$verdict_json" | jq -r '.tool // empty')"
verdict="$(echo "$verdict_json" | jq -r '.verdict // empty')"

[ "$tool" = "second-opinion" ] || { echo "FAILED: expected tool 'second-opinion', got '$tool'" >&2; exit 1; }
case "$verdict" in
  approve|revise|block) ;;
  *) echo "FAILED: verdict '$verdict' is not one of approve|revise|block" >&2; exit 1 ;;
esac

echo "OK: reviewer emitted a valid '$verdict' verdict."
