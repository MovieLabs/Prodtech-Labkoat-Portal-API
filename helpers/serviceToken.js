/**
 Methods for interfacing with the Okta API
 */

const fetch = require('node-fetch');

const config = require('../config');

const issuer = config.LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
const scope = config.LABKOAT_DEFAULT_SCOPE; // The scopes being requested, given our authorization is separate this not really applicable
const clientId = config.LABKOAT_CLIENT_ID;
// const clientSecret = process.env.LABKOAT_CLIENT_SECRET;
let clientSecret;

async function serviceSetup(secrets) {
    const { LABKOAT } = secrets;
    clientSecret = LABKOAT.LABKOAT_SERVICE_API;
    console.log('Service Token secret setup');
}

let bearerToken = null;
async function serviceToken() {
    if (bearerToken !== null) {
        const base64Url = bearerToken.split('.')[1];
        const buff = Buffer.from(base64Url, 'base64');
        const claims = JSON.parse(buff.toString('ascii'));
        const dateNow = new Date();
        if (claims.exp > dateNow.getTime() / 1000) return bearerToken;
    }

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
        const { token_type: tokenType, access_token: subjectToken } = grant;
        bearerToken = subjectToken;
    } catch (err) {
        console.log('Error retrieving fMam access token');
        console.log(err);
    }
    return bearerToken;
}

module.exports = {
    serviceSetup,
    serviceToken,
};
