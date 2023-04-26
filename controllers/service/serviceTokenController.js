/**
 Methods for interfacing with the Okta API
 */

const OktaJwtVerifier = require('@okta/jwt-verifier');

const oktaJwtVerifier = new OktaJwtVerifier({
    issuer: 'https://movielabs.okta.com/oauth2/aus2sgu38lAR9h7rS697',
});

async function oktaSecurity(req, res) {
    try {
        const { authorization } = req.headers;
        if (!authorization) throw new Error('Expected Bearer token');

        const [authType, token] = authorization.split(' ');
        if (authType !== 'Bearer') throw new Error('Expected a Bearer token');

        const jwt = await oktaJwtVerifier.verifyAccessToken(token, 'http://localhost:3000');
        const { claims } = jwt;
        console.log(claims);
        res.json(`Hello subscriber: ${claims.sub}`);
    } catch (error) {
        res.json({ error: error.message });
    }
}

module.exports = oktaSecurity;
