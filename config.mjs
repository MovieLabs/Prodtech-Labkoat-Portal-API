/**
 * Configuration variables for different environments
 *
 */

const configEnv = {
    default: {
        // JWKS_URI: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697/v1/keys',
        // ISSUER: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697',
        // AUDIENCE: 'https://service.labkoat.media',
        JWKS_URI: '"https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M/.well-known/jwks.json',
        USER_POOL_ID: 'us-west-2_EW6OVSs8M',
        CLIENT_ID: '7mo1c0om06ubavs3d30jhak2mj',
        ISSUER: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M',
        AUDIENCE: '7mo1c0om06ubavs3d30jhak2mj',
        FMAM_URL: 'https://service.labkoat.media/fmam/api',
        // GRAPHQL_URL: 'https://service.labkoat.media/graphql/api',
        GRAPHQL_URL: 'https://service.labkoat.media/fmam/graphql',
        YAMDU_URL: 'https://app.yamdu.com/thirdpartyapi/v1/omc/',
        YAMDU_PROJECT: '119374',
        OKTA_LABKOAT_SERVICE_API_ISSUER: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697',
        OKTA_LABKOAT_SERVICE_API_DEFAULT_SCOPE: 'labkoat_api',
        OKTA_LABKOAT_SERVICE_API_CLIENT_ID: '0oa55vfp9wLx8dxIF697',
        // FMAM_MONGO_URL: 'mongodb://${username}:${password}@service.labkoat.media/admin:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&ssl=false',
        // FMAM_MONGO_DB: 'Europa1',
        AWS_NEO4J_URI: 'neo4j://35.85.154.154:7687',
        AWS_NEO4J_USERNAME: 'neo4j',
        AWS_NEO4J_DATABASE: 'neo4j',
        projects: {
            nbc: 'NBC',
            europa: 'Europa1',
            hsm: 'POC6',
            rebelFleet: 'RebelFleet',
            yamdu: 'Yamdu',
            filmustage: 'filmustage',
        },
    },
    local: {
        // FMAM_URL: 'http://localhost:4001/fmam/api/omc/v1/',
        FMAM_URL: 'http://localhost:4001/fmam/api',
        GRAPHQL_URL: 'http://localhost:4001/fmam/graphql',
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

export default config;
