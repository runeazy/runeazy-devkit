#!/usr/bin/env node
// runeazy-check <check> [flags]: the golden path's checks, run from any folder of a repository.
import { cloudTerms } from './cloud-terms.mjs'
import { dependencyRule } from './dependency-rule.mjs'
import { repoRoot } from './repo.mjs'

const CHECKS = { 'cloud-terms': cloudTerms, 'dependency-rule': dependencyRule }

const [name, ...argv] = process.argv.slice(2)
const check = CHECKS[name]
if (!check) {
  console.error(`Usage: runeazy-check <${Object.keys(CHECKS).join('|')}> [flags]`)
  process.exitCode = 2
} else {
  process.exitCode = check(repoRoot(), argv)
}
