import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));
const install = read("install.md");

function inlineBlock(marker: string): string {
  const match = install.match(new RegExp(`<<'?${marker}'?\\n([\\s\\S]*?)\\n${marker}\\n`));
  assert.ok(match, `install.md must contain the ${marker} heredoc`);
  return `${match[1]}\n`;
}

assert.equal(read("plugins/codex/blaze-hook.sh"), inlineBlock("HOOK"), "Codex forwarder drift");
assert.equal(read("plugins/opencode/blaze.js"), inlineBlock("PLUGINJS"), "OpenCode module drift");
assert.equal(read("plugins/claude-code/skills/blaze/SKILL.md"), read("skill.md"), "Skill copy drift");
assert.equal(read("plugins/claude-code/blaze-client.mjs"), read("plugins/client/blaze-client.mjs"), "Client copy drift");
assert.equal((install.match(/\{BLAZE_URL\}\/blaze-client\.mjs/g) ?? []).length, 3, "Every tool must install the client");
assert.equal(install.trimEnd().split("\n").at(-1), "BLAZE-INSTALL-END", "Installer end marker missing");

const marketplace = json(".claude-plugin/marketplace.json");
const plugin = json("plugins/claude-code/.claude-plugin/plugin.json");
const installedPlugin = JSON.parse(inlineBlock("PLUGIN"));
const claudeHooks = json("plugins/claude-code/hooks/hooks.json").hooks;
const installedHooks = JSON.parse(inlineBlock("HOOKS")).hooks;
const codexHooks = json("plugins/codex/hooks.json").hooks;
const events = ["Stop", "UserPromptSubmit"];

assert.equal(marketplace.name, "blaze");
assert.equal(marketplace.plugins.length, 1);
assert.equal(marketplace.plugins[0].source, "./plugins/claude-code");
assert.equal(plugin.name, "blaze");
assert.equal(installedPlugin.name, plugin.name);
assert.equal(installedPlugin.version, plugin.version, "Installed plugin version drift");
assert.equal(marketplace.metadata.version, plugin.version, "Marketplace version drift");
assert.equal(marketplace.plugins[0].version, plugin.version, "Marketplace entry version drift");
assert.deepEqual(Object.keys(claudeHooks).sort(), events);
assert.deepEqual(Object.keys(installedHooks).sort(), events);
assert.deepEqual(Object.keys(codexHooks).sort(), events);
for (const event of events) {
  const template = claudeHooks[event][0].hooks[0];
  const installed = installedHooks[event][0].hooks[0];
  assert.deepEqual(installed, template, `${event} Claude hook drift`);
  assert.equal(template.type, "command");
  assert.equal(template.command, 'node "${CLAUDE_PLUGIN_ROOT}/blaze-client.mjs" hook --tool claude');
  assert.equal(codexHooks[event][0].hooks[0].command, "~/.codex/blaze-hook.sh");
  assert.equal(codexHooks[event][0].hooks[0].timeout, 5);
}

const syntax = Bun.spawnSync(["bash", "-n", resolve(root, "plugins/codex/blaze-hook.sh")]);
assert.equal(syntax.exitCode, 0, "Codex forwarder must be valid Bash");
// Parsing only: never import the plugin or run installer commands during checks.
new Bun.Transpiler({ loader: "js" }).transformSync(read("plugins/opencode/blaze.js"));
new Bun.Transpiler({ loader: "js" }).transformSync(read("plugins/client/blaze-client.mjs"));
console.log("Installer blocks, plugin metadata, hook events, and script syntax agree.");
