# 🔥 Blaze

**Code 4× faster.** Shared, verified solutions for AI coding agents.

https://github.com/user-attachments/assets/8e25ff4c-5fe2-4c41-964e-66fcc3d074e5

*A condensed replay of recorded mind-map runs: Claude Code versus Claude Code + Blaze.
Timers show the original run durations.*

Blaze is **smart caching for LLM subtasks, built to save users' time**. When an agent
starts a task, Blaze checks whether an earlier verified solution fits the same problem
and stack. It returns the trap, the procedure, and the check that proved the fix worked.
Your agent decides whether to reuse it and verifies the result in your codebase.

Like a file-sharing network where one seeder supplies a useful chunk to many peers,
one solved subtask can help many agents. Blaze currently delivers those reusable lessons
through a hosted gateway. Exact cached artifacts can preserve bytes; selecting lessons
from a session is semantic distillation, **not lossless compression**.

The installed client measures request-to-reply time and lets the agent report whether the
solution worked. Every task ends with the original solve time, retrieval time, and time
saved — with unavailable measurements shown as unknown and prior-run savings labeled
estimated. A slower result remains visible. This feedback is a foundation for improving
retrieval; it is not proof that automatic learning or a particular speedup has occurred.

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
hooks (prompt-submitted, session-stopped), one skill and its small dependency-free client,
and reports back. Node.js 20 or newer is required. Everything it
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
plugins/claude-code/               .claude-plugin/plugin.json, hooks/hooks.json (type: command), blaze-client.mjs, skills/blaze/SKILL.md
plugins/client/                    shared timing/receipt/outcome helper
plugins/codex/                     hooks.json (type: command) + blaze-hook.sh — Codex has no HTTP hook
plugins/opencode/                  blaze.js — chat.message splices the offer, session.idle closes the session

packages/cards/                    @blaze/cards — the only workspace package
  schema.json                      the Solution Card contract, JSON Schema 2020-12
  src/index.ts                     the schema as data, the `Card` type, and a schema↔type drift guard
  validate.ts                      dependency-free validator + the canonical card renderer
  examples/                        two example cards, enough to exercise the validator
```

The private Blaze repo consumes this repository as the `skill/` submodule, and picks
`@blaze/cards` up through a `skill/packages/*` entry in its workspaces — so the schema
resolves locally, with no publish round-trip.

`{BLAZE_URL}` appears as a literal placeholder throughout `install.md`, `llms.txt` and the
plugin files. The gateway substitutes the origin the reader actually fetched from, so the
same file is correct on localhost, on a preview deployment and in production. Do not
hard-code a host in its place.

The Codex forwarder and OpenCode module match the blocks `install.md` writes inline.
Claude Code uses the same hook events with a manifest adapted to the installed directory
and a private token file written at install time. The installer downloads the helper
from the same hosted origin; no checkout or extra package installation is needed.

## ⏱️ What the terminal reports

```text
Blaze · original solve unknown · retrieval 0.28s · time saved unknown
```

Original time requires verified provenance and a compatible task/environment. The client
measures the full reply, including network and parsing. Savings compare compatible task
intervals, including verification when both runs used that boundary. No memory reused
means zero credited savings; missing evidence stays unknown. Read the [skill](./skill.md)
for the exact outcome protocol, timing rules, and data boundaries.

## 👤 Optional account

Blaze works without human signup. [Create an account](https://blaze.pascal.app/signup)
to manage your installations and view your usage on [your account page](https://blaze.pascal.app/account).
The installed helper's explicit `claim --tool <tool>` command returns a temporary
link and code to connect an installation. The same helper can submit a minimized
solution file, read its status, or delete it; see the [contribution instructions](./skill.md#explicit-solution-contributions).
Contributions are private by default, and public sharing requires explicit authorization
and trusted evaluation. No transcript is uploaded automatically.

## Contributing and releases

See [CONTRIBUTING.md](./CONTRIBUTING.md) for a standalone checkout, `bun run check`,
the public/private boundary, and versioned GitHub release archives. This repository's
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
