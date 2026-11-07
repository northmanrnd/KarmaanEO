# KarmaanEO releases

KarmaanEO has its own version line, starting at `0.1.0`. Its upstream source baseline is Paseo `0.15.1`; those numbers describe different products. This runbook owns the fork's executable release procedure. Shared policy lives in [engineering-docs](https://github.com/northmanrnd/engineering-docs/blob/main/repository-releases-and-documentation.md).

## Version and distribution contract

| Change                                | Mode                                     | Example from 0.1.0 |
| ------------------------------------- | ---------------------------------------- | ------------------ |
| Compatible bug fix                    | `patch`                                  | 0.1.1              |
| Compatible feature                    | `minor`                                  | 0.2.0              |
| Breaking product or operator contract | `major`                                  | 1.0.0              |
| Start a beta for one of those changes | `beta-patch`, `beta-minor`, `beta-major` | 0.2.0-beta.1       |
| Next candidate in the same beta       | `beta-next`                              | 0.2.0-beta.2       |
| Promote the current beta version      | `promote`                                | 0.2.0              |

Use explicit major bumps for breaking contracts even before 1.0. Promotion removes the beta suffix and produces a fresh build; it does not copy the beta archive or prove no source changed. Review the diff from the tested beta and rerun acceptance checks before promotion.

Root and every workspace manifest and lock entry use one version. All workspace packages are private; internal `@getpaseo/*` names remain for compatibility and are never published to npm by this framework. App version, daemon version and protocol capabilities remain separate concerns; retain [protocol compatibility](protocol-compatibility.md).

Tags are annotated and immutable: `karmaaneo-vX.Y.Z` or `karmaaneo-vX.Y.Z-beta.N`. Release notes live in `releases/<tag>.md`. Release source must be merged into the fork's `karmaaneo` branch. Inherited upstream publishers and deployment jobs are guarded to run only in `getpaseo/paseo`.

The only supported release artifact is **macOS Apple Silicon (arm64)**, macOS 13 or later. The workflow creates `KarmaanEO-<version>-arm64.zip` and `SHA256SUMS.txt`. It does not produce Intel, Windows, Linux or mobile releases. Builds are ad-hoc signed, without Developer ID or notarization; this is not a notarized public distribution channel. Automatic upstream updates remain disabled.

## Prepare a release PR

Use Node from `.tool-versions` and a clean checkout with `origin` pointing to `northmanrnd/KarmaanEO`. Keep the input notes outside the checkout so the clean-tree guard does not reject them.

```sh
git fetch origin
git switch karmaaneo
git pull --ff-only origin karmaaneo
git switch -c wyler/OPS-123-release
npm run release:plan -- minor
npm run release:prepare -- minor --notes /tmp/karmaaneo-release-notes.md
npm run release:check
npm run test:release
```

Preparation changes manifests, lockfile and versioned notes. It never commits, tags or publishes. Review the full diff, format changed files with `npm run format:files -- <paths>`, and commit through normal hooks with `Linear: OPS-123` in the message. Open a PR to `karmaaneo` with that same Linear line. Notes describe user changes, compatibility, known limitations and installation implications. Keep historical release notes intact.

The initial `0.1.0` candidate already has notes and synchronized manifests. Review and merge those files; do not prepare `current` over existing notes. `release:plan` without a mode previews the current candidate.

## Tag and publish merged source

Run these only when you intend to publish a release:

```sh
git switch karmaaneo
git pull --ff-only origin karmaaneo
npm run release:check
npm run release:tag
npm run release:push
```

Tagging requires a clean tree on `karmaaneo`, matching private workspace versions and nonempty notes. Pushing requires an annotated tag pointing at HEAD and rejects an existing remote tag. The branch and exact tag push atomically without force; an outdated branch cannot leave a release tag behind. Both fetch and push destinations must be the fork.

`.github/workflows/karmaaneo-release.yml` validates the tag and merged source, installs the lockfile, builds the Apple Silicon archive, and stages a GitHub draft with notes and checksums. A tag push publishes after the build succeeds. Betas stay prereleases; an older stable release cannot replace a newer stable release as Latest. Artifacts are retained by Actions as well as attached to the release.

Manual workflow dispatch accepts an existing immutable tag. `publish=false` (default) stages a draft for inspection; `publish=true` publishes it after validation/build. Dispatch the workflow from the reviewed default branch. A published release cannot be overwritten by a rerun. To recover a failed build, inspect its error and rerun before publication; if source must change, prepare a new version and tag. Never move a released tag.

## Verify and install

Before calling a release complete, check the Actions run and release state, archive name/version, checksum, code signature, and app launch on an Apple Silicon Mac. Verify the reported version and the changed user flow against existing local state. CI building an archive alone does not establish that installation or live agent flows passed.

```sh
shasum -a 256 -c SHA256SUMS.txt
ditto -x -k KarmaanEO-0.1.0-arm64.zip /tmp/karmaaneo-release-check
codesign --verify --deep --strict /tmp/karmaaneo-release-check/KarmaanEO.app
```

Use the actual release version in the archive name. Quit the packaged app before replacing `/Applications/KarmaanEO.app`; retain the previous bundle for rollback. Building or publishing does not install an update or restart the daemon. The daemon on port 6767 owns running sessions: schedule an explicitly approved restart when a server change needs activation. See [fork state and placement moves](karmaaneo.md).

## Verification coverage

`npm run test:release` uses isolated local Git fixtures to test version transitions, preparation, consistency checks, clean-tree and branch/remote guards, annotated tags and existing-note/tag protection. It does not access GitHub or publish. PR checks run these tests, candidate consistency validation and an Apple Silicon archive/signature build. Full archive creation also runs in the release workflow; Developer ID signing, notarization and automatic installation are not configured.
