# Contributing to Blaze

This repository contains the installer, skill, hook templates, and Solution Card
contract. It works as a standalone checkout.

## Local checks

Install Bun 1.4.0 (also pinned in `package.json`), then:

```bash
git clone https://github.com/pascalorg/blaze.git
cd blaze
bun install --frozen-lockfile
bun run check
```

No application credentials, database, or running gateway are needed. The checks validate
the two example cards, typecheck the card package, and compare release metadata and
self-contained plugin copies. Client tests use a synthetic localhost server and temporary home directory;
they never install real hooks or contact the hosted gateway.

Keep `skill.md` identical to `plugins/claude-code/skills/blaze/SKILL.md`.
Keep `plugins/client/blaze-client.mjs` identical to both copies under
`plugins/claude-code/`: the plugin-root hook helper and the helper beside its skill.
Keep the client contract and version, `release.json`, plugin metadata and install title
in agreement. Credentials and receipts must stay outside every distributable directory.
Preserve `{BLAZE_URL}` placeholders and the final `BLAZE-INSTALL-END` marker.

## Public boundary

Contributions here may include generic examples, schemas, validators, plugin code, and
documentation. Do not commit service credentials, operational configuration, card
contents, real prompts, source excerpts, paths, logs, transcripts, personal data, or
benchmark inputs. Use synthetic examples when demonstrating a bug, and inspect
`git diff --cached` before committing.

The package at the root is marked `private` to prevent accidental npm publication.
That flag does not control this GitHub repository's visibility. The release process
below publishes a GitHub source archive only.

## Release a skill archive

1. Update `release.json`, the skill's string version metadata, the client's version,
   the install title, and all plugin version fields. Update the release timestamps.
   Preserve supported legacy client contracts unless a deliberate retirement is
   documented. Sync the skill and helper copies. The card package has its own version.
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
Releases do not publish to npm or deploy the hosted app.

Hosted release metadata is a snapshot of this public commit and the exact skill/helper
bytes. Published versions cannot silently change their bytes. The hosted build verifies
its pinned release; local edited trees produce a draft accepted only on loopback origins.
Digests from the same HTTPS origin detect corruption and mixed downloads, not a
compromised publisher. Manager-owned installations retain their manager's trust boundary.

Activation journals from 0.4.2 record the service origin before swapping files.
Earlier update journals can recover through their prior ownership record. An older
first-install journal with neither an origin nor a prior record is preserved for
operator recovery; the current caller must not assign it a new origin.
