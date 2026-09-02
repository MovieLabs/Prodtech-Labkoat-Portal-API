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
        JWKS_URI: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M/.well-known/jwks.json',
        USER_POOL_ID: 'us-west-2_EW6OVSs8M',
        CLIENT_ID: '7mo1c0om06ubavs3d30jhak2mj',
        ISSUER: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_EW6OVSs8M',
        AUDIENCE: '7mo1c0om06ubavs3d30jhak2mj',
        FMAM_URL: 'https://service.labkoat.media/fmam/api',
        GRAPHQL_URL: 'https://service.labkoat.media/fmam/graphql',
        // The machine credential this service presents to fMam. A Cognito client_credentials grant:
        // the token carries `client_id` and `scope` but no `cognito:groups`, so it is not a user.
        // The token endpoint lives on the pool's hosted domain, not on the issuer host.
        COGNITO_TOKEN_URL: 'https://us-west-2ew6ovss8m.auth.us-west-2.amazoncognito.com/oauth2/token',
        COGNITO_M2M_SCOPE: 'labkoat/fmam.access',
        COGNITO_M2M_CLIENT_ID: '30l6v3jcm9v3jcunvb3jinco3m', // app client 'api.services.labkoat'
        // Who a caller is, in words. An access token carries `sub` and `username` and no email, and
        // where a pool signs people in by an email alias those two are the same opaque uuid -- so a
        // record stamped from the token alone reads `58011380-e091-...` and names nobody. This
        // endpoint answers for the token presented to it, so the name comes from the issuer rather
        // than from the client. Same hosted domain as the token URL.
        COGNITO_USERINFO_URL: 'https://us-west-2ew6ovss8m.auth.us-west-2.amazoncognito.com/oauth2/userInfo',
        // The vocabulary's Mongo store. Same cluster and same credentials fMam uses — the
        // gateway already holds SECRET_ARN.FMAM, so this needs no new secret to rotate. The
        // collections sit in `app_config` beside `projects` and `mappingTemplates`, all of them
        // prefixed `vocab_`, because the cluster is shared and users name their own collections.
        VOCAB_MONGO_URL: 'mongodb+srv://${username}:${password}@ml-prodtech.inwvg0.mongodb.net/?appName=ML-Prodtech',
        VOCAB_DB: 'app_config',
        AWS_REGION: 'us-west-2',
        // Pipeline execution. Runs happen in worker threads in this process, so these bound what
        // one request can cost the gateway. The per-project S3 bucket is NOT here: it lives on the
        // project's record in fMam, so adding a project needs no redeploy.
        PIPELINE_MAX_UPLOAD_BYTES: 2 * 1024 * 1024 * 1024, // 2 GB — camera-adjacent deliveries are large
        PIPELINE_WORKER_COUNT: 2,
        PIPELINE_WORKER_MEMORY_MB: 1024, // A runaway parse kills its worker, not the pod
        PIPELINE_RUN_TIMEOUT_MS: 15 * 60 * 1000,
        PIPELINE_RUN_TTL_MS: 30 * 60 * 1000, // How long a finished run stays readable
        // Where pipeline and ingest uploads go:
        //   's3'    — each project's own bucket, read from its fMam record. The deployed default.
        //   'local' — a directory on this machine, so the whole upload → run → poll path works
        //             before any bucket, IAM role or project storage record exists.
        // The `local` environment below defaults to 'local'. Override either from
        // Labkoat-API/.env, which dotenv loads before this file is read.
        PIPELINE_STORAGE: process.env.PIPELINE_STORAGE || 's3',
        // The master bucket, subdivided by project: <project>/<pipelineId>/<filename>. A project
        // record may name its own bucket instead; almost none will. Versioning must be enabled on
        // it — uploads overwrite in place, and that is what makes the previous bytes recoverable.
        PIPELINE_BUCKET: process.env.PIPELINE_BUCKET || 'labkoat-project',
        // Directory 'local' storage writes to and reads back, resolved against Labkoat-API rather
        // than the working directory. References become `file://<path relative to it>` and one
        // resolving outside it is refused — a service that will read any path a client names is a
        // file-disclosure hole, which is why 'local' is not the deployed default.
        PIPELINE_LOCAL_ROOT: process.env.PIPELINE_LOCAL_ROOT || '.pipeline-local',
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
        // No bucket needed to develop against. Set PIPELINE_STORAGE=s3 in Labkoat-API/.env to use
        // the project's real bucket from here instead.
        PIPELINE_STORAGE: process.env.PIPELINE_STORAGE || 'local',
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
