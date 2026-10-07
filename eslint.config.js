// eslint.config.js - Labkoat-API (Node only)
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
    {
        ignores: ['**/*.json', 'dist', 'build'],
    },

    js.configs.recommended,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
    }),

    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },

    {
        plugins: { import: importPlugin },
        settings: {
            // The typescript resolver reads package.json `exports` and `imports` maps, which the
            // plugin's default node resolver does not, so `#pipelines/*` and `omc-util/*` resolve.
            'import/resolver': { typescript: true, node: true },
        },
    },

    {
        rules: {
            // Stylistic rules (using @stylistic plugin)
            '@stylistic/indent': ['warn', 4, { VariableDeclarator: 1, SwitchCase: 1 }],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
            '@stylistic/space-before-blocks': ['error', 'always'],
            '@stylistic/keyword-spacing': ['error', { before: true, after: true }],
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/arrow-spacing': ['error', { before: true, after: true }],
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/array-bracket-spacing': ['error', 'never'],
            '@stylistic/arrow-parens': ['error', 'always'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/no-extra-parens': 'off',

            // Modern JS best practices
            'prefer-const': 'error',
            'no-var': 'error',
            'prefer-template': 'error',
            'arrow-body-style': ['error', 'as-needed'],
            'prefer-arrow-callback': 'error',
            'object-shorthand': ['error', 'always'],

            // Code quality
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-shadow': 'error',
            'no-param-reassign': ['error', { props: false }],
            'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
            'no-nested-ternary': 'error',

            // Import rules
            'import/order': [
                'error',
                {
                    'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                    // mlHelpers is a `file:` dependency, which the resolver follows to a path outside
                    // node_modules and would call internal; it is a package, so it sorts as one.
                    'pathGroups': [
                        { pattern: '#pipelines{,/**}', group: 'internal' },
                        { pattern: 'mlHelpers{,/**}', group: 'external' },
                    ],
                    'newlines-between': 'always',
                    'alphabetize': { order: 'asc', caseInsensitive: true },
                },
            ],
            'import/no-duplicates': 'error',
            'import/no-unresolved': 'error',
        },
    },

    // The boundary between the gateway and the pipelines, both ways. The service reaches pipelines
    // only through their two entry points, so a pipeline can be deleted with its folder and its
    // registry line; a pipeline knows nothing of the service that hosts it.
    {
        files: ['src/**', 'app.js'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    {
                        group: ['**/pipelines/**', '**/pipelines'],
                        message: 'Reach pipelines through #pipelines or #pipelines/catalog, never by path.',
                    },
                    {
                        regex: '^#pipelines/(?!catalog$)',
                        message: 'Only #pipelines and #pipelines/catalog are entry points.',
                    },
                ],
            }],
        },
    },
    {
        files: ['pipelines/**'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: ['express', 'mlHelpers'],
                patterns: [
                    {
                        group: ['**/src/**', '**/src', 'mlHelpers/*'],
                        message: 'Pipelines know nothing of the service that hosts them.',
                    },
                    {
                        regex: '^#pipelines',
                        message: 'Inside pipelines/, import by relative path.',
                    },
                ],
            }],
        },
    },
];
