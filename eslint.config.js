const { defineConfig } = require('eslint/config')
const expo = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expo,
  {
    // jest.mock factories can't use import.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    ignores: ['**/node_modules/**', 'apps/*/android/**', 'packages/native/nitrogen/**', 'packages/native/android/**', 'eval/out/**', 'coverage/**', '**/dist/**'],
  },
])
