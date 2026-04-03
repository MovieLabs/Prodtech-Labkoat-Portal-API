/**
 * Retrieve secrets from one or more AWS secrets stores
 *
 * AWS Credentials will be loaded from:
 * Local dev: $HOME/.aws/credentials will be mounted in the container
 *
 * @module awsSecrets
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const delay = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const maxRetries = 10;

async function fetchSecret(awsClient, SecretId, secretKey) {
    const command = new GetSecretValueCommand({ SecretId });
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const secretValue = await awsClient.send(command);
            return [secretKey, JSON.parse(secretValue.SecretString)];
        } catch (err) {
            console.log(`AWS get secrets error ${err.code}`);
            retries += 1;
            console.log(`Attempt ${retries} failed. Retrying...`);
            await delay(1000);
        }
    }
    throw new Error(`Failed AWS secrets after ${maxRetries} attempts`);
}

/**
 * Retrieves secrets from AWS secrets stores
 * @function awsSecrets
 * @template {Object.<string, string>} T
 * @param {Object} params - Secrets parameters
 * @param {string} params.region - The AWS region of the secrets store
 * @param {T} params.arn - Object of named ARNs, e.g. { LABKOAT: "arn2:...", FMAM: "arn2:..." }
 * @returns {Promise<{[K in keyof T]: Object.<string, string>}>}
 */

export default async function awsSecrets(params) {
    const {
        arn = {},
        region = 'us-west-2',
    } = params;

    const awsClient = new SecretsManagerClient({ region });

    const secretPromise = Object.keys(arn)
        .map((key) => fetchSecret(awsClient, arn[key], key));
    const res = await Promise.all(secretPromise);

    return res.reduce((obj, [key, v]) => Object.defineProperty(obj, key, {
        get() {
            return v;
        },
    }), {});
}
