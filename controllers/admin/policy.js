/**
 * Execute dynamic policy updates to the rules engine
 */

const { writeTuple, deleteTuple } = require('../auth0Interface');

/**
 * Delete a policy tuple or set of tuples
 * @param policy
 * @return {Promise<string|any>}
 */

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

    return Promise.all([deleteTuple(deletePolicy), writeTuple(createPolicy)]);
}

module.exports = {
    updatePolicy,
};
