const { SecretsManager } = require('@aws-sdk/client-secrets-manager');

const AWS_SECRET_ARN = 'arn:aws:secretsmanager:us-west-2:113736696237:secret:Prodtech/Storage-VAHIqP';
const AWS_REGION = 'us-west-2';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryPromise(promiseFunction, maxRetries, delayMs) {
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const result = await promiseFunction();
            return result;
        } catch (error) {
            retries += 1;
            console.log(`Attempt ${retries} failed. Retrying...`);
            await delay(delayMs);
        }
    }

    throw new Error(`Failed after ${maxRetries} attempts`);
}

// AWS Credentials will be loaded from:
// Local dev: $HOME/.aws/credentials will be mounted in the container
// Service mesh: Pod's IAM Role
async function getSecretsAttempt() {
    const secretsManagerInstance = new SecretsManager({ region: AWS_REGION });
    try {
        const secretValue = await secretsManagerInstance.getSecretValue({ SecretId: AWS_SECRET_ARN });
        return JSON.parse(secretValue.SecretString);
    } catch (err) {
        console.log(`getSecrets error ${err.code}`);
        console.log(err);
        throw err;
    }
}

async function getSecrets() {
    return retryPromise(getSecretsAttempt, 10, 5000);
}

module.exports = getSecrets;
