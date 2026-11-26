/**
 * cloud-terms: only the deployment repository may name a cloud provider's services or details,
 * so this fails when a tracked file gains a line that names Google Cloud. It reads the tracked
 * files and runs nothing.
 *
 * Scanned: every file `git ls-files` lists, except Markdown, lockfiles, binaries, symlinks, the
 * baseline, the config file, the portability review's prompt and the config's `exempt` globs.
 * There is no inline excuse for a cloud term.
 *
 * Allowed: Cloud Tasks and Cloud Scheduler, until their open-source adapters replace them, in
 * the config's `allowTasks` files alone, and there only those two terms. Any other cloud term on
 * the same line still counts.
 *
 * The baseline holds how many matching lines each file had when the check started, by file, never
 * by line number. It may only shrink: the check fails when a file has more lines than the
 * baseline holds, when a file the baseline lacks has any, and when an entry is stale.
 *
 * Config (`runeazy-checks.json`, all optional):
 *   { "cloudTerms": { "baseline": "scripts/check-cloud-terms.baseline.json",
 *                     "allowTasks": ["server-kit/tasks/**"], "exempt": ["src/lessons/**"] } }
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { clip, CONFIG_FILE, git, matcher, readConfig, trackedFiles } from './repo.mjs'

export const DEFAULT_BASELINE = 'scripts/check-cloud-terms.baseline.json'

/**
 * The baseline at `base`, with each file that git sees renamed since then under its new path: a moved file keeps its
 * count, so moving it doesn't read as the baseline growing. A file renamed and changed is still compared, at its new
 * path, against what it held.
 */
function followRenames(root, base, before) {
  const moved = {}
  for (const line of git(root, 'diff', '--find-renames', '--name-status', '--no-color', base).split(
    '\n',
  )) {
    const [status, from, to] = line.split('\t')
    if (status?.startsWith('R') && from && to) moved[from] = to
  }
  const after = {}
  for (const [file, n] of Object.entries(before)) {
    const now = moved[file] ?? file
    after[now] = (after[now] ?? 0) + n
  }
  return after
}

export const CLOUD = new RegExp(
  [
    String.raw`metadata\.google\.internal`,
    String.raw`googleapis\.com`,
    String.raw`@google-cloud/`,
    String.raw`google-auth-library`,
    String.raw`\.run\.app`,
    String.raw`K_SERVICE`,
    String.raw`K_REVISION`,
    String.raw`CLOUD_RUN`,
    String.raw`GOOGLE_CLOUD_PROJECT`,
    String.raw`iam\.gserviceaccount`,
    String.raw`cloudsql`,
    String.raw`Cloud SQL`,
    String.raw`secretmanager`,
    String.raw`cloudkms`,
    String.raw`pubsub`,
    String.raw`asia-south1`,
    String.raw`runeazy-(qa|prod)\b`,
    String.raw`pkg\.dev`,
    String.raw`gcr\.io`,
    String.raw`workloadIdentity`,
    String.raw`X-Cloud-Trace`,
    String.raw`gcloud `,
    String.raw`cloud[ _-]?tasks`,
    String.raw`cloud[ _-]?scheduler`,
  ].join('|'),
  'i',
)

/** Cloud Tasks' and Cloud Scheduler's terms, blanked out of a line in an `allowTasks` file. */
const TASKS =
  /@google-cloud\/(tasks|scheduler)\b|(cloudtasks|cloudscheduler)\.googleapis\.com|cloud[ _-]?(tasks|scheduler)/gi

const SKIP = [
  '**/*.md',
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/bun.lockb',
  '**/Package.resolved',
  '**/*.lockfile',
  '**/gradle.lockfile',
  '**/Podfile.lock',
  '**/Gemfile.lock',
  '**/Cargo.lock',
  CONFIG_FILE,
  // The portability review's prompt names the terms to explain the rule.
  '.github/workflows/portability-review.yml',
]

const readBaseline = (text) => JSON.parse(text).files ?? {}

function formatBaseline(files) {
  const sorted = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  return `${JSON.stringify(
    {
      $comment:
        'Lines naming Google Cloud, per file. It may only shrink: run `npx runeazy-check cloud-terms --prune` after removing some.',
      files: sorted,
    },
    null,
    2,
  )}\n`
}

/** Each scanned file's matching lines, as `{ file: [[lineNo, text], ...] }`. */
export function scan(root, config = {}) {
  const baselinePath = config.baseline ?? DEFAULT_BASELINE
  const skipped = matcher([...SKIP, baselinePath, ...(config.exempt ?? [])])
  const tasksAllowed = matcher(config.allowTasks ?? [])
  const found = {}
  for (const file of trackedFiles(root)) {
    if (skipped(file)) continue
    const abs = path.join(root, file)
    let stat
    try {
      stat = lstatSync(abs)
    } catch {
      continue // deleted in the working tree
    }
    if (!stat.isFile()) continue // symlinks, submodules
    const buf = readFileSync(abs)
    if (buf.subarray(0, 8000).includes(0)) continue // binary, as git decides
    const allow = tasksAllowed(file)
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        if (CLOUD.test(allow ? text.replace(TASKS, ' ') : text))
          (found[file] ??= []).push([i + 1, text])
      })
  }
  return found
}

