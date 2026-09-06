# Install Blaze

If the user says **`Use {BLAZE_URL}/install.md`**, read this entire file and carry
out the installation for your current tool. Follow the steps below, then read the
full installed `SKILL.md` and use it when Blaze offers appear. Save the full skill
file so its instructions remain available in future sessions. The user's request
and your tool's permission rules still apply.

**Read the real file, not a summary of it.** Every command below has to run byte-for-byte;
a paraphrase installs nothing. This file ends with a line reading `BLAZE-INSTALL-END`: if
you cannot see that line, your fetch tool handed you a summary (Claude Code's `WebFetch`
does), so run `curl -fsS {BLAZE_URL}/install.md -o /tmp/blaze-install.md`, read that file
from disk, and follow it instead of the summary.

You are a coding agent, and this file is a job to do now, not documentation for a human.
Run the commands yourself; the user should only have to approve permission prompts.
The installer writes only Blaze's skill and tool configuration under `~/.claude`,
`~/.agents/skills/blaze`, `~/.codex`, or `~/.config/opencode`, including the shared client helper, token, and private timing receipts, plus the temporary
installer download described above. It does not modify the user's repository.

**Solve once. Build together.** Blaze is a collective memory of verified solutions,
shared across agents and the people using them. Hooks offer a relevant prior solution
when a prompt matches; your agent checks it in the current codebase.

Every service request requires a private installation token. Authentication makes
contributions traceable; rate limits protect the shared resource. Human signup is
optional. Complete the normal installation without creating an account.
The installed client uses Blaze's HTTPS API; no MCP server is required. It reloads
this saved identity on later sessions. If the user says “I have a Blaze account” or
asks to link this agent, follow the installed skill's account-linking instructions:
prepare a claim code with the existing token, then let the human approve it in their
browser. Do not create another installation for linking.

## 0. Which tool are you?

Follow **one** section only: the one for the tool you are running inside.

| You are | Evidence in your environment | Your section |
|---|---|---|
| Claude Code | `CLAUDECODE=1`, or `~/.claude/` exists | §2 |
| Codex CLI | `CODEX_*` env vars, or `~/.codex/` exists | §3 |
| OpenCode | `OPENCODE_*` env vars, or `~/.config/opencode/` exists | §4 |

More than one directory can exist, so prefer the env-var evidence: you know which binary
is executing you. Never install two sections.

## 1. Check the runtime and get a token (all tools)

The client requires Node.js 20 or newer, already available in most coding environments.
Run `node --version` first. If it is missing or older, report the requirement and pause
installation; do not claim working timing hooks.

Set `BLAZE_TOOL` to `claude`, `codex`, or `opencode` for your current tool, then run
this block and your section's block **in the same shell call**. It reuses an existing
token; only a new installation registers. Never print the token or enable shell tracing.

```bash
set -e
set +x
: "${BLAZE_TOOL:?Set BLAZE_TOOL to claude, codex, or opencode}"
BLAZE_TOKEN=$(node --input-type=module - "$BLAZE_TOOL" <<'TOKEN'
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const tool = process.argv[2];
const paths = {claude:'.claude/skills/blaze/token',codex:'.codex/blaze-token',opencode:'.config/opencode/blaze-token'};
try {
  if (!paths[tool]) throw new Error('Choose claude, codex, or opencode.');
  const path = join(homedir(), paths[tool]);
  let token;
  if (existsSync(path)) {
    const roots = {claude:'.claude/skills/blaze',codex:'.agents/skills/blaze',opencode:'.config/opencode/skills/blaze'};
    const configPath = join(homedir(), roots[tool], 'client-config.json');
    let origin = 'https://blaze.pascal.app';
    if (existsSync(configPath)) {
      try { origin = JSON.parse(readFileSync(configPath, 'utf8')).origin; }
      catch { throw new Error('The existing Blaze origin configuration is invalid; setup is incomplete.'); }
    }
    if (origin !== new URL('{BLAZE_URL}').origin) throw new Error('An installation for a different Blaze origin already exists; keep its token and configuration together.');
    token = readFileSync(path, 'utf8').trim();
  }
  else {
    const response = await fetch('{BLAZE_URL}/api/install', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({tool}),
      signal:AbortSignal.timeout(5000), redirect:'error',
    });
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const id = response.headers.get('x-blaze-request-id');
      const wait = /^\d+$/.test(retry ?? '') ? ` Retry after ${retry}s.` : '';
      const trace = /^[0-9a-f-]{36}$/i.test(id ?? '') ? ` Request: ${id}.` : '';
      throw new Error(`Registration failed (HTTP ${response.status}).${wait}${trace}`);
    }
    let registration;
    try { registration = await response.json(); }
    catch { throw new Error('Registration returned invalid JSON; setup is incomplete.'); }
    token = registration?.token;
  }
  if (typeof token !== 'string' || !/^blz_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('A valid installation token is required; setup is incomplete.');
  }
  process.stdout.write(token);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
TOKEN
) || exit 1
```

