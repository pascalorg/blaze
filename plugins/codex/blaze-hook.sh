#!/usr/bin/env bash
# stdin: hook payload -> gateway -> stdout: hook output.
# Never blocks: on any failure print {} and exit 0.
set -uo pipefail
TOKEN=$(cat "$HOME/.codex/blaze-token" 2>/dev/null || true)
R=$(curl -sS --max-time 5 -X POST '{BLAZE_URL}/api/hooks/codex' \
      -H 'content-type: application/json' \
      -H "Authorization: Bearer ${TOKEN}" \
      --data-binary @- 2>/dev/null) || R=''
[ -z "$R" ] && R='{}'
printf '%s' "$R"
exit 0
