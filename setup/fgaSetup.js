const path = require('path');
require('dotenv')
    .config({ path: path.resolve(__dirname, './.env') });
const { Auth0FgaApi } = require('@auth0/fga');

const userData = require('../auth0fga/data/user.json');
const storyBoardData = require('../auth0fga/data/storyboards.json');
const roleData = require('../auth0fga/data/asset-role.json');
const conceptArt = require('../auth0fga/data/svenConceptArt.json');

console.log(process.env.AUTHORIZER_SERVICE_URL);

const fgaClient = new Auth0FgaApi({
    environment: process.env.FGA_ENVIRONMENT,
    storeId: process.env.FGA_STORE_ID,
    clientId: process.env.FGA_CLIENT_ID,
    clientSecret: process.env.FGA_CLIENT_SECRET,
});

async function setupFGA() {
    const response = await fgaClient.readAuthorizationModels();
    const modelId = response.authorization_models[0].id;
    console.log(modelId);

    async function deleteTuples(tuples) {
        while (tuples.length > 0) {
            const writeSet = tuples.splice(0, 1);
            const printable = `user: ${writeSet[0].user}`;
            try {
                const res = await fgaClient.write({
                    deletes: {
                        tuple_keys: writeSet,
                    },
                });
                console.log(`Deleted: ${printable}`);
            } catch (err) {
                console.log(`Error: ${printable}`);
                console.log(err.apiErrorMessage);
            }
        }
    }

    async function writeTuples(tuples) {
        while (tuples.length > 0) {
            const writeSet = tuples.splice(0, 1);
            const printable = `user: ${writeSet[0].user}`;
            try {
                const res = await fgaClient.write({
                    writes: {
                        tuple_keys: writeSet,
                    },
                });
                console.log(`Written: ${printable}`);
            } catch (err) {
                console.log(`Error: ${printable}`);
                console.log(err.apiErrorMessage);
            }
        }
    }

    // await writeTuples(userData);
    // console.log('User done');
    // await writeTuples(storyBoardData);
    // console.log('Storyboards done');
    await writeTuples(conceptArt);
    console.log('Concept art done');
    // await writeTuples(roleData);
    // console.log('Roles done');
}

setupFGA()
    .then((res) => {
        console.log('Over');
    })
    .catch((err) => {
        console.log(err);
    });
