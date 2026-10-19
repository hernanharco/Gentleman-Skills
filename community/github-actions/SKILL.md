---
name: github-actions
description: >
  GitHub Actions CI/CD patterns: job design, caching, security, and workflow maintenance.
  Trigger: When writing or debugging .github/workflows YAML, when CI is slow or flaky, when setting up lint/test/build pipelines, when handling secrets or fork PRs.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Creating or modifying a workflow in `.github/workflows/`
- CI runs are slow, flaky, or failing only on the runner
- Adding linting, testing, building, or deployment jobs
- Handling secrets, OIDC, or untrusted (fork) pull requests

---

## Critical Patterns

- **Pin third-party actions to a full commit SHA**: `actions/checkout@<40-char-sha> # v4`.
  Tags are mutable; a compromised tag runs arbitrary code with your secrets. Renovate
  or Dependabot keeps SHAs updated.
- **Least-privilege tokens**: set `permissions:` at workflow or job level to the
  minimum (`contents: read` for build/test). The default token has write access to the
  repo — declare what you need, nothing more.
- **Never build or test untrusted fork PRs with secrets or write tokens**: `pull_request`
  from a fork gets no secrets by design; do not switch to `pull_request_target` unless
  you understand it runs base-branch code with write access.
- **Concurrency cancels stale runs**: `concurrency: { group: ..., cancel-in-progress: true }`
  on push workflows so a new commit cancels the in-flight run of the old one.
- **Pin everything that determines the environment**: runner image (`ubuntu-24.04`,
  never `ubuntu-latest`), Node/Python versions, dependency lockfiles committed.
  `*-latest` images change under you — a green workflow can start failing without any
  commit.
- **Cache only what is slow to recompute**: dependency directories keyed on the
  lockfile hash (`hashFiles('**/lockfile')`). Caching build outputs or `.git` is a
  common source of heisenbugs.
- **Fail fast with separate jobs**: lint, test, and build as parallel jobs —
  independent failures are visible, and caches from lint don't pollute test.
- **No `curl | bash` in CI**: install tools from pinned versions or verified
  checksums; CI runners have your `GITHUB_TOKEN`.

## Workflow Skeleton

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@01aecc6538448c04217e9186b68d96b74c3a45cd # v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm          # caches ~/.npm keyed on package-lock.json
      - run: npm ci           # reproducible install from lockfile
      - run: npm run lint --if-present
      - run: npm test
```

## Build → Publish → Deploy

- **Build and publish are separate jobs**: the artifact pushed to a registry must be
  the exact artifact tested — build once, pass via `actions/upload-artifact` /
  registry, never rebuild between test and deploy.
- **Deploy only from the default branch or tags**, gated by `environment:` with
  required reviewers for production.
- **OIDC instead of long-lived secrets** for cloud deploys
  (`permissions: id-token: write` + cloud role federation) — no key rotation, no
  leaked credential risk.
- **Tags/releases**: verify the tag matches `package.json` version in a guard step
  before publishing.

## Secrets

- Repo/org **Actions secrets** only reach workflows triggered from the same repo;
  fork PRs never see them.
- `secrets.X` renders as empty string in logs if unset — validate presence when
  required, fail with a clear message.
- Never echo secrets, never pass them via `run:` arguments (visible in `ps`), use
  `env:` and reference `"$VAR"` quoted.
- Rotate any secret that appears in a debug log (`ACTIONS_STEP_DEBUG` leaks env).

## Speed and Flakiness

| Symptom | Fix |
|---|---|
| Installs dominate runtime | `cache: npm/pip`, `npm ci` not `npm install` |
| Same commit, different results | Pin runner image, action SHAs, tool versions |
| Duplicate runs on PR + push | `concurrency` with `cancel-in-progress` |
| Random network timeouts | Retry only the network step (retries with backoff), not the whole job |
| Tests pass locally, fail in CI | Match locale/TZ (`TZ: UTC`) and Node versions explicitly |

## Anti-Patterns

- `runs-on: ubuntu-latest` and `actions/checkout@v4` (mutable tag) in the same
  workflow — nothing about the environment is reproducible.
- `permissions: write-all` or omitting `permissions` entirely.
- Running the full test matrix on docs-only changes — gate with `paths:` filters.
- `if: github.event_name == 'push'` logic sprawl — extract composite actions for
  repeated step sequences.
- Secrets passed to `pull_request_target` workflows that check out and build PR code.