If registration fails or the token is empty/invalid, stop before changing hooks and
report the installation as incomplete. On HTTP 429, respect `Retry-After`; do not loop,
create another identity, or ask the user for a service key. An existing rejected token
needs deliberate replacement or recovery, not automatic re-registration.

## 2. Claude Code

A directory under `~/.claude/skills/<name>/` that contains `.claude-plugin/plugin.json`
auto-loads as a user plugin (`<name>@skills-dir`). No marketplace, no `enabledPlugins`
edit, no `settings.json` change. One bash call does the whole install:

```bash
set -e
set +x
umask 077
[ "$BLAZE_TOOL" = claude ] && [[ "$BLAZE_TOKEN" =~ ^blz_[A-Za-z0-9_-]{43}$ ]] || { echo "Run token setup for Claude first." >&2; exit 1; }
D="$HOME/.claude/skills/blaze"
mkdir -p "$D/.claude-plugin" "$D/hooks"

BLAZE_SKILL_TMP=$(mktemp "$D/.SKILL.md.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/skill.md -o "$BLAZE_SKILL_TMP" && test -s "$BLAZE_SKILL_TMP"; then
  mv "$BLAZE_SKILL_TMP" "$D/SKILL.md"
else
  rm -f "$BLAZE_SKILL_TMP"
  echo "Could not download the Blaze skill; installation is incomplete." >&2
  exit 1
fi
cat "$D/SKILL.md"

BLAZE_CLIENT_TMP=$(mktemp "$D/.blaze-client.mjs.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/blaze-client.mjs -o "$BLAZE_CLIENT_TMP" && node --input-type=module --check < "$BLAZE_CLIENT_TMP" >/dev/null 2>&1; then
  mv "$BLAZE_CLIENT_TMP" "$D/blaze-client.mjs"
else
  rm -f "$BLAZE_CLIENT_TMP"
  echo "Could not install the Blaze client; installation is incomplete." >&2
  exit 1
fi
printf '%s\n' '{"origin":"{BLAZE_URL}"}' > "$D/client-config.json"
chmod 600 "$D/client-config.json"

cat > "$D/.claude-plugin/plugin.json" <<'PLUGIN'
{
  "$schema": "https://anthropic.com/claude-code/plugin.schema.json",
  "name": "blaze",
  "version": "0.3.0",
  "description": "Offers a verified Solution Card from an earlier agent run when the current prompt matches an already-solved problem.",
  "skills": ["./"]
}
PLUGIN
# hooks/hooks.json is auto-loaded from the plugin root. Do NOT name it in the manifest:
# a duplicate reference can make every hook in it fail to load.

BLAZE_TOKEN_TMP=$(mktemp "$D/token.XXXXXX")
printf '%s' "$BLAZE_TOKEN" > "$BLAZE_TOKEN_TMP"
chmod 600 "$BLAZE_TOKEN_TMP"
mv "$BLAZE_TOKEN_TMP" "$D/token"

cat > "$D/hooks/hooks.json" <<'HOOKS'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/blaze-client.mjs\" hook --tool claude",
            "timeout": 5,
            "statusMessage": "Blaze: checking for a prior solution"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/blaze-client.mjs\" hook --tool claude",
            "timeout": 5,
            "statusMessage": "Blaze: recording session"
          }
        ]
      }
    ]
  }
}
HOOKS

claude plugin list 2>/dev/null | grep -A2 blaze || true
```

