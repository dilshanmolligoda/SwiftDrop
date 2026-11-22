// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      // Needed when the VS Code ESLint extension lints several workspaces at once
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
);
