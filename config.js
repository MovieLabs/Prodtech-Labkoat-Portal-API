/**
 * Configuration variables for different deployments
 *
 */

const configEnv = {
    'local': {
        JWKS_URI: 'https://movielabs.okta.com/oauth2/default/v1/keys',
        ISSUER: 'https://movielabs.okta.com/oauth2/default',
        AUDIENCE: 'api://default',
        FMAM_URL: 'http://localhost:4001/graphql',
        ASERTO_POLICY_ID: '830240b0-95f3-11ed-ae53-01847ec4b2c9',
        ASERTO_POLICY_INSTANCE_NAME: 'reactinstance',
        ASERTO_POLICY_INSTANCE_LABEL: 'reactinstance',
        ASERTO_TENANT_ID: '0b096969-5706-11ed-9018-00847ec4b2c9',
        ASERTO_AUTHORIZER_SERVICE_URL: 'authorizer.prod.aserto.com:8443',
        ASERTO_POLICY_ROOT: 'asertodemo',
        LABKOAT_FGA_ENVIRONMENT: 'us',
        LABKOAT_FGA_STORE_ID: '01GV1FDKDKR1PY90EAZFEHNZFN',
        LABKOAT_FGA_CLIENT_ID: 'uDtbJrMM58QgP6e4QVKqU1HKMtGGPnVu',
        LABKOAT_FGA_API_URL: 'https://api.us1.fga.dev',
        // ASERTO_AUTHORIZER_API_KEY: '6cba0f317698e1593bfaf8fd4208a3587ef1b80d6aa64f62f8d22ef4c28ddbf8',
    },
    'aws': {
        FMAM_URL: 'https://service.labkoat.media/fmam/api',
        ASERTO_POLICY_ID: '830240b0-95f3-11ed-ae53-01847ec4b2c9',
        ASERTO_POLICY_INSTANCE_NAME: 'reactinstance',
        ASERTO_POLICY_INSTANCE_LABEL: 'reactinstance',
        ASERTO_TENANT_ID: '0b096969-5706-11ed-9018-00847ec4b2c9',
        ASERTO_AUTHORIZER_API_KEY: '6cba0f317698e1593bfaf8fd4208a3587ef1b80d6aa64f62f8d22ef4c28ddbf8',
        ASERTO_AUTHORIZER_SERVICE_URL: 'authorizer.prod.aserto.com:8443',
        ASERTO_POLICY_ROOT: 'asertodemo',
    },
};

const { argv } = process; // env argument should be set in the command line
const argEnv = argv.filter((arg) => arg.includes('env=')).map((arg) => arg.replace('env=', ''))[0];
const env = (argEnv === 'local' || argEnv === 'aws') ? argEnv : 'local'; // Ensure a valid value for config
console.log(`Environment: ${
    env
}`);
const environment = (configEnv[env]);

// Add the environment variables using getters to the config object
const config = Object.keys(environment).reduce((c, key) => {
    return Object.defineProperty(c, key, { get: function()  { return environment[key] } });
}, {})

module.exports = config;

