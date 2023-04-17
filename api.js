require('dotenv')
    .config();
const express = require('express');
const bodyParser = require('body-parser');
// const { expressjwt: jwt } = require('express-jwt');
const cors = require('cors');

const secrets = require('./awsSecrets'); // Runs the code to populate secrets from AWS secrets manager
const config = require('./config');
const auth0fga = require('./routes/auth0fga-router');
const admin = require('./routes/admin-router')
const okta = require('./routes/directory-router');
const { opaRouter } = require('./routes/opa-router');
const jwtValidator = require('./util/JwtValidator');

const app = express();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

async function setup() {
    app.use(bodyParser.json()); // Use the body parser set to JSON
    app.use(express.static('public')); // Folder for images
    app.use(cors()); // Enable CORS

    app.use('/api/admin', admin); // Add the route controllers for Auth0Fga
    app.use('/api/auth0fga', auth0fga); // Add the route controllers for Auth0Fga
    app.use('/api/okta', okta); // Add the route controllers for Okta
    app.use('/api/opa', opaRouter); // Add the route controllers for the OPA policy tests using Aserto

// Launch the API Server at localhost:8080
    app.listen(8080);
}

setup().catch((err) => {console.log(err)}) // Setup and start the server

