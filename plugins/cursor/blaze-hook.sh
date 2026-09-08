#!/usr/bin/env bash
# The helper ignores raw hook fields and returns fixed model-only session context.
node "$HOME/.agents/skills/blaze/blaze-client.mjs" hook --tool cursor 2>/dev/null || printf '{}'
exit 0
