/**
 * Execute dynamic policy updates to the rules engine
 */

const omc = require('../../helpers/omc');
const { writeTuple, deleteTuple } = require('../auth0Interface');

/**
 * Delete a policy tuple or set of tuples
 * @param policy {object}
 * @param omcJson {array}
 * @return {Promise<string|any>}
 */

async function updatePolicy(policy, omcJson) {
    const assets = omcJson.map((ent) => omc.securityIdentifier(ent, 'labkoat'));
    const { user } = policy;
    const tuples = assets.map((astId) => ({
        user: `user:${user}`,
        object: `asset:${astId}`,
        relation: 'viewer',
    }));
    if (policy.action === 'allow') return writeTuple(tuples);
    if (policy.action === 'deny') return deleteTuple(tuples);
    return null;
}

module.exports = {
    updatePolicy,
};