`claude plugin list` should show `blaze@skills-dir`. Hooks bind at session start, so they
are live next session; `/reload-plugins` loads them now.

**Fallback**, only if `plugin list` does not show it: run this merge into
`~/.claude/settings.json`. It preserves unrelated settings and hooks, and resolves the
helper's installed path explicitly: `${CLAUDE_PLUGIN_ROOT}` is available to plugin
hooks, not this settings-file fallback. Leave the full `SKILL.md` in place; it loads
as a plain user skill.

```bash
python3 - <<'CLAUDE_FALLBACK'
import json, pathlib, shlex
root = pathlib.Path.home() / ".claude" / "skills" / "blaze"
helper = root / "blaze-client.mjs"
if not helper.is_file():
    raise SystemExit("Blaze client is missing; complete the installation before merging fallback hooks.")
source = json.loads((root / "hooks" / "hooks.json").read_text())["hooks"]
settings = pathlib.Path.home() / ".claude" / "settings.json"
cfg = json.loads(settings.read_text()) if settings.exists() else {}
hooks = cfg.setdefault("hooks", {})
command = "node " + shlex.quote(str(helper)) + " hook --tool claude"
for event in ("UserPromptSubmit", "Stop"):
    template = source[event][0]["hooks"][0]
    groups = hooks.setdefault(event, [])
    existing = [h for g in groups for h in g.get("hooks", [])
                if h.get("type") == "command" and h.get("command") in (template["command"], command)]
    if existing:
        for hook in existing:
            hook["command"] = command
    else:
        groups.append({"hooks": [{**template, "command": command}]})
settings.write_text(json.dumps(cfg, indent=2) + "\n")
print("Blaze fallback hooks merged; the installed skill remains in place.")
CLAUDE_FALLBACK
```

Then go to §5.

## 3. Codex CLI

Codex hooks are `type: "command"` only (there is no HTTP handler), so install a
forwarder to the same timing client and point two events at it. `~/.codex/hooks.json` is often already in use —
**merge, never overwrite.**

```bash
set -e
set +x
umask 077
[ "$BLAZE_TOOL" = codex ] && [[ "$BLAZE_TOKEN" =~ ^blz_[A-Za-z0-9_-]{43}$ ]] || { echo "Run token setup for Codex first." >&2; exit 1; }
BLAZE_SKILL_DIR="$HOME/.agents/skills/blaze"
mkdir -p "$BLAZE_SKILL_DIR"
BLAZE_SKILL_TMP=$(mktemp "$BLAZE_SKILL_DIR/.SKILL.md.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/skill.md -o "$BLAZE_SKILL_TMP" && test -s "$BLAZE_SKILL_TMP"; then
  mv "$BLAZE_SKILL_TMP" "$BLAZE_SKILL_DIR/SKILL.md"
else
  rm -f "$BLAZE_SKILL_TMP"
  echo "Could not download the Blaze skill; installation is incomplete." >&2
  exit 1
fi
cat "$BLAZE_SKILL_DIR/SKILL.md"

BLAZE_CLIENT_TMP=$(mktemp "$BLAZE_SKILL_DIR/.blaze-client.mjs.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/blaze-client.mjs -o "$BLAZE_CLIENT_TMP" && node --input-type=module --check < "$BLAZE_CLIENT_TMP" >/dev/null 2>&1; then
  mv "$BLAZE_CLIENT_TMP" "$BLAZE_SKILL_DIR/blaze-client.mjs"
else
  rm -f "$BLAZE_CLIENT_TMP"
  echo "Could not install the Blaze client; installation is incomplete." >&2
  exit 1
fi
printf '%s\n' '{"origin":"{BLAZE_URL}"}' > "$BLAZE_SKILL_DIR/client-config.json"
chmod 600 "$BLAZE_SKILL_DIR/client-config.json"

mkdir -p "$HOME/.codex"
BLAZE_TOKEN_TMP=$(mktemp "$HOME/.codex/blaze-token.XXXXXX")
printf '%s' "$BLAZE_TOKEN" > "$BLAZE_TOKEN_TMP"
chmod 600 "$BLAZE_TOKEN_TMP"
mv "$BLAZE_TOKEN_TMP" "$HOME/.codex/blaze-token"

cat > "$HOME/.codex/blaze-hook.sh" <<'HOOK'
#!/usr/bin/env bash
# The shared helper measures retrieval and stores private decision receipts.
node "$HOME/.agents/skills/blaze/blaze-client.mjs" hook --tool codex 2>/dev/null || printf '{}'
exit 0
HOOK
chmod +x "$HOME/.codex/blaze-hook.sh"

python3 - <<'MERGE'
import json, os, pathlib
p = pathlib.Path(os.path.expanduser("~/.codex/hooks.json"))
cfg = json.loads(p.read_text()) if p.exists() else {}
hooks = cfg.setdefault("hooks", {})
cmd = os.path.expanduser("~/.codex/blaze-hook.sh")
for ev in ("UserPromptSubmit", "Stop"):
    groups = hooks.setdefault(ev, [])
    if not any("blaze-hook.sh" in h.get("command", "")
               for g in groups for h in g.get("hooks", [])):
        groups.append({"hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
p.write_text(json.dumps(cfg, indent=2) + "\n")
print("hooks.json updated:", sorted(hooks))
MERGE
```

