import js from '@eslint/js';
import globals from 'globals';

// eslint:recommended is "problem" rules (unused vars, undefined refs, etc.) —
// no stylistic/whitespace rules, so it won't fight the codebase's deliberate
// aligned-assignment formatting style.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // process.cwd() etc. show up in some test setups
      },
    },
  },
];
