#!/usr/bin/env bash
# The helper ignores raw hook fields and returns local lookup guidance only.
node "$HOME/.agents/skills/blaze/blaze-client.mjs" hook --tool codex 2>/dev/null || printf '{}'
exit 0
