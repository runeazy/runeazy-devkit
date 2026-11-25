# runeazy-devkit

RunEazy's shared tooling, used by every RunEazy repository by version instead of copies.

| Package                       | What it is                                                         | Use it                                                                       |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `@runeazy/devkit-checks`      | The `runeazy-check` command: `cloud-terms` and `dependency-rule`   | `npx runeazy-check cloud-terms`                                              |
| `@runeazy/devkit-eslint`      | ESLint flat config: TypeScript, sorted imports, React hooks         | `export default [...runeazy({ react: true })]`                               |
| `@runeazy/devkit-prettier`    | Prettier config                                                    | `export { default } from '@runeazy/devkit-prettier'`                         |
| `@runeazy/devkit-tsconfig`    | TypeScript strictness                                              | `"extends": "@runeazy/devkit-tsconfig/base"`                                 |
| `@runeazy/devkit-commitlint`  | Conventional Commits                                               | `export default { extends: ['@runeazy/devkit-commitlint'] }`                 |
| `default.json`                | The Renovate preset                                                | `{ "extends": ["github>runeazy/runeazy-devkit"] }`                           |

The CI jobs that run these live in [runeazy/.github](https://github.com/runeazy/.github)'s reusable
workflows.

## Install

The packages are on GitHub Packages. Map the scope once in the repository's `.npmrc`:

```ini
@runeazy:registry=https://npm.pkg.github.com
```

CI reads with its workflow token (`packages: read`); on a laptop, a personal token with
`read:packages` only, in `~/.npmrc` as `//npm.pkg.github.com/:_authToken=<token>`.

## The checks

Each repository keeps only its own data: a baseline file and `runeazy-checks.json`.

```json
{
  "cloudTerms": {
    "baseline": "scripts/check-cloud-terms.baseline.json",
    "allowTasks": ["server-kit/tasks/**"],
    "exempt": ["src/lessons/**"]
  },
  "dependencyRule": {
    "allow": [
      {
        "file": ".github/workflows/ci.yml",
        "target": "runeazy/runeazy-sdk",
        "reason": "links the Node SDK until it is published"
      }
    ]
  }
}
```

- **`cloud-terms`** fails when a tracked file gains a line naming Google Cloud. Only the
  deployment repository may name a cloud. The baseline counts today's lines per file and may only
  shrink: `--prune` after removing some, `--base=<ref>` in CI on a pull request, `--all` to list
  them, `--init` once. `allowTasks` lets Cloud Tasks and Cloud Scheduler be named in those files
  alone, until their open-source adapters replace them. `exempt` skips content that teaches or
  states a cloud.
- **`dependency-rule`** fails when code crosses a repository other than as a versioned artifact:
  a `file:`/`link:` specifier that leaves the repository or names another repository's
  `@runeazy/` package, or a workflow that checks out another RunEazy repository (except
  `runeazy/.github`). `allow` lists today's exceptions with the change that ends each; an entry
  that no longer matches fails as stale, so the list only shrinks.

## Releasing

All packages share one version. Commits are Conventional Commits; release-please keeps a release
PR open, and merging it tags `vX.Y.Z`, writes `CHANGELOG.md` and publishes. A published version
is never unpublished: a bad one is deprecated and fixed by a patch.

## Licence

Apache-2.0.
