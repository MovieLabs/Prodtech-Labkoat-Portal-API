/**
 * Mints and caches a client_credentials access token for this service.
 *
 * Provider-agnostic: the token endpoint is supplied by the caller, because it is not derivable from
 * the issuer in the same way across providers. Okta puts it at `{issuer}/v1/token`; Cognito puts it
 * on the user pool's hosted domain, which is a different host from the issuer entirely.
 *
 * @module serviceToken
 */

import fetch from 'node-fetch';

const tokenService = {}; // Store the details needed to reach the token endpoint
let bearerToken = null; // Current value of the bearer token

// Renew this many seconds before the token actually expires, to cover clock drift between this host
// and the issuer, and the flight time of the request the token is about to be used on. Without it a
// token expiring in a millisecond passes the check and the call it is used for 401s.
const EXPIRY_SKEW_SECONDS = 60;

/**
 * @function setup
 * @param {Object} params
 * @param {string} params.issuer
 * @param {string} [params.tokenUrl] - The token endpoint; defaults to the Okta convention
 * @param {string} params.scope
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @returns {Promise<void>}
 */
export async function setup(params) {
    tokenService.issuer = params.issuer;
    tokenService.tokenUrl = params.tokenUrl || `${params.issuer}/v1/token`;
    tokenService.scope = params.scope;
    tokenService.clientId = params.clientId;
    tokenService.clientSecret = params.clientSecret;
    console.log('Service Token secret setup');
}

/**
 * @function getToken
 * @returns {Promise<string>} A valid bearer token
 */
export async function getToken() {
    // Check if the current token is past or close to expiration, if not return the current token
    if (bearerToken !== null) {
        const base64Url = bearerToken.split('.')[1];
        const buff = Buffer.from(base64Url, 'base64url');
        const claims = JSON.parse(buff.toString('utf8'));
        const nowSeconds = Date.now() / 1000;
        if (claims.exp > nowSeconds + EXPIRY_SKEW_SECONDS) return bearerToken;
    }

    // Fetch a new access token
    const {
        clientId,
        clientSecret,
        tokenUrl,
        scope,
    } = tokenService;
    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        console.log('Make request for access token for service account');
        const url = tokenUrl;
        const formData = new URLSearchParams();
        formData.append('grant_type', 'client_credentials');
        formData.append('scope', scope);
        const options = {
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            body: formData,
        };
        const res = await fetch(url, options);
        const body = await res.text();
        if (!res.ok) {
            // Without this the destructure below yields undefined and every caller cheerfully sends
            // `Bearer undefined`, which fails far from here with nothing pointing back to the cause.
            throw new Error(`Token request failed: ${res.status} ${body}`);
        }
        const { access_token: subjectToken } = JSON.parse(body);
        if (!subjectToken) throw new Error(`Token response carried no access_token: ${body}`);

        bearerToken = subjectToken;
    } catch (err) {
        console.error('Service token request failed', err.message);
    }

    return bearerToken; // Return the new token to the consumer
}
