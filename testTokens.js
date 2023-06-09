/**
 * Test and example code for acquiring a service token using a client credentials flow
 * and acquiring a token that is then exchanged by a backend service
 *
 * These work in conjunction with backend code under the /test route
 *
 */

require('dotenv').config();

const fetch = require('node-fetch');
const request = require('request-promise');
const btoa = require('btoa');

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
    const issuer = LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
    const scope = LABKOAT_DEFAULT_SCOPE; // The scopes being requested, given our authorization is separate this not really applicable
    const clientId = LABKOAT_CLIENT_ID;
    const clientSecret = LABKOAT_CLIENT_SECRET;

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
 * Exchange a token for cases where we want a backend service to act on behalf of a user
 * This is a mechanism that essentially allows for a token to have a new audience and new scopes
 *
 * Two Auth servers must be setup in Okta, to exchange a token issued by Auth Server A the second server (B)
 * must have made Server A a trusted server, the client can then request a new token with scopes that
 * are specific to Server B, this will be issued with Server B's aud setting.
 */
const testTokenExchange = async () => {
    const issuer = LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
    const scope = LABKOAT_DEFAULT_SCOPE; // The scopes being requested, given our authorization is separate this not really applicable
    const clientId = LABKOAT_CLIENT_ID;
    const clientSecret = LABKOAT_CLIENT_SECRET;

    const exchangeIssuer = TEST_ISSUER;
    const exchangeScope = TEST_DEFAULT_SCOPE;
    const exchangeClientId = TEST_CLIENT_ID;
    const exchangeClientSecret = TEST_CLIENT_SECRET;

    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        const url = `${issuer}/v1/token`;
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
        console.log();
        console.log('Server A');
        console.log(url);
        const res = await fetch(url, options);

        // Retrieve the token and its type from the response
        const grant = JSON.parse(await res.text());
        const { token_type: tokenType, access_token: subjectToken } = grant;

        const exchangeToken = btoa(`${exchangeClientId}:${exchangeClientSecret}`); // Base 64 encode

        const exchangeUrl = `${exchangeIssuer}/v1/token`;
        const exchangeFormData = new URLSearchParams();
        exchangeFormData.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
        exchangeFormData.append('subject_token_type', 'urn:ietf:params:oauth:token-type:access_token');
        exchangeFormData.append('subject_token', subjectToken);
        exchangeFormData.append('scope', 'api:access:read');
        exchangeFormData.append('audience', 'http://localhost:3000');
        const exchangeOptions = {
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            body: exchangeFormData,
        };
        console.log();
        console.log('Exchange');
        console.log(exchangeUrl);
        const exchangeRes = await fetch(exchangeUrl, exchangeOptions);
        const test = JSON.parse(await exchangeRes.text());
        console.log('New Token');
        console.log(test);
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
};

// testTokenExchange();
testServiceToken();
