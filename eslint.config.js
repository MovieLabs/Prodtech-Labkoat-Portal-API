// eslint.config.js - Project A
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
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
        jsx: true,
    }),

    {
        files: ['**/*.{js,mjs,cjs,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
    },

    {
        plugins: {
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
            'jsx-a11y': jsxA11yPlugin,
            'import': importPlugin,
        },
    },

    {
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...reactHooksPlugin.configs.recommended.rules,
            ...jsxA11yPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
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
            // '@stylistic/jsx-indent': ['error', 2],
            '@stylistic/jsx-indent-props': ['error', 2],

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
                    'newlines-between': 'always',
                    'alphabetize': { order: 'asc', caseInsensitive: true },
                },
            ],
            'import/no-duplicates': 'error',
            'import/no-unresolved': 'error',

            // React rules
            'react/self-closing-comp': 'error',
            'react/jsx-no-useless-fragment': 'error',
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',

            // React Hooks
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // Accessibility
            'jsx-a11y/anchor-is-valid': 'error',
            'jsx-a11y/alt-text': 'error',
        },
    },
];
