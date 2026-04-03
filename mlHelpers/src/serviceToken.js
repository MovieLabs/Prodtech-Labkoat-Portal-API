/**
 * Manages the access and refresh tokens for the Okta Service token
 *
 * @module serviceToken
 */

import fetch from 'node-fetch';

const tokenService = {}; // Store the details needed to access the Okta refresh endpoint
let bearerToken = null; // Current value of the bearer token

/**
 * @function setup
 * @param {Object} params
 * @param {string} params.issuer
 * @param {string} params.scope
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @returns {Promise<void>}
 */
export async function setup(params) {
    tokenService.issuer = params.issuer;
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
        const buff = Buffer.from(base64Url, 'base64');
        const claims = JSON.parse(buff.toString('ascii'));
        const dateNow = new Date();
        if (claims.exp > dateNow.getTime() / 1000) return bearerToken;
    }

    // Fetch a new access token
    const {
        clientId,
        clientSecret,
        issuer,
        scope,
    } = tokenService;
    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        console.log('Make request for access token for service account');
        const url = `${issuer}/v1/token`; // Full path to request a token
        console.log(`Okta service token URL: ${issuer}`);
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
        // Retrieve the token and its type from the response
        const grant = JSON.parse(await res.text());
        const {
            token_type: tokenType,
            access_token: subjectToken,
        } = grant;

        bearerToken = subjectToken;
    } catch (err) {
        console.log(err);
    }

    return bearerToken; // Return the new token to the consumer
}
