import 'dotenv/config'; // This should always be first line in a module

import express from 'express';
import cors from 'cors';

import awsSecrets from './awsSecrets.mjs'; // Runs the code to populate secrets from AWS secrets manager
// const auth0fga = require('./src/routes/auth0fga-router');
// const admin = require('./src/routes/admin-router');
// import okta from './src/routes/directory-router.mjs';
import approval from './src/routes/approval-router.mjs';
// const assets = require('./src/routes/asset-router');
import { omcRouter } from './src/routes/omc-router.mjs';
import { vocabRouter } from './src/routes/vocab-router.mjs';
// import test from './src/routes/test-router';
// const { opaRouter } = require('./src/routes/opa-router');

const app = express();

async function setup() {
    app.use(express.urlencoded()); // Need both of these to receive JSON in body
    app.use(express.json());
    app.use(express.static('public')); // Folder for images
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

    // app.use('/api/admin', admin); // Add the route controllers for Auth0Fga
    // app.use('/api/auth0fga', auth0fga); // Add the route controllers for Auth0Fga
    // app.use('/api/okta', okta); // Add the route controllers for Okta
    app.use('/api/approval', approval); // Add the route controllers for the Approvals page
    // app.use('/api/asset', assets);
    // app.use('/api/opa', opaRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/omc', omcRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/vocab', vocabRouter);
    // app.use('/api/test', test); // Route and controllers for testing the test token

    // Error handling
    app.use((err, req, res) => {
        console.log(err);
        res.status(500)
            .send(err.message);
    });

    // Launch the API Server at localhost:8080
    app.listen(8080);
    console.log('Listening on port: 8080');
}

setup().catch((err) => {
    console.log(err);
}); // Setup and start the server
