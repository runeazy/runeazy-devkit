// RunEazy's commitlint config: Conventional Commits, any scope, bodies of any line length.
// Use in commitlint.config.mjs: `export default { extends: ['@runeazy/devkit-commitlint'] }`.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'scope-enum': [0],
  },
}
