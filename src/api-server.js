import 'dotenv/config'; // This should always be first line in a module

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { awsSecrets, serviceToken } from 'mlHelpers';

import errorHandler from '../src/errors/errorHandler.js';
import InvalidRoute from '../src/errors/InvalidRoute.js';
import adminRouter from '../src/routes/admin-router.js';
import greenlightRouter from '../src/routes/greenlight-router.js';
import omcRouter from '../src/routes/omc-router.js';
import routeLog from '../src/routes/routeLog.js';
import { vocabRouter, vocabSetup } from '../src/routes/vocab-router.js';

import config from './config.js';
import { oktaSetup } from './controllers/oktaInterface.js';

const app = express();

export default async function apiServer() {
    const secrets = await awsSecrets({
        region: config.AWS_REGION,
        arn: config.SECRET_ARN,
    });
    await oktaSetup(secrets);
    await vocabSetup(secrets);
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
    app.use(cors([
        'https://staging.labkoat.media/',
        'https://labkoat.media/',
        'http://localhost:3000/',
        'http://localhost:5173/',
    ])); // Enable CORS

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
