// @ts-check
/**
 * ESLint v9 Configuration File
 *
 * This is a configuration file using the new ESLint v9 format, replacing the traditional .eslintrc.* files.
 * The new format uses ES module syntax and configures through direct module imports.
 *
 * This configuration is optimized for the Haystack VS Code extension project.
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/.vscode-test/**',
      '**/.git/**',
      '**/coverage/**',
      'webpack/**',
      'src/vscode.d.ts',
    ],
  },
  reactHooks.configs['recommended-latest'],
  // Use ESLint recommended base rules
  eslint.configs.recommended,

  // Use TypeScript ESLint recommended rules
  ...tseslint.configs.recommended,

  // Common configurations for all files
  {
    files: ['src/**/*.{js,ts,tsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  // VS Code extension project shared rules configuration for JavaScript files
  {
    files: ['src/**/*.{js,ts,tsx,mjs,cjs}'],
    rules: {
      // Style rules
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'comma-dangle': ['error', 'always-multiline'],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'arrow-parens': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      'space-before-blocks': ['error', 'always'],
      'keyword-spacing': ['error', { before: true, after: true }],

      // VS Code specific rules
      'no-console': 'off', // VS Code extensions typically need console output

      // Best practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'object-shorthand': ['error', 'always'],

      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-use-before-define': ['error', { functions: false }],

      // Promise/async handling
      'no-return-await': 'error',
      'require-await': 'error',
    },
  },

  // TypeScript files project custom rules
  {
    files: ['src/**/*.{ts,tsx}'],

    // TypeScript parser options
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './src/webview/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Rules configuration
    rules: {
      // Style rules
      // semi: ['error', 'never'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'comma-dangle': ['error', 'always-multiline'],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'arrow-parens': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      'space-before-blocks': ['error', 'always'],
      'keyword-spacing': ['error', { before: true, after: true }],

      // VS Code specific rules
      'no-console': 'off',

      // TypeScript specific rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          // prefix: ['I'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'off' }],
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Best practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'object-shorthand': ['error', 'always'],

      // Promise/async handling
      'no-return-await': 'error',
      'require-await': 'error',
    },
  },
  prettierConfig,
];
