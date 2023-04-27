/**
 * Test and example code for acquiring a service token using a client credentials flow
 * and acquiring a token that is then exchanged by a backend service
 *
 * These work in conjunction with backend code under the /test route
 *
 */

require('dotenv').config();

const request = require('request-promise');
const btoa = require('btoa');

const {
    LABKOAT_ISSUER,
    LABKOAT_CLIENT_ID,
    LABKOAT_CLIENT_SECRET,
    LABKOAT_DEFAULT_SCOPE,
} = process.env;

const issuer = LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
const scope = LABKOAT_DEFAULT_SCOPE; // The scopes being requested, given our authorization is separate this not really applicable
const clientId = LABKOAT_CLIENT_ID;
const clientSecret = LABKOAT_CLIENT_SECRET;

/**
 * This demonstrates acquiring a token using the Client Credentials flow for test application
 *
 * Okta has an Authorization server setup to create tokens with an audience: https://service.labkoat.media
 * This is the 'issuer' and tokens can be requested at: https://movielabs.okta.com/oauth2/aus4zqd8ksuiL13Rl697
 *
 * An application is created in Okta as a test application, it is then used for machine to machine connections
 * This is identified with the clientID: 0oa55vfp9wLx8dxIF697
 * This identity is the sub(subscriber) claim returned in the JWT, authorization policies would use this id.
 *
 * The test application also creates a secret, which is available in the Okta admin console for the application
 *
 */
const testServiceToken = async () => {
    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        const grant = await request({
            uri: `${issuer}/v1/token`, // Full path to request a token
            json: true,
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            form: {
                grant_type: 'client_credentials',
                scope,
            },
        });

        // Retrieve the token and its type from the response
        const { token_type: tokenType, access_token: accessToken } = grant;

        // Test the token against a test endpoint on the Labkoat API
        const response = await request({
            uri: 'http://localhost:8080/api/test/service',
            json: true,
            headers: {
                authorization: [tokenType, accessToken].join(' '),
            },
        });

        console.log(response);
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
};

/**
 * Not currently working
 * Will exchange a token for cases where we want a backend service to act on behalf of a user
 */
const testTokenExchange = async () => {
    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        const grant = await request({
            uri: `${issuer}/v1/token`, // Full path to request a token
            json: true,
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            form: {
                grant_type: 'client_credentials',
                scope,
            },
        });

        // Retrieve the token and its type from the response
        const { token_type: tokenType, access_token: accessToken } = grant;

        // Test the token against a test endpoint on the Labkoat API
        const response = await request({
            uri: 'http://localhost:8080/api/test/exchange',
            json: true,
            headers: {
                authorization: [tokenType, accessToken].join(' '),
            },
        });

        console.log(response);
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
};

testTokenExchange();
// testServiceToken();
