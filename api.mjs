import 'dotenv/config'; // This should always be first line in a module

import express from 'express';
// import session from 'express-session';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import cors from 'cors';

import awsSecrets from './awsSecrets.mjs'; // Runs the code to populate secrets from AWS secrets manager
// const admin = require('./src/routes/admin-router');
// import okta from './src/routes/directory-router.mjs';
import InvalidRoute from './src/errors/InvalidRoute.mjs';
import errorHandler from './src/errors/errorHandler.mjs';
import approval from './src/routes/approval-router.mjs';
import adminRouter from './src/routes/admin-router.mjs';
import omcRouter from './src/routes/omc-router.mjs';
import { vocabRouter } from './src/routes/vocab-router.mjs';

const app = express();

async function setup() {
    app.use(express.urlencoded()); // Need both of these to receive JSON in body
    app.use(express.json());
    app.use(express.static('public')); // Folder for images
    app.use(cookieParser());
    app.use(bodyParser.json({ limit: 1024 * 1024, type: 'application/json' }));
    app.use(cors([
        'https://staging.labkoat.media/',
        'https://labkoat.media/',
        'http://localhost:3000/',
    ])); // Enable CORS

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
    app.use('/api/approval', approval); // Add the route controllers for the Approvals page
    app.use('/api/omc/v1', omcRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/vocab', vocabRouter);
    // app.use('/api/token-exchange', token-exchange); // Route and controllers for testing the token-exchange token

    // Error handling
    app.use('/:universalURL', (req, res, next) => next(new InvalidRoute())); // Catch all invalid routes
    app.use(errorHandler); // Send error messages to the client

    // Launch the API Server at localhost:8080
    app.listen(8080);
    console.log('Updated: 4/14/25')
    console.log('Listening on port: 8080');
}

setup().catch((err) => {
    console.log(err);
}); // Setup and start the server
