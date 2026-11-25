// RunEazy's ESLint flat config. Use in eslint.config.mjs:
//
//   import runeazy from '@runeazy/devkit-eslint'
//   export default [...runeazy({ react: true, ignores: ['android/**'] }), { /* local rules */ }]
//
// TypeScript-ESLint's recommended rules, sorted imports, React hooks when asked, and Prettier's
// compatibility last. Unused code and `any` warn; CI keeps warnings at 0.
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default function runeazy({ react = false, ignores = [] } = {}) {
  return tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      languageOptions: { globals: { ...globals.node, ...(react ? globals.browser : {}) } },
      plugins: {
        'simple-import-sort': simpleImportSort,
        ...(react ? { 'react-hooks': reactHooks } : {}),
      },
      rules: {
        ...(react
          ? { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' }
          : {}),
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
        ],
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
    prettier,
  )
}
