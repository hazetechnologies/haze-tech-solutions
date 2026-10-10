import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // api/* is Vercel serverless (Node) and scripts/* is build tooling, not
  // browser code. Linting them with only browser globals reported every single
  // `process.env` read as `no-undef` — hundreds of false positives that buried
  // the real findings and made "did my change add an error?" unanswerable.
  {
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  // The _lib tests run under Deno (`deno test api/_lib/`), not Node.
  {
    files: ['api/**/*.test.js'],
    languageOptions: { globals: { ...globals.node, Deno: 'readonly' } },
  },
])
