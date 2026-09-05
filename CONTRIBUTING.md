# Contributing to Blaze

This repository contains the public installer, skill, hook templates, and Solution Card
contract. It works as a standalone checkout; the hosted application consumes the same
repository as its `skill/` Git submodule.

## Local checks

Install Bun 1.4.0 (also pinned in `package.json`), then:

```bash
git clone https://github.com/pascalorg/blaze-skill.git
cd blaze-skill
bun install --frozen-lockfile
bun run check
```

No application credentials, database, or running gateway are needed. The checks validate
the two example cards, typecheck the card package, and compare installer blocks with the
plugin files. They parse scripts without installing hooks or contacting the gateway.

Keep the Codex and OpenCode inline blocks in `install.md` identical to their files under
`plugins/`. Keep `skill.md` identical to `plugins/claude-code/skills/blaze/SKILL.md`.
Claude Code's installed manifest differs from its repository manifest because their
directory layouts differ; hook settings and version numbers must still agree.
Preserve `{BLAZE_URL}` placeholders and the final `BLAZE-INSTALL-END` marker.

## Public boundary

Contributions here may include generic examples, schemas, validators, plugin code, and
documentation. Application authentication, database schemas and migrations, deployment
configuration, the private card corpus, distillation code, real session transcripts,
benchmark runs, and credentials belong in the private parent repository. Use synthetic
examples when demonstrating a bug, and inspect `git diff --cached` before committing.

The package at the root is marked `private` to prevent accidental npm publication.
That flag does not control this GitHub repository's visibility. The release process
below publishes a GitHub source archive only.

## Working from the private parent

Make public changes inside `skill/` on a branch in this repository. Commit and push the
public change first. Then update and commit the `skill/` submodule pointer in the private
parent. The parent must always point to a commit available from the public remote.
Review the two repositories' diffs separately.

A fresh private checkout uses `git clone --recurse-submodules <private-repository-url>`.
For an existing checkout, use `git submodule update --init --recursive`. Validate the
public checkout with the commands above before running the private application's checks.

## Release a skill archive

1. Update the plugin version in `plugins/claude-code/.claude-plugin/plugin.json`, both
   version fields in `.claude-plugin/marketplace.json`, and the inline `PLUGIN` manifest
   in `install.md`. The card package has its own version; update it when its API changes.
2. Run `bun install --frozen-lockfile` and `bun run check`, then review and merge the
   public changes to `main`.
3. Create and push an annotated version tag at the reviewed commit:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -a v0.1.0 -m "Blaze v0.1.0"
   git push origin v0.1.0
   ```

   Substitute the version being released. The **Release skill archive** workflow
   checks the tagged commit and creates a GitHub release with
   `blaze-skill-v0.1.0.tar.gz` and `SHA256SUMS`. To run it manually, select the workflow
   on the default branch and supply an existing version tag. A tag must match the
   plugin version; the workflow never creates or moves tags, and an existing release
   causes publication to fail rather than overwrite its assets.

The archive contains only Git-tracked files from the tagged public tree, with a
`blaze-skill/` top-level directory. Download both assets into one directory and verify
with `shasum -a 256 -c SHA256SUMS` (or `sha256sum -c SHA256SUMS` on Linux).
The archive retains template placeholders; it does not mint a token or install hooks.
Releases do not publish to npm or deploy the hosted app. The private parent can adopt
the released commit by updating its submodule pointer through its own review process.
