require('dotenv')
    .config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

require('./awsSecrets'); // Runs the code to populate secrets from AWS secrets manager
const auth0fga = require('./routes/auth0fga-router');
const admin = require('./routes/admin-router');
const okta = require('./routes/directory-router');
const approval = require('./routes/approval-router');
const assets = require('./routes/asset-router');
const { omcRouter } = require('./routes/omc-router');
const test = require('./routes/test-router');
const { opaRouter } = require('./routes/opa-router');

const { newTask } = require('./controllers/admin/processTask');
const omcTask = require('./controllers/task/omcTaskInput');
const { OmcModel } = require('./helpers/omc');

const app = express();

async function setup() {
    app.use(bodyParser.json()); // Use the body parser set to JSON
    app.use(express.static('public')); // Folder for images
    app.use(cors([
        'https://staging.labkoat.media/',
        'https://labkoat.media/',
        'http://localhost:3000/',
    ])); // Enable CORS

    app.use('/api/admin', admin); // Add the route controllers for Auth0Fga
    app.use('/api/auth0fga', auth0fga); // Add the route controllers for Auth0Fga
    app.use('/api/okta', okta); // Add the route controllers for Okta
    app.use('/api/approval', approval); // Add the route controllers for the Approvals page
    app.use('/api/asset', assets);
    app.use('/api/opa', opaRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/omc', omcRouter); // Add the route controllers for the OPA policy tests using Aserto
    app.use('/api/test', test); // Route and controllers for testing the test token

    await newTask(omcTask.input1);
    await newTask(omcTask.input2);
    await newTask(omcTask.input3);
    await newTask(omcTask.input4);

    // Launch the API Server at localhost:8080
    app.listen(8080);
    console.log('Listening on port: 8080');
}

setup().catch((err) => {
    console.log(err);
}); // Setup and start the server
