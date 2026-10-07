/**
 * Test harness for the Greenlight submissions, and the example to hand whoever posts them.
 *
 *   npm run greenlight -- post <file.json> [--api <url>]
 *   npm run greenlight -- list             [--api <url>]
 *   npm run greenlight -- publish <id>     [--api <url>]
 *
 * It signs in exactly as a real caller does: Cognito's USER_SRP_AUTH flow, which proves the
 * password without sending it, against the same user pool and app client the Portal uses. So the
 * token it holds is the Portal's kind of token, for the same person, and what it posts is what that
 * person sees in the Portal's Greenlight tab.
 *
 * Credentials come from the environment, never from a file in the repo or the command line:
 * GREENLIGHT_USERNAME and GREENLIGHT_PASSWORD, set for the command or in the gitignored `.env`.
 * A bare file name for `post` is looked for in `tools/greenlight/data/`.
 *
 * `--api` defaults to http://localhost:8080; https://api.labkoat.media is production.
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import cognito from 'amazon-cognito-identity-js';

import config from '../../src/config.js';

const { AuthenticationDetails, CognitoUser, CognitoUserPool } = cognito;

const DATA_DIR = path.join(import.meta.dirname, 'data');

/**
 * Sign in with SRP and return the access token.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} A Cognito access token, valid for the app client's token lifetime
 */
function signIn(username, password) {
    const pool = new CognitoUserPool({ UserPoolId: config.USER_POOL_ID, ClientId: config.CLIENT_ID });
    const user = new CognitoUser({ Username: username, Pool: pool });
    const details = new AuthenticationDetails({ Username: username, Password: password });

    return new Promise((resolve, reject) => {
        user.authenticateUser(details, {
            onSuccess: (session) => resolve(session.getAccessToken().getJwtToken()),
            onFailure: (err) => reject(new Error(`Sign-in failed: ${err.message}`)),
            newPasswordRequired: () => reject(new Error('Sign-in needs a new password first: set a permanent one with '
                + '`aws cognito-idp admin-set-user-password --permanent`')),
            mfaRequired: () => reject(new Error('Sign-in asks for MFA, which a script cannot answer')),
            totpRequired: () => reject(new Error('Sign-in asks for MFA, which a script cannot answer')),
        });
    });
}

/**
 * Call the API and return its `data`, or throw with what it said.
 *
 * @param {string} url
 * @param {string} token
 * @param {object} [init]
 * @returns {Promise<*>}
 */
async function api(url, token, init = {}) {
    const response = await fetch(url, {
        ...init,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`${response.status} ${body?.error?.details ?? response.statusText}`);
    }
    return body.data;
}

/**
 * The JSON to post: a path, or a bare name in the data folder.
 *
 * @param {string} file
 * @returns {string} The file's text, checked to be JSON
 */
function readSubmission(file) {
    const inData = path.join(DATA_DIR, file);
    const full = existsSync(file) ? file : inData;
    if (!existsSync(full)) throw new Error(`No file ${file}, nor ${path.relative(process.cwd(), inData)}`);
    const text = readFileSync(full, 'utf8');
    JSON.parse(text); // Fail here, naming the file, rather than as a 400 from the API
    return text;
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: { api: { type: 'string', default: 'http://localhost:8080' } },
    });
    const [command, arg] = positionals;
    const base = `${values.api.replace(/\/$/, '')}/api/greenlight/submissions`;

    if (!['post', 'list', 'publish'].includes(command) || (command !== 'list' && !arg)) {
        console.log('Usage: npm run greenlight -- post <file.json> | list | publish <id> [--api <url>]');
        process.exitCode = 1;
        return;
    }

    const { GREENLIGHT_USERNAME: username, GREENLIGHT_PASSWORD: password } = process.env;
    if (!username || !password) throw new Error('Set GREENLIGHT_USERNAME and GREENLIGHT_PASSWORD');

    const body = command === 'post' ? readSubmission(arg) : null; // Read before signing in
    const token = await signIn(username, password);

    if (command === 'post') {
        const created = await api(base, token, { method: 'POST', body });
        console.log(`Posted ${arg} as ${created.id} (expires ${created.expiresAt})`);
    } else if (command === 'list') {
        const held = await api(base, token);
        if (!held.length) console.log('No unpublished submissions');
        held.forEach((s) => console.log(`${s.id}  received ${s.receivedAt}  ${JSON.stringify(s.data).length} bytes`));
    } else {
        const done = await api(`${base}/${encodeURIComponent(arg)}/publish`, token, { method: 'POST' });
        console.log(`Published ${done.id} at ${done.publishedAt}`);
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
