// Shared helpers: the repository root, its tracked files, globs and the checks' config file.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const CONFIG_FILE = 'runeazy-checks.json'

/** The repository root: `git rev-parse --show-toplevel` from `cwd`. */
export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
}

export const git = (root, ...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** Every tracked file, repo-relative, with `/` separators. */
export const trackedFiles = (root) => git(root, 'ls-files', '-z').split('\0').filter(Boolean)

/** A glob (`*` within a segment, `**` across them) as a RegExp on a repo-relative path. */
export function globRe(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') {
        i++
        re += '(?:.*/)?'
      } else re += '.*'
    } else if (c === '*') re += '[^/]*'
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export const matcher = (globs) => {
  const res = globs.map(globRe)
  return (file) => res.some((re) => re.test(file))
}

/** The repository's `runeazy-checks.json`, or `{}` when it has none. */
export function readConfig(root) {
  const file = path.join(root, CONFIG_FILE)
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8'))
}

export const clip = (s) => (s.trim().length > 160 ? `${s.trim().slice(0, 157)}...` : s.trim())
