import json, pathlib, shlex, os
import stat, secrets

def check_path(path):
    home = pathlib.Path.home()
    current = home
    for part in path.relative_to(home).parts:
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid():
            raise SystemExit("Blaze hook settings require owned paths without symbolic links.")
    if path.exists() and (not path.is_file() or path.stat().st_size > 262144):
        raise SystemExit("Blaze hook settings must be a bounded regular file.")

def write_settings(path, cfg, original):
    check_path(path)
    if (path.read_bytes() if path.exists() else None) != original:
        raise SystemExit("Hook settings changed; retry after the other writer finishes.")
    temporary = path.with_name(path.name + ".blaze-" + secrets.token_hex(8))
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(json.dumps(cfg, indent=2) + "\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists(): temporary.unlink()

root = pathlib.Path.home() / ".claude" / "skills" / "blaze"
helper = root / "blaze-client.mjs"
if not helper.is_file():
    raise SystemExit("Blaze client is missing; complete the installation before merging fallback hooks.")
source = {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": 'node "${CLAUDE_PLUGIN_ROOT}/blaze-client.mjs" hook --tool claude', "timeout": 5}]}]}
settings = pathlib.Path.home() / ".claude" / "settings.json"
check_path(helper)
check_path(settings)
original = settings.read_bytes() if settings.exists() else None
cfg = json.loads(original) if original is not None else {}
hooks = cfg.setdefault("hooks", {})
command = "node " + shlex.quote(str(helper)) + " hook --tool claude"
owned_commands = {command, "node '" + str(helper) + "' hook --tool claude",
                  'node "' + str(helper) + '" hook --tool claude',
                  source["UserPromptSubmit"][0]["hooks"][0]["command"]}
for event in ("UserPromptSubmit",):
    template = source[event][0]["hooks"][0]
    groups = hooks.setdefault(event, [])
    existing = [h for g in groups for h in g.get("hooks", [])
                if h.get("type") == "command" and h.get("command") in owned_commands]
    if existing:
        for hook in existing:
            hook["command"] = command
    else:
        groups.append({"hooks": [{**template, "command": command}]})
# Remove the obsolete Blaze Stop hook from older installs without touching other hooks.
if "Stop" in hooks:
    kept = []
    for group in hooks["Stop"]:
        entries = [h for h in group.get("hooks", [])
                   if not (h.get("type") == "command" and
                           h.get("command") in owned_commands)]
        if entries:
            kept.append({**group, "hooks": entries})
    if kept:
        hooks["Stop"] = kept
    else:
        hooks.pop("Stop")
write_settings(settings, cfg, original)
print("Blaze fallback hooks merged; the installed skill remains in place.")
