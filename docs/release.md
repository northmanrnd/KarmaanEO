# KarmaanEO versioning and release tags

KarmaanEO has its own version line, starting at `0.1.0`. Its source baseline is Paseo `0.15.1`; those describe different products. This framework manages versions, notes, immutable Git tags and GitHub release entries. It does not build, package, sign, install or deploy an app. KarmaanEO's supported desktop scope is macOS Apple Silicon.

Shared policy: [repository releases and documentation](https://github.com/northmanrnd/engineering-docs/blob/main/repository-releases-and-documentation.md).

## Choose a version

| Change                                | Mode                                     | Example from 0.1.0 |
| ------------------------------------- | ---------------------------------------- | ------------------ |
| Compatible correction                 | `patch`                                  | 0.1.1              |
| Compatible capability                 | `minor`                                  | 0.2.0              |
| Breaking product or operator contract | `major`                                  | 1.0.0              |
| Start a beta                          | `beta-patch`, `beta-minor`, `beta-major` | 0.2.0-beta.1       |
| Next beta candidate                   | `beta-next`                              | 0.2.0-beta.2       |
| Promote the current beta              | `promote`                                | 0.2.0              |

Use explicit major bumps for breaking contracts even before 1.0. Promotion removes the beta suffix; review changes since the tested beta before calling it stable.

Root and workspace manifests and lock entries share one product version. All workspace packages remain private; retained `@getpaseo/*` names are not published to npm. Plugin `requirements.paseo` checks use a separate validated upstream API baseline (`PASEO_PLUGIN_API_VERSION`), currently `0.15.1`. Advance that only after integrating the upstream API. Product bumps do not change protocol or plugin compatibility. See [protocol compatibility](protocol-compatibility.md).

## Prepare and review

Use Node from `.tool-versions`, a clean tree and the fork's `origin`. Keep input notes outside the checkout so they do not trip the untracked-file guard.

```sh
git switch karmaaneo
git pull --ff-only origin karmaaneo
git switch -c wyler/OPS-123-release
npm run release:plan -- minor
npm run release:prepare -- minor --notes /tmp/karmaaneo-notes.md
npm run release:check
npm run test:release
```

Preparation updates versions, lockfile and `releases/karmaaneo-v<version>.md`. It never commits, tags or publishes. Notes describe user changes, compatibility and limitations. Review the diff, format changed files with `npm run format:files -- <paths>`, commit through normal hooks and open a PR to `karmaaneo`. Include `Linear: OPS-123` in commit messages and the PR body.

The initial `0.1.0` candidate already has notes. Merge those files rather than preparing `current` over them. `release:plan` without a mode previews the current candidate. Preserve historical release notes.

## Tag and publish notes

After the version PR is merged, run these when you intend to publish:

```sh
git switch karmaaneo
git pull --ff-only origin karmaaneo
npm run release:check
npm run release:tag
npm run release:push
```

Tags are annotated and immutable: `karmaaneo-vX.Y.Z` or `karmaaneo-vX.Y.Z-beta.N`. Commands refuse dirty source, version/lock mismatches, wrong branches, wrong fetch or push destinations, empty notes and existing tags. The tag must point at HEAD. Branch and tag push atomically without force.

The small tag workflow checks metadata and runs the built-in Node release tests without installing dependencies. It stages a GitHub draft from the checked-in notes and publishes it after validation. Betas remain prereleases; publishing an older stable version cannot move Latest backward. No packaging or broad test suite runs in this workflow.

Manual dispatch accepts an existing immutable tag; `publish=false` stages a draft, while `publish=true` publishes it. Use the reviewed default branch for dispatch. Published entries cannot be overwritten by a rerun. If source changes, use a new version and tag.

## Verify and recover

Check the exact tag's commit, synchronized versions, notes and GitHub release state. `npm run test:release` uses isolated local Git fixtures and takes seconds; it covers transitions, consistency, destination/branch/clean-tree guards, annotated tags, collisions and Latest selection. Local lint/typechecks remain the normal repo checks. The existing broad CI is not expanded by this framework.

A release entry is a source/version record. If you separately need a local Apple Silicon build, follow [fork build and installation](karmaaneo.md); it is not required to create a release tag. Packaging, signing/notarization, automatic updates and deployment are separate work. Never restart the live daemon on port 6767 to manage a release tag.
