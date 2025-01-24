/**
 * Manage the access token for Messaging app
 * Use Signup to create new users
 * Use Login to sign in users: https://c2-api.movielabs.com/auth/login?idp=okta
 * */

const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');

const authToken = {
    id: '4ae99e2a-3955-4fcf-a5f9-f7a57174979b',
    access: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJtb3ZpZWxhYnMuY29tIiwic3ViIjoiNGFlOTllMmEtMzk1NS00ZmNmLWE1ZjktZjdhNTcxNzQ5NzliIiwiaWF0IjoxNjMzNjQ2MDA3LCJuYmYiOjE2MzM2NDYwMDcsImV4cCI6MTYzMzY0NjkwNywicm9sZXMiOltdfQ.1X7wJuP613JG4YQtuSYm4gAVZErt6Te9RRKnsyzgNa8',
    refresh: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJtb3ZpZWxhYnMuY29tIiwic3ViIjoiNGFlOTllMmEtMzk1NS00ZmNmLWE1ZjktZjdhNTcxNzQ5NzliIiwiaWF0IjoxNjMzNjQ2MDA3LCJuYmYiOjE2MzM2NDYwMDcsImV4cCI6NDc1NTcxMDAwNywicm9sZXMiOlsiand0OnJlZnJlc2giXX0.qs7qRkxRPsyemIx6CvVZ9vhG2InXtiodq1uqhsApkDk',
};
const sudoToken = {
    id: 'e5962857-4af7-4568-ac84-b5b98a350395',
    access: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJtb3ZpZWxhYnMuY29tIiwic3ViIjoiZTU5NjI4NTctNGFmNy00NTY4LWFjODQtYjViOThhMzUwMzk1IiwiaWF0IjoxNjI1NzgwMDgzLjQwMTY5NjQsIm5iZiI6MTYyNTc4MDA4My40MDE2OTY0LCJleHAiOjE2MjU3ODA5ODMuNDAxNjk2NCwicm9sZXMiOlsic3VwZXJ1c2VyIl19.yLnsYk2r2g7K6xIM0y4OZUMAnuu1lN0rSct-V-V912k',
};

const c2AuthPath = 'https://c2-api.movielabs.com/'; // Base path for messaging API
const c2AuthRefresh = 'auth/refresh';

function checkAuth({ status }) {
    if (status !== 401) return true;
    throw new Error('Authorization failed');
}

async function refresh(refreshToken) {
    const url = `${c2AuthPath}/${c2AuthRefresh}`;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${refreshToken}`,
        },
    };
    const res = await fetch(url, options);
    checkAuth({ status: res.status }); // Check for authorization failures
    return res.status === 200 ? res.json() : false;
}

/**
 * Check the expiration time on the access token and refresh if less than 5 seconds
 *
 * @returns {Promise<{string}>} - The current access/bearer token
 */

async function checkExpiration() {
    const accessToken = this.jwt || jwtDecode(this.access);
    const timeStamp = Math.floor(Date.now() / 1000); // Current time in seconds

    // Refresh an access token with less than 5 seconds of life if there is a refresh token available
    if (accessToken.exp - timeStamp < 5 && this.refresh) {
        console.log(`Refresh token ${this.id} expired: ${accessToken.exp - timeStamp}`);
        const newToken = await refresh(this.refresh);
        if (newToken) {
            this.access = newToken.access; // Set the token
            this.jwt = jwtDecode(newToken.access);
        } else {
            console.log(`Error with token for id: ${this.id}`);
        }
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

module.exports = function token(baseToken = null) {
    const initialToken = baseToken || authToken; // Use the token passed in or a based token
    const useToken = { ...initialToken, ...{ jwt: jwtDecode(initialToken.access) } };
    return Object.assign(Object.create({ bearer, checkExpiration }), useToken);
};
