// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/expo-env.d.ts',
      'apps/api/src/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // NFR-M-01: TypeScript strict, no `any` in committed code.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Command-line entry points talk to a terminal; that is their whole job.
    files: [
      '**/*.test.ts',
      '**/scripts/**',
      '**/*.config.{js,ts,mjs}',
      'apps/api/src/db/migrate.ts',
      'apps/api/src/db/seed.ts',
      'apps/api/src/db/content-cli.ts',
      'apps/api/src/index.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
