/**
 Methods for interfacing with the Okta API
 */

const OktaJwtVerifier = require('@okta/jwt-verifier');

const aud = 'https://service.labkoat.media'; // Expected audience for the JWT
const issuer = 'https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697';
const sub = ['0oa55vfp9wLx8dxIF697']; // Subscriber id's of test applications that are allowed

// A new validator with the issuer url, where the jwks can be retrieved
const oktaJwtVerifier = new OktaJwtVerifier({
    issuer,
});

async function serviceToken(req, res) {
    try {
        const { authorization } = req.headers;
        if (!authorization) throw new Error('Expected Bearer token');

        const [authType, token] = authorization.split(' ');
        if (authType !== 'Bearer') throw new Error('Expected a Bearer token');

        const jwt = await oktaJwtVerifier.verifyAccessToken(token, aud);
        const { claims } = jwt;
        if (sub.includes(claims.sub)) {
            res.json(`Hello subscriber: ${claims.sub}`);
        } else {
            res.json('This subscriber is not allowed access');
        }
    } catch (error) {
        res.json({ error: error.message });
    }
}

module.exports = serviceToken;
