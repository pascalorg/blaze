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

Blaze watches prompts and splices in a verified Solution Card when one matches a problem an
earlier agent already solved: two hooks (prompt-submitted, session-stopped) and one skill.

Lookup can run anonymously. A private installation token adds the authenticated path for
durable decision receipts, outcome reports, installation claims, and contributions. An
anonymous match can still provide useful guidance, but it cannot create an authenticated
receipt or submit an outcome. Human signup is not required for either path.

Human signup is optional. Complete the normal installation without creating an account.
The installed skill explains `/signup`, `/account`, and the helper's explicit `claim`
command if the user later wants to connect this installation to their account.

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

Run this next, in the shell you will use for your section:

```bash
BLAZE_TOKEN=$(curl -fsS --max-time 5 -X POST {BLAZE_URL}/api/install \
  -H 'content-type: application/json' -d '{}' \
  | sed -n 's/.*"token"[^"]*"\([^"]*\)".*/\1/p')
if [ -n "$BLAZE_TOKEN" ]; then echo "token obtained"; else echo "token unavailable"; fi
```

If it comes back empty, **keep going** with an empty token: anonymous lookup still works,
and you will mention lookup-only mode in your final report. Durable decision receipts,
authenticated outcome reporting, installation claims, and contributions remain unavailable
until a token is obtained. Do not retry more than once, and never ask the user for a key.

Your Bash tool may start a fresh shell per call (Codex does), so run this step and your
section's block in one call, or `$BLAZE_TOKEN` is empty when the block writes it.

## 2. Claude Code

A directory under `~/.claude/skills/<name>/` that contains `.claude-plugin/plugin.json`
auto-loads as a user plugin (`<name>@skills-dir`). No marketplace, no `enabledPlugins`
edit, no `settings.json` change. One bash call does the whole install:

```bash
set -e
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
  "version": "0.2.1",
  "description": "Offers a verified Solution Card from an earlier agent run when the current prompt matches an already-solved problem.",
  "skills": ["./"]
}
PLUGIN
# hooks/hooks.json is auto-loaded from the plugin root. Do NOT name it in the manifest:
# a duplicate reference can make every hook in it fail to load.

printf '%s' "$BLAZE_TOKEN" > "$D/token"
chmod 600 "$D/token"

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
printf '%s' "$BLAZE_TOKEN" > "$HOME/.codex/blaze-token"
chmod 600 "$HOME/.codex/blaze-token"

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
printf '%s' "$BLAZE_TOKEN" > "$HOME/.config/opencode/blaze-token"
chmod 600 "$HOME/.config/opencode/blaze-token"

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

```bash
curl -fsS --max-time 5 {BLAZE_URL}/api/stats
```

Report in **one or two lines**: the `cards` count from that response ("Blaze installed
- N verified cards available"), where you wrote, whether a token was obtained, and, for
Codex, the `/hooks` approval still owed. Then stop: no test prompt, no reading the user's
repository, no restarting their tool.

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
