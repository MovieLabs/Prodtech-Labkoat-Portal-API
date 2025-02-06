/**
 Methods for interfacing with the Okta API
 */

const fetch = require('node-fetch');
const OktaJwtVerifier = require('@okta/jwt-verifier');
const btoa = require('btoa');
const request = require('request-promise');

const aud = 'https://service.labkoat.media'; // Expected audience for the JWT
const issuer = 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697';
const sub = ['0oa55vfp9wLx8dxIF697']; // Subscriber id's of token-exchange applications that are allowed

// A new validator with the issuer url, where the jwks can be retrieved
const oktaJwtVerifier = new OktaJwtVerifier({
    issuer,
});

const {
    LABKOAT_ISSUER,
    LABKOAT_CLIENT_ID,
    LABKOAT_CLIENT_SECRET,
    LABKOAT_DEFAULT_SCOPE,
    TEST_ISSUER,
    TEST_CLIENT_ID,
    TEST_CLIENT_SECRET,
    TEST_DEFAULT_SCOPE,
} = process.env;

async function exchangeTokenController(req, res) {
    const { authorization } = req.headers;
    if (!authorization) throw new Error('Expected Bearer token');

    const [authType, token] = authorization.split(' ');
    if (authType !== 'Bearer') throw new Error('Expected a Bearer token');

    const jwt = await oktaJwtVerifier.verifyAccessToken(token, aud);

    const issuer = LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
    const scope = LABKOAT_DEFAULT_SCOPE; // The scopes being requested, given our authorization is separate this not really applicable
    const clientId = LABKOAT_CLIENT_ID;
    const clientSecret = LABKOAT_CLIENT_SECRET;

    const exchangeIssuer = TEST_ISSUER;
    const exchangeScope = TEST_DEFAULT_SCOPE;
    const exchangeClientId = TEST_CLIENT_ID;
    const exchangeClientSecret = TEST_CLIENT_SECRET;

    // Retrieve the token and its type from the response
    // const { token_type: tokenType, access_token: subjectToken } = grant;

    const params = 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange'
        + '&subject_token_type=urn:ietf:params:oauth:token-type:access_token'
        + `&subject_token=${token}`
        + `&scope=${exchangeScope}`
        + '&audience=https:token-exchange.labkoat.com';

    // const body = {
    //     grant_type: 'token-exchange',
    //     subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    //     subject_token: subjectToken,
    //     scope: exchangeScope,
    //     audience: 'https:token-exchange.labkoat.com',
    // };
    const exchangeToken = btoa(`${exchangeClientId}:${exchangeClientSecret}`); // Base 64 encode

    try {
        // Test the token against a token-exchange endpoint on the Labkoat API
        const url = `${exchangeIssuer}/v1/token`;
        const options = {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Basic ${exchangeToken}`,
                'content-type': 'application/x-www-form-urlencoded',
            },
            body: JSON.stringify({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                subject_token: token,
                scope: exchangeScope,
                audience: 'https:token-exchange.labkoat.com',
            }),
        };
        const response = await fetch(url, options);
        console.log(response);
        res.json(response.json());
    } catch (err) {
        console.log(err);
        res.json({ error: err.message });
    }
}

module.exports = exchangeTokenController;