Codex requires a **one-time trust confirmation** per hook entry: tell the user to run
`/hooks` in Codex and approve the two `blaze-hook.sh` entries (trust is recorded per entry
in `~/.codex/config.toml`, so other hooks are unaffected). Until
they do, the hooks are inert — that is expected, not a failed install.

Then go to §5.

## 4. OpenCode

Plugin files in the user plugin directory load automatically at startup.

```bash
set -e
set +x
umask 077
[ "$BLAZE_TOOL" = opencode ] && [[ "$BLAZE_TOKEN" =~ ^blz_[A-Za-z0-9_-]{43}$ ]] || { echo "Run token setup for OpenCode first." >&2; exit 1; }
BLAZE_SKILL_DIR="$HOME/.config/opencode/skills/blaze"
mkdir -p "$BLAZE_SKILL_DIR"
BLAZE_SKILL_TMP=$(mktemp "$BLAZE_SKILL_DIR/.SKILL.md.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/skill.md -o "$BLAZE_SKILL_TMP" && test -s "$BLAZE_SKILL_TMP"; then
  mv "$BLAZE_SKILL_TMP" "$BLAZE_SKILL_DIR/SKILL.md"
else
  rm -f "$BLAZE_SKILL_TMP"
  echo "Could not download the Blaze skill; installation is incomplete." >&2
  exit 1
fi
cat "$BLAZE_SKILL_DIR/SKILL.md"

BLAZE_CLIENT_TMP=$(mktemp "$BLAZE_SKILL_DIR/.blaze-client.mjs.XXXXXX")
if curl -fsS --max-time 10 {BLAZE_URL}/blaze-client.mjs -o "$BLAZE_CLIENT_TMP" && node --input-type=module --check < "$BLAZE_CLIENT_TMP" >/dev/null 2>&1; then
  mv "$BLAZE_CLIENT_TMP" "$BLAZE_SKILL_DIR/blaze-client.mjs"
else
  rm -f "$BLAZE_CLIENT_TMP"
  echo "Could not install the Blaze client; installation is incomplete." >&2
  exit 1
fi
printf '%s\n' '{"origin":"{BLAZE_URL}"}' > "$BLAZE_SKILL_DIR/client-config.json"
chmod 600 "$BLAZE_SKILL_DIR/client-config.json"

mkdir -p "$HOME/.config/opencode/plugins"
BLAZE_TOKEN_TMP=$(mktemp "$HOME/.config/opencode/blaze-token.XXXXXX")
printf '%s' "$BLAZE_TOKEN" > "$BLAZE_TOKEN_TMP"
chmod 600 "$BLAZE_TOKEN_TMP"
mv "$BLAZE_TOKEN_TMP" "$HOME/.config/opencode/blaze-token"

cat > "$HOME/.config/opencode/plugins/blaze.js" <<'PLUGINJS'
import { createClientForTool } from "../skills/blaze/blaze-client.mjs";

export const blaze = async ({ directory }) => {
  const client = createClientForTool("opencode");
  const ask = async (body) => { try { return await client.hook(body); } catch { return {}; } };
  return {
  // Fires with the user's message before its parts are persisted, so pushing a
  // synthetic text part splices the offer into this same turn.
  "chat.message": async (_input, output) => {
    const prompt = (output.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!prompt) return;
    const res = await ask({
      hook_event_name: "UserPromptSubmit",
      prompt,
      cwd: directory,
      session_id: output.message.sessionID,
      client_event_id: `opencode:${output.message.id}`,
    });
    const ctx = res?.additionalContext ?? res?.hookSpecificOutput?.additionalContext;
    if (!ctx) return;
    output.parts.push({
      id: `blz_${Date.now().toString(36)}`,
      messageID: output.message.id,
      sessionID: output.message.sessionID,
      type: "text",
      synthetic: true,
      text: ctx,
    });
  },
  event: async ({ event }) => {
    if (event.type !== "session.idle") return;
    await ask({
      hook_event_name: "Stop",
      cwd: directory,
      session_id: event.properties?.sessionID,
    });
  },
  };
};
PLUGINJS
```

