import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      'services/provider-agent/**',
      '**/*.config.mjs',
      '**/*.config.js',
      '**/*.config.ts'
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-interface': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
