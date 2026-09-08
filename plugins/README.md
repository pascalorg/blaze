# Agent integrations

The portable skill works without hooks. Its `SKILL.md` and adjacent
`blaze-client.mjs` travel together. Each host stores credentials and receipts under
`~/.config/blaze/<tool>/`, independently of its model provider. The full workflow
and privacy boundaries are in [skill.md](../skill.md).

`client/blaze-client.mjs` is the canonical dependency-free Node.js 20+ helper.
The Claude plugin has two byte-identical copies: one at its root for native
hooks, one beside `skills/blaze/SKILL.md` for portable skill execution. Run
`bun run check:templates` to check copies, versions and hook syntax.

## Native and direct ownership

Use the actual loaded skill directory when invoking the helper. A native plugin
or marketplace copy uses its manager for updates. Explicit `setup --tool <host>`
creates or reuses the host's Blaze credential without changing provider settings.
A native plugin checkout does not itself create a credential or approve a hook.

Direct installs use [install.md](../install.md), which reviews a release, verifies
two artifact hashes, and preserves credentials and receipts through replacement.
Updates do not silently overwrite modified or unknown files. An interrupted swap
has a recovery journal and private backups outside skill discovery roots.
`status` distinguishes the running helper from the recorded version on disk.

Codex, Cursor and eligible OpenClaw profiles share the default
`~/.agents/skills/blaze` bundle. Claude Code uses `~/.claude/skills/blaze` and
OpenCode uses `~/.config/opencode/skills/blaze`. A shared bundle has one update
lock and pin; removing it affects every host using that directory. Host discovery,
profile configuration, permissions and marketplace review remain separate checks.

## Optional quiet adapters

| Host | Event | Adapter |
| --- | --- | --- |
| Claude Code | `UserPromptSubmit` | `claude-code/hooks/hooks.json` returns model-only context without a status message |
| Codex | `UserPromptSubmit` where supported and trusted | `codex/blaze-hook.sh` returns model-only context from the shared helper |
| Cursor | `sessionStart` | `cursor/blaze-hook.sh` returns `additional_context` without a user message |
| OpenCode | `experimental.chat.system.transform` | `opencode/blaze.js` appends fixed system context without a synthetic chat part |

Hooks never send a prompt, transcript, directory, source, environment, manifest,
log or session identifier. They do not perform a lookup, version check, update,
contribution or outcome report. An explicit helper command is required for each
service operation. Stop events do not infer success. They add no Blaze banner,
footer, toast, update notice, or user-facing message. The host may still render its
own generic hook or tool-call interface.

For a direct install, the optional Python scripts in `claude-code/` and `codex/`
merge owned guidance entries and remove only exact known obsolete Blaze Stop
commands. Inspect them first. Install the Codex forwarder at
`~/.codex/blaze-hook.sh` before merging its entry. Place the OpenCode adapter in
the active host's documented plugin directory; replace an older Blaze adapter
because portable skill updates do not manage optional adapters. For Cursor, merge
the template into `~/.cursor/hooks.json` and place its forwarder beside that file.
Do not copy adapters into several possible roots and create duplicate hooks. Native
plugin users do not also need a direct settings hook.

Respect the host's approval and reload process. Never edit trust approvals to
make a hook run. A new conversation is a useful reload boundary, but discovery
and execution must be verified on the installed host version.

## Requests, outcomes and lifecycle

Intentional API calls require the existing origin-bound Blaze credential.
Redirects are rejected. Credentials and untrusted error bodies are never printed.
HTTP 429 preserves the identity and event IDs and respects its cooldown. A 401
requires deliberate credential repair; a retired client contract requires an
update through the owning manager.

Lookup and card downloads measure complete replies, including JSON parsing.
Receipts store only IDs, categories, origin and timings. Outcome retries retain
an exact event and payload. A fixed contribution disposition closes each lookup,
including no-match decisions and deliberate privacy or verification skips.
Self-reports are weak feedback, not independent verification or publishing rights.
Successful outcome and participation CLI commands are silent by default. `summary`,
`status`, `stats`, and explicit `--output` modes remain available for inspection.

Contributions are explicit minimized envelopes, private by default. Public
sharing requires authorization for the exact candidate, followed by independent
approved verification. Derived candidates cite their owned source offer IDs.
Use the helper's contribution commands and the complete schema in the skill.
Never upload transcripts automatically.

`status`, `check-update`, `update`, `pin`, `unpin`, `rollback` and `uninstall` are
explicit lifecycle commands. Public freshness requests send no credential. A
failed check cannot claim the skill is current. Hashes and local validation bound
specific failures; they do not guarantee arbitrary disclosure is safe or that a
marketplace will accept an integration.
