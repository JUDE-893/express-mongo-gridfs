import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin-js';

export default [
  js.configs.recommended,
  {
    plugins: {
      '@stylistic/js': stylistic
    },
    rules: {
      // Possible Problems
      'no-console': 'warn',
      'no-duplicate-imports': 'error',
      
      // Suggestions
      'curly': 'error',
      'eqeqeq': 'error',
      'prefer-template': 'error',
      'no-useless-escape': 'error',
      'prefer-arrow-callback': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      
      // Layout & Formatting
      '@stylistic/js/indent': ['error', 2],
      '@stylistic/js/semi': ['error', 'always'],
      '@stylistic/js/object-curly-spacing': ['error', 'always'],
      '@stylistic/js/array-bracket-spacing': ['error', 'never'],
      '@stylistic/js/comma-dangle': ['error', 'only-multiline']
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }
];