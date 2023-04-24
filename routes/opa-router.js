const express = require('express');
const { jwtAuthz } = require('@aserto/aserto-node');

const config = require('../config');

const router = express.Router();
let checkAuthz = (req, res, next) => {
    console.log('Test');
    next();
};
let checkAserto = () => {};

/**
 * TODO: This is not being setup correctly because the checkAuthZ needs the secret before the router is setup!
 */
async function opaSetup(secrets) {
    const authzOptions = {
        authorizerServiceUrl: config.ASERTO_AUTHORIZER_SERVICE_URL,
        policyId: config.ASERTO_POLICY_ID,
        policyRoot: config.ASERTO_POLICY_ROOT,
        tenantId: config.ASERTO_TENANT_ID,
        instanceName: config.ASERTO_POLICY_INSTANCE_NAME,
        instanceLabel: config.ASERTO_POLICY_INSTANCE_LABEL,
        authorizerApiKey: secrets.ASERTO_AUTHORIZER_API_KEY,
    };

    // Aserto authorizer middleware function
    checkAuthz = jwtAuthz(authzOptions);
    checkAserto = (async (req, res, next) => {
        const authorization = await checkAuthz(req, res, next);
        req.aserto = authorization;
        next();
    });
}

// Protected API endpoint
router.get('/protected', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Here you go, very sensitive information for ya!',
    });
});

// Protected API endpoint
router.get('/role', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Congrats you are authorized because you are an editor',
    });
});

// Protected API endpoint
router.get('/group', checkAuthz, (req, res) => {
    // send the response
    res.json({
        secretMessage: 'Welcome you may access this API as a member of labkoat.media',
    });
});

module.exports = {
    opaSetup,
    opaRouter: router,
};
