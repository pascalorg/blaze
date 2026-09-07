import json, os, pathlib, shlex
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

p = pathlib.Path(os.path.expanduser("~/.codex/hooks.json"))
check_path(p)
original = p.read_bytes() if p.exists() else None
cfg = json.loads(original) if original is not None else {}
hooks = cfg.setdefault("hooks", {})
script = os.path.expanduser("~/.codex/blaze-hook.sh")
cmd = shlex.quote(script)
owned_commands = {cmd, script, "~/.codex/blaze-hook.sh", '"' + script + '"', "'" + script + "'"}
for ev in ("UserPromptSubmit",):
    groups = hooks.setdefault(ev, [])
    existing = [h for g in groups for h in g.get("hooks", [])
                if h.get("type") == "command" and h.get("command") in owned_commands]
    if existing:
        for hook in existing: hook["command"] = cmd
    else:
        groups.append({"hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
# Remove only Blaze's obsolete Stop entry from earlier installations.
if "Stop" in hooks:
    kept = []
    for group in hooks["Stop"]:
        entries = [h for h in group.get("hooks", []) if not (h.get("type") == "command" and h.get("command") in owned_commands)]
        if entries:
            kept.append({**group, "hooks": entries})
    if kept:
        hooks["Stop"] = kept
    else:
        hooks.pop("Stop")
write_settings(p, cfg, original)
print("hooks.json updated:", sorted(hooks))
