# Plugins

One directory per tool. Each is an extracted copy of what [`../install.md`](../install.md)
writes inline, byte-identical to it — `install.md` stays self-contained so an agent
following it needs one fetch and no checkout. Edit both, or neither.

`{BLAZE_URL}` is a literal placeholder in every file here. The gateway substitutes the
origin the reader fetched from, so the same file is correct on localhost, on a preview
deployment and in production. Never commit a hard-coded host in its place.

Both events are best-effort in all three tools: a gateway that is down, slow or erroring
returns nothing and the turn proceeds. Nothing Blaze installs can block a prompt.

| Tool | Events | Transport |
| --- | --- | --- |
| Claude Code | `UserPromptSubmit`, `Stop` | `type: "http"` — no local script |
| Codex CLI | `UserPromptSubmit`, `Stop` | `type: "command"` — Codex has no HTTP hook |
| OpenCode | `chat.message`, `session.idle` | plugin module, `fetch` |

## `claude-code/`

A standard Claude Code plugin: `.claude-plugin/plugin.json`, `hooks/hooks.json`,
`skills/blaze/SKILL.md`. Installable three ways, all verified: through the marketplace
(`../.claude-plugin/marketplace.json`), with `claude --plugin-dir <abs path to this dir>`,
or by the `install.md` §2 path, which writes the same shapes into
`~/.claude/skills/blaze/` where a directory containing `.claude-plugin/plugin.json`
auto-loads as a user plugin.

`skills/blaze/SKILL.md` is a copy of [`../skill.md`](../skill.md) — the plugin ships the
skill so a fresh install works before the first gateway fetch. Keep them identical.

Hooks bind at session start, so a fresh install is live next session; `/reload-plugins`
loads it now. Neither `UserPromptSubmit` nor `Stop` supports `matcher`, so the key is
omitted (it would be silently ignored).

## `codex/`

`hooks.json` carries the two entries to **merge** into `~/.codex/hooks.json` — that file is
usually already in use, so never overwrite it. `install.md` §3 does the merge idempotently
with a short Python block.

`blaze-hook.sh` belongs at `~/.codex/blaze-hook.sh` (the path the entries name) and reads
the token from `~/.codex/blaze-token`, mode `600`. It always exits `0` and prints `{}` on
any failure.

Codex requires a **one-time trust confirmation per hook entry**: the user runs `/hooks` and
approves the two `blaze-hook.sh` entries, recorded in `~/.codex/config.toml`. Until then the
hooks are inert — expected, not a failed install.

## `opencode/`

`blaze.js` belongs in `~/.config/opencode/plugins/`, and reads the token from
`~/.config/opencode/blaze-token`. Some builds read the singular `plugin/` directory
instead; if the plugin is missing at next start, copy the file there too.

`chat.message` fires with the user's message before its parts are persisted, which is why
pushing a synthetic text part splices the offer into that same turn. `session.idle` stands
in for `Stop`.
