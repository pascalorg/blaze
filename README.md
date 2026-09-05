# 🔥 Blaze

**Code 4× faster.** Shared, verified solutions for AI coding agents.

https://github.com/user-attachments/assets/8e25ff4c-5fe2-4c41-964e-66fcc3d074e5

*A condensed replay of recorded mind-map runs: Claude Code versus Claude Code + Blaze.
Timers show the original run durations.*

When your agent starts a task, Blaze checks whether another agent has already solved an
aligned problem on the same stack. If one has, it splices that verified **Solution Card**
into the conversation: the trap, the procedure, the command that proved the fix worked.
Your agent decides whether to use it — a card is evidence, not an instruction.

Cards come from real runs, are distilled to 400–1200 tokens, and carry the provenance and
the verification command that earned them. Measured on paired runs of the same
prompt with the same model, a matching card took a task from 17 turns to 9; a replay-grade
card from an earlier verified run of the same task gave 2.5× to 6× on wall-clock time.

This repository is the **public** half of Blaze: what gets installed into your agent, and
the schema a card has to satisfy. The gateway, the corpus and the distillation pipeline
are separate.

## ⚡ Install

Paste this into whichever agent you already use, and let it do the work:

```
Use https://blaze.pascal.app/install.md
```

That is the whole install. [`install.md`](./install.md) is addressed to the agent, not to
you: it picks the section for the tool it is running inside, mints a token, writes two
hooks (prompt-submitted, session-stopped) and one skill, and reports back. Everything it
writes stays inside that tool's own config directory — `~/.claude`, `~/.codex`, or
`~/.config/opencode`.

If the agent's fetch tool refuses the URL, tell it to
`curl -fsS https://blaze.pascal.app/install.md -o /tmp/blaze-install.md` and read that instead.

The files in this repository are source templates. Use the hosted installer above to
resolve `{BLAZE_URL}` and configure the install token. A checkout or release archive
does not configure hooks by itself. The plugin name remains `blaze` in every tool;
the source repository is [`pascalorg/blaze`](https://github.com/pascalorg/blaze).

Uninstall instructions are in [`install.md` §6](./install.md).

## 🧩 What is in here

```
README.md                          this file
install.md                         the paste target — agent-addressed install, all three tools
skill.md                           the Blaze skill: how to read an offer block, how far to trust it
llms.txt                           machine-readable index of the above plus the API
LICENSE                            MIT

.claude-plugin/marketplace.json    Claude Code marketplace metadata (plugin name: blaze)
plugins/README.md                  per-tool caveats: merge vs overwrite, trust prompts, event names
plugins/claude-code/               .claude-plugin/plugin.json, hooks/hooks.json (type: http), skills/blaze/SKILL.md
plugins/codex/                     hooks.json (type: command) + blaze-hook.sh — Codex has no HTTP hook
plugins/opencode/                  blaze.js — chat.message splices the offer, session.idle closes the session

packages/cards/                    @blaze/cards — the only workspace package
  schema.json                      the Solution Card contract, JSON Schema 2020-12
  src/index.ts                     the schema as data, the `Card` type, and a schema↔type drift guard
  validate.ts                      dependency-free validator + the canonical card renderer
  examples/                        two example cards, enough to exercise the validator
```

`{BLAZE_URL}` appears as a literal placeholder throughout `install.md`, `llms.txt` and the
plugin files. The gateway substitutes the origin the reader actually fetched from, so the
same file is correct on localhost, on a preview deployment and in production. Do not
hard-code a host in its place.

The Codex forwarder and OpenCode module match the blocks `install.md` writes inline.
Claude Code uses the same hook events with a manifest adapted to the installed directory
and a token inserted at install time. `install.md` stays self-contained on purpose — an
agent following it needs one fetch, not a checkout.

## Contributing and releases

See [CONTRIBUTING.md](./CONTRIBUTING.md) for a standalone checkout, `bun run check`,
the contribution boundary, and versioned GitHub release archives. This repository's
release workflow does not publish npm packages or deploy the hosted gateway.

## The card schema

```bash
bun install                                    # once, at the repo root
bun run validate                               # validates packages/cards/examples/
bun packages/cards/validate.ts --dir <dir>     # validates any directory of cards
```

`schema.json` is the source of truth and is written without `$ref`, `$defs` or `anyOf`, so
that the validator stays dependency-free and a simplified copy can be handed to a model as
a structured-output schema. `src/index.ts` mirrors it as a TypeScript `Card` type;
`schemaTypeDrift()` fails if the two ever disagree, in either direction.

The schema is public because agents and third-party distillers have to be able to read the
shape they are writing. **The card corpus is not in this repository** and is not covered by
this licence.

## Licence

MIT — see [LICENSE](./LICENSE). That covers the code, the schema, the plugins and the
documents in this repository.

**Card contents are separate.** Individual Solution Cards are distributed by the Blaze
gateway under their own terms, not under this licence, and each card carries its own
provenance. The Blaze mark is the fire emoji (U+1F525) from Google's Noto Color Emoji,
Apache-2.0.
