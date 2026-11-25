/**
 * dependency-rule: code crosses a repository only as a versioned artifact. This fails on
 *
 * - a `file:`, `link:` or `portal:` specifier in a tracked package.json whose path leaves the
 *   repository (a sibling checkout), and on any such specifier for an `@runeazy/` package that
 *   isn't one of this repository's own workspaces;
 * - a workflow step that checks out another RunEazy repository (`repository: runeazy/<name>`),
 *   except `runeazy/.github`.
 *
 * Known exceptions, each with a reason and the change that ends it, go in `runeazy-checks.json`:
 *   { "dependencyRule": { "allow": [
 *       { "file": ".github/workflows/ci.yml", "target": "runeazy/runeazy-sdk",
 *         "reason": "links the Node SDK until it is published" } ] } }
 * An allowed finding that no longer occurs fails as stale, so the list only shrinks.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readConfig, trackedFiles } from './repo.mjs'

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const PATH_SPEC = /^(file|link|portal):(.+)$/

function* specs(pkg) {
  for (const field of DEP_FIELDS)
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) yield [name, spec]
  // overrides may nest
  const walk = function* (o) {
    for (const [name, spec] of Object.entries(o ?? {})) {
      if (typeof spec === 'string') yield [name, spec]
      else if (spec && typeof spec === 'object') yield* walk(spec)
    }
  }
  yield* walk(pkg.overrides)
}

/** Findings as `{ file, line, target, message }`. */
export function scanDependencies(root) {
  const files = trackedFiles(root)
  const findings = []
  const ownNames = new Set()
  const pkgFiles = files.filter((f) => f === 'package.json' || f.endsWith('/package.json'))
  const pkgs = []
  for (const file of pkgFiles) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(root, file), 'utf8'))
      pkgs.push([file, pkg])
      if (pkg.name) ownNames.add(pkg.name)
    } catch {
      // not JSON (a fixture): skip
    }
  }
  for (const [file, pkg] of pkgs) {
    for (const [name, spec] of specs(pkg)) {
      const m = PATH_SPEC.exec(spec)
      if (!m) continue
      const target = path.resolve(root, path.dirname(file), m[2])
      const leaves = path.relative(root, target).startsWith('..')
      if (leaves) {
        findings.push({
          file,
          target: name,
          message: `${name}: "${spec}" links outside the repository`,
        })
      } else if (name.startsWith('@runeazy/') && !ownNames.has(name)) {
        findings.push({
          file,
          target: name,
          message: `${name}: "${spec}" is a path link; take a published version`,
        })
      }
    }
  }
  for (const file of files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))) {
    readFileSync(path.join(root, file), 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        const m = /^\s*repository:\s*['"]?(runeazy\/[\w.-]+)/.exec(text)
        if (m && m[1] !== 'runeazy/.github')
          findings.push({
            file,
            line: i + 1,
            target: m[1],
            message: `checks out ${m[1]}; take its published package or image instead`,
          })
      })
  }
  return findings
}

export function dependencyRule(root, _argv = [], log = console.log) {
  const allow = readConfig(root).dependencyRule?.allow ?? []
  const findings = scanDependencies(root)
  const allowed = (f) => allow.some((a) => a.file === f.file && a.target === f.target)
  const bad = findings.filter((f) => !allowed(f))
  const stale = allow.filter(
    (a) => !findings.some((f) => f.file === a.file && f.target === a.target),
  )

  log(`Dependency rule: ${findings.length} finding(s), ${findings.length - bad.length} allowed.`)
  for (const f of bad) log(`  ${f.file}${f.line ? `:${f.line}` : ''}: ${f.message}`)
  if (stale.length > 0) {
    log('\nStale allow entries (good: the link is gone). Remove them from runeazy-checks.json:')
    for (const a of stale) log(`  ${a.file}: ${a.target}`)
  }
  const failed = bad.length > 0 || stale.length > 0
  log(failed ? '\nFailed.' : '\nOK.')
  return failed ? 1 : 0
}
