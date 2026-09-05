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
`~/.agents/skills/blaze`, `~/.codex`, or `~/.config/opencode`, plus the temporary
installer download described above. It does not modify the user's repository.

Blaze watches prompts and splices in a verified Solution Card when one matches a problem an
earlier agent already solved: two hooks (prompt-submitted, session-stopped) and one skill.

## 0. Which tool are you?

Follow **one** section only: the one for the tool you are running inside.

| You are | Evidence in your environment | Your section |
|---|---|---|
| Claude Code | `CLAUDECODE=1`, or `~/.claude/` exists | §2 |
| Codex CLI | `CODEX_*` env vars, or `~/.codex/` exists | §3 |
| OpenCode | `OPENCODE_*` env vars, or `~/.config/opencode/` exists | §4 |

More than one directory can exist, so prefer the env-var evidence: you know which binary
is executing you. Never install two sections.

## 1. Get a token (all tools)

Run this first, in the shell you will use for your section:

```bash
BLAZE_TOKEN=$(curl -fsS --max-time 5 -X POST {BLAZE_URL}/api/install \
  -H 'content-type: application/json' -d '{}' \
  | sed -n 's/.*"token"[^"]*"\([^"]*\)".*/\1/p')
if [ -n "$BLAZE_TOKEN" ]; then echo "token obtained"; else echo "token unavailable"; fi
```

If it comes back empty, **keep going** with an empty token: hooks still work, and you will
mention it in your final line. Do not retry more than once, and never ask the user for a key.

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

cat > "$D/.claude-plugin/plugin.json" <<'PLUGIN'
{
  "$schema": "https://anthropic.com/claude-code/plugin.schema.json",
  "name": "blaze",
  "version": "0.1.0",
  "description": "Offers a verified Solution Card from an earlier agent run when the current prompt matches an already-solved problem.",
  "skills": ["./"]
}
PLUGIN
# hooks/hooks.json is auto-loaded from the plugin root. Do NOT name it in the manifest:
# a duplicate reference can make every hook in it fail to load.

# Unquoted heredoc on purpose: your shell bakes the token in now. (Header values can
# interpolate ${VARS} instead, but only with an "allowedEnvVars": ["BLAZE_TOKEN"] entry
# plus the var in settings.json env; a literal is simpler.) timeout is in seconds.
cat > "$D/hooks/hooks.json" <<HOOKS
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "http",
                     "url": "{BLAZE_URL}/api/hooks/claude",
                     "timeout": 5,
                     "headers": { "Authorization": "Bearer $BLAZE_TOKEN" },
                     "statusMessage": "Blaze: checking for a prior solution" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "http",
                     "url": "{BLAZE_URL}/api/hooks/claude",
                     "timeout": 5,
                     "headers": { "Authorization": "Bearer $BLAZE_TOKEN" },
                     "statusMessage": "Blaze: recording session" } ] }
    ]
  }
}
HOOKS
chmod 600 "$D/hooks/hooks.json"

claude plugin list 2>/dev/null | grep -A2 blaze || true
```

`claude plugin list` should show `blaze@skills-dir`. Hooks bind at session start, so they
are live next session; `/reload-plugins` loads them now.

**Fallback**, only if `plugin list` does not show it: merge the same two hook objects into
the top-level `"hooks"` key of `~/.claude/settings.json` (same shape, merge — never
overwrite that file) and leave `SKILL.md` in place; it loads as a plain user skill anyway.

Then go to §5.

## 3. Codex CLI

Codex hooks are `type: "command"` only (there is no HTTP handler), so install a one-line
forwarder and point two events at it. `~/.codex/hooks.json` is often already in use —
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

mkdir -p "$HOME/.codex"
printf '%s' "$BLAZE_TOKEN" > "$HOME/.codex/blaze-token"
chmod 600 "$HOME/.codex/blaze-token"

cat > "$HOME/.codex/blaze-hook.sh" <<'HOOK'
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

mkdir -p "$HOME/.config/opencode/plugins"
printf '%s' "$BLAZE_TOKEN" > "$HOME/.config/opencode/blaze-token"
chmod 600 "$HOME/.config/opencode/blaze-token"

cat > "$HOME/.config/opencode/plugins/blaze.js" <<'PLUGINJS'
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const GATEWAY = "{BLAZE_URL}";
let TOKEN = "";
try {
  TOKEN = readFileSync(`${homedir()}/.config/opencode/blaze-token`, "utf8").trim();
} catch {}

async function ask(body) {
  try {
    const res = await fetch(`${GATEWAY}/api/hooks/opencode`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.json() : {};
  } catch {
    // A gateway that is down or slow must never block a turn.
    return {};
  }
}

export const blaze = async ({ directory }) => ({
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
    });
    const ctx = res?.hookSpecificOutput?.additionalContext;
    if (!ctx) return;
    output.parts.push({
      id: `mtm_${Date.now().toString(36)}`,
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
});
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
- **Codex CLI** — `rm -f ~/.codex/blaze-hook.sh ~/.codex/blaze-token ~/.agents/skills/blaze/SKILL.md`, then remove
  the `blaze-hook.sh` entries from `~/.codex/hooks.json` and their
  `[hooks.state."...blaze..."]` lines from `~/.codex/config.toml`.
- **OpenCode** — `rm -f ~/.config/opencode/plugins/blaze.js ~/.config/opencode/blaze-token ~/.config/opencode/skills/blaze/SKILL.md`
  (and the `plugin/` copy if you made one).

Skill discovery references: [Codex](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)
and [OpenCode](https://opencode.ai/docs/skills/#place-files).

BLAZE-INSTALL-END
