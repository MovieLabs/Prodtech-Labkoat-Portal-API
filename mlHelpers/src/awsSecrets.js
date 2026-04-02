/**
 * Configuration variables for different deployments
 *
 * AWS Credentials will be loaded from:
 * Local dev: $HOME/.aws/credentials will be mounted in the container
 * Service mesh: Pod's IAM Role
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

export default async function awsSecrets(params) {
    const {
        arn = {},
        region = 'us-west-2',
    } = params;

    const awsClient = new SecretsManagerClient({ region });
    // const credentials = await awsClient.config.credentials(); // Check the credentials have been retrieved successfully
    // console.log(credentials);
    // console.log('Access Key:', credentials.accessKeyId);

    const secretPromise = Object.keys(arn)
        .map((key) => fetchSecret(awsClient, arn[key], key));
    const res = await Promise.all(secretPromise);

    return res.reduce((obj, [key, v]) => Object.defineProperty(obj, key, {
        get() {
            return v;
        },
    }), {});
}
