require('dotenv')
    .config();
const express = require('express');
const bodyParser = require('body-parser');
const { expressjwt: jwt } = require('express-jwt');
const { Auth0FgaApi } = require('@auth0/fga');
const {
    jwtAuthz,
    ds,
} = require('@aserto/aserto-node');
const jwksRsa = require('jwks-rsa');
const cors = require('cors');

const {
    admin,
    view,
} = require('./auth0fga/authorize');
const { updatePolicy } = require('./auth0fga/policy');
const { serveImage } = require('./serve-image');

const app = express();

console.log('env check');
console.log(process.env.AUTHORIZER_SERVICE_URL);

const authzOptions = {
    authorizerServiceUrl: process.env.ASERTO_AUTHORIZER_SERVICE_URL,
    policyId: process.env.ASERTO_POLICY_ID,
    policyRoot: process.env.ASERTO_POLICY_ROOT,
    authorizerApiKey: process.env.ASERTO_AUTHORIZER_API_KEY,
    tenantId: process.env.ASERTO_TENANT_ID,
    instanceName: process.env.ASERTO_POLICY_INSTANCE_NAME,
    instanceLabel: process.env.ASERTO_POLICY_INSTANCE_LABEL,
};

const fgaClient = new Auth0FgaApi({
    environment: process.env.FGA_ENVIRONMENT,
    storeId: process.env.FGA_STORE_ID,
    clientId: process.env.FGA_CLIENT_ID,
    clientSecret: process.env.FGA_CLIENT_SECRET,
});

// Aserto authorizer middleware function
const checkAuthz = jwtAuthz(authzOptions);
const checkAserto = (async (req, res, next) => {
    const authorization = await checkAuthz(req, res, next);
    req.aserto = authorization;
    next();
});

const checkJwt = jwt({
    // Dynamically provide a signing key based on the kid in the header and the signing keys provided by the JWKS endpoint
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: process.env.JWKS_URI,
    }),

    // Validate the audience and the issuer
    audience: process.env.AUDIENCE,
    issuer: process.env.ISSUER,
    algorithms: ['RS256'],
});

let modelId = null;

async function setModelId() {
    const response = await fgaClient.readAuthorizationModels();
    modelId = response.authorization_models[0].id;
    console.log(modelId);
}

console.log('Key set');
console.log(process.env.JWKS_URI);

app.use(bodyParser.json()); // Use the body parser set to JSON
app.use(express.static('public')); // Folder for images
app.use(cors()); // Enable CORS

// Protected API endpoint
app.get('/api/protected', checkJwt, async (req, res) => {
    console.log('Check api/protected');
    if (modelId === null) await setModelId(); // Set the modelId, if not already set;
    console.log(`Model ID: ${modelId}`);
    const { auth } = req;
    const user = auth.email;
    try {
        const { allowed } = await fgaClient.check({
            authorization_model_id: modelId,
            tuple_key: {
                user: `user:${user}`,
                relation: 'viewer',
                object: 'asset:ast-001',
            },
        });
        console.log(`Authz says: ${allowed}`);
        res.json({
            secretMessage: 'This has protected data which you can access because you belong to labkoat.media',
        });
    } catch (err) {
        // console.log(err);
        res.statusCode = 400;
        res.message = 'Not authorized';
        res.json({
            secretMessage: 'Not Authorized',
        });
    }
});

app.get('/api/auth0fga/asset', checkJwt, view, async (req, res) => {
    console.log('auth0fga/asset');
    res.status = 200;
    res.json({
        secretMessage: 'The asset is all yours',
    });
});

app.post('/api/auth0fga/asset', checkJwt, view, (req, res) => {
    // console.log('auth0fga/asset');
    const { body } = req;
    serveImage(req, res);
});

app.get('/api/auth0fga/image', checkJwt, view, async (req, res) => {
    console.log('auth0fga/image');
    res.status = 200;
    res.json({
        secretMessage: 'The asset is all yours',
    });
});

app.get('/api/auth0fga/admin', checkJwt, admin, async (req, res) => {
    console.log('auth0fga/admin');
    res.status = 200;
    res.json({
        secretMessage: 'Policy updated',
    });
});

app.post('/api/auth0fga/admin', checkJwt, admin, async (req, res, next) => {
    const { body } = req;
    try {
        const policy = await updatePolicy(body); // The policy to update
        console.log(`Result of policy update: ${policy}`);
        res.send('Updated the admin');
    } catch (err) {
        res.status(500)
            .send(err);
    }
});

// Protected API endpoint
app.get('/api/aserto/protected', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Here you go, very sensitive information for ya!',
    });
});

// Protected API endpoint
app.get('/api/workflow/role', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Congrats you are authorized because you are an editor',
    });
});

// Protected API endpoint
app.get('/api/workflow/group', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Welcome you may access this API as a member of labkoat.media',
    });
});

setModelId();

// Launch the API Server at localhost:8080
app.listen(8080);

async function checkIs() {
    const params = {
        authorizerServiceUrl: process.env.ASERTO_AUTHORIZER_SERVICE_URL,
        policyId: process.env.ASERTO_POLICY_ID,
        policyRoot: process.env.ASERTO_POLICY_ROOT,
        authorizerApiKey: process.env.ASERTO_AUTHORIZER_API_KEY,
        tenantId: process.env.ASERTO_TENANT_ID,
        instanceName: process.env.ASERTO_POLICY_INSTANCE_NAME,
        instanceLabel: process.env.ASERTO_POLICY_INSTANCE_LABEL,
        object: { key: 'euang@acmecorp.com' },
        subject: { key: 'euang@acmecorp.com' },
    };
    try {
        const allowed = await ds(params);
        if (allowed) {
            console.log('Result was true');
        } else {
            console.log('Result was false');
        }
    } catch (err) {
        console.log(err);
    }
}

checkIs();
