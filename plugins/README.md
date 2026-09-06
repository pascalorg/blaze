# Plugins

One directory per tool. The Codex forwarder and OpenCode module are byte-identical to
the blocks [`../install.md`](../install.md) writes inline. Claude Code has a repository
manifest and an install-time manifest for their different directory layouts; its hook
events match, with the origin-bound token stored with user-only permissions at install time. Keep corresponding files in
sync. `bun run check:templates` checks these relationships.

`{BLAZE_URL}` is a literal placeholder in installer/config templates. The gateway substitutes the
origin the reader fetched from, so the same file is correct on localhost, on a preview
deployment and in production. Never commit a hard-coded host in its place.

The installed hook is local-only: it ignores raw hook fields and returns fixed guidance
for an explicit conceptual lookup. It never calls the gateway, and nothing Blaze installs
can block a prompt.

| Tool | Events | Transport |
| --- | --- | --- |
| Claude Code | `UserPromptSubmit` | `type: "command"` — local reminder from the shared client |
| Codex CLI | `UserPromptSubmit` | `type: "command"` — Codex has no HTTP hook |
| OpenCode | `chat.message` | plugin module and the same local reminder |

## `claude-code/`

A Claude Code plugin layout: `.claude-plugin/plugin.json`, `hooks/hooks.json`,
`skills/blaze/SKILL.md`, and `blaze-client.mjs`. The marketplace metadata names it
`blaze`. Command hooks resolve the helper through `${CLAUDE_PLUGIN_ROOT}`. A checkout
alone does not configure an install token. Use the hosted `install.md` §2 path, which resolves the
origin and writes the token and installed layout into `~/.claude/skills/blaze/`.

`skills/blaze/SKILL.md` is a copy of [`../skill.md`](../skill.md) — the plugin ships the
skill so a fresh install works before the first gateway fetch. Keep them identical.

Hooks bind at session start, so a fresh install is live next session; `/reload-plugins`
loads it now. `UserPromptSubmit` does not support `matcher`, so the key is
omitted (it would be silently ignored).

## `codex/`

`hooks.json` carries the entry to **merge** into `~/.codex/hooks.json` — that file is
usually already in use, so never overwrite it. `install.md` §3 does the merge idempotently
with a short Python block.

It also saves the full `skill.md` as `~/.agents/skills/blaze/SKILL.md` and prints
it for the installing agent to read.

`blaze-hook.sh` belongs at `~/.codex/blaze-hook.sh` (the path the entries name) and invokes the shared helper beside the skill. The helper reads
the token from `~/.codex/blaze-token`, mode `600`. It always exits `0` and prints `{}` on
any failure.

Codex requires a **one-time trust confirmation per hook entry**: the user runs `/hooks` and
approves the `blaze-hook.sh` entry, recorded in `~/.codex/config.toml`. Until then the
hooks are inert — expected, not a failed install.

## `opencode/`

`blaze.js` belongs in `~/.config/opencode/plugins/`, and imports the helper from `../skills/blaze/blaze-client.mjs`. The helper reads
`~/.config/opencode/blaze-token`. Some builds read the singular `plugin/` directory
instead; if the plugin is missing at next start, copy the file there too.

The installer saves the full `skill.md` as
`~/.config/opencode/skills/blaze/SKILL.md` and prints it for the installing agent
to read.

`chat.message` adds fixed local guidance to the turn. The plugin does not read, copy, or
send the user's message, directory, session identifier, or other message parts.

## Authentication and fair use

Every service call uses the existing origin-bound installation token, including lookup and
stats. Missing or malformed tokens stop the request locally. The helper honors HTTP 429
`Retry-After` across hook processes and reports safe request IDs on explicit command
failures. Keep event IDs stable when retrying; never mint another identity to bypass
limits. Human signup remains optional. Identity makes shared work traceable; a
contribution still needs independent verification.

## Timing and outcomes

`client/blaze-client.mjs` is the shared source, copied byte-for-byte into the Claude
plugin and downloaded next to the installed skill for each tool. It uses Node.js 20+
built-ins only. Its credential file binds the token to the hosted origin; tests use a
local HTTP server.

The client measures complete HTTP replies through JSON parsing, including card downloads
performed through its `card` command. Receipts contain IDs and timing, never prompt/code
contents, in user-only files under the skill's `receipts/` directory. `outcome` requires an
explicit result and verification status; it retains the exact event and payload for a
retry. The skill asks the agent to copy the returned three-times summary at the end of
its answer.

The helper's `lookup` command accepts an inspected, one-line conceptual problem, plus
optional explicit task/environment fingerprints and client event IDs. It sends a strict
`minimized: true` privacy contract and rejects raw-context fields, obvious credentials,
paths, URLs, code-shaped input, and unknown fields. This validation is a guardrail rather
than proof that text is safe. See the full skill for the human review boundary and timing
rules. Run `bun run test:client` for local-only transport/protocol tests.

## Optional account and contributions

The same helper supports these explicit commands; no second skill or package is needed:

| Command | Action |
| --- | --- |
| `stats --tool <tool>` | Check authenticated service access. |
| `claim --tool <tool>` | Print a short-lived claim URL/code for a person to link this installation. |
| `contribute --tool <tool> --file <minimized-card.json>` | Submit the complete minimized contribution JSON envelope, preserving its stable event UUID. |
| `contribution --tool <tool> --id <uuid>` | Read the owned candidate's status without echoing card text. |
| `delete-contribution --tool <tool> --id <uuid>` | Revoke and erase the owned hosted candidate payload. |

Each command follows `node <installed-skill-directory>/blaze-client.mjs`. None runs
automatically from a hook. Installation works without human signup; optional account
pages are `/signup` and `/account` on the configured gateway. The helper uses the
existing installation token and never asks for a person's email.

See [`skill.md`](../skill.md#explicit-solution-contributions) for the exact contribution
envelope and data boundaries. Private is the default. Public submission requires the
user's explicit authorization for that candidate, `visibility: "public"`, and
`public_sharing_authorized: true`; trusted evaluation is still required before
publication. Never upload a transcript automatically. Retrying the same file preserves
the event ID and payload, while changing it under the same ID conflicts.
