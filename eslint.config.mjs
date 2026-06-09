// Tango lint policy. See DESIGN_PRINCIPLES.md §3 (P1) and §6.
// The headline rule: `any` is BANNED, repo-wide, and so are the unsafe-* escapes
// that let `any` leak in implicitly. This config is enforced in pre-commit and CI.
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      'node_modules/**',
      '**/*.cjs',
      '**/*.mjs',
      '**/*.js'
    ]
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // --- The `any` ban (belt and suspenders) ---
      // Catches the `any` keyword anywhere it is written explicitly...
      '@typescript-eslint/no-explicit-any': 'error',
      // ...and catches `any` written in any type position (annotations, generics,
      // casts) that the rule above can miss.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message:
            'The `any` type is banned (DESIGN_PRINCIPLES.md P1). Use `unknown` and narrow, or write the precise type.'
        }
      ],

      // --- Stop `any` from leaking in implicitly via untyped values ---
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // --- Stop people from silencing the type system ---
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true }
      ],
      '@typescript-eslint/no-non-null-assertion': 'error'
    }
  },
  // Tests may use `ts-expect-error` to assert that misuse fails to compile.
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
)
