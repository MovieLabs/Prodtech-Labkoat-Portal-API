/**
 * Manage the access token for Messaging app
 * Use Signup to create new users
 * Use Login to sign in users: https://c2-api.movielabs.com/auth/login?idp=okta
 * */

const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');

const basePath = 'https://c2-api.movielabs.com'; // Base path for messaging API
const slug = 'auth/refresh';

async function refresh(refreshToken) {
    const url = `${basePath}/${slug}`;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${refreshToken}`, // Add the authorization token to the header
        },
    };
    // console.log(refreshToken);
    // printResponse(url, options, '');

    const res = await fetch(url, options);
    // checkAuth({ status: res.status }); // Check for authorization failures
    console.log(`Refresh Status: ${res.status}`);
    return res.status === 200 ? res.json() : false;
}

/**
 * Check the expiration time on the access token and refresh if less than 5 seconds
 *
 * @returns {Promise<{string}>} - The current access/bearer token
 */

async function checkExpiration() {
    const accessToken = this.jwt || jwtDecode(this.access);
    const refreshToken = jwtDecode(this.refresh);
    const timeNow = Math.floor(Date.now() / 1000); // Current time in seconds

    // Refresh an access token with less than 5 seconds of life if there is a refresh token available
    if (accessToken.exp - timeNow < 5 && this.refresh) {
        const newToken = await refresh(this.refresh);
        this.access = newToken.access; // Set the token
        this.jwt = jwtDecode(newToken.access);
    }
    return this.access;
}

/**
 * Check the current access token is valid and return the token
 * @type {function(): *}
 */

async function bearer() {
    return this.checkExpiration();
}

module.exports = function token(authToken) {
    const useToken = { ...authToken, ...{ jwt: jwtDecode(authToken.access) } };
    return Object.assign(Object.create({ bearer, checkExpiration }), useToken);
};
