/**
 * Test harness for the Greenlight submissions, and the example to hand whoever posts them.
 *
 *   npm run greenlight -- post <file.json> [--api <url>] [--client] [--organisation <name>]
 *   npm run greenlight -- list             [--api <url>]
 *   npm run greenlight -- publish <id>     [--api <url>]
 *   npm run greenlight -- peek [--delete]
 *
 * It signs in exactly as a real caller does: Cognito's USER_SRP_AUTH flow, which proves the
 * password without sending it, against the same user pool and app client the Portal uses. So the
 * token it holds is the Portal's kind of token, for the same person, and what it posts is what that
 * person sees in the Portal's Greenlight tab.
 *
 * `post --client` signs in as a machine instead: the OAuth client_credentials grant, a plain HTTPS
 * POST of the client id and secret to Cognito's token endpoint, with no AWS library. A machine may
 * only post; listing and publishing are for people. `--organisation` picks which one a person in
 * several greenlight groups posts for.
 *
 * Credentials come from the environment, never from a file in the repo or the command line:
 * GREENLIGHT_USERNAME and GREENLIGHT_PASSWORD for a person, GREENLIGHT_CLIENT_ID and
 * GREENLIGHT_CLIENT_SECRET for a machine, set for the command or in the gitignored `.env`.
 * A bare file name for `post` is looked for in `tools/greenlight/data/`.
 *
 * `--api` defaults to http://localhost:8080; https://service.labkoat.media is production.
 *
 * `peek` reads the workflow queue directly, to confirm what an approval sent, as the Python example
 * `sqs_test.py` did. It assumes the queue owner's role with the developer's own AWS credentials, not
 * the Cognito login, and receives with a visibility timeout of 0, so the messages stay where the
 * real consumer will find them. `--delete` removes what it read instead: only on a test queue.
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
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
 * Get a machine token: the client_credentials grant, which is all a machine caller needs to do.
 *
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<string>} A Cognito access token carrying the greenlight scope
 */
async function machineToken(clientId, clientSecret) {
    const response = await fetch(config.COGNITO_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: config.GREENLIGHT_SCOPE }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Token request failed: ${response.status} ${body?.error ?? response.statusText}`);
    return body.access_token;
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

/**
 * Read up to ten messages off the workflow queue, and say what each is.
 *
 * @param {Object} params
 * @param {boolean} params.remove - Delete what was read, rather than leave it for the consumer
 */
async function peek({ remove }) {
    const sqs = new SQSClient({
        region: config.AWS_REGION,
        credentials: fromTemporaryCredentials({
            params: { RoleArn: config.GREENLIGHT_QUEUE_ROLE_ARN, RoleSessionName: 'labkoat-greenlight-peek' },
            clientConfig: { region: config.AWS_REGION },
        }),
    });
    const { Messages: messages = [] } = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: config.GREENLIGHT_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
        VisibilityTimeout: remove ? 30 : 0, // 0: still there for the real consumer the moment we look
        MessageAttributeNames: ['All'],
    }));
    if (!messages.length) console.log('No messages on the queue');

    for (const message of messages) {
        const body = (() => {
            try {
                return JSON.parse(message.Body);
            } catch {
                return null;
            }
        })();
        const jobId = message.MessageAttributes?.jobId?.StringValue ?? '(no jobId)';
        const kind = body?.header?.messageType ?? '(no header)';
        const pull = body?.body?.contents?.pullData;
        console.log(`${message.MessageId}  job ${jobId}  ${kind}  pullData: ${pull ? `${JSON.stringify(pull).length} bytes` : 'absent'}`);
        if (remove) {
            await sqs.send(new DeleteMessageCommand({ QueueUrl: config.GREENLIGHT_QUEUE_URL, ReceiptHandle: message.ReceiptHandle }));
            console.log('  deleted');
        }
    }
}

/** A person's token, from the environment's credentials. */
function signInPerson() {
    const { GREENLIGHT_USERNAME: username, GREENLIGHT_PASSWORD: password } = process.env;
    if (!username || !password) throw new Error('Set GREENLIGHT_USERNAME and GREENLIGHT_PASSWORD');
    return signIn(username, password);
}

/** A machine's token, from the environment's credentials. */
function signInMachine() {
    const { GREENLIGHT_CLIENT_ID: clientId, GREENLIGHT_CLIENT_SECRET: clientSecret } = process.env;
    if (!clientId || !clientSecret) throw new Error('Set GREENLIGHT_CLIENT_ID and GREENLIGHT_CLIENT_SECRET');
    return machineToken(clientId, clientSecret);
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            api: { type: 'string', default: 'http://localhost:8080' },
            delete: { type: 'boolean', default: false },
            client: { type: 'boolean', default: false },
            organisation: { type: 'string' },
        },
    });
    const [command, arg] = positionals;

    if (command === 'peek') {
        await peek({ remove: values.delete });
        return;
    }
    const base = `${values.api.replace(/\/$/, '')}/api/greenlight/submissions`;

    if (!['post', 'list', 'publish'].includes(command) || (command !== 'list' && !arg)) {
        console.log('Usage: npm run greenlight -- post <file.json> [--client] [--organisation <name>] | list | publish <id> '
            + '[--api <url>] | peek [--delete]');
        process.exitCode = 1;
        return;
    }
    if (values.client && command !== 'post') throw new Error('A machine client may only post');

    const body = command === 'post' ? readSubmission(arg) : null; // Read before signing in
    const token = values.client ? await signInMachine() : await signInPerson();

    if (command === 'post') {
        const query = values.organisation ? `?organisation=${encodeURIComponent(values.organisation)}` : '';
        const created = await api(`${base}${query}`, token, { method: 'POST', body });
        console.log(`Posted ${arg} as ${created.id} for ${created.organisation} (expires ${created.expiresAt})`);
    } else if (command === 'list') {
        const held = await api(base, token);
        if (!held.length) console.log('No unpublished submissions');
        held.forEach((s) => console.log(`${s.id}  ${s.organisation}  from ${s.submittedBy}  received ${s.receivedAt}  `
            + `${JSON.stringify(s.data).length} bytes`));
    } else {
        const done = await api(`${base}/${encodeURIComponent(arg)}/publish`, token, { method: 'POST' });
        const sent = done.messageId ? `, sent as message ${done.messageId}` : ', but the API reported no message (is it running the queue code?)';
        console.log(`Published ${done.id} at ${done.publishedAt}${sent}`);
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
