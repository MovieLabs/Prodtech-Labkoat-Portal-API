import 'dotenv/config'; // This should always be first line in a module

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { awsSecrets, serviceToken } from 'mlHelpers';

import errorHandler from '../src/errors/errorHandler.js';
import InvalidRoute from '../src/errors/InvalidRoute.js';
import adminRouter from '../src/routes/admin-router.js';
import greenlightRouter from '../src/routes/greenlight-router.js';
import ingestRouter from '../src/routes/ingest-router.js';
import omcRouter from '../src/routes/omc-router.js';
import pipelineRouter from '../src/routes/pipeline-router.js';
import routeLog from '../src/routes/routeLog.js';
import { vocabRouter, vocabSetup } from '../src/routes/vocab-router.js';

import config from './config.js';
import { oktaSetup } from './controllers/oktaInterface.js';
import { localStorageRoot } from './pipeline/projectConfig.js';
import { setPipelineSecrets } from './pipeline/secrets.js';

const app = express();

/**
 * Origins the browser may call this service from.
 *
 * An `Origin` header is scheme + host + port and never carries a path, so these must have no
 * trailing slash — with one, nothing matches. Vite also falls back to 5174 when 5173 is taken, so
 * both dev ports are listed.
 */
const ALLOWED_ORIGINS = [
    'https://staging.labkoat.media',
    'https://labkoat.media',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
];

/**
 * CORS configuration.
 *
 * `cors()` takes an options object. It was previously handed a bare array, which it read as
 * options with no `origin` key — so it fell through to the default of `*` and every origin was
 * allowed. The list below is now actually enforced, which is a real change in behaviour: an origin
 * that is not on it will start being refused.
 *
 * A rejected origin is logged rather than failing silently, because the browser reports it only as
 * an opaque CORS error with nothing to say about which origin was refused.
 *
 * No `credentials: true`: the Portal authenticates with a bearer token, not cookies, and enabling
 * credentialled requests would also forbid the `*` fallback these routes do not rely on.
 */
const corsOptions = {
    origin(origin, callback) {
        // No Origin header at all: curl, a server-to-server call, or a same-origin request.
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }
        console.warn(`CORS: refused origin ${origin}`);
        callback(null, false);
    },
};

export default async function apiServer() {
    const secrets = await awsSecrets({
        region: config.AWS_REGION,
        arn: config.SECRET_ARN,
    });
    await oktaSetup(secrets);
    await vocabSetup(secrets);
    setPipelineSecrets(secrets); // So pipeline dispatch can hand a run only what it declared
    // await serviceSetup(secrets);
    await serviceToken.setup({
        issuer: config.OKTA_LABKOAT_SERVICE_API_ISSUER, // The URL for the Authorization server that is issuing the token
        scope: config.OKTA_LABKOAT_SERVICE_API_DEFAULT_SCOPE, // Scopes are not applicable in our application
        clientId: config.OKTA_LABKOAT_SERVICE_API_CLIENT_ID,
        clientSecret: secrets.LABKOAT.LABKOAT_SERVICE_API,
    });

    app.use(cookieParser());

    app.use(express.urlencoded()); // Need both of these to receive JSON in body
    app.use(express.json({
        limit: 1024 * 1024,
        type: 'application/json',
    }));

    app.use(express.static('public')); // Folder for images

    // app.use(bodyParser.json({ limit: 1024 * 1024, type: 'application/json' }));
    app.use(cors(corsOptions)); // Enable CORS

    app.use(routeLog); // Console log the route being requested

    // Catch JWT errors and return a 401
    app.use(((err, req, res, next) => {
        if (err.name === 'UnauthorizedError') {
            res.status(401)
                .send('Invalid token...');
        } else {
            next(err);
        }
    }));

    // app.use('/api/okta', okta); // Add the route controllers for Okta
    app.use('/api/admin', adminRouter); // Add the route controllers for the Admin page
    app.use('/api/omc/v1', omcRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/vocab', vocabRouter);
    app.use('/api/greenlight', greenlightRouter);
    app.use('/api/pipeline/v1', pipelineRouter); // Select, feed and run an OMC processing pipeline
    app.use('/api/ingest/v1', ingestRouter); // Files as OMC assets; same modules, its own contract

    // Where pipeline uploads go is the first thing anyone asks when a run behaves unexpectedly,
    // and it is not visible from outside the process. Say it once, at startup.
    const localRoot = localStorageRoot();
    console.log(localRoot
        ? `Pipeline storage: PIPELINE_STORAGE=local, writing to ${localRoot}`
        : `Pipeline storage: PIPELINE_STORAGE=s3, bucket ${config.PIPELINE_BUCKET}, `
            + 'one prefix per project');
    // app.use('/api/token-exchange', token-exchange); // Route and controllers for testing the token-exchange token

    // Error handling
    app.use('/:universalURL', (req, res, next) => next(new InvalidRoute())); // Catch all invalid routes
    app.use(errorHandler); // Send error messages to the client

    // Launch the API Server at localhost:8080
    app.listen(8080, () => {
        console.log('Updated: 3/24/26');
        console.log('Listening on port: 8080');
    });
}
