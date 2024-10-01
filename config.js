/**
 * Configuration variables for different environments
 *
 */

const configEnv = {
    default: {
        JWKS_URI: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697/v1/keys',
        ISSUER: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697',
        AUDIENCE: 'https://service.labkoat.media',
        FMAM_URL: 'https://service.labkoat.media/fmam/api',
        ASERTO_POLICY_ID: '830240b0-95f3-11ed-ae53-01847ec4b2c9',
        ASERTO_POLICY_INSTANCE_NAME: 'reactinstance',
        ASERTO_POLICY_INSTANCE_LABEL: 'reactinstance',
        ASERTO_TENANT_ID: '0b096969-5706-11ed-9018-00847ec4b2c9',
        ASERTO_AUTHORIZER_SERVICE_URL: 'authorizer.prod.aserto.com:8443',
        ASERTO_POLICY_ROOT: 'asertodemo',
        LABKOAT_FGA_ENVIRONMENT: 'us',
        LABKOAT_FGA_API_URL: 'https://api.us1.fga.dev',
        LABKOAT_FGA_STORE_ID: '01H0874SH174XKCCA3BD0JA0GF', // FunctionalTest store
        LABKOAT_FGA_CLIENT_ID: 'ecqIaRxBJTYPTjfCqINeAqfrfyof7EOt', // FunctionalTest Store
        OKTA_LABKOAT_SERVICE_API_ISSUER: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697',
        OKTA_LABKOAT_SERVICE_API_DEFAULT_SCOPE: 'labkoat_api',
        OKTA_LABKOAT_SERVICE_API_CLIENT_ID: '0oa55vfp9wLx8dxIF697',
        FMAM_MONGO_URL: 'mongodb://${username}:${password}@service.labkoat.media/admin:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&ssl=false',
        FMAM_MONGO_DB: 'Europa1',
        AWS_NEO4J_URI: 'neo4j://35.85.154.154:7687',
        AWS_NEO4J_USERNAME: 'neo4j',
        AWS_NEO4J_DATABASE: 'neo4j',
        projects: {
            nbc: 'NBC',
            europa: 'Europa1',
            hsm: 'POC6',
            rebelFleet: 'RebelFleet',
            yamdu: 'Yamdu',
        },
    },
    local: {
        // FMAM_URL: 'http://localhost:4001/fmam/api',
    },
    aws: {},
};

const { argv } = process; // env argument should be set in the command line
const argEnv = argv.filter((arg) => arg.includes('env='))
    .map((arg) => arg.replace('env=', ''))[0];
const envNames = Object.keys(configEnv);
const env = (envNames.includes(argEnv)) ? argEnv : 'default';
const environment = { ...configEnv.default, ...configEnv[env] };
console.log(`Environment: ${env}`);

// Add the environment variables using getters to the config object
const config = Object.keys(environment)
    .reduce((c, key) => Object.defineProperty(c, key, {
        get() {
            return environment[key];
        },
    }), {});

module.exports = config;
