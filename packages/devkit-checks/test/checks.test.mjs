import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { cloudTerms } from '../src/cloud-terms.mjs'
import { dependencyRule } from '../src/dependency-rule.mjs'

function repo(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'devkit-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  }
  execFileSync('git', ['add', '-A'], { cwd: root })
  return root
}
const quiet = () => {}

test('cloud-terms: init, then a new line fails and a removed one is stale', () => {
  const root = repo({ 'src/a.ts': 'const host = "x.run.app"\n', 'README.md': 'pubsub\n' })
  assert.equal(cloudTerms(root, ['--init'], quiet), 0)
  const base = JSON.parse(readFileSync(path.join(root, 'scripts/check-cloud-terms.baseline.json')))
  assert.deepEqual(base.files, { 'src/a.ts': 1 })

  writeFileSync(path.join(root, 'src/a.ts'), 'const host = "x.run.app"\nconst t = "pubsub"\n')
  assert.equal(cloudTerms(root, [], quiet), 1)

  writeFileSync(path.join(root, 'src/a.ts'), 'const host = process.env.HOST\n')
  assert.equal(cloudTerms(root, [], quiet), 1)
  assert.equal(cloudTerms(root, ['--prune'], quiet), 0)
})

test('cloud-terms: allowTasks lets only Cloud Tasks through; exempt skips a file', () => {
  const root = repo({
    'runeazy-checks.json': JSON.stringify({
      cloudTerms: { allowTasks: ['tasks/**'], exempt: ['lessons/**'] },
    }),
    'tasks/q.ts': 'import { CloudTasksClient } from "@google-cloud/tasks"\n',
    'lessons/l.ts': 'pubsub cloudsql\n',
    'scripts/check-cloud-terms.baseline.json': '{"files":{}}\n',
  })
  assert.equal(cloudTerms(root, [], quiet), 0)
  writeFileSync(path.join(root, 'tasks/q.ts'), 'const a = "cloud tasks via pubsub"\n')
  assert.equal(cloudTerms(root, [], quiet), 1)
})

test('dependency-rule: path links out of the repo and checkouts fail; allow entries pass', () => {
  const files = {
    'package.json': JSON.stringify({
      name: 'root',
      workspaces: ['pkgs/*'],
      dependencies: {
        '@runeazy/node': 'file:../runeazy-sdk/node',
        '@runeazy/own': 'file:pkgs/own',
      },
    }),
    'pkgs/own/package.json': JSON.stringify({ name: '@runeazy/own' }),
    '.github/workflows/ci.yml':
      'steps:\n  - uses: actions/checkout@v7\n    with:\n      repository: runeazy/runeazy-sdk\n  - uses: runeazy/.github/.github/workflows/checks.yml@v1\n',
  }
  const root = repo(files)
  const lines = []
  assert.equal(
    dependencyRule(root, [], (l) => lines.push(l)),
    1,
  )
  assert.match(lines.join('\n'), /links outside the repository/)
  assert.match(lines.join('\n'), /checks out runeazy\/runeazy-sdk/)
  assert.doesNotMatch(lines.join('\n'), /@runeazy\/own/)

  writeFileSync(
    path.join(root, 'runeazy-checks.json'),
    JSON.stringify({
      dependencyRule: {
        allow: [
          { file: 'package.json', target: '@runeazy/node', reason: 'until 0.1.0' },
          {
            file: '.github/workflows/ci.yml',
            target: 'runeazy/runeazy-sdk',
            reason: 'until 0.1.0',
          },
        ],
      },
    }),
  )
  assert.equal(dependencyRule(root, [], quiet), 0)

  writeFileSync(path.join(root, '.github/workflows/ci.yml'), 'steps: []\n')
  assert.equal(dependencyRule(root, [], quiet), 1) // stale allow entry
})
