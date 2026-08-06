import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        files: ['**/*.ts', '**/*.js', '**/*.mjs'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
            },
            globals: {
                ...globals.browser,
                ...globals.es2024,
                ...globals.commonjs,
                ...globals.webextensions,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            '@stylistic': stylistic,
        },
        rules: {
            // https://eslint.org/docs/latest/rules/

            // Modified eslint:recommended set:
            'constructor-super': 'warn',
            'for-direction': 'warn',
            'getter-return': 'warn',
            'no-async-promise-executor': 'warn',
            'no-case-declarations': 'warn',
            'no-class-assign': 'warn',
            'no-compare-neg-zero': 'warn',
            'no-cond-assign': 'warn',
            'no-const-assign': 'warn',
            'no-constant-condition': 'warn',
            'no-control-regex': 'warn',
            'no-debugger': 'warn',
            'no-delete-var': 'warn',
            'no-dupe-args': 'warn',
            'no-dupe-class-members': 'warn',
            'no-dupe-else-if': 'warn',
            'no-dupe-keys': 'warn',
            'no-duplicate-case': 'warn',
            'no-empty': 'warn',
            'no-empty-character-class': 'warn',
            'no-empty-pattern': 'warn',
            'no-ex-assign': 'warn',
            'no-extra-boolean-cast': 'warn',
            '@stylistic/no-extra-semi': 'warn',
            'no-fallthrough': 'warn',
            'no-func-assign': 'warn',
            'no-global-assign': 'warn',
            'no-import-assign': 'warn',
            'no-inner-declarations': 'off',
            'no-invalid-regexp': 'warn',
            'no-irregular-whitespace': 'warn',
            'no-loss-of-precision': 'warn',
            'no-misleading-character-class': 'warn',
            '@stylistic/no-mixed-spaces-and-tabs': 'warn',
            'no-new-symbol': 'warn',
            'no-nonoctal-decimal-escape': 'warn',
            'no-obj-calls': 'warn',
            'no-octal': 'warn',
            'no-prototype-builtins': 'warn',
            'no-redeclare': 'warn',
            'no-regex-spaces': 'warn',
            'no-self-assign': 'warn',
            'no-setter-return': 'warn',
            'no-shadow-restricted-names': 'warn',
            'no-sparse-arrays': 'warn',
            'no-this-before-super': 'warn',
            'no-undef': 'warn',
            'no-unexpected-multiline': 'warn',
            'no-unreachable': 'off',
            'no-unsafe-finally': 'warn',
            'no-unsafe-negation': 'warn',
            'no-unsafe-optional-chaining': 'warn',
            'no-unused-labels': 'warn',
            'no-unused-vars': 'off',
            'no-useless-backreference': 'warn',
            'no-useless-catch': 'off',
            'no-useless-escape': 'warn',
            'no-with': 'warn',
            'require-yield': 'warn',
            'use-isnan': 'warn',
            'valid-typeof': 'warn',

            // Additional code rules:
            'no-constructor-return': 'warn',
            'no-new-native-nonconstructor': 'warn',
            'no-self-compare': 'warn',
            'no-template-curly-in-string': 'warn',
            'no-unmodified-loop-condition': 'warn',
            'no-unreachable-loop': 'warn',
            'no-unused-private-class-members': 'warn',
            'no-use-before-define': 'off',
            'eqeqeq': ['warn', 'smart'],
            'no-implied-eval': 'warn',
            'no-multi-assign': 'warn',
            'no-multi-str': 'warn',
            'no-nested-ternary': 'warn',
            'no-proto': 'warn',
            'no-return-assign': 'warn',
            'no-sequences': 'warn',
            'no-throw-literal': 'off',
            'no-undefined': 'off',
            'no-unused-expressions': 'warn',
            'prefer-promise-reject-errors': 'warn',

            // Style ('single' also allows backticks):
            '@stylistic/quotes': ['warn', 'single', {
                avoidEscape: true,
                allowTemplateLiterals: 'always',
            }],
            '@stylistic/indent': ['warn', 4, {
                SwitchCase: 1,
            }],
            '@stylistic/semi': ['warn', 'always'],
            '@stylistic/brace-style': ['warn', '1tbs', {
                allowSingleLine: true,
            }],
            '@stylistic/object-curly-spacing': ['warn', 'always'],
            '@stylistic/comma-dangle': ['warn', 'always-multiline'],
            'no-var': 'warn',
            '@typescript-eslint/explicit-function-return-type': ['warn', {
                allowExpressions: true,
            }],
            '@typescript-eslint/explicit-member-accessibility': ['warn', {
                accessibility: 'explicit',
            }],
            '@typescript-eslint/consistent-type-imports': ['warn', {
                prefer: 'type-imports',
            }],
            '@typescript-eslint/array-type': ['warn', {
                default: 'array',
            }],
            '@typescript-eslint/naming-convention': ['warn',
                // House acronym casing (Url, Io, Id) means I + capital is always an I-prefix.
                { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
                { selector: 'enumMember', format: ['PascalCase'] },
            ],
        },
    },
    {
        // The .mjs files are Node scripts (build tooling and this config), so they get the Node globals.
        files: ['**/*.mjs'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        // no-undef is off for TypeScript files: the rule doesn't see the TS type system or ambient
        // declarations (globals.d.ts), so it false-positives on types like Nil; tsc already errors
        // on genuinely undefined identifiers; and turning it off on TS is standard practice,
        // recommended by typescript-eslint. It stays on for .js/.mjs, which tsc doesn't check.
        files: ['**/*.ts'],
        rules: {
            'no-undef': 'off',
        },
    },
    {
        // Chai's property-based assertions (e.g. expect(x).to.be.true) look like unused expressions.
        files: ['src/test/**/*.ts', 'src/test/**/*.js'],
        rules: {
            'no-unused-expressions': 'off',
        },
    },
];
