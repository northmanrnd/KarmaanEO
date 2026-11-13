# KarmaanEO

KarmaanEO is a history-preserving fork of getpaseo/paseo. The default branch is `karmaaneo`; upstream `main` remains separate. The initial fork uses Paseo v0.15.1 (`c4dc362`) plus the original My Paseo commit (`a3107e6`). Newer upstream changes require an explicit integration and validation pass.

## Desktop identity and state

Product and executable: `KarmaanEO`. Bundle ID: `com.karmaan.karmaaneo`.
The runtime app/window name is KarmaanEO. Its Electron profile stays in the existing `Paseo` application-support directory to retain preferences, browser state and the single-instance lock. The `paseo` CLI, URL scheme, npm package scopes and `~/.paseo` state remain unchanged for compatibility. Run only one packaged app at a time. Development uses separate state and port 6768; the packaged app uses port 6767. See [development.md](development.md).

Automatic upstream app updates remain disabled so upstream releases cannot overwrite fork changes. KarmaanEO versions start at `0.1.0`, independently of upstream. Releases target macOS Apple Silicon only; see the [release runbook](release.md) for versioning, beta promotion, immutable tags and release notes. All workspace packages are private.

## Validate and build

Use the Node version in `.tool-versions`, then:

```sh
npm ci --no-audit --no-fund
npm run test --workspace=@getpaseo/app -- src/assistant-file-links/parse.test.ts src/assistant-file-links/resolver.test.ts
node scripts/verify-local-markdown.cjs
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --dir --mac --arm64 --publish never -c.mac.identity=-
```

Output: `packages/desktop/release/mac-arm64/KarmaanEO.app`. Local ad-hoc builds disable hardened runtime: enabling it without a Developer ID Team ID prevents Electron’s framework from loading, even when signature verification passes. Verify native startup with `ELECTRON_RUN_AS_NODE=1 packages/desktop/release/mac-arm64/KarmaanEO.app/Contents/MacOS/KarmaanEO -e 'console.log(process.versions.electron)'` before installation.
Quit the running packaged app before copying this bundle to `/Applications/KarmaanEO.app`. Keep backups outside `/Applications`; a second app bundle with the same identity causes confusing launch targets. Building does not migrate or delete chat data.

## Composer drops

Finder drops into a chat on the built-in local daemon attach non-image files and folders by their absolute paths. The agent reads the original files in place; keep them at that location until the agent has used them. Local ZIPs bypass the upload size limit. Raster images retain the image attachment flow. Browser-only and remote-host file drops upload their bytes with the existing 50 MB limit. Upload errors remain visible beneath the composer; correct the input and drop it again to retry. Remote folders must be zipped before uploading.

## Placement moves

Requires a host advertising `placementMoves`; older hosts are rejected before sending a mutation.

```sh
paseo workspace move <workspace-id> --project <project-id> --json
paseo agent move <agent-id> --workspace <workspace-id> --json
```

Use exact IDs from `project ls`, `workspace ls` and `agent ls`. A workspace move changes its project grouping while retaining its directory. Worktree project moves are rejected. Agent moves retain the provider process, transcript and directory. Wait for the current turn to finish; attached parent/child families must be detached before moving. Archived or missing destinations are rejected. Repeating an agent move to the same destination is a no-op.

Updating the desktop bundle alone cannot add these server APIs to an already-running daemon. Activate the new daemon only during an approved restart; do not edit live registry files or restart port 6767 to apply a reorganization.

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

## Message attachments and link preferences

Branch drafts retain original image and structured attachment payloads available in the source chat's loaded history, up to the selected turn. Relative workspace file references resolve against the source agent directory before branching into another workspace. Provider transcripts often contain only rendered text: attachments absent from retained client history cannot be reconstructed. This includes unacknowledged prompts that the harness never recorded before a failed turn and that were discarded on reload. Local references continue to point to the original files, not a snapshot.

Returning to a message restores its available attachments into editable composer pills after the provider successfully rewinds the conversation. Existing draft text and attachments are preserved. Remove a pill to omit it, or use the normal picker/drop flow to add a replacement. Files-only rewind does not change the composer. Missing stored image bytes produce an error before rewind; sending also fails rather than silently omitting an image. Provider rewind capabilities remain authoritative; no native transcript is edited in place.

Settings → General → Open links in selects the built-in browser or the default OS browser for ordinary chat and document HTTP(S) links. This preference persists independently of script service URL choices. Where an in-app workspace browser is unavailable, links use the OS browser. Explicitly external actions keep their original destination. Copy file path on file tabs resolves relative paths against that workspace's directory.
