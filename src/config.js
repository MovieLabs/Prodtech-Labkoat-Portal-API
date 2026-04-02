/**
 * Provides configuration variables for different environments
 *
 * A set of default variables and values can be provided, which are then overwritten based on the current env setting
 *
 * @function config
 * @returns {Object} // A set of constants based on the current runtime environment
 */

const configEnv = {
    default: {
        JWKS_URI: '"https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M/.well-known/jwks.json',
        USER_POOL_ID: 'us-west-2_EW6OVSs8M',
        CLIENT_ID: '7mo1c0om06ubavs3d30jhak2mj',
        ISSUER: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M',
        AUDIENCE: '7mo1c0om06ubavs3d30jhak2mj',
        FMAM_URL: 'https://service.labkoat.media/fmam/api',
        GRAPHQL_URL: 'https://service.labkoat.media/fmam/graphql',
        YAMDU_URL: 'https://app.yamdu.com/thirdpartyapi/v1/omc/',
        YAMDU_PROJECT: '119374',
        OKTA_LABKOAT_SERVICE_API_ISSUER: 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697',
        OKTA_LABKOAT_SERVICE_API_DEFAULT_SCOPE: 'labkoat_api',
        OKTA_LABKOAT_SERVICE_API_CLIENT_ID: '0oa55vfp9wLx8dxIF697',
        AWS_NEO4J_URI: 'neo4j://35.85.154.154:7687',
        AWS_NEO4J_USERNAME: 'neo4j',
        AWS_NEO4J_DATABASE: 'neo4j',
        AWS_REGION: 'us-west-2',
        SECRET_ARN: {
            LABKOAT: 'arn:aws:secretsmanager:us-west-2:113736696237:secret:labkoatportal.spi-K7k7fd',
            FMAM: 'arn:aws:secretsmanager:us-west-2:113736696237:secret:fmam-xNWfhP',
        },
        // projects: {
        //     nbc: 'NBC',
        //     europa: 'Europa1',
        //     hsm: 'POC6',
        //     rebelFleet: 'RebelFleet',
        //     yamdu: 'Yamdu',
        //     filmustage: 'filmustage',
        // },
    },
    local: {
        FMAM_URL: 'http://localhost:4001/fmam/api', // fMam running on localhost
        GRAPHQL_URL: 'http://localhost:4001/fmam/graphql', // fMam graphQl running on localhost
    },
    aws: {},
};

// Determine the current runtime environment from the cli arguments and validate it against the available environments
const { argv } = process; // env argument should be set in the command line
const argEnv = argv.filter((arg) => arg.includes('env='))
    .map((arg) => arg.replace('env=', ''))[0];
const envNames = Object.keys(configEnv);
const env = (envNames.includes(argEnv)) ? argEnv : 'default';

// Create the base set of constants using the default setting combined with the current environment setting
const environment = { ...configEnv.default, ...configEnv[env] };
console.log(`Environment: ${env}`);

// Create the return object using getters for each constant
const config = Object.keys(environment)
    .reduce((c, key) => Object.defineProperty(c, key, {
        get() {
            return environment[key];
        },
    }), {});

export default config;
