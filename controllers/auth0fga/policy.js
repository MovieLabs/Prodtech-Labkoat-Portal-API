/**
 * Execute dynamic policy updates to the rules engine
 */

const { Auth0FgaApi } = require('@auth0/fga');

const fgaClient = new Auth0FgaApi({
    environment: process.env.FGA_ENVIRONMENT,
    storeId: process.env.FGA_STORE_ID,
    clientId: process.env.FGA_CLIENT_ID,
    clientSecret: process.env.FGA_CLIENT_SECRET,
});

const modelId = process.env.FGA_MODEL_ID;

/**
 * Delete a policy tuple or set of tuples
 * @param tuples
 * @return {Promise<string|any>}
 */
async function deleteTuple(tuples) {
    if (tuples.length === 0) return 'No-Operation'; // Avoid error when no policy updates
    console.log('Delete Tuples');
    console.log(tuples);

    while (tuples.length > 0) {
        const writeSet = tuples.splice(0, 1);
        const printable = `user: ${writeSet[0].user} / relation:${writeSet[0].relation} / object:${writeSet[0].object}`;
        try {
            const res = await fgaClient.write({
                deletes: {
                    tuple_keys: writeSet,
                },
            });
            console.log(`Deleted: ${printable}`);
        } catch (err) {
            console.log(`Error: ${printable}`);
        }
    }
    return 'Success';
}

async function writeTuple(tuples) {
    if (tuples.length === 0) return 'No-Operation'; // Avoid error when no policy updates
    console.log('Create Tuples');
    console.log(tuples);

    while (tuples.length > 0) {
        const writeSet = tuples.splice(0, 1);
        const printable = `user: ${writeSet[0].user} / relation:${writeSet[0].relation} / object:${writeSet[0].object}`;
        try {
            const res = await fgaClient.write({
                writes: {
                    tuple_keys: writeSet,
                },
            });
            console.log(`Written: ${printable}`);
        } catch (err) {
            console.log(`Error: ${printable}`);
        }
    }
    return 'Success';
}

async function updatePolicy(policy) {
    const policies = Array.isArray(policy) ? policy : [policy]; // Array of tuples for the API
    // Take the incoming policies map, them into tuples and spilt them based on whether delete or create
    const deletePolicy = [];
    const createPolicy = [];
    policies.forEach((p) => {
        const tuple = {
            user: p.user,
            relation: p.relation,
            object: p.object,
        };
        if (p.action === 'delete') deletePolicy.push(tuple);
        if (p.action === 'create') createPolicy.push(tuple);
    });

    return Promise.all(deleteTuple(deletePolicy), writeTuple(createPolicy));
}

module.exports = {
    updatePolicy,
};
