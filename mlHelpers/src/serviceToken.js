/**
 Methods for interfacing with the Okta API
 */

import fetch from 'node-fetch';

const tokenService = {};

export async function setup(params) {
    tokenService.issuer = params.issuer;
    tokenService.scope = params.scope;
    tokenService.clientId = params.clientId;
    tokenService.clientSecret = params.clientSecret;
    console.log('Service Token secret setup');
}

let bearerToken = null;

export async function getToken() {
    if (bearerToken !== null) {
        const base64Url = bearerToken.split('.')[1];
        const buff = Buffer.from(base64Url, 'base64');
        const claims = JSON.parse(buff.toString('ascii'));
        const dateNow = new Date();
        if (claims.exp > dateNow.getTime() / 1000) return bearerToken;
    }

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
        // console.log(subjectToken);
        bearerToken = subjectToken;
    } catch (err) {
        console.log(err);
    }
    return bearerToken;
}
