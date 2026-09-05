#!/usr/bin/env bash
# The shared helper measures retrieval and stores private decision receipts.
node "$HOME/.agents/skills/blaze/blaze-client.mjs" hook --tool codex 2>/dev/null || printf '{}'
exit 0
