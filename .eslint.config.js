// eslint.config.js
//
// Article on FlatCompat:
// https://medium.com/@1608naman/a-flat-attempt-at-the-eslint-flat-config-393005212d67
//
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'url';
import path from 'path';

import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname, // Optional, default to process.cwd()
});

export default [
    // Migrate extends using FlatCompat
    ...compat.extends('eslint-config-airbnb', 'plugin:react/recommended'),

    // Migrate env using FlatCompat
    ...compat.env({
        browser: true,
        node: true,
    }),

    // Migrate plugins using FlatCompat and fixupPluginRules for compatibility
    ...compat.plugins('react', 'jsx-a11y'),

    // js.configs.recommended,
    {
        files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.tsx', '**/*.ts', '**/*.json'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            'jsx-a11y': jsxA11yPlugin,
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
            import: importPlugin,
        },
    },

    // Your custom overrides
    {
        rules: {
            // ...jsxA11y.configs.recommended.rules,
            // ...reactPlugin.configs.recommended.rules,
            'func-names': [
                'error',
                'as-needed',
            ],
            'linebreak-style': 0,
            indent: [
                'warn',
                4,
                {
                    VariableDeclarator: 1,
                    SwitchCase: 1,
                },
            ],
            'react/jsx-indent': [
                'warn',
                4,
            ],
            'react/jsx-indent-props': [
                'error',
                4,
            ],
            'no-underscore-dangle': [
                0,
            ],
            'no-console': 'off',
            'max-len': [
                'warn',
                {
                    code: 120,
                    ignoreComments: true,
                },
            ],
        },
    },
];
