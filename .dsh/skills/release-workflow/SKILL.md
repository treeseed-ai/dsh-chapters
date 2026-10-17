# dsh-chapters Release Workflow

This skill defines the mandatory Git/GitHub development and release workflow for the dsh-chapters project. Follow these rules in every session. They are non-negotiable unless explicitly overridden by the project maintainer.

## Branch Model

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production. Tags and releases are cut ONLY from main. | All merges require a PR from staging with green CI. |
| `staging` | Integration branch. All feature work lands here first. | Never behind main except during hotfix windows. |
| `feature/*`, `fix/*` | Feature or bugfix branches, created FROM staging. | Merged back to staging via PR. |
| `hotfix/*` | Emergency fixes, created FROM main. | Bypasses staging when speed is critical. |

## The Golden Rules

1. **All merges to main go through staging.** No direct commits or feature-branch merges to main.
2. **Tags and releases are cut from main only.** Never tag staging or a feature branch.
3. **All CI must be green before merging to main.** The release workflow (npm publish) is triggered by pushing a tag on main; if CI isn't green, don't tag.
4. **Staging is never behind main** except during a hotfix window. After a hotfix merges to main, the next release candidate PR must merge main back into staging to catch up.
5. **Every feature/fix branch tracks a GitHub Issue.** Either adopt an existing issue or create one before starting work. Reference it in the branch name and PR.
6. **Merge staging INTO your feature branch before merging TO staging.** Resolve conflicts on the feature branch, not on staging.

## Feature/Fix Workflow

```
1. Create or adopt a GitHub Issue
   gh issue create --title "..." --body "..." --label "enhancement"
   # or: gh issue list --state open  (find existing)

2. Branch from staging
   git checkout staging && git pull origin staging
   git checkout -b feature/<issue-number>-short-description

3. Work, commit, push
   git add ... && git commit -m "feat: description (#<issue>)"
   git push origin feature/<issue-number>-short-description

4. Before opening PR: sync staging in
   git fetch origin staging
   git merge origin/staging
   # Resolve conflicts if any, then:
   git push origin feature/<issue-number>-short-description

5. Open PR targeting staging
   gh pr create --base staging --title "feat: description (#<issue>)" \
     --body "Closes #<issue>. ..."

6. Wait for CI green, address review, merge to staging
   gh pr merge <number> --squash   # after approval + green CI
```

## Release Candidate Workflow (staging → main)

When staging is ready for release:

```
1. Open a release candidate PR from staging to main
   gh pr create --base main --head staging \
     --title "Release candidate: v0.X.Y" \
     --body "## Changes since last release\n..."

2. ALL CI must pass on this PR. No exceptions for normal releases.
   gh pr checks <number> --watch

3. After green CI + review approval, merge to main
   gh pr merge <number> --merge   # use merge commit, not squash, for RCs

4. Bump version in package.json, commit, push
   # Edit package.json version field
   git add package.json && git commit -m "v0.X.Y"
   git push origin main

5. Tag and push — this triggers the release workflow
   git tag -a v0.X.Y -m "v0.X.Y — summary of changes"
   git push origin main --tags

6. Verify the release succeeded
   gh run list --workflow=Release --limit 1
   gh release view v0.X.Y
```

## Hotfix Workflow (Emergency Only)

Hotfixes bypass staging when waiting for full CI would cause unacceptable delay.

```
1. Branch from main
   git checkout main && git pull origin main
   git checkout -b hotfix/<issue-number>-short-description

2. Fix, commit, push
   git add ... && git commit -m "fix: urgent description (#<issue>)"
   git push origin hotfix/<issue-number>-short-description

3. Open PR targeting main (NOT staging)
   gh pr create --base main --title "HOTFIX: description (#<issue>)" \
     --body "⚠️ Emergency hotfix bypassing staging.\n\nCloses #<issue>."

4. Run ONLY the deterministic suite (fast gate), not full e2e
   # The CI workflow runs this automatically on PRs to main.
   # If you need to verify locally: npm test && npm run typecheck

5. Merge to main after fast-gate green + maintainer approval
   gh pr merge <number> --merge

6. Tag and release as normal (steps 4-6 of Release Candidate above)

7. AFTER the hotfix is on main: sync staging
   git checkout staging && git pull origin staging
   git merge origin/main
   git push origin staging
   # This ensures staging catches up and the next RC includes the fix.
```

## Large Changes: Avoiding CI Bottlenecks

When a change is too large for a single PR (huge refactor, major feature):

1. **Decompose into stacked PRs.** Each PR is independently mergeable to staging and passes CI on its own. Later PRs build on earlier ones.
   ```
   PR 1: refactor(core): extract module X (no behavior change)
   PR 2: refactor(core): update callers of X (depends on PR 1)
   PR 3: feat: new capability using refactored X (depends on PR 2)
   ```

2. **Each PR targets staging.** Merge sequentially as each goes green.

3. **Reference the parent issue in all PRs.** Use GitHub's task lists or link them in the body.

4. **Never hold a long-lived branch that diverges from staging.** Rebase or merge staging in frequently (at least daily for multi-day work).

5. **If a single PR would take >15 minutes of CI, split it.** The goal is rapid feedback loops, not batching.

## Staging Hygiene

- **Staging should always be deployable.** If it's broken, fixing it is the top priority.
- **After every hotfix to main, merge main into staging immediately.** Don't let staging drift.
- **Before starting any feature work, pull staging.** `git checkout staging && git pull origin staging` is step zero.
- **Never force-push to staging or main.** If history needs rewriting, discuss with the maintainer first.

## Commit Message Conventions

Follow conventional commits for automated changelog extraction:

```
feat: add CodeGraph integration (#42)
fix: correct search scoring when symbols absent (#38)
refactor: extract codegraph resolver into own module
test: add unit tests for codegraphBoost
docs: update AGENTS.md with CodeGraph integration notes
chore: bump tsx devDependency for build fix
```

The type prefix (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`) drives release notes grouping. Always reference the issue number.

## Quick Reference

| Action | Command |
|--------|---------|
| Start a feature | `git checkout staging && git pull && git checkout -b feature/N-desc` |
| Sync staging into feature | `git fetch origin staging && git merge origin/staging` |
| Open PR to staging | `gh pr create --base staging --title "..." --body "Closes #N"` |
| Check CI status | `gh pr checks <N> --watch` |
| Merge PR (squash) | `gh pr merge <N> --squash` |
| Open release candidate | `gh pr create --base main --head staging --title "RC: vX.Y.Z"` |
| Merge RC to main | `gh pr merge <N> --merge` |
| Tag a release | `git tag -a vX.Y.Z -m "message" && git push origin main --tags` |
| Emergency hotfix | Branch from main → PR to main → fast-gate → merge → tag → sync staging |
| View failed CI logs | `gh run view <id> --log-failed` |
| List open issues | `gh issue list --state open` |
| Create an issue | `gh issue create --title "..." --body "..." --label "..."` |