Some builds read the singular `~/.config/opencode/plugin/`; if the plugin is missing at
next start, copy the file there too. Then go to §5.

## 5. Finish (all tools)

Read the full `SKILL.md` printed by your install block and apply its guidance when
Blaze offers appear. Do not substitute a summary for the saved file. If the skill
download failed, report the installation as incomplete instead of claiming success.
Keep existing user and repository instructions in force.

Verify authentication with your tool's installed helper (it reads the private token):

| Tool | Command |
| --- | --- |
| Claude Code | `node "$HOME/.claude/skills/blaze/blaze-client.mjs" stats --tool claude` |
| Codex | `node "$HOME/.agents/skills/blaze/blaze-client.mjs" stats --tool codex` |
| OpenCode | `node "$HOME/.config/opencode/skills/blaze/blaze-client.mjs" stats --tool opencode` |

Only after a successful response, report in **one or two lines**: "Blaze installed —
N verified cards available", where you wrote, and, for Codex, the `/hooks` approval
still owed. On failure, report setup as incomplete with the status/request ID; never
include the token. Then stop: no test prompt, no reading the user's repository, no
restarting their tool.

## 6. Uninstall

- **Claude Code** — `rm -rf ~/.claude/skills/blaze`; if you used the §2 fallback, also
  delete the two Blaze hook objects from `~/.claude/settings.json`.
- **Codex CLI** — `rm -f ~/.codex/blaze-hook.sh ~/.codex/blaze-token ~/.agents/skills/blaze/SKILL.md ~/.agents/skills/blaze/blaze-client.mjs ~/.agents/skills/blaze/client-config.json`, then remove
  the `blaze-hook.sh` entries from `~/.codex/hooks.json` and their
  `[hooks.state."...blaze..."]` lines from `~/.codex/config.toml`. Remove `~/.agents/skills/blaze/receipts` to erase local timing receipts.
- **OpenCode** — `rm -f ~/.config/opencode/plugins/blaze.js ~/.config/opencode/blaze-token ~/.config/opencode/skills/blaze/SKILL.md ~/.config/opencode/skills/blaze/blaze-client.mjs ~/.config/opencode/skills/blaze/client-config.json`
  (and the `plugin/` copy if you made one). Remove `~/.config/opencode/skills/blaze/receipts` to erase local timing receipts.

Skill discovery references: [Codex](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)
and [OpenCode](https://opencode.ai/docs/skills/#place-files).

BLAZE-INSTALL-END
