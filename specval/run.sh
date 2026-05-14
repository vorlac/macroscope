#!/usr/bin/env bash
# Run the entire spec-validation battery in parallel.
# Output is aggregated after all suites finish; non-zero exit if any failed.
set -u
cd "$(dirname "$0")"

SUITES=(
  regression.js
  s1_args.js
  s2_prescan.js
  s3_stringize.js
  s4_paste.js
  s5_variadic.js
  s6_rescan.js
  s7_undef.js
  s8_errors.js
)

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

for f in "${SUITES[@]}"; do
  node "$f" > "$TMPDIR/$f.out" 2>&1 &
done
wait

fail=0
for f in "${SUITES[@]}"; do
  cat "$TMPDIR/$f.out"
  grep -q '^\[.*\] ✗' "$TMPDIR/$f.out" && fail=1
done

exit $fail
