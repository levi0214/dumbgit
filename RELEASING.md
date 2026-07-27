# Releasing dumbgit

Release versions come from Git tags, not `package.json`. The release workflow
builds standalone macOS binaries for Apple Silicon and Intel and publishes the
same version to npm.

## Historical tags

Tags and GitHub Releases are deliberately separate:

- Add annotated tags to older commits to record project milestones.
- Push those tags normally.
- Do not publish GitHub Releases for historical tags unless that commit contains
  the binary release tooling and is intended to be installable.

Only publishing a GitHub Release starts the binary build. Adding or pushing a
tag by itself does not.

## One-time npm setup

The `dumbgit` package name must belong to the maintainer's npm account. Add an
npm automation token to the GitHub repository as the `NPM_TOKEN` Actions
secret before publishing the first release.

## Publish a release

1. Make sure CI passes on the commit to release.
2. Create and push an annotated semantic-version tag:

   ```bash
   git tag -a v0.1.0 -m "dumbgit v0.1.0"
   git push origin v0.1.0
   ```

3. On GitHub, create a Release for that existing tag and publish it.
4. Wait for the **Release** workflow to finish.
5. Confirm that npm has the same version and the GitHub Release contains:

   ```text
   dumbgit-darwin-arm64.tar.gz
   dumbgit-darwin-x64.tar.gz
   checksums.txt
   ```

The workflow takes the displayed `dg --version` value from the tag. GitHub
prereleases get binary archives but are not published to npm or selected by the
default installer.

## Test release artifacts locally

```bash
scripts/build-release.sh v0.10.0
scripts/build-npm-package.sh v0.10.0
```

Binary archives are written to `dist/release`, and the npm tarball is written
to `dist/npm`. The binary build cross-compiles both macOS architectures using
the installed Bun version.

Install a specific published version with:

```bash
curl -fsSL https://raw.githubusercontent.com/levi0214/dumbgit/main/install.sh \
  | DUMBGIT_VERSION=v0.10.0 sh
```
