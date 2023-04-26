require('dotenv').config();

const request = require('request-promise');
const btoa = require('btoa');

const {
    ISSUER,
    TEST_CLIENT_ID,
    TEST_CLIENT_SECRET,
    DEFAULT_SCOPE,
} = process.env;

const test = async () => {
    const token = btoa(`${TEST_CLIENT_ID}:${TEST_CLIENT_SECRET}`);
    try {
        const grant = await request({
            uri: `${ISSUER}/v1/token`,
            json: true,
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            form: {
                grant_type: 'client_credentials',
                scope: DEFAULT_SCOPE,
            },
        });

        const { token_type, access_token } = grant;

        const response = await request({
            uri: 'http://localhost:8080/api/service/test',
            json: true,
            headers: {
                authorization: [token_type, access_token].join(' '),
            },
        });

        console.log(response);
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
};

test();