/**
 * Runs the check. Flags: `--all` lists every held line, `--prune` drops stale entries,
 * `--base=<ref>` fails when the baseline grew since <ref>, `--init` writes a first baseline.
 * Returns the exit code.
 */
export function cloudTerms(root, argv = [], log = console.log) {
  const config = readConfig(root).cloudTerms ?? {}
  const baselinePath = config.baseline ?? DEFAULT_BASELINE
  const BASELINE = path.join(root, baselinePath)
  const all = argv.includes('--all')
  const prune = argv.includes('--prune')
  const init = argv.includes('--init')
  const base = argv.find((a) => a.startsWith('--base='))?.slice('--base='.length)

  const found = scan(root, config)
  const counts = Object.fromEntries(Object.entries(found).map(([f, l]) => [f, l.length]))

  if (init) {
    if (existsSync(BASELINE)) {
      log(`${baselinePath} exists; the baseline may only shrink (use --prune).`)
      return 1
    }
    mkdirSync(path.dirname(BASELINE), { recursive: true })
    writeFileSync(BASELINE, formatBaseline(counts))
    log(`Wrote ${baselinePath}.`)
  }
  if (!existsSync(BASELINE)) {
    log(`${baselinePath} is missing. Run \`npx runeazy-check cloud-terms --init\` once.`)
    return 1
  }
  const baseline = readBaseline(readFileSync(BASELINE, 'utf8'))

  const grown = []
  const stale = []
  for (const [file, now] of Object.entries(counts)) {
    const held = baseline[file] ?? 0
    if (now > held) grown.push([file, now, held])
  }
  for (const [file, held] of Object.entries(baseline)) {
    const now = counts[file] ?? 0
    if (now < held) stale.push([file, now, held])
  }

  if (prune && stale.length > 0) {
    const next = {}
    for (const [file, held] of Object.entries(baseline)) {
      const now = Math.min(held, counts[file] ?? 0)
      if (now > 0) next[file] = now
    }
    writeFileSync(BASELINE, formatBaseline(next))
    log(
      `Pruned ${stale.length} stale ${stale.length === 1 ? 'entry' : 'entries'} from ${baselinePath}.`,
    )
    for (const [file, now, held] of stale) log(`  ${file}: ${held} -> ${now}`)
    stale.length = 0
  }

  const raised = []
  if (base) {
    let before = null
    try {
      before = readBaseline(git(root, 'show', `${base}:${baselinePath}`))
    } catch {
      log(`No ${baselinePath} at ${base}: this change adds it.`)
    }
    if (before) {
      before = followRenames(root, base, before)
      const after = readBaseline(readFileSync(BASELINE, 'utf8'))
      for (const [file, n] of Object.entries(after)) {
        if (n > (before[file] ?? 0)) raised.push([file, n, before[file] ?? 0])
      }
    }
  }

  const files = Object.keys(counts).length
  const lines = Object.values(counts).reduce((a, b) => a + b, 0)
  const held = Object.values(readBaseline(readFileSync(BASELINE, 'utf8')))
  log(
    `Cloud terms: ${lines} lines in ${files} files; the baseline holds ${held.reduce((a, b) => a + b, 0)} lines in ${held.length} files.`,
  )

  if (all) {
    for (const [file, ls] of Object.entries(found).sort(([a], [b]) => (a < b ? -1 : 1))) {
      log(`\n${file} (${ls.length})`)
      for (const [n, text] of ls) log(`  ${n}: ${clip(text)}`)
    }
  }
  if (grown.length > 0) {
    log('\nNew lines naming Google Cloud (only the deployment repository may):')
    for (const [file, now, was] of grown) {
      log(`\n${file}: ${now} lines, the baseline holds ${was}`)
      for (const [n, text] of found[file]) log(`  ${n}: ${clip(text)}`)
    }
  }
  if (stale.length > 0) {
    log(
      '\nStale baseline entries (good: fewer lines). Run `npx runeazy-check cloud-terms --prune`:',
    )
    for (const [file, now, was] of stale) log(`  ${file}: ${was} -> ${now}`)
  }
  if (raised.length > 0) {
    log(`\nThe baseline grew since ${base}; it may only shrink:`)
    for (const [file, n, was] of raised) log(`  ${file}: ${was} -> ${n}`)
  }

  const failed = grown.length > 0 || stale.length > 0 || raised.length > 0
  log(failed ? '\nFailed.' : '\nOK.')
  return failed ? 1 : 0
}
