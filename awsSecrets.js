/**
 * Configuration variables for different deployments
 *
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const { fgaSetup } = require('./controllers/auth0Interface');
const { oktaSetup } = require('./controllers/oktaInterface');
const { fMamSetup } = require('./controllers/directory/okta/fMam');
const { opaSetup } = require('./routes/opa-router');
const { serviceSetup } = require('./helpers/serviceToken');

const AWS_REGION = 'us-west-2';
const secretEnv = {
    LABKOAT: 'arn:aws:secretsmanager:us-west-2:113736696237:secret:labkoatportal.spi-K7k7fd',
    FMAM: 'arn:aws:secretsmanager:us-west-2:113736696237:secret:fmam-xNWfhP',
};

const awsClient = new SecretsManagerClient({ region: AWS_REGION });

// AWS Credentials will be loaded from:
// Local dev: $HOME/.aws/credentials will be mounted in the container
// Service mesh: Pod's IAM Role

let awsSecrets = {};

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

async function fetchSecret(SecretId, secretKey) {
    const command = new GetSecretValueCommand({ SecretId });
    try {
        const secretValue = await awsClient.send(command);
        return [secretKey, JSON.parse(secretValue.SecretString)];
    } catch (err) {
        console.log(`getSecrets error ${err.code}`);
        throw err;
    }
}

async function setupSecrets() {
    const secretsPromise = Object.keys(secretEnv).map((key) => fetchSecret(secretEnv[key], key));
    const res = await Promise.all(secretsPromise);

    // Add the secrets using getters to the secrets object
    awsSecrets = res.reduce((obj, [key, v]) => {
        return Object.defineProperty(obj, key, {
            get() {
                return v;
            },
        });
    }, {});

    // Pass the secrets into the various interfaces that need to setup clients
    await fgaSetup(awsSecrets);
    await oktaSetup(awsSecrets);
    await fMamSetup(awsSecrets);
    await opaSetup(awsSecrets);
    await serviceSetup(awsSecrets);
}

retryPromise(setupSecrets, 10, 5000).then((res) => {
    console.log('Got AWS secrets');
}).catch((err) => {
    console.log('Error retrieving AWS secrets');
    console.log(err);
});

module.exports = awsSecrets;
