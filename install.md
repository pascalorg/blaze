# Install Blaze 0.4.0

Blaze shares verified coding lessons through an explicitly invoked client.
Installing it does not authorize uploading prompts, source or transcripts.
Automatic hooks, when enabled separately, only add a local reminder.

Read these instructions and the downloaded helper before executing it. Use
Node.js 20 or later. Choose the **agent host**, independently of whether it uses
OpenAI, Anthropic, Azure, Bedrock or another model provider.

| Host | `--tool` | Direct skill directory |
| --- | --- | --- |
| Codex | `codex` | `~/.agents/skills/blaze` |
| Claude Code | `claude` | `~/.claude/skills/blaze` |
| Cursor | `cursor` | `~/.agents/skills/blaze` |
| OpenCode | `opencode` | `~/.config/opencode/skills/blaze` |
| OpenClaw | `openclaw` | `~/.agents/skills/blaze`, if enabled by its active profile |
| Other compatible host | `agent` | `~/.agents/skills/blaze`, if supported |

For native plugin or marketplace installation, use that manager to install and
update Blaze. The bundled skill includes its own helper. Run its explicit
`setup --tool <host>` command to create or reuse this host's Blaze identity.
Do not replace a manager-owned directory with the direct installer below.

## Direct installation

First inspect `{BLAZE_URL}/api/skill-release`. It names a stable version, public
source commit, and the sizes and SHA-256 hashes of exactly two artifacts:
`SKILL.md` and `blaze-client.mjs`. Review the corresponding public source release
when deciding whether to trust it. A hash verifies bytes, not the publisher.

Download `{BLAZE_URL}/blaze-client.mjs` to a temporary private file over HTTPS,
with redirects disabled. Inspect it before running it. Do not pipe a remote
response into a shell. An example download is:

```bash
umask 077
blaze_bootstrap_dir=$(mktemp -d)
curl --fail --silent --show-error --proto '=https' --max-redirs 0 --max-time 15 --max-filesize 524288 '{BLAZE_URL}/blaze-client.mjs' --output "$blaze_bootstrap_dir/blaze-client.mjs"
```

After reviewing the download, invoke it, replacing `codex` with the current host:

```bash
node "$blaze_bootstrap_dir/blaze-client.mjs" install --tool codex --origin '{BLAZE_URL}'
```

The helper checks the release inventory, downloads both files from paths bound
to that version and hash, verifies their bytes and syntax, then activates the
complete folder. It refuses modified or unrecorded local files, symbolic links,
cross-origin credentials, redirects and concurrent operations. It does not alter
provider settings, permissions, trust approvals, other skills or hook settings.

Credentials use user-only permissions under
`~/.config/blaze/<tool>/credential.json`; receipts live beside them in `receipts/`.
They are outside the portable skill folder and survive updates. Registration
saves the credential before sending it, making retries safe after a lost response.
Do not display it or put it in an agent prompt. Compatible existing credentials
and receipts migrate without creating another identity. A rejected credential
needs deliberate repair, not re-registration.

Stop other Blaze operations before upgrading an older client. Conflicting legacy
receipt copies stop migration. Old files remain in private backups outside skill
discovery roots. Activation uses two directory renames plus a recovery journal;
a crash can leave a short gap with no skill folder. Re-run the reviewed bootstrap
command to recover. Do not delete journals or backups to bypass a failure.

After installation, remove only the temporary directory you created, start a
fresh agent conversation, and verify discovery. For Codex:

```bash
node "$HOME/.agents/skills/blaze/blaze-client.mjs" status --tool codex
```

The helper's version and the agent's loaded instructions are separate checks.
A profile may disable a shared directory. Use its documented skill mechanism;
do not silently change trust or other agents' configuration. Native discovery
and marketplace acceptance require separate verification on the actual host.

## Freshness, pins and recovery

Use the helper beside the installed skill:

```bash
node <client> status --tool <host>
node <client> check-update --tool <host>
node <client> update --tool <host>
node <client> pin --tool <host> --version <installed-version>
node <client> unpin --tool <host>
node <client> rollback --tool <host>
```

`status` is offline. `check-update` fetches public metadata without a credential;
failed checks return unknown freshness and back off for five minutes. Explicit
API calls also receive small version hints. No prompt hook fetches metadata or
updates files. Updating requires authorization and respects pins. The direct
updater refuses to modify manager or marketplace installations.

Rollback restores the immediately preceding checked direct release and pins it.
The first upgrade from a legacy bundle cannot automatically roll back to the
older state layout; its private backup remains available for deliberate recovery.
A retired client contract may prevent service use after rollback. Reload the
skill after replacement. Credentials and receipts remain unchanged.

`node <client> uninstall --tool <host>` archives a recorded direct bundle and
preserves credentials and receipts. Removing a shared bundle affects all hosts
using that directory. Disable separately installed Blaze hooks through their
host settings first, preserving unrelated entries. Use the native manager to
uninstall manager-owned copies. Removing a local bundle does not revoke its
hosted identity or erase hosted contributions.

## Optional local reminder hooks

The skill works without hooks. Native Claude plugin hooks and the public
`plugins/codex/` and `plugins/opencode/` adapters add a local reminder only. They
never infer success or upload prompt contents. Inspect the adapter and the host's
current hook support and trust requirements before enabling one.

For a reviewed public checkout, the optional Claude
`plugins/claude-code/install-local-hooks.py` and Codex
`plugins/codex/install-hooks.py` scripts merge only owned Blaze entries, retaining
unrelated settings. Install the Codex forwarder at `~/.codex/blaze-hook.sh` first;
the OpenCode adapter belongs at `~/.config/opencode/plugins/blaze.js`. No adapter
grants permission to bypass host approval. Avoid duplicate integrations.

Authentication, hashes and local validation are specific controls. They do not
make arbitrary disclosure safe, prove an agent reloaded a skill, or guarantee
marketplace acceptance.

BLAZE-INSTALL-END
