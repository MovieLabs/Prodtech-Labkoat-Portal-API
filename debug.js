/**
 * Execute dynamic policy updates to the rules engine
 */

const path = require('path');
const { Auth0FgaApi } = require('@auth0/fga');

require('dotenv')
    .config({ path: path.resolve(__dirname, './.env') });

const fgaClient = new Auth0FgaApi({
    environment: process.env.FGA_ENVIRONMENT,
    storeId: process.env.FGA_STORE_ID,
    clientId: process.env.FGA_CLIENT_ID,
    clientSecret: process.env.FGA_CLIENT_SECRET,
});

const modelId = process.env.FGA_MODEL_ID;

/**
 * Delete a policy tuple or set of tuples
 * @param tuple
 * @return {Promise<string|any>}
 */
async function expandTuple(tuple) {
    console.log('Expand Tuple');
    console.log(tuple);

    const printable = `relation:${tuple.relation} / object:${tuple.object}`;
    try {
        const { tree } = await fgaClient.expand({
            tuple_key: tuple,
            authorization_model_id: modelId,
        });
        console.log('Expanded:');
        return tree;
    } catch (err) {
        console.log(`Error: ${printable}`);
    }
    return 'Success';
}

async function deleteTuple(tuple) {
    console.log('Delete Tuple');
    console.log(tuple);

    const printable = `relation:${tuple.relation} / object:${tuple.object}`;
    try {
        return fgaClient.write({
            deletes: { tuple_keys: [tuple] },
            // authorization_model_id: modelId,
        });
    } catch (err) {
        console.log(err);
        return ('Error');
    }
}

async function main() {
    // const authModels = await fgaClient.readAuthorizationModels();
    // console.log(authModels);

    const expandDirRole = {
        object: 'role:director',
        relation: 'hasRole',
    };
    const tree = await expandTuple(expandDirRole);
    console.log(tree);

    const deleteDirRole = {
        user: 'user:dlucas@labkoat.media',
        relation: 'hasRole',
        object: 'role:director',
    };
    const deleteDir = await deleteTuple(deleteDirRole);
    console.log(deleteDir);
}

main().catch((err) => {
    console.log(err);
});
