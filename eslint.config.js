// eslint.config.js
import { fileURLToPath } from 'url';
import path from 'path';

import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

export default [

    //
    // 1. Airbnb + React + JSX-a11y (via FlatCompat)
    //
    ...compat.extends(
        'eslint-config-airbnb',
        'plugin:react/recommended',
    ),

    //
    // 2. Environments (browser, node, ES2021)
    //
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
    },

    //
    // 3. Plugins (React, Hooks, JSX-a11y, Import)
    //
    {
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
            'jsx-a11y': jsxA11yPlugin,
            import: importPlugin,
        },
    },

    //
    // 4. OVERRIDE parserOptions that Airbnb injects
    //    This is the critical fix for "import is reserved"
    //
    {
        files: ['**/*.{js,jsx,mjs,ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
    },

    //
    // 5. Your custom rules
    //
    {
        rules: {
            'func-names': ['error', 'as-needed'],
            'linebreak-style': 0,
            indent: ['warn', 4, { VariableDeclarator: 1, SwitchCase: 1 }],
            'react/jsx-indent': ['warn', 4],
            'react/jsx-indent-props': ['error', 4],
            'no-underscore-dangle': 0,
            'no-console': 'off',
            'max-len': ['warn', { code: 120, ignoreComments: true }],
        },
    },
];
