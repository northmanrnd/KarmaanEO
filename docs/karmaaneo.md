# KarmaanEO

KarmaanEO is a history-preserving fork of getpaseo/paseo. The default branch is `karmaaneo`; upstream `main` remains separate. The initial fork uses Paseo v0.15.1 (`c4dc362`) plus the original My Paseo commit (`a3107e6`). Newer upstream changes require an explicit integration and validation pass.

## Desktop identity and state

Product and executable: `KarmaanEO`. Bundle ID: `com.karmaan.karmaaneo`.
The internal app name remains Paseo to reuse existing preferences and chats. The `paseo` CLI, URL scheme, npm package scopes and `~/.paseo` state remain unchanged for compatibility. Run only one packaged app at a time. Development uses separate state and port 6768; the packaged app uses port 6767. See [development.md](development.md).

Automatic upstream app updates remain disabled so upstream releases cannot overwrite fork changes. Signing and notarization are not configured for KarmaanEO. Do not publish using inherited npm release scripts: they still refer to upstream package names.

## Validate and build

Use the Node version in `.tool-versions`, then:

```sh
npm ci --no-audit --no-fund
npm run test --workspace=@getpaseo/app -- src/assistant-file-links/parse.test.ts src/assistant-file-links/resolver.test.ts
node scripts/verify-local-markdown.cjs
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --dir --mac --arm64 --publish never -c.mac.identity=null
```

Output: `packages/desktop/release/mac-arm64/KarmaanEO.app`.
Quit the running packaged app before copying this bundle to `/Applications/KarmaanEO.app`. Retain the existing Paseo and My Paseo bundles for rollback. Building does not migrate or delete chat data.

## Repository and Linear workflow

Track work in the [KarmaanEO project](https://linear.app/karmaan/project/karmaaneo-15e9b8a2c1cb), Ops team. Assign issues to Wyler. Include the issue identifier in feature branch names and `Linear: OPS-123` in commit messages and PR bodies. Avoid automatic closing keywords; use In Review while review remains outstanding, and Done only after verification and merge.

The Linear GitHub App must have access to northmanrnd/KarmaanEO for automatic PR linking. A project resource link alone does not enable this integration.

```sh
git remote add upstream https://github.com/getpaseo/paseo.git # if missing
git fetch upstream
git switch -c wyler/OPS-123-description karmaaneo
# Integrate selected upstream changes or merge upstream/main, then validate.
git push -u origin HEAD
```

Preserve the upstream Apache-2.0 license and attribution. Keep fork-specific changes focused to simplify future upstream merges.
